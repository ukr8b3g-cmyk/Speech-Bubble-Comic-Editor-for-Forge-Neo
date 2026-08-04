from __future__ import annotations

import hashlib
import importlib
import io
import os
import threading
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps


MODEL_NAME = "isnet-anime"
MODEL_FILENAME = "isnet-anime.onnx"
MODEL_URL = (
    "https://github.com/danielgatis/rembg/releases/download/v0.0.0/"
    "isnet-anime.onnx"
)
MODEL_SHA256 = "f15622d853e8260172812b657053460e20806f04b9e05147d49af7bed31a6e99"
MODEL_SIZE = 176_069_933
MODEL_SOURCE_URL = "https://github.com/SkyTNT/anime-segmentation"
MODEL_LICENSE = "Apache-2.0"
MAX_IMAGE_BYTES = 96 * 1024 * 1024
MAX_IMAGE_PIXELS = 100_000_000


class DownloadCancelled(RuntimeError):
    pass


class BackgroundRemovalService:
    """Forge-hosted isnet-anime model lifecycle and mask inference."""

    def __init__(self, model_directory: Path):
        self.model_directory = Path(model_directory)
        self.model_path = self.model_directory / MODEL_FILENAME
        self.partial_path = self.model_directory / f"{MODEL_FILENAME}.part"
        self._state_lock = threading.RLock()
        self._inference_lock = threading.Lock()
        self._cancel = threading.Event()
        self._download_thread: threading.Thread | None = None
        self._session = None
        self._state = "ready" if self._valid_model() else "missing"
        self._downloaded = MODEL_SIZE if self._state == "ready" else 0
        self._total = MODEL_SIZE
        self._error = ""

    @staticmethod
    def _runtime_status() -> tuple[bool, str, str]:
        try:
            runtime = importlib.import_module("onnxruntime")
            importlib.import_module("numpy")
        except Exception as error:
            return False, "", f"ONNX Runtimeを読み込めませんでした: {error}"
        providers = set(runtime.get_available_providers())
        if "CUDAExecutionProvider" in providers:
            return True, "onnxruntime-gpu", ""
        if "CPUExecutionProvider" in providers:
            return True, "onnxruntime", ""
        return False, "", "利用可能なONNX Runtime実行プロバイダーがありません。"

    @staticmethod
    def _file_sha256(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def _valid_model(self) -> bool:
        try:
            return (
                self.model_path.stat().st_size == MODEL_SIZE
                and self._file_sha256(self.model_path) == MODEL_SHA256
            )
        except OSError:
            return False

    def capabilities(self) -> dict:
        available, runtime, reason = self._runtime_status()
        with self._state_lock:
            model_ready = self._state == "ready"
        return {
            "ok": True,
            "available": available,
            "runtime": runtime,
            "reason": reason,
            "model_ready": model_ready,
            "model": MODEL_NAME,
        }

    def status(self) -> dict:
        available, runtime, reason = self._runtime_status()
        with self._state_lock:
            active = bool(self._download_thread and self._download_thread.is_alive())
            state = "downloading" if active else self._state
            if not available and not active:
                state = "unavailable"
            total = max(1, int(self._total or MODEL_SIZE))
            downloaded = max(0, int(self._downloaded))
            return {
                "ok": True,
                "available": available,
                "runtime": runtime,
                "reason": reason,
                "model": MODEL_NAME,
                "filename": MODEL_FILENAME,
                "state": state,
                "ready": available and state == "ready",
                "downloaded": downloaded,
                "total": total,
                "progress": min(1.0, downloaded / total),
                "error": self._error or reason,
                "path": str(self.model_path),
                "size": MODEL_SIZE,
                "sha256": MODEL_SHA256,
                "download_url": MODEL_URL,
                "source_url": MODEL_SOURCE_URL,
                "license": MODEL_LICENSE,
            }

    def start_download(self) -> dict:
        available, _, reason = self._runtime_status()
        if not available:
            raise RuntimeError(reason)
        with self._state_lock:
            if self._valid_model():
                self._state = "ready"
                self._downloaded = MODEL_SIZE
                self._error = ""
                return self.status()
            if self._download_thread and self._download_thread.is_alive():
                return self.status()
            self._cancel.clear()
            self._state = "downloading"
            self._downloaded = 0
            self._total = MODEL_SIZE
            self._error = ""
            self._download_thread = threading.Thread(
                target=self._download_model,
                name="speech-bubble-forge-background-model-download",
                daemon=True,
            )
            self._download_thread.start()
            return self.status()

    def cancel_download(self) -> dict:
        self._cancel.set()
        return self.status()

    def _download_model(self) -> None:
        try:
            self.model_directory.mkdir(parents=True, exist_ok=True)
            try:
                self.partial_path.unlink()
            except FileNotFoundError:
                pass
            request = urllib.request.Request(
                MODEL_URL,
                headers={"User-Agent": "SpeechBubbleComicStudioForgeNeo/0.6.0"},
            )
            digest = hashlib.sha256()
            with (
                urllib.request.urlopen(request, timeout=60) as response,
                self.partial_path.open("wb") as output,
            ):
                header_total = int(response.headers.get("Content-Length") or MODEL_SIZE)
                with self._state_lock:
                    self._total = header_total
                while True:
                    if self._cancel.is_set():
                        raise DownloadCancelled(
                            "モデルのダウンロードをキャンセルしました。"
                        )
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    digest.update(chunk)
                    with self._state_lock:
                        self._downloaded += len(chunk)
                output.flush()
                os.fsync(output.fileno())
            if self.partial_path.stat().st_size != MODEL_SIZE:
                raise ValueError("モデルのファイルサイズが一致しません。")
            if digest.hexdigest() != MODEL_SHA256:
                raise ValueError("モデルのSHA-256が一致しません。")
            os.replace(self.partial_path, self.model_path)
            with self._state_lock:
                self._state = "ready"
                self._downloaded = MODEL_SIZE
                self._total = MODEL_SIZE
                self._error = ""
        except DownloadCancelled as error:
            with self._state_lock:
                self._state = "missing"
                self._downloaded = 0
                self._error = str(error)
        except Exception as error:
            with self._state_lock:
                self._state = "error"
                self._downloaded = 0
                self._error = f"モデルを取得できませんでした: {error}"
        finally:
            try:
                self.partial_path.unlink()
            except FileNotFoundError:
                pass

    def remove_model(self) -> dict:
        with self._state_lock:
            if self._download_thread and self._download_thread.is_alive():
                raise RuntimeError("ダウンロード中はモデルを削除できません。")
            self._session = None
            for path in (self.model_path, self.partial_path):
                try:
                    path.unlink()
                except FileNotFoundError:
                    pass
            self._state = "missing"
            self._downloaded = 0
            self._error = ""
            return self.status()

    def _load_session(self):
        if not self._valid_model():
            raise FileNotFoundError(
                "背景削除モデルがありません。最初にモデルを取得してください。"
            )
        if self._session is None:
            try:
                import onnxruntime as ort
            except ImportError as error:
                raise RuntimeError("ONNX Runtimeを読み込めませんでした。") from error
            providers = set(ort.get_available_providers())
            requested = (
                ["CUDAExecutionProvider", "CPUExecutionProvider"]
                if "CUDAExecutionProvider" in providers
                else ["CPUExecutionProvider"]
            )
            options = ort.SessionOptions()
            options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            options.intra_op_num_threads = max(1, min(8, os.cpu_count() or 1))
            self._session = ort.InferenceSession(
                str(self.model_path),
                sess_options=options,
                providers=requested,
            )
        return self._session

    def infer_mask(self, raw: bytes) -> tuple[bytes, int, int]:
        if not raw or len(raw) > MAX_IMAGE_BYTES:
            raise ValueError("画像が空、またはサイズが大きすぎます。")
        try:
            source = Image.open(io.BytesIO(raw))
            source.load()
            source = ImageOps.exif_transpose(source).convert("RGB")
        except Exception as error:
            raise ValueError("画像を読み込めませんでした。") from error
        if source.width * source.height > MAX_IMAGE_PIXELS:
            raise ValueError("画像の解像度が大きすぎます。")

        import numpy as np

        resized = source.resize((1024, 1024), Image.Resampling.LANCZOS)
        image_array = np.asarray(resized, dtype=np.float32)
        image_array /= max(float(np.max(image_array)), 1e-6)
        image_array[:, :, 0] -= 0.485
        image_array[:, :, 1] -= 0.456
        image_array[:, :, 2] -= 0.406
        tensor = np.expand_dims(image_array.transpose((2, 0, 1)), 0).astype(
            np.float32
        )

        with self._inference_lock:
            session = self._load_session()
            output = session.run(None, {session.get_inputs()[0].name: tensor})[0]
        prediction = np.asarray(output[:, 0, :, :], dtype=np.float32)
        minimum = float(np.min(prediction))
        maximum = float(np.max(prediction))
        if maximum - minimum > 1e-6:
            prediction = (prediction - minimum) / (maximum - minimum)
        else:
            prediction.fill(0)
        mask = Image.fromarray(
            (np.squeeze(prediction) * 255).astype(np.uint8), mode="L"
        )
        mask = mask.resize(source.size, Image.Resampling.LANCZOS)
        stream = io.BytesIO()
        mask.save(stream, format="PNG", optimize=True)
        return stream.getvalue(), source.width, source.height
