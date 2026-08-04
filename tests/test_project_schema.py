from __future__ import annotations

import unittest

from speech_bubble_forge.project_schema import (
    ProjectSchemaError,
    default_layout,
    new_manifest,
    new_project_id,
    normalize_project_id,
    validate_layout,
    validate_manifest,
)


class ProjectSchemaTests(unittest.TestCase):
    def test_project_id(self):
        project_id = new_project_id()
        self.assertEqual(normalize_project_id(project_id), project_id)
        with self.assertRaises(ProjectSchemaError):
            normalize_project_id("standalone:bad")

    def test_default_layout(self):
        layout = validate_layout(default_layout())
        self.assertEqual(layout["version"], 5)
        self.assertEqual(
            set(layout["workspaces"]),
            {"single", "comic", "comic_layout"},
        )

    def test_manifest(self):
        manifest = new_manifest(title="Test")
        normalized = validate_manifest(manifest)
        self.assertEqual(normalized["title"], "Test")
        self.assertEqual(normalized["images"], [])
        self.assertEqual(normalized["image_trays"]["mode"], "shared")
        self.assertEqual(normalized["image_trays"]["forge_import"], "place")

    def test_manifest_without_image_trays_migrates_to_shared(self):
        manifest = new_manifest(title="Legacy")
        manifest.pop("image_trays")
        normalized = validate_manifest(manifest)
        self.assertEqual(normalized["image_trays"]["mode"], "shared")
        self.assertEqual(normalized["image_trays"]["shared"], [])

    def test_duplicate_layer_ids(self):
        layout = default_layout()
        layout["workspaces"]["single"]["elements"] = [
            {"id": "same", "type": "text"},
            {"id": "same", "type": "bubble"},
        ]
        with self.assertRaises(ProjectSchemaError):
            validate_layout(layout)


if __name__ == "__main__":
    unittest.main()
