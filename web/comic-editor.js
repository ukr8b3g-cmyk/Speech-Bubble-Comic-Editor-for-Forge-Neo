(function (root) {
  "use strict";

  const core = root.SpeechBubbleComicCore;
  if (!core) throw new Error("SpeechBubbleComicCore must be loaded before comic-editor.js");

  const DB_NAME = "speech-bubble-forge-comic-images";
  const DB_STORE = "images";
  const IMAGE_DRAG_TYPE = "application/x-speech-bubble-comic-image";
  const MAX_IMAGE_BYTES = 96 * 1024 * 1024;
  const MAX_IMAGES = 100;
  const tonePatternCache = new Map();

  function uuid() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function openImageDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DB_STORE)) {
          request.result.createObjectStore(DB_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function storeImageBlob(documentId, metadata, blob) {
    if (!documentId || !metadata?.id || !blob) return;
    const db = await openImageDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, "readwrite");
      transaction.objectStore(DB_STORE).put({
        key: `${documentId}:${metadata.id}`,
        documentId,
        imageId: metadata.id,
        metadata,
        blob,
        updatedAt: Date.now(),
      });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }

  async function loadImageBlob(documentId, imageId) {
    if (!documentId || !imageId) return null;
    const db = await openImageDb();
    let record = null;
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, "readonly");
      const request = transaction.objectStore(DB_STORE).get(`${documentId}:${imageId}`);
      request.onsuccess = () => {
        record = request.result || null;
      };
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
    return record?.blob instanceof Blob ? record.blob : null;
  }

  async function deleteImageBlob(documentId, imageId) {
    if (!documentId || !imageId) return;
    const db = await openImageDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, "readwrite");
      transaction.objectStore(DB_STORE).delete(`${documentId}:${imageId}`);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }

  function imageFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(blob);
      image.decoding = "async";
      image.onload = () => resolve({ image, url });
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("画像を読み込めませんでした。"));
      };
      image.src = url;
    });
  }

  async function sha256(blob) {
    if (!globalThis.crypto?.subtle) return "";
    const digest = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  }

  function supportedImage(file) {
    return (
      file instanceof Blob &&
      (String(file.type || "").match(/^image\/(?:png|jpeg|webp)$/i) ||
        /\.(?:png|jpe?g|webp)$/i.test(String(file.name || "")))
    );
  }

  function create(options) {
    let comic = core.defaultState(options.getCanvasState().width, options.getCanvasState().height, uuid);
    let used = false;
    let selectedPanelId = null;
    let editMode = "layers";
    let drag = null;
    let hydratedDocumentId = "";
    const runtimeImages = new Map();
    const objectUrls = new Set();
    const elements = {};

    function canvasState() {
      return options.getCanvasState();
    }

    function sourceImage() {
      return options.getSourceImage?.() || null;
    }

    function documentId() {
      return String(options.getDocumentId?.() || "");
    }

    function pageRect() {
      const state = canvasState();
      comic.page.width = state.width;
      comic.page.height = state.height;
      return { x: 0, y: 0, w: state.width, h: state.height };
    }

    function layout() {
      return core.computeLayout(comic.tree, pageRect(), comic.page.gutter);
    }

    function selectedPanel() {
      const found = core.findNode(comic.tree, selectedPanelId);
      return found?.kind === "panel" ? found : null;
    }

    function ensureSourceMetadata() {
      const source = sourceImage();
      if (!source?.naturalWidth || !source?.naturalHeight) return;
      let metadata = comic.images.find((item) => item.id === "source");
      if (!metadata) {
        metadata = {
          id: "source",
          name: String(options.getSourceName?.() || "Background Image"),
          mime: "image/png",
          width: source.naturalWidth,
          height: source.naturalHeight,
          sha256: "",
          source: "document",
        };
        comic.images.unshift(metadata);
      } else {
        metadata.width = source.naturalWidth;
        metadata.height = source.naturalHeight;
        metadata.name = String(options.getSourceName?.() || metadata.name);
      }
      runtimeImages.set("source", source);
    }

    function releaseRuntimeImage(imageId) {
      const record = runtimeImages.get(imageId);
      const url = record?.dataset?.comicObjectUrl;
      if (url) {
        URL.revokeObjectURL(url);
        objectUrls.delete(url);
      }
      runtimeImages.delete(imageId);
    }

    function releaseStoredRuntimeImages() {
      for (const imageId of [...runtimeImages.keys()]) {
        if (imageId !== "source") releaseRuntimeImage(imageId);
      }
    }

    async function attachBlob(metadata, blob) {
      const loaded = await imageFromBlob(blob);
      loaded.image.dataset.comicObjectUrl = loaded.url;
      objectUrls.add(loaded.url);
      releaseRuntimeImage(metadata.id);
      runtimeImages.set(metadata.id, loaded.image);
      metadata.width = loaded.image.naturalWidth;
      metadata.height = loaded.image.naturalHeight;
      options.requestRender({ canvas: true });
    }

    async function hydrateImages() {
      const targetDocument = documentId();
      hydratedDocumentId = targetDocument;
      ensureSourceMetadata();
      await Promise.all(
        comic.images
          .filter((metadata) => metadata.source !== "document" && !runtimeImages.has(metadata.id))
          .map(async (metadata) => {
            try {
              const blob = await loadImageBlob(targetDocument, metadata.id);
              if (blob && hydratedDocumentId === targetDocument) await attachBlob(metadata, blob);
            } catch (error) {
              console.warn("Speech Bubble comic image restore failed", metadata.id, error);
            }
          }),
      );
      renderTray();
      options.requestRender({ canvas: true });
    }

    function installUi() {
      const header = document.querySelector("body > header");
      const spacer = header?.querySelector(".spacer");
      if (header && spacer) {
        const toggle = document.createElement("div");
        toggle.className = "comic-mode-toggle segmented";
        toggle.setAttribute("role", "group");
        toggle.setAttribute("aria-label", "編集モード");
        toggle.innerHTML =
          '<button type="button" data-comic-mode="single" class="active">通常画像</button>' +
          '<button type="button" data-comic-mode="layers">漫画レイヤー</button>' +
          '<button type="button" data-comic-mode="panels">コマ編集</button>';
        spacer.before(toggle);
        elements.modeToggle = toggle;
      }

      const left = document.querySelector("aside.left");
      const addText = document.getElementById("addText");
      if (left && addText) {
        const section = document.createElement("details");
        section.className = "left-section comic-panel-tools";
        section.dataset.leftSection = "comic";
        section.open = true;
        section.innerHTML = `
          <summary>Panels / コマ</summary>
          <div class="comic-template-grid">
            <button type="button" data-comic-template="vertical_four">縦4コマ</button>
            <button type="button" data-comic-template="two_column_sample">2列変則</button>
            <button type="button" data-comic-template="blank">ブランク</button>
          </div>
          <div class="comic-operation-grid">
            <button type="button" data-comic-action="split-y">上下分割</button>
            <button type="button" data-comic-action="split-x">左右分割</button>
            <button type="button" data-comic-action="merge">兄弟と結合</button>
            <button type="button" data-comic-action="adjust">画像位置調整</button>
          </div>
          <div class="comic-page-settings">
            <label>コマ間<input data-comic-page="gutter" type="number" min="0" max="64" step="1"></label>
            <label>枠線幅<input data-comic-page="border_width" type="number" min="0" max="20" step="0.5"></label>
            <label>ページ色<input data-comic-page="background" type="color"></label>
            <label>枠線色<input data-comic-page="border_color" type="color"></label>
          </div>
          <p class="hint">漫画ページモードでは、コマを選択して分割・画像配置・網点調整ができます。</p>
        `;
        left.insertBefore(section, addText);
        elements.tools = section;
      }

      const canvasPanel = document.querySelector(".canvas-panel");
      const footer = canvasPanel?.querySelector(".footer");
      if (canvasPanel && footer) {
        const tray = document.createElement("section");
        tray.className = "comic-image-tray";
        tray.hidden = true;
        tray.innerHTML = `
          <div class="comic-tray-heading">
            <button type="button" data-comic-action="tray-toggle" aria-expanded="true">画像トレイ</button>
            <span data-comic-image-count>0枚</span>
            <span class="spacer"></span>
            <button type="button" data-comic-action="sequential">空きコマへ順番に配置</button>
            <button type="button" data-comic-action="add-images">＋ 画像を追加</button>
          </div>
          <div class="comic-tray-list"></div>
          <input data-comic-image-input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden>
        `;
        canvasPanel.insertBefore(tray, footer);
        elements.tray = tray;
        elements.trayList = tray.querySelector(".comic-tray-list");
        elements.imageInput = tray.querySelector("[data-comic-image-input]");
      }

      const right = document.querySelector("aside.right");
      const empty = document.getElementById("empty");
      if (right && empty) {
        const properties = document.createElement("div");
        properties.id = "comicProperties";
        properties.className = "comic-properties";
        properties.hidden = true;
        properties.innerHTML = `
          <div class="comic-properties-title">
            <strong data-comic-panel-name>コマ</strong>
            <span>ページ構造</span>
          </div>
          <label>画像の表示
            <select data-comic-property="fit"><option value="cover">Cover</option><option value="contain">Contain</option></select>
          </label>
          <label>画像倍率
            <input data-comic-property="image_scale" type="range" min="0.05" max="5" step="0.01">
            <output data-comic-output="image_scale"></output>
          </label>
          <div class="comic-two-column">
            <label>Offset X<input data-comic-property="image_offset_x" type="number" step="1"></label>
            <label>Offset Y<input data-comic-property="image_offset_y" type="number" step="1"></label>
          </div>
          <div class="comic-two-column">
            <label>コマ背景<input data-comic-property="background" type="color"></label>
            <button type="button" data-comic-action="fit-reset">Fit Reset</button>
          </div>
          <button type="button" data-comic-action="remove-panel-image">コマ画像を外す</button>
          <details open>
            <summary>Screen Tone / 網点</summary>
            <label class="comic-check"><input data-comic-property="tone_enabled" type="checkbox">網点を有効化</label>
            <label>丸サイズ<input data-comic-property="dot_size" type="range" min="1" max="32" step="0.5"><output data-comic-output="dot_size"></output></label>
            <label>密度<input data-comic-property="density" type="range" min="0" max="100" step="1"><output data-comic-output="density"></output></label>
            <label>不透明度<input data-comic-property="tone_opacity" type="range" min="0" max="1" step="0.01"><output data-comic-output="tone_opacity"></output></label>
            <label>網点色<input data-comic-property="tone_color" type="color"></label>
          </details>
        `;
        empty.parentNode.insertBefore(properties, empty);
        elements.properties = properties;
      }

      const contextMenu = document.createElement("div");
      contextMenu.className = "comic-context-menu";
      contextMenu.hidden = true;
      contextMenu.innerHTML = `
        <button type="button" data-comic-context="adjust">画像位置を調整</button>
        <button type="button" data-comic-context="remove-image">画像を外す</button>
        <button type="button" data-comic-context="split-y">上下分割</button>
        <button type="button" data-comic-context="split-x">左右分割</button>
        <button type="button" data-comic-context="merge">兄弟コマと結合</button>
        <button type="button" data-comic-context="tone">網点を追加／削除</button>
      `;
      document.body.append(contextMenu);
      elements.contextMenu = contextMenu;

      elements.modeToggle?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-comic-mode]");
        if (!button) return;
        setEditMode(button.dataset.comicMode);
      });
      elements.tools?.addEventListener("click", (event) => {
        const template = event.target.closest("[data-comic-template]")?.dataset.comicTemplate;
        const action = event.target.closest("[data-comic-action]")?.dataset.comicAction;
        if (template) applyTemplate(template);
        else if (action === "split-y") splitSelected("y");
        else if (action === "split-x") splitSelected("x");
        else if (action === "merge") mergeSelected();
        else if (action === "adjust") setEditMode(editMode === "image" ? "panels" : "image");
      });
      elements.tools?.addEventListener("change", (event) => {
        const key = event.target.dataset.comicPage;
        if (!key) return;
        options.pushUndo();
        comic.page[key] =
          event.target.type === "color"
            ? event.target.value
            : core.clamp(event.target.value, key === "gutter" ? 0 : 0, key === "gutter" ? 64 : 20);
        updateUi();
        changed();
      });
      elements.tray?.addEventListener("click", (event) => {
        const action = event.target.closest("[data-comic-action]")?.dataset.comicAction;
        const card = event.target.closest("[data-comic-image-id]");
        if (action === "tray-toggle") {
          const collapsed = elements.tray.classList.toggle("collapsed");
          event.target.setAttribute("aria-expanded", String(!collapsed));
        } else if (action === "add-images") {
          elements.imageInput.click();
        } else if (action === "sequential") {
          placeSequentially();
        } else if (action === "remove-image" && card) {
          removeUnusedImage(card.dataset.comicImageId);
        } else if (card && selectedPanel()) {
          assignImage(selectedPanel().id, card.dataset.comicImageId);
        }
      });
      elements.imageInput?.addEventListener("change", async () => {
        await importFiles([...elements.imageInput.files]);
        elements.imageInput.value = "";
      });
      elements.properties?.addEventListener("input", handlePropertyInput);
      elements.properties?.addEventListener("change", handlePropertyChange);
      elements.properties?.addEventListener("click", (event) => {
        const action = event.target.closest("[data-comic-action]")?.dataset.comicAction;
        const panel = selectedPanel();
        if (!panel) return;
        if (action === "fit-reset") {
          options.pushUndo();
          panel.image_scale = 1;
          panel.image_offset_x = 0;
          panel.image_offset_y = 0;
          updateUi();
          changed();
        } else if (action === "remove-panel-image" && panel.image_id) {
          options.pushUndo();
          panel.image_id = null;
          updateUi();
          renderTray();
          changed();
        }
      });
      contextMenu.addEventListener("click", (event) => {
        const action = event.target.closest("[data-comic-context]")?.dataset.comicContext;
        contextMenu.hidden = true;
        const panel = selectedPanel();
        if (!panel || !action) return;
        if (action === "adjust") setEditMode("image");
        else if (action === "remove-image" && panel.image_id) {
          options.pushUndo();
          panel.image_id = null;
          updateUi();
          changed();
        } else if (action === "split-y") splitSelected("y");
        else if (action === "split-x") splitSelected("x");
        else if (action === "merge") mergeSelected();
        else if (action === "tone") {
          options.pushUndo();
          panel.tone = panel.tone ? null : core.defaultTone();
          updateUi();
          changed();
        }
      });
      document.addEventListener("pointerdown", (event) => {
        if (!event.target.closest(".comic-context-menu")) contextMenu.hidden = true;
      });
    }

    function setEditMode(requested) {
      const single=requested==="single";
      const next = requested === "image" ? "image" : requested === "panels" ? "panels" : "layers";
      if(single){
        if(comic.enabled)options.pushUndo();
        comic.enabled=false;
        editMode="layers";
        drag=null;
        updateUi();
        options.syncProperties?.();
        changed();
        return;
      }
      if (!comic.enabled) {
        options.pushUndo();
        comic.enabled = true;
        used = true;
        ensureSourceMetadata();
      }
      if (next !== "layers") {
        if (!selectedPanelId) selectedPanelId = layout().panels[0]?.id || null;
        options.clearLayerSelection?.();
      }
      editMode = next;
      drag = null;
      updateUi();
      options.syncProperties?.();
      options.requestRender({ canvas: true, layers: true, preview: next !== "layers" });
    }

    function updateUi() {
      ensureSourceMetadata();
      elements.modeToggle?.querySelectorAll("[data-comic-mode]").forEach((button) => {
        const active = button.dataset.comicMode==="single"
          ? !comic.enabled
          : button.dataset.comicMode==="layers"
            ? comic.enabled&&editMode==="layers"
            : comic.enabled&&editMode!=="layers";
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      elements.tools?.classList.toggle("comic-active", comic.enabled && editMode !== "layers");
      if (elements.tools) elements.tools.hidden = !comic.enabled && editMode === "layers";
      if (elements.tray) elements.tray.hidden = !comic.enabled;
      if (elements.tools) {
        for (const input of elements.tools.querySelectorAll("[data-comic-page]")) {
          input.value = comic.page[input.dataset.comicPage];
        }
        const adjust = elements.tools.querySelector('[data-comic-action="adjust"]');
        if (adjust) {
          adjust.classList.toggle("active", editMode === "image");
          adjust.textContent = editMode === "image" ? "画像調整を終了" : "画像位置調整";
        }
      }
      renderTray();
      syncProperties();
    }

    function syncProperties() {
      const active = comic.enabled && editMode !== "layers" && Boolean(selectedPanel());
      if (elements.properties) elements.properties.hidden = !active;
      const normalProperties = document.getElementById("properties");
      const empty = document.getElementById("empty");
      if (active) {
        if (normalProperties) normalProperties.hidden = true;
        if (empty) empty.hidden = true;
      } else {
        if (normalProperties) normalProperties.hidden = false;
      }
      if (!active) return false;
      const panel = selectedPanel();
      const panelIndex = layout().panels.findIndex((item) => item.id === panel.id) + 1;
      elements.properties.querySelector("[data-comic-panel-name]").textContent = `コマ ${panelIndex}`;
      for (const input of elements.properties.querySelectorAll("[data-comic-property]")) {
        const key = input.dataset.comicProperty;
        if (key === "tone_enabled") input.checked = Boolean(panel.tone);
        else if (key === "dot_size") input.value = panel.tone?.dot_size ?? 6;
        else if (key === "density") input.value = panel.tone ? Math.round(((64 - panel.tone.spacing) / 60) * 100) : 86;
        else if (key === "tone_opacity") input.value = panel.tone?.opacity ?? 0.65;
        else if (key === "tone_color") input.value = panel.tone?.color ?? "#000000";
        else input.value = panel[key] ?? "";
      }
      for (const output of elements.properties.querySelectorAll("[data-comic-output]")) {
        const input = elements.properties.querySelector(`[data-comic-property="${output.dataset.comicOutput}"]`);
        output.value = input?.dataset.comicProperty === "image_scale" ? `${Math.round(Number(input.value) * 100)}%` : input?.value || "";
        output.textContent = output.value;
      }
      elements.properties.querySelector('[data-comic-action="remove-panel-image"]').disabled = !panel.image_id;
      return true;
    }

    function handlePropertyInput(event) {
      const input = event.target.closest("[data-comic-property]");
      const panel = selectedPanel();
      if (!input || !panel) return;
      if (!input.dataset.comicEditing) {
        options.pushUndo();
        input.dataset.comicEditing = "1";
      }
      applyProperty(panel, input);
      syncProperties();
      options.requestRender({ canvas: true });
    }

    function handlePropertyChange(event) {
      const input = event.target.closest("[data-comic-property]");
      const panel = selectedPanel();
      if (!input || !panel) return;
      if (!input.dataset.comicEditing) options.pushUndo();
      delete input.dataset.comicEditing;
      applyProperty(panel, input);
      syncProperties();
      changed();
    }

    function applyProperty(panel, input) {
      const key = input.dataset.comicProperty;
      if (key === "tone_enabled") panel.tone = input.checked ? panel.tone || core.defaultTone() : null;
      else if (key === "dot_size") {
        panel.tone ||= core.defaultTone();
        panel.tone.dot_size = core.clamp(input.value, 1, panel.tone.spacing * 0.95);
      } else if (key === "density") {
        panel.tone ||= core.defaultTone();
        panel.tone.spacing = core.clamp(64 - (core.clamp(input.value, 0, 100) / 100) * 60, 4, 64);
        panel.tone.dot_size = Math.min(panel.tone.dot_size, panel.tone.spacing * 0.95);
      } else if (key === "tone_opacity") {
        panel.tone ||= core.defaultTone();
        panel.tone.opacity = core.clamp(input.value, 0, 1);
      } else if (key === "tone_color") {
        panel.tone ||= core.defaultTone();
        panel.tone.color = input.value;
      } else if (key === "fit" || key === "background") panel[key] = input.value;
      else if (key === "image_scale") panel[key] = core.clamp(input.value, 0.05, 5);
      else panel[key] = Number(input.value) || 0;
    }

    function hasPanelContent() {
      return layout().panels.some((item) => item.node.image_id || item.node.tone);
    }

    function applyTemplate(templateId) {
      if (hasPanelContent() && !confirm("現在のコマ割りとコマ内設定を置き換えますか？\n画像トレイの画像は残ります。")) return;
      options.pushUndo();
      comic.tree = core.createTemplate(templateId, uuid);
      comic.template_id = templateId;
      comic.enabled = true;
      used = true;
      selectedPanelId = layout().panels[0]?.id || null;
      updateUi();
      changed();
    }

    function splitSelected(axis) {
      const panel = selectedPanel();
      if (!panel) {
        options.setStatus?.("分割するコマを選択してください。", "error");
        return;
      }
      options.pushUndo();
      const result = core.splitPanel(comic.tree, panel.id, axis, uuid);
      if (!result.changed) return;
      comic.tree = result.tree;
      selectedPanelId = result.panelId;
      used = true;
      updateUi();
      changed();
    }

    function mergeSelected() {
      const panel = selectedPanel();
      if (!panel) return;
      const match = core.findParent(comic.tree, panel.id);
      const parent = match?.parent;
      if (!parent || parent.first.kind !== "panel" || parent.second.kind !== "panel") {
        options.setStatus?.("同じ仕切りに属する兄弟コマだけ結合できます。", "error");
        return;
      }
      const sibling = parent.first.id === panel.id ? parent.second : parent.first;
      if (panel.image_id && sibling.image_id && !confirm("両方のコマに画像があります。選択中のコマ画像を残して結合しますか？")) return;
      options.pushUndo();
      const result = core.mergeSibling(comic.tree, panel.id, panel.id, uuid);
      if (!result.changed) return;
      comic.tree = result.tree;
      selectedPanelId = result.panelId;
      updateUi();
      changed();
    }

    function assignImage(panelId, imageId) {
      const panel = core.findNode(comic.tree, panelId);
      if (!panel || panel.kind !== "panel" || !comic.images.some((item) => item.id === imageId)) return false;
      if (panel.image_id && panel.image_id !== imageId && !confirm("このコマの画像を差し替えますか？")) return false;
      options.pushUndo();
      panel.image_id = imageId;
      panel.image_scale = 1;
      panel.image_offset_x = 0;
      panel.image_offset_y = 0;
      selectedPanelId = panel.id;
      used = true;
      updateUi();
      changed();
      return true;
    }

    function placeSequentially() {
      const emptyPanels = layout().panels.filter((item) => !item.node.image_id);
      const usedIds = new Set(layout().panels.map((item) => item.node.image_id).filter(Boolean));
      const available = comic.images.filter((item) => !usedIds.has(item.id));
      if (!emptyPanels.length || !available.length) {
        options.setStatus?.("空きコマまたは未使用画像がありません。", "info");
        return;
      }
      options.pushUndo();
      emptyPanels.forEach((item, index) => {
        if (available[index]) item.node.image_id = available[index].id;
      });
      updateUi();
      changed();
    }

    async function importFiles(files) {
      if (!comic.enabled) setEditMode("panels");
      const supported = files.filter(supportedImage);
      if (!supported.length) {
        options.setStatus?.("PNG / JPEG / WebP画像を選択してください。", "error");
        return false;
      }
      let imported = 0;
      for (const file of supported) {
        if (comic.images.length >= MAX_IMAGES) {
          options.setStatus?.(`画像は1ドキュメント最大${MAX_IMAGES}枚です。`, "error");
          break;
        }
        if (file.size > MAX_IMAGE_BYTES) {
          options.setStatus?.(`${file.name || "画像"}は96 MiBを超えているため読み込めません。`, "error");
          continue;
        }
        try {
          const digest = await sha256(file);
          const duplicate = digest && comic.images.find((item) => item.sha256 === digest);
          if (duplicate) continue;
          const metadata = {
            id: `image-${uuid()}`,
            name: String(file.name || `image-${comic.images.length + 1}`).slice(0, 260),
            mime: /^image\/(?:png|jpeg|webp)$/i.test(file.type) ? file.type : "image/png",
            width: 1,
            height: 1,
            sha256: digest,
            source: "stored",
          };
          await attachBlob(metadata, file);
          comic.images.push(metadata);
          await storeImageBlob(documentId(), metadata, file);
          imported += 1;
        } catch (error) {
          console.warn("Speech Bubble comic image import failed", error);
          options.setStatus?.(`${file.name || "画像"}を読み込めませんでした。`, "error");
        }
      }
      if (imported) {
        used = true;
        renderTray();
        changed();
        options.setStatus?.(`${imported}枚の画像を画像トレイへ追加しました。`, "saved");
      }
      return imported > 0;
    }

    async function removeUnusedImage(imageId) {
      if (imageId === "source" || layout().panels.some((item) => item.node.image_id === imageId)) return;
      const index = comic.images.findIndex((item) => item.id === imageId);
      if (index < 0) return;
      options.pushUndo();
      comic.images.splice(index, 1);
      releaseRuntimeImage(imageId);
      await deleteImageBlob(documentId(), imageId).catch(() => {});
      renderTray();
      changed();
    }

    function renderTray() {
      if (!elements.trayList) return;
      ensureSourceMetadata();
      const usedIds = new Set(layout().panels.map((item) => item.node.image_id).filter(Boolean));
      elements.tray.querySelector("[data-comic-image-count]").textContent = `${comic.images.length}枚`;
      elements.trayList.replaceChildren(
        ...comic.images.map((metadata) => {
          const card = document.createElement("article");
          card.className = `comic-image-card${usedIds.has(metadata.id) ? " used" : ""}`;
          card.dataset.comicImageId = metadata.id;
          card.draggable = true;
          const preview = document.createElement("div");
          preview.className = "comic-image-preview";
          const runtime = runtimeImages.get(metadata.id);
          if (runtime?.src) {
            const image = document.createElement("img");
            image.src = runtime.src;
            image.alt = "";
            preview.append(image);
          } else {
            preview.textContent = "読込待ち";
          }
          const name = document.createElement("span");
          name.textContent = metadata.name;
          name.title = metadata.name;
          card.append(preview, name);
          if (!usedIds.has(metadata.id) && metadata.id !== "source") {
            const remove = document.createElement("button");
            remove.type = "button";
            remove.dataset.comicAction = "remove-image";
            remove.textContent = "×";
            remove.title = "未使用画像を削除";
            card.append(remove);
          }
          card.addEventListener("dragstart", (event) => {
            event.dataTransfer.setData(IMAGE_DRAG_TYPE, metadata.id);
            event.dataTransfer.effectAllowed = "copy";
          });
          return card;
        }),
      );
    }

    function tonePattern(target, tone) {
      const key = `${tone.dot_size}|${tone.spacing}|${tone.opacity}|${tone.color}`;
      if (tonePatternCache.has(key)) return tonePatternCache.get(key);
      const size = Math.max(4, Math.ceil(tone.spacing));
      const tile = document.createElement("canvas");
      tile.width = size;
      tile.height = size;
      const context = tile.getContext("2d");
      context.globalAlpha = tone.opacity;
      context.fillStyle = tone.color;
      context.beginPath();
      context.arc(size / 2, size / 2, Math.min(size * 0.475, tone.dot_size / 2), 0, Math.PI * 2);
      context.fill();
      const pattern = target.createPattern(tile, "repeat");
      tonePatternCache.set(key, pattern);
      if (tonePatternCache.size > 64) tonePatternCache.delete(tonePatternCache.keys().next().value);
      return pattern;
    }

    function drawUnderlay(target, optionsValue = {}) {
      if (!comic.enabled) return false;
      const overlay = optionsValue.overlay === true;
      const computed = layout();
      target.save();
      if (!overlay) {
        target.fillStyle = comic.page.background;
        target.fillRect(0, 0, canvasState().width, canvasState().height);
      }
      for (const item of computed.panels) {
        const panel = item.node;
        const rect = item.rect;
        target.save();
        target.beginPath();
        target.rect(rect.x, rect.y, rect.w, rect.h);
        target.clip();
        if (!overlay) {
          target.fillStyle = panel.background;
          target.fillRect(rect.x, rect.y, rect.w, rect.h);
          const image = panel.image_id === "source" ? sourceImage() : runtimeImages.get(panel.image_id);
          if (image?.naturalWidth && image?.naturalHeight) {
            const fitted = core.imageFit(
              rect,
              image.naturalWidth,
              image.naturalHeight,
              panel.fit,
              panel.image_scale,
              panel.image_offset_x,
              panel.image_offset_y,
            );
            target.drawImage(image, fitted.x, fitted.y, fitted.w, fitted.h);
          }
        }
        if (panel.tone) {
          const pattern = tonePattern(target, panel.tone);
          if (pattern) {
            target.save();
            target.translate(panel.tone.offset_x || 0, panel.tone.offset_y || 0);
            target.fillStyle = pattern;
            target.fillRect(
              rect.x - (panel.tone.offset_x || 0),
              rect.y - (panel.tone.offset_y || 0),
              rect.w,
              rect.h,
            );
            target.restore();
          }
        }
        target.restore();
        if (comic.page.border_width > 0) {
          const inset = comic.page.border_width / 2;
          target.strokeStyle = comic.page.border_color;
          target.lineWidth = comic.page.border_width;
          target.strokeRect(
            rect.x + inset,
            rect.y + inset,
            Math.max(0, rect.w - comic.page.border_width),
            Math.max(0, rect.h - comic.page.border_width),
          );
        }
      }
      target.restore();
      return true;
    }

    function drawOverlay(target) {
      if (!comic.enabled || editMode === "layers") return;
      const computed = layout();
      target.save();
      target.lineWidth = 2 / Math.max(0.25, canvasState().zoom || 1);
      for (const item of computed.panels) {
        if (item.id !== selectedPanelId) continue;
        target.strokeStyle = "#4fa3ff";
        target.setLineDash([8, 5]);
        target.strokeRect(item.rect.x, item.rect.y, item.rect.w, item.rect.h);
        target.setLineDash([]);
      }
      for (const divider of computed.dividers) {
        const centerX = divider.rect.x + divider.rect.w / 2;
        const centerY = divider.rect.y + divider.rect.h / 2;
        target.strokeStyle = "rgba(79,163,255,.8)";
        target.beginPath();
        if (divider.axis === "x") {
          target.moveTo(centerX, divider.rect.y);
          target.lineTo(centerX, divider.rect.y + divider.rect.h);
        } else {
          target.moveTo(divider.rect.x, centerY);
          target.lineTo(divider.rect.x + divider.rect.w, centerY);
        }
        target.stroke();
      }
      target.restore();
    }

    function handlePointerDown(event, point) {
      if (!comic.enabled || editMode === "layers") return false;
      const computed = layout();
      if (editMode === "panels") {
        const divider = core.dividerAt(computed, point, 12 / Math.max(0.25, canvasState().zoom || 1));
        if (divider) {
          options.pushUndo();
          drag = { type: "divider", divider, changed: false };
          return true;
        }
      }
      const hit = core.panelAt(computed, point);
      if (!hit) {
        selectedPanelId = null;
        drag = null;
        updateUi();
        options.requestRender({ canvas: true });
        return true;
      }
      selectedPanelId = hit.id;
      options.clearLayerSelection?.();
      if (editMode === "image" && hit.node.image_id) {
        options.pushUndo();
        drag = {
          type: "image",
          panel: hit.node,
          startX: point.x,
          startY: point.y,
          offsetX: hit.node.image_offset_x,
          offsetY: hit.node.image_offset_y,
          changed: false,
        };
      } else {
        drag = null;
      }
      updateUi();
      options.requestRender({ canvas: true });
      return true;
    }

    function handlePointerMove(event, point) {
      if (!drag) return false;
      if (drag.type === "divider") {
        const divider = drag.divider;
        const usable = Math.max(
          1,
          (divider.axis === "x" ? divider.container.w : divider.container.h) - comic.page.gutter,
        );
        const relative =
          divider.axis === "x"
            ? point.x - divider.container.x - comic.page.gutter / 2
            : point.y - divider.container.y - comic.page.gutter / 2;
        let ratio = relative / usable;
        if (event.shiftKey) {
          const snaps = [0.25, 1 / 3, 0.5, 2 / 3, 0.75];
          const nearest = snaps.reduce((best, value) =>
            Math.abs(value - ratio) < Math.abs(best - ratio) ? value : best,
          );
          if (Math.abs(nearest - ratio) * usable <= 8 / Math.max(0.25, canvasState().zoom || 1)) ratio = nearest;
        }
        divider.node.ratio = core.clamp(ratio, divider.range.minimum, divider.range.maximum);
        drag.changed = true;
      } else if (drag.type === "image") {
        drag.panel.image_offset_x = drag.offsetX + point.x - drag.startX;
        drag.panel.image_offset_y = drag.offsetY + point.y - drag.startY;
        drag.changed = true;
      }
      syncProperties();
      options.requestRender({ canvas: true });
      return true;
    }

    function handlePointerEnd() {
      if (!drag) return false;
      const changedValue = drag.changed;
      drag = null;
      if (changedValue) changed();
      return true;
    }

    function handleWheel(event) {
      if (!comic.enabled || editMode !== "image") return false;
      const panel = selectedPanel();
      if (!panel?.image_id) return false;
      options.pushUndo();
      panel.image_scale = core.clamp(panel.image_scale * (event.deltaY < 0 ? 1.08 : 0.92), 0.05, 5);
      syncProperties();
      changed();
      return true;
    }

    function handleImageDrop(transfer, point) {
      if (!comic.enabled) return false;
      const imageId = transfer?.getData?.(IMAGE_DRAG_TYPE);
      if (!imageId) return false;
      const panel = core.panelAt(layout(), point);
      if (!panel) {
        options.setStatus?.("画像はコマ内へドロップしてください。", "error");
        return true;
      }
      assignImage(panel.id, imageId);
      return true;
    }

    function handleContextMenu(event, point) {
      if (!comic.enabled) return false;
      const panel = core.panelAt(layout(), point);
      if (!panel) return false;
      selectedPanelId = panel.id;
      options.clearLayerSelection?.();
      if (editMode === "layers") editMode = "panels";
      updateUi();
      const menu = elements.contextMenu;
      menu.style.left = `${Math.min(event.clientX, window.innerWidth - 190)}px`;
      menu.style.top = `${Math.min(event.clientY, window.innerHeight - 230)}px`;
      menu.querySelector('[data-comic-context="remove-image"]').disabled = !panel.node.image_id;
      menu.hidden = false;
      options.requestRender({ canvas: true });
      return true;
    }

    function confirmExport() {
      if (!comic.enabled) return true;
      const warnings = [];
      const computed = layout();
      const emptyCount = computed.panels.filter((item) => !item.node.image_id).length;
      const missingCount = computed.panels.filter(
        (item) => item.node.image_id && item.node.image_id !== "source" && !runtimeImages.has(item.node.image_id),
      ).length;
      if (emptyCount) warnings.push(`空のコマ: ${emptyCount}件`);
      if (missingCount) warnings.push(`読み込めないコマ画像: ${missingCount}件`);
      if (computed.panels.some((item) => item.node.tone?.spacing < 4)) warnings.push("網点間隔が非常に小さいコマがあります");
      if (!warnings.length) return true;
      return confirm(`書き出し前チェック\n\n${warnings.join("\n")}\n\nこのまま書き出しますか？`);
    }

    function handleKeyDown(event) {
      const key = String(event.key || "").toLowerCase();
      if (!event.ctrlKey && !event.metaKey && !event.altKey && key === "p") {
        event.preventDefault();
        setEditMode("panels");
        return true;
      }
      if ((event.ctrlKey || event.metaKey) && event.altKey && (key === "h" || key === "v")) {
        event.preventDefault();
        if (!comic.enabled) setEditMode("panels");
        splitSelected(key === "h" ? "y" : "x");
        return true;
      }
      if (comic.enabled && editMode !== "layers" && event.key === "Enter") {
        event.preventDefault();
        setEditMode(editMode === "image" ? "panels" : "image");
        return true;
      }
      if (comic.enabled && editMode !== "layers" && event.key === "Escape") {
        event.preventDefault();
        setEditMode("layers");
        return true;
      }
      return false;
    }

    function changed() {
      used = true;
      options.requestRender({ canvas: true, layers: true, preview: true });
    }

    function serialize() {
      if (!used) return null;
      const clean = core.clone(comic);
      clean.page.width = canvasState().width;
      clean.page.height = canvasState().height;
      return clean;
    }

    function restore(raw, restoreOptions = {}) {
      const previousImages = comic.images;
      used = Boolean(raw);
      comic = core.normalizeState(raw, {
        width: canvasState().width,
        height: canvasState().height,
        makeId: uuid,
      });
      selectedPanelId = comic.enabled ? layout().panels[0]?.id || null : null;
      editMode = comic.enabled && restoreOptions.keepMode ? editMode : "layers";
      ensureSourceMetadata();
      updateUi();
      if (restoreOptions.hydrate !== false) {
        const changedDocument = hydratedDocumentId !== documentId();
        if (changedDocument) releaseStoredRuntimeImages();
        hydrateImages();
      } else {
        for (const metadata of previousImages) {
          if (!comic.images.some((item) => item.id === metadata.id)) continue;
          const runtime = runtimeImages.get(metadata.id);
          if (runtime) runtimeImages.set(metadata.id, runtime);
        }
      }
    }

    function scale(scaleX, scaleY) {
      comic.page.width = canvasState().width;
      comic.page.height = canvasState().height;
      for (const item of layout().panels) {
        item.node.image_offset_x *= scaleX;
        item.node.image_offset_y *= scaleY;
      }
    }

    function dispose() {
      for (const url of objectUrls) URL.revokeObjectURL(url);
      objectUrls.clear();
      runtimeImages.clear();
    }

    installUi();
    updateUi();

    return {
      IMAGE_DRAG_TYPE,
      isActive: () => comic.enabled,
      isEditing: () => comic.enabled && editMode !== "layers",
      importFiles,
      drawUnderlay,
      drawOverlay,
      handlePointerDown,
      handlePointerMove,
      handlePointerEnd,
      handleWheel,
      handleImageDrop,
      handleContextMenu,
      confirmExport,
      handleKeyDown,
      serialize,
      restore,
      scale,
      syncProperties,
      setEditMode,
      dispose,
    };
  }

  root.SpeechBubbleComicEditor = { create, IMAGE_DRAG_TYPE };
})(globalThis);
