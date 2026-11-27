from __future__ import annotations

from fastapi import HTTPException, Request
from fastapi.responses import Response

from .background_removal_service import (
    MAX_IMAGE_BYTES,
    MODELS,
    MODEL_NAME,
    BackgroundRemovalService,
)
from .settings import data_root
from .request_limits import read_bounded_body, read_bounded_json


def _route_exists(app, path: str, method: str) -> bool:
    target = method.upper()
    return any(
        getattr(route, "path", None) == path
        and target in set(getattr(route, "methods", set()) or set())
        for route in app.routes
    )


async def _bounded_body(request: Request, maximum: int) -> bytes:
    return await read_bounded_body(request, maximum)


def _http_error(error: Exception) -> HTTPException:
    if isinstance(error, HTTPException):
        return error
    if isinstance(error, FileNotFoundError):
        return HTTPException(status_code=409, detail=str(error))
    if isinstance(error, (ValueError, RuntimeError, OSError)):
        return HTTPException(status_code=400, detail=str(error))
    return HTTPException(status_code=500, detail=str(error))


def register_background_removal_routes(app) -> None:
    if getattr(app.state, "speech_bubble_background_routes_registered", False):
        return
    app.state.speech_bubble_background_routes_registered = True
    directory = (
        data_root()
        / "config"
        / "speech-bubble-forge"
        / "models"
        / "background-removal"
    )
    services = {name: BackgroundRemovalService(directory, name) for name in MODELS}
    app.state.speech_bubble_background_removal = services[MODEL_NAME]

    def selected(model: str | None):
        if model is not None and model not in services:
            raise HTTPException(status_code=400, detail="Unknown background removal model")
        return services[model if model is not None else MODEL_NAME]

    async def capabilities(model: str | None = None):
        return selected(model).capabilities()

    async def model_status(model: str | None = None):
        return selected(model).status()

    async def model_download(request: Request, model: str | None = None):
        service = selected(model)
        if model is not None:
            body = await read_bounded_json(request, 1024)
            if body.get("confirmed") is not True:
                raise HTTPException(status_code=400, detail="Confirm the model download first")
        try:
            return service.start_download()
        except Exception as error:
            raise _http_error(error) from error

    async def model_cancel(model: str | None = None):
        return selected(model).cancel_download()

    async def model_delete(model: str | None = None):
        service = selected(model)
        try:
            return service.remove_model()
        except Exception as error:
            raise _http_error(error) from error

    async def infer(request: Request, model: str | None = None):
        service = selected(model)
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
