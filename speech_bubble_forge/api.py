from __future__ import annotations

import base64
import binascii
import io
import json
import mimetypes
import re
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps

from .font_catalog import font_by_id, public_fonts
from .presets import read_user_presets, update_user_presets
from .renderer import get_frame_asset_catalog, get_sfx_asset_catalog, render_composite
from .settings import (
    data_root,
    layout_root,
    output_root,
    public_settings,
    rebuild_all_caches,
)

EXTENSION_ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = EXTENSION_ROOT / "web"
_MAX_IMAGE_BYTES = 96 * 1024 * 1024
_MAX_LAYOUT_CHARS = 8 * 1024 * 1024
_SAVE_LOCK = threading.RLock()
_LAYOUT_LOCK = threading.RLock()
_FINGERPRINT_RE = re.compile(r"^[a-f0-9]{64}$")


def preset_path() -> Path:
    return data_root() / "config" / "speech-bubble-forge" / "presets.json"


def _decode_data_url(value):
    if not isinstance(value, str):
        raise ValueError("image_data_url is required")
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


def _safe_name(value):
    value = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(value or "")).strip("._")
    return value[:80] or "speech_bubble"


def _safe_fingerprint(value: str) -> str:
    fingerprint = str(value or "").strip().lower()
    if not _FINGERPRINT_RE.fullmatch(fingerprint):
        raise ValueError("Invalid image fingerprint")
    return fingerprint


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


def _write_png(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        image.save(temporary, format="PNG", compress_level=4)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


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


def _safe_output_file(filename: str) -> Path:
    root = output_root()
    candidate = (root / filename).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Output file not found") from error
    if not candidate.is_file():
        raise HTTPException(status_code=404, detail="Output file not found")
    return candidate


def _layout_file(fingerprint: str) -> Path:
    return layout_root() / f"{_safe_fingerprint(fingerprint)}.json"


def register_routes(app):
    """Register the standalone editor, asset APIs, settings API, layout store, and exporter."""
    if getattr(app.state, "speech_bubble_forge_registered", False):
        return
    app.state.speech_bubble_forge_registered = True

    output_root().mkdir(parents=True, exist_ok=True)
    layout_root().mkdir(parents=True, exist_ok=True)

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
            "version": "0.4.0",
            "settings": public_settings().as_dict(),
        }

    async def config():
        return {"ok": True, **public_settings().as_dict()}

    async def output_file(filename: str):
        path = _safe_output_file(filename)
        media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        return FileResponse(path, media_type=media_type, filename=path.name)

    async def view_file(filename: str):
        path = _safe_output_file(filename)
        media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        return FileResponse(path, media_type=media_type)

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
            fingerprint = _safe_fingerprint(fingerprint)
            path = _layout_file(fingerprint)
            if not path.is_file():
                return {"ok": True, "exists": False, "fingerprint": fingerprint, "layout_json": "{}"}
            with _LAYOUT_LOCK:
                wrapper = json.loads(path.read_text(encoding="utf-8"))
            layout = wrapper.get("layout", wrapper)
            normalized, _ = _validate_layout(layout)
            return {
                "ok": True,
                "exists": True,
                "fingerprint": fingerprint,
                "layout_json": normalized,
                "saved_at": wrapper.get("saved_at") if isinstance(wrapper, dict) else None,
                "source_name": wrapper.get("source_name", "") if isinstance(wrapper, dict) else "",
            }
        except (ValueError, OSError, json.JSONDecodeError) as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    async def put_layout(fingerprint: str, request: Request):
        try:
            fingerprint = _safe_fingerprint(fingerprint)
            payload = await request.json()
            normalized, parsed = _validate_layout(payload.get("layout_json", "{}"))
            wrapper = {
                "version": 1,
                "fingerprint": fingerprint,
                "source_name": _safe_name(payload.get("source_name") or "speech_bubble"),
                "saved_at": datetime.now(timezone.utc).isoformat(),
                "layout": parsed,
            }
            with _LAYOUT_LOCK:
                _write_text_atomic(
                    _layout_file(fingerprint),
                    json.dumps(wrapper, ensure_ascii=False, indent=2),
                )
            return {
                "ok": True,
                "fingerprint": fingerprint,
                "layout_json": normalized,
                "saved_at": wrapper["saved_at"],
            }
        except (ValueError, OSError, json.JSONDecodeError) as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    async def delete_layout(fingerprint: str):
        try:
            path = _layout_file(_safe_fingerprint(fingerprint))
            with _LAYOUT_LOCK:
                existed = path.is_file()
                path.unlink(missing_ok=True)
            return {"ok": True, "deleted": existed}
        except (ValueError, OSError) as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    async def export_image(request: Request):
        try:
            payload = await request.json()
            _normalized_layout, parsed_layout = _validate_layout(payload.get("layout_json", "{}"))
            settings = public_settings()
            image = _decode_data_url(payload.get("image_data_url"))
            composite, overlay, _ = render_composite(
                image,
                json.dumps(parsed_layout, ensure_ascii=False),
                font_path=str(payload.get("font_path") or ""),
                supersample=settings.supersample,
            )

            now = datetime.now()
            prefix = _safe_name(payload.get("name") or "speech_bubble")
            stem = f"{prefix}_{now:%Y%m%d_%H%M%S_%f}_{uuid.uuid4().hex[:8]}"
            out_root = output_root()

            with _SAVE_LOCK:
                out_root.mkdir(parents=True, exist_ok=True)
                composite_path = out_root / f"{stem}.png"
                overlay_path = out_root / f"{stem}_overlay.png"
                _write_png(composite, composite_path)
                if settings.save_overlay:
                    _write_png(overlay, overlay_path)

            return {
                "ok": True,
                "filename": composite_path.name,
                "composite_url": f"/speech-bubble-forge/view/{composite_path.name}",
                "download_url": f"/speech-bubble-forge/output/{composite_path.name}",
                "overlay_url": (
                    f"/speech-bubble-forge/view/{overlay_path.name}"
                    if settings.save_overlay
                    else None
                ),
                "overlay_download_url": (
                    f"/speech-bubble-forge/output/{overlay_path.name}"
                    if settings.save_overlay
                    else None
                ),
                "width": composite.width,
                "height": composite.height,
                "supersample": settings.supersample,
                "save_overlay": settings.save_overlay,
                "output_dir": str(out_root),
            }
        except (ValueError, OSError, json.JSONDecodeError) as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        except Exception as error:
            raise HTTPException(
                status_code=500,
                detail=f"Speech Bubble export failed: {error}",
            ) from error

    routes = [
        ("/speech-bubble-forge/health", health, ["GET"]),
        ("/speech-bubble-forge/config", config, ["GET"]),
        ("/speech-bubble-forge/output/{filename:path}", output_file, ["GET"]),
        ("/speech-bubble-forge/view/{filename:path}", view_file, ["GET"]),
        ("/speech-bubble-forge/layout/{fingerprint}", get_layout, ["GET"]),
        ("/speech-bubble-forge/layout/{fingerprint}", put_layout, ["PUT"]),
        ("/speech-bubble-forge/layout/{fingerprint}", delete_layout, ["DELETE"]),
        ("/speech_bubble/fonts", fonts, ["GET"]),
        ("/speech_bubble/font-file/{font_id}", font_file, ["GET"]),
        ("/speech_bubble/frame-assets", frame_assets, ["GET"]),
        ("/speech_bubble/assets/sfx", sfx_assets, ["GET"]),
        ("/speech_bubble/assets/reload", reload_assets, ["POST"]),
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
