from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass
from pathlib import Path

DEFAULT_OUTPUT_DIR = "outputs/speech-bubble-forge"
DEFAULT_WINDOW_WIDTH = 1440
DEFAULT_WINDOW_HEIGHT = 900
DEFAULT_SUPERSAMPLE = 2
DEFAULT_AUTO_SAVE = True
DEFAULT_KEEP_LAYOUT = True
DEFAULT_SAVE_OVERLAY = True

_CACHE_LOCK = threading.RLock()
_CACHE_VERSION = str(time.time_ns())
_CACHE_STATUS = "Ready"


def _shared():
    try:
        from modules import shared

        return shared
    except Exception:
        return None


def data_root() -> Path:
    try:
        from modules import paths_internal

        raw = (
            getattr(paths_internal, "data_path", None)
            or getattr(paths_internal, "script_path", None)
            or Path.cwd()
        )
        return Path(raw)
    except Exception:
        return Path.cwd()


def get_setting(name: str, default):
    shared = _shared()
    if shared is None or getattr(shared, "opts", None) is None:
        return default
    try:
        return getattr(shared.opts, name)
    except Exception:
        return default


def output_root() -> Path:
    raw = str(get_setting("speech_bubble_forge_output_dir", DEFAULT_OUTPUT_DIR) or DEFAULT_OUTPUT_DIR).strip()
    value = Path(os.path.expandvars(os.path.expanduser(raw)))
    if not value.is_absolute():
        value = data_root() / value
    return value.resolve()


def layout_root() -> Path:
    return (data_root() / "config" / "speech-bubble-forge" / "layouts").resolve()


def _bounded_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(get_setting(name, default))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


def cache_version() -> str:
    with _CACHE_LOCK:
        return _CACHE_VERSION


def cache_status() -> str:
    with _CACHE_LOCK:
        return _CACHE_STATUS


def rebuild_all_caches() -> dict:
    global _CACHE_STATUS, _CACHE_VERSION

    with _CACHE_LOCK:
        _CACHE_STATUS = "Rebuilding…"

    try:
        from .font_catalog import clear_font_cache
        from .renderer import rebuild_asset_caches

        clear_font_cache()
        counts = rebuild_asset_caches()
        with _CACHE_LOCK:
            _CACHE_VERSION = str(time.time_ns())
            _CACHE_STATUS = (
                f"Rebuilt: {counts.get('sfx', 0)} assets / "
                f"{counts.get('frames', 0)} frames"
            )
        print(f"[Speech Bubble Forge] {_CACHE_STATUS}")
        return counts
    except Exception as error:
        with _CACHE_LOCK:
            _CACHE_STATUS = f"Failed: {error}"
        print(f"[Speech Bubble Forge] Asset cache rebuild failed: {error}")
        raise


@dataclass(frozen=True)
class PublicSettings:
    output_dir: str
    window_width: int
    window_height: int
    supersample: int
    auto_save: bool
    keep_previous_layout: bool
    save_overlay: bool
    asset_cache_version: str
    asset_cache_status: str

    def as_dict(self) -> dict:
        return {
            "output_dir": self.output_dir,
            "window_width": self.window_width,
            "window_height": self.window_height,
            "supersample": self.supersample,
            "auto_save": self.auto_save,
            "keep_previous_layout": self.keep_previous_layout,
            "save_overlay": self.save_overlay,
            "asset_cache_version": self.asset_cache_version,
            "asset_cache_status": self.asset_cache_status,
        }


def public_settings() -> PublicSettings:
    return PublicSettings(
        output_dir=str(output_root()),
        window_width=_bounded_int(
            "speech_bubble_forge_window_width",
            DEFAULT_WINDOW_WIDTH,
            900,
            3840,
        ),
        window_height=_bounded_int(
            "speech_bubble_forge_window_height",
            DEFAULT_WINDOW_HEIGHT,
            640,
            2160,
        ),
        supersample=_bounded_int(
            "speech_bubble_forge_supersample",
            DEFAULT_SUPERSAMPLE,
            1,
            4,
        ),
        auto_save=bool(get_setting("speech_bubble_forge_auto_save", DEFAULT_AUTO_SAVE)),
        keep_previous_layout=bool(
            get_setting("speech_bubble_forge_keep_previous_layout", DEFAULT_KEEP_LAYOUT)
        ),
        save_overlay=bool(
            get_setting("speech_bubble_forge_save_overlay", DEFAULT_SAVE_OVERLAY)
        ),
        asset_cache_version=cache_version(),
        asset_cache_status=cache_status(),
    )


__all__ = [
    "DEFAULT_AUTO_SAVE",
    "DEFAULT_KEEP_LAYOUT",
    "DEFAULT_OUTPUT_DIR",
    "DEFAULT_SAVE_OVERLAY",
    "DEFAULT_SUPERSAMPLE",
    "DEFAULT_WINDOW_HEIGHT",
    "DEFAULT_WINDOW_WIDTH",
    "PublicSettings",
    "cache_status",
    "cache_version",
    "data_root",
    "get_setting",
    "layout_root",
    "output_root",
    "public_settings",
    "rebuild_all_caches",
]
