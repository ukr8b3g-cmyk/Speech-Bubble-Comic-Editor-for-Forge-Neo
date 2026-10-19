"""v1.0.1 regression tests: export staging/rollback and corrupt saved layouts."""
from __future__ import annotations

import json
import os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from speech_bubble_forge import api
from speech_bubble_forge import settings as setting_module
from speech_bubble_forge import project_api, background_removal_routes


def _settings(*, overlay=True):
    return SimpleNamespace(
        output_format="png",
        save_overlay=overlay,
        backup_enabled=True,
        backup_generations=3,
        png_compression=6,
        jpeg_quality=95,
        webp_quality=90,
        webp_lossless=False,
    )


def _publish(folder: Path, *, overlay=True, keep_backups=True):
    settings = _settings(overlay=overlay)
    composite_path = folder / "sample.png"
    overlay_path = folder / "sample_overlay.png"
    api._save_export_outputs(
        composite_path, overlay_path,
        Image.new("RGBA", (4, 4), "red"),
        Image.new("RGBA", (4, 4), "blue"),
        b"new composite png", b"new overlay png",
        settings, keep_backups=keep_backups,
    )
    return composite_path, overlay_path


def _hidden_stages(folder: Path):
    return [x.name for x in folder.iterdir() if x.name.endswith((".staged", ".rollback"))]


def test_export_rotates_old_composite_and_overlay_only_after_staging(tmp_path):
    (tmp_path / "sample.png").write_bytes(b"old main")
    (tmp_path / "sample_overlay.png").write_bytes(b"old overlay")
    (tmp_path / "sample_backup_01.png").write_bytes(b"older main")
    (tmp_path / "sample_overlay_backup_01.png").write_bytes(b"older overlay")

    composite, overlay = _publish(tmp_path)

    assert composite.read_bytes() == b"new composite png"
    assert overlay.read_bytes() == b"new overlay png"
    assert (tmp_path / "sample_backup_01.png").read_bytes() == b"old main"
    assert (tmp_path / "sample_backup_02.png").read_bytes() == b"older main"
    assert (tmp_path / "sample_overlay_backup_01.png").read_bytes() == b"old overlay"
    assert (tmp_path / "sample_overlay_backup_02.png").read_bytes() == b"older overlay"
    assert not _hidden_stages(tmp_path)


def test_encoding_failure_leaves_both_originals_and_backup_history_unchanged(tmp_path):
    composite = tmp_path / "sample.png"
    overlay = tmp_path / "sample_overlay.png"
    composite.write_bytes(b"old main")
    overlay.write_bytes(b"old overlay")
    older = tmp_path / "sample_backup_01.png"
    older.write_bytes(b"old backup")
    with patch.object(api, "_write_image", side_effect=OSError("simulated PNG encoder failure")):
        with pytest.raises(OSError, match="simulated PNG"):
            api._save_export_outputs(
                composite, overlay,
                Image.new("RGBA", (2, 2), "red"),
                Image.new("RGBA", (2, 2), "blue"),
                b"prepared composite", None,
                _settings(), keep_backups=True,
            )
    assert composite.read_bytes() == b"old main"
    assert overlay.read_bytes() == b"old overlay"
    assert older.read_bytes() == b"old backup"
    assert not (tmp_path / "sample_overlay_backup_01.png").exists()
    assert not _hidden_stages(tmp_path)


def test_failure_installing_second_image_restores_both_primaries(tmp_path):
    composite, overlay = tmp_path / "sample.png", tmp_path / "sample_overlay.png"
    composite.write_bytes(b"old main")
    overlay.write_bytes(b"old overlay")
    actual_replace = os.replace

    def fail_second(source, target):
        if str(source).endswith(".staged") and Path(target) == overlay:
            raise OSError("simulated second-output failure")
        return actual_replace(source, target)

    with patch.object(api.os, "replace", side_effect=fail_second):
        with pytest.raises(OSError, match="second-output"):
            _publish(tmp_path)

    assert composite.read_bytes() == b"old main"
    assert overlay.read_bytes() == b"old overlay"
    assert not _hidden_stages(tmp_path)


def test_backup_failure_restores_originals_and_does_not_publish_new_images(tmp_path):
    composite, overlay = tmp_path / "sample.png", tmp_path / "sample_overlay.png"
    composite.write_bytes(b"old main")
    overlay.write_bytes(b"old overlay")
    original_rotate = api._rotate_backups

    def fail_overlay(path, generations):
        if path == overlay:
            raise OSError("simulated backup failure")
        return original_rotate(path, generations)

    with patch.object(api, "_rotate_backups", side_effect=fail_overlay):
        with pytest.raises(OSError, match="backup failure"):
            _publish(tmp_path)

    assert composite.read_bytes() == b"old main"
    assert overlay.read_bytes() == b"old overlay"
    assert not _hidden_stages(tmp_path)


def test_new_export_without_backups_does_not_create_archives(tmp_path):
    composite, overlay = _publish(tmp_path, keep_backups=False)
    assert composite.read_bytes() == b"new composite png"
    assert overlay.read_bytes() == b"new overlay png"
    assert not list(tmp_path.glob("*backup*"))
    assert not _hidden_stages(tmp_path)


@pytest.fixture
def client(tmp_path, monkeypatch):
    for module in (api, setting_module, project_api, background_removal_routes):
        monkeypatch.setattr(module, "data_root", lambda: tmp_path)
    monkeypatch.setattr(api, "output_root", lambda *args: tmp_path / "output")
    monkeypatch.setattr(api, "layout_root", lambda: tmp_path / "layouts")
    app = FastAPI()
    api.register_routes(app)
    with TestClient(app) as client:
        yield client


@pytest.mark.parametrize("broken", [
    b"[]", b"null", b"true", b"42", b'"str"',
    b'{"layout":[]}', b'{"layout":null}', b'{"elements":[null]}', b"{",
])
def test_corrupt_saved_layout_is_http_400_and_never_modified(client, tmp_path, broken):
    fingerprint = "a" * 64
    location = tmp_path / "layouts" / f"{fingerprint}.json"
    location.parent.mkdir(parents=True, exist_ok=True)
    location.write_bytes(broken)
    response = client.get(f"/speech-bubble-forge/layout/{fingerprint}")
    assert response.status_code == 400, response.text
    assert location.read_bytes() == broken


@pytest.mark.parametrize("saved", [
    {"elements": []},
    {"version": 1, "saved_at": "2026-10-01", "layout": {"elements": []}},
])
def test_existing_flat_and_wrapped_layouts_remain_readable(client, tmp_path, saved):
    fingerprint = "b" * 64
    location = tmp_path / "layouts" / f"{fingerprint}.json"
    location.parent.mkdir(parents=True, exist_ok=True)
    location.write_text(json.dumps(saved), encoding="utf-8")
    response = client.get(f"/speech-bubble-forge/layout/{fingerprint}")
    assert response.status_code == 200, response.text
    assert response.json()["exists"] is True
    assert json.loads(response.json()["layout_json"]) == {"elements": []}


def test_missing_saved_layout_still_returns_exists_false(client):
    response = client.get("/speech-bubble-forge/layout/" + "c" * 64)
    assert response.status_code == 200
    assert response.json()["exists"] is False
