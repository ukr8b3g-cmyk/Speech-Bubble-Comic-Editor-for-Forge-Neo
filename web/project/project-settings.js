(function (root) {
  "use strict";

  const STORAGE_KEY = "speech-bubble-forge:comic-panel-editor-settings:v1";
  const DEFAULTS = Object.freeze({
    theme: "system",
    language: "auto",
    show_empty_guide: false,
    autosave_enabled: true,
    autosave_delay_ms: 1200,
    shared_project_images: true,
    forge_import_behavior: "place",
  });

  let hostTheme = new URLSearchParams(root.location?.search || "").get("theme") === "light"
    ? "light"
    : "dark";

  function normalize(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      theme: ["system", "dark", "light"].includes(source.theme)
        ? source.theme
        : DEFAULTS.theme,
      language: ["auto", "ja", "en"].includes(source.language)
        ? source.language
        : DEFAULTS.language,
      show_empty_guide: source.show_empty_guide === true,
      autosave_enabled: source.autosave_enabled !== false,
      autosave_delay_ms: Math.max(
        500,
        Math.min(60_000, Number(source.autosave_delay_ms) || DEFAULTS.autosave_delay_ms),
      ),
      shared_project_images: source.shared_project_images !== false,
      forge_import_behavior: source.forge_import_behavior === "tray_only" ? "tray_only" : "place",
    };
  }

  function load() {
    try {
      return normalize(JSON.parse(root.localStorage?.getItem(STORAGE_KEY) || "null"));
    } catch {
      return normalize(null);
    }
  }

  let settings = load();

  function resolvedLanguage(value = settings.language) {
    if (value === "ja" || value === "en") return value;
    return /^ja(?:-|$)/i.test(root.navigator?.language || "") ? "ja" : "en";
  }

  function english() {
    return resolvedLanguage() === "en";
  }

  function text(ja, en) {
    return english() ? en : ja;
  }

  function applyAppearance() {
    const language = resolvedLanguage();
    root.document.documentElement.lang = language;
    root.document.documentElement.dataset.theme = settings.theme === "system"
      ? hostTheme
      : settings.theme;
  }

  function persist() {
    try {
      root.localStorage?.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Browser storage is optional.
    }
  }

  function update(patch, { notify = true, saveLocal = true } = {}) {
    settings = normalize({ ...settings, ...(patch || {}) });
    if (saveLocal) persist();
    applyAppearance();
    if (notify) {
      root.dispatchEvent(new Event("speech-bubble:language-change"));
      root.dispatchEvent(new CustomEvent("speech-bubble:project-settings-changed", {
        detail: get(),
      }));
    }
    return get();
  }

  function get() {
    return { ...settings };
  }

  function setHostTheme(theme) {
    if (!["light", "dark"].includes(theme)) return;
    hostTheme = theme;
    applyAppearance();
  }

  function create(options = {}) {
    return Object.freeze({
      open() {
        options.openHostSettings?.();
      },
      close() {},
    });
  }

  function setHostSettings(value) {
    const source = value && typeof value === "object" ? { ...value } : {};
    if (!("autosave_enabled" in source) && "auto_save" in source) {
      source.autosave_enabled = source.auto_save !== false;
    }
    return update(source, { notify: true, saveLocal: false });
  }

  applyAppearance();
  root.SpeechBubbleForgeProjectSettings = Object.freeze({
    DEFAULTS,
    create,
    english,
    get,
    set: update,
    setHostTheme,
    setHostSettings,
    text,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
