from __future__ import annotations

from fastapi import HTTPException, Request
from fastapi.responses import Response

from .background_removal_service import (
    MAX_IMAGE_BYTES,
    BackgroundRemovalService,
)
from .settings import data_root


def _route_exists(app, path: str, method: str) -> bool:
    target = method.upper()
    return any(
        getattr(route, "path", None) == path
        and target in set(getattr(route, "methods", set()) or set())
        for route in app.routes
    )


async def _bounded_body(request: Request, maximum: int) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            declared = int(content_length)
        except ValueError as error:
            raise ValueError("Invalid Content-Length") from error
        if declared < 0 or declared > maximum:
            raise ValueError("画像が空、またはサイズが大きすぎます。")
    output = bytearray()
    async for chunk in request.stream():
        output.extend(chunk)
        if len(output) > maximum:
            raise ValueError("画像が空、またはサイズが大きすぎます。")
    return bytes(output)


def _http_error(error: Exception) -> HTTPException:
    if isinstance(error, FileNotFoundError):
        return HTTPException(status_code=409, detail=str(error))
    if isinstance(error, (ValueError, RuntimeError, OSError)):
        return HTTPException(status_code=400, detail=str(error))
    return HTTPException(status_code=500, detail=str(error))


def register_background_removal_routes(app) -> None:
    if getattr(app.state, "speech_bubble_background_routes_registered", False):
        return
    app.state.speech_bubble_background_routes_registered = True
    service = BackgroundRemovalService(
        data_root()
        / "config"
        / "speech-bubble-forge"
        / "models"
        / "background-removal"
    )
    app.state.speech_bubble_background_removal = service

    async def capabilities():
        return service.capabilities()

    async def model_status():
        return service.status()

    async def model_download():
        try:
            return service.start_download()
        except Exception as error:
            raise _http_error(error) from error

    async def model_cancel():
        return service.cancel_download()

    async def model_delete():
        try:
            return service.remove_model()
        except Exception as error:
            raise _http_error(error) from error

    async def infer(request: Request):
        try:
            raw = await _bounded_body(request, MAX_IMAGE_BYTES)
            mask, width, height = service.infer_mask(raw)
            return Response(
                content=mask,
                media_type="image/png",
                headers={
                    "Cache-Control": "no-store",
                    "X-SBE-Image-Width": str(width),
                    "X-SBE-Image-Height": str(height),
                },
            )
        except Exception as error:
            raise _http_error(error) from error

    routes = [
        (
            "/speech-bubble-forge/background-removal/capabilities",
            capabilities,
            ["GET"],
        ),
        ("/speech-bubble-forge/background-removal/model", model_status, ["GET"]),
        (
            "/speech-bubble-forge/background-removal/model/download",
            model_download,
            ["POST"],
        ),
        (
            "/speech-bubble-forge/background-removal/model/cancel",
            model_cancel,
            ["POST"],
        ),
        ("/speech-bubble-forge/background-removal/model", model_delete, ["DELETE"]),
        ("/speech-bubble-forge/background-removal/infer", infer, ["POST"]),
    ]
    for path, endpoint, methods in routes:
        if not _route_exists(app, path, methods[0]):
            app.add_api_route(path, endpoint, methods=methods)
