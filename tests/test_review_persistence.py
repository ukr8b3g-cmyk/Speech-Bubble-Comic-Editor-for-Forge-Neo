"""Review regressions using temporary projects/output roots, never installed Forge data."""
import base64
import io
import json

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from PIL import Image

from speech_bubble_forge import api, settings, project_api, background_removal_routes
from speech_bubble_forge.project_schema import default_layout, ProjectSchemaError
from speech_bubble_forge.project_store import ProjectStore


def png(color="red"):
    stream = io.BytesIO()
    Image.new("RGBA", (8, 6), color).save(stream, "PNG")
    return stream.getvalue()


@pytest.mark.parametrize("missing", ["registry", "file"])
@pytest.mark.parametrize("workspace", ["single", "comic", "comic_layout", "tray_only"])
def test_missing_references_survive_load_save_reload(tmp_path, missing, workspace):
    store = ProjectStore(tmp_path)
    project_id = store.create(title="Keep my work")["project_id"]
    record = store.put_image(project_id, png(), name="keep.png")
    asset_id = record["id"]
    layout = default_layout()
    if workspace == "single":
        layer = {"id": "keep-layer", "type": "image", "image_asset_id": asset_id, "x": 10, "y": 20, "w": 80, "h": 60}
        layout["workspaces"]["single"]["elements"] = [layer]
        layout["elements"] = [layer]
    elif workspace != "tray_only":
        key = "comic" if workspace == "comic" else "general_comic"
        layout[key] = {"enabled": False, "images": [record], "tree": {"kind": "leaf", "id": "keep-panel", "image_id": asset_id}}
    trays = {"mode": "separate", "shared": [], "workspaces": {"single": [], "comic": [asset_id], "comic_layout": []}}
    store.save(project_id, title="Keep my work", layout=layout, image_ids=[asset_id], image_trays=trays)
    directory = tmp_path / project_id.removeprefix("project:")
    if missing == "registry":
        registry = directory / "assets.json"
        data = json.loads(registry.read_text(encoding="utf-8")); data["assets"] = []
        registry.write_text(json.dumps(data), encoding="utf-8")
    else:
        store.image_path(project_id, asset_id).unlink()
    before = {p.name: p.read_bytes() for p in directory.glob("*.json")}
    loaded = store.load(project_id)
    assert {p.name: p.read_bytes() for p in directory.glob("*.json")} == before, "GET/load must not rewrite original files"
    assert loaded["repair_warnings"]
    assert loaded["images"][0]["id"] == asset_id
    assert loaded["images"][0]["missing"] is True
    assert loaded["images"][0]["missing_reason"] == missing
    saved = store.save(project_id, title="Edited title", layout=loaded["layout"], image_ids=[asset_id], image_trays=loaded["image_trays"])
    assert saved["images"][0]["missing"] is True
    reloaded = store.load(project_id)
    assert reloaded["layout"] == layout
    assert reloaded["image_trays"] == loaded["image_trays"]
    assert reloaded["images"][0]["missing"] is True
    assert store.cleanup(project_id)["removed"] == []
    with pytest.raises(ProjectSchemaError, match="Unknown project image"):
        store.save(project_id, title="Reject invented missing IDs", layout=layout, image_ids=["forge-project-image:" + "f" * 64])
    assert store.put_image(project_id, png(), name="recovered.png")["id"] == asset_id
    recovered = store.load(project_id)
    assert not recovered.get("repair_warnings")
    assert not recovered["images"][0].get("missing")
    assert recovered["layout"] == layout


def test_output_urls_identify_the_actual_export_root(tmp_path, monkeypatch):
    for module in (api, settings, project_api, background_removal_routes):
        monkeypatch.setattr(module, "data_root", lambda: tmp_path)
    values = {
        "speech_bubble_forge_output_dir": "fixed",
        "speech_bubble_forge_use_forge_output_dir": False,
        "outdir_samples": "", "outdir_txt2img_samples": "txt", "outdir_img2img_samples": "img",
        "speech_bubble_forge_filename_format": "source_only",
        "speech_bubble_forge_date_subfolder": "none",
        "speech_bubble_forge_save_overlay_v2": True,
    }
    monkeypatch.setattr(settings, "get_setting", lambda name, default: values.get(name, default))
    color = ["red"]
    monkeypatch.setattr(api, "render_composite", lambda *a, **kw: (Image.new("RGBA", (8, 6), color[0]), Image.new("RGBA", (8, 6), color[0]), {}))
    app = FastAPI(); api.register_routes(app)
    request = {"image_data_url": "data:image/png;base64," + base64.b64encode(png()).decode(), "layout_json": "{}", "name": "same"}
    exported = []
    with TestClient(app) as client:
        for folder, tab, chosen in [("fixed", "txt2img", "red"), ("txt", "txt2img", "green"), ("img", "img2img", "blue")]:
            color[0] = chosen
            values["speech_bubble_forge_use_forge_output_dir"] = folder != "fixed"
            response = client.post("/speech-bubble-forge/export", json={**request, "source_tab": tab})
            assert response.status_code == 200, response.text
            exported.append((tmp_path / folder, response.json()))
        assert len({payload["filename"] for _, payload in exported}) == 1
        for root, payload in exported:
            for url_key, file_key in [("composite_url", "filename"), ("download_url", "filename"), ("overlay_url", "overlay_filename"), ("overlay_download_url", "overlay_filename")]:
                response = client.get(payload[url_key])
                assert response.status_code == 200, response.text
                assert response.content == (root / payload[file_key]).read_bytes()
        root, payload = exported[-1]
        root_id = api._output_root_id(root)
        assert client.get(payload["download_url"].split("?")[0] + "?root_id=unknown").status_code == 404
        outside = tmp_path / "outside.png"; outside.write_bytes(png())
        for filename in ["../outside.png", str(outside.resolve())]:
            with pytest.raises(HTTPException):
                api._safe_output_file(filename, root_id)
        with pytest.raises(HTTPException) as ambiguous:
            api._safe_output_file(payload["relative_path"])
        assert ambiguous.value.status_code == 409
