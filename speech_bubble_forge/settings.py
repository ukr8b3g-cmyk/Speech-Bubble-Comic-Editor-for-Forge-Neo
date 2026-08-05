from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass
from pathlib import Path

DEFAULT_OUTPUT_DIR = "outputs/speech-bubble-forge"
DEFAULT_PROMPT_EXPORT_LOCATION = True
DEFAULT_USE_FORGE_OUTPUT_DIR = True
DEFAULT_REMEMBER_EXPORT_DIRECTORY = True
DEFAULT_FILENAME_FORMAT = "source_datetime"
DEFAULT_DATE_SUBFOLDER = "none"
DEFAULT_BACKUP_ENABLED = True
DEFAULT_BACKUP_GENERATIONS = 5
DEFAULT_OUTPUT_FORMAT = "png"
DEFAULT_PNG_COMPRESSION = 6
DEFAULT_JPEG_QUALITY = 95
DEFAULT_WEBP_QUALITY = 90
DEFAULT_WEBP_LOSSLESS = False
DEFAULT_WINDOW_WIDTH = 1440
DEFAULT_WINDOW_HEIGHT = 900
DEFAULT_SUPERSAMPLE = 2
DEFAULT_AUTO_SAVE = True
DEFAULT_KEEP_LAYOUT = True
DEFAULT_SAVE_OVERLAY = False
DEFAULT_LANGUAGE = "auto"
DEFAULT_SHOW_EMPTY_GUIDE = False
DEFAULT_SHARED_PROJECT_IMAGES = True
DEFAULT_FORGE_IMPORT_BEHAVIOR = "place"

_CACHE_LOCK = threading.RLock()
_CACHE_VERSION = str(time.time_ns())
_CACHE_STATUS = "Ready"
_EXPORT_DIRECTORY_VERSION_LOCK = threading.RLock()


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


def _resolve_output_path(raw: str) -> Path:
    value = Path(os.path.expandvars(os.path.expanduser(raw)))
    if not value.is_absolute():
        value = data_root() / value
    return value.resolve()


def fixed_output_root() -> Path:
    raw = str(get_setting("speech_bubble_forge_output_dir", DEFAULT_OUTPUT_DIR) or DEFAULT_OUTPUT_DIR).strip()
    return _resolve_output_path(raw)


def forge_output_root(source_tab: str = "") -> Path:
    keys = ["outdir_samples"]
    if source_tab == "img2img":
        keys.append("outdir_img2img_samples")
    elif source_tab == "txt2img":
        keys.append("outdir_txt2img_samples")
    else:
        keys.extend(["outdir_txt2img_samples", "outdir_img2img_samples"])
    keys.append("outdir_save")
    for key in keys:
        raw = str(get_setting(key, "") or "").strip()
        if raw:
            return _resolve_output_path(raw)
    return fixed_output_root()


def output_root(source_tab: str = "") -> Path:
    if bool(
        get_setting(
            "speech_bubble_forge_use_forge_output_dir",
            DEFAULT_USE_FORGE_OUTPUT_DIR,
        )
    ):
        return forge_output_root(source_tab)
    return fixed_output_root()


def allowed_output_roots() -> tuple[Path, ...]:
    roots = [
        fixed_output_root(),
        forge_output_root(),
        forge_output_root("txt2img"),
        forge_output_root("img2img"),
    ]
    return tuple(dict.fromkeys(roots))


def layout_root() -> Path:
    return (data_root() / "config" / "speech-bubble-forge" / "layouts").resolve()


def _export_directory_version_path() -> Path:
    return (
        data_root()
        / "config"
        / "speech-bubble-forge"
        / "export-directory-version.txt"
    ).resolve()


def export_directory_version() -> str:
    with _EXPORT_DIRECTORY_VERSION_LOCK:
        try:
            return _export_directory_version_path().read_text(encoding="utf-8").strip() or "0"
        except OSError:
            return "0"


def reset_export_directory_memory() -> str:
    version = str(time.time_ns())
    path = _export_directory_version_path()
    temporary = path.with_suffix(".tmp")
    with _EXPORT_DIRECTORY_VERSION_LOCK:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary.write_text(version, encoding="utf-8")
        temporary.replace(path)
    return "前回の保存先をリセットしました"


def _bounded_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(get_setting(name, default))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


def _choice(name: str, default: str, choices: set[str]) -> str:
    value = str(get_setting(name, default) or default).strip().lower()
    return value if value in choices else default


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
    fixed_output_dir: str
    forge_output_dir: str
    forge_output_dirs: dict[str, str]
    prompt_export_location: bool
    use_forge_output_dir: bool
    remember_export_directory: bool
    export_directory_version: str
    filename_format: str
    date_subfolder: str
    backup_enabled: bool
    backup_generations: int
    output_format: str
    png_compression: int
    jpeg_quality: int
    webp_quality: int
    webp_lossless: bool
    window_width: int
    window_height: int
    supersample: int
    auto_save: bool
    keep_previous_layout: bool
    save_overlay: bool
    language: str
    show_empty_guide: bool
    shared_project_images: bool
    forge_import_behavior: str
    asset_cache_version: str
    asset_cache_status: str

    def as_dict(self) -> dict:
        return {
            "output_dir": self.output_dir,
            "fixed_output_dir": self.fixed_output_dir,
            "forge_output_dir": self.forge_output_dir,
            "forge_output_dirs": self.forge_output_dirs,
            "prompt_export_location": self.prompt_export_location,
            "use_forge_output_dir": self.use_forge_output_dir,
            "remember_export_directory": self.remember_export_directory,
            "export_directory_version": self.export_directory_version,
            "filename_format": self.filename_format,
            "date_subfolder": self.date_subfolder,
            "backup_enabled": self.backup_enabled,
            "backup_generations": self.backup_generations,
            "output_format": self.output_format,
            "png_compression": self.png_compression,
            "jpeg_quality": self.jpeg_quality,
            "webp_quality": self.webp_quality,
            "webp_lossless": self.webp_lossless,
            "window_width": self.window_width,
            "window_height": self.window_height,
            "supersample": self.supersample,
            "auto_save": self.auto_save,
            "keep_previous_layout": self.keep_previous_layout,
            "save_overlay": self.save_overlay,
            "language": self.language,
            "show_empty_guide": self.show_empty_guide,
            "shared_project_images": self.shared_project_images,
            "forge_import_behavior": self.forge_import_behavior,
            "asset_cache_version": self.asset_cache_version,
            "asset_cache_status": self.asset_cache_status,
        }


def public_settings() -> PublicSettings:
    return PublicSettings(
        output_dir=str(output_root()),
        fixed_output_dir=str(fixed_output_root()),
        forge_output_dir=str(forge_output_root()),
        forge_output_dirs={
            "txt2img": str(forge_output_root("txt2img")),
            "img2img": str(forge_output_root("img2img")),
        },
        prompt_export_location=bool(
            get_setting(
                "speech_bubble_forge_prompt_export_location_v2",
                DEFAULT_PROMPT_EXPORT_LOCATION,
            )
        ),
        use_forge_output_dir=bool(
            get_setting(
                "speech_bubble_forge_use_forge_output_dir",
                DEFAULT_USE_FORGE_OUTPUT_DIR,
            )
        ),
        remember_export_directory=bool(
            get_setting(
                "speech_bubble_forge_remember_export_directory",
                DEFAULT_REMEMBER_EXPORT_DIRECTORY,
            )
        ),
        export_directory_version=export_directory_version(),
        filename_format=_choice(
            "speech_bubble_forge_filename_format",
            DEFAULT_FILENAME_FORMAT,
            {"source_datetime", "source_sequence", "source_only", "speech_bubble_datetime"},
        ),
        date_subfolder=_choice(
            "speech_bubble_forge_date_subfolder",
            DEFAULT_DATE_SUBFOLDER,
            {"none", "year_month", "year_month_day"},
        ),
        backup_enabled=bool(
            get_setting("speech_bubble_forge_backup_enabled", DEFAULT_BACKUP_ENABLED)
        ),
        backup_generations=_bounded_int(
            "speech_bubble_forge_backup_generations",
            DEFAULT_BACKUP_GENERATIONS,
            1,
            20,
        ),
        output_format=_choice(
            "speech_bubble_forge_output_format",
            DEFAULT_OUTPUT_FORMAT,
            {"png", "jpeg", "webp"},
        ),
        png_compression=_bounded_int(
            "speech_bubble_forge_png_compression",
            DEFAULT_PNG_COMPRESSION,
            0,
            9,
        ),
        jpeg_quality=_bounded_int(
            "speech_bubble_forge_jpeg_quality",
            DEFAULT_JPEG_QUALITY,
            1,
            100,
        ),
        webp_quality=_bounded_int(
            "speech_bubble_forge_webp_quality",
            DEFAULT_WEBP_QUALITY,
            1,
            100,
        ),
        webp_lossless=bool(
            get_setting("speech_bubble_forge_webp_lossless", DEFAULT_WEBP_LOSSLESS)
        ),
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
            get_setting("speech_bubble_forge_save_overlay_v2", DEFAULT_SAVE_OVERLAY)
        ),
        language=_choice(
            "speech_bubble_forge_language",
            DEFAULT_LANGUAGE,
            {"auto", "ja", "en"},
        ),
        show_empty_guide=bool(
            get_setting("speech_bubble_forge_show_empty_guide", DEFAULT_SHOW_EMPTY_GUIDE)
        ),
        shared_project_images=bool(
            get_setting("speech_bubble_forge_shared_project_images", DEFAULT_SHARED_PROJECT_IMAGES)
        ),
        forge_import_behavior=_choice(
            "speech_bubble_forge_import_behavior",
            DEFAULT_FORGE_IMPORT_BEHAVIOR,
            {"place", "tray_only"},
        ),
        asset_cache_version=cache_version(),
        asset_cache_status=cache_status(),
    )


__all__ = [
    "DEFAULT_AUTO_SAVE",
    "DEFAULT_BACKUP_ENABLED",
    "DEFAULT_BACKUP_GENERATIONS",
    "DEFAULT_DATE_SUBFOLDER",
    "DEFAULT_FILENAME_FORMAT",
    "DEFAULT_JPEG_QUALITY",
    "DEFAULT_KEEP_LAYOUT",
    "DEFAULT_LANGUAGE",
    "DEFAULT_OUTPUT_DIR",
    "DEFAULT_OUTPUT_FORMAT",
    "DEFAULT_PNG_COMPRESSION",
    "DEFAULT_PROMPT_EXPORT_LOCATION",
    "DEFAULT_REMEMBER_EXPORT_DIRECTORY",
    "DEFAULT_SAVE_OVERLAY",
    "DEFAULT_SHOW_EMPTY_GUIDE",
    "DEFAULT_SHARED_PROJECT_IMAGES",
    "DEFAULT_FORGE_IMPORT_BEHAVIOR",
    "DEFAULT_SUPERSAMPLE",
    "DEFAULT_USE_FORGE_OUTPUT_DIR",
    "DEFAULT_WEBP_LOSSLESS",
    "DEFAULT_WEBP_QUALITY",
    "DEFAULT_WINDOW_HEIGHT",
    "DEFAULT_WINDOW_WIDTH",
    "PublicSettings",
    "allowed_output_roots",
    "cache_status",
    "cache_version",
    "data_root",
    "export_directory_version",
    "fixed_output_root",
    "forge_output_root",
    "get_setting",
    "layout_root",
    "output_root",
    "public_settings",
    "rebuild_all_caches",
    "reset_export_directory_memory",
]
