from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from speech_bubble_forge.background_removal_service import (
    MODEL_NAME,
    MODEL_SIZE,
    BackgroundRemovalService,
)


class BackgroundRemovalServiceTests(unittest.TestCase):
    def test_missing_model_is_reported_without_starting_download(self):
        with tempfile.TemporaryDirectory() as temporary:
            model_directory = Path(temporary) / "models" / "background-removal"
            with patch.object(
                BackgroundRemovalService,
                "_runtime_status",
                return_value=(True, "onnxruntime", ""),
            ):
                service = BackgroundRemovalService(model_directory)
                status = service.status()
                self.assertEqual(status["model"], MODEL_NAME)
                self.assertEqual(status["size"], MODEL_SIZE)
                self.assertEqual(status["state"], "missing")
                self.assertFalse(status["ready"])
                self.assertIsNone(service._download_thread)
                self.assertFalse(model_directory.exists())

    def test_unavailable_runtime_has_reason(self):
        with tempfile.TemporaryDirectory() as temporary:
            with patch.object(
                BackgroundRemovalService,
                "_runtime_status",
                return_value=(False, "", "runtime missing"),
            ):
                service = BackgroundRemovalService(Path(temporary))
                status = service.status()
                self.assertEqual(status["state"], "unavailable")
                self.assertEqual(status["reason"], "runtime missing")


if __name__ == "__main__":
    unittest.main()
