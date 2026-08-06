from __future__ import annotations

import copy
import json
import math
import re
import uuid
from datetime import datetime, timezone
from pathlib import PurePosixPath
from typing import Any

PROJECT_FORMAT = "speech-bubble-forge-project"
PROJECT_VERSION = 1
LAYOUT_FORMAT = "speech-bubble-editor-layout"
LAYOUT_VERSION = 5
WORKSPACE_NAMES = ("single", "comic", "comic_layout")
ALLOWED_IMAGE_MIMES = {"image/png", "image/jpeg", "image/webp"}
PROJECT_ID_RE = re.compile(
    r"^project:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-"
    r"[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)
ASSET_ID_RE = re.compile(r"^forge-project-image:([0-9a-f]{64})$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
MAX_LAYOUT_BYTES = 32 * 1024 * 1024
MAX_ELEMENTS = 2_000
MAX_IMAGES = 200
MAX_STRING_CHARS = 1_000_000
MAX_DEPTH = 32


class ProjectSchemaError(ValueError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_project_id() -> str:
    return f"project:{uuid.uuid4()}"


def normalize_project_id(value: object) -> str:
    project_id = str(value or "").strip().lower()
    if not PROJECT_ID_RE.fullmatch(project_id):
        raise ProjectSchemaError("Invalid project ID")
    return project_id


def project_storage_key(project_id: object) -> str:
    return normalize_project_id(project_id).removeprefix("project:")


def _reject_constant(value: str):
    raise ProjectSchemaError(f"Non-finite JSON number is not allowed: {value}")


def strict_clone(value: Any, *, label: str) -> Any:
    try:
        encoded = json.dumps(value, ensure_ascii=False, allow_nan=False)
        if len(encoded.encode("utf-8")) > MAX_LAYOUT_BYTES:
            raise ProjectSchemaError(f"{label} is too large")
        return json.loads(encoded, parse_constant=_reject_constant)
    except (TypeError, ValueError, json.JSONDecodeError) as error:
        if isinstance(error, ProjectSchemaError):
            raise
        raise ProjectSchemaError(f"{label} is not valid JSON") from error


def _validate_value(value: Any, *, path: str = "$", depth: int = 0) -> None:
    if depth > MAX_DEPTH:
        raise ProjectSchemaError(f"JSON is nested too deeply at {path}")
    if value is None or isinstance(value, (bool, int)):
        return
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ProjectSchemaError(f"Non-finite number at {path}")
        return
    if isinstance(value, str):
        if len(value) > MAX_STRING_CHARS:
            raise ProjectSchemaError(f"String is too long at {path}")
        return
    if isinstance(value, list):
        for index, child in enumerate(value):
            _validate_value(child, path=f"{path}[{index}]", depth=depth + 1)
        return
    if isinstance(value, dict):
        for key, child in value.items():
            if not isinstance(key, str):
                raise ProjectSchemaError(f"Object key is not a string at {path}")
            _validate_value(child, path=f"{path}.{key}", depth=depth + 1)
        return
    raise ProjectSchemaError(f"Unsupported JSON value at {path}")


def _dimension(value: object, *, label: str) -> float:
    if isinstance(value, bool):
        raise ProjectSchemaError(f"{label} is invalid")
    try:
        number = float(value)
    except (TypeError, ValueError) as error:
        raise ProjectSchemaError(f"{label} is invalid") from error
    if not math.isfinite(number) or not 1 <= number <= 65_535:
        raise ProjectSchemaError(f"{label} is outside the supported range")
    return number


def validate_layout(layout: object, *, require_current: bool = True) -> dict:
    if not isinstance(layout, dict):
        raise ProjectSchemaError("Project layout must be an object")
    result = strict_clone(layout, label="project layout")
    _validate_value(result)

    if result.get("format") not in {None, LAYOUT_FORMAT}:
        raise ProjectSchemaError("Unsupported layout format")

    version = result.get("version")
    if not isinstance(version, int) or isinstance(version, bool):
        raise ProjectSchemaError("Layout version is invalid")
    if version < 1 or version > LAYOUT_VERSION:
        raise ProjectSchemaError("Layout version is unsupported")
    if require_current and version != LAYOUT_VERSION:
        raise ProjectSchemaError(f"Layout version {LAYOUT_VERSION} is required")

    active = result.get("active_workspace")
    if active not in WORKSPACE_NAMES:
        raise ProjectSchemaError("Active workspace is invalid")

    workspaces = result.get("workspaces")
    if not isinstance(workspaces, dict):
        raise ProjectSchemaError("Layout workspaces are missing")

    for name in WORKSPACE_NAMES:
        workspace = workspaces.get(name)
        if not isinstance(workspace, dict):
            raise ProjectSchemaError(f"Workspace is missing: {name}")
        canvas = workspace.get("canvas")
        if not isinstance(canvas, dict):
            raise ProjectSchemaError(f"Workspace canvas is missing: {name}")
        _dimension(canvas.get("width"), label=f"{name}.canvas.width")
        _dimension(canvas.get("height"), label=f"{name}.canvas.height")
        elements = workspace.get("elements")
        if not isinstance(elements, list) or len(elements) > MAX_ELEMENTS:
            raise ProjectSchemaError(f"Workspace elements are invalid: {name}")
        ids: set[str] = set()
        for item in elements:
            if not isinstance(item, dict):
                continue
            item_id = str(item.get("id") or "").strip()
            if not item_id:
                continue
            if item_id in ids:
                raise ProjectSchemaError(f"Duplicate layer ID in {name}: {item_id}")
            ids.add(item_id)

    result["format"] = LAYOUT_FORMAT
    return result


def safe_asset_path(value: object) -> str:
    text = str(value or "")
    path = PurePosixPath(text)
    if (
        not text
        or path.is_absolute()
        or ".." in path.parts
        or "\\" in text
        or len(path.parts) != 2
        or path.parts[0] != "images"
    ):
        raise ProjectSchemaError("Image asset path is unsafe")
    return path.as_posix()


def validate_asset_record(record: object) -> dict:
    if not isinstance(record, dict):
        raise ProjectSchemaError("Image asset must be an object")
    result = strict_clone(record, label="image asset")
    asset_id = str(result.get("id") or "").strip().lower()
    match = ASSET_ID_RE.fullmatch(asset_id)
    if not match:
        raise ProjectSchemaError("Image asset ID is invalid")
    digest = str(result.get("sha256") or "").strip().lower()
    if digest != match.group(1) or not SHA256_RE.fullmatch(digest):
        raise ProjectSchemaError("Image asset checksum is invalid")
    mime = str(result.get("mime") or "").lower()
    if mime not in ALLOWED_IMAGE_MIMES:
        raise ProjectSchemaError("Image asset MIME type is unsupported")
    name = str(result.get("name") or "").strip()
    if not name or len(name) > 260:
        raise ProjectSchemaError("Image asset name is invalid")
    width = int(_dimension(result.get("width"), label="image width"))
    height = int(_dimension(result.get("height"), label="image height"))
    path = safe_asset_path(result.get("path"))
    source = result.get("source")
    if not isinstance(source, dict):
        raise ProjectSchemaError("Image asset source is invalid")
    kind = str(source.get("kind") or "")
    if kind not in {"forge-gallery", "local-file", "converted", "background-removal", "retouched"}:
        raise ProjectSchemaError("Image asset source kind is invalid")
    result.update(
        {
            "id": asset_id,
            "sha256": digest,
            "mime": mime,
            "name": name,
            "width": width,
            "height": height,
            "path": path,
            "source": source,
        }
    )
    return result


def normalize_image_trays(value: object, image_ids: set[str]) -> dict:
    if value is None:
        return {
            "mode": "shared",
            "forge_import": "place",
            "shared": sorted(image_ids),
            "workspaces": {name: [] for name in WORKSPACE_NAMES},
        }
    if not isinstance(value, dict):
        raise ProjectSchemaError("Project image tray settings are invalid")

    def id_list(raw: object, label: str) -> list[str]:
        if not isinstance(raw, list) or len(raw) > MAX_IMAGES:
            raise ProjectSchemaError(f"Project image tray {label} is invalid")
        output: list[str] = []
        seen: set[str] = set()
        for item in raw:
            asset_id = str(item or "").strip().lower()
            if asset_id not in image_ids:
                raise ProjectSchemaError(
                    f"Unknown image ID in project image tray: {asset_id}"
                )
            if asset_id not in seen:
                seen.add(asset_id)
                output.append(asset_id)
        return output

    workspaces_raw = value.get("workspaces")
    if workspaces_raw is None:
        workspaces_raw = {}
    if not isinstance(workspaces_raw, dict):
        raise ProjectSchemaError("Project workspace image trays are invalid")
    return {
        "mode": "separate" if value.get("mode") == "separate" else "shared",
        "forge_import": (
            "tray_only" if value.get("forge_import") == "tray_only" else "place"
        ),
        "shared": id_list(value.get("shared", []), "shared list"),
        "workspaces": {
            name: id_list(workspaces_raw.get(name, []), name)
            for name in WORKSPACE_NAMES
        },
    }


def validate_manifest(
    manifest: object,
    *,
    project_id: object | None = None,
    require_current_layout: bool = True,
) -> dict:
    if not isinstance(manifest, dict):
        raise ProjectSchemaError("Project manifest must be an object")
    result = strict_clone(manifest, label="project manifest")
    if result.get("format") != PROJECT_FORMAT:
        raise ProjectSchemaError("Project format is unsupported")
    if result.get("version") != PROJECT_VERSION:
        raise ProjectSchemaError("Project version is unsupported")

    normalized_id = normalize_project_id(result.get("project_id"))
    if project_id is not None and normalized_id != normalize_project_id(project_id):
        raise ProjectSchemaError("Project ID does not match the request path")

    title = str(result.get("title") or "").strip()
    if not title or len(title) > 160:
        raise ProjectSchemaError("Project title is invalid")

    active = result.get("active_workspace")
    if active not in WORKSPACE_NAMES:
        raise ProjectSchemaError("Project active workspace is invalid")

    layout = validate_layout(
        result.get("layout"),
        require_current=require_current_layout,
    )
    if layout.get("active_workspace") != active:
        raise ProjectSchemaError("Project and layout active workspaces differ")

    images_raw = result.get("images")
    if not isinstance(images_raw, list) or len(images_raw) > MAX_IMAGES:
        raise ProjectSchemaError("Project image list is invalid")
    images: list[dict] = []
    image_ids: set[str] = set()
    for record in images_raw:
        normalized = validate_asset_record(record)
        if normalized["id"] in image_ids:
            raise ProjectSchemaError(
                f"Duplicate project image ID: {normalized['id']}"
            )
        image_ids.add(normalized["id"])
        images.append(normalized)

    image_trays = normalize_image_trays(result.get("image_trays"), image_ids)

    result.update(
        {
            "project_id": normalized_id,
            "title": title,
            "active_workspace": active,
            "layout": layout,
            "images": images,
            "image_trays": image_trays,
        }
    )
    return result


def default_layout() -> dict:
    def workspace(width: int, height: int) -> dict:
        return {
            "canvas": {"width": width, "height": height},
            "background_visible": True,
            "elements": [],
        }

    workspaces = {
        "single": workspace(1024, 1024),
        "comic": workspace(720, 2200),
        "comic_layout": workspace(2480, 3508),
    }
    return {
        "format": LAYOUT_FORMAT,
        "version": LAYOUT_VERSION,
        "active_workspace": "single",
        "canvas": copy.deepcopy(workspaces["single"]["canvas"]),
        "background_visible": True,
        "elements": [],
        "workspaces": workspaces,
        "comic": None,
        "general_comic": None,
    }


def new_manifest(
    project_id: object | None = None,
    *,
    title: str = "Untitled Comic Project",
) -> dict:
    normalized_id = (
        normalize_project_id(project_id)
        if project_id is not None
        else new_project_id()
    )
    now = utc_now()
    return {
        "format": PROJECT_FORMAT,
        "version": PROJECT_VERSION,
        "project_id": normalized_id,
        "title": str(title or "Untitled Comic Project")[:160],
        "created_at": now,
        "updated_at": now,
        "active_workspace": "single",
        "layout": default_layout(),
        "images": [],
        "image_trays": {
            "mode": "shared",
            "forge_import": "place",
            "shared": [],
            "workspaces": {name: [] for name in WORKSPACE_NAMES},
        },
        "source_revisions": {},
    }
