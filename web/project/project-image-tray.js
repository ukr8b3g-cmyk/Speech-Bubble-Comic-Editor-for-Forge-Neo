(function (root) {
  "use strict";

  const WORKSPACES = ["single", "comic", "comic_layout"];
  const DRAG_TYPE = "application/x-speech-bubble-project-image";

  function uniqueIds(values, validIds) {
    const output = [];
    const seen = new Set();
    for (const raw of Array.isArray(values) ? values : []) {
      const id = String(raw || "");
      if (!id || seen.has(id) || (validIds && !validIds.has(id))) continue;
      seen.add(id);
      output.push(id);
    }
    return output;
  }

  function normalizeState(value, imageIds = []) {
    const valid = new Set(imageIds.map(String).filter(Boolean));
    const source = value && typeof value === "object" ? value : null;
    if (!source) {
      return {
        mode: "shared",
        forge_import: "place",
        shared: [...valid],
        workspaces: { single: [], comic: [], comic_layout: [] },
      };
    }
    const workspaces = {};
    for (const workspace of WORKSPACES) {
      workspaces[workspace] = uniqueIds(source.workspaces?.[workspace], valid);
    }
    return {
      mode: source.mode === "separate" ? "separate" : "shared",
      forge_import: source.forge_import === "tray_only" ? "tray_only" : "place",
      shared: uniqueIds(source.shared, valid),
      workspaces,
    };
  }

  function create(options = {}) {
    const document = options.document || root.document;
    const canvasPanel = options.host || document.querySelector(".canvas-panel");
    if (!canvasPanel) throw new Error("Page Images host is unavailable");

    const assets = new Map();
    let workspace = WORKSPACES.includes(options.workspace?.()) ? options.workspace() : "single";
    let state = normalizeState(null, []);
    let selectedId = "";

    const collapseKey = options.collapseKey || "speech-bubble-forge:page-images-collapsed";
    let initiallyCollapsed = false;
    try {
      initiallyCollapsed = root.localStorage?.getItem(collapseKey) === "1";
    } catch {
      // Browser storage is optional.
    }
    const tray = document.createElement("section");
    tray.className = `project-image-tray${initiallyCollapsed ? " collapsed" : ""}`;
    tray.innerHTML = `
      <div class="project-image-tray-heading">
        <button type="button" data-project-tray-action="toggle" aria-expanded="${String(!initiallyCollapsed)}">
          <span data-project-tray-title>ページ画像</span>
          <span data-project-tray-count>0枚</span>
        </button>
        <div class="project-image-tray-actions">
          <details data-project-tray-settings>
            <summary title="ページ画像設定">⚙</summary>
            <div class="project-image-tray-settings-panel">
              <label class="project-image-tray-check"><input type="checkbox" data-project-tray-shared checked><span data-project-tray-shared-label></span></label>
              <label><span data-project-tray-import-label></span><select data-project-tray-import><option value="place"></option><option value="tray_only"></option></select></label>
            </div>
          </details>
          <button type="button" data-project-tray-action="add"></button>
        </div>
      </div>
      <div class="project-image-tray-list"></div>
      <input type="file" data-project-tray-file accept="image/png,image/jpeg,image/webp" multiple hidden>
    `;
    canvasPanel.append(tray);
    const list = tray.querySelector(".project-image-tray-list");
    const fileInput = tray.querySelector("[data-project-tray-file]");
    const sharedInput = tray.querySelector("[data-project-tray-shared]");
    const importSelect = tray.querySelector("[data-project-tray-import]");

    const tr = (ja, en) => options.english?.() ? en : ja;
    const activeIds = () => state.mode === "shared" ? state.shared : state.workspaces[workspace];
    const setActiveIds = (ids) => {
      const valid = new Set(assets.keys());
      if (state.mode === "shared") state.shared = uniqueIds(ids, valid);
      else state.workspaces[workspace] = uniqueIds(ids, valid);
    };
    const usageFor = (id) => ({ single: 0, comic: 0, comic_layout: 0, ...(options.usage?.(id) || {}) });

    function applyLanguage() {
      tray.querySelector("[data-project-tray-title]").textContent = tr("ページ画像", "Page Images");
      tray.querySelector('[data-project-tray-action="add"]').textContent = tr("＋ 画像を追加", "+ Add Images");
      tray.querySelector("[data-project-tray-shared-label]").textContent = tr(
        "一枚画像・4コマ・コミックで画像を共有",
        "Share images across Single Image, 4-Panel Manga, and Comic",
      );
      tray.querySelector("[data-project-tray-import-label]").textContent = tr(
        "Forge画像追加時",
        "When importing from Forge",
      );
      importSelect.options[0].textContent = tr("現在のモードへ自動配置", "Add and place in the current mode");
      importSelect.options[1].textContent = tr("ページ画像へ追加のみ", "Add to Page Images only");
    }

    function setShared(enabled, notify = true) {
      if (enabled && state.mode !== "shared") {
        state.shared = uniqueIds(WORKSPACES.flatMap((name) => state.workspaces[name]), new Set(assets.keys()));
        state.mode = "shared";
      } else if (!enabled && state.mode !== "separate") {
        for (const name of WORKSPACES) state.workspaces[name] = [...state.shared];
        state.mode = "separate";
      }
      sharedInput.checked = state.mode === "shared";
      render();
      if (notify) options.changed?.();
    }

    function applySettings(next = {}, notify = true) {
      setShared(next.mode !== "separate", false);
      state.forge_import = next.forge_import === "tray_only" ? "tray_only" : "place";
      render();
      if (notify) options.changed?.();
    }

    function serialize() {
      return {
        mode: state.mode,
        forge_import: state.forge_import,
        shared: [...state.shared],
        workspaces: Object.fromEntries(WORKSPACES.map((name) => [name, [...state.workspaces[name]]])),
      };
    }

    function imageIds() {
      return uniqueIds(
        [state.shared, ...WORKSPACES.map((name) => state.workspaces[name])].flat(),
        new Set(assets.keys()),
      );
    }

    function register(asset, control = {}) {
      const id = String(asset?.id || "");
      if (!id) return null;
      assets.set(id, { ...assets.get(id), ...asset, id });
      const targetWorkspace = WORKSPACES.includes(control.workspace) ? control.workspace : workspace;
      const current = state.mode === "shared" ? state.shared : state.workspaces[targetWorkspace];
      if (!current.includes(id)) current.push(id);
      if (control.select !== false) selectedId = id;
      if (control.expand !== false) {
        tray.classList.remove("collapsed");
        tray.querySelector('[data-project-tray-action="toggle"]')?.setAttribute("aria-expanded", "true");
      }
      render();
      if (control.notify === true) options.changed?.();
      return assets.get(id);
    }

    function restore(records, savedState) {
      assets.clear();
      for (const record of Array.isArray(records) ? records : []) {
        const id = String(record?.id || "");
        if (id) assets.set(id, { ...record, id });
      }
      state = normalizeState(savedState, [...assets.keys()]);
      sharedInput.checked = state.mode === "shared";
      importSelect.value = state.forge_import;
      selectedId = activeIds()[0] || "";
      render();
    }

    function setWorkspace(next) {
      workspace = WORKSPACES.includes(next) ? next : "single";
      selectedId = activeIds().includes(selectedId) ? selectedId : activeIds()[0] || "";
      render();
    }

    async function place(id, control = {}) {
      const asset = assets.get(String(id || ""));
      if (!asset) return false;
      try {
        const blob = await options.getBlob(asset.id);
        const placed = await options.place?.(asset, blob, control);
        if (placed === false) return false;
        selectedId = asset.id;
        render();
        return true;
      } catch (error) {
        options.setStatus?.(String(error?.message || error), "error");
        return false;
      }
    }

    function hideFromActiveTray(id) {
      if (state.mode === "shared") state.shared = state.shared.filter((value) => value !== id);
      else state.workspaces[workspace] = state.workspaces[workspace].filter((value) => value !== id);
      if (selectedId === id) selectedId = activeIds()[0] || "";
    }

    function removeFromAllTrays(id) {
      state.shared = state.shared.filter((value) => value !== id);
      for (const name of WORKSPACES) state.workspaces[name] = state.workspaces[name].filter((value) => value !== id);
      if (selectedId === id) selectedId = activeIds()[0] || "";
    }

    function removalChoice(asset, usage) {
      return new Promise((resolve) => {
        const dialog = document.createElement("dialog");
        dialog.className = "project-image-tray-dialog";
        const lines = tr(
          `この画像は次で使用されています。\n一枚画像：${usage.single}レイヤー\n4コマ漫画：${usage.comic}コマ\nコミック：${usage.comic_layout}コマ`,
          `This image is currently used in:\nSingle Image: ${usage.single}\n4-Panel Manga: ${usage.comic}\nComic: ${usage.comic_layout}`,
        );
        dialog.innerHTML = `<strong></strong><p></p><div><button value="cancel"></button><button value="hide"></button><button class="danger" value="remove"></button></div>`;
        dialog.querySelector("strong").textContent = asset.name || tr("画像", "Image");
        dialog.querySelector("p").textContent = lines;
        dialog.querySelector('[value="cancel"]').textContent = tr("キャンセル", "Cancel");
        dialog.querySelector('[value="hide"]').textContent = tr("トレイからだけ非表示", "Hide from tray only");
        dialog.querySelector('[value="remove"]').textContent = tr("使用箇所から外して削除", "Remove from usage and tray");
        const finish = (value) => { dialog.close(); dialog.remove(); resolve(value); };
        dialog.addEventListener("click", (event) => {
          const button = event.target.closest("button[value]");
          if (button) finish(button.value);
        });
        dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish("cancel"); });
        document.body.append(dialog);
        dialog.showModal();
      });
    }

    async function remove(id) {
      const asset = assets.get(id);
      if (!asset) return;
      const usage = usageFor(id);
      const choice = await removalChoice(asset, usage);
      if (choice === "cancel") return;
      if (choice === "remove") {
        await options.removeUsage?.(id);
        removeFromAllTrays(id);
      } else {
        hideFromActiveTray(id);
      }
      render();
      options.changed?.();
    }

    function render() {
      applyLanguage();
      sharedInput.checked = state.mode === "shared";
      importSelect.value = state.forge_import;
      const ids = activeIds().filter((id) => assets.has(id));
      tray.querySelector("[data-project-tray-count]").textContent = tr(`${ids.length}枚`, `${ids.length} images`);
      list.replaceChildren(...ids.map((id) => {
        const asset = assets.get(id);
        const usage = usageFor(id);
        const card = document.createElement("article");
        card.className = `project-image-tray-card${selectedId === id ? " selected" : ""}`;
        card.dataset.projectImageId = id;
        card.draggable = true;
        const preview = document.createElement("div");
        preview.className = "project-image-tray-preview";
        const image = document.createElement("img");
        image.src = options.imageUrl?.(id) || "";
        image.alt = "";
        image.draggable = false;
        preview.append(image);
        if (selectedId === id) {
          const selected = document.createElement("span");
          selected.className = "project-image-tray-badge selected-badge";
          selected.textContent = "SELECTED";
          preview.append(selected);
        }
        const totalUsage = usage.single + usage.comic + usage.comic_layout;
        if (totalUsage > 0) {
          const used = document.createElement("span");
          used.className = "project-image-tray-badge used-badge";
          used.textContent = tr("使用中", "USED");
          preview.append(used);
        }
        const name = document.createElement("span");
        name.className = "project-image-tray-name";
        name.textContent = asset.name || tr("画像", "Image");
        name.title = name.textContent;
        const usageText = document.createElement("small");
        usageText.textContent = tr(
          `一枚 ${usage.single}　4コマ ${usage.comic}　コミック ${usage.comic_layout}`,
          `Single ${usage.single}  4-Panel ${usage.comic}  Comic ${usage.comic_layout}`,
        );
        const actions = document.createElement("div");
        actions.className = "project-image-tray-card-actions";
        actions.innerHTML = `<button type="button" data-project-tray-place></button><button type="button" class="danger" data-project-tray-remove title="${tr("画像を管理", "Manage image")}">×</button>`;
        actions.querySelector("[data-project-tray-place]").textContent = tr("配置", "Place");
        card.append(preview, name, usageText, actions);
        return card;
      }));
    }

    tray.addEventListener("click", (event) => {
      const action = event.target.closest("[data-project-tray-action]")?.dataset.projectTrayAction;
      const card = event.target.closest("[data-project-image-id]");
      if (action === "toggle") {
        const collapsed = tray.classList.toggle("collapsed");
        event.target.closest("button").setAttribute("aria-expanded", String(!collapsed));
        try {
          root.localStorage?.setItem(collapseKey, collapsed ? "1" : "0");
        } catch {
          // Browser storage is optional.
        }
      } else if (action === "add") fileInput.click();
      else if (card && event.target.closest("[data-project-tray-remove]")) remove(card.dataset.projectImageId);
      else if (card && event.target.closest("[data-project-tray-place]")) place(card.dataset.projectImageId);
      else if (card) { selectedId = card.dataset.projectImageId; render(); }
    });
    tray.addEventListener("dblclick", (event) => {
      const card = event.target.closest("[data-project-image-id]");
      if (card && !event.target.closest("button")) place(card.dataset.projectImageId);
    });
    tray.addEventListener("dragstart", (event) => {
      const card = event.target.closest("[data-project-image-id]");
      if (!card) return;
      event.dataTransfer.setData(DRAG_TYPE, card.dataset.projectImageId);
      event.dataTransfer.setData("text/plain", card.dataset.projectImageId);
      event.dataTransfer.effectAllowed = "copy";
    });
    tray.addEventListener("dragover", (event) => {
      if (!event.dataTransfer?.types?.includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      tray.classList.add("drop-target");
    });
    tray.addEventListener("dragleave", (event) => {
      if (!tray.contains(event.relatedTarget)) tray.classList.remove("drop-target");
    });
    tray.addEventListener("drop", async (event) => {
      const files = [...(event.dataTransfer?.files || [])].filter((file) =>
        /^image\/(?:png|jpeg|webp)$/i.test(file.type),
      );
      if (!files.length) return;
      event.preventDefault();
      event.stopPropagation();
      tray.classList.remove("drop-target");
      for (const file of files) {
        try {
          const asset = await options.addFile?.(file);
          if (asset) register(asset, { notify: true });
        } catch (error) {
          options.setStatus?.(String(error?.message || error), "error");
        }
      }
    });
    fileInput.addEventListener("change", async () => {
      for (const file of [...fileInput.files]) {
        try {
          const asset = await options.addFile?.(file);
          if (asset) register(asset, { notify: true });
        } catch (error) {
          options.setStatus?.(String(error?.message || error), "error");
        }
      }
      fileInput.value = "";
    });
    sharedInput.addEventListener("change", () => setShared(sharedInput.checked));
    importSelect.addEventListener("change", () => {
      state.forge_import = importSelect.value === "tray_only" ? "tray_only" : "place";
      options.changed?.();
    });

    applyLanguage();
    render();
    return Object.freeze({
      DRAG_TYPE,
      register,
      restore,
      render,
      serialize,
      applySettings,
      imageIds,
      setWorkspace,
      importBehavior: () => state.forge_import,
      isShared: () => state.mode === "shared",
      refreshLanguage: render,
      place,
    });
  }

  root.SpeechBubbleProjectImageTray = Object.freeze({
    WORKSPACES,
    DRAG_TYPE,
    normalizeState,
    create,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
