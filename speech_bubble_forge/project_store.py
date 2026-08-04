from __future__ import annotations

import hashlib
import io
import json
import os
import shutil
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageOps

from .project_schema import (
    ALLOWED_IMAGE_MIMES,
    MAX_IMAGES,
    ProjectSchemaError,
    new_manifest,
    normalize_project_id,
    project_storage_key,
    safe_asset_path,
    utc_now,
    validate_asset_record,
    validate_layout,
    validate_manifest,
)

MAX_IMAGE_BYTES = 96 * 1024 * 1024
MAX_IMAGE_PIXELS = 100_000_000
ASSET_REGISTRY_VERSION = 1
_IMAGE_FORMATS = {
    "PNG": ("image/png", "png"),
    "JPEG": ("image/jpeg", "jpg"),
    "WEBP": ("image/webp", "webp"),
}


class ProjectStore:
    """Content-addressed Forge project store.

    Project metadata and image blobs are intentionally separate from the
    existing image:<sha256> and standalone:<uuid> layout store.
    """

    def __init__(self, root: Path):
        self.root = Path(root)
        self._lock = threading.RLock()

    def _project_dir(self, project_id: object) -> Path:
        return self.root / project_storage_key(project_id)

    def _manifest_path(self, project_id: object) -> Path:
        return self._project_dir(project_id) / "project.json"

    def _registry_path(self, project_id: object) -> Path:
        return self._project_dir(project_id) / "assets.json"

    def _images_dir(self, project_id: object) -> Path:
        return self._project_dir(project_id) / "images"

    @staticmethod
    def _atomic_write(path: Path, data: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
        try:
            temporary.write_bytes(data)
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)

    @classmethod
    def _atomic_json(cls, path: Path, value: object) -> None:
        raw = json.dumps(
            value,
            ensure_ascii=False,
            indent=2,
            allow_nan=False,
        ).encode("utf-8")
        cls._atomic_write(path, raw)

    @staticmethod
    def _read_json(path: Path) -> dict:
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, dict):
            raise ProjectSchemaError(f"Invalid JSON object: {path.name}")
        return value

    def _load_registry(self, project_id: object) -> dict[str, dict]:
        path = self._registry_path(project_id)
        if not path.is_file():
            return {}
        wrapper = self._read_json(path)
        if wrapper.get("version") != ASSET_REGISTRY_VERSION:
            raise ProjectSchemaError("Unsupported project asset registry")
        records = wrapper.get("assets")
        if not isinstance(records, list):
            raise ProjectSchemaError("Project asset registry is invalid")
        output: dict[str, dict] = {}
        for record in records:
            normalized = validate_asset_record(record)
            output[normalized["id"]] = normalized
        return output

    def _save_registry(
        self,
        project_id: object,
        records: dict[str, dict],
    ) -> None:
        wrapper = {
            "version": ASSET_REGISTRY_VERSION,
            "updated_at": utc_now(),
            "assets": sorted(records.values(), key=lambda item: item["id"]),
        }
        self._atomic_json(self._registry_path(project_id), wrapper)

    def create(
        self,
        *,
        project_id: object | None = None,
        title: str = "Untitled Comic Project",
        source_revisions: dict | None = None,
    ) -> dict:
        manifest = new_manifest(project_id, title=title)
        if isinstance(source_revisions, dict):
            manifest["source_revisions"] = {
                str(key)[:80]: str(value)[:160]
                for key, value in source_revisions.items()
            }
        normalized_id = manifest["project_id"]
        with self._lock:
            path = self._manifest_path(normalized_id)
            if path.exists():
                raise FileExistsError("Project already exists")
            self._project_dir(normalized_id).mkdir(parents=True, exist_ok=False)
            self._images_dir(normalized_id).mkdir(parents=True, exist_ok=True)
            self._save_registry(normalized_id, {})
            self._atomic_json(path, manifest)
        return manifest

    def exists(self, project_id: object) -> bool:
        return self._manifest_path(project_id).is_file()

    def load(self, project_id: object) -> dict:
        normalized_id = normalize_project_id(project_id)
        with self._lock:
            path = self._manifest_path(normalized_id)
            if not path.is_file():
                raise FileNotFoundError("Project not found")
            manifest = validate_manifest(
                self._read_json(path),
                project_id=normalized_id,
            )
            registry = self._load_registry(normalized_id)
            current_images = []
            for record in manifest["images"]:
                server_record = registry.get(record["id"])
                if not server_record:
                    raise ProjectSchemaError(
                        f"Project image blob is missing: {record['id']}"
                    )
                image_path = self._project_dir(normalized_id) / safe_asset_path(
                    server_record["path"]
                )
                if not image_path.is_file():
                    raise ProjectSchemaError(
                        f"Project image file is missing: {record['id']}"
                    )
                current_images.append(server_record)
            manifest["images"] = current_images
            return manifest

    def list(self) -> list[dict]:
        if not self.root.is_dir():
            return []
        output = []
        with self._lock:
            for directory in self.root.iterdir():
                if not directory.is_dir():
                    continue
                path = directory / "project.json"
                if not path.is_file():
                    continue
                try:
                    manifest = validate_manifest(self._read_json(path))
                except (OSError, ValueError, json.JSONDecodeError):
                    continue
                output.append(
                    {
                        "project_id": manifest["project_id"],
                        "title": manifest["title"],
                        "active_workspace": manifest["active_workspace"],
                        "updated_at": manifest["updated_at"],
                        "image_count": len(manifest["images"]),
                    }
                )
        output.sort(key=lambda item: item["updated_at"], reverse=True)
        return output

    def save(
        self,
        project_id: object,
        *,
        title: str,
        layout: dict,
        image_ids: list[str],
        image_trays: dict | None = None,
        source_revisions: dict | None = None,
    ) -> dict:
        normalized_id = normalize_project_id(project_id)
        normalized_layout = validate_layout(layout, require_current=True)
        clean_title = str(title or "").strip()
        if not clean_title or len(clean_title) > 160:
            raise ProjectSchemaError("Project title is invalid")
        if not isinstance(image_ids, list) or len(image_ids) > MAX_IMAGES:
            raise ProjectSchemaError("Project image ID list is invalid")

        with self._lock:
            current = (
                self.load(normalized_id)
                if self.exists(normalized_id)
                else self.create(project_id=normalized_id, title=clean_title)
            )
            registry = self._load_registry(normalized_id)
            seen: set[str] = set()
            images: list[dict] = []
            for raw_id in image_ids:
                asset_id = str(raw_id or "").strip().lower()
                if not asset_id or asset_id in seen:
                    continue
                seen.add(asset_id)
                record = registry.get(asset_id)
                if not record:
                    raise ProjectSchemaError(
                        f"Unknown project image ID: {asset_id}"
                    )
                images.append(record)

            now = utc_now()
            manifest = {
                **current,
                "project_id": normalized_id,
                "title": clean_title,
                "updated_at": now,
                "active_workspace": normalized_layout["active_workspace"],
                "layout": normalized_layout,
                "images": images,
                "image_trays": image_trays,
            }
            if isinstance(source_revisions, dict):
                manifest["source_revisions"] = {
                    str(key)[:80]: str(value)[:160]
                    for key, value in source_revisions.items()
                }
            manifest = validate_manifest(manifest, project_id=normalized_id)
            self._atomic_json(self._manifest_path(normalized_id), manifest)
            return manifest

    @staticmethod
    def _inspect_image(raw: bytes) -> tuple[str, str, int, int]:
        if not raw or len(raw) > MAX_IMAGE_BYTES:
            raise ProjectSchemaError("Image is empty or too large")
        try:
            with Image.open(io.BytesIO(raw)) as image:
                image.verify()
                image_format = str(image.format or "").upper()
            with Image.open(io.BytesIO(raw)) as image:
                normalized = ImageOps.exif_transpose(image)
                width, height = normalized.size
        except Exception as error:
            raise ProjectSchemaError("Image cannot be decoded") from error
        if image_format not in _IMAGE_FORMATS:
            raise ProjectSchemaError("Image format is unsupported")
        if width < 1 or height < 1 or width * height > MAX_IMAGE_PIXELS:
            raise ProjectSchemaError("Image dimensions are unsupported")
        mime, extension = _IMAGE_FORMATS[image_format]
        return mime, extension, int(width), int(height)

    def put_image(
        self,
        project_id: object,
        raw: bytes,
        *,
        name: str,
        source_kind: str = "forge-gallery",
        source_tab: str = "",
    ) -> dict:
        normalized_id = normalize_project_id(project_id)
        if not self.exists(normalized_id):
            self.create(project_id=normalized_id)

        mime, extension, width, height = self._inspect_image(raw)
        digest = hashlib.sha256(raw).hexdigest()
        asset_id = f"forge-project-image:{digest}"
        clean_name = str(name or "generated-image").strip()[:260]
        if not clean_name:
            clean_name = "generated-image"
        if source_kind not in {
            "forge-gallery",
            "local-file",
            "converted",
            "background-removal",
        }:
            source_kind = "forge-gallery"
        if source_tab not in {"txt2img", "img2img", ""}:
            source_tab = ""

        record = {
            "id": asset_id,
            "sha256": digest,
            "name": clean_name,
            "mime": mime,
            "width": width,
            "height": height,
            "path": f"images/{digest}.{extension}",
            "source": {
                "kind": source_kind,
                "tab": source_tab,
                "original_name": clean_name,
            },
        }
        record = validate_asset_record(record)

        with self._lock:
            registry = self._load_registry(normalized_id)
            existing = registry.get(asset_id)
            if existing:
                return existing
            path = self._project_dir(normalized_id) / record["path"]
            self._atomic_write(path, raw)
            registry[asset_id] = record
            self._save_registry(normalized_id, registry)
        return record

    def image_path(self, project_id: object, asset_id: object) -> Path:
        normalized_id = normalize_project_id(project_id)
        normalized_asset_id = str(asset_id or "").strip().lower()
        with self._lock:
            record = self._load_registry(normalized_id).get(normalized_asset_id)
            if not record:
                raise FileNotFoundError("Project image not found")
            path = self._project_dir(normalized_id) / safe_asset_path(
                record["path"]
            )
            if not path.is_file():
                raise FileNotFoundError("Project image file not found")
            return path

    def cleanup(self, project_id: object) -> dict:
        """Remove blobs not referenced by the last explicit project save."""
        normalized_id = normalize_project_id(project_id)
        with self._lock:
            manifest = self.load(normalized_id)
            keep = {record["id"] for record in manifest["images"]}
            registry = self._load_registry(normalized_id)
            removed: list[str] = []
            for asset_id, record in list(registry.items()):
                if asset_id in keep:
                    continue
                path = self._project_dir(normalized_id) / safe_asset_path(
                    record["path"]
                )
                path.unlink(missing_ok=True)
                registry.pop(asset_id, None)
                removed.append(asset_id)
            self._save_registry(normalized_id, registry)
            return {"removed": removed, "remaining": len(registry)}

    def delete(self, project_id: object) -> bool:
        normalized_id = normalize_project_id(project_id)
        directory = self._project_dir(normalized_id)
        with self._lock:
            existed = directory.is_dir()
            if existed:
                shutil.rmtree(directory)
            return existed
