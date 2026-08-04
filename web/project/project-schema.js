(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SpeechBubbleProjectSchema = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const FORMAT = "speech-bubble-editor-layout";
  const CURRENT_LAYOUT_VERSION = 5;
  const CURRENT_COMIC_VERSION = 1;
  const CURRENT_GENERAL_COMIC_VERSION = 1;
  const WORKSPACE_NAMES = Object.freeze(["single", "comic", "comic_layout"]);
  const DEFAULT_CANVASES = Object.freeze({
    single: Object.freeze({ width: 1024, height: 1024 }),
    comic: Object.freeze({ width: 720, height: 2200 }),
    comic_layout: Object.freeze({ width: 2480, height: 3508 }),
  });
  const SINGLE_IMAGE_PREFIX = "single-image:";
  const GENERAL_COMIC_IMAGE_PREFIX = "general-comic-image:";
  const LEGACY_SINGLE_IMAGE_ID = "__single_background__";

  class ProjectSchemaError extends Error {
    constructor(code, message, details = null) {
      super(message);
      this.name = "ProjectSchemaError";
      this.code = code;
      this.details = details;
    }
  }

  function fail(code, message, details = null) {
    throw new ProjectSchemaError(code, message, details);
  }

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") return value;
    if (Array.isArray(value)) return value.map(clone);
    if (!isObject(value)) return value;
    const copy = {};
    for (const [key, child] of Object.entries(value)) copy[key] = clone(child);
    return copy;
  }

  function finiteDimension(value, fallback, label, required) {
    if (value == null && !required) return fallback;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 1) fail("INVALID_WORKSPACE", `Invalid ${label}`);
    return Math.round(number);
  }

  function normalizedCanvas(value, workspace, options = {}) {
    const required = options.required === true;
    if (!isObject(value)) {
      if (required) fail("INVALID_WORKSPACE", `Missing canvas for ${workspace}`);
      value = {};
    }
    const fallback = DEFAULT_CANVASES[workspace];
    const canvas = clone(value);
    canvas.width = finiteDimension(value.width, fallback.width, `${workspace}.canvas.width`, required);
    canvas.height = finiteDimension(value.height, fallback.height, `${workspace}.canvas.height`, required);
    return canvas;
  }

  function uniqueElementIds(elements, workspace) {
    if (!Array.isArray(elements)) fail("INVALID_WORKSPACE", `Invalid elements for ${workspace}`);
    const ids = new Set();
    for (const item of elements) {
      if (!isObject(item)) continue;
      const id = typeof item.id === "string" ? item.id.trim() : "";
      if (!id) continue;
      if (ids.has(id)) fail("DUPLICATE_ELEMENT_ID", `Duplicate layer id in ${workspace}: ${id}`, { workspace, id });
      ids.add(id);
    }
  }

  function normalizeWorkspace(value, workspace, options = {}) {
    const required = options.required === true;
    if (!isObject(value)) {
      if (required) fail("INVALID_WORKSPACE", `Missing workspace: ${workspace}`);
      value = {};
    }
    const normalized = clone(value);
    normalized.canvas = normalizedCanvas(value.canvas, workspace, { required });
    if (!Array.isArray(value.elements)) {
      if (required) fail("INVALID_WORKSPACE", `Missing elements for ${workspace}`);
      normalized.elements = [];
    } else {
      normalized.elements = clone(value.elements);
    }
    if (value.background_visible == null) normalized.background_visible = true;
    uniqueElementIds(normalized.elements, workspace);
    return normalized;
  }

  function comicVersion(value) {
    if (value == null) return null;
    if (!isObject(value)) fail("INVALID_LAYOUT", "Comic state must be an object");
    const version = value.version == null ? CURRENT_COMIC_VERSION : Number(value.version);
    if (!Number.isInteger(version) || version < 1) fail("UNSUPPORTED_COMIC_VERSION", "Invalid comic state version");
    if (version > CURRENT_COMIC_VERSION) fail("UNSUPPORTED_COMIC_VERSION", `Unsupported comic state version: ${version}`);
    const comic = clone(value);
    comic.version = version;
    return comic;
  }

  function generalComicVersion(value) {
    if (value == null) return null;
    if (!isObject(value)) fail("INVALID_LAYOUT", "General comic state must be an object");
    const version = value.version == null ? CURRENT_GENERAL_COMIC_VERSION : Number(value.version);
    if (!Number.isInteger(version) || version < 1) fail("UNSUPPORTED_GENERAL_COMIC_VERSION", "Invalid general comic state version");
    if (version > CURRENT_GENERAL_COMIC_VERSION) fail("UNSUPPORTED_GENERAL_COMIC_VERSION", `Unsupported general comic state version: ${version}`);
    const state = clone(value);
    state.version = version;
    return state;
  }

  function requestedWorkspace(value, comic, generalComic = null) {
    if (value == null || value === "") return generalComic?.enabled === true ? "comic_layout" : comic?.enabled === true ? "comic" : "single";
    if (!WORKSPACE_NAMES.includes(value)) fail("INVALID_WORKSPACE", `Invalid active workspace: ${value}`);
    return value;
  }

  function requestedLayoutVersion(value) {
    if (value == null) return null;
    const version = Number(value);
    if (!Number.isInteger(version) || version < 1) fail("UNSUPPORTED_LAYOUT_VERSION", "Invalid layout version");
    if (version > CURRENT_LAYOUT_VERSION) fail("UNSUPPORTED_LAYOUT_VERSION", `Unsupported layout version: ${version}`);
    return version;
  }

  function parse(input) {
    let value = input;
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch (error) {
        fail("INVALID_JSON", "Project layout JSON is invalid", { cause: String(error?.message || error) });
      }
    }
    if (!isObject(value)) fail("INVALID_LAYOUT", "Project layout must be an object");
    return clone(value);
  }

  function validateNormalized(layout, options = {}) {
    if (!isObject(layout)) fail("INVALID_LAYOUT", "Project layout must be an object");
    const version = requestedLayoutVersion(layout.version);
    if (options.requireCurrent === true && version !== CURRENT_LAYOUT_VERSION) {
      fail("UNSUPPORTED_LAYOUT_VERSION", `Layout version ${CURRENT_LAYOUT_VERSION} is required for saving`);
    }
    if (!isObject(layout.workspaces)) fail("INVALID_WORKSPACE", "Project workspaces are required");
    const activeWorkspace = requestedWorkspace(layout.active_workspace, layout.comic, layout.general_comic);
    for (const name of WORKSPACE_NAMES) {
      const workspace = layout.workspaces[name];
      if (!isObject(workspace)) fail("INVALID_WORKSPACE", `Missing workspace: ${name}`);
      normalizedCanvas(workspace.canvas, name, { required: true });
      uniqueElementIds(workspace.elements, name);
    }
    comicVersion(layout.comic);
    generalComicVersion(layout.general_comic);
    const result = clone(layout);
    result.format = typeof result.format === "string" ? result.format : FORMAT;
    result.version = CURRENT_LAYOUT_VERSION;
    result.active_workspace = activeWorkspace;
    return result;
  }

  function normalize(input) {
    const source = parse(input);
    const sourceVersion = requestedLayoutVersion(source.version);
    const comic = comicVersion(source.comic);
    const generalComic = generalComicVersion(source.general_comic);
    const activeWorkspace = requestedWorkspace(source.active_workspace, comic, generalComic);
    const hasWorkspaces = isObject(source.workspaces);
    const result = clone(source);
    result.format = typeof source.format === "string" ? source.format : FORMAT;
    result.version = CURRENT_LAYOUT_VERSION;
    result.active_workspace = activeWorkspace;
    result.workspaces = {};

    for (const name of WORKSPACE_NAMES) {
      const current = hasWorkspaces && isObject(source.workspaces[name])
        ? source.workspaces[name]
        : (name === activeWorkspace
          ? {
              canvas: source.canvas,
              background_visible: source.background_visible,
              canvas_background: source.canvas_background,
              background_image: source.background_image,
              elements: source.elements,
            }
          : {});
      const requireCurrentWorkspace = sourceVersion === CURRENT_LAYOUT_VERSION;
      result.workspaces[name] = normalizeWorkspace(current, name, { required: requireCurrentWorkspace });
    }

    const active = result.workspaces[activeWorkspace];
    result.canvas = clone(active.canvas);
    result.background_visible = active.background_visible !== false;
    if (activeWorkspace === "single") {
      if (Object.prototype.hasOwnProperty.call(active, "canvas_background")) result.canvas_background = clone(active.canvas_background);
      if (Object.prototype.hasOwnProperty.call(active, "background_image")) result.background_image = clone(active.background_image);
    }
    result.elements = clone(active.elements);
    if (comic) result.comic = comic;
    else delete result.comic;
    if (generalComic) result.general_comic = generalComic;
    else result.general_comic = null;
    return validateNormalized(result, { requireCurrent: true });
  }

  function validate(input, options = {}) {
    if (options.normalized === true) return validateNormalized(parse(input), options);
    return validateNormalized(normalize(input), options);
  }

  function runtimeWorkspace(value, workspace) {
    if (!isObject(value)) fail("INVALID_WORKSPACE", `Missing runtime workspace: ${workspace}`);
    const result = clone(value);
    result.canvas = {
      width: finiteDimension(value.width, DEFAULT_CANVASES[workspace].width, `${workspace}.width`, true),
      height: finiteDimension(value.height, DEFAULT_CANVASES[workspace].height, `${workspace}.height`, true),
    };
    delete result.width;
    delete result.height;
    if (!Array.isArray(result.elements)) result.elements = [];
    if (result.backgroundVisible == null) result.background_visible = true;
    else {
      result.background_visible = result.backgroundVisible !== false;
      delete result.backgroundVisible;
    }
    if (Object.prototype.hasOwnProperty.call(result, "canvasBackground")) {
      result.canvas_background = clone(result.canvasBackground);
      delete result.canvasBackground;
    }
    if (Object.prototype.hasOwnProperty.call(result, "backgroundImage")) {
      result.background_image = clone(result.backgroundImage);
      delete result.backgroundImage;
    }
    return result;
  }

  function build(runtime) {
    if (!isObject(runtime)) fail("INVALID_LAYOUT", "Runtime layout must be an object");
    const activeWorkspace = requestedWorkspace(runtime.activeWorkspace, runtime.comic, runtime.generalComic);
    if (!isObject(runtime.workspaces)) fail("INVALID_WORKSPACE", "Runtime workspaces are required");
    const workspaces = {
      single: runtimeWorkspace(runtime.workspaces.single, "single"),
      comic: runtimeWorkspace(runtime.workspaces.comic, "comic"),
      comic_layout: runtimeWorkspace(runtime.workspaces.comic_layout, "comic_layout"),
    };
    const active = workspaces[activeWorkspace];
    const payload = {
      format: FORMAT,
      version: CURRENT_LAYOUT_VERSION,
      active_workspace: activeWorkspace,
      canvas: clone(active.canvas),
      background_visible: active.background_visible !== false,
      canvas_background: clone(active.canvas_background),
      background_image: clone(active.background_image),
      elements: clone(active.elements),
      workspaces,
    };
    if (runtime.comic) payload.comic = comicVersion(runtime.comic);
    payload.general_comic = runtime.generalComic ? generalComicVersion(runtime.generalComic) : null;
    return validateNormalized(payload, { requireCurrent: true });
  }

  function imageRecord(record) {
    if (!isObject(record)) fail("INVALID_IMAGE_RECORD", "Project image record must be an object");
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const mime = String(record.mime || "").toLowerCase();
    const dataUrl = typeof record.data_url === "string" ? record.data_url : "";
    if (!id || !name || !["image/png", "image/jpeg", "image/webp"].includes(mime)) {
      fail("INVALID_IMAGE_RECORD", "Project image record metadata is invalid");
    }
    const expectedPrefix = `data:${mime};base64,`;
    if (!dataUrl.toLowerCase().startsWith(expectedPrefix) || dataUrl.length <= expectedPrefix.length) {
      fail("INVALID_IMAGE_RECORD", `Project image data is invalid: ${id}`, { id });
    }
    return clone(record);
  }

  function preflightPayload(payload) {
    const source = parse(payload);
    const layout = normalize(source.layout);
    if (!Array.isArray(source.images)) fail("INVALID_IMAGE_RECORD", "Project image list is invalid");
    const ids = new Set();
    const images = source.images.map((record) => {
      const normalized = imageRecord(record);
      if (ids.has(normalized.id)) fail("DUPLICATE_IMAGE_ID", `Duplicate project image id: ${normalized.id}`, { id: normalized.id });
      ids.add(normalized.id);
      return normalized;
    });
    const singleRecords = images.filter((record) => record.id === LEGACY_SINGLE_IMAGE_ID || record.id.startsWith(SINGLE_IMAGE_PREFIX));
    const generalRecords = images.filter((record) => record.id.startsWith(GENERAL_COMIC_IMAGE_PREFIX));
    const comicRecords = images.filter((record) => !singleRecords.includes(record) && !generalRecords.includes(record));
    return { ...source, layout, images, singleRecords, comicRecords, generalRecords };
  }

  return {
    FORMAT,
    CURRENT_LAYOUT_VERSION,
    CURRENT_COMIC_VERSION,
    CURRENT_GENERAL_COMIC_VERSION,
    WORKSPACE_NAMES,
    ProjectSchemaError,
    parse,
    normalize,
    build,
    validate,
    preflightPayload,
  };
});
