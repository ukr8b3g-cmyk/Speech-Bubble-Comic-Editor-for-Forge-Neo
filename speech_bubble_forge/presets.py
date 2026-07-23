from __future__ import annotations

import datetime
import json
import math
import os
import re
import tempfile
import threading
import uuid
from pathlib import Path

_USER_PRESET_LIMIT = 200
_BASE_PRESET_IDS = {"base-oval", "base-oval-alt", "base-box", "base-thought", "base-heart", "base-hexagon"}
_SHAPE_NUMBER_RANGES = {
    "shape_intensity": (0, 100), "shape_asymmetry": (0, 100), "shape_seed": (0, 4294967295),
    "shape_roundness": (0, 100), "spike_count": (5, 32), "valley_concavity": (0, 100),
    "lobe_count": (5, 20), "lobe_depth": (0, 100), "shape_softness": (0, 100),
}
_LOCK = threading.RLock()


def read_user_presets(path: Path):
    with _LOCK:
        if not path.is_file():
            return []
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return []
        presets = data.get("presets", []) if isinstance(data, dict) else []
        return presets if isinstance(presets, list) else []


def write_user_presets(path: Path, presets):
    with _LOCK:
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"version": 1, "presets": list(presets)[:_USER_PRESET_LIMIT]}
        temporary = None
        try:
            with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False, suffix=".tmp") as handle:
                temporary = Path(handle.name)
                json.dump(payload, handle, ensure_ascii=False, indent=2)
            os.replace(temporary, path)
        finally:
            if temporary and temporary.exists():
                temporary.unlink(missing_ok=True)


def _bounded_number(value, minimum, maximum, default):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(number):
        return default
    return max(minimum, min(maximum, number))


def _sanitize_path_points(points):
    if not isinstance(points, list) or not 3 <= len(points) <= 256:
        raise ValueError("A user preset needs 3 to 256 path points")
    clean = []
    for point in points:
        if not isinstance(point, dict):
            raise ValueError("Invalid path point")
        x = _bounded_number(point.get("x"), -10, 10, None)
        y = _bounded_number(point.get("y"), -10, 10, None)
        if x is None or y is None:
            raise ValueError("Path points require finite x/y values")
        clean.append({
            "x": x, "y": y,
            "in_x": _bounded_number(point.get("in_x"), -10, 10, x),
            "in_y": _bounded_number(point.get("in_y"), -10, 10, y),
            "out_x": _bounded_number(point.get("out_x"), -10, 10, x),
            "out_y": _bounded_number(point.get("out_y"), -10, 10, y),
        })
    return clean


def sanitize_user_preset(value, existing=None):
    if not isinstance(value, dict):
        raise ValueError("Invalid user preset")
    name = str(value.get("name") or "").strip()[:80]
    if not name:
        raise ValueError("Preset name is required")
    raw_id = str(value.get("id") or "")
    preset_id = re.sub(r"[^a-zA-Z0-9_-]+", "-", raw_id).strip("-")[:80]
    if not preset_id:
        preset_id = f"user-{uuid.uuid4().hex}"
    elif not preset_id.startswith("user-"):
        preset_id = f"user-{preset_id}"[:80]
    shape_data = value.get("shape_data")
    if not isinstance(shape_data, dict):
        raise ValueError("Missing shape data")
    clean_shape = {
        "shape": str(shape_data.get("shape") or "custom")[:32],
        "path_points": _sanitize_path_points(shape_data.get("path_points")),
        "valley_style": "straight" if shape_data.get("valley_style") == "straight" else "concave",
    }
    for key, (minimum, maximum) in _SHAPE_NUMBER_RANGES.items():
        if key in shape_data:
            default = 1 if key == "shape_seed" else minimum
            number = _bounded_number(shape_data.get(key), minimum, maximum, default)
            clean_shape[key] = int(round(number)) if key in {"shape_seed", "spike_count", "lobe_count"} else number
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    base_preset = str(value.get("base_preset_id") or "base-oval")
    if base_preset not in _BASE_PRESET_IDS:
        base_preset = "base-oval"
    return {
        "id": preset_id,
        "name": name,
        "base_preset_id": base_preset,
        "aspect_ratio": _bounded_number(value.get("aspect_ratio"), 0.1, 10, 1.5),
        "shape_data": clean_shape,
        "created_at": (existing or {}).get("created_at") or str(value.get("created_at") or now),
        "updated_at": now,
    }


def update_user_presets(path: Path, payload):
    action = str(payload.get("action") or "upsert")
    presets = [preset for preset in read_user_presets(path) if isinstance(preset, dict)]
    if action == "delete":
        preset_id = str(payload.get("id") or "")
        presets = [preset for preset in presets if preset.get("id") != preset_id]
    elif action == "import":
        imported = payload.get("presets")
        if not isinstance(imported, list):
            raise ValueError("Import needs a presets array")
        by_id = {preset.get("id"): preset for preset in presets if isinstance(preset, dict)}
        for value in imported[:_USER_PRESET_LIMIT]:
            source_id = str(value.get("id") or "") if isinstance(value, dict) else ""
            clean = sanitize_user_preset(value, by_id.get(source_id))
            by_id[clean["id"]] = clean
        presets = list(by_id.values())
    else:
        value = payload.get("preset")
        source_id = str(value.get("id") or "") if isinstance(value, dict) else ""
        existing = next((preset for preset in presets if preset.get("id") == source_id), None)
        clean = sanitize_user_preset(value, existing)
        presets = [preset for preset in presets if preset.get("id") != clean["id"]]
        presets.append(clean)
    presets = presets[-_USER_PRESET_LIMIT:]
    write_user_presets(path, presets)
    return presets
