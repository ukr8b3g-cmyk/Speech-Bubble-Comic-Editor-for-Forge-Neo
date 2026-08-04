from __future__ import annotations

import json
import mimetypes
from pathlib import Path
from urllib.parse import unquote

from fastapi import HTTPException, Request
from fastapi.responses import FileResponse

from .project_schema import ProjectSchemaError, normalize_project_id
from .project_store import MAX_IMAGE_BYTES, ProjectStore
from .settings import data_root

MAX_PROJECT_REQUEST_BYTES = 32 * 1024 * 1024
PROJECT_API_VERSION = 1


def _store() -> ProjectStore:
    return ProjectStore(
        data_root() / "config" / "speech-bubble-forge" / "projects"
    )


def _route_exists(app, path: str, method: str) -> bool:
    target_method = method.upper()
    for route in app.routes:
        if getattr(route, "path", None) != path:
            continue
        if target_method in set(getattr(route, "methods", set()) or set()):
            return True
    return False


async def _bounded_body(request: Request, maximum: int) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            declared = int(content_length)
        except ValueError as error:
            raise ProjectSchemaError("Invalid Content-Length") from error
        if declared < 0 or declared > maximum:
            raise ProjectSchemaError("Request body is too large")
    output = bytearray()
    async for chunk in request.stream():
        output.extend(chunk)
        if len(output) > maximum:
            raise ProjectSchemaError("Request body is too large")
    return bytes(output)


async def _bounded_json(request: Request) -> dict:
    raw = await _bounded_body(request, MAX_PROJECT_REQUEST_BYTES)
    if not raw:
        return {}
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ProjectSchemaError("Request JSON is invalid") from error
    if not isinstance(value, dict):
        raise ProjectSchemaError("Request JSON must be an object")
    return value


def _http_error(error: Exception) -> HTTPException:
    if isinstance(error, FileNotFoundError):
        return HTTPException(status_code=404, detail=str(error))
    if isinstance(error, FileExistsError):
        return HTTPException(status_code=409, detail=str(error))
    if isinstance(error, (ProjectSchemaError, ValueError, OSError)):
        return HTTPException(status_code=400, detail=str(error))
    return HTTPException(status_code=500, detail=str(error))


def register_project_routes(app) -> None:
    """Register the isolated Comic Project Editor persistence API."""
    if getattr(app.state, "speech_bubble_project_routes_registered", False):
        return
    app.state.speech_bubble_project_routes_registered = True

    store = _store()
    store.root.mkdir(parents=True, exist_ok=True)

    async def list_projects():
        return {
            "ok": True,
            "api_version": PROJECT_API_VERSION,
            "projects": store.list(),
        }

    async def create_project(request: Request):
        try:
            payload = await _bounded_json(request)
            manifest = store.create(
                project_id=payload.get("project_id"),
                title=str(payload.get("title") or "Untitled Comic Project"),
                source_revisions=payload.get("source_revisions"),
            )
            return {"ok": True, "project": manifest}
        except Exception as error:
            raise _http_error(error) from error

    async def get_project(project_id: str):
        try:
            manifest = store.load(normalize_project_id(unquote(project_id)))
            return {"ok": True, "project": manifest}
        except Exception as error:
            raise _http_error(error) from error

    async def save_project(project_id: str, request: Request):
        try:
            normalized_id = normalize_project_id(unquote(project_id))
            payload = await _bounded_json(request)
            manifest = store.save(
                normalized_id,
                title=str(payload.get("title") or "Untitled Comic Project"),
                layout=payload.get("layout"),
                image_ids=payload.get("image_ids", []),
                image_trays=payload.get("image_trays"),
                source_revisions=payload.get("source_revisions"),
            )
            return {"ok": True, "project": manifest}
        except Exception as error:
            raise _http_error(error) from error

    async def delete_project(project_id: str):
        try:
            deleted = store.delete(normalize_project_id(unquote(project_id)))
            return {"ok": True, "deleted": deleted}
        except Exception as error:
            raise _http_error(error) from error

    async def upload_image(project_id: str, request: Request):
        try:
            normalized_id = normalize_project_id(unquote(project_id))
            raw = await _bounded_body(request, MAX_IMAGE_BYTES)
            name = unquote(
                str(request.headers.get("x-sbe-image-name") or "generated-image")
            )
            source_kind = str(
                request.headers.get("x-sbe-source-kind") or "forge-gallery"
            )
            source_tab = str(request.headers.get("x-sbe-source-tab") or "")
            asset = store.put_image(
                normalized_id,
                raw,
                name=name,
                source_kind=source_kind,
                source_tab=source_tab,
            )
            return {"ok": True, "asset": asset}
        except Exception as error:
            raise _http_error(error) from error

    async def project_image(project_id: str, asset_id: str):
        try:
            path = store.image_path(
                normalize_project_id(unquote(project_id)),
                unquote(asset_id),
            )
            media_type = mimetypes.guess_type(path.name)[0]
            return FileResponse(
                path,
                media_type=media_type or "application/octet-stream",
                headers={"Cache-Control": "private, max-age=31536000, immutable"},
            )
        except Exception as error:
            raise _http_error(error) from error

    async def cleanup_project(project_id: str):
        try:
            result = store.cleanup(normalize_project_id(unquote(project_id)))
            return {"ok": True, **result}
        except Exception as error:
            raise _http_error(error) from error

    routes = [
        ("/speech-bubble-forge/projects", list_projects, ["GET"]),
        ("/speech-bubble-forge/projects", create_project, ["POST"]),
        (
            "/speech-bubble-forge/projects/{project_id}",
            get_project,
            ["GET"],
        ),
        (
            "/speech-bubble-forge/projects/{project_id}",
            save_project,
            ["PUT"],
        ),
        (
            "/speech-bubble-forge/projects/{project_id}",
            delete_project,
            ["DELETE"],
        ),
        (
            "/speech-bubble-forge/projects/{project_id}/images",
            upload_image,
            ["POST"],
        ),
        (
            "/speech-bubble-forge/projects/{project_id}/images/{asset_id}",
            project_image,
            ["GET"],
        ),
        (
            "/speech-bubble-forge/projects/{project_id}/cleanup",
            cleanup_project,
            ["POST"],
        ),
    ]

    for path, endpoint, methods in routes:
        if not _route_exists(app, path, methods[0]):
            app.add_api_route(path, endpoint, methods=methods)
