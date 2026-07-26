from __future__ import annotations

import asyncio
import io
import json
from unittest.mock import patch

import httpx
import pytest
from PIL import Image
from starlette.requests import Request as StarletteRequest

from speech_bubble_forge import api
from speech_bubble_forge.api import _safe_name, _validate_layout


def _png_bytes(size=(12, 10), color=(17, 34, 51, 255)):
    output = io.BytesIO()
    Image.new("RGBA", size, color).save(output, "PNG")
    return output.getvalue()


def test_safe_name_preserves_unicode_and_blocks_windows_names():
    assert _safe_name("画像") == "画像"
    assert _safe_name("こんにちは") == "こんにちは"
    assert _safe_name("test画像") == "test画像"
    assert _safe_name("../画像:01?.png") == "画像_01_.png"
    assert _safe_name("CON.txt") == "_CON.txt"
    assert _safe_name("   ") == "speech_bubble"


def test_layout_validation_rejects_malformed_elements_and_non_finite_values():
    with pytest.raises(ValueError, match="must be an object"):
        _validate_layout({"canvas": {"width": 1024, "height": 1024}, "elements": [None]})
    with pytest.raises(ValueError, match="unsupported type"):
        _validate_layout({"elements": [{"type": "unknown"}]})
    with pytest.raises(ValueError, match="non-finite"):
        _validate_layout({"elements": [{"type": "text", "x": float("nan")}]})
    with pytest.raises(ValueError, match="canvas width"):
        _validate_layout({"canvas": {"width": 0, "height": 1024}, "elements": []})
    with pytest.raises(ValueError, match="path point"):
        _validate_layout(
            {
                "elements": [
                    {
                        "type": "bubble",
                        "path_points": [{"x": 0, "y": 0}, None, {"x": 1, "y": 1}],
                    }
                ]
            }
        )
    with pytest.raises(ValueError, match="emphasis ray"):
        _validate_layout(
            {"elements": [{"type": "emphasis_lines", "rays": [[[0, 0], [1, 0]]]}]}
        )


def test_layout_validation_accepts_current_and_legacy_element_types():
    normalized, parsed = _validate_layout(
        {
            "version": 1,
            "canvas": {"width": 1024, "height": 1024},
            "elements": [
                {"type": "text", "text": "こんにちは"},
                {"type": "shape"},
                {"type": "sfx_stamp"},
                {"type": "frame"},
                {"type": "emphasis_lines", "rays": []},
            ],
        }
    )
    assert json.loads(normalized) == parsed


def test_multipart_export_parser_does_not_require_request_form_or_python_multipart():
    metadata = json.dumps(
        {
            "render_mode": "browser_canvas_v1",
            "layout_json": json.dumps({"canvas": {"width": 12, "height": 10}}),
            "name": "日本語画像",
            "client_save": True,
        },
        ensure_ascii=False,
    )
    outbound = httpx.Request(
        "POST",
        "http://testserver/speech-bubble-forge/export",
        files={
            "metadata": ("metadata.json", metadata.encode("utf-8"), "application/json"),
            "composite": ("composite.png", _png_bytes(), "image/png"),
        },
    )
    body = outbound.read()
    content_type = outbound.headers["content-type"]
    delivered = False

    async def receive():
        nonlocal delivered
        if delivered:
            return {"type": "http.request", "body": b"", "more_body": False}
        delivered = True
        return {"type": "http.request", "body": body, "more_body": False}

    request = StarletteRequest(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": "/speech-bubble-forge/export",
            "raw_path": b"/speech-bubble-forge/export",
            "query_string": b"",
            "headers": [
                (b"content-type", content_type.encode("latin-1")),
                (b"content-length", str(len(body)).encode("ascii")),
            ],
            "client": ("testclient", 50000),
            "server": ("testserver", 80),
        },
        receive,
    )

    async def forbidden_form(_request):
        raise AssertionError("request.form() must not be used")

    with patch.object(StarletteRequest, "form", forbidden_form):
        payload = asyncio.run(api._export_request_payload(request))

    assert payload["name"] == "日本語画像"
    assert payload["_composite_png"] == _png_bytes()
    assert payload["_overlay_png"] is None
