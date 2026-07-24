import base64
import io
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from speech_bubble_forge import api
from speech_bubble_forge import settings as settings_module
from speech_bubble_forge.api import (
    _dated_output_root,
    _export_stem,
    _rotate_backups,
    _write_image,
)


def _settings(**overrides):
    values = {
        "png_compression": 6,
        "jpeg_quality": 91,
        "webp_quality": 87,
        "webp_lossless": False,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_date_subfolder_modes():
    with TemporaryDirectory() as temporary:
        root = Path(temporary)
        now = datetime(2026, 7, 24, 12, 34, 56)
        assert _dated_output_root(root, now, "none") == root
        assert _dated_output_root(root, now, "year_month") == root / "2026-07"
        assert _dated_output_root(root, now, "year_month_day") == root / "2026-07-24"


def test_export_initial_defaults():
    assert settings_module.DEFAULT_PROMPT_EXPORT_LOCATION is True
    assert settings_module.DEFAULT_USE_FORGE_OUTPUT_DIR is True
    assert settings_module.DEFAULT_REMEMBER_EXPORT_DIRECTORY is True
    assert settings_module.DEFAULT_WEBP_LOSSLESS is False
    assert settings_module.DEFAULT_SAVE_OVERLAY is False


def test_browser_urls_follow_current_forge_origin():
    root = Path(__file__).resolve().parents[1]
    launcher = (root / "javascript" / "speech_bubble_forge.js").read_text(
        encoding="utf-8"
    )
    editor = (root / "web" / "speech-bubble-editor.html").read_text(
        encoding="utf-8"
    )
    for source in (launcher, editor):
        assert "127.0.0.1" not in source
        assert "localhost" not in source
        assert "7862" not in source
    assert "document.baseURI" in launcher
    assert "location.origin" in editor


def test_filename_modes_and_sequence():
    with TemporaryDirectory() as temporary:
        root = Path(temporary)
        now = datetime(2026, 7, 24, 12, 34, 56, 789)
        assert _export_stem("sample", now, "source_only", root, ".png") == "sample_edited"
        assert _export_stem("sample", now, "source_datetime", root, ".png").startswith(
            "sample_20260724_123456_"
        )
        assert _export_stem(
            "sample", now, "speech_bubble_datetime", root, ".png"
        ).startswith("speech_bubble_20260724_123456_")
        (root / "sample_0001.png").write_bytes(b"existing")
        assert _export_stem("sample", now, "source_sequence", root, ".png") == "sample_0002"


def test_backup_rotation():
    with TemporaryDirectory() as temporary:
        root = Path(temporary)
        target = root / "sample.png"
        target.write_bytes(b"current")
        (root / "sample_backup_01.png").write_bytes(b"previous")
        (root / "sample_backup_03.png").write_bytes(b"expired")
        _rotate_backups(target, 2)
        assert not target.exists()
        assert (root / "sample_backup_01.png").read_bytes() == b"current"
        assert (root / "sample_backup_02.png").read_bytes() == b"previous"
        assert not (root / "sample_backup_03.png").exists()


def test_output_encoders_and_overlay_png():
    with TemporaryDirectory() as temporary:
        root = Path(temporary)
        image = Image.new("RGBA", (8, 6), (255, 0, 0, 128))
        settings = _settings()
        paths = {
            "png": root / "sample.png",
            "jpeg": root / "sample.jpg",
            "webp": root / "sample.webp",
        }
        for image_format, path in paths.items():
            _write_image(image, path, image_format, settings)
            with Image.open(path) as written:
                assert written.size == (8, 6)
                if image_format == "jpeg":
                    assert written.mode == "RGB"
                assert written.format == {
                    "png": "PNG",
                    "jpeg": "JPEG",
                    "webp": "WEBP",
                }[image_format]


def test_forge_and_fixed_output_root_selection():
    with TemporaryDirectory() as temporary:
        root = Path(temporary)
        values = {
            "speech_bubble_forge_output_dir": "fixed",
            "speech_bubble_forge_use_forge_output_dir": True,
            "outdir_samples": "",
            "outdir_txt2img_samples": "txt",
            "outdir_img2img_samples": "img",
            "outdir_save": "manual",
        }
        with (
            patch.object(settings_module, "data_root", lambda: root),
            patch.object(
                settings_module,
                "get_setting",
                lambda name, default: values.get(name, default),
            ),
        ):
            assert settings_module.output_root("txt2img") == (root / "txt").resolve()
            assert settings_module.output_root("img2img") == (root / "img").resolve()
            values["outdir_samples"] = "common"
            assert settings_module.output_root("img2img") == (root / "common").resolve()
            values["speech_bubble_forge_use_forge_output_dir"] = False
            assert settings_module.output_root("txt2img") == (root / "fixed").resolve()


def test_export_directory_reset_version():
    with TemporaryDirectory() as temporary:
        root = Path(temporary)
        with (
            patch.object(settings_module, "data_root", lambda: root),
            patch.object(settings_module.time, "time_ns", lambda: 123456789),
        ):
            assert settings_module.export_directory_version() == "0"
            assert (
                settings_module.reset_export_directory_memory()
                == "前回の保存先をリセットしました"
            )
            assert settings_module.export_directory_version() == "123456789"


def test_export_routes_fixed_and_client_delivery():
    class PublicSettings(SimpleNamespace):
        def as_dict(self):
            return dict(self.__dict__)

    with TemporaryDirectory() as temporary:
        root = Path(temporary)
        output = root / "output"
        settings = PublicSettings(
            output_dir=str(output),
            prompt_export_location=False,
            filename_format="source_only",
            date_subfolder="none",
            backup_enabled=True,
            backup_generations=2,
            output_format="jpeg",
            png_compression=6,
            jpeg_quality=92,
            webp_quality=88,
            webp_lossless=False,
            window_width=1440,
            window_height=900,
            supersample=1,
            auto_save=True,
            keep_previous_layout=True,
            save_overlay=True,
            asset_cache_version="test",
            asset_cache_status="Ready",
        )
        source = Image.new("RGB", (12, 10), "navy")
        source_bytes = io.BytesIO()
        source.save(source_bytes, "PNG")
        image_data_url = (
            "data:image/png;base64,"
            + base64.b64encode(source_bytes.getvalue()).decode("ascii")
        )
        composite = Image.new("RGBA", (12, 10), (0, 128, 255, 255))
        overlay = Image.new("RGBA", (12, 10), (255, 0, 0, 100))
        output_root_calls = []

        with (
            patch.object(
                api,
                "output_root",
                lambda source_tab="": output_root_calls.append(source_tab) or output,
            ),
            patch.object(api, "data_root", lambda: root / "data"),
            patch.object(api, "layout_root", lambda: root / "layouts"),
            patch.object(api, "public_settings", lambda: settings),
            patch.object(
                api,
                "render_composite",
                lambda *args, **kwargs: (composite, overlay, {}),
            ),
        ):
            app = FastAPI()
            api.register_routes(app)
            client = TestClient(app)
            request = {
                "image_data_url": image_data_url,
                "layout_json": "{}",
                "name": "sample",
                "source_tab": "txt2img",
            }
            response = client.post("/speech-bubble-forge/export", json=request)
            assert response.status_code == 200
            payload = response.json()
            assert payload["filename"] == "sample_edited.jpg"
            assert output_root_calls[-1] == "txt2img"
            assert (output / "sample_edited.jpg").is_file()
            assert (output / "sample_edited_overlay.png").is_file()

            settings.output_format = "webp"
            settings.filename_format = "source_datetime"
            response = client.post(
                "/speech-bubble-forge/export",
                json={**request, "client_save": True},
            )
            assert response.status_code == 200
            payload = response.json()
            assert payload["filename"].endswith(".webp")
            assert client.get(payload["download_url"]).status_code == 200
            assert client.get(payload["overlay_download_url"]).status_code == 200
            token = payload["client_export_token"]
            assert client.delete(
                f"/speech-bubble-forge/client-export/{token}"
            ).json()["deleted"]
            assert client.get(payload["download_url"]).status_code == 404
