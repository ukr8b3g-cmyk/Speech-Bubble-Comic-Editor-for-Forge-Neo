from __future__ import annotations

import base64
import binascii
import hashlib
import io
import json
import math
import os
import re
import shutil
import tempfile
import threading
import unicodedata
import uuid
import warnings
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageOps

from .settings import data_root

USER_ASSET_SCHEMA_VERSION = 1
USER_ASSET_API_VERSION = 1
SETTINGS_UI_VERSION = "1.0.0"
USER_ASSET_MAX_UPLOAD_BYTES = 4 * 1024 * 1024
USER_ASSET_RECOMMENDED_SIDE = 512
USER_ASSET_RESIZE_SIDE = 768
USER_ASSET_MAX_SOURCE_PIXELS = 25_000_000
USER_ASSET_MAX_PRESETS = 1000
USER_ASSET_NAME_MAX_LENGTH = 48
USER_ASSET_THUMBNAIL_SIDE = 192

_CATEGORY_VALUES = {"sfx", "stamp"}
_ASSET_ID_RE = re.compile(r"^[a-f0-9]{64}$")
_PRESET_ID_RE = re.compile(
    r"^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$"
)
_DATA_URL_RE = re.compile(
    r"^data:image/(png|webp);base64,([A-Za-z0-9+/=\r\n]+)$",
    re.IGNORECASE,
)
_HEX_COLOR_RE = re.compile(r"^#[0-9a-f]{6}$", re.IGNORECASE)
_STORE_LOCK = threading.RLock()


class UserAssetError(ValueError):
    """Structured validation error returned by the user-asset API."""

    def __init__(self, message: str, code: str = "invalid_request", **details):
        super().__init__(message)
        self.code = code
        self.details = details

    def as_dict(self) -> dict:
        return {"ok": False, "code": self.code, "message": str(self), **self.details}


@dataclass(frozen=True)
class DecodedUserImage:
    image: Image.Image
    source_format: str
    source_size: int
    original_width: int
    original_height: int
    has_alpha: bool


def user_asset_root() -> Path:
    return (data_root() / "config" / "speech-bubble-forge" / "user-presets").resolve()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _default_index() -> dict:
    return {
        "schema_version": USER_ASSET_SCHEMA_VERSION,
        "revision": 0,
        "presets": [],
    }


def _safe_category(value) -> str:
    category = str(value or "").strip().lower()
    if category not in _CATEGORY_VALUES:
        raise UserAssetError("Category must be sfx or stamp", "invalid_category")
    return category


def _safe_name(value) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    text = " ".join(text.split())
    text = "".join(character for character in text if unicodedata.category(character) not in {"Cc", "Cf"})
    text = text.strip()
    if not text:
        raise UserAssetError("Preset name is required", "name_required")
    if len(text) > USER_ASSET_NAME_MAX_LENGTH:
        raise UserAssetError(
            f"Preset name must be {USER_ASSET_NAME_MAX_LENGTH} characters or fewer",
            "name_too_long",
            maximum=USER_ASSET_NAME_MAX_LENGTH,
        )
    return text


def _default_style_defaults(width: int, height: int) -> dict:
    return {
        "mask_mode": False,
        "width": max(1, min(8192, int(width))),
        "height": max(1, min(8192, int(height))),
        "opacity": 1.0,
        "fill": "#ffffff",
        "stroke": "#111111",
        "stroke_width": 0.0,
        "shadow_enabled": False,
        "shadow_color": "#000000",
        "shadow_x": 6.0,
        "shadow_y": 6.0,
        "shadow_blur": 4.0,
        "glow_enabled": False,
        "glow_color": "#ffffff",
        "glow_opacity": 0.75,
        "glow_blur": 16.0,
        "glow_spread": 0.0,
    }


def _safe_style_defaults(value, width: int, height: int, base: dict | None = None) -> dict:
    defaults = _default_style_defaults(width, height)
    if isinstance(base, dict):
        defaults.update(base)
    if value is None:
        value = {}
    if not isinstance(value, dict):
        raise UserAssetError("Style defaults must be an object", "invalid_style_defaults")

    result = {**defaults}
    for key in ("mask_mode", "shadow_enabled", "glow_enabled"):
        if key not in value:
            continue
        if not isinstance(value[key], bool):
            raise UserAssetError(f"{key} must be true or false", "invalid_style_defaults", field=key)
        result[key] = value[key]

    for key in ("fill", "stroke", "shadow_color", "glow_color"):
        if key not in value:
            continue
        color = str(value[key] or "").strip().lower()
        if not _HEX_COLOR_RE.fullmatch(color):
            raise UserAssetError(f"{key} must be a hex color", "invalid_style_defaults", field=key)
        result[key] = color

    ranges = {
        "width": (1.0, 8192.0),
        "height": (1.0, 8192.0),
        "opacity": (0.0, 1.0),
        "stroke_width": (0.0, 100.0),
        "shadow_x": (-500.0, 500.0),
        "shadow_y": (-500.0, 500.0),
        "shadow_blur": (0.0, 200.0),
        "glow_opacity": (0.0, 1.0),
        "glow_blur": (0.0, 200.0),
        "glow_spread": (0.0, 100.0),
    }
    for key, (minimum, maximum) in ranges.items():
        if key not in value:
            continue
        try:
            number = float(value[key])
        except (TypeError, ValueError) as error:
            raise UserAssetError(f"{key} must be a number", "invalid_style_defaults", field=key) from error
        if not math.isfinite(number) or number < minimum or number > maximum:
            raise UserAssetError(
                f"{key} is outside the supported range",
                "invalid_style_defaults",
                field=key,
                minimum=minimum,
                maximum=maximum,
            )
        result[key] = int(number) if number.is_integer() else number
    return result


def _safe_preset_id(value) -> str:
    preset_id = str(value or "").strip().lower()
    if not _PRESET_ID_RE.fullmatch(preset_id):
        raise UserAssetError("Invalid preset ID", "invalid_preset_id")
    return preset_id


def _safe_asset_id(value) -> str:
    asset_id = str(value or "").strip().lower().removeprefix("user:")
    if not _ASSET_ID_RE.fullmatch(asset_id):
        raise UserAssetError("Invalid asset ID", "invalid_asset_id")
    return asset_id


def _safe_conflict(value, allowed: set[str]) -> str:
    conflict = str(value or "error").strip().lower()
    if conflict not in allowed:
        raise UserAssetError(
            "Invalid conflict action",
            "invalid_conflict_action",
            allowed=sorted(allowed),
        )
    return conflict


def _decode_image_data_url(value) -> DecodedUserImage:
    if not isinstance(value, str):
        raise UserAssetError("Image data is required", "image_required")
    match = _DATA_URL_RE.fullmatch(value)
    if not match:
        raise UserAssetError("Only PNG and static WebP are supported", "unsupported_format")
    declared_format = match.group(1).upper()
    try:
        raw = base64.b64decode(match.group(2), validate=True)
    except (binascii.Error, ValueError) as error:
        raise UserAssetError("Image data is not valid base64", "invalid_image_data") from error
    if not raw:
        raise UserAssetError("Image is empty", "empty_image")
    if len(raw) > USER_ASSET_MAX_UPLOAD_BYTES:
        raise UserAssetError(
            "Image file is larger than 4 MB",
            "file_too_large",
            maximum_bytes=USER_ASSET_MAX_UPLOAD_BYTES,
            actual_bytes=len(raw),
        )

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            source = Image.open(io.BytesIO(raw))
            actual_format = str(source.format or "").upper()
            if actual_format not in {"PNG", "WEBP"} or actual_format != declared_format:
                raise UserAssetError("Image format does not match its content", "format_mismatch")
            if int(getattr(source, "n_frames", 1) or 1) != 1:
                raise UserAssetError("Animated WebP is not supported", "animated_image")
            width, height = source.size
            if width < 1 or height < 1 or width * height > USER_ASSET_MAX_SOURCE_PIXELS:
                raise UserAssetError(
                    "Image dimensions are too large",
                    "dimensions_too_large",
                    width=width,
                    height=height,
                )
            source.load()
            image = ImageOps.exif_transpose(source).convert("RGBA")
    except UserAssetError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
        raise UserAssetError("Image dimensions are too large", "dimensions_too_large") from error
    except Exception as error:
        raise UserAssetError("Image could not be decoded", "decode_failed") from error

    alpha_extrema = image.getchannel("A").getextrema()
    has_alpha = bool(alpha_extrema and alpha_extrema[0] < 255)
    return DecodedUserImage(
        image=image,
        source_format=actual_format.lower(),
        source_size=len(raw),
        original_width=image.width,
        original_height=image.height,
        has_alpha=has_alpha,
    )


def _resized_image(decoded: DecodedUserImage, resize_oversize: bool) -> tuple[Image.Image, bool]:
    image = decoded.image
    longest = max(image.size)
    if longest <= USER_ASSET_RESIZE_SIDE or not resize_oversize:
        return image, False
    ratio = USER_ASSET_RESIZE_SIDE / longest
    target = (
        max(1, int(round(image.width * ratio))),
        max(1, int(round(image.height * ratio))),
    )
    return image.resize(target, Image.Resampling.LANCZOS), True


def _encoded_asset(image: Image.Image, source_format: str) -> tuple[bytes, str]:
    output = io.BytesIO()
    if source_format == "webp":
        image.save(output, format="WEBP", lossless=True, quality=100, method=6, exact=True)
        return output.getvalue(), "webp"
    image.save(output, format="PNG", compress_level=6, optimize=True)
    return output.getvalue(), "png"


def _encoded_thumbnail(image: Image.Image) -> bytes:
    thumbnail = image.copy()
    thumbnail.thumbnail(
        (USER_ASSET_THUMBNAIL_SIDE, USER_ASSET_THUMBNAIL_SIDE),
        Image.Resampling.LANCZOS,
    )
    output = io.BytesIO()
    thumbnail.save(output, format="WEBP", lossless=True, quality=100, method=6, exact=True)
    return output.getvalue()


def _write_bytes_atomic(path: Path, value: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        temporary.write_bytes(value)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _write_json_atomic(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    backup = path.with_suffix(path.suffix + ".bak")
    try:
        temporary.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        if path.is_file():
            backup_temporary = backup.with_name(f".{backup.name}.{uuid.uuid4().hex}.tmp")
            try:
                shutil.copy2(path, backup_temporary)
                os.replace(backup_temporary, backup)
            finally:
                backup_temporary.unlink(missing_ok=True)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _normalized_index(payload) -> dict:
    if not isinstance(payload, dict):
        raise UserAssetError("User preset index must be an object", "index_invalid")
    schema_version = payload.get("schema_version", USER_ASSET_SCHEMA_VERSION)
    if schema_version != USER_ASSET_SCHEMA_VERSION:
        raise UserAssetError(
            "User preset index has an unsupported schema version",
            "index_schema_unsupported",
            schema_version=schema_version,
        )
    raw_presets = payload.get("presets", [])
    if not isinstance(raw_presets, list):
        raise UserAssetError("User preset index presets must be an array", "index_invalid")
    if len(raw_presets) > USER_ASSET_MAX_PRESETS:
        raise UserAssetError("User preset index contains too many entries", "index_too_large")

    presets: list[dict] = []
    seen_ids: set[str] = set()
    for raw in raw_presets:
        if not isinstance(raw, dict):
            raise UserAssetError("User preset index contains an invalid entry", "index_invalid")
        preset_id = _safe_preset_id(raw.get("id"))
        if preset_id in seen_ids:
            raise UserAssetError("User preset index contains duplicate IDs", "index_duplicate_id")
        seen_ids.add(preset_id)
        asset_id = _safe_asset_id(raw.get("asset_id"))
        category = _safe_category(raw.get("category"))
        name = _safe_name(raw.get("name"))
        image_format = str(raw.get("format") or "png").lower()
        if image_format not in {"png", "webp"}:
            raise UserAssetError("User preset index contains an invalid format", "index_invalid")
        try:
            width = int(raw.get("width") or 1)
            height = int(raw.get("height") or 1)
            file_size = int(raw.get("file_size") or 0)
        except (TypeError, ValueError) as error:
            raise UserAssetError("User preset index contains invalid image metadata", "index_invalid") from error
        if width < 1 or height < 1 or width * height > USER_ASSET_MAX_SOURCE_PIXELS:
            raise UserAssetError("User preset index contains invalid image dimensions", "index_invalid")
        if not (0 <= file_size <= USER_ASSET_MAX_UPLOAD_BYTES):
            raise UserAssetError("User preset index contains an invalid file size", "index_invalid")
        presets.append(
            {
                "id": preset_id,
                "category": category,
                "name": name,
                "asset_id": asset_id,
                "width": width,
                "height": height,
                "format": image_format,
                "has_alpha": bool(raw.get("has_alpha")),
                "file_size": file_size,
                "style_defaults": _safe_style_defaults(raw.get("style_defaults"), width, height),
                "original_name": str(raw.get("original_name") or "")[:255],
                "created_at": str(raw.get("created_at") or _utc_now()),
                "updated_at": str(raw.get("updated_at") or raw.get("created_at") or _utc_now()),
            }
        )
    try:
        revision = max(0, int(payload.get("revision") or 0))
    except (TypeError, ValueError):
        revision = 0
    return {
        "schema_version": USER_ASSET_SCHEMA_VERSION,
        "revision": revision,
        "presets": presets,
    }


class UserAssetStore:
    def __init__(self, root: Path | None = None):
        self.root = Path(root or user_asset_root()).resolve()
        self.index_path = self.root / "index.json"
        self.assets_dir = self.root / "assets"
        self.thumbnails_dir = self.root / "thumbnails"
        self.archive_dir = self.root / "archive"
        self.archive_assets_dir = self.archive_dir / "assets"
        self.archive_thumbnails_dir = self.archive_dir / "thumbnails"

    def ensure_directories(self) -> None:
        self.assets_dir.mkdir(parents=True, exist_ok=True)
        self.thumbnails_dir.mkdir(parents=True, exist_ok=True)

    def read_index(self) -> dict:
        with _STORE_LOCK:
            if not self.index_path.is_file():
                return _default_index()
            try:
                payload = json.loads(self.index_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as error:
                raise UserAssetError("User preset index could not be read", "index_invalid") from error
            return _normalized_index(payload)

    def write_index(self, index: dict) -> dict:
        with _STORE_LOCK:
            normalized = _normalized_index(index)
            _write_json_atomic(self.index_path, normalized)
            return normalized

    def revision(self) -> int:
        return int(self.read_index().get("revision") or 0)

    def _next_revision(self, index: dict) -> int:
        return max(int(index.get("revision") or 0) + 1, 1)

    def _find_preset(self, index: dict, preset_id: str) -> tuple[int, dict]:
        preset_id = _safe_preset_id(preset_id)
        for position, preset in enumerate(index["presets"]):
            if preset["id"] == preset_id:
                return position, preset
        raise UserAssetError("User preset was not found", "preset_not_found", preset_id=preset_id)

    @staticmethod
    def _same_name(left: str, right: str) -> bool:
        return unicodedata.normalize("NFKC", left).casefold() == unicodedata.normalize("NFKC", right).casefold()

    def _duplicate(self, index: dict, category: str, name: str, exclude_id: str = "") -> dict | None:
        return next(
            (
                preset
                for preset in index["presets"]
                if preset["id"] != exclude_id
                and preset["category"] == category
                and self._same_name(preset["name"], name)
            ),
            None,
        )

    def _unique_name(self, index: dict, category: str, name: str, exclude_id: str = "") -> str:
        if not self._duplicate(index, category, name, exclude_id):
            return name
        for suffix in range(2, 10000):
            candidate = f"{name} ({suffix})"
            if len(candidate) > USER_ASSET_NAME_MAX_LENGTH:
                tail = f" ({suffix})"
                candidate = name[: USER_ASSET_NAME_MAX_LENGTH - len(tail)].rstrip() + tail
            if not self._duplicate(index, category, candidate, exclude_id):
                return candidate
        raise UserAssetError("Could not allocate a unique preset name", "name_conflict")

    def _asset_file(self, asset_id: str, image_format: str | None = None) -> Path | None:
        asset_id = _safe_asset_id(asset_id)
        directories = (self.assets_dir, self.archive_assets_dir)
        if image_format:
            image_format = str(image_format).lower()
            if image_format not in {"png", "webp"}:
                return None
            for directory in directories:
                candidate = (directory / f"{asset_id}.{image_format}").resolve()
                try:
                    candidate.relative_to(directory.resolve())
                except ValueError:
                    return None
                if candidate.is_file():
                    return candidate
            return None
        for suffix in ("png", "webp"):
            for directory in directories:
                candidate = directory / f"{asset_id}.{suffix}"
                if candidate.is_file():
                    return candidate.resolve()
        return None

    def asset_path(self, asset_id: str) -> Path | None:
        return self._asset_file(asset_id)

    def thumbnail_path(self, asset_id: str) -> Path | None:
        asset_id = _safe_asset_id(asset_id)
        for directory in (self.thumbnails_dir, self.archive_thumbnails_dir):
            candidate = (directory / f"{asset_id}.webp").resolve()
            try:
                candidate.relative_to(directory.resolve())
            except ValueError:
                return None
            if candidate.is_file():
                return candidate
        return None

    @staticmethod
    def _asset_ids_in(directory: Path, suffixes: set[str]) -> set[str]:
        if not directory.is_dir():
            return set()
        return {
            path.stem
            for path in directory.iterdir()
            if path.is_file()
            and path.suffix.lower() in suffixes
            and _ASSET_ID_RE.fullmatch(path.stem)
        }

    def archive_status(self, index: dict | None = None) -> dict:
        index = index or self.read_index()
        active_ids = {preset["asset_id"] for preset in index["presets"]}
        current_ids = self._asset_ids_in(self.assets_dir, {".png", ".webp"})
        archived_ids = self._asset_ids_in(self.archive_assets_dir, {".png", ".webp"})
        pending_ids = current_ids - active_ids
        return {
            "active_assets": len(active_ids),
            "archived_assets": len(archived_ids),
            "pending_assets": len(pending_ids),
            "old_generation_assets": len(archived_ids | pending_ids),
        }

    def organize_archive(self) -> dict:
        with _STORE_LOCK:
            index = self.read_index()
            active_ids = {preset["asset_id"] for preset in index["presets"]}
            moved_assets = 0
            moved_thumbnails = 0
            for source_dir, destination_dir, suffixes, counter in (
                (self.assets_dir, self.archive_assets_dir, {".png", ".webp"}, "assets"),
                (self.thumbnails_dir, self.archive_thumbnails_dir, {".webp"}, "thumbnails"),
            ):
                if not source_dir.is_dir():
                    continue
                for source in source_dir.iterdir():
                    if (
                        not source.is_file()
                        or source.suffix.lower() not in suffixes
                        or not _ASSET_ID_RE.fullmatch(source.stem)
                        or source.stem in active_ids
                    ):
                        continue
                    destination_dir.mkdir(parents=True, exist_ok=True)
                    destination = destination_dir / source.name
                    if destination.is_file():
                        if source.read_bytes() != destination.read_bytes():
                            raise UserAssetError(
                                "Archive contains a different file with the same name",
                                "archive_conflict",
                                asset_id=source.stem,
                            )
                        source.unlink()
                    else:
                        shutil.move(str(source), str(destination))
                    if counter == "assets":
                        moved_assets += 1
                    else:
                        moved_thumbnails += 1
            return {
                "ok": True,
                "moved_assets": moved_assets,
                "moved_thumbnails": moved_thumbnails,
                "archive": self.archive_status(index),
                "revision": int(index["revision"]),
            }

    def _save_image(self, payload: dict) -> dict:
        decoded = _decode_image_data_url(payload.get("image_data_url"))
        resize_oversize = payload.get("resize_oversize") is True
        allow_opaque = payload.get("allow_opaque") is True
        if not decoded.has_alpha and not allow_opaque:
            raise UserAssetError(
                "The image has no transparent pixels",
                "opaque_confirmation_required",
                width=decoded.original_width,
                height=decoded.original_height,
            )
        image, resized = _resized_image(decoded, resize_oversize)
        asset_bytes, image_format = _encoded_asset(image, decoded.source_format)
        if len(asset_bytes) > USER_ASSET_MAX_UPLOAD_BYTES:
            raise UserAssetError(
                "The normalized image is larger than 4 MB",
                "file_too_large",
                maximum_bytes=USER_ASSET_MAX_UPLOAD_BYTES,
                actual_bytes=len(asset_bytes),
            )
        asset_id = hashlib.sha256(asset_bytes).hexdigest()
        thumbnail_bytes = _encoded_thumbnail(image)
        self.ensure_directories()
        asset_path = self.assets_dir / f"{asset_id}.{image_format}"
        thumbnail_path = self.thumbnails_dir / f"{asset_id}.webp"
        if not asset_path.is_file():
            _write_bytes_atomic(asset_path, asset_bytes)
        if not thumbnail_path.is_file():
            _write_bytes_atomic(thumbnail_path, thumbnail_bytes)
        return {
            "asset_id": asset_id,
            "width": image.width,
            "height": image.height,
            "format": image_format,
            "has_alpha": decoded.has_alpha,
            "file_size": len(asset_bytes),
            "source_size": decoded.source_size,
            "original_width": decoded.original_width,
            "original_height": decoded.original_height,
            "resized": resized,
        }

    def _public_preset(self, preset: dict, revision: int) -> dict:
        asset_id = preset["asset_id"]
        return {
            **preset,
            "asset_url": f"/speech-bubble-forge/user-assets/asset/{asset_id}?v={revision}",
            "thumbnail_url": f"/speech-bubble-forge/user-assets/thumbnail/{asset_id}?v={revision}",
        }

    def catalog(self) -> dict:
        index = self.read_index()
        revision = int(index["revision"])
        presets = [self._public_preset(preset, revision) for preset in index["presets"]]
        return {
            "ok": True,
            "schema_version": USER_ASSET_SCHEMA_VERSION,
            "api_version": USER_ASSET_API_VERSION,
            "revision": revision,
            "limits": {
                "recommended_side": USER_ASSET_RECOMMENDED_SIDE,
                "resize_side": USER_ASSET_RESIZE_SIDE,
                "maximum_source_pixels": USER_ASSET_MAX_SOURCE_PIXELS,
                "maximum_bytes": USER_ASSET_MAX_UPLOAD_BYTES,
                "name_max_length": USER_ASSET_NAME_MAX_LENGTH,
            },
            "counts": {
                "sfx": sum(preset["category"] == "sfx" for preset in presets),
                "stamp": sum(preset["category"] == "stamp" for preset in presets),
            },
            "archive": self.archive_status(index),
            "presets": presets,
        }

    def create(self, payload: dict) -> dict:
        if not isinstance(payload, dict):
            raise UserAssetError("Invalid user preset request", "invalid_request")
        with _STORE_LOCK:
            index = self.read_index()
            category = _safe_category(payload.get("category"))
            name = _safe_name(payload.get("name"))
            conflict = _safe_conflict(payload.get("conflict"), {"error", "rename", "replace"})
            duplicate = self._duplicate(index, category, name)
            if len(index["presets"]) >= USER_ASSET_MAX_PRESETS and not (
                duplicate and conflict == "replace"
            ):
                raise UserAssetError("User preset limit reached", "preset_limit")
            if duplicate and conflict == "error":
                raise UserAssetError(
                    "A preset with the same name already exists",
                    "duplicate_name",
                    existing_id=duplicate["id"],
                    suggested_name=self._unique_name(index, category, name),
                )
            if duplicate and conflict == "rename":
                name = self._unique_name(index, category, name)
            image_metadata = self._save_image(payload)
            now = _utc_now()
            if duplicate and conflict == "replace":
                position, existing = self._find_preset(index, duplicate["id"])
                style_defaults = _safe_style_defaults(
                    payload.get("style_defaults"),
                    image_metadata["width"],
                    image_metadata["height"],
                    existing.get("style_defaults"),
                )
                preset = {
                    **existing,
                    **image_metadata,
                    "name": name,
                    "style_defaults": style_defaults,
                    "original_name": str(payload.get("original_name") or existing.get("original_name") or "")[:255],
                    "updated_at": now,
                }
                for key in ("source_size", "original_width", "original_height", "resized"):
                    preset.pop(key, None)
                index["presets"][position] = preset
            else:
                style_defaults = _safe_style_defaults(
                    payload.get("style_defaults"),
                    image_metadata["width"],
                    image_metadata["height"],
                )
                preset = {
                    "id": str(uuid.uuid4()),
                    "category": category,
                    "name": name,
                    "asset_id": image_metadata["asset_id"],
                    "width": image_metadata["width"],
                    "height": image_metadata["height"],
                    "format": image_metadata["format"],
                    "has_alpha": image_metadata["has_alpha"],
                    "file_size": image_metadata["file_size"],
                    "style_defaults": style_defaults,
                    "original_name": str(payload.get("original_name") or "")[:255],
                    "created_at": now,
                    "updated_at": now,
                }
                index["presets"].append(preset)
            index["revision"] = self._next_revision(index)
            self.write_index(index)
            return {
                "ok": True,
                "preset": self._public_preset(preset, index["revision"]),
                "revision": index["revision"],
                "resized": image_metadata["resized"],
                "original_width": image_metadata["original_width"],
                "original_height": image_metadata["original_height"],
            }

    def update(self, preset_id: str, payload: dict) -> dict:
        if not isinstance(payload, dict):
            raise UserAssetError("Invalid user preset request", "invalid_request")
        with _STORE_LOCK:
            index = self.read_index()
            position, existing = self._find_preset(index, preset_id)
            category = _safe_category(payload.get("category", existing["category"]))
            name = _safe_name(payload.get("name", existing["name"]))
            conflict = _safe_conflict(payload.get("conflict"), {"error", "rename"})
            duplicate = self._duplicate(index, category, name, existing["id"])
            if duplicate and conflict == "error":
                raise UserAssetError(
                    "A preset with the same name already exists",
                    "duplicate_name",
                    existing_id=duplicate["id"],
                    suggested_name=self._unique_name(index, category, name, existing["id"]),
                )
            if duplicate and conflict == "rename":
                name = self._unique_name(index, category, name, existing["id"])
            preset = {
                **existing,
                "category": category,
                "name": name,
                "style_defaults": _safe_style_defaults(
                    payload.get("style_defaults"),
                    existing["width"],
                    existing["height"],
                    existing.get("style_defaults"),
                ),
                "updated_at": _utc_now(),
            }
            index["presets"][position] = preset
            index["revision"] = self._next_revision(index)
            self.write_index(index)
            return {
                "ok": True,
                "preset": self._public_preset(preset, index["revision"]),
                "revision": index["revision"],
            }

    def replace_image(self, preset_id: str, payload: dict) -> dict:
        if not isinstance(payload, dict):
            raise UserAssetError("Invalid user preset request", "invalid_request")
        with _STORE_LOCK:
            index = self.read_index()
            position, existing = self._find_preset(index, preset_id)
            image_metadata = self._save_image(payload)
            preset = {
                **existing,
                "asset_id": image_metadata["asset_id"],
                "width": image_metadata["width"],
                "height": image_metadata["height"],
                "format": image_metadata["format"],
                "has_alpha": image_metadata["has_alpha"],
                "file_size": image_metadata["file_size"],
                "original_name": str(payload.get("original_name") or existing.get("original_name") or "")[:255],
                "updated_at": _utc_now(),
            }
            index["presets"][position] = preset
            index["revision"] = self._next_revision(index)
            self.write_index(index)
            return {
                "ok": True,
                "preset": self._public_preset(preset, index["revision"]),
                "revision": index["revision"],
                "resized": image_metadata["resized"],
                "original_width": image_metadata["original_width"],
                "original_height": image_metadata["original_height"],
            }

    def delete(self, preset_id: str) -> dict:
        with _STORE_LOCK:
            index = self.read_index()
            position, existing = self._find_preset(index, preset_id)
            del index["presets"][position]
            index["revision"] = self._next_revision(index)
            self.write_index(index)
            # Asset files are intentionally retained so saved layouts continue to render.
            return {
                "ok": True,
                "deleted": True,
                "preset_id": existing["id"],
                "asset_retained": True,
                "revision": index["revision"],
            }

    def validate(self, verify_images: bool = True) -> dict:
        index = self.read_index()
        issues: list[dict] = []
        readable_assets = 0
        readable_thumbnails = 0
        asset_results: dict[str, tuple[bool, dict | None]] = {}
        thumbnail_results: dict[str, tuple[bool, dict | None]] = {}

        for preset in index["presets"]:
            asset_id = preset["asset_id"]
            asset = self._asset_file(asset_id, preset["format"])
            thumbnail = self.thumbnail_path(asset_id)

            if asset is None:
                asset_ok = False
                asset_issue = {"code": "asset_missing", "asset_id": asset_id}
            elif not verify_images:
                asset_ok = True
                asset_issue = None
            elif asset_id in asset_results:
                asset_ok, asset_issue = asset_results[asset_id]
            else:
                try:
                    raw = asset.read_bytes()
                    if hashlib.sha256(raw).hexdigest() != asset_id:
                        raise UserAssetError("Asset checksum does not match its ID", "asset_checksum_mismatch")
                    with Image.open(io.BytesIO(raw)) as image:
                        actual_format = str(image.format or "").lower()
                        if actual_format != preset["format"]:
                            raise UserAssetError("Asset format does not match the index", "asset_format_mismatch")
                        if int(getattr(image, "n_frames", 1) or 1) != 1:
                            raise UserAssetError("Registered asset is animated", "asset_animated")
                        if image.size != (preset["width"], preset["height"]):
                            raise UserAssetError("Asset dimensions do not match the index", "asset_dimensions_mismatch")
                        image.verify()
                    asset_ok = True
                    asset_issue = None
                except UserAssetError as error:
                    asset_ok = False
                    asset_issue = {"code": error.code, "message": str(error), "asset_id": asset_id}
                except Exception as error:
                    asset_ok = False
                    asset_issue = {"code": "asset_unreadable", "message": str(error), "asset_id": asset_id}
                asset_results[asset_id] = (asset_ok, asset_issue)

            if asset_ok:
                readable_assets += 1
            elif asset_issue:
                issues.append({**asset_issue, "preset_id": preset["id"]})

            if thumbnail is None:
                thumbnail_ok = False
                thumbnail_issue = {"code": "thumbnail_missing", "asset_id": asset_id}
            elif not verify_images:
                thumbnail_ok = True
                thumbnail_issue = None
            elif asset_id in thumbnail_results:
                thumbnail_ok, thumbnail_issue = thumbnail_results[asset_id]
            else:
                try:
                    with Image.open(thumbnail) as image:
                        if str(image.format or "").upper() != "WEBP":
                            raise UserAssetError("Thumbnail is not WebP", "thumbnail_format_mismatch")
                        if int(getattr(image, "n_frames", 1) or 1) != 1:
                            raise UserAssetError("Thumbnail is animated", "thumbnail_animated")
                        if max(image.size) > USER_ASSET_THUMBNAIL_SIDE:
                            raise UserAssetError("Thumbnail dimensions are too large", "thumbnail_dimensions_invalid")
                        image.verify()
                    thumbnail_ok = True
                    thumbnail_issue = None
                except UserAssetError as error:
                    thumbnail_ok = False
                    thumbnail_issue = {"code": error.code, "message": str(error), "asset_id": asset_id}
                except Exception as error:
                    thumbnail_ok = False
                    thumbnail_issue = {"code": "thumbnail_unreadable", "message": str(error), "asset_id": asset_id}
                thumbnail_results[asset_id] = (thumbnail_ok, thumbnail_issue)

            if thumbnail_ok:
                readable_thumbnails += 1
            elif thumbnail_issue:
                issues.append({**thumbnail_issue, "preset_id": preset["id"]})

        return {
            "ok": not issues,
            "revision": index["revision"],
            "preset_count": len(index["presets"]),
            "readable_assets": readable_assets,
            "readable_thumbnails": readable_thumbnails,
            "issues": issues,
        }

    def writable_probe(self) -> dict:
        self.ensure_directories()
        temporary: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                "wb", dir=self.root, prefix=".diagnostic-", suffix=".tmp", delete=False
            ) as handle:
                temporary = Path(handle.name)
                handle.write(b"speech-bubble-forge")
            return {"ok": temporary.read_bytes() == b"speech-bubble-forge"}
        finally:
            if temporary:
                temporary.unlink(missing_ok=True)


def default_user_asset_store() -> UserAssetStore:
    return UserAssetStore(user_asset_root())


def resolve_user_asset_path(asset_id: str) -> Path | None:
    try:
        return default_user_asset_store().asset_path(asset_id)
    except UserAssetError:
        return None


__all__ = [
    "SETTINGS_UI_VERSION",
    "USER_ASSET_API_VERSION",
    "USER_ASSET_MAX_SOURCE_PIXELS",
    "USER_ASSET_MAX_UPLOAD_BYTES",
    "USER_ASSET_NAME_MAX_LENGTH",
    "USER_ASSET_RECOMMENDED_SIDE",
    "USER_ASSET_RESIZE_SIDE",
    "USER_ASSET_SCHEMA_VERSION",
    "UserAssetError",
    "UserAssetStore",
    "default_user_asset_store",
    "resolve_user_asset_path",
    "user_asset_root",
]
