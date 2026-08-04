(function (root) {
  "use strict";

  const core = root.SpeechBubbleComicCore;
  if (!core) throw new Error("SpeechBubbleComicCore must be loaded before comic-editor.js");

  const DB_NAME = "speech-bubble-editor-comic-images";
  const DB_STORE = "images";
  const IMAGE_DRAG_TYPE = "application/x-speech-bubble-comic-image";
  const MAX_IMAGE_BYTES = 96 * 1024 * 1024;
  const MAX_IMAGES = 100;
  const tonePatternCache = new Map();
  const tr = (ja, en) => document.documentElement.lang === "en" ? en : ja;
  const COMIC_SWATCHES = [
    "#111111", "#ffffff", "#9ca3af", "#ef4444", "#f97316", "#facc15", "#84cc16",
    "#22c55e", "#34d399", "#2dd4bf", "#38bdf8", "#60a5fa", "#3b82f6", "#6366f1",
    "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#8b7355", "#f5e6c8", "#fecaca",
    "#fde68a", "#fef3c7", "#a3b63f", "#4b806b",
  ];

  function colorSwatchesMarkup(scope, key) {
    return `<div class="comic-color-swatches" data-comic-color-scope="${scope}" data-comic-color-key="${key}">${COMIC_SWATCHES.map(
      (color) => `<button type="button" data-comic-color="${color}" title="${color}" style="--comic-swatch:${color}"></button>`,
    ).join("")}</div>`;
  }

  function backgroundPatterns() {
    return root.SpeechBubbleCanvasBackgroundPatterns || null;
  }

  function panelBackgroundPattern(panel) {
    const patterns = backgroundPatterns();
    if (!patterns || !panel) return null;
    return patterns.normalize({ color: panel.background || "#ffffff", ...(panel.background_pattern || {}), transparent: false });
  }

  function setPanelBackgroundPattern(panel, value) {
    const patterns = backgroundPatterns();
    if (!patterns || !panel) return null;
    const normalized = patterns.normalize({ color: panel.background || "#ffffff", ...(value || {}), transparent: false });
    normalized.transparent = false;
    panel.background = normalized.color;
    panel.background_pattern = normalized;
    return normalized;
  }

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
        reject(new Error(tr("画像を読み込めませんでした。", "The image could not be loaded.")));
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

  function createTrayDragGhost(name) {
    document.querySelectorAll(".comic-image-drag-ghost").forEach((node) => node.remove());
    const ghost = document.createElement("div");
    ghost.className = "comic-image-drag-ghost";
    ghost.textContent = tr(
      `画像を配置: ${String(name || "画像トレイ")}`,
      `Place image: ${String(name || "Image Tray")}`,
    );
    document.body.append(ghost);
    return ghost;
  }

  function create(options = {}) {
    let comic = core.defaultState(720, 2200, uuid);
    let used = false;
    let selectedPanelId = null;
    let selectedHeadingId = null;
    let selectedTarget = null;
    const selectedPanelImageIds = new Set();
    let panelImageSelectionAnchorId = null;
    let selectedTrayImageId = "";
    let activePanelPatternColor = "color";
    let drag = null;
    let hoverTarget = null;
    let pendingAssignPanelId = null;
    let hydratedDocumentId = "";
    const runtimeImages = new Map();
    const objectUrls = new Set();
    const elements = {};
    const imageStore = options.imageStore || {
      put: async (metadata, blob) => {
        await storeImageBlob(documentId(), metadata, blob);
        return metadata;
      },
      get: (imageId) => loadImageBlob(documentId(), imageId),
      remove: (imageId) => deleteImageBlob(documentId(), imageId),
    };

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
      const maximum = Math.max(0, Math.min(state.width, state.height) / 3);
      const left = core.clamp(comic.page.margin_left ?? comic.page.margin, 0, maximum);
      const right = core.clamp(comic.page.margin_right ?? comic.page.margin, 0, maximum);
      const topMargin = core.clamp(comic.page.margin_top ?? comic.page.margin, 0, maximum);
      const bottom = core.clamp(comic.page.margin_bottom ?? comic.page.margin, 0, maximum);
      const visibleHeadings = comic.headings.filter((heading) => heading.visible !== false);
      const headingBottom = visibleHeadings.length
        ? Math.max(...visibleHeadings.map((heading) => heading.y + heading.height))
        : topMargin;
      const top = Math.max(topMargin, headingBottom + comic.page.heading_gap);
      return {
        x: left,
        y: top,
        w: Math.max(1, state.width - left - right),
        h: Math.max(1, state.height - top - bottom),
      };
    }

    function layout() {
      return core.computeLayout(comic.tree, pageRect(), comic.page.gutter);
    }

    function panelRegion() {
      return pageRect();
    }

    function snapDistance() {
      return 8 / Math.max(0.25, canvasState().zoom || 1);
    }

    function snapHeadingToPanelEdges(heading) {
      const region = panelRegion();
      const distance = snapDistance();
      const left = Math.abs(heading.x - region.x) <= distance;
      const right = Math.abs(heading.x + heading.width - (region.x + region.w)) <= distance;
      if (left && right) {
        heading.x = Math.round(region.x);
        heading.width = Math.max(40, Math.round(region.w));
      } else if (left) {
        heading.x = Math.round(region.x);
      } else if (right) {
        heading.x = Math.round(region.x + region.w - heading.width);
      }
    }

    function fitHeadingToPanelWidth(heading) {
      const region = panelRegion();
      const x = Math.round(region.x);
      const width = Math.max(40, Math.round(region.w));
      if (heading.x === x && heading.width === width && heading.follow_panel_width !== false) return false;
      heading.x = x;
      heading.width = width;
      heading.follow_panel_width = true;
      return true;
    }

    function pageResizeHandleRect() {
      const size = 20 / Math.max(0.25, canvasState().zoom || 1);
      return {
        x: canvasState().width - size / 2,
        y: canvasState().height - size / 2,
        w: size,
        h: size,
      };
    }

    function selectedPanel() {
      const found = core.findNode(comic.tree, selectedPanelId);
      return found?.kind === "panel" ? found : null;
    }

    function panelEditable(panel) {
      return panel?.kind === "panel" && panel.locked !== true && panel.collapsed !== true;
    }

    function selectedHeading() {
      return comic.headings.find((heading) => heading.id === selectedHeadingId) || null;
    }

    function headingAt(point) {
      return [...comic.headings].reverse().find(
        (heading) =>
          heading.visible !== false &&
          point.x >= heading.x &&
          point.x <= heading.x + heading.width &&
          point.y >= heading.y &&
          point.y <= heading.y + heading.height,
      ) || null;
    }

    function ensureSourceMetadata() {
      const source = sourceImage();
      if (!source?.naturalWidth || !source?.naturalHeight) return;
      const metadata = comic.images.find((item) => item.id === "source");
      if (!metadata) return;
      metadata.width = source.naturalWidth;
      metadata.height = source.naturalHeight;
      metadata.name = String(options.getSourceName?.() || metadata.name);
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
              const blob = await imageStore.get(metadata.id);
              if (blob && hydratedDocumentId === targetDocument) await attachBlob(metadata, blob);
            } catch (error) {
              console.warn("Speech Bubble comic image restore failed", metadata.id, error);
            }
          }),
      );
      renderTray();
      options.requestRender({ canvas: true });
    }

    function enableRealtimePanelPatternSelectWheel(select) {
      select?.addEventListener("wheel", (event) => {
        if (!comic.enabled || document.activeElement !== select) return;
        const options = Array.from(select.options);
        const index = options.findIndex((option) => option.value === select.value);
        const next = Math.max(0, Math.min(options.length - 1, index + (event.deltaY > 0 ? 1 : -1)));
        if (next === index) return;
        event.preventDefault();
        select.value = options[next].value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }, { passive: false });
    }

    function installUi() {
      const header = document.querySelector("body > header");
      const modeHost = header?.querySelector("[data-toolbar-mode-host]");
      const spacer = header?.querySelector(".spacer");
      if (options.modeController?.element) {
        elements.modeToggle = options.modeController.element;
      } else if (header && (modeHost || spacer)) {
        const toggle = document.createElement("div");
        toggle.className = "comic-mode-toggle segmented";
        toggle.setAttribute("role", "group");
        toggle.setAttribute("aria-label", "編集モード");
        toggle.innerHTML =
          '<button type="button" data-comic-mode="single" class="active">一枚画像</button>' +
          '<button type="button" data-comic-mode="comic">4コマ漫画</button>';
        if (modeHost) modeHost.append(toggle);
        else spacer.before(toggle);
        elements.modeToggle = toggle;
      }

      const canvasPanel = document.querySelector(".canvas-panel");
      const footer = canvasPanel?.querySelector(".footer");
      if (canvasPanel && footer) {
        const tray = document.createElement("section");
        tray.className = "comic-image-tray collapsed";
        tray.hidden = true;
        tray.innerHTML = `
          <div class="comic-tray-heading">
            <button class="comic-tray-toggle" type="button" data-comic-action="tray-toggle" aria-expanded="false">
              <span>画像トレイ</span><span data-comic-image-count>0枚</span>
            </button>
            <button type="button" data-comic-action="add-images">＋ 画像を追加</button>
          </div>
          <div class="comic-tray-list"></div>
          <input data-comic-image-input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden>
        `;
        footer.parentElement?.insertBefore(tray, footer);
        elements.tray = tray;
        elements.trayList = tray.querySelector(".comic-tray-list");
        elements.imageInput = tray.querySelector("[data-comic-image-input]");
        if ("ResizeObserver" in window) new ResizeObserver(syncTrayViewport).observe(tray);
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
            <div class="comic-properties-title-main">
              <strong data-comic-selection-name>漫画ページ</strong>
              <label class="comic-heading-title-toggle comic-page-title-lock" data-comic-page-title-lock hidden>
                <input data-comic-page="structure_locked" type="checkbox"><span data-comic-page-lock-label>コマ割りをロック</span>
              </label>
              <label class="comic-heading-title-toggle" data-comic-heading-title-toggle hidden>
                <input data-comic-heading="visible" type="checkbox"><span>見出しを表示</span>
              </label>
            </div>
            <span data-comic-selection-kind>ページ</span>
          </div>
          <section data-comic-properties="page">
            <strong>縦4コマ</strong>
            <div class="comic-template-grid">
              <button type="button" data-comic-template="vertical_four">標準4コマ</button>
            </div>
            <div class="comic-two-column">
              <label>キャンバス幅<input data-comic-canvas="width" type="number" min="320" max="8192" step="1"></label>
              <label>キャンバス高さ<input data-comic-canvas="height" type="number" min="480" max="16384" step="1"></label>
            </div>
            <div class="comic-page-checks comic-page-checks-primary">
              <label class="comic-check"><input data-comic-page="canvas_ratio_locked" type="checkbox">縦横比を固定</label>
            </div>
            <button class="comic-canvas-reset" type="button" data-comic-action="canvas-reset">標準へ戻す（720 × 2200）</button>
            <button type="button" data-comic-action="reset-panel-heights">${tr("コマ高さを均等に戻す", "Reset Panel Heights")}</button>
            <div class="comic-frame-style segmented" role="group" aria-label="フレーム配色">
              <button type="button" data-comic-frame-style="white">白地・黒線</button>
              <button type="button" data-comic-frame-style="black">黒地・白線</button>
            </div>
            <div class="comic-two-column">
              <label>枠線幅<input data-comic-page="border_width" type="number" min="0" max="64" step="0.5"></label>
              <label>コマ間隔<input data-comic-page="gutter" type="number" min="0" max="1024" step="1"></label>
            </div>
            <label class="comic-heading-gap-control">見出し―1コマ目の間隔
              <span class="comic-range-number">
                <input data-comic-page="heading_gap" type="range" min="0" max="1024" step="1">
                <input data-comic-page="heading_gap" type="number" min="0" max="1024" step="1">
              </span>
            </label>
            <label>ページ背景<input data-comic-page="background" type="color"></label>
            ${colorSwatchesMarkup("page", "background")}
            <label>枠線色<input data-comic-page="border_color" type="color"></label>
            ${colorSwatchesMarkup("page", "border_color")}
            <div class="comic-margin-row">
              <label class="comic-check"><input data-comic-page="margin_linked" type="checkbox">連動</label>
              <label>上<input data-comic-page="margin_top" type="number" min="0" max="2048" step="1"></label>
              <label>右<input data-comic-page="margin_right" type="number" min="0" max="2048" step="1"></label>
              <label>下<input data-comic-page="margin_bottom" type="number" min="0" max="2048" step="1"></label>
              <label>左<input data-comic-page="margin_left" type="number" min="0" max="2048" step="1"></label>
            </div>
            <p class="hint">${tr("漫画ページのロックを解除すると、コマ間の青いドラッグバー（↕）を上下に動かして高さを変更できます。", "Unlock the comic page, then drag the blue ↕ handle between panels to change their heights.")}</p>
          </section>
          <section data-comic-properties="panel" hidden>
            <button type="button" data-comic-action="select-page">ページ設定</button>
            <button type="button" class="comic-panel-collapse-action" data-comic-action="toggle-panel-collapse"></button>
            <p class="hint" data-comic-panel-collapse-hint></p>
            <label>背景の種類<select data-comic-panel-pattern-select="type"></select></label>
            <label>内蔵プリセット<select data-comic-panel-pattern-select="preset"></select></label>
            <div data-comic-panel-pattern-colors>
              <label data-comic-panel-pattern-color-label="color">背景色<input data-comic-panel-pattern-color="color" type="color"></label>
              <label data-comic-panel-pattern-color-label="patternColor">パターン色<input data-comic-panel-pattern-color="patternColor" type="color"></label>
              <label data-comic-panel-pattern-color-label="color2" hidden>終了色<input data-comic-panel-pattern-color="color2" type="color"></label>
            </div>
            <div class="compact-swatch-controls" data-comic-panel-pattern-swatch-controls><span class="control-label">スウォッチ</span><div class="segmented"><button type="button" data-comic-panel-pattern-color-target="color">背景</button><button type="button" data-comic-panel-pattern-color-target="patternColor">パターン</button><button type="button" data-comic-panel-pattern-color-target="color2">終了色</button></div></div>
            ${colorSwatchesMarkup("panel-pattern", "color")}
            <div data-comic-panel-pattern-fields></div>
            <button type="button" data-comic-action="randomize-panel-pattern" hidden>ランダム化</button>
            <button type="button" data-comic-action="choose-panel-image">＋ コマ画像を選択</button>
          </section>
          <section data-comic-properties="heading" hidden>
            <label>Fill<input data-comic-heading="background" type="color"></label>
            ${colorSwatchesMarkup("heading", "background")}
            <label>Outline<input data-comic-heading="border_color" type="color"></label>
            ${colorSwatchesMarkup("heading", "border_color")}
            <label>Outline Width<input data-comic-heading="border_width" type="number" min="0" max="64" step="1"></label>
            <div class="comic-two-column">
              <label>幅<input data-comic-heading="width" type="number" min="40" step="1"></label>
              <label>高さ<input data-comic-heading="height" type="number" min="24" step="1"></label>
            </div>
            <div class="comic-two-column">
              <label>位置 X<input data-comic-heading="x" type="number" step="1"></label>
              <label>位置 Y<input data-comic-heading="y" type="number" step="1"></label>
            </div>
            <div class="comic-heading-visibility-row">
              <span class="comic-property-hint" data-comic-heading-edit-hint></span>
            </div>
            <button type="button" data-comic-action="fit-heading-to-panel-width">${tr("見出しをコマ幅へ合わせる", "Fit Heading to Panel Width")}</button>
            <button type="button" data-comic-action="reset-heading">位置・サイズを標準へ戻す</button>
            <p class="hint">見出しBoxには文字を含めません。文字は通常のTextレイヤーを配置してください。</p>
          </section>
          <section data-comic-properties="image" hidden>
            <div class="comic-image-property-summary">
              <div data-comic-selected-thumbnail class="comic-image-preview"></div>
              <span data-comic-image-name>画像なし</span>
            </div>
            <div class="comic-two-column">
              <button type="button" data-comic-action="remove-panel-image">画像を外す</button>
            </div>
            <label>画像倍率
              <input data-comic-property="image_scale" type="range" min="0.05" max="5" step="0.01">
              <output data-comic-output="image_scale"></output>
            </label>
            <div class="comic-two-column">
              <label>位置 X<input data-comic-property="image_offset_x" type="number" step="1"></label>
              <label>位置 Y<input data-comic-property="image_offset_y" type="number" step="1"></label>
            </div>
            <button type="button" data-comic-action="fit-reset">画像位置を中央へ戻す</button>
            <p class="hint">Canvas上でドラッグして移動、Ctrl＋ホイールで拡大・縮小できます。</p>
          </section>
        `;
        empty.parentNode.insertBefore(properties, empty);
        elements.properties = properties;
        enableRealtimePanelPatternSelectWheel(properties.querySelector('[data-comic-panel-pattern-select="type"]'));
        enableRealtimePanelPatternSelectWheel(properties.querySelector('[data-comic-panel-pattern-select="preset"]'));
      }

      const contextMenu = document.createElement("div");
      contextMenu.className = "comic-context-menu";
      contextMenu.hidden = true;
      contextMenu.innerHTML = `
        <button type="button" data-comic-context="reset-image">画像位置を中央へ戻す</button>
        <button type="button" data-comic-context="remove-image">画像を外す</button>
      `;
      document.body.append(contextMenu);
      elements.contextMenu = contextMenu;

      if (!options.modeController) {
        elements.modeToggle?.addEventListener("click", (event) => {
          const button = event.target.closest("[data-comic-mode]");
          if (!button) return;
          setEditMode(button.dataset.comicMode);
        });
      }
      elements.tray?.addEventListener("click", (event) => {
        const actionButton = event.target.closest("[data-comic-action]");
        const action = actionButton?.dataset.comicAction;
        const card = event.target.closest("[data-comic-image-id]");
        if (action === "tray-toggle") {
          const collapsed = elements.tray.classList.toggle("collapsed");
          actionButton.setAttribute("aria-expanded", String(!collapsed));
          syncTrayViewport();
        } else if (action === "add-images") {
          elements.imageInput.click();
        } else if (action === "remove-image" && card) {
          removeTrayImage(card.dataset.comicImageId);
        } else if (card) {
          selectedTrayImageId = card.dataset.comicImageId || "";
          renderTray();
        }
      });
      elements.imageInput?.addEventListener("change", async () => {
        const importedIds = await importFiles([...elements.imageInput.files]);
        if (pendingAssignPanelId && importedIds[0]) assignImage(pendingAssignPanelId, importedIds[0]);
        pendingAssignPanelId = null;
        elements.imageInput.value = "";
      });
      elements.properties?.addEventListener("input", handlePropertyInput);
      elements.properties?.addEventListener("change", handlePropertyChange);
      function updatePageControl(input) {
        if (!input.dataset.comicEditing) {
          options.pushUndo();
          input.dataset.comicEditing = "1";
        }
        const key = input.dataset.comicPage;
        if (input.type === "checkbox") {
          comic.page[key] = input.checked;
          if (key === "margin_linked" && input.checked) {
            const linked = comic.page.margin_top ?? comic.page.margin ?? 0;
            for (const marginKey of ["margin_top", "margin_right", "margin_bottom", "margin_left"]) comic.page[marginKey] = linked;
            comic.page.margin = linked;
          }
        }
        else if (input.type === "color") comic.page[key] = input.value;
        else {
          const maximum = key === "gutter" || key === "heading_gap" ? 1024 : key.startsWith("margin_") ? 2048 : 64;
          comic.page[key] = Math.round(core.clamp(input.value, 0, maximum));
          if (key.startsWith("margin_") && comic.page.margin_linked) {
            for (const marginKey of ["margin_top", "margin_right", "margin_bottom", "margin_left"]) {
              comic.page[marginKey] = comic.page[key];
            }
            comic.page.margin = comic.page[key];
          }
        }
        updateUi();
        options.requestRender({ canvas: true, layers: true });
      }
      elements.properties?.addEventListener("input", (event) => {
        const input = event.target.closest("[data-comic-page]");
        if (input) updatePageControl(input);
      });
      elements.properties?.addEventListener("change", (event) => {
        const input = event.target.closest("[data-comic-page]");
        if (!input) return;
        if (!input.dataset.comicEditing) updatePageControl(input);
        delete input.dataset.comicEditing;
        changed();
      });
      elements.properties?.addEventListener("input", (event) => {
        const input = event.target.closest("[data-comic-canvas]");
        if (!input) return;
        if (!input.dataset.comicEditing) {
          options.pushUndo();
          input.dataset.comicEditing = "1";
        }
        const state = canvasState();
        const key = input.dataset.comicCanvas;
        const currentWidth = Math.max(1, state.width);
        const currentHeight = Math.max(1, state.height);
        let width = key === "width" ? Math.round(core.clamp(input.value, 320, 8192)) : currentWidth;
        let height = key === "height" ? Math.round(core.clamp(input.value, 480, 16384)) : currentHeight;
        if (comic.page.canvas_ratio_locked) {
          const ratio = currentWidth / currentHeight;
          if (key === "width") height = Math.max(480, Math.round(width / ratio));
          else width = Math.max(320, Math.round(height * ratio));
        }
        options.resizeCanvas?.(width, height);
        comic.page.width = width;
        comic.page.height = height;
        updateUi();
        options.requestRender({ canvas: true, layers: true });
      });
      elements.properties?.addEventListener("change", (event) => {
        const input = event.target.closest("[data-comic-canvas]");
        if (!input) return;
        delete input.dataset.comicEditing;
        changed();
      });
      elements.properties?.addEventListener("input", (event) => {
        const input = event.target.closest("[data-comic-heading]");
        const heading = selectedHeading();
        if (!input || !heading) return;
        if (!input.dataset.comicEditing) {
          options.pushUndo();
          input.dataset.comicEditing = "1";
        }
        const key = input.dataset.comicHeading;
        if (input.type === "checkbox") heading[key] = input.checked;
        else if (input.type === "color") heading[key] = input.value;
        else {
          const minimum = input.min === "" ? -Infinity : Number(input.min);
          const maximum = input.max === "" ? Infinity : Number(input.max);
          heading[key] = Math.max(minimum, Math.min(maximum, Math.round(Number(input.value) || 0)));
          if (["x", "y", "width", "height"].includes(key)) heading.follow_panel_width = false;
        }
        options.requestRender({ canvas: true });
      });
      elements.properties?.addEventListener("change", (event) => {
        const input = event.target.closest("[data-comic-heading]");
        if (!input) return;
        delete input.dataset.comicEditing;
        changed();
      });
      elements.properties?.addEventListener("input", (event) => {
        const input = event.target.closest("[data-comic-panel-pattern-color],[data-comic-panel-pattern-field]");
        const panel = selectedPanel();
        if (!input || !panel) return;
        if (!input.dataset.comicEditing) {
          options.pushUndo();
          input.dataset.comicEditing = "1";
        }
        const value = panelBackgroundPattern(panel);
        if (!value) return;
        const key = input.dataset.comicPanelPatternColor || input.dataset.comicPanelPatternField;
        value[key] = input.type === "color" ? input.value : Number(input.value);
        setPanelBackgroundPattern(panel, value);
        if (input.dataset.comicPanelPatternField) input.nextElementSibling.textContent = input.value;
        options.requestRender({ canvas: true });
      });
      elements.properties?.addEventListener("change", (event) => {
        const input = event.target.closest("[data-comic-panel-pattern-color],[data-comic-panel-pattern-field]");
        if (!input) return;
        delete input.dataset.comicEditing;
        updateUi();
        changed();
      });
      elements.properties?.addEventListener("change", (event) => {
        const select = event.target.closest("[data-comic-panel-pattern-select]");
        const panel = selectedPanel();
        const patterns = backgroundPatterns();
        if (!select || !panel || !patterns) return;
        options.pushUndo();
        const value = panelBackgroundPattern(panel);
        if (!value) return;
        if (select.dataset.comicPanelPatternSelect === "type") {
          setPanelBackgroundPattern(panel, { type: select.value, color: value.color, patternColor: value.patternColor, color2: value.color2 });
        } else {
          const type = patterns.TYPES.find((item) => item.id === value.type);
          const preset = type?.presets.find((item) => item.id === select.value);
          if (!preset) return;
          setPanelBackgroundPattern(panel, { ...value, ...preset.values, preset: preset.id });
        }
        updateUi();
        changed();
      });
      elements.properties?.addEventListener("click", (event) => {
        const template = event.target.closest("[data-comic-template]")?.dataset.comicTemplate;
        const frameStyle = event.target.closest("[data-comic-frame-style]")?.dataset.comicFrameStyle;
        const panelBackground = event.target.closest("[data-comic-panel-background]")?.dataset.comicPanelBackground;
        const panelPatternColorTarget = event.target.closest("[data-comic-panel-pattern-color-target]")?.dataset.comicPanelPatternColorTarget;
        const colorButton = event.target.closest("[data-comic-color]");
        const colorHost = colorButton?.closest("[data-comic-color-scope]");
        const action = event.target.closest("[data-comic-action]")?.dataset.comicAction;
        const panel = selectedPanel();
        if (panelPatternColorTarget) {
          activePanelPatternColor = panelPatternColorTarget;
          updateUi();
        } else if (colorButton && colorHost) {
          const key = colorHost.dataset.comicColorKey;
          const color = colorButton.dataset.comicColor;
          const scope = colorHost.dataset.comicColorScope;
          const target = scope === "heading"
            ? selectedHeading()
            : scope === "panel-pattern"
              ? panelBackgroundPattern(panel)
              : scope === "panel"
                ? panel
                : comic.page;
          if (!target || !key) return;
          options.pushUndo();
          target[key] = color;
          if (scope === "panel-pattern") setPanelBackgroundPattern(panel, target);
          updateUi();
          changed();
        } else if (template) {
          applyTemplate(template);
        } else if (frameStyle) {
          options.pushUndo();
          comic.page.frame_style = frameStyle;
          comic.page.background = frameStyle === "black" ? "#000000" : "#ffffff";
          comic.page.border_color = frameStyle === "black" ? "#ffffff" : "#111111";
          updateUi();
          changed();
        } else if (panelBackground && panel) {
          options.pushUndo();
          panel.background = panelBackground;
          updateUi();
          changed();
        } else if (action === "randomize-panel-pattern" && panel) {
          const patterns = backgroundPatterns();
          const value = panelBackgroundPattern(panel);
          if (!patterns || !value) return;
          options.pushUndo();
          setPanelBackgroundPattern(panel, { ...value, seed: patterns.randomSeed() });
          updateUi();
          changed();
        } else if (action === "canvas-reset") {
          options.pushUndo();
          const size = [720, 2200];
          options.resizeCanvas?.(...size);
          comic.page.width = size[0];
          comic.page.height = size[1];
          comic.page.background = "#ffffff";
          comic.page.border_color = "#111111";
          comic.page.border_width = 5;
          comic.page.gutter = 40;
          comic.page.margin = 80;
          comic.page.margin_linked = true;
          comic.page.margin_top = 80;
          comic.page.margin_right = 80;
          comic.page.margin_bottom = 80;
          comic.page.margin_left = 80;
          comic.page.canvas_ratio_locked = false;
          comic.page.heading_gap = 30;
          comic.page.frame_style = "white";
          const standardHeading = core.createHeadings("vertical_four", size[0], uuid)[0];
          if (comic.headings.length) {
            Object.assign(comic.headings[0], {
              x: standardHeading.x,
              y: standardHeading.y,
              width: standardHeading.width,
              height: standardHeading.height,
            });
          } else {
            comic.headings = [standardHeading];
          }
          updateUi();
          changed();
        } else if (action === "reset-panel-heights") {
          if (comic.page.structure_locked) return;
          const previewTree = core.clone(comic.tree);
          if (!core.resetVerticalFourRatios(previewTree)) return;
          options.pushUndo();
          core.resetVerticalFourRatios(comic.tree);
          updateUi();
          changed();
        } else if (action === "toggle-panel-collapse" && panel) {
          if (comic.page.structure_locked !== false || drag) return;
          const collapsing = panel.collapsed !== true;
          if (collapsing && core.countExpandedPanels(comic.tree) <= 1) return;
          options.pushUndo();
          panel.collapsed = collapsing;
          selectedPanelImageIds.delete(panel.id);
          if (panelImageSelectionAnchorId === panel.id) panelImageSelectionAnchorId = null;
          selectedPanelId = panel.id;
          selectedTarget = "panel";
          updateUi();
          changed();
        } else if (action === "reset-heading") {
          const heading = selectedHeading();
          if (!heading) return;
          options.pushUndo();
          const standard = core.createHeadings("vertical_four", canvasState().width, uuid)[0];
          heading.x = standard.x;
          heading.y = standard.y;
          heading.width = standard.width;
          heading.height = standard.height;
          heading.follow_panel_width = true;
          updateUi();
          changed();
        } else if (action === "fit-heading-to-panel-width") {
          const heading = selectedHeading();
          if (!heading || comic.page.structure_locked || !fitHeadingToPanelWidth({ ...heading })) return;
          options.pushUndo();
          fitHeadingToPanelWidth(heading);
          updateUi();
          changed();
        } else if (action === "select-page") {
          selectedTarget = "page";
          updateUi();
          options.requestRender({ canvas: true, layers: true });
        } else if (action === "choose-panel-image" && panel) {
          pendingAssignPanelId = panel.id;
          elements.imageInput.click();
        } else if (action === "fit-reset" && panel) {
          options.pushUndo();
          panel.image_scale = 1;
          panel.image_offset_x = 0;
          panel.image_offset_y = 0;
          updateUi();
          changed();
        } else if (action === "remove-panel-image" && panel?.image_id) {
          options.pushUndo();
          panel.image_id = null;
          selectedPanelImageIds.delete(panel.id);
          selectedTarget = "panel";
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
        if (action === "reset-image" && panel.image_id) {
          options.pushUndo();
          panel.image_scale = 1;
          panel.image_offset_x = 0;
          panel.image_offset_y = 0;
          updateUi();
          changed();
        } else if (action === "remove-image" && panel.image_id) {
          options.pushUndo();
          panel.image_id = null;
          selectedPanelImageIds.delete(panel.id);
          selectedTarget = "panel";
          updateUi();
          changed();
        }
      });
      document.addEventListener("pointerdown", (event) => {
        if (!event.target.closest(".comic-context-menu")) contextMenu.hidden = true;
      });
    }

    function setActive(enable, control = {}) {
      const enableComic = Boolean(enable);
      const switchWorkspace = control.switchWorkspace !== false;
      const recordUndo = control.recordUndo !== false;
      if (comic.enabled === enableComic) {
        if (switchWorkspace) options.switchWorkspace?.(enableComic ? "comic" : "single");
        updateUi();
        options.syncProperties?.();
        options.syncActionState?.();
        if (control.fitView !== false) requestAnimationFrame(() => options.fitView?.(false));
        return true;
      }
      if (recordUndo) options.pushUndo();
      if (switchWorkspace) options.switchWorkspace?.(enableComic ? "comic" : "single");
      if (enableComic && !used) {
        options.resizeCanvas?.(720, 2200);
        comic = core.defaultState(720, 2200, uuid);
      }
      comic.enabled = enableComic;
      drag = null;
      if (enableComic) {
        used = true;
        if (!core.PUBLIC_TEMPLATE_IDS.has(comic.template_id)) {
          comic.template_id = "vertical_four";
          comic.tree = core.createTemplate("vertical_four", uuid);
          comic.headings = core.createHeadings("vertical_four", canvasState().width, uuid);
          comic.page.gutter = 40;
        }
        ensureSourceMetadata();
        selectedPanelId ||= layout().panels[0]?.id || null;
        selectedTarget = selectedPanelId ? "panel" : "page";
        options.clearLayerSelection?.();
      } else {
        selectedTarget = null;
      }
      updateUi();
      options.syncProperties?.();
      options.syncActionState?.();
      if (control.fitView !== false) requestAnimationFrame(() => options.fitView?.(false));
      if (control.notify !== false) changed();
      return true;
    }

    function setEditMode(requested, control = {}) {
      return setActive(requested === "comic", control);
    }

    function updateUi() {
      ensureSourceMetadata();
      if (!options.modeController) {
        elements.modeToggle?.querySelectorAll("[data-comic-mode]").forEach((button) => {
          const active = button.dataset.comicMode === "single" ? !comic.enabled : comic.enabled;
          button.classList.toggle("active", active);
          button.setAttribute("aria-pressed", String(active));
        });
      }
      if (elements.tray) elements.tray.hidden = !comic.enabled;
      document.querySelector(".canvas-panel")?.classList.toggle("comic-active", comic.enabled);
      renderTray();
      syncTrayViewport();
      syncProperties();
      options.syncInsertTargetStatus?.();
    }

    function rebuildPanelBackgroundPatternProperties(panel) {
      const patterns = backgroundPatterns();
      if (!patterns || !elements.properties || !panel) return;
      const value = panelBackgroundPattern(panel);
      if (!value) return;
      const type = patterns.TYPES.find((item) => item.id === value.type) || patterns.TYPES[0];
      const typeSelect = elements.properties.querySelector('[data-comic-panel-pattern-select="type"]');
      const presetSelect = elements.properties.querySelector('[data-comic-panel-pattern-select="preset"]');
      if (!typeSelect || !presetSelect) return;
      typeSelect.replaceChildren(...patterns.TYPES.map((item) => new Option(tr(item.ja, item.en), item.id)));
      typeSelect.value = type.id;
      presetSelect.replaceChildren(...type.presets.map((item) => new Option(tr(item.ja, item.en), item.id)));
      presetSelect.value = value.preset;
      for (const input of elements.properties.querySelectorAll('[data-comic-panel-pattern-color]')) {
        input.value = value[input.dataset.comicPanelPatternColor];
      }
      const gradient = type.id === "linear-gradient" || type.id === "radial-gradient";
      const solid = type.id === "solid";
      elements.properties.querySelector('[data-comic-panel-pattern-color-label="patternColor"]').hidden = solid;
      elements.properties.querySelector('[data-comic-panel-pattern-color-label="color2"]').hidden = !gradient;
      if (solid && activePanelPatternColor !== "color") activePanelPatternColor = "color";
      if (!gradient && activePanelPatternColor === "color2") activePanelPatternColor = "color";
      for (const button of elements.properties.querySelectorAll('[data-comic-panel-pattern-color-target]')) {
        const key = button.dataset.comicPanelPatternColorTarget;
        button.hidden = (key === "patternColor" && solid) || (key === "color2" && !gradient);
        button.classList.toggle("active", key === activePanelPatternColor);
      }
      const swatches = elements.properties.querySelector('[data-comic-color-scope="panel-pattern"]');
      if (swatches) swatches.dataset.comicColorKey = activePanelPatternColor;
      const fields = elements.properties.querySelector('[data-comic-panel-pattern-fields]');
      fields.replaceChildren(...type.fields.map((key) => {
        const definition = patterns.FIELDS[key];
        const label = document.createElement("label");
        const row = document.createElement("div");
        const range = document.createElement("input");
        const output = document.createElement("output");
        label.className = "canvas-background-field";
        label.append(tr(definition.ja, definition.en));
        row.className = "range-output-row";
        range.type = "range";
        range.min = definition.min;
        range.max = definition.max;
        range.step = definition.step;
        range.value = value[key];
        range.dataset.comicPanelPatternField = key;
        output.textContent = String(value[key]);
        row.append(range, output);
        label.append(row);
        return label;
      }));
      const randomize = elements.properties.querySelector('[data-comic-action="randomize-panel-pattern"]');
      if (randomize) randomize.hidden = !type.fields.includes("seed");
    }

    function syncProperties() {
      const panel = selectedPanel();
      const imagePanels = selectedImagePanels();
      const heading = selectedHeading();
      const active = comic.enabled && Boolean(selectedTarget) && !options.hasLayerSelection?.();
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
      const panelIndex = panel ? core.collectPanels(comic.tree).findIndex((item) => item.id === panel.id) + 1 : 0;
      const target = selectedTarget === "image" && !panel?.image_id ? "panel" : selectedTarget;
      elements.properties.querySelector("[data-comic-selection-name]").textContent =
        target === "page"
          ? tr("漫画ページ", "Comic Page")
          : target === "heading"
            ? tr("見出し", "Header Box")
            : target === "image"
              ? imagePanels.length > 1
                ? tr(`${imagePanels.length}個のコマ画像を選択中`, `${imagePanels.length} panel images selected`)
                : tr(`コマ ${panelIndex}の画像`, `Panel ${panelIndex} Image`)
              : tr(`コマ ${panelIndex}`, `Panel ${panelIndex}`);
      const selectionKind = elements.properties.querySelector("[data-comic-selection-kind]");
      selectionKind.textContent =
        target === "page" ? tr("ページ", "Page") : target === "heading" ? tr("見出し", "Header") : target === "image" ? tr("画像", "Image") : tr("コマ", "Panel");
      selectionKind.hidden = target === "heading" || target === "page";
      elements.properties.querySelector("[data-comic-heading-title-toggle]").hidden = target !== "heading";
      const pageTitleLock = elements.properties.querySelector("[data-comic-page-title-lock]");
      if (pageTitleLock) pageTitleLock.hidden = target !== "page";
      const pageLockLabel = elements.properties.querySelector("[data-comic-page-lock-label]");
      if (pageLockLabel) pageLockLabel.textContent = tr("コマ割りをロック", "Lock Panel Layout");
      elements.properties.querySelectorAll("[data-comic-properties]").forEach((section) => {
        section.hidden = section.dataset.comicProperties !== target;
      });
      const structureLocked = comic.page.structure_locked !== false;
      const collapsePanel = elements.properties.querySelector('[data-comic-action="toggle-panel-collapse"]');
      const collapseHint = elements.properties.querySelector("[data-comic-panel-collapse-hint]");
      if (collapsePanel) {
        const collapsed = panel?.collapsed === true;
        collapsePanel.textContent = collapsed ? tr("コマを表示", "Show Panel") : tr("コマを非表示", "Hide Panel");
        collapsePanel.classList.toggle("is-restoring", collapsed);
        collapsePanel.disabled = !panel || structureLocked || Boolean(drag) || (!collapsed && core.countExpandedPanels(comic.tree) <= 1);
        collapsePanel.title = structureLocked
          ? tr("漫画ページのロックを解除してください", "Unlock the comic page to change panel visibility.")
          : !collapsed && core.countExpandedPanels(comic.tree) <= 1
            ? tr("少なくとも1つのコマを表示したままにしてください", "Keep at least one panel visible.")
            : "";
      }
      if (collapseHint) collapseHint.textContent = tr(
        "内容を保持したままコマを非表示にし、残りのコマを自動的に詰めます。",
        "Hides the panel while preserving its content. The remaining panels reflow automatically.",
      );
      const resetPanelHeights = elements.properties.querySelector('[data-comic-action="reset-panel-heights"]');
      if (resetPanelHeights) {
        resetPanelHeights.disabled = structureLocked;
        resetPanelHeights.title = structureLocked
          ? tr("漫画ページのロックを解除してください", "Unlock the comic page to reset panel heights.")
          : "";
      }
      const fitHeading = elements.properties.querySelector('[data-comic-action="fit-heading-to-panel-width"]');
      if (fitHeading) {
        fitHeading.disabled = structureLocked || !heading;
        fitHeading.title = structureLocked
          ? tr("漫画ページのロックを解除してください", "Unlock the comic page to fit the heading.")
          : "";
      }
      const headingHint = elements.properties.querySelector("[data-comic-heading-edit-hint]");
      if (headingHint) headingHint.textContent = structureLocked
        ? tr("漫画ページのロックを解除すると、Canvas上で移動・サイズ変更できます。", "Unlock the comic page to move or resize the heading on the canvas.")
        : tr("Canvas上で見出しを移動・サイズ変更できます。", "Move or resize the heading on the canvas.");
      for (const input of elements.properties.querySelectorAll("[data-comic-page]")) {
        const key = input.dataset.comicPage;
        if (input.type === "checkbox") input.checked = Boolean(comic.page[key]);
        else input.value = comic.page[key];
      }
      for (const input of elements.properties.querySelectorAll("[data-comic-canvas]")) {
        if (document.activeElement !== input) input.value = Math.round(canvasState()[input.dataset.comicCanvas] || 0);
      }
      elements.properties.querySelectorAll("[data-comic-frame-style]").forEach((button) => {
        button.classList.toggle("active", button.dataset.comicFrameStyle === comic.page.frame_style);
      });
      elements.properties.querySelectorAll("[data-comic-template]").forEach((button) => {
        button.classList.toggle("active", button.dataset.comicTemplate === comic.template_id);
      });
      elements.properties.querySelectorAll("[data-comic-panel-background]").forEach((button) => {
        button.classList.toggle("active", Boolean(panel) && button.dataset.comicPanelBackground === panel.background);
      });
      for (const input of elements.properties.querySelectorAll("[data-comic-property]")) {
        const key = input.dataset.comicProperty;
        const value = panel?.[key];
        if (input.type === "checkbox") input.checked = Boolean(value);
        else input.value = key === "image_offset_x" || key === "image_offset_y" ? Math.round(Number(value) || 0) : value ?? "";
      }
      elements.properties.querySelectorAll('[data-comic-properties="image"] [data-comic-property]').forEach((input) => {
        input.disabled = imagePanels.length > 1;
      });
      for (const input of elements.properties.querySelectorAll("[data-comic-heading]")) {
        const key = input.dataset.comicHeading;
        if (input.type === "checkbox") input.checked = Boolean(heading?.[key]);
        else input.value = input.type === "number" && Number.isFinite(Number(heading?.[key]))
          ? String(Math.round(Number(heading[key])))
          : heading?.[key] ?? "";
      }
      if (target === "panel" && panel) rebuildPanelBackgroundPatternProperties(panel);
      for (const host of elements.properties.querySelectorAll("[data-comic-color-scope]")) {
        const scope = host.dataset.comicColorScope;
        const targetValue = scope === "heading"
          ? heading
          : scope === "panel-pattern"
            ? panelBackgroundPattern(panel)
            : scope === "panel"
              ? panel
              : comic.page;
        const selectedColor = String(targetValue?.[host.dataset.comicColorKey] || "").toLowerCase();
        host.querySelectorAll("[data-comic-color]").forEach((button) => {
          button.classList.toggle("active", button.dataset.comicColor.toLowerCase() === selectedColor);
        });
      }
      for (const output of elements.properties.querySelectorAll("[data-comic-output]")) {
        const input = elements.properties.querySelector(`[data-comic-property="${output.dataset.comicOutput}"]`);
        output.value = input?.dataset.comicProperty === "image_scale" ? `${Math.round(Number(input.value) * 100)}%` : input?.value || "";
        output.textContent = output.value;
      }
      elements.properties.querySelectorAll('[data-comic-action="remove-panel-image"]').forEach((button) => {
        button.disabled = !panel?.image_id;
      });
      const metadata = comic.images.find((item) => item.id === panel?.image_id);
      const thumbnail = elements.properties.querySelector("[data-comic-selected-thumbnail]");
      const imageName = elements.properties.querySelector("[data-comic-image-name]");
      if (thumbnail) {
        thumbnail.replaceChildren();
        const runtime = panel?.image_id === "source" ? sourceImage() : runtimeImages.get(panel?.image_id);
        if (runtime?.src) {
          const preview = document.createElement("img");
          preview.src = runtime.src;
          preview.alt = "";
          thumbnail.append(preview);
        }
      }
      if (imageName) imageName.textContent = metadata?.name || tr("画像なし", "No image");
      return true;
    }

    function selectedImagePanels() {
      const ids = selectedPanelImageIds.size ? selectedPanelImageIds : new Set(selectedTarget === "image" && selectedPanelId ? [selectedPanelId] : []);
      return layout().panels.filter((entry) => ids.has(entry.id) && entry.node.image_id).map((entry) => entry.node);
    }

    function setPanelImageSelection(panelIds, primaryId = null) {
      const available = new Set(layout().panels.filter((entry) => entry.node.image_id).map((entry) => entry.id));
      selectedPanelImageIds.clear();
      for (const panelId of panelIds) if (available.has(panelId)) selectedPanelImageIds.add(panelId);
      selectedPanelId = primaryId && selectedPanelImageIds.has(primaryId) ? primaryId : [...selectedPanelImageIds].at(-1) || null;
      selectedTarget = selectedPanelId ? "image" : null;
      selectedHeadingId = null;
      options.clearLayerSelection?.();
    }

    function selectPanelImage(panelId, event = {}) {
      const imageIds = layout().panels.filter((entry) => entry.node.image_id).map((entry) => entry.id);
      if (event.shiftKey && imageIds.includes(panelImageSelectionAnchorId)) {
        const start = imageIds.indexOf(panelImageSelectionAnchorId), end = imageIds.indexOf(panelId), range = imageIds.slice(Math.min(start, end), Math.max(start, end) + 1);
        setPanelImageSelection(event.ctrlKey || event.metaKey ? [...new Set([...selectedPanelImageIds, ...range])] : range, panelId);
      } else if (event.ctrlKey || event.metaKey) {
        const next = new Set(selectedPanelImageIds);
        next.has(panelId) ? next.delete(panelId) : next.add(panelId);
        setPanelImageSelection([...next], next.has(panelId) ? panelId : [...next].at(-1));
        panelImageSelectionAnchorId = panelId;
      } else {
        setPanelImageSelection([panelId], panelId);
        panelImageSelectionAnchorId = panelId;
      }
    }

    function selectComicTarget(target, panelId = null) {
      if (target === "image" && panelId) setPanelImageSelection([panelId], panelId);
      else selectedPanelImageIds.clear();
      selectedTarget = target;
      if (panelId) selectedPanelId = panelId;
      if (target !== "heading") selectedHeadingId = null;
      options.clearLayerSelection?.();
      updateUi();
      options.syncInsertTargetStatus?.();
      options.requestRender({ canvas: true, layers: true });
    }

    function comicLayerRow({ target, panelId = null, name, kind, visible = true, locked = null, nested = false, collapsed = false }) {
      const row = document.createElement("div");
      row.className = `layer comic-layer${nested ? " comic-layer-nested" : ""}${
        target === "image" ? selectedPanelImageIds.has(panelId) || (selectedTarget === "image" && panelId === selectedPanelId) ? " selected" : "" : selectedTarget === target && (!panelId || panelId === selectedPanelId) ? " selected" : ""
      }`;
      row.dataset.comicLayer = target;
      row.classList.toggle("is-collapsed", collapsed);
      if (panelId) row.dataset.comicPanelId = panelId;
      row.onclick = (event) => target === "image" ? (selectPanelImage(panelId, event), updateUi(), options.syncInsertTargetStatus?.(), options.requestRender({ canvas: true, layers: true })) : selectComicTarget(target, panelId);
      if (target === "page" || target === "panel" || target === "image") {
        row.title =
          target === "page"
            ? "素材をドロップするとページ上レイヤーになります"
            : target === "panel"
              ? "素材をドロップするとこのコマ内の画像より上になります"
              : "上半分へドロップ: 画像より上／下半分: 画像より下";
        row.addEventListener("dragover", (event) => {
          if (!event.dataTransfer.types.includes("text/plain")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        });
        row.addEventListener("drop", (event) => {
          const layerId = event.dataTransfer.getData("text/plain");
          if (!layerId) return;
          event.preventDefault();
          event.stopPropagation();
          const stack =
            target === "image" && event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2
              ? "below_image"
              : "above_image";
          options.assignLayerComicTarget?.(layerId, target === "page" ? "" : panelId, stack);
        });
      }
      const eye = document.createElement("button");
      eye.className = "eye";
      eye.textContent = visible ? "◉" : "○";
      eye.title = tr("表示／非表示", "Show / Hide");
      eye.onclick = (event) => {
        event.stopPropagation();
        options.pushUndo();
        if (target === "page") comic.page.visible = !visible;
        else {
          const panel = core.findNode(comic.tree, panelId);
          if (target === "image") {
            const targets = selectedPanelImageIds.size > 1 && selectedPanelImageIds.has(panelId) ? selectedImagePanels() : [panel];
            targets.forEach((targetPanel) => targetPanel.image_visible = !visible);
          }
          else panel.visible = !visible;
        }
        updateUi();
        changed();
      };
      const kindElement = document.createElement("span");
      kindElement.className = `kind ${kind}`;
      kindElement.textContent = target === "page" ? "▦" : target === "image" ? "▧" : "□";
      const nameElement = document.createElement("span");
      nameElement.className = "name";
      nameElement.textContent = name;
      row.append(eye, kindElement, nameElement);
      if (locked !== null) {
        const lock = document.createElement("button");
        lock.className = "lock";
        lock.textContent = locked ? "🔒" : "🔓";
        lock.title =
          target === "image"
            ? locked
              ? "画像位置のロックを解除"
              : "画像位置をロック"
            : locked
              ? "コマ割りのロックを解除"
              : "コマ割りをロック";
        lock.onclick = (event) => {
          event.stopPropagation();
          options.pushUndo();
          if (target === "image") {
            const panel = core.findNode(comic.tree, panelId);
            if (panel) {
              const targets = selectedPanelImageIds.size > 1 && selectedPanelImageIds.has(panelId) ? selectedImagePanels() : [panel];
              targets.forEach((targetPanel) => targetPanel.image_locked = !panel.image_locked);
            }
          } else {
            comic.page.structure_locked = !comic.page.structure_locked;
          }
          updateUi();
          changed();
        };
        row.append(lock);
      }
      return row;
    }

    function renderLayers(host) {
      if (!comic.enabled || !host) return false;
      host.append(
        comicLayerRow({
          target: "page",
            name: tr("漫画ページ", "Comic Page"),
          kind: "frame",
          visible: comic.page.visible !== false,
          locked: comic.page.structure_locked !== false,
        }),
      );
      comic.headings.forEach((heading, index) => {
        const row = comicLayerRow({
          target: "heading",
          name: tr(`見出しBox ${index + 1}`, `Header Box ${index + 1}`),
          kind: "frame",
          visible: heading.visible !== false,
          nested: true,
        });
        row.dataset.comicHeadingId = heading.id;
        row.classList.toggle("selected", selectedTarget === "heading" && selectedHeadingId === heading.id);
        row.onclick = () => {
          selectedHeadingId = heading.id;
          selectComicTarget("heading");
        };
        const eye = row.querySelector(".eye");
        eye.onclick = (event) => {
          event.stopPropagation();
          options.pushUndo();
          heading.visible = !heading.visible;
          updateUi();
          changed();
        };
        host.append(row);
      });
      core.collectPanels(comic.tree).forEach((panel, index) => {
        const collapsed = panel.collapsed === true;
        host.append(
          comicLayerRow({
            target: "panel",
            panelId: panel.id,
            name: collapsed ? tr(`コマ ${index + 1}（非表示）`, `Panel ${index + 1} (Hidden)`) : tr(`コマ ${index + 1}`, `Panel ${index + 1}`),
            kind: "frame",
            visible: panel.visible !== false,
            nested: true,
            collapsed,
          }),
        );
        if (panel.image_id) {
          const metadata = comic.images.find((image) => image.id === panel.image_id);
          host.append(
            comicLayerRow({
              target: "image",
              panelId: panel.id,
              name: metadata?.name || tr("コマ画像", "Panel Image"),
              kind: "image",
              visible: panel.image_visible !== false,
              locked: panel.image_locked === true,
              nested: true,
              collapsed,
            }),
          );
        }
      });
      return true;
    }

    function clearSelection() {
      if (!selectedTarget && !selectedTrayImageId) return false;
      selectedTarget = null;
      selectedPanelImageIds.clear();
      panelImageSelectionAnchorId = null;
      selectedTrayImageId = "";
      drag = null;
      renderTray();
      syncProperties();
      options.requestRender({ canvas: true, layers: true });
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
      if (key === "image_locked") panel.image_locked = input.checked;
      else if (key === "tone_enabled") panel.tone = input.checked ? panel.tone || core.defaultTone() : null;
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
      if (!core.PUBLIC_TEMPLATE_IDS.has(templateId)) return;
      if (hasPanelContent() && !confirm("現在のコマ割りとコマ内設定を置き換えますか？\n画像トレイの画像は残ります。")) return;
      options.pushUndo();
      comic.tree = core.createTemplate(templateId, uuid);
      comic.template_id = templateId;
      comic.enabled = true;
      comic.page.gutter = 40;
      comic.page.margin = 80;
      comic.page.margin_top = comic.page.margin;
      comic.page.margin_right = comic.page.margin;
      comic.page.margin_bottom = comic.page.margin;
      comic.page.margin_left = comic.page.margin;
      comic.page.heading_gap = 30;
      comic.headings = core.createHeadings(templateId, canvasState().width, uuid);
      used = true;
      selectedPanelId = layout().panels[0]?.id || null;
      selectedPanelImageIds.clear();
      panelImageSelectionAnchorId = null;
      selectedTarget = selectedPanelId ? "panel" : "page";
      const size = [720, 2200];
      if (size) options.resizeCanvas?.(...size);
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
      selectedPanelImageIds.clear();
      panelImageSelectionAnchorId = null;
      selectedTarget = "panel";
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
      selectedPanelImageIds.clear();
      panelImageSelectionAnchorId = null;
      selectedTarget = "panel";
      updateUi();
      changed();
    }

    function assignImage(panelId, imageId) {
      const panel = core.findNode(comic.tree, panelId);
      if (!panel || panel.kind !== "panel" || !comic.images.some((item) => item.id === imageId)) return false;
      options.pushUndo();
      panel.image_id = imageId;
      panel.image_scale = 1;
      panel.image_offset_x = 0;
      panel.image_offset_y = 0;
      setPanelImageSelection([panel.id], panel.id);
      panelImageSelectionAnchorId = panel.id;
      used = true;
      updateUi();
      changed();
      return true;
    }

    async function importFiles(files, importOptions = {}) {
      if (!comic.enabled) setEditMode("comic");
      const supported = files.filter(supportedImage);
      if (!supported.length) {
        options.setStatus?.("PNG / JPEG / WebP画像を選択してください。", "error");
        return [];
      }
      const importedIds = [];
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
          if (duplicate) {
            importedIds.push(duplicate.id);
            continue;
          }
          let metadata = {
            id: `image-${uuid()}`,
            name: String(file.name || `image-${comic.images.length + 1}`).slice(0, 260),
            mime: /^image\/(?:png|jpeg|webp)$/i.test(file.type) ? file.type : "image/png",
            width: 1,
            height: 1,
            sha256: digest,
            source: "stored",
          };
          const stored = await imageStore.put(metadata, file);
          if (stored?.id) metadata = { ...metadata, ...stored, id: String(stored.id), source: "forge-project" };
          const storedDuplicate = comic.images.find((item) => item.id === metadata.id);
          if (storedDuplicate) {
            if (!runtimeImages.has(storedDuplicate.id)) await attachBlob(storedDuplicate, file);
            importedIds.push(storedDuplicate.id);
            continue;
          }
          await attachBlob(metadata, file);
          comic.images.push(metadata);
          importedIds.push(metadata.id);
        } catch (error) {
          console.warn("Speech Bubble comic image import failed", error);
          options.setStatus?.(`${file.name || "画像"}を読み込めませんでした。`, "error");
        }
      }
      if (importedIds.length) {
        const droppedPanel = importOptions.point ? core.panelAt(layout(), importOptions.point) : null;
        if (droppedPanel && importedIds[0]) {
          droppedPanel.node.image_id = importedIds[0];
          droppedPanel.node.image_scale = 1;
          droppedPanel.node.image_offset_x = 0;
          droppedPanel.node.image_offset_y = 0;
          setPanelImageSelection([droppedPanel.id], droppedPanel.id);
          panelImageSelectionAnchorId = droppedPanel.id;
        }
        used = true;
        elements.tray?.classList.remove("collapsed");
        elements.tray?.querySelector('[data-comic-action="tray-toggle"]')?.setAttribute("aria-expanded", "true");
        renderTray();
        syncTrayViewport();
        changed();
        options.setStatus?.(`${importedIds.length}枚の画像を画像トレイへ追加しました。`, "saved");
      }
      return importedIds;
    }

    async function conversionBlob(metadata) {
      if (!metadata) return null;
      if (metadata.id === "source") {
        try {
          return await options.getSourceBlob?.();
        } catch {
          return null;
        }
      }
      return imageStore.get(metadata.id);
    }

    async function getConversionSources() {
      ensureSourceMetadata();
      const panelImageId = selectedPanel()?.image_id || "";
      const preferredId = selectedTrayImageId || panelImageId;
      const ordered = [
        ...comic.images.filter((metadata) => metadata.id === preferredId),
        ...comic.images.filter((metadata) => metadata.id !== preferredId),
      ];
      const sources = [];
      for (const metadata of ordered) {
        const blob = await conversionBlob(metadata);
        if (!blob) continue;
        sources.push({
          id: metadata.id,
          name: metadata.name || "画像トレイ",
          width: Number(metadata.width) || 1,
          height: Number(metadata.height) || 1,
          blob,
          selected: metadata.id === preferredId,
        });
      }
      return sources;
    }

    async function addConvertedImage(blob, name = "comic-converted.png") {
      if (!(blob instanceof Blob)) return "";
      const safeName = String(name || "comic-converted.png").replace(/[\\/:*?"<>|]+/g, "-");
      const file = new File([blob], /\.png$/i.test(safeName) ? safeName : `${safeName}.png`, {
        type: "image/png",
        lastModified: Date.now(),
      });
      const ids = await importFiles([file]);
      const addedId = ids[0] || "";
      if (!addedId || !comic.images.some((metadata) => metadata.id === addedId)) {
        throw new Error(tr("変換画像を画像トレイへ追加できませんでした。", "The converted image could not be added to the Image Tray."));
      }
      selectedTrayImageId = addedId;
      elements.tray?.classList.remove("collapsed");
      renderTray();
      syncTrayViewport();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const status = await storageStatus();
      if (status.page_images >= MAX_IMAGES || status.page_image_bytes > 1024 * 1024 * 1024) {
        options.setStatus?.(
          `画像トレイに${status.page_images}件 / ${(status.page_image_bytes / (1024 * 1024)).toFixed(1)} MBあります。Settingsの「未使用画像を整理」を確認してください。`,
          "info",
        );
      }
      return addedId;
    }

    async function imageRecordsForDocument() {
      const targetDocument = documentId();
      if (!targetDocument) return [];
      const db = await openImageDb();
      const records = await new Promise((resolve, reject) => {
        const transaction = db.transaction(DB_STORE, "readonly");
        const request = transaction.objectStore(DB_STORE).getAll();
        request.onsuccess = () =>
          resolve(
            (Array.isArray(request.result) ? request.result : []).filter(
              (record) => record?.documentId === targetDocument,
            ),
          );
        request.onerror = () => reject(request.error);
      });
      db.close();
      return records;
    }

    async function storageStatus() {
      const records = await imageRecordsForDocument().catch(() => []);
      const currentIds = new Set(comic.images.filter((item) => item.id !== "source").map((item) => item.id));
      const usedIds = new Set(layout().panels.map((item) => item.node.image_id).filter(Boolean));
      return {
        page_images: currentIds.size,
        page_image_bytes: records.reduce(
          (total, record) => total + (currentIds.has(record.imageId) ? Number(record?.blob?.size) || 0 : 0),
          0,
        ),
        unused_page_images: [...currentIds].filter((id) => !usedIds.has(id)).length,
      };
    }

    async function cleanupUnusedImages() {
      const usedIds = new Set(layout().panels.map((item) => item.node.image_id).filter(Boolean));
      const unused = comic.images.filter((item) => item.id !== "source" && !usedIds.has(item.id));
      if (!unused.length) return { removed: 0 };
      if (!confirm(`コマで使用していない画像トレイの画像${unused.length}件を削除しますか？\nこの操作は元に戻せません。`)) {
        return { removed: 0, cancelled: true };
      }
      options.pushUndo();
      const unusedIds = new Set(unused.map((item) => item.id));
      comic.images = comic.images.filter((item) => !unusedIds.has(item.id));
      for (const metadata of unused) {
        releaseRuntimeImage(metadata.id);
        await imageStore.remove(metadata.id).catch(() => {});
      }
      renderTray();
      updateUi();
      changed();
      return { removed: unused.length };
    }

    async function removeTrayImage(imageId) {
      if (imageId === "source") return;
      const index = comic.images.findIndex((item) => item.id === imageId);
      if (index < 0) return;
      const usedPanels = layout().panels.filter((item) => item.node.image_id === imageId);
      if (
        usedPanels.length &&
        !confirm(`この画像は${usedPanels.length}個のコマで使用中です。\nコマから外して画像トレイから削除しますか？`)
      ) return;
      options.pushUndo();
      for (const item of usedPanels) item.node.image_id = null;
      comic.images.splice(index, 1);
      if (selectedTrayImageId === imageId) selectedTrayImageId = "";
      // Keep the blob alive while this deletion is present in the editor
      // history. The scene snapshot restores the metadata and panel links;
      // retaining the runtime/IndexedDB asset lets Undo restore the pixels too.
      // Explicit cache cleanup remains the operation that permanently removes
      // unused image data.
      if (selectedTarget === "image" && usedPanels.some((item) => item.id === selectedPanelId)) selectedTarget = "panel";
      renderTray();
      updateUi();
      changed();
    }

    function blobDataUrl(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("画像をプロジェクトへ保存できませんでした。"));
        reader.readAsDataURL(blob);
      });
    }

    async function exportProjectImages() {
      const records = [];
      for (const metadata of comic.images) {
        if (metadata.source === "document") continue;
        const blob = await imageStore.get(metadata.id);
        if (!blob) {
          const locations = layout().panels
            .filter((item) => item.node?.image_id === metadata.id)
            .map((item) => item.node?.id || item.id)
            .filter(Boolean);
          const location = locations.length ? ` (panel: ${locations.join(", ")})` : "";
          throw new Error(`Project image blob is missing: ${metadata.name || metadata.id}${location}`);
        }
        records.push({
          id: metadata.id,
          name: metadata.name,
          mime: metadata.mime || blob.type || "image/png",
          data_url: await blobDataUrl(blob),
        });
      }
      return records;
    }

    async function importProjectImages(records) {
      for (const record of Array.isArray(records) ? records : []) {
        if (!record?.id || !String(record.data_url || "").startsWith("data:image/")) continue;
        const blob = await fetch(record.data_url).then((response) => response.blob());
        let metadata = comic.images.find((item) => item.id === record.id);
        if (!metadata) {
          metadata = {
            id: String(record.id),
            name: String(record.name || "project-image"),
            mime: String(record.mime || blob.type || "image/png"),
            width: 1,
            height: 1,
            sha256: await sha256(blob),
            source: "stored",
          };
          comic.images.push(metadata);
        }
        await attachBlob(metadata, blob);
        await imageStore.put(metadata, blob);
      }
      renderTray();
      options.requestRender({ canvas: true, layers: true });
    }

    async function importExternalImage(file, serverAsset, control = {}) {
      if (!(file instanceof Blob) || !serverAsset?.id) return "";
      const metadata = {
        id: String(serverAsset.id),
        name: String(serverAsset.name || "forge-image").slice(0, 260),
        mime: serverAsset.mime || file.type || "image/png",
        width: Math.max(1, Number(serverAsset.width) || 1),
        height: Math.max(1, Number(serverAsset.height) || 1),
        sha256: String(serverAsset.sha256 || ""),
        source: "forge-project",
      };
      options.pushUndo?.();
      let existing = comic.images.find((item) => item.id === metadata.id);
      if (!existing) {
        existing = metadata;
        comic.images.push(existing);
      }
      if (!runtimeImages.has(existing.id)) await attachBlob(existing, file);
      selectedTrayImageId = existing.id;
      const dropped = control.point ? core.panelAt(layout(), control.point)?.node : null;
      const target = dropped || (control.assignToSelectedPanel ? selectedPanel() : null);
      if (target && panelEditable(target)) {
        target.image_id = existing.id;
        target.image_scale = 1;
        target.image_offset_x = 0;
        target.image_offset_y = 0;
        target.image_visible = true;
        setPanelImageSelection([target.id], target.id);
      }
      used = true;
      elements.tray?.classList.remove("collapsed");
      renderTray();
      syncTrayViewport();
      changed();
      updateUi();
      return existing.id;
    }

    function removeAssetUsage(imageId, control = {}) {
      const id = String(imageId || "");
      if (!id || id === "source") return false;
      const usedPanels = layout().panels.map((item) => item.node).filter((panel) => panel.image_id === id);
      const hasMetadata = comic.images.some((item) => item.id === id);
      if (!usedPanels.length && !hasMetadata) return false;
      if (control.recordUndo !== false) options.pushUndo?.();
      for (const panel of usedPanels) {
        panel.image_id = null;
        selectedPanelImageIds.delete(panel.id);
      }
      comic.images = comic.images.filter((item) => item.id !== id);
      if (selectedTrayImageId === id) selectedTrayImageId = "";
      if (selectedTarget === "image" && !selectedPanel()?.image_id) selectedTarget = selectedPanelId ? "panel" : "page";
      changed();
      updateUi();
      return true;
    }

    function renderTray() {
      if (!elements.trayList) return;
      ensureSourceMetadata();
      const trayImages = comic.images.filter((metadata) => metadata.id !== "source");
      if (selectedTrayImageId && !trayImages.some((metadata) => metadata.id === selectedTrayImageId)) {
        selectedTrayImageId = "";
      }
      const usedIds = new Set(layout().panels.map((item) => item.node.image_id).filter(Boolean));
      elements.tray.querySelector("[data-comic-image-count]").textContent = tr(`${trayImages.length}枚`, `${trayImages.length} images`);
      elements.trayList.replaceChildren(
        ...trayImages.map((metadata) => {
          const card = document.createElement("article");
          card.className = `comic-image-card${usedIds.has(metadata.id) ? " used" : ""}${selectedTrayImageId === metadata.id ? " selected" : ""}`;
          card.dataset.comicImageId = metadata.id;
          card.draggable = true;
          const preview = document.createElement("div");
          preview.className = "comic-image-preview";
          const runtime = runtimeImages.get(metadata.id);
          if (runtime?.src) {
            const image = document.createElement("img");
            image.src = runtime.src;
            image.alt = "";
            image.draggable = false;
            preview.append(image);
          } else {
            preview.textContent = tr("読込待ち", "Waiting to load");
          }
          const name = document.createElement("span");
          name.textContent = metadata.name;
          name.title = metadata.name;
          card.append(preview, name);
          if (metadata.id !== "source") {
            const remove = document.createElement("button");
            remove.type = "button";
            remove.dataset.comicAction = "remove-image";
            remove.textContent = "×";
            remove.title = usedIds.has(metadata.id) ? tr("使用中のコマから外して削除", "Remove from panels and delete") : tr("画像トレイから削除", "Delete from Image Tray");
            remove.addEventListener("pointerdown", (event) => event.stopPropagation());
            card.append(remove);
          }
          card.addEventListener("dragstart", (event) => {
            const ghost = createTrayDragGhost(metadata.name);
            event.dataTransfer.setData(IMAGE_DRAG_TYPE, metadata.id);
            event.dataTransfer.setData("text/plain", metadata.id);
            event.dataTransfer.effectAllowed = "copy";
            event.dataTransfer.setDragImage(ghost, 18, 18);
            card.classList.add("dragging");
            requestAnimationFrame(() => requestAnimationFrame(() => ghost.remove()));
          });
          card.addEventListener("dragend", () => {
            card.classList.remove("dragging");
            document.querySelectorAll(".comic-image-drag-ghost").forEach((node) => node.remove());
          });
          card.addEventListener("pointerdown", (event) => {
            if (event.target.closest('[data-comic-action="remove-image"]')) return;
            selectedTrayImageId = metadata.id;
            renderTray();
          });
          return card;
        }),
      );
    }

    function syncTrayViewport() {
      const canvasPanel = document.querySelector(".canvas-panel");
      if (!canvasPanel || !elements.tray) return;
      const visible = comic.enabled && !elements.tray.hidden;
      canvasPanel.classList.toggle("comic-tray-visible", visible);
      requestAnimationFrame(() => {
        if (!visible) {
          canvasPanel.style.removeProperty("--comic-tray-height");
          return;
        }
        canvasPanel.style.setProperty("--comic-tray-height", `${Math.ceil(elements.tray.offsetHeight)}px`);
      });
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
      if (comic.page.visible === false) return true;
      const overlay = optionsValue.overlay === true;
      const phase = optionsValue.phase || "all";
      const drawBase = phase === "all" || phase === "base";
      const drawImages = phase === "all" || phase === "images";
      const drawBorders = phase === "all" || phase === "borders";
      const computed = layout();
      target.save();
      if (!overlay && drawBase) {
        target.fillStyle = comic.page.background;
        target.fillRect(0, 0, canvasState().width, canvasState().height);
      }
      if (!overlay && drawBase) {
        for (const heading of comic.headings) {
          if (heading.visible === false) continue;
          target.fillStyle = heading.background;
          target.fillRect(heading.x, heading.y, heading.width, heading.height);
          if (heading.border_width > 0) {
            const inset = heading.border_width / 2;
            target.strokeStyle = heading.border_color || "#111111";
            target.lineWidth = heading.border_width;
            target.strokeRect(
              heading.x + inset,
              heading.y + inset,
              Math.max(0, heading.width - heading.border_width),
              Math.max(0, heading.height - heading.border_width),
            );
          }
        }
      }
      for (const item of computed.panels) {
        const panel = item.node;
        const rect = item.rect;
        if (panel.visible === false) continue;
        target.save();
        target.beginPath();
        target.rect(rect.x, rect.y, rect.w, rect.h);
        target.clip();
        if (!overlay && drawBase) {
          const pattern = panelBackgroundPattern(panel);
          if (pattern) {
            target.save();
            target.translate(rect.x, rect.y);
            backgroundPatterns()?.draw(target, pattern, rect.w, rect.h);
            target.restore();
          } else {
            target.fillStyle = panel.background;
            target.fillRect(rect.x, rect.y, rect.w, rect.h);
          }
        }
        if (!overlay && drawImages) {
          const image = panel.image_visible === false
            ? null
            : panel.image_id === "source"
              ? sourceImage()
              : runtimeImages.get(panel.image_id);
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
        if (panel.tone && drawImages) {
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
      }
      if (comic.page.border_width > 0 && !overlay && drawBorders) {
        const inset = comic.page.border_width / 2;
        target.strokeStyle = comic.page.border_color;
        target.lineWidth = comic.page.border_width;
        target.lineCap = "butt";
        for (const item of computed.panels) {
          if (item.node.visible === false) continue;
          target.strokeRect(
            item.rect.x + inset,
            item.rect.y + inset,
            Math.max(0, item.rect.w - comic.page.border_width),
            Math.max(0, item.rect.h - comic.page.border_width),
          );
        }
      }
      target.restore();
      return true;
    }

    function roundedOverlayRect(target, x, y, width, height, radius) {
      const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
      target.beginPath();
      target.moveTo(x + safeRadius, y);
      target.lineTo(x + width - safeRadius, y);
      target.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
      target.lineTo(x + width, y + height - safeRadius);
      target.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
      target.lineTo(x + safeRadius, y + height);
      target.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
      target.lineTo(x, y + safeRadius);
      target.quadraticCurveTo(x, y, x + safeRadius, y);
      target.closePath();
    }

    function drawDividerGuide(target, divider, hovered) {
      const zoom = Math.max(0.25, canvasState().zoom || 1);
      const centerX = divider.rect.x + divider.rect.w / 2;
      const centerY = divider.rect.y + divider.rect.h / 2;
      const active = drag?.type === "divider" && drag.divider?.id === divider.id;
      const horizontal = divider.axis === "y";
      const railThickness = 8 / zoom;
      const pillWidth = (horizontal ? 42 : 22) / zoom;
      const pillHeight = (horizontal ? 22 : 42) / zoom;
      const pillX = centerX - pillWidth / 2;
      const pillY = centerY - pillHeight / 2;

      target.save();
      target.fillStyle = active
        ? "rgba(245,158,11,.94)"
        : hovered
          ? "rgba(84,201,255,.94)"
          : "rgba(79,163,255,.72)";
      if (horizontal) {
        target.fillRect(divider.rect.x, centerY - railThickness / 2, divider.rect.w, railThickness);
      } else {
        target.fillRect(centerX - railThickness / 2, divider.rect.y, railThickness, divider.rect.h);
      }

      target.fillStyle = active ? "#b45309" : hovered ? "#1976d2" : "#245fa8";
      roundedOverlayRect(target, pillX, pillY, pillWidth, pillHeight, 7 / zoom);
      target.fill();
      target.fillStyle = "rgba(255,255,255,.96)";
      target.font = `700 ${12 / zoom}px system-ui, sans-serif`;
      target.textAlign = "center";
      target.textBaseline = "middle";
      target.fillText(horizontal ? "↕" : "↔", centerX, centerY + .5 / zoom);
      target.restore();
    }

    function drawOverlay(target) {
      if (!comic.enabled) return;
      const computed = layout();
      target.save();
      target.lineWidth = 2 / Math.max(0.25, canvasState().zoom || 1);
      if (selectedTarget === "page") {
        const rect = pageRect();
        target.strokeStyle = "#4fa3ff";
        target.setLineDash([8, 5]);
        target.strokeRect(rect.x, rect.y, rect.w, rect.h);
        target.setLineDash([]);
      }
      if (comic.page.visible === false) {
        target.restore();
        return;
      }
      for (const heading of comic.headings) {
        if (heading.visible === false) continue;
        if (selectedTarget === "heading" && selectedHeadingId === heading.id) {
          target.strokeStyle = "#4fa3ff";
          target.setLineDash([8, 5]);
          target.strokeRect(heading.x, heading.y, heading.width, heading.height);
          target.setLineDash([]);
          if (!comic.page.structure_locked) {
            const handle = headingResizeHandleRect(heading);
            target.fillStyle = hoverTarget?.type === "heading-resize" ? "#4fa3ff" : "#ffffff";
            target.strokeStyle = "#4fa3ff";
            target.fillRect(handle.x, handle.y, handle.w, handle.h);
            target.strokeRect(handle.x, handle.y, handle.w, handle.h);
          }
        }
      }
      for (const item of computed.panels) {
        if (item.node.visible === false) continue;
        if ((item.id === selectedPanelId || (selectedTarget === "image" && selectedPanelImageIds.has(item.id))) && selectedTarget !== "page") {
          target.strokeStyle = "#4fa3ff";
          target.setLineDash([8, 5]);
          target.strokeRect(item.rect.x, item.rect.y, item.rect.w, item.rect.h);
          target.setLineDash([]);
        }
      }
      for (const divider of comic.page.structure_locked ? [] : computed.dividers) {
        const hovered = hoverTarget?.type === "divider" && hoverTarget.id === divider.id;
        drawDividerGuide(target, divider, hovered);
      }
      if (!comic.page.structure_locked && selectedTarget === "page" && !options.hasLayerSelection?.()) {
        const handle = pageResizeHandleRect();
        target.fillStyle = hoverTarget?.type === "page-resize" ? "#4fa3ff" : "#ffffff";
        target.strokeStyle = "#4fa3ff";
        target.lineWidth = 1;
        target.fillRect(handle.x, handle.y, handle.w, handle.h);
        target.strokeRect(handle.x, handle.y, handle.w, handle.h);
      }
      target.restore();
    }

    function panelContentRect(panel) {
      if (!panel) return null;
      const inset = Math.max(0, Number(comic.page.border_width) || 0);
      return {
        x: panel.rect.x + inset,
        y: panel.rect.y + inset,
        w: Math.max(0, panel.rect.w - inset * 2),
        h: Math.max(0, panel.rect.h - inset * 2),
      };
    }

    function emphasisClipRect(item) {
      if (!comic.enabled || item?.type !== "emphasis_lines") return null;
      if (item.comic_scope === "panel") {
        const panelId = item.comic_panel_id;
        const panel = layout().panels.find((entry) => entry.id === panelId);
        if (panel) {
          item.comic_panel_id = panel.id;
          return panelContentRect(panel);
        }
        return null;
      }
      return pageRect();
    }

    function assetClipRect(item) {
      if (!comic.enabled || !item || item.type === "frame" || item.comic_scope !== "panel") return null;
      const panelId = item.comic_panel_id;
      const panel = layout().panels.find((entry) => entry.id === panelId);
      if (!panel) return null;
      item.comic_panel_id = panel.id;
      return panelContentRect(panel);
    }

    function selectedPanelForEffects() {
      return selectedPanelId || layout().panels[0]?.id || "";
    }

    function selectedInsertionTarget() {
      if (!comic.enabled) return null;
      if ((selectedTarget === "panel" || selectedTarget === "image") && selectedPanelId) {
        const panels = layout().panels;
        const index = panels.findIndex((entry) => entry.id === selectedPanelId);
        const panel = panels[index];
        return panel ? { scope: "panel", panelId: panel.id, panelIndex: Math.max(0, index), rect: panelContentRect(panel) } : null;
      }
      if (selectedTarget === "page" || selectedTarget === "heading") return { scope: "free" };
      return null;
    }

    function panelInsertionTarget(panelId) {
      if (!comic.enabled || !panelId) return null;
      const panels = layout().panels;
      const index = panels.findIndex((entry) => entry.id === panelId);
      const panel = panels[index];
      return panel ? { scope: "panel", panelId: panel.id, panelIndex: Math.max(0, index), rect: panelContentRect(panel) } : null;
    }

    function insertionTargetAt(point) {
      if (!comic.enabled || !point) return { scope: "free" };
      const computed = layout();
      const panels = computed.panels;
      const hit = core.panelAt(computed, point);
      if (!hit) return { scope: "free" };
      const index = panels.findIndex((entry) => entry.id === hit.id);
      return {
        scope: "panel",
        panelId: hit.id,
        panelIndex: Math.max(0, index),
        rect: panelContentRect(hit),
      };
    }

    function defaultPanelInsertionTarget() {
      if (!comic.enabled) return null;
      const panel = layout().panels[0];
      return panel ? { scope: "panel", panelId: panel.id, panelIndex: 0, rect: panelContentRect(panel) } : { scope: "free" };
    }

    function elementTargetOptions(item) {
      const pageValue = item?.type === "emphasis_lines" ? "page" : "free";
      const pageLabel = item?.type === "emphasis_lines" ? tr("4コマ全体", "Entire Comic Page") : tr("ページ上（枠外へ出せる）", "On Page (may extend outside panels)");
      return [
        { value: pageValue, label: pageLabel },
        ...layout().panels.slice(0, 4).map((panel, index) => ({
          value: `panel:${panel.id}`,
          label: tr(`コマ${index + 1}`, `Panel ${index + 1}`),
        })),
      ];
    }

    function elementTargetValue(item) {
      if (!item || item.comic_scope !== "panel") return item?.type === "emphasis_lines" ? "page" : "free";
      const panels = layout().panels;
      const panel = panels.find((entry) => entry.id === item.comic_panel_id);
      return panel ? `panel:${panel.id}` : "";
    }

    function assignElementTarget(item, value) {
      if (!item) return null;
      const panelId = String(value || "").startsWith("panel:") ? String(value).slice(6) : "";
      const panel = panelId ? layout().panels.find((entry) => entry.id === panelId) : null;
      if (panel) {
        item.comic_scope = "panel";
        item.comic_panel_id = panel.id;
        item.comic_stack = "above_image";
        selectedPanelId = panel.id;
        return panelContentRect(panel);
      }
      item.comic_scope = item.type === "emphasis_lines" ? "page" : "free";
      item.comic_panel_id = "";
      item.comic_stack = "above_image";
      return item.type === "emphasis_lines" ? pageRect() : null;
    }

    function effectTargetRect(item) {
      if (!comic.enabled || item?.type !== "emphasis_lines") return null;
      if (item.comic_scope === "panel") {
        const panel = layout().panels.find((entry) => entry.id === item.comic_panel_id);
        return panel ? panelContentRect(panel) : null;
      }
      return pageRect();
    }

    function shouldSkipPanelScopedItem(item) {
      if (!comic.enabled || item?.comic_scope !== "panel") return false;
      const panelId = String(item.comic_panel_id || "");
      const panel = panelId ? core.findNode(comic.tree, panelId) : null;
      return !panel || panel.kind !== "panel" || panel.collapsed === true;
    }

    function pointInRect(point, rect) {
      return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
    }

    function headingResizeHandleRect(heading) {
      const size = 20 / Math.max(0.25, canvasState().zoom || 1);
      return {
        x: heading.x + heading.width - size / 2,
        y: heading.y + heading.height - size / 2,
        w: size,
        h: size,
      };
    }

    function handlePointerDown(event, point) {
      if (!comic.enabled || options.layerAt?.(point)) return false;
      if (!comic.page.structure_locked && selectedTarget === "page" && pointInRect(point, pageResizeHandleRect())) {
        options.pushUndo();
        drag = {
          type: "page-resize",
          startX: point.x,
          startY: point.y,
          width: canvasState().width,
          height: canvasState().height,
          changed: false,
        };
        return true;
      }
      const activeHeading = selectedHeading();
      const resizeHeading =
        activeHeading &&
        activeHeading.visible !== false &&
        pointInRect(point, headingResizeHandleRect(activeHeading))
          ? activeHeading
          : null;
      const heading = resizeHeading || headingAt(point);
      if (heading) {
        selectedHeadingId = heading.id;
        selectedTarget = "heading";
        selectedPanelId = null;
        drag = null;
        if (!comic.page.structure_locked) {
          options.pushUndo();
          drag = resizeHeading === heading
            ? {
                type: "heading-resize",
                heading,
                startX: point.x,
                startY: point.y,
                width: heading.width,
                height: heading.height,
                changed: false,
              }
            : {
                type: "heading",
                heading,
                startX: point.x,
                startY: point.y,
                x: heading.x,
                y: heading.y,
                changed: false,
              };
        }
        options.clearLayerSelection?.();
        updateUi();
        options.requestRender({ canvas: true, layers: true });
        return true;
      }
      const computed = layout();
      if (!comic.page.structure_locked) {
        const divider = core.dividerAt(computed, point, 12 / Math.max(0.25, canvasState().zoom || 1));
        if (divider) {
          options.pushUndo();
          drag = { type: "divider", divider, changed: false };
          return true;
        }
      }
      const hit = core.panelAt(computed, point);
      if (!hit) {
        selectedTarget = "page";
        selectedPanelImageIds.clear();
        panelImageSelectionAnchorId = null;
        drag = null;
        options.clearLayerSelection?.();
        updateUi();
        options.requestRender({ canvas: true, layers: true });
        return true;
      }
      selectedHeadingId = null;
      if (hit.node.image_id) {
        const preserve = selectedPanelImageIds.size > 1 && selectedPanelImageIds.has(hit.id) && !event.shiftKey && !event.ctrlKey && !event.metaKey;
        if (!preserve) selectPanelImage(hit.id, event);
        else { selectedPanelId = hit.id; selectedTarget = "image"; }
      } else {
        selectedPanelImageIds.clear();
        panelImageSelectionAnchorId = null;
        selectedPanelId = hit.id;
        selectedTarget = "panel";
      }
      options.clearLayerSelection?.();
      const movablePanels = selectedImagePanels().filter((panel) => !panel.image_locked);
      if (hit.node.image_id && movablePanels.length && !(event.shiftKey || event.ctrlKey || event.metaKey)) {
        options.pushUndo();
        drag = {
          type: "image",
          panels: movablePanels.map((panel) => ({ panel, offsetX: panel.image_offset_x, offsetY: panel.image_offset_y })),
          startX: point.x,
          startY: point.y,
          changed: false,
        };
      } else {
        drag = null;
      }
      updateUi();
      options.requestRender({ canvas: true, layers: true });
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
        for (const entry of drag.panels) {
          entry.panel.image_offset_x = Math.round(entry.offsetX + point.x - drag.startX);
          entry.panel.image_offset_y = Math.round(entry.offsetY + point.y - drag.startY);
        }
        drag.changed = true;
      } else if (drag.type === "heading") {
        drag.heading.x = Math.round(drag.x + point.x - drag.startX);
        drag.heading.y = Math.round(drag.y + point.y - drag.startY);
        drag.heading.follow_panel_width = false;
        snapHeadingToPanelEdges(drag.heading);
        drag.changed = true;
      } else if (drag.type === "heading-resize") {
        drag.heading.width = Math.max(40, Math.round(drag.width + point.x - drag.startX));
        drag.heading.height = Math.max(24, Math.round(drag.height + point.y - drag.startY));
        drag.heading.follow_panel_width = false;
        snapHeadingToPanelEdges(drag.heading);
        drag.changed = true;
      } else if (drag.type === "page-resize") {
        const width = Math.round(core.clamp(drag.width + point.x - drag.startX, 320, 8192));
        const height = Math.round(core.clamp(drag.height + point.y - drag.startY, 480, 16384));
        let nextWidth = width;
        let nextHeight = height;
        if (comic.page.canvas_ratio_locked) {
          const scale = Math.max(width / Math.max(1, drag.width), height / Math.max(1, drag.height));
          nextWidth = Math.round(core.clamp(drag.width * scale, 320, 8192));
          nextHeight = Math.round(core.clamp(drag.height * scale, 480, 16384));
        }
        if (nextWidth !== canvasState().width || nextHeight !== canvasState().height) {
          options.resizeCanvas?.(nextWidth, nextHeight);
          comic.page.width = nextWidth;
          comic.page.height = nextHeight;
          drag.changed = true;
        }
      }
      syncProperties();
      options.requestRender({ canvas: true });
      return true;
    }

    function updateHoverTarget(next) {
      const before = hoverTarget ? `${hoverTarget.type}:${hoverTarget.id || ""}` : "";
      const after = next ? `${next.type}:${next.id || ""}` : "";
      if (before === after) return;
      hoverTarget = next;
      options.requestRender({ canvas: true });
    }

    function pointerCursorAt(point) {
      if (!comic.enabled || comic.page.structure_locked || options.layerAt?.(point)) {
        updateHoverTarget(null);
        return "";
      }
      if (selectedTarget === "page" && pointInRect(point, pageResizeHandleRect())) {
        updateHoverTarget({ type: "page-resize" });
        return "nwse-resize";
      }
      const activeHeading = selectedHeading();
      if (activeHeading && activeHeading.visible !== false && pointInRect(point, headingResizeHandleRect(activeHeading))) {
        updateHoverTarget({ type: "heading-resize", id: activeHeading.id });
        return "nwse-resize";
      }
      if (headingAt(point)) {
        updateHoverTarget({ type: "heading" });
        return "move";
      }
      const divider = core.dividerAt(layout(), point, 12 / Math.max(0.25, canvasState().zoom || 1));
      if (divider?.axis === "y") {
        updateHoverTarget({ type: "divider", id: divider.id });
        return "ns-resize";
      }
      updateHoverTarget(null);
      return "";
    }

    function handlePointerEnd() {
      if (!drag) return false;
      const changedValue = drag.changed;
      drag = null;
      if (changedValue) changed();
      return true;
    }

    function handleWheel(event, point = null) {
      if (!comic.enabled || !(event.ctrlKey || event.metaKey) || selectedTarget !== "image") return false;
      const panels = selectedImagePanels().filter((panel) => !panel.image_locked);
      if (!panels.length) return false;
      if (point) {
        const hit = core.panelAt(layout(), point);
        if (!hit || !selectedPanelImageIds.has(hit.id) && hit.id !== selectedPanelId) return false;
      }
      options.pushUndo();
      const factor = event.deltaY < 0 ? 1.08 : 0.92;
      panels.forEach((panel) => panel.image_scale = core.clamp(panel.image_scale * factor, 0.05, 5));
      syncProperties();
      changed();
      return true;
    }

    function handleImageDrop(transfer, point) {
      if (!comic.enabled) return false;
      const imageId = transfer?.getData?.(IMAGE_DRAG_TYPE) || transfer?.getData?.("text/plain");
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
      if (panel.node.image_id) {
        setPanelImageSelection([panel.id], panel.id);
        panelImageSelectionAnchorId = panel.id;
      } else {
        selectedPanelImageIds.clear();
        panelImageSelectionAnchorId = null;
        selectedPanelId = panel.id;
        selectedTarget = "panel";
      }
      options.clearLayerSelection?.();
      updateUi();
      const menu = elements.contextMenu;
      menu.style.left = `${Math.min(event.clientX, window.innerWidth - 190)}px`;
      menu.style.top = `${Math.min(event.clientY, window.innerHeight - 230)}px`;
      menu.querySelector('[data-comic-context="remove-image"]').disabled = !panel.node.image_id;
      menu.querySelector('[data-comic-context="reset-image"]').disabled = !panel.node.image_id;
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
        setEditMode(comic.enabled ? "single" : "comic");
        return true;
      }
      if (comic.enabled && selectedTarget && event.key === "Escape") {
        event.preventDefault();
        selectedTarget = null;
        selectedPanelId = null;
        selectedHeadingId = null;
        selectedPanelImageIds.clear();
        panelImageSelectionAnchorId = null;
        updateUi();
        options.requestRender({ canvas: true, layers: true });
        return true;
      }
      if (
        comic.enabled &&
        selectedTarget === "image" &&
        (event.key === "Delete" || event.key === "Backspace")
      ) {
        const panels = selectedImagePanels().filter((panel) => !panel.image_locked);
        if (!panels.length) return true;
        event.preventDefault();
        options.pushUndo();
        panels.forEach((panel) => panel.image_id = null);
        selectedPanelImageIds.clear();
        panelImageSelectionAnchorId = null;
        selectedTarget = selectedPanelId ? "panel" : "page";
        updateUi();
        changed();
        return true;
      }
      if (comic.enabled && (event.key === "Delete" || event.key === "Backspace")) {
        const imageId = selectedTrayImageId;
        if (imageId && imageId !== "source") {
          event.preventDefault();
          removeTrayImage(imageId);
          return true;
        }
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
      if (comic.enabled) {
        clean.page.width = canvasState().width;
        clean.page.height = canvasState().height;
      }
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
      selectedHeadingId = null;
      selectedPanelImageIds.clear();
      panelImageSelectionAnchorId = null;
      selectedTarget = comic.enabled && restoreOptions.keepMode ? selectedTarget || "page" : comic.enabled ? "page" : null;
      ensureSourceMetadata();
      updateUi();
      options.syncActionState?.();
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
      const lineScale = Math.sqrt(scaleX * scaleY);
      const scaleInteger = (value, factor, maximum) => Math.min(maximum, Math.max(0, Math.round((Number(value) || 0) * factor)));
      comic.page.margin = scaleInteger(comic.page.margin, lineScale, 2048);
      comic.page.margin_left = scaleInteger(comic.page.margin_left, scaleX, 2048);
      comic.page.margin_right = scaleInteger(comic.page.margin_right, scaleX, 2048);
      comic.page.margin_top = scaleInteger(comic.page.margin_top, scaleY, 2048);
      comic.page.margin_bottom = scaleInteger(comic.page.margin_bottom, scaleY, 2048);
      comic.page.gutter = scaleInteger(comic.page.gutter, scaleY, 1024);
      comic.page.heading_gap = scaleInteger(comic.page.heading_gap, scaleY, 1024);
      comic.page.border_width = Math.min(64, Math.round((Number(comic.page.border_width) || 0) * lineScale * 2) / 2);
      for (const item of layout().panels) {
        item.node.image_offset_x *= scaleX;
        item.node.image_offset_y *= scaleY;
      }
      for (const heading of comic.headings) {
        heading.x *= scaleX;
        heading.y *= scaleY;
        heading.width *= scaleX;
        heading.height *= scaleY;
        heading.border_width = Math.min(64, Math.round((Number(heading.border_width) || 0) * Math.sqrt(scaleX * scaleY) * 2) / 2);
        if (heading.follow_panel_width !== false) fitHeadingToPanelWidth(heading);
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
      isEditing: () => comic.enabled && Boolean(selectedTarget),
      importFiles,
      importExternalImage,
      removeAssetUsage,
      addConvertedImage,
      getConversionSources,
      storageStatus,
      cleanupUnusedImages,
      exportProjectImages,
      importProjectImages,
      drawUnderlay,
      drawOverlay,
      emphasisClipRect,
      assetClipRect,
      shouldSkipPanelScopedItem,
      selectedPanelForEffects,
      selectedInsertionTarget,
      panelInsertionTarget,
      insertionTargetAt,
      defaultPanelInsertionTarget,
      elementTargetOptions,
      elementTargetValue,
      assignElementTarget,
      effectTargetRect,
      handlePointerDown,
      handlePointerMove,
      pointerCursorAt,
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
      renderLayers,
      refreshLanguage: updateUi,
      clearSelection,
      setActive,
      setEditMode,
      dispose,
    };
  }

  root.SpeechBubbleComicEditor = { create, IMAGE_DRAG_TYPE };
})(globalThis);
