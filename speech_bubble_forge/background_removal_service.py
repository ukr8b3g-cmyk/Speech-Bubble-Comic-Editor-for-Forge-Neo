from __future__ import annotations

import hashlib
import importlib
import io
import os
import threading
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from . import __version__

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


@dataclass(frozen=True)
class ModelSpec:
    label: str
    filename: str
    url: str
    sha256: str
    size: int
    source_url: str
    license: str


MODELS = {
    MODEL_NAME: ModelSpec(MODEL_NAME, MODEL_FILENAME, MODEL_URL, MODEL_SHA256, MODEL_SIZE, MODEL_SOURCE_URL, MODEL_LICENSE),
    "inspyrenet": ModelSpec(
        "InSPyReNet", "inspyrenet_base.onnx",
        "https://github.com/yashmishra12/inspyrenet-onnx/releases/download/v1.0.0/inspyrenet_base.onnx",
        "31b7b16a77407d0c4a0d00c6c0e2790a53dacf8c0baf0eaa8ab0cc094951d016", 395_399_874,
        "https://github.com/plemeri/InSPyReNet", "MIT",
    ),
}
MAX_IMAGE_BYTES = 96 * 1024 * 1024
MAX_IMAGE_PIXELS = 100_000_000


class DownloadCancelled(RuntimeError):
    pass


class BackgroundRemovalService:
    """Model-specific download state and local mask inference."""

    def __init__(self, model_directory: Path, model_name: str = MODEL_NAME):
        self.model_name = model_name
        self.model = MODELS[model_name]
        self.model_directory = Path(model_directory)
        self.model_path = self.model_directory / self.model.filename
        self.partial_path = self.model_directory / f"{self.model.filename}.part"
        self._state_lock = threading.RLock()
        self._inference_lock = threading.Lock()
        self._cancel = threading.Event()
        self._download_thread: threading.Thread | None = None
        self._session = None
        self._state = "ready" if self._valid_model() else "missing"
        self._downloaded = self.model.size if self._state == "ready" else 0
        self._total = self.model.size
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
                self.model_path.stat().st_size == self.model.size
                and self._file_sha256(self.model_path) == self.model.sha256
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
            "model": self.model_name,
        }

    def status(self) -> dict:
        available, runtime, reason = self._runtime_status()
        with self._state_lock:
            active = bool(self._download_thread and self._download_thread.is_alive())
            state = "downloading" if active else self._state
            if not available and not active:
                state = "unavailable"
            total = max(1, int(self._total or self.model.size))
            downloaded = max(0, int(self._downloaded))
            return {
                "ok": True,
                "available": available,
                "runtime": runtime,
                "reason": reason,
                "model": self.model_name,
                "label": self.model.label,
                "filename": self.model.filename,
                "state": state,
                "ready": available and state == "ready",
                "downloaded": downloaded,
                "total": total,
                "progress": min(1.0, downloaded / total),
                "error": self._error or reason,
                "path": str(self.model_path),
                "size": self.model.size,
                "sha256": self.model.sha256,
                "download_url": self.model.url,
                "source_url": self.model.source_url,
                "license": self.model.license,
            }

    def start_download(self) -> dict:
        available, _, reason = self._runtime_status()
        if not available:
            raise RuntimeError(reason)
        with self._state_lock:
            if self._valid_model():
                self._state = "ready"
                self._downloaded = self.model.size
                self._error = ""
                return self.status()
            if self._download_thread and self._download_thread.is_alive():
                return self.status()
            self._cancel.clear()
            self._state = "downloading"
            self._downloaded = 0
            self._total = self.model.size
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
                self.model.url,
                headers={"User-Agent": f"SpeechBubbleComicEditorForgeNeo/{__version__}"},
            )
            digest = hashlib.sha256()
            with (
                urllib.request.urlopen(request, timeout=60) as response,
                self.partial_path.open("wb") as output,
            ):
                header_total = int(response.headers.get("Content-Length") or self.model.size)
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
            if self.partial_path.stat().st_size != self.model.size:
                raise ValueError("モデルのファイルサイズが一致しません。")
            if digest.hexdigest() != self.model.sha256:
                raise ValueError("モデルのSHA-256が一致しません。")
            os.replace(self.partial_path, self.model_path)
            with self._state_lock:
                self._state = "ready"
                self._downloaded = self.model.size
                self._total = self.model.size
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
            if source.width * source.height > MAX_IMAGE_PIXELS:
                raise ValueError("画像の解像度が大きすぎます。")
            source.load()
            source = ImageOps.exif_transpose(source).convert("RGB")
        except Exception as error:
            raise ValueError("画像を読み込めませんでした。") from error
        if source.width * source.height > MAX_IMAGE_PIXELS:
            raise ValueError("画像の解像度が大きすぎます。")

        import numpy as np

        inspyrenet = self.model_name == "inspyrenet"
        resampling = Image.Resampling.BILINEAR if inspyrenet else Image.Resampling.LANCZOS
        resized = source.resize((1024, 1024), resampling)
        image_array = np.asarray(resized, dtype=np.float32)
        image_array /= 255.0 if inspyrenet else max(float(np.max(image_array)), 1e-6)
        image_array -= (0.485, 0.456, 0.406)
        if inspyrenet:
            image_array /= (0.229, 0.224, 0.225)
        tensor = np.expand_dims(image_array.transpose((2, 0, 1)), 0).astype(
            np.float32
        )

        with self._inference_lock:
            session = self._load_session()
            output = session.run(None, {session.get_inputs()[0].name: tensor})[0]
        prediction = np.asarray(output, dtype=np.float32).squeeze()
        if prediction.ndim != 2 or not np.isfinite(prediction).all():
            raise ValueError("モデルが有効なマスクを返しませんでした。")
        if not inspyrenet:
            minimum = float(np.min(prediction))
            maximum = float(np.max(prediction))
            if maximum - minimum > 1e-6:
                prediction = (prediction - minimum) / (maximum - minimum)
            else:
                prediction.fill(0)
        mask = Image.fromarray(
            (np.clip(prediction, 0, 1) * 255).astype(np.uint8)
        )
        mask = mask.resize(source.size, resampling)
        stream = io.BytesIO()
        mask.save(stream, format="PNG", optimize=True)
        return stream.getvalue(), source.width, source.height
