from __future__ import annotations

import platform
from pathlib import Path

from PIL import __version__ as pillow_version

from . import __version__
from .settings import cache_status, cache_version
from .user_assets import (
    SETTINGS_UI_VERSION,
    USER_ASSET_API_VERSION,
    UserAssetError,
    default_user_asset_store,
)

EXTENSION_ROOT = Path(__file__).resolve().parents[1]


def _check(check_id: str, label: str, status: str, message: str, **details) -> dict:
    return {
        "id": check_id,
        "label": label,
        "status": status,
        "message": message,
        **details,
    }


def run_self_diagnostics(frontend_version: str = "") -> dict:
    """Run read-only checks plus a temporary write/delete probe in the user-data area."""

    checks: list[dict] = []
    checks.append(
        _check(
            "python_api",
            "Python API",
            "pass",
            f"Speech Bubble Forge {__version__} / Python {platform.python_version()}",
            extension_version=__version__,
            python_version=platform.python_version(),
            pillow_version=pillow_version,
        )
    )

    required_files = {
        "launcher": EXTENSION_ROOT / "javascript" / "speech_bubble_forge.js",
        "settings_ui": EXTENSION_ROOT / "javascript" / "speech_bubble_settings.js",
        "editor": EXTENSION_ROOT / "web" / "speech-bubble-editor.html",
        "renderer": EXTENSION_ROOT / "speech_bubble_forge" / "renderer.py",
        "user_assets": EXTENSION_ROOT / "speech_bubble_forge" / "user_assets.py",
    }
    missing = [name for name, path in required_files.items() if not path.is_file()]
    checks.append(
        _check(
            "required_files",
            "Required extension files",
            "fail" if missing else "pass",
            f"Missing: {', '.join(missing)}" if missing else f"{len(required_files)} files found",
            missing=missing,
        )
    )

    frontend_version = str(frontend_version or "").strip()
    if not frontend_version:
        checks.append(
            _check(
                "frontend_version",
                "Settings JavaScript version",
                "warn",
                "Frontend version was not supplied",
                expected=SETTINGS_UI_VERSION,
            )
        )
    elif frontend_version != SETTINGS_UI_VERSION:
        checks.append(
            _check(
                "frontend_version",
                "Settings JavaScript version",
                "warn",
                f"Frontend {frontend_version} / backend expects {SETTINGS_UI_VERSION}",
                expected=SETTINGS_UI_VERSION,
                actual=frontend_version,
            )
        )
    else:
        checks.append(
            _check(
                "frontend_version",
                "Settings JavaScript version",
                "pass",
                f"Version {frontend_version}",
                expected=SETTINGS_UI_VERSION,
                actual=frontend_version,
            )
        )

    store = default_user_asset_store()
    try:
        writable = store.writable_probe()
        checks.append(
            _check(
                "preset_folder_writable",
                "User preset folder",
                "pass" if writable.get("ok") else "fail",
                "Temporary write/delete succeeded" if writable.get("ok") else "Temporary write failed",
                path=str(store.root),
            )
        )
    except Exception as error:
        checks.append(
            _check(
                "preset_folder_writable",
                "User preset folder",
                "fail",
                str(error),
                path=str(store.root),
            )
        )

    try:
        validation = store.validate(verify_images=True)
        checks.append(
            _check(
                "preset_index",
                "User preset index",
                "pass" if validation["ok"] else "fail",
                (
                    f"{validation['preset_count']} presets / revision {validation['revision']}"
                    if validation["ok"]
                    else f"{len(validation['issues'])} issue(s)"
                ),
                **validation,
            )
        )
        checks.append(
            _check(
                "registered_images",
                "Registered images",
                "pass" if validation["ok"] else "fail",
                f"Assets {validation['readable_assets']}/{validation['preset_count']} / thumbnails {validation['readable_thumbnails']}/{validation['preset_count']}",
                readable_assets=validation["readable_assets"],
                readable_thumbnails=validation["readable_thumbnails"],
                preset_count=validation["preset_count"],
            )
        )
    except UserAssetError as error:
        checks.append(
            _check(
                "preset_index",
                "User preset index",
                "fail",
                str(error),
                code=error.code,
                **error.details,
            )
        )
        checks.append(
            _check(
                "registered_images",
                "Registered images",
                "skip",
                "Skipped because the index is invalid",
            )
        )
    except Exception as error:
        checks.append(_check("preset_index", "User preset index", "fail", str(error)))
        checks.append(
            _check(
                "registered_images",
                "Registered images",
                "skip",
                "Skipped because the index could not be read",
            )
        )

    checks.append(
        _check(
            "asset_cache",
            "Built-in asset cache",
            "pass" if not str(cache_status()).lower().startswith("failed") else "warn",
            str(cache_status()),
            cache_version=cache_version(),
        )
    )

    status_rank = {"pass": 0, "skip": 0, "warn": 1, "fail": 2}
    highest = max((status_rank.get(check["status"], 2) for check in checks), default=0)
    overall = "fail" if highest == 2 else "warn" if highest == 1 else "pass"
    return {
        "ok": overall != "fail",
        "overall": overall,
        "extension_version": __version__,
        "settings_ui_version": SETTINGS_UI_VERSION,
        "user_asset_api_version": USER_ASSET_API_VERSION,
        "checks": checks,
    }


__all__ = ["run_self_diagnostics"]
