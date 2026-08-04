(() => {
  "use strict";

  const PROTOCOL_VERSION = 1;
  const PROJECT_WINDOW_NAME = "speech_bubble_forge_project_editor";
  const PROJECT_ID_KEY = "speech-bubble/project-editor/last-project-id:v1";
  const PROJECT_WINDOW_STATE_KEY =
    "speech-bubble/project-editor/window-state:v1";
  const MAX_GALLERY_IMAGE_BYTES = 96 * 1024 * 1024;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  let projectWindow = null;
  let currentProjectId = "";
  let lastTheme = "";
  let focusTimers = [];

  const appRoot = () =>
    typeof gradioApp === "function" ? gradioApp() : document;

  const englishUi = () => /^en(?:-|$)/i.test(
    String(document.documentElement.lang || navigator.language || ""),
  );

  function uuid() {
    const nativeUuid = globalThis.crypto?.randomUUID?.();
    if (nativeUuid && UUID_RE.test(nativeUuid)) return nativeUuid.toLowerCase();
    const bytes = new Uint8Array(16);
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
    else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function projectId() {
    if (currentProjectId) return currentProjectId;
    try {
      const saved = String(localStorage.getItem(PROJECT_ID_KEY) || "");
      if (saved.startsWith("project:") && UUID_RE.test(saved.slice(8))) {
        currentProjectId = saved.toLowerCase();
        return currentProjectId;
      }
    } catch {
      // Storage is optional.
    }
    const created = `project:${uuid()}`;
    currentProjectId = created;
    try {
      localStorage.setItem(PROJECT_ID_KEY, created);
    } catch {
      // Storage is optional.
    }
    return currentProjectId;
  }

  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden"
    );
  }

  function currentTabName() {
    const root = appRoot();
    const txt2img = root.querySelector("#tab_txt2img");
    if (txt2img && isVisible(txt2img)) return "txt2img";
    const img2img = root.querySelector("#tab_img2img");
    if (img2img && isVisible(img2img)) return "img2img";
    return "txt2img";
  }

  function selectedGalleryImageInfo(tabName) {
    const root = appRoot();
    const gallery = root.querySelector(`#${tabName}_gallery`);
    if (!gallery) return null;

    let selected = null;
    if (typeof selected_gallery_button === "function") {
      try {
        const candidate = selected_gallery_button();
        if (candidate && gallery.contains(candidate)) selected = candidate;
      } catch {
        // Fall through to DOM lookup.
      }
    }
    selected ||= gallery.querySelector(
      ".thumbnail-item.thumbnail-small.selected",
    );
    selected ||= gallery.querySelector('[aria-selected="true"]');

    let image = selected?.querySelector("img") || null;
    if (!image) {
      const visible = [...gallery.querySelectorAll("img")].filter(isVisible);
      visible.sort((left, right) => {
        const area = (item) =>
          (item.naturalWidth || item.width || 0) *
          (item.naturalHeight || item.height || 0);
        return area(right) - area(left);
      });
      image = visible[0] || null;
    }

    const url = image?.currentSrc || image?.src || "";
    if (!url) return null;
    const cleanUrl = url.split("?")[0];
    const rawName = decodeURIComponent(cleanUrl.split("/").pop() || "");
    const name =
      rawName.replace(/\.[^.]+$/, "") || `${tabName}-generated-image`;
    return {
      url,
      name,
      width: image.naturalWidth || image.width || 0,
      height: image.naturalHeight || image.height || 0,
      tabName,
    };
  }

  function parseRgb(value) {
    const match = String(value || "").match(
      /rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/i,
    );
    return match ? match.slice(1, 4).map(Number) : null;
  }

  function detectTheme() {
    const candidates = [
      appRoot().querySelector("#tabs"),
      appRoot().querySelector(".gradio-container"),
      document.body,
      document.documentElement,
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const rgb = parseRgb(getComputedStyle(candidate).backgroundColor);
      if (!rgb) continue;
      const luminance =
        (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
      return luminance >= 0.55 ? "light" : "dark";
    }
    return matchMedia?.("(prefers-color-scheme: light)")?.matches
      ? "light"
      : "dark";
  }

  function popupFeatures() {
    const availableWidth = screen.availWidth || innerWidth || 1440;
    const availableHeight = screen.availHeight || innerHeight || 900;
    let saved = null;
    try {
      saved = JSON.parse(
        localStorage.getItem(PROJECT_WINDOW_STATE_KEY) || "null",
      );
    } catch {
      // Use defaults.
    }
    const width = Math.min(
      availableWidth,
      Math.max(900, Number(saved?.width) || 1440),
    );
    const height = Math.min(
      availableHeight,
      Math.max(640, Number(saved?.height) || 900),
    );
    const left = Math.round(
      (Number(screen.availLeft) || 0) + (availableWidth - width) / 2,
    );
    const top = Math.round(
      (Number(screen.availTop) || 0) + (availableHeight - height) / 2,
    );
    return [
      "popup=yes",
      "resizable=yes",
      "scrollbars=yes",
      `width=${width}`,
      `height=${height}`,
      `left=${left}`,
      `top=${top}`,
    ].join(",");
  }

  function projectEditorUrl() {
    const base = new URL(document.baseURI);
    const basePath = base.pathname.endsWith("/")
      ? base.pathname
      : base.pathname.replace(/[^/]*$/, "");
    const url = new URL(
      "speech-bubble-forge/static/project-editor.html",
      `${base.origin}${basePath}`,
    );
    url.searchParams.set("host", "forge-project");
    url.searchParams.set("projectId", projectId());
    url.searchParams.set("forgeApiBase", "/speech-bubble-forge");
    url.searchParams.set("theme", detectTheme());
    return url.href;
  }

  function clearFocusTimers() {
    for (const timer of focusTimers) clearTimeout(timer);
    focusTimers = [];
  }

  function focusProjectWindow() {
    if (!projectWindow || projectWindow.closed) return;
    clearFocusTimers();
    for (const delay of [0, 90, 240, 700, 1400]) {
      focusTimers.push(
        setTimeout(() => {
          if (!projectWindow || projectWindow.closed) return;
          projectWindow.focus();
          projectWindow.postMessage(
            {
              type: "speech_bubble_project:focus",
              protocolVersion: PROTOCOL_VERSION,
            },
            location.origin,
          );
        }, delay),
      );
    }
  }

  function openProjectEditor() {
    if (projectWindow && !projectWindow.closed) {
      focusProjectWindow();
      return projectWindow;
    }
    projectWindow = window.open(
      projectEditorUrl(),
      PROJECT_WINDOW_NAME,
      popupFeatures(),
    );
    if (!projectWindow) {
      alert(
        "Comic Panel Editorを開けませんでした。ブラウザーのポップアップ許可を確認してください。",
      );
      return null;
    }
    focusProjectWindow();
    return projectWindow;
  }

  async function galleryBlob(tabName) {
    const info = selectedGalleryImageInfo(tabName);
    if (!info) {
      throw new Error("Forgeギャラリーで画像を選択してください。");
    }
    const response = await fetch(info.url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`選択画像を取得できませんでした (${response.status})`);
    }
    const blob = await response.blob();
    if (!blob.size || blob.size > MAX_GALLERY_IMAGE_BYTES) {
      throw new Error("選択画像が空、または大きすぎます。");
    }
    if (!/^image\/(?:png|jpeg|webp)$/i.test(blob.type)) {
      throw new Error(`未対応の画像形式です: ${blob.type || "unknown"}`);
    }
    return { ...info, blob, mime: blob.type };
  }

  function projectStatus(tabName, message, level = "info") {
    const root = appRoot();
    const panel = root.querySelector(
      `[data-speech-bubble-panel="${tabName}"]`,
    );
    const output = panel?.querySelector("[data-project-editor-status]");
    if (!output) return;
    output.textContent = message;
    output.dataset.level = level;
  }

  async function replyWithGalleryImage(event, data) {
    const requestId = String(data.requestId || "");
    const tabName =
      data.tab === "txt2img" || data.tab === "img2img"
        ? data.tab
        : currentTabName();
    try {
      projectStatus(tabName, "選択画像をComic Panel Editorへ送信しています…");
      const image = await galleryBlob(tabName);
      event.source.postMessage(
        {
          type: "speech_bubble_project:gallery_image",
          protocolVersion: PROTOCOL_VERSION,
          requestId,
          ok: true,
          image: {
            blob: image.blob,
            name: image.name,
            mime: image.mime,
            width: image.width,
            height: image.height,
            sourceTab: image.tabName,
          },
        },
        event.origin,
      );
      projectStatus(tabName, "選択画像を送信しました。", "ready");
    } catch (error) {
      event.source.postMessage(
        {
          type: "speech_bubble_project:gallery_image",
          protocolVersion: PROTOCOL_VERSION,
          requestId,
          ok: false,
          error: String(error?.message || error),
        },
        event.origin,
      );
      projectStatus(
        tabName,
        String(error?.message || error),
        "error",
      );
    }
  }

  function installProjectRow(tabName) {
    const root = appRoot();
    const panel = root.querySelector(
      `[data-speech-bubble-panel="${tabName}"]`,
    );
    const actions = panel?.querySelector(".speech-bubble-forge-actions");
    if (!actions) {
      return;
    }
    const details = panel.matches?.(".speech-bubble-forge-panel")
      ? panel
      : panel.querySelector(".speech-bubble-forge-panel");
    const summary = details?.querySelector(":scope > summary");
    if (summary) summary.textContent = "Comic Panel Editor";
    if (actions.querySelector("[data-action-project-editor]")) return;
    const row = document.createElement("div");
    row.className = "speech-bubble-forge-action-row";
    row.innerHTML = `
      <button type="button" data-action-project-editor></button>
      <span class="speech-bubble-forge-action-description"></span>
      <small data-project-editor-status aria-live="polite"></small>
    `;
    row.querySelector("[data-action-project-editor]").textContent = englishUi()
      ? "Open Comic Panel Editor ↗"
      : "コミックパネルエディターを開く ↗";
    row.querySelector(".speech-bubble-forge-action-description").innerHTML = englishUi()
      ? "Import Forge-generated images and edit<br>Single Images, 4-Panel Manga, and Comic projects."
      : "Forgeの生成画像を取り込み、<br>一枚画像・4コマ漫画・コミックを編集します。";
    row
      .querySelector("[data-action-project-editor]")
      .addEventListener("click", openProjectEditor);
    actions.replaceChildren(row);
    panel.querySelector(".speech-bubble-forge-meta-row")?.setAttribute("hidden", "");
    panel.querySelector("[data-action=\"settings\"]")?.setAttribute("hidden", "");
  }

  function installUi() {
    for (const tabName of ["txt2img", "img2img"]) {
      installProjectRow(tabName);
    }
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.protocolVersion !== PROTOCOL_VERSION) return;

    if (data.type === "speech_bubble_project:ready") {
      if (data.projectId !== projectId()) return;
      if (projectWindow && !projectWindow.closed && event.source !== projectWindow) return;
      projectWindow = event.source;
      lastTheme = detectTheme();
      projectWindow.postMessage(
        {
          type: "speech_bubble_project:set_theme",
          protocolVersion: PROTOCOL_VERSION,
          theme: lastTheme,
        },
        event.origin,
      );
      focusProjectWindow();
      return;
    }

    if (!projectWindow || projectWindow.closed || event.source !== projectWindow) return;

    if (data.type === "speech_bubble_project:set_project") {
      const nextProjectId = String(data.projectId || "").trim().toLowerCase();
      if (/^project:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(nextProjectId)) {
        currentProjectId = nextProjectId;
        try {
          localStorage.setItem(PROJECT_ID_KEY, nextProjectId);
        } catch {
          // Storage is optional.
        }
      }
      return;
    }

    if (data.type === "speech_bubble_project:request_gallery_image") {
      replyWithGalleryImage(event, data);
      return;
    }

    if (data.type === "speech_bubble_project:window_state") {
      try {
        localStorage.setItem(
          PROJECT_WINDOW_STATE_KEY,
          JSON.stringify(data.state || {}),
        );
      } catch {
        // Window geometry persistence is optional.
      }
    }
  });

  const syncTheme = () => {
    const next = detectTheme();
    if (next === lastTheme) return;
    lastTheme = next;
    if (projectWindow && !projectWindow.closed) {
      projectWindow.postMessage(
        {
          type: "speech_bubble_project:set_theme",
          protocolVersion: PROTOCOL_VERSION,
          theme: next,
        },
        location.origin,
      );
    }
  };

  const start = () => {
    installUi();
    syncTheme();
  };

  if (typeof onUiLoaded === "function") onUiLoaded(start);
  else document.addEventListener("DOMContentLoaded", start);

  if (typeof onAfterUiUpdate === "function") {
    onAfterUiUpdate(() => {
      installUi();
      syncTheme();
    });
  }
})();
