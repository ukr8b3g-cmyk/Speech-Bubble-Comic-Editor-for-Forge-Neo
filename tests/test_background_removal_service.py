from __future__ import annotations

import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from speech_bubble_forge.background_removal_routes import register_background_removal_routes

from speech_bubble_forge.background_removal_service import (
    MODEL_NAME,
    MODEL_SIZE,
    BackgroundRemovalService,
)


class BackgroundRemovalServiceTests(unittest.TestCase):
    def test_model_specific_download_requires_confirmation(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch("speech_bubble_forge.background_removal_routes.data_root", return_value=Path(directory)):
                app = FastAPI()
                register_background_removal_routes(app)
            route = "/speech-bubble-forge/background-removal/model"
            with TestClient(app) as client, patch.object(BackgroundRemovalService, "start_download", autospec=True, return_value={}) as download:
                self.assertEqual(client.get(route).json()["model"], "isnet-anime")
                self.assertEqual(client.get(route, params={"model": "unknown"}).status_code, 400)
                for payload in [{}, {"confirmed": False}, {"confirmed": "true"}]:
                    response = client.post(route + "/download?model=inspyrenet", json=payload)
                    self.assertEqual(response.status_code, 400)
                download.assert_not_called()
                self.assertEqual(client.post(route + "/download?model=inspyrenet", json={"confirmed": True}).status_code, 200)
                self.assertEqual(download.call_args.args[0].model_name, "inspyrenet")

    def test_inspyrenet_normalization_and_soft_alpha(self):
        with tempfile.TemporaryDirectory() as directory:
            service = BackgroundRemovalService(Path(directory), "inspyrenet")
            source = BytesIO()
            Image.new("RGB", (37, 19), (125, 100, 25)).save(source, "PNG")
            session = MagicMock()
            session.get_inputs.return_value[0].name = "input"
            session.run.return_value = [np.full((1, 1, 4, 4), 0.75, dtype=np.float32)]
            with patch.object(service, "_load_session", return_value=session):
                result, width, height = service.infer_mask(source.getvalue())
            tensor = session.run.call_args.args[1]["input"]
            np.testing.assert_allclose(tensor[0, :, 0, 0],
                ((np.array([125, 100, 25]) / 255) - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225], atol=1e-6)
            with Image.open(BytesIO(result)) as mask:
                self.assertEqual((width, height), (37, 19))
                self.assertEqual(mask.size, (37, 19))
                self.assertEqual(mask.getextrema(), (191, 191))

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
