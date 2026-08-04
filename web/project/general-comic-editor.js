(function (root) {
  "use strict";
  const core = root.SpeechBubbleGeneralComicCore;
  if (!core) throw new Error("SpeechBubbleGeneralComicCore must be loaded first");
  const DB_NAME = "speech-bubble-editor-general-comic-images", DB_STORE = "images";
  const IMAGE_DRAG_TYPE = "application/x-speech-bubble-general-comic-image";
  const IMAGE_PREFIX = "general-comic-image:", MAX_IMAGE_BYTES = 96 * 1024 * 1024, MAX_IMAGES = 100;
  const PRINT_GUIDES_ENABLED = false;
  const tr = (ja, en) => document.documentElement.lang === "en" ? en : ja;
  const uuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const templateLabels = { standard_five: ["標準5コマ", "Standard 5 Panels"], equal_six: ["均等6コマ", "Equal 6 Panels"], main_focus: ["メインコマ重視", "Main Panel Focus"] };
  const templateLabel = (id) => (templateLabels[id] || templateLabels.standard_five)[document.documentElement.lang === "en" ? 1 : 0];
  const backgroundPatterns = () => root.SpeechBubbleCanvasBackgroundPatterns;

  function openImageDb() { return new Promise((resolve, reject) => { const request = indexedDB.open(DB_NAME, 1); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE, { keyPath: "key" }); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
  async function storeImageBlob(documentId, metadata, blob) { if (!documentId || !metadata?.id || !blob) return; const db = await openImageDb(); await new Promise((resolve, reject) => { const tx = db.transaction(DB_STORE, "readwrite"); tx.objectStore(DB_STORE).put({ key: `${documentId}:${metadata.id}`, documentId, imageId: metadata.id, metadata, blob, updatedAt: Date.now() }); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close(); }
  async function loadImageBlob(documentId, imageId) { if (!documentId || !imageId) return null; const db = await openImageDb(); const value = await new Promise((resolve, reject) => { const tx = db.transaction(DB_STORE, "readonly"), request = tx.objectStore(DB_STORE).get(`${documentId}:${imageId}`); request.onsuccess = () => resolve(request.result?.blob instanceof Blob ? request.result.blob : null); request.onerror = () => reject(request.error); }); db.close(); return value; }
  async function deleteImageBlob(documentId, imageId) { if (!documentId || !imageId) return; const db = await openImageDb(); await new Promise((resolve, reject) => { const tx = db.transaction(DB_STORE, "readwrite"); tx.objectStore(DB_STORE).delete(`${documentId}:${imageId}`); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close(); }
  const supportedImage = (file) => file instanceof Blob && (String(file.type || "").match(/^image\/(?:png|jpeg|webp)$/i) || /\.(?:png|jpe?g|webp)$/i.test(String(file.name || "")));
  function imageFromBlob(blob) { return new Promise((resolve, reject) => { const image = new Image(), url = URL.createObjectURL(blob); image.decoding = "async"; image.onload = () => resolve({ image, url }); image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(tr("画像を読み込めませんでした。", "The image could not be loaded."))); }; image.src = url; }); }
  function blobDataUrl(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); }); }

  function create(options = {}) {
    let comic = core.defaultState(options.defaultWidth || 2480, options.defaultHeight || 3508, uuid);
    let active = false, used = false, selection = { kind: "page", id: null }, lastPanelId = null, imageSelectionAnchorId = null, drag = null, hoverDividerId = "", selectedTrayImageId = "", pendingPanelId = "", processingPanelId = "", hydratedDocumentId = "", activePageColor = "background", activePanelPatternColor = "color";
    const selectedImagePanelIds = new Set();
    const runtimeImages = new Map(), runtimeBlobs = new Map(), objectUrls = new Set(), elements = {};
    const canvasState = () => options.getCanvasState?.() || { width: comic.page.width, height: comic.page.height, zoom: 1 };
    const documentId = () => String(options.getDocumentId?.() || "");
    const imageStore = options.imageStore || {
      put: async (metadata, blob) => { await storeImageBlob(documentId(), metadata, blob); return metadata; },
      get: (imageId) => loadImageBlob(documentId(), imageId),
      remove: (imageId) => deleteImageBlob(documentId(), imageId),
    };
    const requestRender = (flags = { canvas: true, layers: true }) => options.requestRender?.(flags);
    const contentRect = () => core.pageContentRect(comic.page);
    const layout = () => core.computeLayout(comic.tree, contentRect(), comic.page.gutter);
    const selectedPanel = () => selection.kind === "panel" || selection.kind === "image" ? core.findNode(comic.tree, selection.id) : null;
    const panelOrder = () => core.collectPanels(comic.tree);
    const selectedImagePanels = () => panelOrder().filter((panel) => panel.image_id && (selectedImagePanelIds.has(panel.id) || selection.kind === "image" && selection.id === panel.id));
    const selectedDivider = () => selection.kind === "divider" ? layout().dividers.find((item) => item.id === selection.id) || null : null;
    const panelEditable = (panel) => panel?.kind === "panel" && panel.locked !== true;
    const dividerEditable = (divider) => Boolean(divider?.node) && !comic.page.structure_locked && core.collectPanels(divider.node).every((panel) => panel.locked !== true);
    const panelLayoutItem = (id, includeHidden = false) => { const item = layout().panels.find((candidate) => candidate.id === id); return item && (includeHidden || item.node.visible !== false) ? item : null; };
    const panelRect = (id, includeHidden = false) => panelLayoutItem(id, includeHidden)?.rect || null;
    const panelShape = (id) => { const item = panelLayoutItem(id); return item ? { kind: "polygon", points: core.clone(item.polygon || core.rectPolygon(item.rect)) } : null; };
    const changed = () => { used = true; options.onDocumentChanged?.(); requestRender({ canvas: true, layers: true, preview: true }); };

    function panelBackgroundPattern(panel) {
      const patterns = backgroundPatterns();
      if (!panel || !patterns) return null;
      return patterns.normalize({ color: panel.background || "#ffffff", ...(panel.background_pattern || {}), transparent: false });
    }
    function setPanelBackgroundPattern(panel, value) {
      const patterns = backgroundPatterns();
      if (!panel || !patterns) return;
      const normalized = patterns.normalize({ color: panel.background || "#ffffff", ...(value || {}), transparent: false });
      normalized.transparent = false;
      panel.background = normalized.color;
      panel.background_pattern = normalized;
    }
    function colorSwatchesMarkup(scope) {
      return `<div class="compact-color-swatches" data-general-color-scope="${scope}"></div>`;
    }

    function attachBlob(metadata, blob) { return imageFromBlob(blob).then(({ image, url }) => { const old = runtimeImages.get(metadata.id)?.dataset?.generalComicObjectUrl; if (old) { URL.revokeObjectURL(old); objectUrls.delete(old); } image.dataset.generalComicObjectUrl = url; objectUrls.add(url); runtimeImages.set(metadata.id, image); runtimeBlobs.set(metadata.id, blob); metadata.width = image.naturalWidth; metadata.height = image.naturalHeight; renderTray(); requestRender({ canvas: true, layers: true }); }); }
    async function hydrateImages() { const target = documentId(); hydratedDocumentId = target; await Promise.all(comic.images.filter((item) => !runtimeImages.has(item.id)).map(async (metadata) => { try { const blob = await imageStore.get(metadata.id); if (blob && target === hydratedDocumentId) await attachBlob(metadata, blob); } catch (error) { console.warn("General comic image restore failed", metadata.id, error); } })); }

    function setSelection(kind, id = null) { selection = { kind, id }; if (kind === "panel" || kind === "image") lastPanelId = id; if (kind !== "image") { selectedImagePanelIds.clear(); imageSelectionAnchorId = null; } if (kind !== "normal") options.clearLayerSelection?.(); syncUi(); options.syncInsertTargetStatus?.(); requestRender({ canvas: true, layers: true }); }
    function clearSelection() { selection = { kind: "page", id: null }; selectedImagePanelIds.clear(); imageSelectionAnchorId = null; drag = null; syncUi(); return true; }
    function selectPage() { setSelection("page"); return true; }
    function selectPanel(id) { const node = core.findNode(comic.tree, id); if (!node || node.kind !== "panel") return false; setSelection("panel", id); return true; }
    function selectPanelImage(id, event = {}) { const node = core.findNode(comic.tree, id); if (!node || node.kind !== "panel" || !node.image_id) return false; const imageIds = panelOrder().filter((panel) => panel.image_id).map((panel) => panel.id); if (event.shiftKey && imageIds.includes(imageSelectionAnchorId)) { const start = imageIds.indexOf(imageSelectionAnchorId), end = imageIds.indexOf(id), range = imageIds.slice(Math.min(start, end), Math.max(start, end) + 1); if (!(event.ctrlKey || event.metaKey)) selectedImagePanelIds.clear(); range.forEach((panelId) => selectedImagePanelIds.add(panelId)); } else if (event.ctrlKey || event.metaKey) { selectedImagePanelIds.has(id) ? selectedImagePanelIds.delete(id) : selectedImagePanelIds.add(id); imageSelectionAnchorId = id; } else { selectedImagePanelIds.clear(); selectedImagePanelIds.add(id); imageSelectionAnchorId = id; } const primaryId = selectedImagePanelIds.has(id) ? id : [...selectedImagePanelIds].at(-1); if (!primaryId) return selectPanel(id); selection = { kind: "image", id: primaryId }; lastPanelId = primaryId; options.clearLayerSelection?.(); syncUi(); options.syncInsertTargetStatus?.(); requestRender({ canvas: true, layers: true }); return true; }
    function selectDivider(id) { const node = core.findNode(comic.tree, id); if (!node || node.kind !== "split") return false; setSelection("divider", id); return true; }

    function installUi() {
      const canvasPanel = document.querySelector(".canvas-panel"), footer = canvasPanel?.querySelector(".footer"), empty = document.getElementById("empty");
      if (canvasPanel) {
        const toolbar = document.createElement("div"); toolbar.className = "general-comic-canvas-toolbar"; toolbar.hidden = true; toolbar.innerHTML = '<button type="button" data-general-action="split-x"></button><button type="button" data-general-action="split-y"></button>'; canvasPanel.append(toolbar); elements.toolbar = toolbar;
        if (footer) { const tray = document.createElement("section"); tray.className = "comic-image-tray general-comic-image-tray collapsed"; tray.hidden = true; tray.innerHTML = '<div class="comic-tray-heading"><button type="button" class="comic-tray-toggle" data-general-action="tray-toggle" aria-expanded="false"><span data-general-tray-title></span> <span data-general-image-count>0</span></button><button type="button" data-general-action="add-images"></button></div><div class="comic-tray-list general-comic-tray-list"></div><input data-general-image-input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden>'; footer.parentElement?.insertBefore(tray, footer); elements.tray = tray; elements.trayList = tray.querySelector(".general-comic-tray-list"); elements.imageInput = tray.querySelector("[data-general-image-input]"); if ("ResizeObserver" in window) new ResizeObserver(syncTrayViewport).observe(tray); }
      }
      if (empty) {
        const properties = document.createElement("div"); properties.id = "generalComicProperties"; properties.className = "general-comic-properties"; properties.hidden = true;
        properties.innerHTML = `<div class="general-comic-selection-title"><strong data-general-selection-name></strong><label class="general-comic-title-lock" data-general-page-title-lock hidden><input data-general-page="structure_locked" type="checkbox"><span data-general-structure-lock></span></label><span data-general-selection-kind></span></div>
          <section data-general-properties="page"><label><span data-general-template-label></span><select data-general-page="template_id">${["standard_five","equal_six","main_focus"].map((id) => `<option value="${id}"></option>`).join("")}</select></label><div class="general-comic-two-column"><label><span data-general-canvas-width></span><input data-general-canvas="width" type="number" min="320" max="32768"></label><label><span data-general-canvas-height></span><input data-general-canvas="height" type="number" min="480" max="32768"></label></div><p class="hint" data-general-resize-hint></p><div class="general-comic-two-column"><label><span data-general-page-background></span><input data-general-page="background" type="color"></label><label><span data-general-border-color></span><input data-general-page="border_color" type="color"></label></div><div class="compact-swatch-controls"><span class="control-label" data-general-swatches-label></span><div class="segmented"><button type="button" data-general-page-color-target="background"></button><button type="button" data-general-page-color-target="border_color"></button></div></div>${colorSwatchesMarkup("page")}<div class="general-comic-two-column"><label><span data-general-border-width></span><input data-general-page="border_width" type="number" min="0" max="128" step=".5"></label><label><span data-general-gutter></span><input data-general-page="gutter" type="number" min="0" max="2048"></label></div><div class="general-comic-margin-grid"><label class="general-comic-check"><input data-general-page="margin_linked" type="checkbox"><span data-general-linked></span></label>${["top","right","bottom","left"].map((side) => `<label><span data-general-margin-${side}></span><input data-general-page="margin_${side}" type="number" min="0" max="2048"></label>`).join("")}</div></section>
          <section data-general-properties="panel" hidden><button type="button" class="comic-panel-collapse-action" data-general-action="toggle-panel-visibility"></button><p class="hint" data-general-panel-visibility-hint></p><label><span data-general-background-type></span><select data-general-panel-pattern-select="type"></select></label><label><span data-general-built-in-preset></span><select data-general-panel-pattern-select="preset"></select></label><div data-general-panel-pattern-colors><label data-general-panel-pattern-color-label="color"><span data-general-background-color></span><input data-general-panel-pattern-color="color" type="color"></label><label data-general-panel-pattern-color-label="patternColor"><span data-general-pattern-color></span><input data-general-panel-pattern-color="patternColor" type="color"></label><label data-general-panel-pattern-color-label="color2" hidden><span data-general-end-color></span><input data-general-panel-pattern-color="color2" type="color"></label></div><div class="compact-swatch-controls"><span class="control-label" data-general-swatches-label></span><div class="segmented"><button type="button" data-general-panel-pattern-color-target="color"></button><button type="button" data-general-panel-pattern-color-target="patternColor"></button><button type="button" data-general-panel-pattern-color-target="color2"></button></div></div>${colorSwatchesMarkup("panel-pattern")}<div data-general-panel-pattern-fields></div><button type="button" data-general-action="randomize-panel-pattern" hidden></button><button type="button" data-general-action="choose-panel-image"></button><div class="general-comic-action-row"><button type="button" data-general-action="split-x"></button><button type="button" data-general-action="split-y"></button></div></section>
          <section data-general-properties="image" hidden><div class="comic-image-property-summary"><div data-general-selected-thumbnail class="comic-image-preview"></div><span data-general-image-name></span></div><button type="button" data-general-action="remove-panel-image"></button><label><span data-general-image-scale-label></span><input data-general-image="image_scale" type="range" min=".05" max="5" step=".01"><output data-general-image-output="image_scale"></output></label><div class="general-comic-two-column"><label><span data-general-image-x-label></span><input data-general-image="image_offset_x" type="number" step="1"></label><label><span data-general-image-y-label></span><input data-general-image="image_offset_y" type="number" step="1"></label></div><button type="button" data-general-action="reset-image"></button><p class="hint" data-general-image-edit-hint></p></section>
          <section data-general-properties="divider" hidden><div class="hint" data-general-divider-axis></div><label><span data-general-divider-position></span><input data-general-divider-ratio type="range" min="1" max="99" step=".1"><output data-general-divider-output></output></label><div class="general-comic-action-row"><button class="general-comic-divider-danger" type="button" data-general-action="merge-first"></button><button class="general-comic-divider-danger" type="button" data-general-action="merge-second"></button></div><p class="hint" data-general-merge-hint></p></section>`;
        empty.parentNode.insertBefore(properties, empty); elements.properties = properties;
      }
      elements.tray?.addEventListener("click", (event) => { const action = event.target.closest("[data-general-action]")?.dataset.generalAction, card = event.target.closest("[data-general-image-id]"); if (action === "tray-toggle") { const collapsed = elements.tray.classList.toggle("collapsed"); event.target.closest("button").setAttribute("aria-expanded", String(!collapsed)); syncTrayViewport(); } else if (action === "add-images") elements.imageInput.click(); else if (action === "remove-image" && card) removeTrayImage(card.dataset.generalImageId); else if (card) { selectedTrayImageId = card.dataset.generalImageId; renderTray(); } });
      elements.imageInput?.addEventListener("change", async () => { const ids = await importFiles([...elements.imageInput.files]); if (pendingPanelId && ids[0]) assignImage(pendingPanelId, ids[0]); pendingPanelId = ""; elements.imageInput.value = ""; });
      elements.properties?.addEventListener("input", handlePropertyInput);
      elements.properties?.addEventListener("input", handlePanelPatternInput);
      elements.properties?.addEventListener("change", handlePropertyChange);
      elements.properties?.addEventListener("change", handlePanelPatternChange);
      elements.properties?.addEventListener("click", handleActionClick);
      elements.toolbar?.addEventListener("click", handleActionClick);
      for (const host of elements.properties?.querySelectorAll("[data-general-color-scope]") || []) {
        host.replaceChildren(...(options.colorSwatches || []).map((color) => { const button = document.createElement("button"); button.type = "button"; button.className = "compact-color-swatch"; button.dataset.color = String(color).toLowerCase(); button.style.setProperty("--swatch-color", color); button.title = color; return button; }));
      }
    }

    function rebuildPanelBackgroundProperties(panel) {
      const patterns = backgroundPatterns();
      if (!patterns || !elements.properties || !panel) return;
      const value = panelBackgroundPattern(panel), type = patterns.TYPES.find((item) => item.id === value.type) || patterns.TYPES[0];
      const typeSelect = elements.properties.querySelector('[data-general-panel-pattern-select="type"]'), presetSelect = elements.properties.querySelector('[data-general-panel-pattern-select="preset"]');
      typeSelect.replaceChildren(...patterns.TYPES.map((item) => new Option(tr(item.ja, item.en), item.id)));
      typeSelect.value = type.id;
      presetSelect.replaceChildren(...type.presets.map((item) => new Option(tr(item.ja, item.en), item.id)));
      presetSelect.value = value.preset;
      for (const input of elements.properties.querySelectorAll("[data-general-panel-pattern-color]")) { input.value = value[input.dataset.generalPanelPatternColor]; input.disabled = !panelEditable(panel); }
      const gradient = type.id === "linear-gradient" || type.id === "radial-gradient", solid = type.id === "solid";
      elements.properties.querySelector('[data-general-panel-pattern-color-label="patternColor"]').hidden = solid;
      elements.properties.querySelector('[data-general-panel-pattern-color-label="color2"]').hidden = !gradient;
      if (solid && activePanelPatternColor !== "color") activePanelPatternColor = "color";
      if (!gradient && activePanelPatternColor === "color2") activePanelPatternColor = "color";
      for (const button of elements.properties.querySelectorAll("[data-general-panel-pattern-color-target]")) {
        const key = button.dataset.generalPanelPatternColorTarget;
        button.hidden = key === "patternColor" && solid || key === "color2" && !gradient;
        button.classList.toggle("active", key === activePanelPatternColor);
      }
      const fields = elements.properties.querySelector("[data-general-panel-pattern-fields]");
      fields.replaceChildren(...type.fields.map((key) => { const definition = patterns.FIELDS[key], label = document.createElement("label"), row = document.createElement("div"), range = document.createElement("input"), output = document.createElement("output"); label.className = "canvas-background-field"; label.append(tr(definition.ja, definition.en)); row.className = "range-output-row"; range.type = "range"; range.min = definition.min; range.max = definition.max; range.step = definition.step; range.value = value[key]; range.dataset.generalPanelPatternField = key; output.textContent = String(value[key]); row.append(range, output); label.append(row); return label; }));
      elements.properties.querySelector('[data-general-action="randomize-panel-pattern"]').hidden = !type.fields.includes("seed");
      for (const control of elements.properties.querySelectorAll("[data-general-panel-pattern-select],[data-general-panel-pattern-field],[data-general-panel-pattern-color-target],[data-general-action=\"randomize-panel-pattern\"],[data-general-action=\"choose-panel-image\"],[data-general-action=\"split-x\"],[data-general-action=\"split-y\"]")) control.disabled = !panelEditable(panel);
      const swatches = elements.properties.querySelector('[data-general-color-scope="panel-pattern"]');
      if (swatches) swatches.dataset.generalColorKey = activePanelPatternColor;
    }

    function handlePanelPatternInput(event) {
      const input = event.target.closest("[data-general-panel-pattern-color],[data-general-panel-pattern-field]"), panel = selectedPanel();
      if (!input || !panelEditable(panel)) return;
      beginEdit(input);
      const value = panelBackgroundPattern(panel), key = input.dataset.generalPanelPatternColor || input.dataset.generalPanelPatternField;
      value[key] = input.type === "color" ? input.value : Number(input.value);
      setPanelBackgroundPattern(panel, value);
      if (input.dataset.generalPanelPatternField) input.nextElementSibling.textContent = input.value;
      requestRender({ canvas: true, preview: true });
    }

    function handlePanelPatternChange(event) {
      const input = event.target.closest("[data-general-panel-pattern-color],[data-general-panel-pattern-field]"), select = event.target.closest("[data-general-panel-pattern-select]"), panel = selectedPanel(), patterns = backgroundPatterns();
      if (input) { if (!panelEditable(panel)) return; delete input.dataset.generalEditing; changed(); syncUi(); return; }
      if (!select || !panelEditable(panel) || !patterns) return;
      options.pushUndo?.();
      const value = panelBackgroundPattern(panel);
      if (select.dataset.generalPanelPatternSelect === "type") setPanelBackgroundPattern(panel, { type: select.value, color: value.color, patternColor: value.patternColor, color2: value.color2 });
      else { const type = patterns.TYPES.find((item) => item.id === value.type), preset = type?.presets.find((item) => item.id === select.value); if (!preset) return; setPanelBackgroundPattern(panel, { ...value, ...preset.values, preset: preset.id }); }
      changed(); syncUi();
    }

    function updateLanguage() {
      const set = (selector, ja, en) => { const node = (elements.properties || elements.tray)?.ownerDocument?.querySelector(selector); if (node) node.textContent = tr(ja, en); };
      set("[data-general-resize-hint]", "サイズ変更時はレイアウトと内容を比例変更します。", "Resizing scales the layout and content proportionally.");
      document.querySelectorAll("[data-general-page='template_id'] option").forEach((option) => option.textContent = templateLabel(option.value));
      const labels = [
        ["[data-general-template-label]","テンプレート","Template"],["[data-general-canvas-width]","キャンバス幅","Canvas Width"],["[data-general-canvas-height]","キャンバス高さ","Canvas Height"],["[data-general-page-background]","ページ背景","Page Background"],["[data-general-border-width]","枠線幅","Border Width"],["[data-general-gutter]","コマ間隔","Panel Gap"],["[data-general-border-color]","枠線色","Border Color"],["[data-general-linked]","余白を連動","Link Margins"],["[data-general-margin-top]","上","Top"],["[data-general-margin-right]","右","Right"],["[data-general-margin-bottom]","下","Bottom"],["[data-general-margin-left]","左","Left"],["[data-general-structure-lock]","コマ割りをロック","Lock Panel Layout"],["[data-general-background-type]","背景の種類","Background Type"],["[data-general-built-in-preset]","内蔵プリセット","Built-in Preset"],["[data-general-background-color]","背景色","Background Color"],["[data-general-pattern-color]","パターン色","Pattern Color"],["[data-general-end-color]","終了色","End Color"],["[data-general-swatches-label]","スウォッチ","Swatches"],["[data-general-image-scale-label]","画像倍率","Image Scale"],["[data-general-image-x-label]","位置 X","Position X"],["[data-general-image-y-label]","位置 Y","Position Y"],["[data-general-divider-position]","境界位置","Divider Position"]
      ]; labels.forEach(([selector, ja, en]) => document.querySelectorAll(selector).forEach((node) => node.textContent = tr(ja, en)));
      const actions = { "choose-panel-image":["＋ コマ画像を選択","Choose Panel Image"], "randomize-panel-pattern":["ランダム化","Randomize"], "reset-image":["画像位置を中央へ戻す","Reset Image Position"], "remove-panel-image":["画像を外す","Remove Image"], "split-x":["縦分割","Split Vertically"], "split-y":["横分割","Split Horizontally"], "merge-first":["前側を残して結合","Merge, Keep First"], "merge-second":["後側を残して結合","Merge, Keep Second"], "add-images":["＋ 画像を追加","Add Images"] };
      for (const [action, value] of Object.entries(actions)) document.querySelectorAll(`[data-general-action="${action}"]`).forEach((button) => button.textContent = tr(...value));
      const colorTargets = { background:["背景","Background"], border_color:["枠線","Border"], color:["背景","Background"], patternColor:["パターン","Pattern"], color2:["終了色","End Color"] };
      for (const [key, value] of Object.entries(colorTargets)) document.querySelectorAll(`[data-general-page-color-target="${key}"],[data-general-panel-pattern-color-target="${key}"]`).forEach((button) => button.textContent = tr(...value));
      set("[data-general-tray-title]", "画像トレイ", "Image Tray");
      set("[data-general-image-edit-hint]", "Canvas上でドラッグして移動、Ctrl＋ホイールで拡大・縮小できます。", "Drag on the canvas to move. Use Ctrl+wheel to scale.");
    }

    function syncUi() {
      document.documentElement.classList.toggle("general-comic-canvas-active", active);
      document.documentElement.dataset.editorMode = active ? "comic_layout" : document.documentElement.dataset.editorMode;
      if (elements.tray) elements.tray.hidden = !active || !comic.created;
      document.querySelector(".canvas-panel")?.classList.toggle("general-comic-active", active && comic.created);
      const structural = active && comic.created && !options.hasLayerSelection?.();
      if (elements.properties) elements.properties.hidden = !structural;
      const normal = document.getElementById("properties"), empty = document.getElementById("empty");
      if (structural) { if (normal) normal.hidden = true; if (empty) empty.hidden = true; }
      else if (active && options.hasLayerSelection?.()) { if (normal) normal.hidden = false; }
      if (structural && elements.properties) {
        const index = selection.kind === "panel" || selection.kind === "image" ? panelOrder().findIndex((panel) => panel.id === selection.id) + 1 : 0;
        const imagePanels = selectedImagePanels();
        const name = selection.kind === "page" ? tr("漫画ページ", "Comic Page") : selection.kind === "image" ? imagePanels.length > 1 ? tr(`${imagePanels.length}個のコマ画像を選択中`, `${imagePanels.length} panel images selected`) : tr(`コマ ${index}の画像`, `Panel ${index} Image`) : selection.kind === "panel" ? tr(`コマ ${index}`, `Panel ${index}`) : tr("コマ境界", "Panel Divider");
        elements.properties.querySelector("[data-general-selection-name]").textContent = name;
        const selectionKind = elements.properties.querySelector("[data-general-selection-kind]");
        selectionKind.textContent = selection.kind === "page" ? "" : selection.kind === "image" ? tr("画像", "Image") : selection.kind === "panel" ? tr("コマ", "Panel") : tr("境界", "Divider");
        selectionKind.hidden = selection.kind === "page";
        elements.properties.querySelector("[data-general-page-title-lock]").hidden = selection.kind !== "page";
        elements.properties.querySelectorAll("[data-general-properties]").forEach((section) => section.hidden = section.dataset.generalProperties !== selection.kind);
        for (const input of elements.properties.querySelectorAll("[data-general-page]")) { const key = input.dataset.generalPage; const value = key === "template_id" ? comic.template_id : comic.page[key]; if (key === "template_id") input.disabled = comic.page.structure_locked; if (input.type === "checkbox") input.checked = Boolean(value); else if (document.activeElement !== input) input.value = value; }
        for (const input of elements.properties.querySelectorAll("[data-general-canvas]")) if (document.activeElement !== input) input.value = Math.round(comic.page[input.dataset.generalCanvas]);
        for (const button of elements.properties.querySelectorAll("[data-general-page-color-target]")) button.classList.toggle("active", button.dataset.generalPageColorTarget === activePageColor);
        const pageSwatches = elements.properties.querySelector('[data-general-color-scope="page"]'); if (pageSwatches) pageSwatches.dataset.generalColorKey = activePageColor;
        const panel = selectedPanel();
        if (selection.kind === "panel" && panel) {
          rebuildPanelBackgroundProperties(panel);
          const visibility = elements.properties.querySelector('[data-general-action="toggle-panel-visibility"]');
          const hidden = panel.visible === false;
          visibility.textContent = hidden ? tr("コマを表示", "Show Panel") : tr("コマを非表示", "Hide Panel");
          visibility.classList.toggle("is-restoring", hidden);
          visibility.disabled = comic.page.structure_locked || !panelEditable(panel) || (!hidden && panelOrder().filter((item) => item.visible !== false).length <= 1);
          visibility.title = comic.page.structure_locked ? tr("漫画ページのロックを解除してください", "Unlock the comic page to change panel visibility.") : !panelEditable(panel) ? tr("コマのロックを解除してください", "Unlock the panel to edit it.") : "";
          elements.properties.querySelector("[data-general-panel-visibility-hint]").textContent = tr("内容を保持したままコマを非表示にし、残りのコマを自動的に詰めます。", "Hides the panel while preserving its content and automatically reflows the remaining panels.");
        }
        if (selection.kind === "image" && panel) {
          for (const input of elements.properties.querySelectorAll("[data-general-image]")) { const key = input.dataset.generalImage; input.disabled = imagePanels.length > 1 || !panelEditable(panel) || panel.image_locked; if (document.activeElement !== input) input.value = panel[key]; }
          const output = elements.properties.querySelector('[data-general-image-output="image_scale"]'); if (output) output.textContent = `${Math.round(panel.image_scale * 100)}%`;
          const metadata = comic.images.find((item) => item.id === panel.image_id), thumbnail = elements.properties.querySelector("[data-general-selected-thumbnail]"), imageName = elements.properties.querySelector("[data-general-image-name]");
          thumbnail.replaceChildren();
          const runtime = runtimeImages.get(panel.image_id); if (runtime?.src && imagePanels.length === 1) { const preview = document.createElement("img"); preview.src = runtime.src; preview.alt = ""; thumbnail.append(preview); }
          imageName.textContent = imagePanels.length > 1 ? tr(`${imagePanels.length}個の画像`, `${imagePanels.length} images`) : metadata?.name || tr("画像なし", "No image");
          elements.properties.querySelector('[data-general-action="remove-panel-image"]').disabled = !panel.image_id;
        }
        const divider = selectedDivider(); if (divider) { const ratio = Math.round(divider.ratio * 1000) / 10, input = elements.properties.querySelector("[data-general-divider-ratio]"), editable = dividerEditable(divider); if (document.activeElement !== input) input.value = ratio; input.disabled = !editable; elements.properties.querySelector("[data-general-divider-output]").textContent = `${ratio}%`; elements.properties.querySelector("[data-general-divider-axis]").textContent = divider.axis === "x" ? tr("分割方向：縦", "Direction: Vertical") : tr("分割方向：横", "Direction: Horizontal"); const mergeAllowed = divider.node.first?.kind === "panel" && divider.node.second?.kind === "panel"; elements.properties.querySelectorAll("[data-general-action^='merge-']").forEach((button) => button.disabled = !editable || !mergeAllowed); elements.properties.querySelector("[data-general-merge-hint]").textContent = mergeAllowed ? tr("兄弟コマを安全に結合します。画像素材はトレイに残ります。", "Merges direct sibling panels. Image assets remain in the tray.") : tr("入れ子の分割を含む境界は結合できません。", "A divider containing a nested split cannot be merged."); }
      }
      updateToolbar(); updateLanguage(); renderTray(); syncTrayViewport(); options.syncActionState?.();
    }

    function updateToolbar() { if (!elements.toolbar) return; const rect = selection.kind === "panel" ? panelRect(selection.id) : null; elements.toolbar.hidden = !active || !rect || comic.page.structure_locked || options.hasLayerSelection?.(); if (elements.toolbar.hidden) return; const canvas = document.getElementById("canvas"), panel = document.querySelector(".canvas-panel"); if (!canvas || !panel) return; const canvasRect = canvas.getBoundingClientRect(), panelBox = panel.getBoundingClientRect(), zoom = canvasState().zoom || 1; elements.toolbar.style.left = `${canvasRect.left - panelBox.left + (rect.x + rect.w / 2) * zoom - elements.toolbar.offsetWidth / 2}px`; elements.toolbar.style.top = `${canvasRect.top - panelBox.top + rect.y * zoom + 8}px`; }

    function createPage({ width, height, templateId = "standard_five" } = {}, control = {}) { const next = core.defaultState(width || 2480, height || 3508, uuid, templateId); if (control.recordUndo !== false) options.pushUndo?.(); options.resizeCanvas?.(next.page.width, next.page.height); comic = next; comic.enabled = true; comic.created = true; active = used = true; selection = { kind: "page", id: null }; selectedImagePanelIds.clear(); imageSelectionAnchorId = null; changed(); syncUi(); return serialize(); }
    function setActive(enable, control = {}) { const previous = active; let createdNow = false; active = Boolean(enable); comic.enabled = active; drag = null; if (control.switchWorkspace !== false) options.switchWorkspace?.(active ? "comic_layout" : "single"); if (active && !comic.created) { createPage({ width: 2480, height: 3508, templateId: "standard_five" }, { recordUndo: false }); createdNow = true; } else if (active) options.resizeCanvas?.(comic.page.width, comic.page.height); if (active) selection ||= { kind: "page", id: null }; if (previous !== active && control.notify !== false && !createdNow) changed(); syncUi(); if (control.fitView !== false) requestAnimationFrame(() => options.fitView?.(false)); return true; }
    const activate = (control) => setActive(true, control); const deactivate = (control) => setActive(false, control);

    function beginEdit(input) { if (!input.dataset.generalEditing) { options.pushUndo?.(); input.dataset.generalEditing = "1"; } }
    function handlePropertyInput(event) {
      const pageInput = event.target.closest("[data-general-page]"), canvasInput = event.target.closest("[data-general-canvas]"), imageInput = event.target.closest("[data-general-image]"), dividerInput = event.target.closest("[data-general-divider-ratio]");
      if (!pageInput && !canvasInput && !imageInput && !dividerInput) return;
      if (pageInput) { beginEdit(pageInput); const key = pageInput.dataset.generalPage; if (key === "template_id") return; if (pageInput.type === "checkbox") { comic.page[key] = pageInput.checked; if (key === "margin_linked" && pageInput.checked) { const linked = comic.page.margin_top; for (const side of ["top","right","bottom","left"]) comic.page[`margin_${side}`] = linked; } } else if (pageInput.type === "color") comic.page[key] = pageInput.value; else { comic.page[key] = core.clamp(pageInput.value, 0, key === "border_width" ? 128 : 2048); if (key.startsWith("margin_") && comic.page.margin_linked) for (const side of ["top","right","bottom","left"]) comic.page[`margin_${side}`] = comic.page[key]; } requestRender({ canvas: true, layers: true }); }
      if (canvasInput) { beginEdit(canvasInput); const width = canvasInput.dataset.generalCanvas === "width" ? core.clamp(canvasInput.value, 320, 32768) : comic.page.width, height = canvasInput.dataset.generalCanvas === "height" ? core.clamp(canvasInput.value, 480, 32768) : comic.page.height; options.resizeCanvas?.(Math.round(width), Math.round(height)); }
      if (imageInput) { const panel = selectedPanel(); if (!panelEditable(panel) || panel.image_locked || selection.kind !== "image" || selectedImagePanels().length > 1) return; beginEdit(imageInput); const key = imageInput.dataset.generalImage; panel[key] = key === "image_scale" ? core.clamp(imageInput.value, .05, 5) : Number(imageInput.value) || 0; requestRender({ canvas: true, layers: true }); }
      if (dividerInput) { const divider = selectedDivider(); if (!dividerEditable(divider)) return; beginEdit(dividerInput); const nextCenter = Number(dividerInput.value) / 100, delta = nextCenter - divider.ratio, range = core.ratioRange(divider.node, divider.parentRect, comic.page.gutter), minimumDelta = Math.max(range.minimum - divider.startRatio, range.minimum - divider.endRatio), maximumDelta = Math.min(range.maximum - divider.startRatio, range.maximum - divider.endRatio), shift = core.clamp(delta, minimumDelta, maximumDelta), result = core.setSplitRatios(comic.tree, divider.id, divider.startRatio + shift, divider.endRatio + shift); if (result.changed) comic.tree = result.tree; requestRender({ canvas: true, layers: true }); }
      syncUi();
    }
    function handlePropertyChange(event) { const input = event.target.closest("[data-general-page],[data-general-canvas],[data-general-image],[data-general-divider-ratio]"); if (!input) return; if (input.dataset.generalPage === "template_id") { applyTemplate(input.value); return; } if (input.matches("[data-general-divider-ratio]") && !dividerEditable(selectedDivider())) { syncUi(); return; } delete input.dataset.generalEditing; changed(); syncUi(); }
    function handleActionClick(event) {
      const pageColorTarget = event.target.closest("[data-general-page-color-target]")?.dataset.generalPageColorTarget;
      const panelColorTarget = event.target.closest("[data-general-panel-pattern-color-target]")?.dataset.generalPanelPatternColorTarget;
      const colorButton = event.target.closest("[data-color]"), colorHost = colorButton?.closest("[data-general-color-scope]");
      if (pageColorTarget) { activePageColor = pageColorTarget; syncUi(); return; }
      if (panelColorTarget) { activePanelPatternColor = panelColorTarget; syncUi(); return; }
      if (colorButton && colorHost) {
        const panel = selectedPanel(); if (colorHost.dataset.generalColorScope !== "page" && !panelEditable(panel)) return; options.pushUndo?.();
        if (colorHost.dataset.generalColorScope === "page") comic.page[activePageColor] = colorButton.dataset.color;
        else if (panel) { const value = panelBackgroundPattern(panel); value[activePanelPatternColor] = colorButton.dataset.color; setPanelBackgroundPattern(panel, value); }
        changed(); syncUi(); return;
      }
      const action = event.target.closest("[data-general-action]")?.dataset.generalAction;
      if (!action) return;
      if (action === "split-x") splitSelected("x");
      else if (action === "split-y") splitSelected("y");
      else if (action === "merge-first") mergeSelectedDivider("first");
      else if (action === "merge-second") mergeSelectedDivider("second");
      else if (action === "choose-panel-image") { const panel = selectedPanel(); if (panelEditable(panel)) { pendingPanelId = panel.id; elements.imageInput.click(); } }
      else if (action === "toggle-panel-visibility") { const panel = selectedPanel(); if (!panelEditable(panel) || comic.page.structure_locked) return; if (panel.visible !== false && panelOrder().filter((item) => item.visible !== false).length <= 1) return; options.pushUndo?.(); panel.visible = panel.visible === false; changed(); syncUi(); }
      else if (action === "randomize-panel-pattern") { const panel = selectedPanel(), patterns = backgroundPatterns(); if (!panelEditable(panel) || !patterns) return; options.pushUndo?.(); setPanelBackgroundPattern(panel, { ...panelBackgroundPattern(panel), seed: patterns.randomSeed() }); changed(); syncUi(); }
      else if (action === "remove-panel-image") { const panel = selectedPanel(); if (panelEditable(panel) && panel.image_id) { options.pushUndo?.(); panel.image_id = null; selectedImagePanelIds.delete(panel.id); selection = { kind: "panel", id: panel.id }; changed(); syncUi(); } }
      else if (action === "reset-image") { const panel = selectedPanel(); if (panelEditable(panel) && panel.image_id && !panel.image_locked) { options.pushUndo?.(); panel.image_scale = 1; panel.image_offset_x = panel.image_offset_y = 0; changed(); syncUi(); } }
    }

    function applyTemplate(templateId) { if (comic.page.structure_locked) { syncUi(); return false; } if (!core.PUBLIC_TEMPLATE_IDS.has(templateId)) return false; const hasContent = core.collectPanels(comic.tree).some((panel) => panel.image_id) || options.hasPanelTargetedLayers?.(); if (hasContent && !confirm(tr("現在のコマ割りを置き換えますか？\nコマ内レイヤーはページ上へ移し、画像素材はトレイに残します。", "Replace the current panel layout?\nPanel layers move to the page and image assets remain in the tray."))) { syncUi(); return false; } options.pushUndo?.(); options.detachPanelTargetsToPage?.(); comic.tree = core.createTemplate(templateId, uuid); comic.template_id = templateId; selection = { kind: "page", id: null }; selectedImagePanelIds.clear(); imageSelectionAnchorId = null; changed(); syncUi(); return true; }
    function splitSelected(axis) { const panel = selection.kind === "panel" ? selectedPanel() : null; if (!panelEditable(panel) || panel.visible === false || comic.page.structure_locked) return false; const result = core.splitPanel(comic.tree, panel.id, axis, uuid); if (!result.changed) return false; options.pushUndo?.(); comic.tree = result.tree; selection = { kind: "panel", id: result.panelId }; lastPanelId = result.panelId; changed(); syncUi(); return true; }
    function mergeSelectedDivider(keep = "first") { const divider = selectedDivider(); if (!dividerEditable(divider)) return false; const result = core.mergeDivider(comic.tree, divider.id, keep); if (!result.changed) return false; options.pushUndo?.(); comic.tree = result.tree; options.reassignPanelTargets?.(result.removedPanelIds, result.keptPanelId); selection = { kind: "panel", id: result.keptPanelId }; lastPanelId = result.keptPanelId; changed(); syncUi(); return true; }

    function ratioFromPoint(divider, point) { const rect = divider.parentRect, dimension = divider.axis === "x" ? rect.w : rect.h, offset = divider.axis === "x" ? point.x - rect.x : point.y - rect.y, raw = (offset - comic.page.gutter / 2) / Math.max(1, dimension - comic.page.gutter), range = core.ratioRange(divider.node, rect, comic.page.gutter); return core.clamp(raw, range.minimum, range.maximum); }
    function handlePointerDown(point, event = {}) {
      if (!active || !comic.created || event.button > 0 || options.layerAt?.(point)) return false;
      const computed = layout(), zoom = Math.max(.1, canvasState().zoom || 1), endpoint = !comic.page.structure_locked ? core.dividerHandleAtPoint(computed, point, 16 / zoom) : null;
      const candidate = endpoint?.divider || (!comic.page.structure_locked ? core.dividerAtPoint(computed, point, 10 / zoom) : null), divider = dividerEditable(candidate) ? candidate : null;
      if (divider) {
        options.pushUndo?.(); setSelection("divider", divider.id);
        drag = endpoint ? { kind: "divider-endpoint", id: divider.id, endpoint: endpoint.endpoint, changed: false } : { kind: "divider", id: divider.id, sx: point.x, sy: point.y, startRatio: divider.startRatio, endRatio: divider.endRatio, changed: false };
        return true;
      }
      const hit = core.panelAtPoint(computed, point);
      if (hit) {
        if (hit.node.image_id) {
          const preserve = selectedImagePanelIds.size > 1 && selectedImagePanelIds.has(hit.id) && !(event.shiftKey || event.ctrlKey || event.metaKey);
          if (!preserve) selectPanelImage(hit.id, event);
          else { selection = { kind: "image", id: hit.id }; lastPanelId = hit.id; syncUi(); }
          const movable = selectedImagePanels().filter((panel) => panelEditable(panel) && !panel.image_locked);
          if (!(event.shiftKey || event.ctrlKey || event.metaKey) && movable.length) { options.pushUndo?.(); drag = { kind: "image", panels: movable.map((panel) => ({ panel, x: panel.image_offset_x, y: panel.image_offset_y })), sx: point.x, sy: point.y, changed: false }; }
        } else selectPanel(hit.id);
        return true;
      }
      if (core.pointInRect(point, { x: 0, y: 0, w: comic.page.width, h: comic.page.height })) { selectPage(); return true; }
      return false;
    }
    function handlePointerMove(point, event = {}) { if (!active) return false; if (!drag) { const computed = layout(), zoom = Math.max(.1, canvasState().zoom || 1), handle = !comic.page.structure_locked ? core.dividerHandleAtPoint(computed, point, 16 / zoom) : null, divider = handle?.divider || (!comic.page.structure_locked ? core.dividerAtPoint(computed, point, 10 / zoom) : null), next = divider?.id || ""; if (next !== hoverDividerId) { hoverDividerId = next; requestRender({ canvas: true }); } return false; } if (drag.kind === "divider-endpoint") { const divider = layout().dividers.find((item) => item.id === drag.id); if (!divider) return false; let next = ratioFromPoint(divider, point), start = divider.startRatio, end = divider.endRatio; if (event.shiftKey) { const snapped = core.snapDividerEndpointToAngle(divider, drag.endpoint, next, comic.page.gutter, 15); next = snapped.ratio; drag.snapLabel = `${Math.round(snapped.angle)}°`; } else drag.snapLabel = !event.altKey && core.dividerStraightDistancePx({ ...divider, startRatio: drag.endpoint === "start" ? next : start, endRatio: drag.endpoint === "end" ? next : end }, canvasState().zoom || 1, comic.page.gutter) <= 5 ? (divider.axis === "x" ? "90°" : "0°") : ""; if (drag.endpoint === "start") start = next; else end = next; const result = core.setSplitRatios(comic.tree, drag.id, start, end); if (result.changed) { comic.tree = result.tree; drag.changed = true; } requestRender({ canvas: true }); return true; } if (drag.kind === "divider") { const divider = layout().dividers.find((item) => item.id === drag.id); if (!divider) return false; const rect = divider.parentRect, dimension = divider.axis === "x" ? rect.w : rect.h, delta = (divider.axis === "x" ? point.x - drag.sx : point.y - drag.sy) / Math.max(1, dimension - comic.page.gutter), range = core.ratioRange(divider.node, rect, comic.page.gutter), minimumDelta = Math.max(range.minimum - drag.startRatio, range.minimum - drag.endRatio), maximumDelta = Math.min(range.maximum - drag.startRatio, range.maximum - drag.endRatio), shift = core.clamp(delta, minimumDelta, maximumDelta), result = core.setSplitRatios(comic.tree, drag.id, drag.startRatio + shift, drag.endRatio + shift); if (result.changed) { comic.tree = result.tree; drag.changed = true; requestRender({ canvas: true }); } return true; } if (drag.kind === "image") { for (const initial of drag.panels) { initial.panel.image_offset_x = initial.x + point.x - drag.sx; initial.panel.image_offset_y = initial.y + point.y - drag.sy; } drag.changed = true; requestRender({ canvas: true }); return true; } return false; }
    function handlePointerEnd(event = {}) { if (!drag) return false; const completed = drag, changedValue = completed.changed; if (completed.kind === "divider-endpoint" && changedValue && event.type !== "pointercancel" && !event.altKey) { const divider = layout().dividers.find((item) => item.id === completed.id); if (divider && core.dividerStraightDistancePx(divider, canvasState().zoom || 1, comic.page.gutter) <= 5) { const center = (divider.startRatio + divider.endRatio) / 2, result = core.setSplitRatios(comic.tree, divider.id, center, center); if (result.changed) comic.tree = result.tree; } } drag = null; if (changedValue) changed(); syncUi(); return true; }
    function pointerCursorAt(point) { if (!active || comic.page.structure_locked) return ""; const computed = layout(), zoom = Math.max(.1, canvasState().zoom || 1); if (core.dividerHandleAtPoint(computed, point, 16 / zoom)) return "crosshair"; const divider = core.dividerAtPoint(computed, point, 10 / zoom); return divider ? divider.axis === "x" ? "col-resize" : "row-resize" : ""; }
    function handleWheel(event, point) { if (!active || !(event.ctrlKey || event.metaKey) || selection.kind !== "image") return false; const panels = selectedImagePanels().filter((panel) => panelEditable(panel) && !panel.image_locked); if (!panels.length) return false; if (point) { const hit = core.panelAtPoint(layout(), point); if (!hit || !selectedImagePanelIds.has(hit.id) && hit.id !== selection.id) return false; } options.pushUndo?.(); const factor = event.deltaY < 0 ? 1.08 : .92; panels.forEach((panel) => panel.image_scale = core.clamp(panel.image_scale * factor, .05, 5)); changed(); syncUi(); return true; }

    async function importFiles(files) { const valid = files.filter(supportedImage); if (!valid.length) { options.setStatus?.(tr("PNG / JPEG / WebPを選択してください", "Choose PNG, JPEG, or WebP"), "error"); return []; } if (comic.images.length + valid.length > MAX_IMAGES) { options.setStatus?.(tr("画像トレイは100枚までです", "Up to 100 Image Tray images are supported"), "error"); return []; } const ids = []; for (const file of valid) { if (file.size > MAX_IMAGE_BYTES) { options.setStatus?.(tr("画像が大きすぎます", "The image is too large"), "error"); continue; } let metadata = { id: `${IMAGE_PREFIX}${uuid()}`, name: String(file.name || "image").replace(/\.[^.]+$/, ""), mime: file.type || "image/png", width: 1, height: 1, sha256: "", source: "stored" }; const stored = await imageStore.put(metadata, file); if (stored?.id) metadata = { ...metadata, ...stored, id: String(stored.id), source: "forge-project" }; const duplicate = comic.images.find((item) => item.id === metadata.id); if (duplicate) { if (!runtimeImages.has(duplicate.id)) await attachBlob(duplicate, file); ids.push(duplicate.id); continue; } await attachBlob(metadata, file); comic.images.push(metadata); ids.push(metadata.id); } if (ids.length) { used = true; selectedTrayImageId = ids.at(-1); changed(); renderTray(); } return ids; }
    async function getConversionSources() {
      const panel = selectedPanel(), preferredId = panel?.image_id || selectedTrayImageId || "";
      processingPanelId = panel?.image_id ? panel.id : "";
      const ordered = [...comic.images.filter((item) => item.id === preferredId), ...comic.images.filter((item) => item.id !== preferredId)], sources = [];
      for (const metadata of ordered) {
        const blob = runtimeBlobs.get(metadata.id) || await imageStore.get(metadata.id);
        if (!blob) continue;
        sources.push({ id: metadata.id, name: metadata.name || tr("画像トレイ", "Image Tray Image"), width: Number(metadata.width) || 1, height: Number(metadata.height) || 1, blob, selected: metadata.id === preferredId });
      }
      return sources;
    }
    async function addConvertedImage(blob, name = "comic-converted.png") {
      if (!(blob instanceof Blob)) return "";
      const safeName = String(name || "comic-converted.png").replace(/[\\/:*?"<>|]+/g, "-"), file = new File([blob], /\.png$/i.test(safeName) ? safeName : `${safeName}.png`, { type: "image/png", lastModified: Date.now() });
      options.pushUndo?.();
      const ids = await importFiles([file]), addedId = ids[0] || "";
      if (!addedId) throw new Error(tr("変換画像を画像トレイへ追加できませんでした。", "The converted image could not be added to the Image Tray."));
      const target = processingPanelId ? core.findNode(comic.tree, processingPanelId) : null;
      if (target?.kind === "panel") { target.image_id = addedId; target.image_visible = true; selectedImagePanelIds.clear(); selectedImagePanelIds.add(target.id); selection = { kind: "image", id: target.id }; lastPanelId = target.id; }
      processingPanelId = "";
      selectedTrayImageId = addedId;
      elements.tray?.classList.remove("collapsed");
      changed(); syncUi();
      return addedId;
    }
    function assignImage(panelId, imageId) { const panel = core.findNode(comic.tree, panelId); if (!panelEditable(panel) || !comic.images.some((item) => item.id === imageId)) return false; options.pushUndo?.(); panel.image_id = imageId; panel.image_scale = 1; panel.image_offset_x = panel.image_offset_y = 0; panel.image_visible = true; selectedImagePanelIds.clear(); selectedImagePanelIds.add(panelId); selection = { kind: "image", id: panelId }; lastPanelId = panelId; changed(); syncUi(); return true; }
    async function removeTrayImage(imageId) { const usedPanels = core.collectPanels(comic.tree).filter((panel) => panel.image_id === imageId); if (usedPanels.some((panel) => !panelEditable(panel))) return; if (usedPanels.length && !confirm(tr(`この画像は${usedPanels.length}個のコマで使用中です。削除しますか？`, `This image is used in ${usedPanels.length} panel(s). Remove it?`))) return; options.pushUndo?.(); usedPanels.forEach((panel) => { panel.image_id = null; selectedImagePanelIds.delete(panel.id); }); if (selection.kind === "image" && !core.findNode(comic.tree, selection.id)?.image_id) selection = { kind: "panel", id: selection.id }; comic.images = comic.images.filter((item) => item.id !== imageId); /* Keep the Blob and runtime image until the document is closed so Undo can restore this image. */ changed(); syncUi(); }
    function renderTray() {
      if (!elements.trayList) return;
      const usedIds = new Set(core.collectPanels(comic.tree).map((panel) => panel.image_id).filter(Boolean));
      elements.tray.querySelector("[data-general-image-count]").textContent = tr(`${comic.images.length}枚`, `${comic.images.length} images`);
      elements.trayList.replaceChildren(...comic.images.map((metadata) => {
        const card = document.createElement("article");
        card.className = `comic-image-card${usedIds.has(metadata.id) ? " used" : ""}${selectedTrayImageId === metadata.id ? " selected" : ""}`;
        card.dataset.generalImageId = metadata.id;
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
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "×";
        remove.dataset.generalAction = "remove-image";
        remove.title = usedIds.has(metadata.id) ? tr("使用中のコマから外して削除", "Remove from panels and delete") : tr("画像トレイから削除", "Delete from Image Tray");
        remove.addEventListener("pointerdown", (event) => event.stopPropagation());
        card.append(preview, name, remove);
        card.addEventListener("dragstart", (event) => {
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData(IMAGE_DRAG_TYPE, metadata.id);
          event.dataTransfer.setData("text/plain", metadata.id);
          card.classList.add("dragging");
        });
        card.addEventListener("dragend", () => card.classList.remove("dragging"));
        return card;
      }));
      syncTrayViewport();
    }

    function syncTrayViewport() {
      const canvasPanel = document.querySelector(".canvas-panel");
      if (!canvasPanel || !elements.tray) return;
      const visible = active && comic.created && !elements.tray.hidden;
      canvasPanel.classList.toggle("general-comic-tray-visible", visible);
      requestAnimationFrame(() => {
        if (!visible) {
          canvasPanel.style.removeProperty("--general-comic-tray-height");
          return;
        }
        canvasPanel.style.setProperty("--general-comic-tray-height", `${Math.ceil(elements.tray.offsetHeight)}px`);
      });
    }
    function handleImageDrop(transfer, point) { if (!active) return false; const files = [...(transfer?.files || [])].filter(supportedImage); if (files.length) { const panel = core.panelAtPoint(layout(), point); importFiles(files).then((ids) => { if (panel && ids[0]) assignImage(panel.id, ids[0]); }); return true; } const imageId = transfer?.getData?.(IMAGE_DRAG_TYPE); if (!imageId) return false; const panel = core.panelAtPoint(layout(), point); if (!panel) { options.setStatus?.(tr("画像はコマ内へドロップしてください。", "Drop the image inside a panel."), "error"); return true; } assignImage(panel.id, imageId); return true; }
    async function exportProjectImages() { const records = []; for (const metadata of comic.images) { const blob = runtimeBlobs.get(metadata.id) || await imageStore.get(metadata.id); if (!blob) throw new Error(`Project image blob is missing: ${metadata.name || metadata.id}`); records.push({ id: metadata.id, name: metadata.name, mime: metadata.mime || blob.type || "image/png", data_url: await blobDataUrl(blob) }); } return records; }
    async function importProjectImages(records) { for (const record of Array.isArray(records) ? records : []) { if (!String(record?.id || "").startsWith(IMAGE_PREFIX) || !String(record.data_url || "").startsWith("data:image/")) continue; const blob = await fetch(record.data_url).then((response) => response.blob()); let metadata = comic.images.find((item) => item.id === record.id); if (!metadata) { metadata = { id: String(record.id), name: String(record.name || "project-image"), mime: record.mime || blob.type || "image/png", width: 1, height: 1, sha256: "", source: "stored" }; comic.images.push(metadata); } await attachBlob(metadata, blob); await imageStore.put(metadata, blob); } renderTray(); requestRender({ canvas: true, layers: true }); }

    async function importExternalImage(file, serverAsset, control = {}) {
      if (!(file instanceof Blob) || !serverAsset?.id) return "";
      const metadata = { id: String(serverAsset.id), name: String(serverAsset.name || "forge-image").slice(0, 260), mime: serverAsset.mime || file.type || "image/png", width: Math.max(1, Number(serverAsset.width) || 1), height: Math.max(1, Number(serverAsset.height) || 1), sha256: String(serverAsset.sha256 || ""), source: "forge-project" };
      options.pushUndo?.();
      let existing = comic.images.find((item) => item.id === metadata.id);
      if (!existing) { existing = metadata; comic.images.push(existing); }
      if (!runtimeImages.has(existing.id)) await attachBlob(existing, file);
      selectedTrayImageId = existing.id;
      const dropped = control.point ? core.panelAtPoint(layout(), control.point)?.node : null;
      const target = dropped || (control.assignToSelectedPanel ? selectedPanel() : null);
      if (target && panelEditable(target)) {
        target.image_id = existing.id;
        target.image_scale = 1;
        target.image_offset_x = 0;
        target.image_offset_y = 0;
        target.image_visible = true;
        selectedImagePanelIds.clear();
        selectedImagePanelIds.add(target.id);
        selection = { kind: "image", id: target.id };
        lastPanelId = target.id;
      }
      used = true;
      elements.tray?.classList.remove("collapsed");
      changed();
      syncUi();
      return existing.id;
    }

    function removeAssetUsage(imageId, control = {}) {
      const id = String(imageId || "");
      if (!id) return false;
      const usedPanels = core.collectPanels(comic.tree).filter((panel) => panel.image_id === id);
      const hasMetadata = comic.images.some((item) => item.id === id);
      if (!usedPanels.length && !hasMetadata) return false;
      if (control.recordUndo !== false) options.pushUndo?.();
      usedPanels.forEach((panel) => {
        panel.image_id = null;
        selectedImagePanelIds.delete(panel.id);
      });
      comic.images = comic.images.filter((item) => item.id !== id);
      if (selectedTrayImageId === id) selectedTrayImageId = "";
      if (selection.kind === "image" && !core.findNode(comic.tree, selection.id)?.image_id) {
        selection = { kind: "panel", id: selection.id };
      }
      changed();
      syncUi();
      return true;
    }

    function imageGeometry(rect, image, panel) { const fit = panel.fit === "contain" ? Math.min : Math.max, base = fit(rect.w / image.naturalWidth, rect.h / image.naturalHeight), scale = base * panel.image_scale, w = image.naturalWidth * scale, h = image.naturalHeight * scale; return { x: rect.x + (rect.w - w) / 2 + panel.image_offset_x, y: rect.y + (rect.h - h) / 2 + panel.image_offset_y, w, h }; }
    function tracePolygon(target, polygon) { if (!polygon?.length) return false; target.beginPath(); target.moveTo(polygon[0].x, polygon[0].y); for (const point of polygon.slice(1)) target.lineTo(point.x, point.y); target.closePath(); return true; }
    function drawUnderlay(target, optionsValue = {}) {
      if (!active || !comic.created) return false;
      const overlay = optionsValue.overlay === true;
      const phase = optionsValue.phase || "all";
      const base = phase === "all" || phase === "base";
      const images = phase === "all" || phase === "images";
      const borders = phase === "all" || phase === "borders";
      const computed = layout();
      target.save();
      if (!overlay && base) {
        target.fillStyle = comic.page.background;
        target.fillRect(0, 0, comic.page.width, comic.page.height);
      }
      for (const item of computed.panels) {
        const panel = item.node, rect = item.rect, polygon = item.polygon || core.rectPolygon(rect);
        if (panel.visible === false) continue;
        target.save();
        tracePolygon(target, polygon);
        target.clip();
        if (!overlay && base) {
          const pattern = panelBackgroundPattern(panel);
          if (pattern) { target.save(); target.translate(rect.x, rect.y); backgroundPatterns().draw(target, pattern, rect.w, rect.h); target.restore(); }
          else { target.fillStyle = panel.background; target.fillRect(rect.x, rect.y, rect.w, rect.h); }
        }
        if (!overlay && images && panel.image_id && panel.image_visible !== false) {
          const image = runtimeImages.get(panel.image_id);
          if (image?.naturalWidth) {
            const geometry = imageGeometry(rect, image, panel);
            target.drawImage(image, geometry.x, geometry.y, geometry.w, geometry.h);
          }
        }
        target.restore();
        if (!overlay && borders && comic.page.border_width > 0) {
          target.save();
          tracePolygon(target, polygon);
          target.clip();
          target.strokeStyle = comic.page.border_color;
          target.lineWidth = comic.page.border_width * 2;
          tracePolygon(target, polygon);
          target.stroke();
          target.restore();
        }
      }
      if (!overlay && borders && comic.page.border_width > 0) {
        const inset = comic.page.border_width / 2;
        target.strokeStyle = comic.page.border_color;
        target.lineWidth = comic.page.border_width;
        target.strokeRect(inset, inset, Math.max(0, comic.page.width - comic.page.border_width), Math.max(0, comic.page.height - comic.page.border_width));
      }
      target.restore();
      return true;
    }
    function drawOverlay(target) {
      if (!active || !comic.created) return;
      const computed = layout(), zoom = Math.max(.1, canvasState().zoom || 1), showStructure = !options.hasLayerSelection?.();
      target.save();
      target.lineWidth = 2 / zoom;
      if (showStructure && selection.kind === "page") {
        target.strokeStyle = "#4fa3ff";
        target.setLineDash([8 / zoom, 6 / zoom]);
        target.strokeRect(0, 0, comic.page.width, comic.page.height);
      }
      if (showStructure && selection.kind === "panel") {
        const item = panelLayoutItem(selection.id);
        if (item) {
          target.strokeStyle = "#4fa3ff";
          target.setLineDash([8 / zoom, 6 / zoom]);
          tracePolygon(target, item.polygon || core.rectPolygon(item.rect));
          target.stroke();
        }
      }
      if (showStructure && selection.kind === "image") {
        target.strokeStyle = "#9b7ada";
        target.setLineDash([8 / zoom, 6 / zoom]);
        for (const panel of selectedImagePanels()) { const item = panelLayoutItem(panel.id); if (item) { tracePolygon(target, item.polygon || core.rectPolygon(item.rect)); target.stroke(); } }
      }
      if (showStructure && !comic.page.structure_locked) for (const divider of computed.dividers) {
        const hovered = divider.id === hoverDividerId || selection.kind === "divider" && selection.id === divider.id;
        const activeDrag = (drag?.kind === "divider" || drag?.kind === "divider-endpoint") && drag.id === divider.id;
        target.strokeStyle = activeDrag ? "#f59e0b" : hovered ? "#54c9ff" : "rgba(79,163,255,.72)";
        target.lineWidth = (hovered ? 5 : 3) / zoom;
        target.setLineDash([]);
        target.beginPath();
        target.moveTo(divider.line.x1, divider.line.y1);
        target.lineTo(divider.line.x2, divider.line.y2);
        target.stroke();
        const x = (divider.line.x1 + divider.line.x2) / 2, y = (divider.line.y1 + divider.line.y2) / 2;
        target.fillStyle = activeDrag ? "#b45309" : "#245fa8";
        target.beginPath();
        target.arc(x, y, 12 / zoom, 0, Math.PI * 2);
        target.fill();
        target.fillStyle = "#fff";
        target.font = `700 ${12 / zoom}px system-ui`;
        target.textAlign = "center";
        target.textBaseline = "middle";
        target.fillText(divider.axis === "x" ? "↔" : "↕", x, y);
        if (hovered || activeDrag) {
          for (const [endpoint, px, py] of [["start", divider.line.x1, divider.line.y1], ["end", divider.line.x2, divider.line.y2]]) {
            const endpointActive = drag?.kind === "divider-endpoint" && drag.id === divider.id && drag.endpoint === endpoint;
            target.fillStyle = endpointActive ? "#f59e0b" : "#ffffff";
            target.strokeStyle = endpointActive ? "#b45309" : "#245fa8";
            target.lineWidth = 3 / zoom;
            target.beginPath();
            target.arc(px, py, 8 / zoom, 0, Math.PI * 2);
            target.fill();
            target.stroke();
          }
        }
        if (drag?.kind === "divider-endpoint" && drag.id === divider.id && drag.snapLabel) {
          target.fillStyle = "rgba(15,23,42,.88)";
          target.font = `700 ${13 / zoom}px system-ui`;
          target.textAlign = "left";
          target.textBaseline = "bottom";
          target.fillText(drag.snapLabel, x + 16 / zoom, y - 10 / zoom);
        }
      }
      if (PRINT_GUIDES_ENABLED && comic.page.print_guides_visible) {
        const margin = Math.max(12, Math.min(comic.page.width, comic.page.height) * .025);
        const guide = (inset, color) => {
          target.strokeStyle = color;
          target.strokeRect(inset, inset, Math.max(0, comic.page.width - inset * 2), Math.max(0, comic.page.height - inset * 2));
        };
        target.lineWidth = 1 / zoom;
        target.setLineDash([10 / zoom, 8 / zoom]);
        guide(margin / 2, "rgba(239,68,68,.75)");
        guide(margin, "rgba(59,130,246,.7)");
        guide(margin * 2, "rgba(34,197,94,.7)");
      }
      target.restore();
    }

    function panelInsertionTarget(panelId) { const rect = panelRect(panelId); return rect ? { scope: "panel", panelId, rect, panelIndex: core.readingOrder(layout()).findIndex((item) => item.id === panelId) } : null; }
    function selectedInsertionTarget() { if (!active) return null; const pageTarget = { scope: "page", panelId: null, rect: { x: 0, y: 0, w: comic.page.width, h: comic.page.height } }; if (selection.kind === "page") return pageTarget; if (selection.kind === "panel" || selection.kind === "image") return panelInsertionTarget(selection.id); if (selection.kind === "divider" && lastPanelId) return panelInsertionTarget(lastPanelId) || pageTarget; return pageTarget; }
    const defaultPanelInsertionTarget = () => panelInsertionTarget(core.readingOrder(layout()).find((item) => item.node.visible !== false)?.id);
    const insertionTargetAt = (point) => { const panel = core.panelAtPoint(layout(), point); return panel ? panelInsertionTarget(panel.id) : { scope: "page", panelId: null, rect: { x: 0, y: 0, w: comic.page.width, h: comic.page.height } }; };
    function elementTargetOptions() { return [{ value: "page", label: tr("ページ上", "Page") }, ...core.readingOrder(layout()).map((item, index) => ({ value: `panel:${item.id}`, label: tr(`コマ ${index + 1}`, `Panel ${index + 1}`), panelId: item.id }))]; }
    const elementTargetValue = (item) => item?.general_comic_scope === "panel" && panelRect(item.general_comic_panel_id) ? `panel:${item.general_comic_panel_id}` : "page";
    function assignElementTarget(item, target) { if (!item) return false; const panelId = typeof target === "string" && target.startsWith("panel:") ? target.slice(6) : target?.scope === "panel" ? target.panelId : null; if (panelId && panelRect(panelId)) { item.general_comic_scope = "panel"; item.general_comic_panel_id = panelId; } else { item.general_comic_scope = "page"; item.general_comic_panel_id = null; } return true; }
    function shouldSkipPanelScopedItem(item) { if (!active || item?.general_comic_scope !== "panel") return false; return !panelRect(item.general_comic_panel_id); }
    const assetClipRect = (item) => active && item?.general_comic_scope === "panel" ? panelRect(item.general_comic_panel_id) : null;
    const emphasisClipRect = assetClipRect;

    function layerRow({ kind, id = "", name, visible = true, locked = null, nested = false }) {
      const row = document.createElement("div"), selected = kind === "image" ? selectedImagePanelIds.has(id) || selection.kind === "image" && selection.id === id : selection.kind === kind && (!id || selection.id === id);
      row.className = `layer${nested ? " general-comic-layer-nested" : ""}${selected ? " selected" : ""}`;
      row.dataset.generalComicLayer = kind;
      if (id) row.dataset.generalComicPanelId = id;
      const eye = document.createElement("button");
      eye.className = "eye";
      eye.textContent = kind === "page" ? "" : visible ? "◉" : "○";
      if (kind === "page") { eye.disabled = true; eye.tabIndex = -1; eye.setAttribute("aria-hidden", "true"); }
      const icon = document.createElement("span");
      icon.className = `kind ${kind === "image" ? "image" : "frame"}`;
      icon.textContent = kind === "page" ? "▦" : kind === "image" ? "▧" : "□";
      const label = document.createElement("span");
      label.className = "name";
      label.textContent = name;
      row.append(eye, icon, label);
      row.onclick = (event) => kind === "page" ? selectPage() : kind === "image" ? selectPanelImage(id, event) : selectPanel(id);
      if (kind !== "page") eye.onclick = (event) => {
        event.stopPropagation();
        const panel = core.findNode(comic.tree, id);
        if (!panel || !panelEditable(panel) || kind === "image" && panel.image_locked) return;
        if (kind === "panel" && panel.visible !== false && panelOrder().filter((item) => item.visible !== false).length <= 1) return;
        options.pushUndo?.();
        if (kind === "panel") panel.visible = panel.visible === false;
        else panel.image_visible = !visible;
        changed(); syncUi();
      };
      if (locked !== null) {
        const lock = document.createElement("button");
        lock.className = "lock";
        lock.textContent = locked ? "🔒" : "🔓";
        lock.onclick = (event) => {
          event.stopPropagation(); options.pushUndo?.();
          if (kind === "page") comic.page.structure_locked = !locked;
          else if (kind === "panel") core.findNode(comic.tree, id).locked = !locked;
          else core.findNode(comic.tree, id).image_locked = !locked;
          changed(); syncUi();
        };
        row.append(lock);
      }
      if (kind === "page" || kind === "panel") {
        row.addEventListener("dragover", (event) => { if (event.dataTransfer.types.includes("text/plain")) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } });
        row.addEventListener("drop", (event) => { const layerId = event.dataTransfer.getData("text/plain"); if (!layerId || layerId.startsWith(IMAGE_PREFIX) || kind === "panel" && !panelEditable(core.findNode(comic.tree, id))) return; event.preventDefault(); event.stopPropagation(); options.assignLayerGeneralComicTarget?.(layerId, kind === "panel" ? id : null); });
      }
      return row;
    }
    function renderLayers(host) { if (!active || !comic.created || !host) return false; host.append(layerRow({ kind: "page", name: tr("漫画ページ", "Comic Page"), locked: comic.page.structure_locked })); panelOrder().forEach((panel, index) => { const hidden = panel.visible === false; host.append(layerRow({ kind: "panel", id: panel.id, name: hidden ? tr(`コマ ${index + 1}（非表示）`, `Panel ${index + 1} (Hidden)`) : tr(`コマ ${index + 1}`, `Panel ${index + 1}`), visible: !hidden, locked: panel.locked, nested: true })); if (panel.image_id) { const metadata = comic.images.find((image) => image.id === panel.image_id); host.append(layerRow({ kind: "image", id: panel.id, name: metadata?.name || tr("コマ画像", "Panel Image"), visible: panel.image_visible !== false, locked: panel.image_locked, nested: true })); } }); return true; }

    function scale(scaleX, scaleY) { const lineScale = Math.sqrt(scaleX * scaleY); comic.page.width = canvasState().width; comic.page.height = canvasState().height; comic.page.margin_left *= scaleX; comic.page.margin_right *= scaleX; comic.page.margin_top *= scaleY; comic.page.margin_bottom *= scaleY; comic.page.gutter *= lineScale; comic.page.border_width *= lineScale; core.collectPanels(comic.tree).forEach((panel) => { panel.image_offset_x *= scaleX; panel.image_offset_y *= scaleY; }); }
    function serialize() { return used || comic.created ? core.clone(comic) : null; }
    function releaseRuntimeImages() { for (const url of objectUrls) URL.revokeObjectURL(url); objectUrls.clear(); runtimeImages.clear(); runtimeBlobs.clear(); }
    function restore(raw, restoreOptions = {}) { const next = core.normalizeState(raw, { width: options.defaultWidth || 2480, height: options.defaultHeight || 3508, makeId: uuid }); used = Boolean(raw); active = next.enabled === true; selection = { kind: "page", id: null }; selectedImagePanelIds.clear(); imageSelectionAnchorId = null; lastPanelId = null; drag = null; if (active && next.created) options.resizeCanvas?.(next.page.width, next.page.height); comic = next; syncUi(); if (restoreOptions.hydrate !== false) { if (hydratedDocumentId !== documentId()) releaseRuntimeImages(); hydrateImages(); } }
    function dispose() { releaseRuntimeImages(); }

    installUi(); updateLanguage(); syncUi();
    root.addEventListener("speech-bubble:language-change", () => { updateLanguage(); syncUi(); });
    return { IMAGE_DRAG_TYPE, IMAGE_PREFIX, isActive: () => active, isEditing: () => active && comic.created, hasPage: () => comic.created, activate, deactivate, setActive, createPage, serialize, restore, state: () => comic, layout, selection: () => ({ ...selection }), selectPage, selectPanel, selectPanelImage, selectDivider, selectedPanel, selectedDivider, selectedImagePanels, applyTemplate, splitSelected, mergeSelectedDivider, handlePointerDown, handlePointerMove, pointerCursorAt, handlePointerEnd, handleWheel, handleImageDrop, importFiles, importExternalImage, removeAssetUsage, getConversionSources, addConvertedImage, exportProjectImages, importProjectImages, removeTrayImage, drawUnderlay, drawOverlay, panelShape, panelContentRect: panelRect, panelInsertionTarget, selectedInsertionTarget, defaultPanelInsertionTarget, insertionTargetAt, elementTargetOptions, elementTargetValue, assignElementTarget, shouldSkipPanelScopedItem, assetClipRect, emphasisClipRect, renderLayers, syncProperties: syncUi, refreshLanguage: syncUi, clearSelection, scale, dispose };
  }
  root.SpeechBubbleGeneralComicEditor = Object.freeze({ create, IMAGE_DRAG_TYPE, IMAGE_PREFIX });
})(typeof globalThis !== "undefined" ? globalThis : this);
