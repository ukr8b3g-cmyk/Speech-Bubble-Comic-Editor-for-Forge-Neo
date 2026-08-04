(function (root) {
  "use strict";

  const STORAGE_KEY = "speech-bubble-forge:comic-panel-editor-settings:v1";
  const DEFAULTS = Object.freeze({
    theme: "system",
    language: "auto",
    show_empty_guide: true,
    autosave_enabled: true,
    autosave_delay_ms: 1200,
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
      show_empty_guide: source.show_empty_guide !== false,
      autosave_enabled: source.autosave_enabled !== false,
      autosave_delay_ms: Math.max(
        500,
        Math.min(60_000, Number(source.autosave_delay_ms) || DEFAULTS.autosave_delay_ms),
      ),
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

  function update(patch, { notify = true } = {}) {
    settings = normalize({ ...settings, ...(patch || {}) });
    persist();
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
    let dialog = root.document.querySelector("[data-forge-project-settings-dialog]");
    if (!dialog) {
      dialog = root.document.createElement("dialog");
      dialog.className = "forge-project-settings-dialog";
      dialog.dataset.forgeProjectSettingsDialog = "";
      root.document.body.append(dialog);
    }

    function render() {
      const tray = options.getImageTray?.() || {};
      dialog.innerHTML = `
        <form method="dialog">
          <div class="forge-project-settings-head">
            <strong>${text("設定", "Settings")}</strong>
            <button type="button" data-project-settings-action="close" aria-label="${text("閉じる", "Close")}">×</button>
          </div>
          <section>
            <h3>${text("表示", "Appearance")}</h3>
            <div class="forge-project-settings-grid">
              <label><span>${text("テーマ", "Theme")}</span><select name="theme">
                <option value="system">${text("Forgeに合わせる", "Use Forge theme")}</option>
                <option value="dark">${text("ダーク", "Dark")}</option>
                <option value="light">${text("ライト", "Light")}</option>
              </select></label>
              <label><span>${text("言語", "Language")}</span><select name="language">
                <option value="auto">${text("自動（システム）", "Auto (system)")}</option>
                <option value="ja">日本語</option>
                <option value="en">English</option>
              </select></label>
            </div>
            <label class="forge-project-settings-check"><input type="checkbox" name="show_empty_guide"><span>${text("画像未読込時に「画像をドロップ」を表示", "Show ‘Drop an image here’ when no image is loaded")}</span></label>
          </section>
          <section>
            <h3>${text("ページ画像", "Page Images")}</h3>
            <label class="forge-project-settings-check"><input type="checkbox" name="shared_images"><span>${text("一枚画像・4コマ・コミックで共有", "Share across Single Image, 4-Panel Manga, and Comic")}</span></label>
            <label><span>${text("Forge画像追加時", "When importing from Forge")}</span><select name="forge_import">
              <option value="place">${text("現在のモードへ自動配置", "Add and place in the current mode")}</option>
              <option value="tray_only">${text("ページ画像へ追加のみ", "Add to Page Images only")}</option>
            </select></label>
          </section>
          <section>
            <h3>${text("エディター・復元", "Editor & Recovery")}</h3>
            <label class="forge-project-settings-check"><input type="checkbox" name="autosave_enabled"><span>${text("変更を自動保存", "Automatically save changes")}</span></label>
            <label><span>${text("自動保存までの待ち時間（秒）", "Autosave delay (seconds)")}</span><input type="number" name="autosave_delay" min="0.5" max="60" step="0.5"></label>
            <button type="button" data-project-settings-action="reset-layout">${text("UIレイアウトを初期化", "Reset UI layout")}</button>
          </section>
          <section>
            <h3>${text("Forge連携", "Forge Integration")}</h3>
            <button type="button" data-project-settings-action="host" ${options.openHostSettings ? "" : "hidden"}>${text("Forgeの拡張設定を開く", "Open Forge extension settings")}</button>
          </section>
          <div class="forge-project-settings-actions">
            <span></span>
            <button type="button" data-project-settings-action="reset">${text("初期値に戻す", "Reset")}</button>
            <button type="button" data-project-settings-action="cancel">${text("キャンセル", "Cancel")}</button>
            <button type="button" class="primary" data-project-settings-action="apply">${text("適用", "Apply")}</button>
          </div>
        </form>
      `;
      dialog.querySelector('[name="theme"]').value = settings.theme;
      dialog.querySelector('[name="language"]').value = settings.language;
      dialog.querySelector('[name="show_empty_guide"]').checked = settings.show_empty_guide;
      dialog.querySelector('[name="shared_images"]').checked = tray.mode !== "separate";
      dialog.querySelector('[name="forge_import"]').value = tray.forge_import === "tray_only" ? "tray_only" : "place";
      dialog.querySelector('[name="autosave_enabled"]').checked = settings.autosave_enabled;
      dialog.querySelector('[name="autosave_delay"]').value = String(settings.autosave_delay_ms / 1000);
    }

    function apply() {
      const form = dialog.querySelector("form");
      const data = new FormData(form);
      update({
        theme: data.get("theme"),
        language: data.get("language"),
        show_empty_guide: data.has("show_empty_guide"),
        autosave_enabled: data.has("autosave_enabled"),
        autosave_delay_ms: Number(data.get("autosave_delay")) * 1000,
      });
      options.setImageTray?.({
        mode: data.has("shared_images") ? "shared" : "separate",
        forge_import: data.get("forge_import") === "tray_only" ? "tray_only" : "place",
      });
      options.onChange?.(get());
      dialog.close();
    }

    dialog.addEventListener("click", (event) => {
      const action = event.target.closest("[data-project-settings-action]")?.dataset.projectSettingsAction;
      if (action === "close" || action === "cancel") dialog.close();
      else if (action === "host") options.openHostSettings?.();
      else if (action === "reset-layout") root.SpeechBubbleWorkspaceLayout?.reset?.();
      else if (action === "reset") {
        const form = dialog.querySelector("form");
        form.elements.theme.value = DEFAULTS.theme;
        form.elements.language.value = DEFAULTS.language;
        form.elements.show_empty_guide.checked = DEFAULTS.show_empty_guide;
        form.elements.shared_images.checked = true;
        form.elements.forge_import.value = "place";
        form.elements.autosave_enabled.checked = DEFAULTS.autosave_enabled;
        form.elements.autosave_delay.value = String(DEFAULTS.autosave_delay_ms / 1000);
      } else if (action === "apply") apply();
    });

    return Object.freeze({
      open() {
        render();
        dialog.showModal();
      },
      close: () => dialog.close(),
    });
  }

  applyAppearance();
  root.SpeechBubbleForgeProjectSettings = Object.freeze({
    DEFAULTS,
    create,
    english,
    get,
    set: update,
    setHostTheme,
    text,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
