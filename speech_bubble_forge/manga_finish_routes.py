"""Forge host adapter for the app's Manga Finish algorithm."""
import asyncio
from dataclasses import asdict
import logging

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse, Response

from .manga_finish_service import BusyError, MangaFinishService, UnavailableError
from .request_limits import read_bounded_body

log = logging.getLogger(__name__)
API_PATH = "/speech-bubble-forge/comic-conversion/manga-finish"


def parse_settings(query):
    from .manga_finish import MangaFinishSettings, validate_settings

    allowed = asdict(MangaFinishSettings())
    raw = {}
    for key, value in query.multi_items():
        if key not in allowed or key in raw:
            raise ValueError("Unknown or duplicate setting")
        if key in ("halftone", "white_lines", "auto_tone"):
            if value not in ("true", "false"):
                raise ValueError("Boolean must be true or false")
            raw[key] = value == "true"
        else:
            raw[key] = int(value) if key in ("screen_lines", "antialias") else float(value)
    return validate_settings(raw)


def register_manga_routes(app):
    if getattr(app.state, "speech_bubble_manga_finish", None) is not None:
        return
    service = MangaFinishService()
    app.state.speech_bubble_manga_finish = service
    # Forge registers extension routes on_app_started, after startup. Append a
    # shutdown callback; replacing the already-entered lifespan would not work.
    app.router.add_event_handler("shutdown", service.close)

    async def convert(request: Request):
        english = request.headers.get("X-SBE-Language") == "en"

        def error(status, code, ja, en):
            return JSONResponse(
                {"detail": en if english else ja, "code": code},
                status_code=status,
                headers={"Retry-After": "1"} if status == 429 else None,
            )

        try:
            # Lazy import: a missing/broken host OpenCV must not break the editor.
            from .manga_finish import MAX_BYTES, ImageTooLarge
            settings = parse_settings(request.query_params)
        except (ImportError, OSError):
            return error(503, "manga_finish_unavailable", "漫画仕上げを読み込めません。ForgeのOpenCV環境を確認してください。", "Manga Finish is unavailable. Check Forge's OpenCV environment.")
        except (ValueError, TypeError, OverflowError):
            return error(422, "invalid_settings", "仕上げ設定が不正です。", "Invalid finishing settings.")
        try:
            lease = service.reserve()
        except BusyError:
            return error(429, "manga_finish_busy", "前の処理の終了を待って再実行してください。", "Wait for the previous conversion and try again.")
        except UnavailableError:
            return error(503, "manga_finish_unavailable", "漫画仕上げを利用できません。", "Manga Finish is unavailable.")
        submitted = False
        try:
            raw = await asyncio.wait_for(read_bounded_body(request, MAX_BYTES, allow_empty=False), timeout=30)
            submitted = True
            result = await service.convert(lease, raw, settings)
            return Response(result.png, media_type="image/png", headers={
                "Cache-Control": "no-store",
                "X-SBE-Image-Width": str(result.width),
                "X-SBE-Image-Height": str(result.height),
                "X-SBE-Processing-Ms": str(round(result.elapsed_ms, 2)),
            })
        except ImageTooLarge:
            return error(413, "image_too_large", "画像サイズが上限を超えています。", "Image exceeds size limits.")
        except asyncio.TimeoutError:
            return error(408, "input_timeout", "画像の読み込みがタイムアウトしました。", "Image upload timed out.")
        except HTTPException as exc:
            return error(exc.status_code, "invalid_input", "画像データが空、不正、または容量上限を超えています。", str(exc.detail))
        except (ValueError, OSError):
            return error(400, "invalid_image", "画像を読み込めません。", "Invalid or unsupported image.")
        except Exception:
            log.exception("Manga Finish request failed")
            return error(500, "conversion_failed", "漫画仕上げに失敗しました。", "Manga finishing failed.")
        finally:
            if not submitted:
                service.release(lease)

    app.add_api_route(API_PATH, convert, methods=["POST"])
