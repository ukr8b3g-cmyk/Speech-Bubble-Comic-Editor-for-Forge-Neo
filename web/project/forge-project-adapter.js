(function (root) {
  "use strict";

  const PROTOCOL_VERSION = 1;
  const apiModule = root.SpeechBubbleForgeProjectApi;
  const galleryModule = root.SpeechBubbleForgeGalleryImport;
  const settingsModule = root.SpeechBubbleForgeProjectSettings;

  if (!apiModule || !galleryModule) {
    throw new Error(
      "Forge Project API and Gallery Import must load before the adapter",
    );
  }

  function create(options = {}) {
    const params = new URLSearchParams(location.search);
    const projectId = apiModule.normalizeProjectId(
      options.projectId || params.get("projectId"),
    );
    const api = new apiModule.ForgeProjectApi({
      base:
        options.apiBase ||
        `/${String(params.get("forgeApiBase") || "speech-bubble-forge").replace(
          /^\/+/,
          "",
        )}`,
    });
    const runtime = options.runtime;
    if (!runtime) throw new TypeError("Project Editor runtime is required");

    let manifest = null;
    let saving = false;
    let dirty = false;
    let autosaveTimer = null;
    let importedAssetIds = new Set();

    const tr = (ja, en) => settingsModule?.text?.(ja, en) ||
      (root.document.documentElement.lang === "en" ? en : ja);

    const setStatus = (message, level = "info") =>
      runtime.setStatus?.(message, level);

    function sourceRevisions() {
      return {
        forge_extension:
          options.forgeRevision ||
          "837efbbe798e36ccfe45adc45a100bbe62e8336b",
        project_editor_source:
          options.editorRevision ||
          "709952ffbf2ba5947cd2e05e8b64f0dd679cd42a",
      };
    }

    async function ensureProject() {
      try {
        manifest = await api.load(projectId);
      } catch (error) {
        if (!/404|not found/i.test(String(error?.message || error))) throw error;
        manifest = await api.create({
          projectId,
          title: options.defaultTitle || "Untitled Comic Project",
          sourceRevisions: sourceRevisions(),
        });
      }
      importedAssetIds = new Set(
        (manifest.images || []).map((item) => item.id),
      );
      await runtime.restoreLayout?.(manifest.layout, {
        projectId,
        images: manifest.images || [],
        imageUrl: (assetId) => api.imageUrl(projectId, assetId),
        imageBlob: (assetId) => api.imageBlob(projectId, assetId),
        imageTrays: manifest.image_trays,
      });
      runtime.setProjectTitle?.(manifest.title);
      dirty = false;
      const repairWarnings = Array.isArray(manifest.repair_warnings) ? manifest.repair_warnings : [];
      setStatus(
        repairWarnings.length
          ? tr(`欠損画像${repairWarnings.length}件を除外してプロジェクトを修復読込しました。`, `Loaded the project after skipping ${repairWarnings.length} missing image(s).`)
          : tr("プロジェクトを読み込みました。", "Project loaded."),
        repairWarnings.length ? "error" : "saved",
      );
      return manifest;
    }

    function currentImageIds() {
      const ids = [
        ...(runtime.referencedImageIds?.() || []),
        ...(runtime.imageTrayIds?.() || []),
      ];
      return [...new Set(ids.map(String).filter(Boolean))];
    }

    async function save(reason = "manual") {
      if (saving) return false;
      saving = true;
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
      try {
        const layout = await runtime.serializeLayout();
        const title =
          String(runtime.getProjectTitle?.() || manifest?.title || "").trim() ||
          "Untitled Comic Project";
        manifest = await api.save(projectId, {
          title,
          layout,
          image_ids: currentImageIds(),
          image_trays: runtime.getImageTrayState?.(),
          source_revisions: sourceRevisions(),
          reason,
        });
        dirty = false;
        runtime.markSaved?.(layout);
        setStatus(tr("プロジェクトを保存しました。", "Project saved."), "saved");
        return true;
      } catch (error) {
        setStatus(String(error?.message || error), "error");
        return false;
      } finally {
        saving = false;
      }
    }

    function markDirty() {
      dirty = true;
      setStatus(tr("未保存の変更があります。", "There are unsaved changes."), "dirty");
      clearTimeout(autosaveTimer);
      const editorSettings = runtime.getEditorSettings?.() || settingsModule?.get?.() || {};
      if (editorSettings.autosave_enabled !== false) {
        const delay = Math.max(500, Math.min(60_000, Number(editorSettings.autosave_delay_ms) || 1_200));
        autosaveTimer = setTimeout(() => save("autosave"), delay);
      }
    }

    function markClean() {
      dirty = false;
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
      setStatus(tr("保存済みのプロジェクトへ戻しました。", "Restored the saved project."), "saved");
    }

    async function importSelectedForgeImage() {
      const importButton = document.querySelector("[data-forge-project-import]");
      if (importButton) {
        importButton.disabled = true;
        importButton.setAttribute("aria-busy", "true");
      }
      try {
        setStatus(tr("Forgeの選択画像を取得しています…", "Getting the selected Forge image…"));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const received = await galleryModule.waitForGalleryImage();
        setStatus(tr("画像を追加しています…", "Adding the image…"));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const asset = await api.uploadImage(projectId, received.blob, {
          name: received.name,
          sourceKind: "forge-gallery",
          sourceTab: received.sourceTab,
        });
        const duplicate = importedAssetIds.has(asset.id);
        importedAssetIds.add(asset.id);
        const blob = duplicate
          ? await api.imageBlob(projectId, asset.id)
          : received.blob;
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const result = await runtime.importProjectImage?.({
          asset,
          blob,
          assignToSelectedPanel: runtime.forgeImportBehavior?.() !== "tray_only",
          duplicate,
        });
        if (result === false) {
          throw new Error(tr("Comic Panel Editorへ画像を追加できませんでした。", "Could not add the image to Comic Panel Editor."));
        }
        markDirty();
        setStatus(
          duplicate
            ? tr("同じ画像を再利用しました。", "Reused the existing image.")
            : tr("Forge画像をページ画像へ追加しました。", "Added the Forge image to Page Images."),
          "ready",
        );
        return asset;
      } finally {
        if (importButton) {
          importButton.disabled = false;
          importButton.removeAttribute("aria-busy");
        }
      }
    }

    function notifyProjectId(nextProjectId) {
      if (!window.opener || window.opener.closed) return;
      window.opener.postMessage(
        {
          type: "speech_bubble_project:set_project",
          protocolVersion: PROTOCOL_VERSION,
          projectId: nextProjectId,
        },
        location.origin,
      );
    }

    function navigateToProject(nextProjectId) {
      const normalized = apiModule.normalizeProjectId(nextProjectId);
      notifyProjectId(normalized);
      const url = new URL(location.href);
      url.searchParams.set("projectId", normalized);
      location.replace(url.href);
    }

    function unsavedChoice(actionLabel) {
      if (!dirty) return Promise.resolve("discard");
      return new Promise((resolve) => {
        const dialog = document.createElement("dialog");
        dialog.className = "project-action-dialog";
        const message = document.createElement("p");
        message.textContent = tr(
          `未保存の変更があります。${actionLabel}前に保存しますか？`,
          `There are unsaved changes. Save before ${actionLabel}?`,
        );
        const actions = document.createElement("div");
        actions.className = "project-action-dialog-actions";
        for (const [value, label] of [
          ["cancel", tr("キャンセル", "Cancel")],
          ["discard", tr("保存しない", "Don't Save")],
          ["save", tr("保存", "Save")],
        ]) {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.choice = value;
          button.textContent = label;
          if (value === "save") button.className = "primary";
          actions.append(button);
        }
        const finish = (value) => {
          dialog.close();
          dialog.remove();
          resolve(value);
        };
        actions.addEventListener("click", async (event) => {
          const choice = event.target.closest("[data-choice]")?.dataset.choice;
          if (!choice) return;
          if (choice === "save") {
            event.target.disabled = true;
            if (!(await save("before-navigation"))) {
              event.target.disabled = false;
              return;
            }
          }
          finish(choice);
        });
        dialog.addEventListener("cancel", (event) => {
          event.preventDefault();
          finish("cancel");
        }, { once: true });
        dialog.append(message, actions);
        document.body.append(dialog);
        dialog.showModal();
      });
    }

    async function createProject() {
      const choice = await unsavedChoice(tr("新規作成する", "creating a new project"));
      if (choice === "cancel") return;
      const timestamp = new Date().toLocaleString("sv-SE", { hour12: false }).replace(/[ :]/g, "-");
      const title = `${tr("無題のコミック", "Untitled Comic")} ${timestamp}`;
      const created = await api.create({
        title,
        sourceRevisions: sourceRevisions(),
      });
      navigateToProject(created.project_id);
    }

    function chooseProject(projects) {
      return new Promise((resolve) => {
        const dialog = document.createElement("dialog");
        dialog.className = "project-open-dialog";
        const title = document.createElement("strong");
        title.textContent = tr("プロジェクトを開く", "Open Project");
        const list = document.createElement("div");
        list.className = "project-open-list";
        let selected = "";
        for (const project of projects) {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.projectId = project.project_id;
          const name = document.createElement("strong");
          name.textContent = project.title || "Untitled Comic Project";
          const details = document.createElement("small");
          details.textContent = `${project.active_workspace || "single"} · ${project.image_count || 0} ${tr("画像", "images")}`;
          button.append(name, details);
          button.addEventListener("click", () => {
            selected = project.project_id;
            list.querySelectorAll("button").forEach((item) => item.classList.toggle("selected", item === button));
          });
          button.addEventListener("dblclick", () => finish(project.project_id));
          list.append(button);
        }
        const actions = document.createElement("div");
        actions.className = "project-action-dialog-actions";
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = tr("キャンセル", "Cancel");
        const open = document.createElement("button");
        open.type = "button";
        open.className = "primary";
        open.textContent = tr("開く", "Open");
        const finish = (value) => {
          dialog.close();
          dialog.remove();
          resolve(value || "");
        };
        cancel.addEventListener("click", () => finish(""));
        open.addEventListener("click", () => {
          if (selected) finish(selected);
        });
        dialog.addEventListener("cancel", (event) => {
          event.preventDefault();
          finish("");
        }, { once: true });
        actions.append(cancel, open);
        if (!projects.length) {
          const empty = document.createElement("p");
          empty.textContent = tr("保存済みプロジェクトがありません。", "No saved projects.");
          list.append(empty);
          open.disabled = true;
        }
        dialog.append(title, list, actions);
        document.body.append(dialog);
        dialog.showModal();
      });
    }

    async function openProject() {
      const choice = await unsavedChoice(tr("別のプロジェクトを開く", "opening another project"));
      if (choice === "cancel") return;
      const selected = await chooseProject(await api.list());
      if (selected && selected !== projectId) navigateToProject(selected);
    }

    function updateToolbarLanguage() {
      const labels = [
        ["[data-forge-project-new]", "新規プロジェクト", "New Project"],
        ["[data-forge-project-open]", "プロジェクトを開く", "Open Project"],
        ["[data-forge-project-save]", "プロジェクトを保存", "Save Project"],
        ["[data-forge-project-import]", "Forge選択画像を追加", "Add Selected Forge Image"],
      ];
      for (const [selector, ja, en] of labels) {
        const button = document.querySelector(selector);
        if (button) button.textContent = tr(ja, en);
      }
    }

    function installToolbar() {
      const host =
        document.querySelector("[data-toolbar-project-host]") ||
        document.querySelector("header .spacer")?.parentElement ||
        document.querySelector("header");
      if (!host || host.querySelector("[data-forge-project-new]")) return;

      const group = document.createElement("div");
      group.className = "toolbar-group forge-project-toolbar";
      group.innerHTML = `
        <button type="button" data-forge-project-new></button>
        <button type="button" data-forge-project-open></button>
        <button type="button" data-forge-project-save></button>
        <button type="button" data-forge-project-import>
          Forge
        </button>
      `;
      const spacer = host.querySelector(".spacer");
      if (spacer) host.insertBefore(group, spacer);
      else host.append(group);

      updateToolbarLanguage();
      group.querySelector("[data-forge-project-new]").addEventListener("click", () => {
        createProject().catch((error) => setStatus(String(error?.message || error), "error"));
      });
      group.querySelector("[data-forge-project-open]").addEventListener("click", () => {
        openProject().catch((error) => setStatus(String(error?.message || error), "error"));
      });
      group
        .querySelector("[data-forge-project-import]")
        .addEventListener("click", () => {
          importSelectedForgeImage().catch((error) =>
            setStatus(String(error?.message || error), "error"),
          );
        });
      group
        .querySelector("[data-forge-project-save]")
        .addEventListener("click", () => save("manual"));
    }

    function notifyReady() {
      if (!window.opener || window.opener.closed) return;
      window.opener.postMessage(
        {
          type: "speech_bubble_project:ready",
          protocolVersion: PROTOCOL_VERSION,
          projectId,
        },
        location.origin,
      );
    }

    function sendWindowState() {
      if (!window.opener || window.opener.closed) return;
      window.opener.postMessage(
        {
          type: "speech_bubble_project:window_state",
          protocolVersion: PROTOCOL_VERSION,
          state: {
            width: outerWidth,
            height: outerHeight,
            left: screenX,
            top: screenY,
          },
        },
        location.origin,
      );
    }

    window.addEventListener("message", (event) => {
      if (event.origin !== location.origin || event.source !== window.opener) {
        return;
      }
      const data = event.data;
      if (!data || data.protocolVersion !== PROTOCOL_VERSION) return;
      if (
        data.type === "speech_bubble_project:set_theme" &&
        ["light", "dark"].includes(data.theme)
      ) {
        settingsModule?.setHostTheme?.(data.theme);
      }
      if (data.type === "speech_bubble_project:focus") window.focus();
    });

    window.addEventListener("beforeunload", (event) => {
      sendWindowState();
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });

    async function initialize() {
      installToolbar();
      const hostSettings = await api.settings();
      settingsModule?.setHostSettings?.(hostSettings);
      await ensureProject();
      runtime.applyHostSettings?.(hostSettings);
      runtime.onChanged?.(markDirty);
      root.addEventListener("speech-bubble:project-settings-changed", () => {
        updateToolbarLanguage();
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
        if (dirty) markDirty();
      });
      notifyReady();
      return manifest;
    }

    return Object.freeze({
      projectId,
      api,
      initialize,
      save,
      markDirty,
      markClean,
      importSelectedForgeImage,
      cleanupUnusedImages: async () => {
        if (dirty) {
          setStatus(tr("未保存の変更があるため画像整理を実行できません。先にプロジェクトを保存してください。", "Save the project before cleaning up images."), "error");
          return { ok: false, blocked: "unsaved" };
        }
        return api.cleanup(projectId);
      },
      hasUnsavedChanges: () => dirty,
      manifest: () => manifest,
    });
  }

  root.SpeechBubbleForgeProjectAdapter = Object.freeze({ create });
})(typeof globalThis !== "undefined" ? globalThis : this);
