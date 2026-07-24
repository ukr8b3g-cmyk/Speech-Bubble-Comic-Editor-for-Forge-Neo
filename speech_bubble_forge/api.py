from __future__ import annotations

import base64
import binascii
import io
import json
import mimetypes
import re
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from fastapi import HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps

from . import __version__
from .diagnostics import run_self_diagnostics
from .font_catalog import font_by_id, public_fonts
from .presets import read_user_presets, update_user_presets
from .renderer import get_frame_asset_catalog, get_sfx_asset_catalog, render_composite
from .settings import (
    allowed_output_roots,
    data_root,
    layout_root,
    output_root,
    public_settings,
    rebuild_all_caches,
)
from .user_assets import (
    SETTINGS_UI_VERSION,
    USER_ASSET_API_VERSION,
    USER_ASSET_MAX_UPLOAD_BYTES,
    UserAssetError,
    default_user_asset_store,
)

EXTENSION_ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = EXTENSION_ROOT / "web"
_MAX_IMAGE_BYTES = 96 * 1024 * 1024
_MAX_LAYOUT_CHARS = 8 * 1024 * 1024
_SAVE_LOCK = threading.RLock()
_LAYOUT_LOCK = threading.RLock()
_FINGERPRINT_RE = re.compile(r"^[a-f0-9]{64}$")
_DOCUMENT_ID_RE = re.compile(
    r"^(image:[a-f0-9]{64}|standalone:[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$"
)
_CLIENT_EXPORT_TOKEN_RE = re.compile(r"^[a-f0-9]{32}$")
_CLIENT_EXPORT_MAX_AGE = 60 * 60


def preset_path() -> Path:
    return data_root() / "config" / "speech-bubble-forge" / "presets.json"


def _decode_data_url(value, field_name="image_data_url"):
    if not isinstance(value, str):
        raise ValueError(f"{field_name} is required")
    match = re.fullmatch(
        r"data:image/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\r\n]+)",
        value,
        re.IGNORECASE,
    )
    if not match:
        raise ValueError("Unsupported image data URL")
    try:
        raw = base64.b64decode(match.group(2), validate=True)
    except (binascii.Error, ValueError) as error:
        raise ValueError("Invalid base64 image") from error
    if not raw or len(raw) > _MAX_IMAGE_BYTES:
        raise ValueError("Image is empty or too large")
    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
        image = ImageOps.exif_transpose(image).convert("RGBA")
    except Exception as error:
        raise ValueError("Could not decode image") from error
    if image.width * image.height > 100_000_000:
        raise ValueError("Image dimensions are too large")
    return image


def _browser_canvas_export(payload, layout):
    if payload.get("render_mode") != "browser_canvas_v1":
        return None
    composite = _decode_data_url(
        payload.get("composite_data_url"),
        "composite_data_url",
    )
    overlay = _decode_data_url(
        payload.get("overlay_data_url"),
        "overlay_data_url",
    )
    if composite.size != overlay.size:
        raise ValueError("Browser canvas composite and overlay dimensions do not match")
    canvas = layout.get("canvas") if isinstance(layout, dict) else None
    if isinstance(canvas, dict):
        expected = (
            max(1, int(canvas.get("width", composite.width))),
            max(1, int(canvas.get("height", composite.height))),
        )
        if composite.size != expected:
            raise ValueError("Browser canvas dimensions do not match the layout")
    return composite, overlay


def _safe_name(value):
    value = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(value or "")).strip("._")
    return value[:80] or "speech_bubble"


def _safe_document_id(value: str) -> str:
    document_id = str(value or "").strip().lower()
    if _FINGERPRINT_RE.fullmatch(document_id):
        return f"image:{document_id}"
    if not _DOCUMENT_ID_RE.fullmatch(document_id):
        raise ValueError("Invalid document ID")
    return document_id


def _validate_layout(raw_layout) -> tuple[str, dict]:
    if isinstance(raw_layout, dict):
        parsed = raw_layout
    elif isinstance(raw_layout, str) and len(raw_layout) <= _MAX_LAYOUT_CHARS:
        parsed = json.loads(raw_layout or "{}")
    else:
        raise ValueError("Layout JSON is invalid or too large")
    if not isinstance(parsed, dict):
        raise ValueError("Layout JSON must be an object")
    normalized = json.dumps(parsed, ensure_ascii=False, indent=2)
    if len(normalized) > _MAX_LAYOUT_CHARS:
        raise ValueError("Layout JSON is too large")
    return normalized, parsed


def _write_image(image, path, image_format, settings):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        if image_format == "png":
            image.save(
                temporary,
                format="PNG",
                compress_level=settings.png_compression,
            )
        elif image_format == "jpeg":
            rgba = image.convert("RGBA")
            flattened = Image.new("RGB", rgba.size, "white")
            flattened.paste(rgba, mask=rgba.getchannel("A"))
            flattened.save(
                temporary,
                format="JPEG",
                quality=settings.jpeg_quality,
                optimize=True,
            )
        elif image_format == "webp":
            image.save(
                temporary,
                format="WEBP",
                quality=settings.webp_quality,
                lossless=settings.webp_lossless,
                method=6,
            )
        else:
            raise ValueError("Unsupported output format")
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def _write_png(image, path, settings):
    _write_image(image, path, "png", settings)


def _output_extension(image_format: str) -> str:
    return {"png": ".png", "jpeg": ".jpg", "webp": ".webp"}[image_format]


def _dated_output_root(root: Path, now: datetime, mode: str) -> Path:
    if mode == "year_month":
        return root / f"{now:%Y-%m}"
    if mode == "year_month_day":
        return root / f"{now:%Y-%m-%d}"
    return root


def _export_stem(prefix: str, now: datetime, filename_format: str, root: Path, extension: str) -> str:
    if filename_format == "source_only":
        return f"{prefix}_edited"
    if filename_format == "source_sequence":
        for sequence in range(1, 1_000_000):
            stem = f"{prefix}_{sequence:04d}"
            if not (root / f"{stem}{extension}").exists():
                return stem
        raise ValueError("Could not allocate the next output sequence")
    if filename_format == "speech_bubble_datetime":
        prefix = "speech_bubble"
    return f"{prefix}_{now:%Y%m%d_%H%M%S_%f}"


def _rotate_backups(path: Path, generations: int) -> None:
    if not path.exists():
        return
    backup_pattern = re.compile(
        rf"^{re.escape(path.stem)}_backup_(\d+){re.escape(path.suffix)}$"
    )
    for candidate in path.parent.glob(f"{path.stem}_backup_*{path.suffix}"):
        match = backup_pattern.fullmatch(candidate.name)
        if match and int(match.group(1)) > generations:
            candidate.unlink(missing_ok=True)
    for index in range(generations, 1, -1):
        previous = path.with_name(f"{path.stem}_backup_{index - 1:02d}{path.suffix}")
        target = path.with_name(f"{path.stem}_backup_{index:02d}{path.suffix}")
        if previous.exists():
            target.unlink(missing_ok=True)
            previous.replace(target)
    first = path.with_name(f"{path.stem}_backup_01{path.suffix}")
    first.unlink(missing_ok=True)
    path.replace(first)


def _client_export_root() -> Path:
    return (data_root() / "config" / "speech-bubble-forge" / "export-temp").resolve()


def _client_export_dir(token: str) -> Path:
    if not _CLIENT_EXPORT_TOKEN_RE.fullmatch(str(token or "")):
        raise HTTPException(status_code=404, detail="Temporary export not found")
    return _client_export_root() / token


def _remove_client_export(token: str) -> bool:
    directory = _client_export_dir(token)
    if not directory.is_dir():
        return False
    for child in directory.iterdir():
        if child.is_file():
            child.unlink(missing_ok=True)
    directory.rmdir()
    return True


def _cleanup_stale_client_exports() -> None:
    root = _client_export_root()
    if not root.is_dir():
        return
    cutoff = time.time() - _CLIENT_EXPORT_MAX_AGE
    for directory in root.iterdir():
        if (
            directory.is_dir()
            and _CLIENT_EXPORT_TOKEN_RE.fullmatch(directory.name)
            and directory.stat().st_mtime < cutoff
        ):
            _remove_client_export(directory.name)


def _output_url(prefix: str, relative_path: Path) -> str:
    return f"/speech-bubble-forge/{prefix}/{quote(relative_path.as_posix(), safe='/')}"


def _write_text_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        temporary.write_text(text, encoding="utf-8")
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def _route_exists(app, path, method=None):
    method = method.upper() if method else None
    for route in app.routes:
        if getattr(route, "path", None) != path:
            continue
        methods = getattr(route, "methods", None) or set()
        if method is None or method in methods:
            return True
    return False


_USER_ASSET_REQUEST_MAX_BYTES = max(6 * 1024 * 1024, (USER_ASSET_MAX_UPLOAD_BYTES * 4 // 3) + 128 * 1024)


async def _bounded_json_request(request: Request, maximum_bytes: int = _USER_ASSET_REQUEST_MAX_BYTES):
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > maximum_bytes:
                raise HTTPException(status_code=413, detail="Request body is too large")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid Content-Length header")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > maximum_bytes:
            raise HTTPException(status_code=413, detail="Request body is too large")
    if not body:
        return {}
    try:
        return json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise HTTPException(status_code=400, detail="Invalid JSON request") from error


def _user_asset_http_error(error: UserAssetError) -> HTTPException:
    if error.code == "preset_not_found":
        status_code = 404
    elif error.code == "duplicate_name":
        status_code = 409
    elif error.code in {
        "opaque_confirmation_required",
        "animated_image",
        "unsupported_format",
        "file_too_large",
    }:
        status_code = 422
    elif error.code.startswith("index_"):
        status_code = 500
    else:
        status_code = 400
    return HTTPException(status_code=status_code, detail=error.as_dict())


def _safe_output_file(filename: str) -> Path:
    for root in allowed_output_roots():
        candidate = (root / filename).resolve()
        try:
            candidate.relative_to(root)
        except ValueError:
            continue
        if candidate.is_file():
            return candidate
    raise HTTPException(status_code=404, detail="Output file not found")


def _layout_file(document_id: str) -> Path:
    document_id = _safe_document_id(document_id)
    if document_id.startswith("image:"):
        storage_key = document_id.removeprefix("image:")
    else:
        storage_key = f"standalone_{document_id.removeprefix('standalone:')}"
    return layout_root() / f"{storage_key}.json"


def register_routes(app):
    """Register the standalone editor, asset APIs, settings API, layout store, and exporter."""
    if getattr(app.state, "speech_bubble_forge_registered", False):
        return
    app.state.speech_bubble_forge_registered = True

    output_root().mkdir(parents=True, exist_ok=True)
    layout_root().mkdir(parents=True, exist_ok=True)
    _client_export_root().mkdir(parents=True, exist_ok=True)
    _cleanup_stale_client_exports()

    if not _route_exists(app, "/speech-bubble-forge/static"):
        app.mount(
            "/speech-bubble-forge/static",
            StaticFiles(directory=str(WEB_ROOT), html=True, check_dir=True),
            name="speech-bubble-forge-static",
        )

    async def health():
        return {
            "ok": True,
            "name": "Speech Bubble Editor for Forge Neo",
            "version": __version__,
            "settings_ui_version": SETTINGS_UI_VERSION,
            "user_asset_api_version": USER_ASSET_API_VERSION,
            "settings": public_settings().as_dict(),
        }

    async def config():
        return {
            "ok": True,
            "version": __version__,
            "settings_ui_version": SETTINGS_UI_VERSION,
            "user_asset_api_version": USER_ASSET_API_VERSION,
            **public_settings().as_dict(),
        }

    async def output_file(filename: str):
        path = _safe_output_file(filename)
        media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        return FileResponse(path, media_type=media_type, filename=path.name)

    async def view_file(filename: str):
        path = _safe_output_file(filename)
        media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        return FileResponse(path, media_type=media_type)

    async def client_export_file(token: str, kind: str):
        if kind not in {"composite", "overlay"}:
            raise HTTPException(status_code=404, detail="Temporary export not found")
        directory = _client_export_dir(token)
        candidates = list(directory.glob(f"{kind}.*")) if directory.is_dir() else []
        if len(candidates) != 1 or not candidates[0].is_file():
            raise HTTPException(status_code=404, detail="Temporary export not found")
        path = candidates[0]
        media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        return FileResponse(path, media_type=media_type)

    async def delete_client_export(token: str):
        try:
            return {"ok": True, "deleted": _remove_client_export(token)}
        except OSError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    async def fonts():
        return {"fonts": public_fonts()}

    async def font_file(font_id: str):
        font = font_by_id(font_id)
        if not font:
            raise HTTPException(status_code=404, detail="Font not found")
        content_type = mimetypes.guess_type(font["path"])[0] or "application/octet-stream"
        return FileResponse(font["path"], media_type=content_type)

    async def frame_assets():
        return get_frame_asset_catalog()

    async def sfx_assets():
        return get_sfx_asset_catalog()

    async def reload_assets():
        rebuild_all_caches()
        return get_sfx_asset_catalog()

    async def get_user_assets():
        try:
            return default_user_asset_store().catalog()
        except UserAssetError as error:
            raise _user_asset_http_error(error) from error

    async def create_user_asset(request: Request):
        try:
            return default_user_asset_store().create(await _bounded_json_request(request))
        except UserAssetError as error:
            raise _user_asset_http_error(error) from error

    async def organize_user_asset_archive():
        try:
            return default_user_asset_store().organize_archive()
        except UserAssetError as error:
            raise _user_asset_http_error(error) from error

    async def update_user_asset(preset_id: str, request: Request):
        try:
            return default_user_asset_store().update(preset_id, await _bounded_json_request(request))
        except UserAssetError as error:
            raise _user_asset_http_error(error) from error

    async def replace_user_asset_image(preset_id: str, request: Request):
        try:
            return default_user_asset_store().replace_image(preset_id, await _bounded_json_request(request))
        except UserAssetError as error:
            raise _user_asset_http_error(error) from error

    async def delete_user_asset(preset_id: str):
        try:
            return default_user_asset_store().delete(preset_id)
        except UserAssetError as error:
            raise _user_asset_http_error(error) from error

    async def user_asset_file(asset_id: str):
        try:
            path = default_user_asset_store().asset_path(asset_id)
        except UserAssetError as error:
            raise _user_asset_http_error(error) from error
        if path is None:
            raise HTTPException(status_code=404, detail="User asset not found")
        media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        return FileResponse(
            path,
            media_type=media_type,
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )

    async def user_asset_thumbnail(asset_id: str):
        try:
            path = default_user_asset_store().thumbnail_path(asset_id)
        except UserAssetError as error:
            raise _user_asset_http_error(error) from error
        if path is None:
            raise HTTPException(status_code=404, detail="User asset thumbnail not found")
        return FileResponse(
            path,
            media_type="image/webp",
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )

    async def self_diagnostics(request: Request):
        try:
            payload = await request.json()
        except json.JSONDecodeError:
            payload = {}
        return run_self_diagnostics(str(payload.get("frontend_version") or ""))

    async def get_presets():
        return {"version": 1, "presets": read_user_presets(preset_path())}

    async def post_presets(request: Request):
        try:
            payload = await request.json()
            presets = update_user_presets(preset_path(), payload)
            return {"version": 1, "presets": presets}
        except (ValueError, OSError, json.JSONDecodeError) as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    async def get_layout(fingerprint: str):
        try:
            document_id = _safe_document_id(fingerprint)
            path = _layout_file(document_id)
            if not path.is_file():
                return {
                    "ok": True,
                    "exists": False,
                    "document_id": document_id,
                    "fingerprint": document_id.removeprefix("image:") if document_id.startswith("image:") else "",
                    "layout_json": "{}",
                }
            with _LAYOUT_LOCK:
                wrapper = json.loads(path.read_text(encoding="utf-8"))
            layout = wrapper.get("layout", wrapper)
            normalized, _ = _validate_layout(layout)
            return {
                "ok": True,
                "exists": True,
                "document_id": document_id,
                "fingerprint": document_id.removeprefix("image:") if document_id.startswith("image:") else "",
                "layout_json": normalized,
                "saved_at": wrapper.get("saved_at") if isinstance(wrapper, dict) else None,
                "source_name": wrapper.get("source_name", "") if isinstance(wrapper, dict) else "",
            }
        except (ValueError, OSError, json.JSONDecodeError) as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    async def put_layout(fingerprint: str, request: Request):
        try:
            document_id = _safe_document_id(fingerprint)
            payload = await request.json()
            normalized, parsed = _validate_layout(payload.get("layout_json", "{}"))
            wrapper = {
                "version": 1,
                "document_id": document_id,
                "fingerprint": document_id.removeprefix("image:") if document_id.startswith("image:") else "",
                "source_name": _safe_name(payload.get("source_name") or "speech_bubble"),
                "saved_at": datetime.now(timezone.utc).isoformat(),
                "layout": parsed,
            }
            with _LAYOUT_LOCK:
                _write_text_atomic(
                    _layout_file(document_id),
                    json.dumps(wrapper, ensure_ascii=False, indent=2),
                )
            return {
                "ok": True,
                "document_id": document_id,
                "fingerprint": wrapper["fingerprint"],
                "layout_json": normalized,
                "saved_at": wrapper["saved_at"],
            }
        except (ValueError, OSError, json.JSONDecodeError) as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    async def delete_layout(fingerprint: str):
        try:
            path = _layout_file(_safe_document_id(fingerprint))
            with _LAYOUT_LOCK:
                existed = path.is_file()
                path.unlink(missing_ok=True)
            return {"ok": True, "deleted": existed}
        except (ValueError, OSError) as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    async def export_image(request: Request):
        client_token = ""
        try:
            payload = await request.json()
            _normalized_layout, parsed_layout = _validate_layout(payload.get("layout_json", "{}"))
            settings = public_settings()
            browser_canvas = _browser_canvas_export(payload, parsed_layout)
            if browser_canvas is None:
                image = _decode_data_url(payload.get("image_data_url"))
                composite, overlay, _ = render_composite(
                    image,
                    json.dumps(parsed_layout, ensure_ascii=False),
                    font_path=str(payload.get("font_path") or ""),
                    supersample=settings.supersample,
                )
                render_mode = "pillow_layout_v1"
            else:
                composite, overlay = browser_canvas
                render_mode = "browser_canvas_v1"

            now = datetime.now()
            prefix = _safe_name(payload.get("name") or "speech_bubble")
            extension = _output_extension(settings.output_format)
            client_save = payload.get("client_save") is True
            source_tab = str(payload.get("source_tab") or "").strip().lower()
            if client_save:
                _cleanup_stale_client_exports()
                client_token = uuid.uuid4().hex
                out_root = _client_export_dir(client_token)
                export_root = out_root
            else:
                out_root = output_root(source_tab)
                export_root = _dated_output_root(
                    out_root,
                    now,
                    settings.date_subfolder,
                )
            stem = _export_stem(
                prefix,
                now,
                settings.filename_format,
                export_root,
                extension,
            )

            with _SAVE_LOCK:
                export_root.mkdir(parents=True, exist_ok=True)
                composite_path = (
                    export_root / f"composite{extension}"
                    if client_save
                    else export_root / f"{stem}{extension}"
                )
                overlay_path = (
                    export_root / "overlay.png"
                    if client_save
                    else export_root / f"{stem}_overlay.png"
                )
                if not client_save and settings.backup_enabled:
                    _rotate_backups(composite_path, settings.backup_generations)
                    if settings.save_overlay:
                        _rotate_backups(overlay_path, settings.backup_generations)
                _write_image(
                    composite,
                    composite_path,
                    settings.output_format,
                    settings,
                )
                if settings.save_overlay:
                    _write_png(overlay, overlay_path, settings)

            if client_save:
                composite_url = (
                    f"/speech-bubble-forge/client-export/{client_token}/composite"
                )
                overlay_url = (
                    f"/speech-bubble-forge/client-export/{client_token}/overlay"
                    if settings.save_overlay
                    else None
                )
                relative_path = None
                filename = f"{stem}{extension}"
                overlay_filename = f"{stem}_overlay.png"
            else:
                relative_path = composite_path.relative_to(out_root)
                overlay_relative = overlay_path.relative_to(out_root)
                composite_url = _output_url("view", relative_path)
                overlay_url = (
                    _output_url("view", overlay_relative)
                    if settings.save_overlay
                    else None
                )
                filename = composite_path.name
                overlay_filename = overlay_path.name

            return {
                "ok": True,
                "filename": filename,
                "overlay_filename": overlay_filename if settings.save_overlay else None,
                "relative_path": relative_path.as_posix() if relative_path else None,
                "composite_url": composite_url,
                "download_url": (
                    composite_url
                    if client_save
                    else _output_url("output", relative_path)
                ),
                "overlay_url": overlay_url,
                "overlay_download_url": (
                    overlay_url
                    if client_save
                    else (
                        _output_url("output", overlay_relative)
                        if settings.save_overlay
                        else None
                    )
                ),
                "client_export_token": client_token or None,
                "client_save": client_save,
                "width": composite.width,
                "height": composite.height,
                "supersample": settings.supersample,
                "render_mode": render_mode,
                "save_overlay": settings.save_overlay,
                "output_format": settings.output_format,
                "output_dir": None if client_save else str(export_root),
            }
        except (ValueError, OSError, json.JSONDecodeError) as error:
            if client_token:
                _remove_client_export(client_token)
            raise HTTPException(status_code=400, detail=str(error)) from error
        except Exception as error:
            if client_token:
                _remove_client_export(client_token)
            raise HTTPException(
                status_code=500,
                detail=f"Speech Bubble export failed: {error}",
            ) from error

    routes = [
        ("/speech-bubble-forge/health", health, ["GET"]),
        ("/speech-bubble-forge/config", config, ["GET"]),
        ("/speech-bubble-forge/output/{filename:path}", output_file, ["GET"]),
        ("/speech-bubble-forge/view/{filename:path}", view_file, ["GET"]),
        (
            "/speech-bubble-forge/client-export/{token}/{kind}",
            client_export_file,
            ["GET"],
        ),
        (
            "/speech-bubble-forge/client-export/{token}",
            delete_client_export,
            ["DELETE"],
        ),
        ("/speech-bubble-forge/layout/{fingerprint}", get_layout, ["GET"]),
        ("/speech-bubble-forge/layout/{fingerprint}", put_layout, ["PUT"]),
        ("/speech-bubble-forge/layout/{fingerprint}", delete_layout, ["DELETE"]),
        ("/speech_bubble/fonts", fonts, ["GET"]),
        ("/speech_bubble/font-file/{font_id}", font_file, ["GET"]),
        ("/speech_bubble/frame-assets", frame_assets, ["GET"]),
        ("/speech_bubble/assets/sfx", sfx_assets, ["GET"]),
        ("/speech_bubble/assets/reload", reload_assets, ["POST"]),
        ("/speech-bubble-forge/user-assets", get_user_assets, ["GET"]),
        ("/speech-bubble-forge/user-assets", create_user_asset, ["POST"]),
        (
            "/speech-bubble-forge/user-assets/archive/organize",
            organize_user_asset_archive,
            ["POST"],
        ),
        (
            "/speech-bubble-forge/user-assets/asset/{asset_id}",
            user_asset_file,
            ["GET"],
        ),
        (
            "/speech-bubble-forge/user-assets/thumbnail/{asset_id}",
            user_asset_thumbnail,
            ["GET"],
        ),
        (
            "/speech-bubble-forge/user-assets/{preset_id}/image",
            replace_user_asset_image,
            ["PUT"],
        ),
        (
            "/speech-bubble-forge/user-assets/{preset_id}",
            update_user_asset,
            ["PATCH"],
        ),
        (
            "/speech-bubble-forge/user-assets/{preset_id}",
            delete_user_asset,
            ["DELETE"],
        ),
        ("/speech-bubble-forge/diagnostics", self_diagnostics, ["POST"]),
        ("/speech_bubble/presets", get_presets, ["GET"]),
        ("/speech_bubble/presets", post_presets, ["POST"]),
        ("/speech-bubble-forge/export", export_image, ["POST"]),
        # Compatibility alias for v0.2.x clients.
        ("/speech-bubble-forge/render", export_image, ["POST"]),
    ]
    for path, endpoint, methods in routes:
        method = methods[0]
        if not _route_exists(app, path, method):
            app.add_api_route(path, endpoint, methods=methods)

    print("[Speech Bubble Forge] Editor: /speech-bubble-forge/static/speech-bubble-editor.html")
    print(f"[Speech Bubble Forge] Output: {output_root()}")
    print(f"[Speech Bubble Forge] Layouts: {layout_root()}")
