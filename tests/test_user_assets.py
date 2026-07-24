import base64
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image, features

from speech_bubble_forge import api
from speech_bubble_forge import renderer
from speech_bubble_forge.user_assets import (
    USER_ASSET_RESIZE_SIDE,
    UserAssetError,
    UserAssetStore,
)


def image_data_url(
    size=(320, 240),
    *,
    image_format="PNG",
    transparent=True,
    animated=False,
):
    frames = []
    alpha = 160 if transparent else 255
    first = Image.new("RGBA", size, (230, 45, 70, alpha))
    if transparent:
        first.putpixel((0, 0), (0, 0, 0, 0))
    frames.append(first)
    output = io.BytesIO()
    if animated:
        second = Image.new("RGBA", size, (20, 130, 240, alpha))
        second.putpixel((0, 0), (0, 0, 0, 0) if transparent else (20, 130, 240, 255))
        first.save(
            output,
            format=image_format,
            save_all=True,
            append_images=[second],
            duration=80,
            loop=0,
            lossless=True,
        )
    else:
        save_options = {"lossless": True} if image_format == "WEBP" else {}
        first.save(output, format=image_format, **save_options)
    mime = "webp" if image_format == "WEBP" else "png"
    return f"data:image/{mime};base64,{base64.b64encode(output.getvalue()).decode('ascii')}"


def create_payload(name="ドン!!", category="sfx", **image_options):
    return {
        "name": name,
        "category": category,
        "original_name": f"{name}.png",
        "image_data_url": image_data_url(**image_options),
    }


def test_create_catalog_update_delete_and_asset_retention(tmp_path):
    store = UserAssetStore(tmp_path / "user-presets")
    created = store.create(create_payload())
    preset = created["preset"]

    assert created["revision"] == 1
    assert preset["category"] == "sfx"
    assert preset["has_alpha"] is True
    assert preset["asset_url"].startswith("/speech-bubble-forge/user-assets/asset/")
    asset_path = store.asset_path(preset["asset_id"])
    thumbnail_path = store.thumbnail_path(preset["asset_id"])
    assert asset_path and asset_path.is_file()
    assert thumbnail_path and thumbnail_path.is_file()

    updated = store.update(preset["id"], {"name": "ドン改", "category": "stamp"})
    assert updated["preset"]["name"] == "ドン改"
    assert updated["preset"]["category"] == "stamp"
    assert updated["revision"] == 2

    deleted = store.delete(preset["id"])
    assert deleted["asset_retained"] is True
    assert store.catalog()["presets"] == []
    assert asset_path.is_file()
    assert thumbnail_path.is_file()
    assert store.validate()["ok"] is True


def test_old_generations_move_to_archive_and_remain_resolvable(tmp_path):
    store = UserAssetStore(tmp_path / "user-presets")
    created = store.create(create_payload(name="Archive", size=(120, 80)))["preset"]
    old_asset_id = created["asset_id"]
    replaced = store.replace_image(
        created["id"],
        create_payload(name="ignored", size=(180, 120)),
    )["preset"]

    before = store.catalog()["archive"]
    assert before["pending_assets"] == 1
    assert before["old_generation_assets"] == 1

    result = store.organize_archive()
    assert result["moved_assets"] == 1
    assert result["moved_thumbnails"] == 1
    assert result["archive"]["pending_assets"] == 0
    assert result["archive"]["archived_assets"] == 1
    assert store.asset_path(old_asset_id).parent == store.archive_assets_dir
    assert store.thumbnail_path(old_asset_id).parent == store.archive_thumbnails_dir
    assert store.asset_path(replaced["asset_id"]).parent == store.assets_dir


def test_oversize_images_can_keep_original_size_or_resize(tmp_path):
    store = UserAssetStore(tmp_path)
    original = store.create(create_payload(name="Original", size=(1024, 400)))
    assert (original["preset"]["width"], original["preset"]["height"]) == (1024, 400)
    assert original["resized"] is False

    resized = store.create(
        {**create_payload(name="Resized", size=(1024, 400)), "resize_oversize": True}
    )
    assert max(resized["preset"]["width"], resized["preset"]["height"]) == USER_ASSET_RESIZE_SIDE
    assert resized["resized"] is True


def test_style_defaults_are_saved_and_can_be_reedited(tmp_path):
    store = UserAssetStore(tmp_path)
    style_defaults = {
        "mask_mode": True,
        "width": 195,
        "height": 180,
        "opacity": 0.75,
        "fill": "#ffffff",
        "stroke": "#ef4444",
        "stroke_width": 3,
        "shadow_enabled": True,
        "shadow_color": "#000000",
        "shadow_x": 8,
        "shadow_y": 10,
        "shadow_blur": 12,
        "glow_enabled": True,
        "glow_color": "#ffffff",
        "glow_opacity": 0.7,
        "glow_blur": 14,
        "glow_spread": 3,
    }
    created = store.create({**create_payload(name="Styled"), "style_defaults": style_defaults})
    assert created["preset"]["style_defaults"] == style_defaults

    updated = store.update(
        created["preset"]["id"],
        {"name": "Styled Again", "style_defaults": {"opacity": 0.5, "fill": "#facc15"}},
    )
    assert updated["preset"]["style_defaults"]["opacity"] == 0.5
    assert updated["preset"]["style_defaults"]["fill"] == "#facc15"
    assert updated["preset"]["style_defaults"]["shadow_enabled"] is True
    assert updated["preset"]["style_defaults"]["glow_enabled"] is True

    with pytest.raises(UserAssetError) as invalid_style:
        store.update(created["preset"]["id"], {"style_defaults": {"stroke_width": 101}})
    assert invalid_style.value.code == "invalid_style_defaults"


def test_opaque_images_require_explicit_confirmation(tmp_path):
    store = UserAssetStore(tmp_path)
    opaque = create_payload(name="Opaque", transparent=False)
    with pytest.raises(UserAssetError) as opaque_error:
        store.create(opaque)
    assert opaque_error.value.code == "opaque_confirmation_required"
    accepted = store.create({**opaque, "allow_opaque": True})
    assert accepted["preset"]["has_alpha"] is False


def test_duplicate_name_choices_and_image_replacement_are_versioned(tmp_path):
    store = UserAssetStore(tmp_path)
    first = store.create(create_payload(name="キラッ"))["preset"]
    with pytest.raises(UserAssetError) as duplicate_error:
        store.create(create_payload(name="キラッ", size=(200, 200)))
    assert duplicate_error.value.code == "duplicate_name"
    assert duplicate_error.value.details["suggested_name"] == "キラッ (2)"

    renamed = store.create({**create_payload(name="キラッ", size=(200, 200)), "conflict": "rename"})
    assert renamed["preset"]["name"] == "キラッ (2)"

    old_asset_id = first["asset_id"]
    conflict_replaced = store.create(
        {**create_payload(name="キラッ", size=(220, 180)), "conflict": "replace"}
    )
    assert conflict_replaced["preset"]["id"] == first["id"]
    assert conflict_replaced["preset"]["asset_id"] != old_asset_id
    assert len(store.catalog()["presets"]) == 2
    assert store.asset_path(old_asset_id).is_file(), "old asset must remain after name-conflict replacement"

    previous_asset_id = conflict_replaced["preset"]["asset_id"]
    replaced = store.replace_image(
        first["id"],
        create_payload(name="ignored", size=(180, 300), image_format="PNG"),
    )
    assert replaced["preset"]["id"] == first["id"]
    assert replaced["preset"]["asset_id"] != previous_asset_id
    assert store.asset_path(previous_asset_id).is_file(), "previous asset must remain for saved layouts"


def test_static_webp_supported_and_animated_webp_rejected(tmp_path):
    if not features.check("webp"):
        pytest.skip("Pillow was built without WebP support")
    store = UserAssetStore(tmp_path)
    static = store.create(create_payload(name="WebP", image_format="WEBP"))
    assert static["preset"]["format"] == "webp"

    try:
        animated_url = image_data_url(image_format="WEBP", animated=True)
    except OSError:
        pytest.skip("Pillow was built without animated WebP support")
    with pytest.raises(UserAssetError) as error:
        store.create({"name": "Animated", "category": "sfx", "image_data_url": animated_url})
    assert error.value.code == "animated_image"


def test_invalid_conflict_action_is_rejected_without_creating_duplicate(tmp_path):
    store = UserAssetStore(tmp_path)
    store.create(create_payload(name="Conflict"))
    with pytest.raises(UserAssetError) as create_error:
        store.create({**create_payload(name="Conflict", size=(200, 120)), "conflict": "unknown"})
    assert create_error.value.code == "invalid_conflict_action"
    assert len(store.catalog()["presets"]) == 1


def test_invalid_ids_format_mismatch_and_corrupt_index_are_rejected(tmp_path):
    store = UserAssetStore(tmp_path)
    with pytest.raises(UserAssetError) as invalid_id:
        store.asset_path("../../outside")
    assert invalid_id.value.code == "invalid_asset_id"

    png_url = image_data_url()
    mismatched = png_url.replace("data:image/png", "data:image/webp", 1)
    with pytest.raises(UserAssetError) as format_error:
        store.create({"name": "Mismatch", "category": "sfx", "image_data_url": mismatched})
    assert format_error.value.code == "format_mismatch"

    store.ensure_directories()
    store.index_path.write_text("{broken", encoding="utf-8")
    with pytest.raises(UserAssetError) as index_error:
        store.catalog()
    assert index_error.value.code == "index_invalid"
    assert store.index_path.read_text(encoding="utf-8") == "{broken"


def test_renderer_uses_immutable_user_asset_id(tmp_path):
    store = UserAssetStore(tmp_path)
    created = store.create(create_payload(size=(64, 48)))["preset"]
    asset = store.asset_path(created["asset_id"])
    layer = Image.new("RGBA", (160, 120), (0, 0, 0, 0))
    element = {
        "type": "sfx",
        "asset_id": f"user-preset:{created['id']}",
        "user_asset_id": created["asset_id"],
        "mask_mode": False,
        "x": 20,
        "y": 20,
        "w": 96,
        "h": 72,
        "stroke_width": 0,
        "opacity": 1,
    }
    with patch.object(renderer, "resolve_user_asset_path", return_value=asset):
        renderer._draw_sfx_stamp(layer, element, 1)
    assert layer.getbbox() is not None
    assert layer.getchannel("A").getextrema()[1] > 0


def test_renderer_fill_mode_recolors_user_asset(tmp_path):
    store = UserAssetStore(tmp_path)
    created = store.create(create_payload(size=(64, 48)))["preset"]
    asset = store.asset_path(created["asset_id"])
    layer = Image.new("RGBA", (160, 120), (0, 0, 0, 0))
    element = {
        "type": "sfx",
        "asset_id": f"user-preset:{created['id']}",
        "user_asset_id": created["asset_id"],
        "mask_mode": True,
        "fill": "#00ff00",
        "x": 20,
        "y": 20,
        "w": 96,
        "h": 72,
        "stroke_width": 0,
        "opacity": 1,
    }
    with patch.object(renderer, "resolve_user_asset_path", return_value=asset):
        renderer._draw_sfx_stamp(layer, element, 1)
    red, green, blue, alpha = layer.getpixel((40, 40))
    assert green > red and green > blue and alpha > 0


def test_user_asset_api_round_trip(tmp_path):
    store = UserAssetStore(tmp_path / "presets")
    app = FastAPI()
    output = tmp_path / "output"
    layouts = tmp_path / "layouts"
    client_exports = tmp_path / "client-export"
    with (
        patch.object(api, "default_user_asset_store", return_value=store),
        patch.object(api, "output_root", return_value=output),
        patch.object(api, "layout_root", return_value=layouts),
        patch.object(api, "_client_export_root", return_value=client_exports),
        patch.object(api, "_cleanup_stale_client_exports", return_value=None),
    ):
        api.register_routes(app)
        client = TestClient(app)
        created = client.post("/speech-bubble-forge/user-assets", json=create_payload()).json()
        assert created["ok"] is True
        preset = created["preset"]

        catalog = client.get("/speech-bubble-forge/user-assets")
        assert catalog.status_code == 200
        assert catalog.json()["counts"] == {"sfx": 1, "stamp": 0}

        image_response = client.get(f"/speech-bubble-forge/user-assets/asset/{preset['asset_id']}")
        assert image_response.status_code == 200
        assert image_response.headers["cache-control"].endswith("immutable")

        updated = client.patch(
            f"/speech-bubble-forge/user-assets/{preset['id']}",
            json={"name": "API Stamp", "category": "stamp"},
        )
        assert updated.status_code == 200
        assert updated.json()["preset"]["category"] == "stamp"

        deleted = client.delete(f"/speech-bubble-forge/user-assets/{preset['id']}")
        assert deleted.status_code == 200
        assert deleted.json()["asset_retained"] is True
        organized = client.post("/speech-bubble-forge/user-assets/archive/organize")
        assert organized.status_code == 200
        assert organized.json()["archive"]["archived_assets"] == 1
        archived_image = client.get(f"/speech-bubble-forge/user-assets/asset/{preset['asset_id']}")
        assert archived_image.status_code == 200

        invalid = client.get("/speech-bubble-forge/user-assets/asset/not-valid")
        assert invalid.status_code == 400

        oversized = client.post(
            "/speech-bubble-forge/user-assets",
            content=b"x" * (api._USER_ASSET_REQUEST_MAX_BYTES + 1),
            headers={"content-type": "application/json"},
        )
        assert oversized.status_code == 413
