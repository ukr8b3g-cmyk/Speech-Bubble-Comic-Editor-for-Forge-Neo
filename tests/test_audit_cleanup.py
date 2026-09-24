"""Behavior regressions for the 2026-09-24 audit; no Forge process is needed."""
import asyncio
import base64
import io
import json
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from PIL import Image, ImageChops

from speech_bubble_forge import api, asset_catalog, renderer, settings, project_api, background_removal_routes
from speech_bubble_forge.project_store import ProjectStore
from speech_bubble_forge.request_limits import read_bounded_body, read_bounded_json
from speech_bubble_forge.user_assets import _decode_image_data_url

PROJECT_ID = "project:11111111-1111-4111-8111-111111111111"


def request(chunks, declared=None):
    consumed = []
    async def stream():
        for chunk in chunks:
            consumed.append(chunk)
            yield chunk
    return SimpleNamespace(headers={} if declared is None else {"content-length": declared}, stream=stream), consumed


@pytest.mark.parametrize("declared,status", [("-1", 400), ("bad", 400), ("9", 413)])
def test_declared_body_limits_reject_before_reading(declared, status):
    req, consumed = request([b"{}"], declared)
    with pytest.raises(HTTPException) as error:
        asyncio.run(read_bounded_body(req, 8))
    assert error.value.status_code == status
    assert consumed == []


@pytest.mark.parametrize("declared", [None, "2"])
def test_chunked_body_limits_are_enforced_even_with_wrong_header(declared):
    req, consumed = request([b"1234", b"56789", b"unread"], declared)
    with pytest.raises(HTTPException) as error:
        asyncio.run(read_bounded_body(req, 8))
    assert error.value.status_code == 413
    assert len(consumed) == 2


@pytest.mark.parametrize("payload", [b"[]", b"null", b"true", b'"text"', b'{"n": NaN}', b'{"n": Infinity}', b"{", b"\xff"])
def test_json_rejects_non_objects_and_invalid_numbers(payload):
    req, _ = request([payload])
    with pytest.raises(HTTPException) as error:
        asyncio.run(read_bounded_json(req, 1024))
    assert error.value.status_code == 400


def test_json_empty_and_exact_limit():
    req, _ = request([])
    assert asyncio.run(read_bounded_json(req, 2)) == {}
    req, _ = request([b"{", b"}"])
    assert asyncio.run(read_bounded_json(req, 2)) == {}


@pytest.fixture
def client(tmp_path, monkeypatch):
    for module in (api, settings, project_api, background_removal_routes):
        monkeypatch.setattr(module, "data_root", lambda: tmp_path)
    monkeypatch.setattr(api, "output_root", lambda *args: tmp_path / "outputs")
    monkeypatch.setattr(api, "layout_root", lambda: tmp_path / "layouts")
    app = FastAPI()
    api.register_routes(app)
    with TestClient(app) as client:
        yield client


JSON_ROUTES = [
    ("POST", "/speech-bubble-forge/diagnostics"),
    ("POST", "/speech_bubble/presets"),
    ("PUT", "/speech-bubble-forge/layout/" + "a" * 64),
    ("POST", "/speech-bubble-forge/export"),
    ("POST", "/speech-bubble-forge/render"),
    ("POST", "/speech-bubble-forge/projects"),
    ("PUT", "/speech-bubble-forge/projects/" + PROJECT_ID),
    ("POST", "/speech-bubble-forge/user-assets"),
]


@pytest.mark.parametrize("method,url", JSON_ROUTES)
def test_all_json_routes_reject_oversize_and_wrong_root(client, method, url):
    response = client.request(method, url, content=b"{}", headers={"content-length": "999999999", "content-type": "application/json"})
    assert response.status_code == 413, response.text
    response = client.request(method, url, json=[])
    assert response.status_code == 400, response.text


def png_url():
    out = io.BytesIO()
    Image.new("RGBA", (8, 8), (80, 120, 200, 100)).save(out, "PNG")
    text = base64.b64encode(out.getvalue()).decode()
    return "data:image/png;base64," + "\r\n".join(text[n:n+16] for n in range(0, len(text), 16))


def test_data_url_crlf_is_supported_in_both_decoders():
    value = png_url()
    assert api._decode_data_url(value).size == (8, 8)
    assert _decode_image_data_url(value).image.size == (8, 8)
    with pytest.raises(ValueError):
        api._decode_data_url(value + "!")


@pytest.mark.parametrize("target", ["assets.json", "project.json", "publish"])
def test_failed_creation_leaves_no_partial_project_and_is_retryable(tmp_path, target):
    store = ProjectStore(tmp_path)
    real_write = store._atomic_json
    real_rename = Path.rename
    def fail_write(path, value):
        if path.name == target:
            raise OSError("injected write failure")
        real_write(path, value)
    def fail_publish(path, destination):
        if target == "publish" and path.name.startswith(".creating-"):
            raise OSError("injected publish failure")
        return real_rename(path, destination)
    with patch.object(store, "_atomic_json", side_effect=fail_write), patch.object(Path, "rename", fail_publish):
        with pytest.raises(OSError, match="injected"):
            store.create(project_id=PROJECT_ID)
    assert not store.exists(PROJECT_ID)
    assert list(tmp_path.iterdir()) == []
    assert store.create(project_id=PROJECT_ID)["project_id"] == PROJECT_ID
    assert store.load(PROJECT_ID)["images"] == []


def test_create_does_not_remove_existing_directory(tmp_path):
    store = ProjectStore(tmp_path)
    existing = tmp_path / PROJECT_ID.removeprefix("project:")
    existing.mkdir()
    marker = existing / "keep.txt"
    marker.write_text("existing user data")
    with pytest.raises(FileExistsError):
        store.create(project_id=PROJECT_ID)
    assert marker.read_text() == "existing user data"


def test_catalog_split_keeps_live_cache_references():
    assert renderer.get_frame_asset_catalog is asset_catalog.get_frame_asset_catalog
    assert renderer.get_sfx_asset_catalog is asset_catalog.get_sfx_asset_catalog
    before = json.dumps(asset_catalog.get_frame_asset_catalog(), sort_keys=True)
    renderer.rebuild_asset_caches()
    assert renderer._FRAME_PRESETS is asset_catalog._FRAME_PRESETS
    assert json.dumps(asset_catalog.get_frame_asset_catalog(), sort_keys=True) == before
    with patch.object(asset_catalog, "resolve_user_asset_path", return_value=Path("example.png")):
        assert asset_catalog._sfx_asset_path("user:" + "a" * 64) == "example.png"


def test_current_api_does_not_eagerly_import_pillow_renderer():
    result = subprocess.run([sys.executable, "-c", "import sys; import speech_bubble_forge.api; assert 'speech_bubble_forge.renderer' not in sys.modules"], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize("name", ["comic-editor.js", "comic-panels.js", "comic-editor.css"])
def test_historical_asset_urls_still_serve_only_isolated_assets(client, name):
    expected = (api.WEB_ROOT / "legacy" / name).read_bytes()
    response = client.get("/speech-bubble-forge/static/" + name + "?asset_path=../../LICENSE")
    assert response.status_code == 200
    assert response.content == expected


@pytest.mark.parametrize("style", ["overlap", "radiant"])
def test_bubble_decoration_is_rendered_before_element_opacity(style):
    element = {"type": "bubble", "shape": "oval", "x": 28, "y": 28, "w": 72, "h": 72, "tail": "none", "stroke_width": 3}
    base, _ = renderer.render_overlay(128, 128, {"elements": [element]}, supersample=1)
    decorated, _ = renderer.render_overlay(128, 128, {"elements": [{**element, "decoration_style": style}]}, supersample=1)
    assert ImageChops.difference(base, decorated).convert("RGB").getbbox() is not None
    faded, _ = renderer.render_overlay(128, 128, {"elements": [{**element, "decoration_style": style, "opacity": 0.5}]}, supersample=1)
    assert faded.getchannel("A").getextrema()[1] <= 127
