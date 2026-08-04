(function (root) {
  "use strict";

  const MODES = Object.freeze(["single", "comic", "comic_layout"]);
  const LABELS = Object.freeze({
    single: ["一枚画像", "Single Image"],
    comic: ["4コマ漫画", "4-Panel Manga"],
    comic_layout: ["コミック", "Comic"],
  });

  function create(options = {}) {
    const host = options.host || document.querySelector("[data-toolbar-mode-host]");
    if (!host) throw new Error("Mode toolbar host is missing");
    let current = MODES.includes(options.initialMode) ? options.initialMode : "single";
    let changing = false;
    const handlers = new Map();
    const toggle = document.createElement("div");
    toggle.className = "comic-mode-toggle segmented";
    toggle.setAttribute("role", "group");
    host.replaceChildren(toggle);

    function english() { return document.documentElement.lang === "en"; }
    function label(mode) { return LABELS[mode][english() ? 1 : 0]; }
    for (const mode of MODES) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.editorMode = mode;
      if (mode !== "comic_layout") button.dataset.comicMode = mode;
      button.textContent = label(mode);
      toggle.append(button);
    }

    function sync() {
      toggle.setAttribute("aria-label", english() ? "Edit mode" : "編集モード");
      for (const button of toggle.querySelectorAll("[data-editor-mode]")) {
        const active = button.dataset.editorMode === current;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
        button.disabled = changing;
        button.textContent = label(button.dataset.editorMode);
      }
    }

    async function setMode(requested, control = {}) {
      if (!MODES.includes(requested)) throw new Error(`Unsupported editor mode: ${requested}`);
      if (changing) return false;
      if (requested === current && control.force !== true) { sync(); return true; }
      changing = true;
      sync();
      const previous = current;
      try {
        if (await options.onBeforeChange?.({ previous, requested }) === false) return false;
        if (await handlers.get(requested)?.({ previous, requested, control }) === false) return false;
        current = requested;
        options.onChanged?.({ previous, active: current, control });
        return true;
      } finally {
        changing = false;
        sync();
      }
    }

    function setCurrent(mode) {
      if (!MODES.includes(mode)) return false;
      current = mode;
      sync();
      return true;
    }

    function register(mode, handler) {
      if (!MODES.includes(mode) || typeof handler !== "function") throw new TypeError("Invalid mode handler");
      handlers.set(mode, handler);
      return () => handlers.delete(mode);
    }

    toggle.addEventListener("click", (event) => {
      const button = event.target.closest("[data-editor-mode]");
      if (button) setMode(button.dataset.editorMode);
    });
    root.addEventListener("speech-bubble:language-change", sync);
    sync();
    return Object.freeze({ setMode, setCurrent, register, current: () => current, element: toggle, sync });
  }

  root.SpeechBubbleEditorModeController = Object.freeze({ MODES, create });
})(typeof globalThis !== "undefined" ? globalThis : this);
