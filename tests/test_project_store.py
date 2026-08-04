from __future__ import annotations

import io
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from speech_bubble_forge.project_schema import default_layout
from speech_bubble_forge.project_store import ProjectStore


def png_bytes(color=(200, 20, 40, 255)) -> bytes:
    image = Image.new("RGBA", (8, 6), color)
    stream = io.BytesIO()
    image.save(stream, format="PNG")
    return stream.getvalue()


class ProjectStoreTests(unittest.TestCase):
    def test_create_upload_save_load_and_deduplicate(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = ProjectStore(Path(temporary))
            manifest = store.create(title="Comic")
            project_id = manifest["project_id"]

            first = store.put_image(
                project_id,
                png_bytes(),
                name="generated.png",
                source_tab="txt2img",
            )
            second = store.put_image(
                project_id,
                png_bytes(),
                name="duplicate.png",
                source_tab="txt2img",
            )
            self.assertEqual(first["id"], second["id"])

            saved = store.save(
                project_id,
                title="Comic",
                layout=default_layout(),
                image_ids=[first["id"]],
                image_trays={
                    "mode": "separate",
                    "forge_import": "tray_only",
                    "shared": [],
                    "workspaces": {
                        "single": [first["id"]],
                        "comic": [],
                        "comic_layout": [],
                    },
                },
            )
            self.assertEqual(len(saved["images"]), 1)
            self.assertEqual(saved["image_trays"]["mode"], "separate")
            self.assertEqual(saved["image_trays"]["forge_import"], "tray_only")

            loaded = store.load(project_id)
            self.assertEqual(loaded["images"][0]["id"], first["id"])
            self.assertTrue(store.image_path(project_id, first["id"]).is_file())

    def test_unused_blob_is_kept_until_cleanup(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = ProjectStore(Path(temporary))
            manifest = store.create(title="Comic")
            project_id = manifest["project_id"]
            asset = store.put_image(
                project_id,
                png_bytes(),
                name="generated.png",
            )
            store.save(
                project_id,
                title="Comic",
                layout=default_layout(),
                image_ids=[],
            )
            self.assertTrue(store.image_path(project_id, asset["id"]).is_file())
            result = store.cleanup(project_id)
            self.assertIn(asset["id"], result["removed"])


if __name__ == "__main__":
    unittest.main()
