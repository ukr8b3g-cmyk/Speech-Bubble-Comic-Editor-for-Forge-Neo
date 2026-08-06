(function (root) {
  "use strict";

  const core = root.SpeechBubbleQuickRetouchCore;
  if (!core) throw new Error("SpeechBubbleQuickRetouchCore must be loaded first");

  const BUILD_VERSION = "0.7.4";
  const PREVIEW_LONG_EDGE = 920;
  const GEOMETRY_KEY = "speech-bubble-editor:quick-retouch-geometry:v1";
  const SETTINGS_KEY = "speech-bubble-editor:quick-retouch-settings:v2";
  const PANEL_GEOMETRY_KEY = "speech-bubble-editor:quick-retouch-panels:v1";
  const MAX_HISTORY_BYTES = 192 * 1024 * 1024;
  const MAX_HISTORY_STEPS = 16;
  const SWATCHES = [
    "#ffffff", "#000000", "#808080", "#e53935", "#fb8c00", "#fdd835",
    "#43a047", "#00acc1", "#1e88e5", "#5e35b1", "#d81b60", "#f5d6d6",
  ];

  const tr = (ja, en) => document.documentElement.lang === "en" ? en : ja;
  const uuid = () => root.crypto?.randomUUID?.() ||
    `retouch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  function createCanvas(width = 1, height = 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  }

  function blobImage(blob) {
    if (typeof createImageBitmap === "function") return createImageBitmap(blob);
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.decoding = "async";
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(tr("画像を読み込めませんでした。", "The image could not be loaded."))); };
      image.src = url;
    });
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error(tr("PNGを作成できませんでした。", "The PNG could not be created."))),
        "image/png",
      );
    });
  }

  function parseHexColor(value) {
    const text = String(value || "#000000").replace(/^#/, "");
    const normalized = text.length === 3
      ? text.split("").map((item) => item + item).join("")
      : text.padEnd(6, "0").slice(0, 6);
    return {
      r: parseInt(normalized.slice(0, 2), 16) || 0,
      g: parseInt(normalized.slice(2, 4), 16) || 0,
      b: parseInt(normalized.slice(4, 6), 16) || 0,
    };
  }

  function rgbHex(r, g, b) {
    return `#${[r, g, b].map((value) => Math.round(core.clamp(value, 0, 255)).toString(16).padStart(2, "0")).join("")}`;
  }

  function maskCanvas(width, height, fill = 0) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.fillStyle = `rgb(${fill},${fill},${fill})`;
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function maskData(canvas) {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const mask = new Uint8ClampedArray(canvas.width * canvas.height);
    for (let index = 0, offset = 0; index < mask.length; index += 1, offset += 4) {
      mask[index] = rgba[offset];
    }
    return mask;
  }

  function putMask(canvas, mask) {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const image = context.createImageData(canvas.width, canvas.height);
    for (let index = 0, offset = 0; index < mask.length; index += 1, offset += 4) {
      const value = mask[index];
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }

  function cloneCanvas(source) {
    const output = createCanvas(source.width, source.height);
    output.getContext("2d").drawImage(source, 0, 0);
    return output;
  }

  function imageDataScaled(canvas, width, height) {
    const scratch = createCanvas(width, height);
    const context = scratch.getContext("2d", { willReadFrequently: true });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(canvas, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
  }

  function maskScaled(canvas, width, height) {
    if (!canvas) return null;
    const data = imageDataScaled(canvas, width, height).data;
    const output = new Uint8ClampedArray(width * height);
    for (let index = 0, offset = 0; index < output.length; index += 1, offset += 4) output[index] = data[offset];
    return output;
  }

  function layerDefaults(type) {
    if (type === "paint") {
      return {
        id: uuid(),
        type: "paint",
        name: tr("ペイント", "Paint"),
        visible: true,
        opacity: 1,
        canvas: null,
      };
    }
    const common = {
      id: uuid(),
      type: "adjustment",
      adjustmentType: type,
      visible: true,
      opacity: 1,
      mask: null,
    };
    if (type === "hue_saturation") {
      return {
        ...common,
        name: tr("色相・彩度", "Hue / Saturation"),
        settings: { hue: 0, saturation: 0, lightness: 0, colorize: false },
      };
    }
    if (type === "brightness_contrast") {
      return {
        ...common,
        name: tr("明るさ・コントラスト", "Brightness / Contrast"),
        settings: { brightness: 0, contrast: 0, gamma: 1 },
      };
    }
    const linear = [{ x: 0, y: 0 }, { x: 255, y: 255 }];
    return {
      ...common,
      name: tr("トーンカーブ", "Curves"),
      settings: {
        channel: "rgb",
        channels: {
          rgb: linear.map((point) => ({ ...point })),
          red: linear.map((point) => ({ ...point })),
          green: linear.map((point) => ({ ...point })),
          blue: linear.map((point) => ({ ...point })),
        },
        selectedPoint: 0,
      },
    };
  }

  function create(options = {}) {
    const launcher = document.querySelector("[data-quick-retouch-open]");
    if (!launcher) return null;

    const dialog = document.createElement("dialog");
    dialog.className = "quick-retouch-dialog";
    dialog.innerHTML = `
      <div class="quick-retouch-window">
        <header class="quick-retouch-head" data-retouch-drag-handle>
          <strong data-retouch-title></strong>
          <span data-retouch-document></span>
          <button type="button" data-retouch-action="maximize" title="${tr("最大化／元に戻す", "Maximize / Restore")}">□</button>
          <button type="button" data-retouch-action="close" aria-label="${tr("閉じる", "Close")}">×</button>
        </header>
        <div class="quick-retouch-source-bar">
          <div class="quick-retouch-source-thumb" data-retouch-source-thumb></div>
          <div><strong data-retouch-source-name></strong><small data-retouch-source-info></small></div>
          <button type="button" data-retouch-action="choose-file"></button>
          <input data-retouch-file type="file" accept="image/png,image/jpeg,image/webp" hidden>
        </div>
        <div class="quick-retouch-tool-options" data-retouch-tool-options></div>
        <div class="quick-retouch-body">
          <aside class="quick-retouch-tools">
            <div class="quick-retouch-tool-grid" data-retouch-tools></div>
            <div class="quick-retouch-color-wells" aria-label="${tr("描画色と背景色", "Foreground and background colors")}">
              <label class="quick-retouch-foreground-color" title="${tr("描画色", "Foreground color")}"><input type="color" data-retouch-color value="#ffffff"></label>
              <label class="quick-retouch-background-color" title="${tr("背景色", "Background color")}"><input type="color" data-retouch-background-color value="#000000"></label>
              <button type="button" data-retouch-action="swap-colors" title="${tr("描画色と背景色を入れ替え", "Swap foreground and background colors")}">⇄</button>
              <button type="button" data-retouch-action="default-colors" title="${tr("白黒へ戻す", "Reset to white and black")}">◩</button>
            </div>
          </aside>
          <section class="quick-retouch-workspace" data-retouch-workspace>
            <div class="quick-retouch-canvas-wrap" data-retouch-drop-zone>
              <div class="quick-retouch-stage" data-retouch-stage>
                <canvas data-retouch-result></canvas>
                <div class="quick-retouch-compare-divider" data-retouch-compare-divider hidden></div>
              </div>
              <canvas data-retouch-original hidden></canvas>
              <span class="quick-retouch-canvas-hud" data-retouch-hud></span>
              <span class="quick-retouch-brush-size-hud" data-retouch-brush-size-hud hidden></span>
            </div>
            <div class="quick-retouch-view-bar">
              <select data-retouch-zoom aria-label="${tr("ズーム", "Zoom")}"><option value="fit">${tr("画面に合わせる", "Fit")}</option><option value="0.5">50%</option><option value="1">100%</option><option value="2">200%</option></select>
              <button type="button" data-retouch-action="fit-view"></button>
              <button type="button" data-retouch-action="hold-original"></button>
              <button type="button" data-retouch-action="split-compare"></button>
              <span class="quick-retouch-view-spacer"></span>
              <button type="button" data-retouch-panel-toggle="selection"></button>
              <button type="button" data-retouch-panel-toggle="layers"></button>
              <button type="button" data-retouch-panel-toggle="properties"></button>
              <button type="button" data-retouch-action="undo">↶ Undo</button>
              <button type="button" data-retouch-action="redo">↷ Redo</button>
            </div>
            <section class="quick-retouch-floating-panel selection-panel" data-retouch-panel="selection">
              <div class="quick-retouch-floating-head" data-retouch-panel-drag="selection"><strong data-retouch-selection-title></strong><button type="button" data-retouch-panel-collapse="selection">−</button><button type="button" data-retouch-panel-close="selection">×</button></div>
              <div class="quick-retouch-floating-body" data-retouch-selection-panel></div>
            </section>
            <section class="quick-retouch-floating-panel layers-panel" data-retouch-panel="layers">
              <div class="quick-retouch-floating-head" data-retouch-panel-drag="layers"><strong data-retouch-layers-title></strong><small data-retouch-layer-count></small><button type="button" data-retouch-panel-collapse="layers">−</button><button type="button" data-retouch-panel-close="layers">×</button></div>
              <div class="quick-retouch-floating-body">
                <div class="quick-retouch-layer-list" data-retouch-layer-list></div>
                <div class="quick-retouch-layer-actions">
                  <button type="button" data-retouch-add="paint"></button>
                  <button type="button" data-retouch-add="hue_saturation">H/S</button>
                  <button type="button" data-retouch-add="brightness_contrast">B/C</button>
                  <button type="button" data-retouch-add="curves"></button>
                </div>
                <div class="quick-retouch-layer-bottom-actions">
                  <button type="button" data-retouch-action="duplicate-layer"></button>
                  <button type="button" data-retouch-action="delete-layer"></button>
                  <button type="button" data-retouch-action="move-layer-up">↑</button>
                  <button type="button" data-retouch-action="move-layer-down">↓</button>
                </div>
              </div>
            </section>
            <section class="quick-retouch-floating-panel properties-panel" data-retouch-panel="properties">
              <div class="quick-retouch-floating-head" data-retouch-panel-drag="properties"><strong data-retouch-properties-title></strong><button type="button" data-retouch-panel-collapse="properties">−</button><button type="button" data-retouch-panel-close="properties">×</button></div>
              <div class="quick-retouch-floating-body" data-retouch-properties></div>
            </section>
          </section>
        </div>
        <footer class="quick-retouch-footer">
          <span data-retouch-status></span>
          <div class="quick-retouch-footer-actions">
            <button type="button" data-retouch-action="cancel"></button>
            <button type="button" data-retouch-action="reset"></button>
            <button type="button" class="primary" data-retouch-action="apply" disabled></button>
          </div>
        </footer>
      </div>`;
    document.body.append(dialog);

    const originalCanvas = dialog.querySelector("[data-retouch-original]");
    const resultCanvas = dialog.querySelector("[data-retouch-result]");
    const resultContext = resultCanvas.getContext("2d", { willReadFrequently: true });
    const originalContext = originalCanvas.getContext("2d", { willReadFrequently: true });
    const sourceThumb = dialog.querySelector("[data-retouch-source-thumb]");
    const fileInput = dialog.querySelector("[data-retouch-file]");
    const status = dialog.querySelector("[data-retouch-status]");
    const applyButton = dialog.querySelector('[data-retouch-action="apply"]');
    const propertiesHost = dialog.querySelector("[data-retouch-properties]");
    const layerList = dialog.querySelector("[data-retouch-layer-list]");
    const toolsHost = dialog.querySelector("[data-retouch-tools]");
    const toolOptionsHost = dialog.querySelector("[data-retouch-tool-options]");
    const selectionHost = dialog.querySelector("[data-retouch-selection-panel]");
    const workspace = dialog.querySelector("[data-retouch-workspace]");
    const canvasWrap = dialog.querySelector("[data-retouch-drop-zone]");
    const stage = dialog.querySelector("[data-retouch-stage]");
    const compareDivider = dialog.querySelector("[data-retouch-compare-divider]");
    const brushSizeHud = dialog.querySelector("[data-retouch-brush-size-hud]");
    const colorInput = dialog.querySelector("[data-retouch-color]");
    const backgroundColorInput = dialog.querySelector("[data-retouch-background-color]");
    const brushRing = document.createElement("div");
    brushRing.className = "quick-retouch-brush-ring";
    // A modal <dialog> is rendered in the browser top layer. Keeping the
    // overlay inside the dialog prevents the brush outline from being hidden
    // behind that top layer even when its z-index is very high.
    dialog.append(brushRing);

    let source = null;
    let sourceBitmap = null;
    let sourceCanvas = null;
    let sourceImageData = null;
    let selectionCanvas = null;
    let layers = [];
    let activeTarget = { kind: "paint", layerId: "" };
    let activeTool = "brush";
    let previewData = null;
    let previewTimer = null;
    let previewRevision = 0;
    let showOriginalOnResult = false;
    let splitCompare = false;
    let compareSplit = 0.5;
    let selectionDisplay = "boundary";
    let lastVisibleSelectionDisplay = "boundary";
    let selectionOperation = "replace";
    let selectionFeather = 0;
    let selectionModifyRadius = 1;
    let wandTolerance = 30;
    let wandContiguous = true;
    let colorRangeTolerance = 30;
    let colorRangeSamples = [];
    let colorSampleMode = "replace";
    let colorRangeExcluded = [];
    let pendingColorRangeMask = null;
    let brush = { size: 40, hardness: 0.8, opacity: 1, color: "#ffffff" };
    let backgroundColor = "#000000";
    let viewZoom = "fit";
    let viewPanX = 0;
    let viewPanY = 0;
    let panelState = {};
    let pointerState = null;
    let lassoPoints = [];
    let panelDragState = null;
    let brushSizeTimer = null;
    let brushRingFrame = 0;
    let brushRingClient = null;
    let spaceDown = false;
    let shiftDown = false;
    let altDown = false;
    let lastDeselectedSelection = null;
    let history = [];
    let redo = [];
    let restoringHistory = false;
    let controlSnapshotArmed = false;
    let thumbUrl = "";
    let dragState = null;
    let curveDrag = null;
    let lastRenderMs = 0;

    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      brush = { ...brush, ...(saved.brush || {}) };
      selectionDisplay = ["boundary", "overlay", "hidden"].includes(saved.selectionDisplay) ? saved.selectionDisplay : selectionDisplay;
      if (selectionDisplay !== "hidden") lastVisibleSelectionDisplay = selectionDisplay;
      backgroundColor = /^#[0-9a-f]{6}$/i.test(saved.backgroundColor || "") ? saved.backgroundColor : backgroundColor;
      wandContiguous = saved.wandContiguous !== false;
      wandTolerance = core.clamp(saved.wandTolerance ?? wandTolerance, 0, 100);
      colorRangeTolerance = core.clamp(saved.colorRangeTolerance ?? colorRangeTolerance, 0, 100);
    } catch {}

    function saveSettings() {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({
          brush,
          selectionDisplay,
          backgroundColor,
          wandTolerance,
          wandContiguous,
          colorRangeTolerance,
        }));
      } catch {}
    }

    function currentMode() {
      return options.getMode?.() === "comic" ? "comic" : "single";
    }

    function setStatus(message, level = "info") {
      status.textContent = message;
      status.dataset.level = level;
    }

    function dimensions() {
      return source ? { width: source.width, height: source.height } : { width: 1, height: 1 };
    }

    function previewDimensions() {
      if (!source) return { width: 1, height: 1 };
      const scale = Math.min(1, PREVIEW_LONG_EDGE / Math.max(source.width, source.height));
      return {
        width: Math.max(1, Math.round(source.width * scale)),
        height: Math.max(1, Math.round(source.height * scale)),
      };
    }

    function fullPoint(event) {
      const rect = resultCanvas.getBoundingClientRect();
      const px = (event.clientX - rect.left) * resultCanvas.width / Math.max(1, rect.width);
      const py = (event.clientY - rect.top) * resultCanvas.height / Math.max(1, rect.height);
      return {
        previewX: core.clamp(px, 0, resultCanvas.width - 1),
        previewY: core.clamp(py, 0, resultCanvas.height - 1),
        x: core.clamp(px / resultCanvas.width * source.width, 0, source.width - 1),
        y: core.clamp(py / resultCanvas.height * source.height, 0, source.height - 1),
      };
    }

    function activeLayer() {
      return layers.find((layer) => layer.id === activeTarget.layerId) || null;
    }

    function activePaintCanvas() {
      if (activeTarget.kind === "selection") return selectionCanvas;
      const layer = activeLayer();
      if (activeTarget.kind === "paint" && layer?.type === "paint") return layer.canvas;
      if (activeTarget.kind === "mask" && layer?.type === "adjustment") return layer.mask;
      return null;
    }

    function activeIsMask() {
      return activeTarget.kind === "selection" || activeTarget.kind === "mask";
    }

    function previewLayerPayload() {
      const size = previewDimensions();
      const payload = [];
      const masks = new Map();
      for (const layer of layers) {
        if (layer.type === "paint") {
          payload.push({
            id: layer.id,
            type: "paint",
            visible: layer.visible,
            opacity: layer.opacity,
            pixels: imageDataScaled(layer.canvas, size.width, size.height).data,
          });
        } else {
          payload.push({
            id: layer.id,
            type: "adjustment",
            adjustmentType: layer.adjustmentType,
            visible: layer.visible,
            opacity: layer.opacity,
            settings: JSON.parse(JSON.stringify(layer.settings)),
          });
          masks.set(layer.id, maskScaled(layer.mask, size.width, size.height));
        }
      }
      return { payload, masks };
    }

    function drawInteractionGuides() {
      resultContext.save();
      resultContext.lineWidth = 1.5;
      resultContext.strokeStyle = "#65bfff";
      resultContext.setLineDash([6, 4]);
      if (pointerState?.mode === "rectangle") {
        const x = Math.min(pointerState.start.previewX, pointerState.current.previewX);
        const y = Math.min(pointerState.start.previewY, pointerState.current.previewY);
        const width = Math.abs(pointerState.start.previewX - pointerState.current.previewX);
        const height = Math.abs(pointerState.start.previewY - pointerState.current.previewY);
        resultContext.strokeRect(x, y, width, height);
      }
      if (pointerState?.mode === "lasso" && lassoPoints.length) {
        resultContext.beginPath();
        lassoPoints.forEach((point, index) => {
          const x = point.x / source.width * resultCanvas.width;
          const y = point.y / source.height * resultCanvas.height;
          if (!index) resultContext.moveTo(x, y);
          else resultContext.lineTo(x, y);
        });
        resultContext.stroke();
      }
      resultContext.restore();
    }
    function drawSelectionBoundary(mask, width, height, palette = "selection") {
      if (!mask) return;
      const previewingColorRange = palette === "color-range";
      const boundary = resultContext.createImageData(width, height);
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          const index = y * width + x;
          if (mask[index] < 32) continue;
          const edge = mask[index - 1] < 32 || mask[index + 1] < 32 ||
            mask[index - width] < 32 || mask[index + width] < 32;
          if (!edge) continue;
          const offset = index * 4;
          const dash = ((x + y + Math.floor(performance.now() / 120)) % 8) < 4;
          boundary.data[offset] = dash ? (previewingColorRange ? 151 : 80) : 255;
          boundary.data[offset + 1] = dash ? (previewingColorRange ? 101 : 190) : 255;
          boundary.data[offset + 2] = 255;
          boundary.data[offset + 3] = 230;
        }
      }
      const canvas = createCanvas(width, height);
      canvas.getContext("2d").putImageData(boundary, 0, 0);
      resultContext.drawImage(canvas, 0, 0);
    }

    function drawSelectionOverlay() {
      if (!source || selectionDisplay === "hidden") return;
      const size = previewDimensions();
      const isLayerMask = activeTarget.kind === "mask";
      const isColorRangePreview = Boolean(pendingColorRangeMask);
      const mask = isColorRangePreview
        ? scaleMaskArray(pendingColorRangeMask, source.width, source.height, size.width, size.height)
        : maskScaled(isLayerMask ? activeLayer()?.mask : selectionCanvas, size.width, size.height);
      if (!mask || !core.maskHasSelection(mask)) return;
      if (selectionDisplay === "boundary" && !isLayerMask && !isColorRangePreview) {
        drawSelectionBoundary(mask, size.width, size.height);
        return;
      }
      const overlay = resultContext.createImageData(size.width, size.height);
      for (let index = 0, offset = 0; index < mask.length; index += 1, offset += 4) {
        const amount = mask[index] / 255;
        if (amount <= 0) continue;
        overlay.data[offset] = isLayerMask ? 236 : isColorRangePreview ? 130 : 48;
        overlay.data[offset + 1] = isLayerMask ? 68 : isColorRangePreview ? 82 : 145;
        overlay.data[offset + 2] = isLayerMask ? 132 : 255;
        overlay.data[offset + 3] = Math.round(amount * (isLayerMask ? 92 : isColorRangePreview ? 96 : 78));
      }
      const overlayCanvas = createCanvas(size.width, size.height);
      overlayCanvas.getContext("2d").putImageData(overlay, 0, 0);
      resultContext.drawImage(overlayCanvas, 0, 0);
      if (!isLayerMask) drawSelectionBoundary(mask, size.width, size.height, isColorRangePreview ? "color-range" : "selection");
    }
    function scaleMaskArray(mask, width, height, targetWidth, targetHeight) {
      if (!mask) return null;
      const full = maskCanvas(width, height);
      putMask(full, mask);
      return maskScaled(full, targetWidth, targetHeight);
    }

    function resolvedViewScale() {
      if (!source || !resultCanvas.width) return 1;
      let scale = Number(viewZoom);
      if (viewZoom === "fit" || !Number.isFinite(scale)) {
        const availableWidth = Math.max(120, canvasWrap.clientWidth - 24);
        const availableHeight = Math.max(120, canvasWrap.clientHeight - 24);
        scale = Math.min(1, availableWidth / resultCanvas.width, availableHeight / resultCanvas.height);
      }
      return core.clamp(scale, 0.1, 4);
    }

    function syncZoomControl(scale) {
      const control = dialog.querySelector("[data-retouch-zoom]");
      if (!control) return;
      if (viewZoom === "fit") {
        control.value = "fit";
        return;
      }
      const value = String(Number(viewZoom));
      let custom = control.querySelector("[data-retouch-custom-zoom]");
      if (![...control.options].some((option) => option.value === value)) {
        if (!custom) {
          custom = document.createElement("option");
          custom.dataset.retouchCustomZoom = "";
          control.append(custom);
        }
        custom.value = value;
        custom.textContent = `${Math.round(scale * 100)}%`;
      }
      control.value = value;
    }

    function applyViewPan() {
      stage.style.transform = `translate3d(${Math.round(viewPanX)}px, ${Math.round(viewPanY)}px, 0)`;
    }

    function resetViewPan() {
      viewPanX = 0;
      viewPanY = 0;
      canvasWrap.scrollLeft = 0;
      canvasWrap.scrollTop = 0;
      applyViewPan();
    }

    function applyViewZoom() {
      if (!source || !resultCanvas.width) return;
      const scale = resolvedViewScale();
      stage.style.width = `${Math.max(1, Math.round(resultCanvas.width * scale))}px`;
      stage.style.height = `${Math.max(1, Math.round(resultCanvas.height * scale))}px`;
      resultCanvas.style.width = "100%";
      resultCanvas.style.height = "100%";
      applyViewPan();
      syncZoomControl(scale);
      updateCanvasCursor();
      updateBrushRing();
    }

    function setViewZoom(next, anchorEvent = null) {
      const resetPan = next === "fit" && !anchorEvent;
      if (resetPan) resetViewPan();
      const before = stage.getBoundingClientRect();
      const ratioX = anchorEvent && before.width > 0
        ? core.clamp((anchorEvent.clientX - before.left) / before.width, 0, 1)
        : 0.5;
      const ratioY = anchorEvent && before.height > 0
        ? core.clamp((anchorEvent.clientY - before.top) / before.height, 0, 1)
        : 0.5;
      viewZoom = next === "fit" ? "fit" : core.clamp(Number(next) || 1, 0.1, 4);
      applyViewZoom();
      if (!anchorEvent) return;
      requestAnimationFrame(() => {
        const after = stage.getBoundingClientRect();
        const targetX = after.left + after.width * ratioX;
        const targetY = after.top + after.height * ratioY;
        viewPanX += anchorEvent.clientX - targetX;
        viewPanY += anchorEvent.clientY - targetY;
        applyViewPan();
        updateBrushRing(anchorEvent);
      });
    }

    function zoomBy(factor, anchorEvent = null) {
      setViewZoom(core.clamp(resolvedViewScale() * factor, 0.1, 4), anchorEvent);
    }

    function renderPreviewNow() {
      if (!source || !sourceCanvas) return;
      const started = performance.now();
      const size = previewDimensions();
      originalCanvas.width = resultCanvas.width = size.width;
      originalCanvas.height = resultCanvas.height = size.height;
      originalContext.clearRect(0, 0, size.width, size.height);
      originalContext.drawImage(sourceCanvas, 0, 0, size.width, size.height);
      const original = originalContext.getImageData(0, 0, size.width, size.height);
      const { payload, masks } = previewLayerPayload();
      const edited = core.renderStack(original.data, payload, masks);
      let output = edited;
      if (showOriginalOnResult) output = new Uint8ClampedArray(original.data);
      else if (splitCompare) {
        output = new Uint8ClampedArray(edited);
        const splitX = Math.round(size.width * compareSplit);
        for (let y = 0; y < size.height; y += 1) {
          const end = (y * size.width + splitX) * 4;
          const start = y * size.width * 4;
          output.set(original.data.subarray(start, end), start);
        }
      }
      previewData = new ImageData(output, size.width, size.height);
      resultContext.putImageData(previewData, 0, 0);
      drawSelectionOverlay();
      drawInteractionGuides();
      lastRenderMs = performance.now() - started;
      dialog.querySelector("[data-retouch-hud]").textContent = `${source.width}×${source.height} · ${Math.round(size.width / source.width * 100)}% · ${Math.round(lastRenderMs)} ms`;
      compareDivider.hidden = !splitCompare;
      compareDivider.style.left = `${compareSplit * 100}%`;
      renderLayerThumbnails();
      applyViewZoom();
    }
    function schedulePreview(delay = 25) {
      clearTimeout(previewTimer);
      const revision = ++previewRevision;
      previewTimer = setTimeout(() => {
        if (revision !== previewRevision) return;
        renderPreviewNow();
      }, delay);
    }

    function sourceDisplayName(name) {
      return String(name || tr("画像", "Image")).replace(/\.[^.]+$/, "");
    }

    async function setSource(next) {
      if (!next?.blob) return false;
      sourceBitmap?.close?.();
      sourceBitmap = await blobImage(next.blob);
      source = {
        ...next,
        name: sourceDisplayName(next.name),
        width: sourceBitmap.width || sourceBitmap.naturalWidth,
        height: sourceBitmap.height || sourceBitmap.naturalHeight,
      };
      sourceCanvas = createCanvas(source.width, source.height);
      const context = sourceCanvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(sourceBitmap, 0, 0, source.width, source.height);
      sourceImageData = context.getImageData(0, 0, source.width, source.height);
      selectionCanvas = maskCanvas(source.width, source.height, 0);
      layers = [];
      activeTarget = { kind: "paint", layerId: "" };
      history = [];
      redo = [];
      colorRangeSamples = [];
      colorRangeExcluded = [];
      pendingColorRangeMask = null;
      lassoPoints = [];
      lastDeselectedSelection = null;
      resetViewPan();
      if (thumbUrl) URL.revokeObjectURL(thumbUrl);
      thumbUrl = URL.createObjectURL(next.blob);
      sourceThumb.style.backgroundImage = `url("${thumbUrl}")`;
      dialog.querySelector("[data-retouch-source-name]").textContent = source.name;
      dialog.querySelector("[data-retouch-source-info]").textContent = `${source.width} × ${source.height}px`;
      dialog.querySelector("[data-retouch-document]").textContent = `${source.name} · ${source.width}×${source.height}`;
      const originalSizeLabel = dialog.querySelector("[data-retouch-original-size]");
      if (originalSizeLabel) originalSizeLabel.textContent = `${source.width} × ${source.height}px`;
      applyButton.disabled = false;
      const initialPaint = addPaintLayer(false);
      activeTarget = { kind: "paint", layerId: initialPaint?.id || "" };
      activeTool = "brush";
      selectionDisplay = "boundary";
      lastDeselectedSelection = null;
      renderTools();
      renderToolOptions();
      renderSelectionPanel();
      renderLayers();
      renderProperties();
      renderPreviewNow();
      setStatus(tr("簡易レタッチを開始できます。", "Quick Retouch is ready."), "ready");
      return true;
    }

    async function sourceCandidates() {
      if (currentMode() === "single") {
        const current = await options.getSingleSource?.();
        return current ? [{ ...current, selected: true }] : [];
      }
      return (await options.getComicSources?.()) || [];
    }

    async function refreshSource() {
      const candidates = await sourceCandidates();
      const selected = candidates.find((item) => item.selected) || candidates[0];
      if (selected) return setSource(selected);
      setStatus(tr("画像を選択するか、画像ファイルを読み込んでください。", "Select an image or load an image file."), "error");
      applyButton.disabled = true;
      return false;
    }

    function layerCanvasSnapshot(layer) {
      if (layer.type === "paint") {
        return { canvas: layer.canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, layer.canvas.width, layer.canvas.height).data.slice() };
      }
      return { mask: maskData(layer.mask) };
    }

    function snapshotBytes(snapshot) {
      let total = snapshot.selection.byteLength;
      for (const layer of snapshot.layers) total += layer.canvas?.byteLength || layer.mask?.byteLength || 0;
      return total;
    }

    function snapshotState() {
      return {
        selection: maskData(selectionCanvas),
        layers: layers.map((layer) => ({
          id: layer.id,
          type: layer.type,
          name: layer.name,
          visible: layer.visible,
          opacity: layer.opacity,
          adjustmentType: layer.adjustmentType,
          settings: layer.settings ? JSON.parse(JSON.stringify(layer.settings)) : null,
          ...layerCanvasSnapshot(layer),
        })),
        activeTarget: { ...activeTarget },
      };
    }

    function pushHistory() {
      if (!source || restoringHistory) return;
      history.push(snapshotState());
      redo = [];
      let bytes = history.reduce((sum, item) => sum + snapshotBytes(item), 0);
      while (history.length > MAX_HISTORY_STEPS || bytes > MAX_HISTORY_BYTES) {
        bytes -= snapshotBytes(history.shift());
      }
      syncUndoButtons();
    }

    function restoreSnapshot(snapshot) {
      if (!snapshot || !source) return;
      restoringHistory = true;
      try {
        putMask(selectionCanvas, snapshot.selection);
        layers = snapshot.layers.map((saved) => {
          if (saved.type === "paint") {
            const layer = {
              id: saved.id,
              type: "paint",
              name: saved.name,
              visible: saved.visible,
              opacity: saved.opacity,
              canvas: createCanvas(source.width, source.height),
            };
            const context = layer.canvas.getContext("2d", { willReadFrequently: true });
            context.putImageData(new ImageData(new Uint8ClampedArray(saved.canvas), source.width, source.height), 0, 0);
            return layer;
          }
          const layer = {
            id: saved.id,
            type: "adjustment",
            name: saved.name,
            visible: saved.visible,
            opacity: saved.opacity,
            adjustmentType: saved.adjustmentType,
            settings: JSON.parse(JSON.stringify(saved.settings)),
            mask: maskCanvas(source.width, source.height),
          };
          putMask(layer.mask, saved.mask);
          return layer;
        });
        activeTarget = { ...snapshot.activeTarget };
        renderSelectionPanel();
        renderLayers();
        renderProperties();
        renderToolOptions();
        schedulePreview(0);
      } finally {
        restoringHistory = false;
      }
    }

    function undoAction() {
      if (!history.length) return;
      redo.push(snapshotState());
      restoreSnapshot(history.pop());
      syncUndoButtons();
    }

    function redoAction() {
      if (!redo.length) return;
      history.push(snapshotState());
      restoreSnapshot(redo.pop());
      syncUndoButtons();
    }

    function syncUndoButtons() {
      dialog.querySelector('[data-retouch-action="undo"]').disabled = !history.length;
      dialog.querySelector('[data-retouch-action="redo"]').disabled = !redo.length;
    }

    function selectedMaskForNewAdjustment() {
      const selected = maskData(selectionCanvas);
      return core.maskHasSelection(selected) ? selected : core.createMask(source.width, source.height, 255);
    }

    function addPaintLayer(record = true) {
      if (!source) return null;
      if (record) pushHistory();
      const layer = layerDefaults("paint");
      layer.name = `${tr("ペイント", "Paint")} ${layers.filter((item) => item.type === "paint").length + 1}`;
      layer.canvas = createCanvas(source.width, source.height);
      layers.push(layer);
      activeTarget = { kind: "paint", layerId: layer.id };
      renderLayers();
      renderProperties();
      renderToolOptions();
      schedulePreview();
      return layer;
    }

    function addAdjustment(type) {
      if (!source) return null;
      pushHistory();
      const layer = layerDefaults(type);
      const count = layers.filter((item) => item.adjustmentType === type).length + 1;
      layer.name = `${layer.name} ${count}`;
      layer.mask = maskCanvas(source.width, source.height);
      putMask(layer.mask, selectedMaskForNewAdjustment());
      layers.push(layer);
      activeTarget = { kind: "adjustment", layerId: layer.id };
      renderLayers();
      renderProperties();
      renderToolOptions();
      schedulePreview();
      return layer;
    }

    function deleteLayer() {
      const layer = activeLayer();
      if (!layer) return;
      pushHistory();
      const index = layers.indexOf(layer);
      layers.splice(index, 1);
      let next = layers[Math.min(index, layers.length - 1)] || layers.at(-1) || null;
      if (!next) next = addPaintLayer(false);
      activeTarget = next
        ? { kind: next.type === "paint" ? "paint" : "adjustment", layerId: next.id }
        : { kind: "original", layerId: "" };
      renderLayers();
      renderProperties();
      schedulePreview();
    }
    function duplicateLayer() {
      const layer = activeLayer();
      if (!layer) return;
      pushHistory();
      let copy;
      if (layer.type === "paint") {
        copy = { ...layer, id: uuid(), name: `${layer.name} ${tr("コピー", "copy")}`, canvas: cloneCanvas(layer.canvas) };
      } else {
        copy = {
          ...layer,
          id: uuid(),
          name: `${layer.name} ${tr("コピー", "copy")}`,
          settings: JSON.parse(JSON.stringify(layer.settings)),
          mask: cloneCanvas(layer.mask),
        };
      }
      layers.splice(layers.indexOf(layer) + 1, 0, copy);
      activeTarget = { kind: copy.type === "paint" ? "paint" : "adjustment", layerId: copy.id };
      renderLayers();
      renderProperties();
      schedulePreview();
    }


    function moveLayer(direction) {
      const layer = activeLayer();
      if (!layer) return;
      const index = layers.indexOf(layer);
      const target = direction === "up" ? index + 1 : index - 1;
      if (target < 0 || target >= layers.length) return;
      pushHistory();
      layers.splice(index, 1);
      layers.splice(target, 0, layer);
      renderLayers();
      schedulePreview();
    }

    function renderLayerThumbnails() {
      if (!source) return;
      for (const row of layerList.querySelectorAll("[data-retouch-layer-id]")) {
        const layer = layers.find((item) => item.id === row.dataset.retouchLayerId);
        if (!layer) continue;
        const canvas = row.querySelector("canvas.quick-retouch-layer-thumb");
        if (!canvas) continue;
        canvas.width = 80;
        canvas.height = 76;
        const context = canvas.getContext("2d");
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (layer.type === "paint") context.drawImage(layer.canvas, 0, 0, canvas.width, canvas.height);
        else context.drawImage(layer.mask, 0, 0, canvas.width, canvas.height);
      }
      const selectionThumb = selectionHost.querySelector("[data-retouch-selection-thumb]");
      if (selectionThumb) {
        selectionThumb.width = 80;
        selectionThumb.height = 76;
        selectionThumb.getContext("2d").drawImage(selectionCanvas, 0, 0, selectionThumb.width, selectionThumb.height);
      }
      const originalThumb = layerList.querySelector("[data-retouch-original-thumb]");
      if (originalThumb) {
        originalThumb.width = 80;
        originalThumb.height = 76;
        originalThumb.getContext("2d").drawImage(sourceCanvas, 0, 0, originalThumb.width, originalThumb.height);
      }
    }
    function renderLayers() {
      layerList.replaceChildren();
      for (const layer of [...layers].reverse()) {
        const row = document.createElement("div");
        const targetKind = layer.type === "paint" ? "paint" : "adjustment";
        const active = activeTarget.layerId === layer.id;
        row.className = `quick-retouch-layer-row${active ? " active" : ""}`;
        row.dataset.retouchLayerId = layer.id;
        row.innerHTML = `<button type="button" class="quick-retouch-eye" data-retouch-layer-visible aria-pressed="${String(layer.visible)}">${layer.visible ? "👁" : "·"}</button><canvas class="quick-retouch-layer-thumb"></canvas><div><strong></strong><small></small></div>${layer.type === "adjustment" ? `<button type="button" class="quick-retouch-mask-button${activeTarget.kind === "mask" && active ? " active" : ""}" data-retouch-mask title="${tr("レイヤーマスクを編集", "Edit layer mask")}">◐</button>` : `<span></span>`}`;
        row.querySelector("strong").textContent = layer.name;
        row.querySelector("small").textContent = layer.type === "paint"
          ? tr("ペイントレイヤー", "Paint layer")
          : tr("調整レイヤー", "Adjustment layer");
        row.querySelector("[data-retouch-layer-visible]").onclick = (event) => {
          event.stopPropagation();
          pushHistory();
          layer.visible = !layer.visible;
          renderLayers();
          schedulePreview();
        };
        row.querySelector("[data-retouch-mask]")?.addEventListener("click", (event) => {
          event.stopPropagation();
          activeTarget = { kind: "mask", layerId: layer.id };
          activeTool = "brush";
          renderTools();
          renderToolOptions();
          renderLayers();
          renderProperties();
          schedulePreview(0);
        });
        row.onclick = () => {
          activeTarget = { kind: targetKind, layerId: layer.id };
          renderLayers();
          renderProperties();
          renderToolOptions();
          schedulePreview(0);
        };
        layerList.append(row);
      }
      const originalRow = document.createElement("div");
      originalRow.className = `quick-retouch-layer-row original-layer${activeTarget.kind === "original" ? " active" : ""}`;
      originalRow.innerHTML = `<button type="button" class="quick-retouch-eye" disabled>👁</button><canvas class="quick-retouch-layer-thumb" data-retouch-original-thumb></canvas><div><strong>${tr("元画像", "Original")}</strong><small>${tr("非破壊の基準画像", "Protected source image")}</small></div><span title="${tr("ロック済み", "Locked")}">🔒</span>`;
      originalRow.onclick = () => {
        activeTarget = { kind: "original", layerId: "" };
        renderLayers();
        renderProperties();
      };
      layerList.append(originalRow);
      dialog.querySelector("[data-retouch-layer-count]").textContent = `${layers.length + 1}`;
      dialog.querySelector('[data-retouch-action="delete-layer"]').disabled = !activeLayer();
      dialog.querySelector('[data-retouch-action="duplicate-layer"]').disabled = !activeLayer();
      const active = activeLayer();
      const index = active ? layers.indexOf(active) : -1;
      dialog.querySelector('[data-retouch-action="move-layer-up"]').disabled = index < 0 || index >= layers.length - 1;
      dialog.querySelector('[data-retouch-action="move-layer-down"]').disabled = index <= 0;
      renderLayerThumbnails();
    }
    function controlMarkup(key, label, value, min, max, step = 1) {
      return `<label class="quick-retouch-field"><span>${label}</span><span class="quick-retouch-control"><input type="range" data-retouch-setting="${key}" min="${min}" max="${max}" step="${step}" value="${value}"><input type="number" data-retouch-setting-number="${key}" min="${min}" max="${max}" step="${step}" value="${value}"></span></label>`;
    }

    function adjustmentMaskMarkup() {
      return `<div class="quick-retouch-status-note">${tr("現在の調整レイヤー専用マスクです。ブラシで白く塗ると適用、消しゴムで黒く塗ると保護します。", "This mask belongs to the current adjustment layer. Brush white to apply; erase to black to protect.")}</div><div class="quick-retouch-button-row"><button type="button" data-retouch-mask-action="white">${tr("全面適用", "Fill White")}</button><button type="button" data-retouch-mask-action="black">${tr("全面保護", "Fill Black")}</button><button type="button" data-retouch-mask-action="invert">${tr("反転", "Invert")}</button></div>`;
    }

    function renderSelectionPanel() {
      if (!selectionCanvas || !source) {
        selectionHost.innerHTML = `<div class="quick-retouch-status-note">${tr("画像を読み込んでください。", "Load an image first.")}</div>`;
        return;
      }
      const selected = maskData(selectionCanvas);
      const hasSelection = core.maskHasSelection(selected);
      const visible = selectionDisplay !== "hidden";
      selectionHost.innerHTML = `
        <div class="quick-retouch-selection-summary">
          <button type="button" class="quick-retouch-eye" data-retouch-selection-visible aria-pressed="${String(visible)}">${visible ? "👁" : "·"}</button>
          <canvas class="quick-retouch-layer-thumb" data-retouch-selection-thumb></canvas>
          <div><strong>${hasSelection ? tr("選択範囲あり", "Selection active") : tr("選択範囲なし", "No selection")}</strong><small>${visible ? tr("表示中", "Visible") : tr("表示は非表示・選択は保持", "Hidden visually; selection retained")}</small></div>
        </div>
        <div class="quick-retouch-button-row"><button type="button" data-retouch-selection-action="all">${tr("全選択", "Select All")}</button><button type="button" data-retouch-selection-action="none">${tr("解除", "Deselect")}</button><button type="button" data-retouch-selection-action="invert">${tr("反転", "Invert")}</button></div>
        <div class="quick-retouch-segmented" data-retouch-selection-display-buttons>
          <button type="button" data-selection-display="boundary">${tr("境界線", "Boundary")}</button>
          <button type="button" data-selection-display="overlay">${tr("マスク", "Overlay")}</button>
          <button type="button" data-selection-display="hidden">${tr("非表示", "Hidden")}</button>
        </div>
        ${controlMarkup("selectionFeather", tr("境界ぼかし（px）", "Feather (px)"), selectionFeather, 0, 40, 1)}
        ${controlMarkup("selectionModifyRadius", tr("拡張・縮小量（px）", "Expand / contract amount"), selectionModifyRadius, 1, 32, 1)}
        <div class="quick-retouch-button-row two"><button type="button" data-retouch-selection-action="expand">${tr("拡張", "Expand")}</button><button type="button" data-retouch-selection-action="shrink">${tr("縮小", "Contract")}</button></div>
        <button type="button" class="quick-retouch-wide-button" data-retouch-selection-edit>${tr("ブラシで選択範囲を編集", "Edit selection with brush")}</button>
        <div class="quick-retouch-status-note">${tr("選択範囲はペイント、消しゴム、調整レイヤーの適用範囲として共通利用できます。", "The selection constrains painting, erasing, and newly created adjustment masks.")}</div>`;
      selectionHost.querySelectorAll("[data-selection-display]").forEach((button) => {
        button.classList.toggle("active", button.dataset.selectionDisplay === selectionDisplay);
      });
      bindSelectionPanelEvents();
      renderLayerThumbnails();
    }
    function renderPaintProperties(layer, mask = false) {
      const selectionEdit = activeTarget.kind === "selection";
      propertiesHost.innerHTML = `${mask && !selectionEdit ? adjustmentMaskMarkup() : ""}
        <label>${tr("編集対象", "Editing target")}<strong>${selectionEdit ? tr("選択範囲", "Selection") : mask ? tr("調整レイヤーマスク", "Adjustment mask") : layer?.name || tr("ペイントレイヤー", "Paint layer")}</strong></label>
        ${!mask && !selectionEdit ? controlMarkup("layerOpacity", tr("レイヤー不透明度（%）", "Layer opacity (%)"), Math.round((layer?.opacity ?? 1) * 100), 0, 100, 1) : ""}
        <div class="quick-retouch-status-note">${selectionEdit
          ? tr("ブラシで選択へ追加し、消しゴムで選択から削除します。選択範囲パネルの目アイコンは表示だけを切り替え、選択自体は保持します。", "Brush adds to the selection; Eraser subtracts. The eye in the Selection panel only changes visualization and does not clear the selection.")
          : mask
            ? tr("ブラシで白く塗ると効果を適用し、消しゴムで黒くして保護します。", "Brush white to apply the effect; erase to black to protect.")
            : tr("ブラシ設定は画面上部に表示されます。選択範囲がある場合、その内側だけをペイントします。", "Brush options are shown above the canvas. When a selection exists, paint is constrained to it.")}</div>`;
    }
    function renderHueProperties(layer) {
      propertiesHost.innerHTML = `
        ${controlMarkup("hue", tr("色相", "Hue"), layer.settings.hue, -180, 180, 1)}
        ${controlMarkup("saturation", tr("彩度", "Saturation"), layer.settings.saturation, -100, 100, 1)}
        ${controlMarkup("lightness", tr("明度", "Lightness"), layer.settings.lightness, -100, 100, 1)}
        <label class="quick-retouch-check"><input type="checkbox" data-retouch-setting-check="colorize" ${layer.settings.colorize ? "checked" : ""}><span>${tr("色彩の統一", "Colorize")}</span></label>
        ${controlMarkup("layerOpacity", tr("レイヤー不透明度（%）", "Layer opacity (%)"), Math.round(layer.opacity * 100), 0, 100, 1)}
        ${adjustmentMaskMarkup()}`;
    }

    function renderBrightnessProperties(layer) {
      propertiesHost.innerHTML = `
        ${controlMarkup("brightness", tr("明るさ", "Brightness"), layer.settings.brightness, -100, 100, 1)}
        ${controlMarkup("contrast", tr("コントラスト", "Contrast"), layer.settings.contrast, -100, 100, 1)}
        ${controlMarkup("gamma", tr("ガンマ", "Gamma"), layer.settings.gamma, 0.2, 3, 0.01)}
        ${controlMarkup("layerOpacity", tr("レイヤー不透明度（%）", "Layer opacity (%)"), Math.round(layer.opacity * 100), 0, 100, 1)}
        ${adjustmentMaskMarkup()}`;
    }

    function curvePresets() {
      return {
        linear: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
        contrast: [{ x: 0, y: 0 }, { x: 64, y: 48 }, { x: 192, y: 208 }, { x: 255, y: 255 }],
        strong: [{ x: 0, y: 0 }, { x: 64, y: 36 }, { x: 192, y: 220 }, { x: 255, y: 255 }],
        lift: [{ x: 0, y: 24 }, { x: 72, y: 82 }, { x: 255, y: 255 }],
        highlights: [{ x: 0, y: 0 }, { x: 176, y: 170 }, { x: 255, y: 224 }],
      };
    }

    function renderCurvesProperties(layer) {
      const settings = layer.settings;
      const points = core.normalizeCurvePoints(settings.channels[settings.channel]);
      settings.channels[settings.channel] = points;
      settings.selectedPoint = Math.max(0, Math.min(points.length - 1, Number(settings.selectedPoint) || 0));
      const selected = points[settings.selectedPoint];
      propertiesHost.innerHTML = `
        <label>${tr("チャンネル", "Channel")}<select data-retouch-curve-channel><option value="rgb">RGB</option><option value="red">Red</option><option value="green">Green</option><option value="blue">Blue</option></select></label>
        <label>${tr("プリセット", "Preset")}<select data-retouch-curve-preset><option value="custom">${tr("カスタム", "Custom")}</option><option value="linear">${tr("リニア", "Linear")}</option><option value="contrast">${tr("コントラスト", "Contrast")}</option><option value="strong">${tr("強いコントラスト", "Strong Contrast")}</option><option value="lift">${tr("シャドウを持ち上げる", "Lift Shadows")}</option><option value="highlights">${tr("ハイライトを抑える", "Reduce Highlights")}</option></select></label>
        <canvas class="quick-retouch-curve" data-retouch-curve width="282" height="282"></canvas>
        <div class="quick-retouch-curve-values"><label>${tr("入力", "Input")}<input type="number" data-retouch-curve-x min="0" max="255" value="${selected.x}"></label><label>${tr("出力", "Output")}<input type="number" data-retouch-curve-y min="0" max="255" value="${selected.y}"></label></div>
        <div class="quick-retouch-button-row two"><button type="button" data-retouch-curve-action="delete">${tr("ポイントを削除", "Delete Point")}</button><button type="button" data-retouch-curve-action="reset">${tr("リセット", "Reset")}</button></div>
        ${controlMarkup("layerOpacity", tr("レイヤー不透明度（%）", "Layer opacity (%)"), Math.round(layer.opacity * 100), 0, 100, 1)}
        ${adjustmentMaskMarkup()}`;
      propertiesHost.querySelector("[data-retouch-curve-channel]").value = settings.channel;
      drawCurveEditor(layer);
    }

    function drawCurveEditor(layer) {
      const canvas = propertiesHost.querySelector("[data-retouch-curve]");
      if (!canvas) return;
      const context = canvas.getContext("2d");
      const width = canvas.width;
      const height = canvas.height;
      context.clearRect(0, 0, width, height);
      context.fillStyle = "#30343a";
      context.fillRect(0, 0, width, height);
      context.strokeStyle = "#4a5059";
      context.lineWidth = 1;
      for (let step = 0; step <= 4; step += 1) {
        const value = step / 4 * width;
        context.beginPath(); context.moveTo(value, 0); context.lineTo(value, height); context.stroke();
        context.beginPath(); context.moveTo(0, value); context.lineTo(width, value); context.stroke();
      }
      if (sourceImageData) {
        const histogram = new Uint32Array(256);
        const data = sourceImageData.data;
        for (let offset = 0; offset < data.length; offset += 16) {
          const luminance = Math.round(0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2]);
          histogram[luminance] += 1;
        }
        const maximum = Math.max(1, ...histogram);
        context.fillStyle = "#ffffff18";
        context.beginPath();
        context.moveTo(0, height);
        for (let index = 0; index < 256; index += 1) {
          context.lineTo(index / 255 * width, height - histogram[index] / maximum * height * 0.65);
        }
        context.lineTo(width, height); context.closePath(); context.fill();
      }
      context.strokeStyle = "#777d85";
      context.beginPath(); context.moveTo(0, height); context.lineTo(width, 0); context.stroke();
      const points = core.normalizeCurvePoints(layer.settings.channels[layer.settings.channel]);
      const lut = core.buildCurveLut(points);
      context.strokeStyle = "#f4f6f8";
      context.lineWidth = 2.2;
      context.beginPath();
      for (let x = 0; x < 256; x += 1) {
        const px = x / 255 * width;
        const py = height - lut[x] / 255 * height;
        if (!x) context.moveTo(px, py); else context.lineTo(px, py);
      }
      context.stroke();
      points.forEach((point, index) => {
        const x = point.x / 255 * width;
        const y = height - point.y / 255 * height;
        context.fillStyle = index === layer.settings.selectedPoint ? "#77baff" : "#ffffff";
        context.strokeStyle = "#111";
        context.lineWidth = 1;
        context.fillRect(x - 4, y - 4, 8, 8);
        context.strokeRect(x - 4, y - 4, 8, 8);
      });
    }

    function renderProperties() {
      if (!source) {
        propertiesHost.innerHTML = "";
        return;
      }
      const layer = activeLayer();
      dialog.querySelector("[data-retouch-properties-title]").textContent = activeTarget.kind === "selection"
        ? tr("選択範囲をブラシ編集", "Edit Selection")
        : activeTarget.kind === "mask"
          ? tr("レイヤーマスク", "Layer Mask")
          : activeTarget.kind === "original"
            ? tr("元画像", "Original")
            : layer?.name || tr("プロパティ", "Properties");
      if (activeTarget.kind === "selection") renderPaintProperties(null, true);
      else if (activeTarget.kind === "paint") renderPaintProperties(layer, false);
      else if (activeTarget.kind === "mask") renderPaintProperties(layer, true);
      else if (activeTarget.kind === "original") {
        propertiesHost.innerHTML = `<div class="quick-retouch-status-note">${tr("元画像は非破壊編集の基準として保持され、削除・並べ替え・直接編集はできません。", "The original is preserved as the protected non-destructive source and cannot be deleted, reordered, or painted directly.")}</div>`;
      } else if (layer?.adjustmentType === "hue_saturation") renderHueProperties(layer);
      else if (layer?.adjustmentType === "brightness_contrast") renderBrightnessProperties(layer);
      else if (layer?.adjustmentType === "curves") renderCurvesProperties(layer);
      bindPropertyEvents();
    }
    function renderColorSamples() {
      const host = propertiesHost.querySelector("[data-retouch-color-samples]");
      if (!host) return;
      host.replaceChildren();
      for (const sample of colorRangeSamples) {
        const node = document.createElement("span");
        node.className = "quick-retouch-color-sample";
        node.style.background = rgbHex(sample.r, sample.g, sample.b);
        node.title = tr("選択色", "Included color");
        host.append(node);
      }
      for (const sample of colorRangeExcluded) {
        const node = document.createElement("span");
        node.className = "quick-retouch-color-sample";
        node.style.background = `linear-gradient(45deg, ${rgbHex(sample.r, sample.g, sample.b)} 0 45%, #f33 45% 55%, ${rgbHex(sample.r, sample.g, sample.b)} 55%)`;
        node.title = tr("除外色", "Excluded color");
        host.append(node);
      }
    }

    function beginControlHistory() {
      if (controlSnapshotArmed) return;
      pushHistory();
      controlSnapshotArmed = true;
    }

    function endControlHistory() {
      controlSnapshotArmed = false;
    }

    function settingValue(key, raw) {
      const value = Number(raw);
      if (key === "brushSize") return core.clamp(value, 1, Math.max(500, Math.min(source.width, source.height)));
      if (key === "brushHardness" || key === "brushOpacity" || key === "layerOpacity") return core.clamp(value, 0, 100);
      if (key === "selectionFeather") return core.clamp(value, 0, 40);
      if (key === "selectionModifyRadius") return core.clamp(value, 1, 32);
      if (key === "wandTolerance" || key === "colorRangeTolerance") return core.clamp(value, 0, 100);
      if (key === "hue") return core.clamp(value, -180, 180);
      if (["saturation", "lightness", "brightness", "contrast"].includes(key)) return core.clamp(value, -100, 100);
      if (key === "gamma") return core.clamp(value, 0.2, 3);
      return value;
    }

    function applySetting(key, raw) {
      const value = settingValue(key, raw);
      const layer = activeLayer();
      if (key === "brushSize") brush.size = value;
      else if (key === "brushHardness") brush.hardness = value / 100;
      else if (key === "brushOpacity") brush.opacity = value / 100;
      else if (key === "selectionFeather") selectionFeather = value;
      else if (key === "selectionModifyRadius") selectionModifyRadius = value;
      else if (key === "wandTolerance") wandTolerance = value;
      else if (key === "colorRangeTolerance") { colorRangeTolerance = value; recalculateColorRange(); }
      else if (key === "layerOpacity" && layer) layer.opacity = value / 100;
      else if (layer?.settings && key in layer.settings) layer.settings[key] = value;
      saveSettings();
      syncPairedControls(key, value);
      if (["brushSize", "brushHardness", "brushOpacity"].includes(key)) {
        updateBrushRingStyle();
        if (key === "brushSize") updateBrushRing();
      }
      if (["selectionFeather", "selectionModifyRadius"].includes(key)) renderSelectionPanel();
      schedulePreview();
    }

    function syncPairedControls(key, value) {
      dialog.querySelectorAll(`[data-retouch-setting="${key}"],[data-retouch-setting-number="${key}"],[data-tool-setting="${key}"]`).forEach((control) => {
        if (Number(control.value) !== Number(value)) control.value = value;
      });
      dialog.querySelectorAll(`[data-tool-output="${key}"]`).forEach((output) => {
        output.textContent = `${value}${["brushSize", "selectionFeather"].includes(key) ? " px" : ["brushHardness", "brushOpacity"].includes(key) ? "%" : ""}`;
      });
    }
    function maskAction(action) {
      const layer = activeLayer();
      if (!layer?.mask) return;
      pushHistory();
      if (action === "invert") putMask(layer.mask, core.invertMask(maskData(layer.mask)));
      else putMask(layer.mask, core.createMask(source.width, source.height, action === "white" ? 255 : 0));
      activeTarget = { kind: "mask", layerId: layer.id };
      renderLayers();
      renderProperties();
      schedulePreview();
    }

    function selectionAction(action) {
      if (!selectionCanvas) return;
      let selection = maskData(selectionCanvas);
      if (action === "reselect") {
        if (!lastDeselectedSelection || lastDeselectedSelection.length !== selection.length) {
          setStatus(tr("再選択できる選択範囲がありません。", "There is no previous selection to reselect."), "info");
          return;
        }
        pushHistory();
        selection = new Uint8ClampedArray(lastDeselectedSelection);
      } else {
        pushHistory();
        if (action === "all") selection.fill(255);
        else if (action === "none") {
          if (core.maskHasSelection(selection)) lastDeselectedSelection = selection.slice();
          selection.fill(0);
        }
        else if (action === "invert") selection = core.invertMask(selection);
        else if (action === "expand") selection = core.expandMask(selection, source.width, source.height, selectionModifyRadius);
        else if (action === "shrink") selection = core.shrinkMask(selection, source.width, source.height, selectionModifyRadius);
      }
      putMask(selectionCanvas, selection);
      renderSelectionPanel();
      renderLayers();
      schedulePreview(0);
    }

    function bindSelectionPanelEvents() {
      selectionHost.querySelector("[data-retouch-selection-visible]")?.addEventListener("click", () => {
        if (selectionDisplay === "hidden") selectionDisplay = lastVisibleSelectionDisplay || "boundary";
        else {
          lastVisibleSelectionDisplay = selectionDisplay;
          selectionDisplay = "hidden";
        }
        saveSettings();
        renderSelectionPanel();
        schedulePreview(0);
      });
      selectionHost.querySelectorAll("[data-retouch-selection-action]").forEach((button) => {
        button.onclick = () => selectionAction(button.dataset.retouchSelectionAction);
      });
      selectionHost.querySelectorAll("[data-selection-display]").forEach((button) => {
        button.onclick = () => {
          selectionDisplay = button.dataset.selectionDisplay;
          if (selectionDisplay !== "hidden") lastVisibleSelectionDisplay = selectionDisplay;
          saveSettings();
          renderSelectionPanel();
          schedulePreview(0);
        };
      });
      selectionHost.querySelectorAll("[data-retouch-setting],[data-retouch-setting-number]").forEach((control) => {
        const key = control.dataset.retouchSetting || control.dataset.retouchSettingNumber;
        control.addEventListener("pointerdown", beginControlHistory);
        control.addEventListener("focus", beginControlHistory);
        control.addEventListener("input", () => applySetting(key, control.value));
        control.addEventListener("change", endControlHistory);
        control.addEventListener("blur", endControlHistory);
      });
      selectionHost.querySelector("[data-retouch-selection-edit]")?.addEventListener("click", () => {
        activeTarget = { kind: "selection", layerId: "" };
        activeTool = "brush";
        selectionDisplay = "overlay";
        lastVisibleSelectionDisplay = "overlay";
        renderTools();
        renderToolOptions();
        renderLayers();
        renderProperties();
        renderSelectionPanel();
        schedulePreview(0);
      });
    }
    function bindPropertyEvents() {
      propertiesHost.querySelectorAll("[data-retouch-setting],[data-retouch-setting-number]").forEach((control) => {
        const key = control.dataset.retouchSetting || control.dataset.retouchSettingNumber;
        control.addEventListener("pointerdown", beginControlHistory);
        control.addEventListener("focus", beginControlHistory);
        control.addEventListener("input", () => applySetting(key, control.value));
        control.addEventListener("change", endControlHistory);
        control.addEventListener("blur", endControlHistory);
      });
      propertiesHost.querySelector("[data-retouch-paint-color]")?.addEventListener("input", (event) => {
        brush.color = event.target.value;
        colorInput.value = brush.color;
        saveSettings();
      });
      propertiesHost.querySelectorAll("[data-retouch-swatch]").forEach((button) => {
        button.onclick = () => {
          brush.color = button.dataset.retouchSwatch;
          colorInput.value = brush.color;
          renderProperties();
          saveSettings();
        };
      });
      propertiesHost.querySelector("[data-retouch-selection-operation]")?.addEventListener("change", (event) => {
        selectionOperation = core.normalizeSelectionOperation(event.target.value);
      });
      propertiesHost.querySelector("[data-retouch-selection-display]")?.addEventListener("change", (event) => {
        selectionDisplay = event.target.value === "hidden" ? "hidden" : "overlay";
        saveSettings();
        schedulePreview(0);
      });
      propertiesHost.querySelectorAll("[data-retouch-selection-action]").forEach((button) => {
        button.onclick = () => selectionAction(button.dataset.retouchSelectionAction);
      });
      propertiesHost.querySelectorAll("[data-retouch-mask-action]").forEach((button) => {
        button.onclick = () => maskAction(button.dataset.retouchMaskAction);
      });
      propertiesHost.querySelector("[data-retouch-setting-check='colorize']")?.addEventListener("change", (event) => {
        const layer = activeLayer();
        if (!layer) return;
        pushHistory();
        layer.settings.colorize = event.target.checked;
        schedulePreview();
      });
      propertiesHost.querySelector("[data-retouch-color-range='apply']")?.addEventListener("click", applyColorRange);
      propertiesHost.querySelector("[data-retouch-color-range='clear']")?.addEventListener("click", () => {
        colorRangeSamples = [];
        colorRangeExcluded = [];
        pendingColorRangeMask = null;
        renderColorSamples();
        renderToolOptions();
        schedulePreview(0);
      });
      bindCurveEvents();
    }

    function curvePointAt(event, canvas, layer) {
      const rect = canvas.getBoundingClientRect();
      const x = core.clamp((event.clientX - rect.left) / Math.max(1, rect.width) * 255, 0, 255);
      const y = core.clamp(255 - (event.clientY - rect.top) / Math.max(1, rect.height) * 255, 0, 255);
      const points = core.normalizeCurvePoints(layer.settings.channels[layer.settings.channel]);
      let nearest = -1;
      let distance = Infinity;
      for (let index = 0; index < points.length; index += 1) {
        const current = Math.hypot(points[index].x - x, points[index].y - y);
        if (current < distance) { distance = current; nearest = index; }
      }
      return { x, y, points, nearest: distance <= 12 ? nearest : -1 };
    }

    function updateCurvePoint(layer, index, x, y) {
      const channel = layer.settings.channel;
      const points = core.normalizeCurvePoints(layer.settings.channels[channel]);
      const point = points[index];
      if (!point) return;
      const previous = points[index - 1];
      const next = points[index + 1];
      if (index === 0) x = 0;
      else if (index === points.length - 1) x = 255;
      else x = core.clamp(x, previous.x + 1, next.x - 1);
      point.x = Math.round(x);
      point.y = Math.round(core.clamp(y, 0, 255));
      layer.settings.channels[channel] = points;
      layer.settings.selectedPoint = index;
      const xInput = propertiesHost.querySelector("[data-retouch-curve-x]");
      const yInput = propertiesHost.querySelector("[data-retouch-curve-y]");
      if (xInput) xInput.value = point.x;
      if (yInput) yInput.value = point.y;
      drawCurveEditor(layer);
      schedulePreview();
    }

    function bindCurveEvents() {
      const layer = activeLayer();
      const canvas = propertiesHost.querySelector("[data-retouch-curve]");
      if (!canvas || layer?.adjustmentType !== "curves") return;
      propertiesHost.querySelector("[data-retouch-curve-channel]").onchange = (event) => {
        pushHistory();
        layer.settings.channel = event.target.value;
        layer.settings.selectedPoint = 0;
        renderProperties();
        schedulePreview();
      };
      propertiesHost.querySelector("[data-retouch-curve-preset]").onchange = (event) => {
        if (event.target.value === "custom") return;
        pushHistory();
        layer.settings.channels[layer.settings.channel] = curvePresets()[event.target.value].map((point) => ({ ...point }));
        layer.settings.selectedPoint = 0;
        renderProperties();
        schedulePreview();
      };
      canvas.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        const hit = curvePointAt(event, canvas, layer);
        pushHistory();
        if (hit.nearest >= 0) {
          layer.settings.selectedPoint = hit.nearest;
        } else {
          const points = [...hit.points, { x: Math.round(hit.x), y: Math.round(hit.y) }].sort((a, b) => a.x - b.x);
          layer.settings.channels[layer.settings.channel] = points;
          layer.settings.selectedPoint = points.findIndex((point) => point.x === Math.round(hit.x));
        }
        curveDrag = { pointerId: event.pointerId };
        try { canvas.setPointerCapture(event.pointerId); } catch {}
        updateCurvePoint(layer, layer.settings.selectedPoint, hit.x, hit.y);
      });
      canvas.addEventListener("pointermove", (event) => {
        if (!curveDrag || curveDrag.pointerId !== event.pointerId) return;
        const hit = curvePointAt(event, canvas, layer);
        updateCurvePoint(layer, layer.settings.selectedPoint, hit.x, hit.y);
      });
      const endCurve = (event) => {
        if (!curveDrag || curveDrag.pointerId !== event.pointerId) return;
        curveDrag = null;
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      };
      canvas.addEventListener("pointerup", endCurve);
      canvas.addEventListener("pointercancel", endCurve);
      canvas.addEventListener("dblclick", (event) => {
        const hit = curvePointAt(event, canvas, layer);
        if (hit.nearest <= 0 || hit.nearest >= hit.points.length - 1) return;
        pushHistory();
        hit.points.splice(hit.nearest, 1);
        layer.settings.channels[layer.settings.channel] = hit.points;
        layer.settings.selectedPoint = Math.max(0, hit.nearest - 1);
        renderProperties();
        schedulePreview();
      });
      const updateNumeric = () => {
        const points = core.normalizeCurvePoints(layer.settings.channels[layer.settings.channel]);
        const index = layer.settings.selectedPoint;
        updateCurvePoint(
          layer,
          index,
          Number(propertiesHost.querySelector("[data-retouch-curve-x]").value),
          Number(propertiesHost.querySelector("[data-retouch-curve-y]").value),
        );
      };
      for (const input of propertiesHost.querySelectorAll("[data-retouch-curve-x],[data-retouch-curve-y]")) {
        input.addEventListener("focus", beginControlHistory);
        input.addEventListener("change", () => { updateNumeric(); endControlHistory(); });
      }
      propertiesHost.querySelector("[data-retouch-curve-action='delete']").onclick = () => {
        const points = core.normalizeCurvePoints(layer.settings.channels[layer.settings.channel]);
        const index = layer.settings.selectedPoint;
        if (index <= 0 || index >= points.length - 1) return;
        pushHistory();
        points.splice(index, 1);
        layer.settings.channels[layer.settings.channel] = points;
        layer.settings.selectedPoint = Math.max(0, index - 1);
        renderProperties();
        schedulePreview();
      };
      propertiesHost.querySelector("[data-retouch-curve-action='reset']").onclick = () => {
        pushHistory();
        layer.settings.channels[layer.settings.channel] = curvePresets().linear.map((point) => ({ ...point }));
        layer.settings.selectedPoint = 0;
        renderProperties();
        schedulePreview();
      };
    }

    function toolDefinitions() {
      return [
        { group: tr("描画", "Paint") },
        { id: "brush", icon: "🖌", label: tr("ブラシ", "Brush"), key: "B" },
        { id: "eraser", icon: "▰", label: tr("消しゴム", "Eraser"), key: "E" },
        { id: "eyedropper", icon: "⌞", label: tr("スポイト", "Eyedropper"), key: "I" },
        { group: tr("選択", "Selection") },
        { id: "rectangle", icon: "▣", label: tr("矩形選択", "Rectangle Select"), key: "M" },
        { id: "lasso", icon: "◯", label: tr("投げ縄選択", "Freehand Lasso"), key: "L" },
        { id: "wand", icon: "✦", label: tr("自動選択", "Magic Wand"), key: "W" },
        { id: "color_range", icon: "◎", label: tr("色域選択", "Color Range"), key: "U" },
        { group: tr("表示", "View") },
        { id: "hand", icon: "✋", label: tr("手のひら", "Hand"), key: "H" },
        { id: "zoom", icon: "🔍", label: tr("ズーム", "Zoom"), key: "Z" },
      ];
    }

    function activateTool(id) {
      activeTool = id;
      lassoPoints = [];
      pointerState = null;
      pendingColorRangeMask = id === "color_range" ? pendingColorRangeMask : null;
      if (["brush", "eraser"].includes(id) && activeTarget.kind === "adjustment") {
        activeTarget = { kind: "mask", layerId: activeTarget.layerId };
        renderLayers();
        renderProperties();
      }
      renderTools();
      renderToolOptions();
      updateCanvasCursor();
      updateBrushRingStyle();
      updateBrushRing();
      schedulePreview(0);
    }

    function renderTools() {
      const nodes = [];
      for (const definition of toolDefinitions()) {
        if (definition.group) {
          const heading = document.createElement("div");
          heading.className = "quick-retouch-tool-group";
          heading.textContent = definition.group;
          nodes.push(heading);
          continue;
        }
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.retouchTool = definition.id;
        button.classList.toggle("active", activeTool === definition.id);
        button.title = `${definition.label} (${definition.key})`;
        button.innerHTML = `<span>${definition.icon}</span><span>${definition.label}</span>`;
        button.onclick = () => activateTool(definition.id);
        nodes.push(button);
      }
      toolsHost.replaceChildren(...nodes);
    }

    function selectionOperationForModifiers(shift = shiftDown, alt = altDown) {
      if (shift && alt) return "intersect";
      if (alt) return "subtract";
      if (shift) return "add";
      return selectionOperation;
    }

    function colorSampleModeForModifiers(shift = shiftDown, alt = altDown) {
      if (alt) return "exclude";
      if (shift) return "add";
      return colorSampleMode;
    }

    function selectionOperationMarkup() {
      const entries = [
        ["replace", tr("新規", "New")],
        ["add", tr("追加", "Add")],
        ["subtract", tr("削除", "Subtract")],
        ["intersect", tr("共通", "Intersect")],
      ];
      const effective = selectionOperationForModifiers();
      const temporary = effective !== selectionOperation;
      return `<div class="quick-retouch-option-group"><span>${tr("選択方法", "Selection mode")}</span><div class="quick-retouch-segmented selection-operation">${entries.map(([value, label]) => `<button type="button" data-selection-operation="${value}" class="${effective === value ? `active${temporary ? " temporary" : ""}` : ""}">${label}</button>`).join("")}</div></div>`;
    }

    function compactOption(key, label, value, min, max, step = 1, suffix = "") {
      return `<label class="quick-retouch-option-field"><span>${label}</span><input type="range" data-tool-setting="${key}" min="${min}" max="${max}" step="${step}" value="${value}"><output data-tool-output="${key}">${value}${suffix}</output></label>`;
    }

    function renderToolOptions() {
      if (!toolOptionsHost) return;
      const maxBrush = source ? Math.max(500, Math.min(source.width, source.height)) : 500;
      if (["brush", "eraser"].includes(activeTool)) {
        const mask = activeIsMask();
        toolOptionsHost.innerHTML = `<strong>${activeTool === "brush" ? tr("ブラシ", "Brush") : tr("消しゴム", "Eraser")}</strong>
          ${compactOption("brushSize", tr("サイズ", "Size"), Math.round(brush.size), 1, maxBrush, 1, " px")}
          ${compactOption("brushHardness", tr("硬さ", "Hardness"), Math.round(brush.hardness * 100), 0, 100, 1, "%")}
          ${compactOption("brushOpacity", tr("不透明度", "Opacity"), Math.round(brush.opacity * 100), 1, 100, 1, "%")}
          ${mask ? `<span class="quick-retouch-option-note">${tr("マスク編集：ブラシで追加、消しゴムで削除", "Mask edit: brush adds, eraser removes")}</span>` : `<label class="quick-retouch-option-color"><span>${tr("描画色", "Color")}</span><input type="color" data-tool-color value="${brush.color}"></label>`}`;
      } else if (activeTool === "eyedropper") {
        toolOptionsHost.innerHTML = `<strong>${tr("スポイト", "Eyedropper")}</strong><span class="quick-retouch-option-note">${tr("クリックした色をブラシの描画色に設定します。Alt＋クリックでも一時的に使用できます。", "Click to set the brush foreground color. Alt-click also samples temporarily.")}</span>`;
      } else if (["rectangle", "lasso", "wand", "color_range"].includes(activeTool)) {
        toolOptionsHost.innerHTML = `<strong>${({rectangle:tr("矩形選択", "Rectangle Select"),lasso:tr("投げ縄選択", "Freehand Lasso"),wand:tr("自動選択", "Magic Wand"),color_range:tr("色域選択", "Color Range")})[activeTool]}</strong>
          ${selectionOperationMarkup()}
          ${compactOption("selectionFeather", tr("ぼかし", "Feather"), selectionFeather, 0, 40, 1, " px")}
          ${activeTool === "wand" ? `${compactOption("wandTolerance", tr("許容値", "Tolerance"), wandTolerance, 0, 100, 1)}<label class="quick-retouch-option-check"><input type="checkbox" data-tool-check="wandContiguous" ${wandContiguous ? "checked" : ""}><span>${tr("連続領域のみ", "Contiguous")}</span></label>` : ""}
          ${activeTool === "color_range" ? (() => { const effectiveSampleMode = colorSampleModeForModifiers(); const temporarySample = effectiveSampleMode !== colorSampleMode; return `${compactOption("colorRangeTolerance", tr("許容範囲", "Tolerance"), colorRangeTolerance, 0, 100, 1)}<div class="quick-retouch-option-group"><span>${tr("スポイト", "Sampler")}</span><div class="quick-retouch-segmented"><button type="button" data-color-sample-mode="replace" class="${effectiveSampleMode === "replace" ? `active${temporarySample ? " temporary" : ""}` : ""}">${tr("基準", "Set")}</button><button type="button" data-color-sample-mode="add" class="${effectiveSampleMode === "add" ? `active${temporarySample ? " temporary" : ""}` : ""}">＋</button><button type="button" data-color-sample-mode="exclude" class="${effectiveSampleMode === "exclude" ? `active${temporarySample ? " temporary" : ""}` : ""}">−</button></div></div><div class="quick-retouch-option-samples" data-tool-color-samples></div><button type="button" data-tool-color-range="apply">${tr("選択へ適用", "Apply")}</button><button type="button" data-tool-color-range="clear">${tr("クリア", "Clear")}</button>`; })() : ""}
          <span class="quick-retouch-option-note">${tr("Shift：追加／Alt：削除／Shift＋Alt：共通部分", "Shift: add / Alt: subtract / Shift+Alt: intersect")}</span>`;
      } else if (activeTool === "hand") {
        toolOptionsHost.innerHTML = `<strong>${tr("手のひら", "Hand")}</strong><span class="quick-retouch-option-note">${tr("ドラッグ、Space＋左ドラッグ、またはマウス中ボタンドラッグでキャンバスを移動します。", "Pan by dragging, Space-left-dragging, or middle-mouse dragging.")}</span>`;
      } else {
        toolOptionsHost.innerHTML = `<strong>${tr("ズーム", "Zoom")}</strong><button type="button" data-tool-zoom="out">−</button><button type="button" data-tool-zoom="in">＋</button><button type="button" data-tool-zoom="fit">${tr("画面に合わせる", "Fit")}</button><span class="quick-retouch-option-note">${tr("ホイールで拡大縮小。Alt＋クリックで縮小します。", "Use the mouse wheel to zoom. Alt-click zooms out.")}</span>`;
      }
      bindToolOptionEvents();
      renderToolColorSamples();
    }

    function renderToolColorSamples() {
      const host = toolOptionsHost.querySelector("[data-tool-color-samples]");
      if (!host) return;
      host.replaceChildren();
      for (const sample of colorRangeSamples) {
        const node = document.createElement("span");
        node.className = "quick-retouch-color-sample";
        node.style.background = rgbHex(sample.r, sample.g, sample.b);
        node.title = tr("選択色", "Included color");
        host.append(node);
      }
      for (const sample of colorRangeExcluded) {
        const node = document.createElement("span");
        node.className = "quick-retouch-color-sample excluded";
        node.style.background = rgbHex(sample.r, sample.g, sample.b);
        node.title = tr("除外色", "Excluded color");
        host.append(node);
      }
    }

    function bindToolOptionEvents() {
      toolOptionsHost.querySelectorAll("[data-selection-operation]").forEach((button) => {
        button.onclick = () => {
          selectionOperation = core.normalizeSelectionOperation(button.dataset.selectionOperation);
          renderToolOptions();
        };
      });
      toolOptionsHost.querySelectorAll("[data-tool-setting]").forEach((control) => {
        const key = control.dataset.toolSetting;
        control.onpointerdown = beginControlHistory;
        control.oninput = () => {
          applySetting(key, control.value);
          const output = toolOptionsHost.querySelector(`[data-tool-output="${key}"]`);
          if (output) output.textContent = `${control.value}${["brushSize", "selectionFeather"].includes(key) ? " px" : ["brushHardness", "brushOpacity"].includes(key) ? "%" : ""}`;
        };
        control.onchange = endControlHistory;
      });
      toolOptionsHost.querySelector("[data-tool-color]")?.addEventListener("input", (event) => {
        brush.color = event.target.value;
        colorInput.value = brush.color;
        saveSettings();
        updateBrushRingStyle();
      });
      toolOptionsHost.querySelector("[data-tool-check='wandContiguous']")?.addEventListener("change", (event) => {
        wandContiguous = event.target.checked;
        saveSettings();
      });
      toolOptionsHost.querySelectorAll("[data-color-sample-mode]").forEach((button) => {
        button.onclick = () => {
          colorSampleMode = button.dataset.colorSampleMode;
          renderToolOptions();
          updateCanvasCursor();
        };
      });
      toolOptionsHost.querySelector("[data-tool-color-range='apply']")?.addEventListener("click", applyColorRange);
      toolOptionsHost.querySelector("[data-tool-color-range='clear']")?.addEventListener("click", () => {
        colorRangeSamples = [];
        colorRangeExcluded = [];
        pendingColorRangeMask = null;
        renderToolOptions();
        schedulePreview(0);
      });
      toolOptionsHost.querySelectorAll("[data-tool-zoom]").forEach((button) => {
        button.onclick = () => {
          const action = button.dataset.toolZoom;
          if (action === "fit") setViewZoom("fit");
          else zoomBy(action === "in" ? 1.25 : 0.8);
        };
      });
    }

    function combineSelection(incoming, operation = selectionOperation) {
      let next = incoming;
      if (selectionFeather > 0) next = core.featherMask(next, source.width, source.height, selectionFeather);
      const current = maskData(selectionCanvas);
      putMask(selectionCanvas, core.combineMasks(current, next, operation));
      renderSelectionPanel();
      renderToolOptions();
      schedulePreview(0);
    }
    function sourcePixelAt(point) {
      const x = Math.max(0, Math.min(source.width - 1, Math.floor(point.x)));
      const y = Math.max(0, Math.min(source.height - 1, Math.floor(point.y)));
      const offset = (y * source.width + x) * 4;
      return {
        r: sourceImageData.data[offset],
        g: sourceImageData.data[offset + 1],
        b: sourceImageData.data[offset + 2],
        a: sourceImageData.data[offset + 3],
      };
    }

    function previewPixelAt(point) {
      if (!previewData) return sourcePixelAt(point);
      const x = Math.max(0, Math.min(previewData.width - 1, Math.floor(point.previewX)));
      const y = Math.max(0, Math.min(previewData.height - 1, Math.floor(point.previewY)));
      const offset = (y * previewData.width + x) * 4;
      return {
        r: previewData.data[offset],
        g: previewData.data[offset + 1],
        b: previewData.data[offset + 2],
        a: previewData.data[offset + 3],
      };
    }

    function recalculateColorRange() {
      if (!sourceImageData || !colorRangeSamples.length) {
        pendingColorRangeMask = null;
        schedulePreview(0);
        return;
      }
      setStatus(tr("色域を計算しています…", "Calculating Color Range…"));
      setTimeout(() => {
        pendingColorRangeMask = core.colorRangeMask(sourceImageData, colorRangeSamples, colorRangeExcluded, colorRangeTolerance);
        renderColorSamples();
        renderToolOptions();
        schedulePreview(0);
        setStatus(tr("色域プレビューです。「色域を選択へ反映」を押してください。", "Color Range preview. Click Apply Color Range."), "ready");
      }, 0);
    }

    function applyColorRange() {
      if (!pendingColorRangeMask) return;
      pushHistory();
      combineSelection(pendingColorRangeMask);
      pendingColorRangeMask = null;
      renderToolOptions();
      setStatus(tr("色域を選択範囲へ反映しました。", "Color Range was applied to the Selection."), "ready");
    }

    function stampBrush(canvas, x, y, erase = false) {
      const radius = Math.max(0.5, brush.size / 2);
      const left = Math.max(0, Math.floor(x - radius - 1));
      const top = Math.max(0, Math.floor(y - radius - 1));
      const right = Math.min(canvas.width, Math.ceil(x + radius + 1));
      const bottom = Math.min(canvas.height, Math.ceil(y + radius + 1));
      const width = Math.max(1, right - left);
      const height = Math.max(1, bottom - top);
      const stamp = createCanvas(width, height);
      const stampContext = stamp.getContext("2d", { willReadFrequently: true });
      const localX = x - left;
      const localY = y - top;
      const hardnessRadius = radius * core.clamp(brush.hardness, 0, 1);
      const gradient = stampContext.createRadialGradient(localX, localY, Math.max(0, hardnessRadius), localX, localY, radius);
      const alpha = core.clamp(brush.opacity, 0, 1);
      const maskTarget = activeIsMask();
      if (maskTarget) {
        const value = erase ? 0 : 255;
        gradient.addColorStop(0, `rgba(${value},${value},${value},${alpha})`);
        gradient.addColorStop(Math.max(0.001, brush.hardness), `rgba(${value},${value},${value},${alpha})`);
        gradient.addColorStop(1, `rgba(${value},${value},${value},0)`);
      } else if (erase) {
        gradient.addColorStop(0, `rgba(0,0,0,${alpha})`);
        gradient.addColorStop(Math.max(0.001, brush.hardness), `rgba(0,0,0,${alpha})`);
        gradient.addColorStop(1, "rgba(0,0,0,0)");
      } else {
        const color = parseHexColor(brush.color);
        gradient.addColorStop(0, `rgba(${color.r},${color.g},${color.b},${alpha})`);
        gradient.addColorStop(Math.max(0.001, brush.hardness), `rgba(${color.r},${color.g},${color.b},${alpha})`);
        gradient.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);
      }
      stampContext.fillStyle = gradient;
      stampContext.beginPath();
      stampContext.arc(localX, localY, radius, 0, Math.PI * 2);
      stampContext.fill();

      const targetContext = canvas.getContext("2d", { willReadFrequently: true });
      const constrain = activeTarget.kind !== "selection" && core.maskHasSelection(maskData(selectionCanvas));
      if (!constrain) {
        targetContext.save();
        if (!maskTarget && erase) targetContext.globalCompositeOperation = "destination-out";
        targetContext.drawImage(stamp, left, top);
        targetContext.restore();
        return;
      }

      const stampData = stampContext.getImageData(0, 0, width, height).data;
      const targetImage = targetContext.getImageData(left, top, width, height);
      const targetData = targetImage.data;
      const selectionData = selectionCanvas.getContext("2d", { willReadFrequently: true }).getImageData(left, top, width, height).data;
      for (let offset = 0; offset < targetData.length; offset += 4) {
        const sourceAlpha = stampData[offset + 3] / 255 * (selectionData[offset] / 255);
        if (sourceAlpha <= 0) continue;
        if (maskTarget) {
          const sourceValue = erase ? 0 : 255;
          const value = Math.round(sourceValue * sourceAlpha + targetData[offset] * (1 - sourceAlpha));
          targetData[offset] = targetData[offset + 1] = targetData[offset + 2] = value;
          targetData[offset + 3] = 255;
        } else if (erase) {
          targetData[offset + 3] = Math.round(targetData[offset + 3] * (1 - sourceAlpha));
        } else {
          const targetAlpha = targetData[offset + 3] / 255;
          const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
          if (outputAlpha <= 0) continue;
          for (let channel = 0; channel < 3; channel += 1) {
            targetData[offset + channel] = Math.round((stampData[offset + channel] * sourceAlpha + targetData[offset + channel] * targetAlpha * (1 - sourceAlpha)) / outputAlpha);
          }
          targetData[offset + 3] = Math.round(outputAlpha * 255);
        }
      }
      targetContext.putImageData(targetImage, left, top);
    }
    function brushSegment(canvas, from, to, erase) {
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const spacing = Math.max(1, brush.size * 0.16);
      const steps = Math.max(1, Math.ceil(distance / spacing));
      for (let index = 0; index <= steps; index += 1) {
        const amount = index / steps;
        stampBrush(canvas, from.x + (to.x - from.x) * amount, from.y + (to.y - from.y) * amount, erase);
      }
    }

    function temporaryEyedropperActive(event = null) {
      return ["brush", "eraser"].includes(activeTool) && !activeIsMask() && Boolean(event?.altKey || altDown);
    }

    function updateCanvasCursor(event = null) {
      let cursorTool = activeTool;
      if (pointerState?.mode === "pan") cursorTool = "panning";
      else if (spaceDown) cursorTool = "hand";
      else if (temporaryEyedropperActive(event)) cursorTool = "eyedropper-temporary";
      else if (activeTool === "zoom" && (event?.altKey || altDown)) cursorTool = "zoom-out";
      else if (activeTool === "color_range") cursorTool = `color-range-${colorSampleModeForModifiers(Boolean(event?.shiftKey || shiftDown), Boolean(event?.altKey || altDown))}`;
      stage.dataset.cursorTool = cursorTool;
    }

    function updateBrushRingStyle() {
      brushRing.style.setProperty("--retouch-brush-color", brush.color);
      brushRing.classList.toggle("mask-brush", activeIsMask());
      brushRing.classList.toggle("eraser", activeTool === "eraser");
      brushRing.classList.toggle("painting", pointerState?.mode === "brush");
      brushRing.classList.toggle("resizing", pointerState?.mode === "brush-size");
    }

    function renderBrushRing() {
      brushRingFrame = 0;
      const resizing = pointerState?.mode === "brush-size";
      if (!["brush", "eraser"].includes(activeTool) || temporaryEyedropperActive() || pointerState?.mode === "pan" || !source || !dialog.open || !brushRingClient) {
        brushRing.classList.remove("visible", "painting", "resizing");
        return;
      }
      const rect = resultCanvas.getBoundingClientRect();
      const { x: clientX, y: clientY } = brushRingClient;
      const inCanvas = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
      if (!inCanvas && !resizing) {
        brushRing.classList.remove("visible");
        return;
      }
      const diameter = Math.max(1, brush.size / Math.max(1, source.width) * rect.width);
      brushRing.style.width = `${diameter}px`;
      brushRing.style.height = `${diameter}px`;
      brushRing.style.left = `${clientX - diameter / 2}px`;
      brushRing.style.top = `${clientY - diameter / 2}px`;
      updateBrushRingStyle();
      brushRing.classList.add("visible");
    }

    function updateBrushRing(event = null) {
      if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
        brushRingClient = { x: event.clientX, y: event.clientY };
      }
      if (brushRingFrame) return;
      brushRingFrame = requestAnimationFrame(renderBrushRing);
    }

    function effectiveSelectionOperation(event) {
      return selectionOperationForModifiers(Boolean(event.shiftKey), Boolean(event.altKey));
    }

    function showBrushSizeHud(event = null) {
      if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
        brushRingClient = { x: event.clientX, y: event.clientY };
      }
      brushSizeHud.hidden = false;
      brushSizeHud.textContent = `${Math.round(brush.size)} px`;
      if (brushRingClient) {
        brushSizeHud.style.left = `${core.clamp(brushRingClient.x + 16, 8, Math.max(8, root.innerWidth - 82))}px`;
        brushSizeHud.style.top = `${core.clamp(brushRingClient.y + 16, 8, Math.max(8, root.innerHeight - 34))}px`;
        brushSizeHud.style.transform = "none";
      } else {
        brushSizeHud.style.left = "50%";
        brushSizeHud.style.top = "90px";
        brushSizeHud.style.transform = "translateX(-50%)";
      }
      clearTimeout(brushSizeTimer);
      brushSizeTimer = setTimeout(() => { brushSizeHud.hidden = true; }, 700);
    }

    function handleResultPointerDown(event) {
      if (!source) return;
      if (event.button === 1) {
        event.preventDefault();
        pointerState = { mode: "pan", pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: viewPanX, panY: viewPanY };
        try { resultCanvas.setPointerCapture(event.pointerId); } catch {}
        updateCanvasCursor(event);
        return;
      }
      if (event.button === 2 && ["brush", "eraser"].includes(activeTool)) {
        event.preventDefault();
        pointerState = { mode: "brush-size", pointerId: event.pointerId, startX: event.clientX, startSize: brush.size };
        try { resultCanvas.setPointerCapture(event.pointerId); } catch {}
        updateBrushRing(event);
        showBrushSizeHud(event);
        return;
      }
      if (event.button !== 0) return;
      const point = fullPoint(event);
      if (event.altKey && !activeIsMask() && ["brush", "eraser"].includes(activeTool)) {
        event.preventDefault();
        const color = previewPixelAt(point);
        brush.color = rgbHex(color.r, color.g, color.b);
        colorInput.value = brush.color;
        renderToolOptions();
        updateBrushRingStyle();
        saveSettings();
        setStatus(tr("描画色を取得しました。", "Foreground color sampled."), "ready");
        return;
      }
      if (activeTool === "hand" || spaceDown) {
        pointerState = { mode: "pan", pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: viewPanX, panY: viewPanY };
        try { resultCanvas.setPointerCapture(event.pointerId); } catch {}
        updateCanvasCursor(event);
        return;
      }
      if (activeTool === "zoom") {
        zoomBy(event.altKey ? 0.8 : 1.25, event);
        updateCanvasCursor(event);
        return;
      }
      if (activeTool === "rectangle") {
        pointerState = { mode: "rectangle", pointerId: event.pointerId, start: point, current: point, operation: effectiveSelectionOperation(event) };
        try { resultCanvas.setPointerCapture(event.pointerId); } catch {}
        schedulePreview(0);
        return;
      }
      if (activeTool === "lasso") {
        lassoPoints = [{ x: point.x, y: point.y }];
        pointerState = { mode: "lasso", pointerId: event.pointerId, previous: point, operation: effectiveSelectionOperation(event) };
        try { resultCanvas.setPointerCapture(event.pointerId); } catch {}
        schedulePreview(0);
        return;
      }
      if (activeTool === "wand") {
        pushHistory();
        setStatus(tr("自動選択を計算しています…", "Calculating Magic Wand selection…"));
        const operation = effectiveSelectionOperation(event);
        setTimeout(() => {
          const color = sourcePixelAt(point);
          const mask = wandContiguous
            ? core.floodSelect(sourceImageData, point.x, point.y, wandTolerance)
            : core.colorRangeMask(sourceImageData, [color], [], wandTolerance);
          combineSelection(mask, operation);
          setStatus(tr("自動選択を反映しました。", "Magic Wand selection applied."), "ready");
        }, 0);
        return;
      }
      if (activeTool === "color_range") {
        const color = sourcePixelAt(point);
        const mode = colorSampleModeForModifiers(Boolean(event.shiftKey), Boolean(event.altKey));
        if (mode === "exclude") colorRangeExcluded.push(color);
        else if (mode === "add") colorRangeSamples.push(color);
        else { colorRangeSamples = [color]; colorRangeExcluded = []; }
        recalculateColorRange();
        renderToolOptions();
        return;
      }
      if (activeTool === "eyedropper") {
        const color = previewPixelAt(point);
        brush.color = rgbHex(color.r, color.g, color.b);
        colorInput.value = brush.color;
        renderToolOptions();
        saveSettings();
        return;
      }
      if (["brush", "eraser"].includes(activeTool)) {
        const canvas = activePaintCanvas();
        if (!canvas) {
          setStatus(tr("ペイントレイヤー、選択範囲、または調整レイヤーマスクを選択してください。", "Select a Paint layer, the Selection, or an adjustment mask."), "error");
          return;
        }
        pushHistory();
        pointerState = { mode: "brush", pointerId: event.pointerId, previous: point };
        brushSegment(canvas, point, point, activeTool === "eraser");
        try { resultCanvas.setPointerCapture(event.pointerId); } catch {}
        updateBrushRingStyle();
        updateBrushRing(event);
        renderLayers();
        schedulePreview();
      }
    }
    function handleResultPointerMove(event) {
      updateCanvasCursor(event);
      updateBrushRing(event);
      if (!source) return;
      const point = fullPoint(event);
      if (pointerState?.mode === "brush-size" && pointerState.pointerId === event.pointerId) {
        brush.size = core.clamp(pointerState.startSize + (event.clientX - pointerState.startX) * 1.4, 1, Math.max(500, Math.min(source.width, source.height)));
        syncPairedControls("brushSize", Math.round(brush.size));
        updateBrushRing(event);
        showBrushSizeHud(event);
        saveSettings();
      } else if (pointerState?.mode === "pan" && pointerState.pointerId === event.pointerId) {
        viewPanX = pointerState.panX + (event.clientX - pointerState.x);
        viewPanY = pointerState.panY + (event.clientY - pointerState.y);
        applyViewPan();
      } else if (pointerState?.mode === "rectangle" && pointerState.pointerId === event.pointerId) {
        pointerState.current = point;
        schedulePreview(0);
      } else if (pointerState?.mode === "lasso" && pointerState.pointerId === event.pointerId) {
        const previous = pointerState.previous;
        if (Math.hypot(point.x - previous.x, point.y - previous.y) >= Math.max(1, source.width / resultCanvas.clientWidth * 2)) {
          lassoPoints.push({ x: point.x, y: point.y });
          pointerState.previous = point;
          schedulePreview(0);
        }
      } else if (pointerState?.mode === "brush" && pointerState.pointerId === event.pointerId) {
        const canvas = activePaintCanvas();
        if (!canvas) return;
        brushSegment(canvas, pointerState.previous, point, activeTool === "eraser");
        pointerState.previous = point;
        schedulePreview();
      }
    }
    function finishLasso(operation = selectionOperation) {
      if (lassoPoints.length < 3) {
        lassoPoints = [];
        pointerState = null;
        schedulePreview(0);
        return;
      }
      pushHistory();
      combineSelection(core.polygonMask(source.width, source.height, lassoPoints), operation);
      lassoPoints = [];
      pointerState = null;
      setStatus(tr("投げ縄選択を反映しました。", "Freehand Lasso selection applied."), "ready");
    }
    function handleResultPointerUp(event) {
      if (!pointerState || pointerState.pointerId !== undefined && pointerState.pointerId !== event.pointerId) return;
      const finishedMode = pointerState.mode;
      if (pointerState.mode === "rectangle") {
        const end = fullPoint(event);
        pushHistory();
        combineSelection(core.rectangleMask(source.width, source.height, pointerState.start.x, pointerState.start.y, end.x, end.y), pointerState.operation);
      } else if (pointerState.mode === "lasso") {
        finishLasso(pointerState.operation);
      }
      pointerState = null;
      brushRing.classList.remove("painting", "resizing");
      if (resultCanvas.hasPointerCapture(event.pointerId)) resultCanvas.releasePointerCapture(event.pointerId);
      updateCanvasCursor(event);
      updateBrushRing(event);
      renderLayers();
      renderSelectionPanel();
      schedulePreview(0);
    }
    async function renderFullBlob() {
      const started = performance.now();
      const sourceData = sourceCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, source.width, source.height);
      const payload = [];
      const masks = new Map();
      for (const layer of layers) {
        if (layer.type === "paint") {
          payload.push({
            id: layer.id,
            type: "paint",
            visible: layer.visible,
            opacity: layer.opacity,
            pixels: layer.canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, source.width, source.height).data,
          });
        } else {
          payload.push({
            id: layer.id,
            type: "adjustment",
            adjustmentType: layer.adjustmentType,
            visible: layer.visible,
            opacity: layer.opacity,
            settings: JSON.parse(JSON.stringify(layer.settings)),
          });
          masks.set(layer.id, maskData(layer.mask));
        }
      }
      const output = core.renderStack(sourceData.data, payload, masks);
      const canvas = createCanvas(source.width, source.height);
      canvas.getContext("2d").putImageData(new ImageData(output, source.width, source.height), 0, 0);
      const blob = await canvasToBlob(canvas);
      return { blob, elapsed: performance.now() - started };
    }

    async function applyResult() {
      if (!source) return;
      applyButton.disabled = true;
      applyButton.textContent = tr("適用中…", "Applying…");
      setStatus(tr("元解像度でレタッチ結果を生成しています…", "Rendering the retouch result at full resolution…"));
      try {
        await new Promise((resolve) => setTimeout(resolve, 20));
        const { blob, elapsed } = await renderFullBlob();
        const name = `${source.name}-retouched.png`;
        if (currentMode() === "comic") {
          const id = await options.addPageImage?.(blob, name);
          if (!id) throw new Error(tr("ページ画像へ追加できませんでした。", "Could not add the result to Page Images."));
          options.setStatus?.(tr(`${name}をページ画像へ追加しました。`, `${name} was added to Page Images.`), "saved");
        } else {
          const applied = await options.applySingleImage?.(blob, name, source);
          if (!applied) throw new Error(tr("一枚画像へ適用できませんでした。", "Could not apply the result to Single Image."));
          options.setStatus?.(tr("簡易レタッチ結果を新しい画像レイヤーへ適用しました。", "Quick Retouch was applied as a new image layer."), "saved");
        }
        setStatus(tr(`適用完了（${(elapsed / 1000).toFixed(1)}秒）`, `Applied in ${(elapsed / 1000).toFixed(1)} seconds.`), "ready");
        dialog.close();
      } catch (error) {
        setStatus(error?.message || tr("簡易レタッチを適用できませんでした。", "Quick Retouch could not be applied."), "error");
      } finally {
        applyButton.disabled = !source;
        applyButton.textContent = currentMode() === "comic"
          ? tr("新しいページ画像として適用", "Apply as New Page Image")
          : tr("一枚画像へ適用", "Apply to Single Image");
      }
    }

    function resetDocument() {
      if (!source) return;
      pushHistory();
      selectionCanvas = maskCanvas(source.width, source.height, 0);
      layers = [];
      const initialPaint = addPaintLayer(false);
      activeTarget = { kind: "paint", layerId: initialPaint?.id || "" };
      activeTool = "brush";
      selectionDisplay = "boundary";
      lastDeselectedSelection = null;
      renderTools();
      renderToolOptions();
      renderSelectionPanel();
      renderLayers();
      renderProperties();
      schedulePreview(0);
    }

    function applyLanguage() {
      dialog.querySelector("[data-retouch-title]").textContent = tr(`簡易レタッチ（Quick Retouch ${BUILD_VERSION}）`, `Quick Retouch ${BUILD_VERSION}`);
      dialog.querySelector("[data-retouch-selection-title]").textContent = tr("選択範囲", "Selection");
      dialog.querySelector("[data-retouch-layers-title]").textContent = tr("レイヤー", "Layers");
      dialog.querySelector("[data-retouch-properties-title]").textContent = tr("プロパティ", "Properties");
      dialog.querySelector('[data-retouch-action="choose-file"]').textContent = tr("画像を変更", "Change Image");
      dialog.querySelector('[data-retouch-action="fit-view"]').textContent = tr("全体表示", "Fit");
      dialog.querySelector('[data-retouch-action="hold-original"]').textContent = tr("元画像を表示（長押し）", "Hold for Original");
      dialog.querySelector('[data-retouch-action="split-compare"]').textContent = tr("左右比較", "Split Compare");
      dialog.querySelector('[data-retouch-action="cancel"]').textContent = tr("キャンセル", "Cancel");
      dialog.querySelector('[data-retouch-action="reset"]').textContent = tr("編集をリセット", "Reset Edit");
      applyButton.textContent = currentMode() === "comic"
        ? tr("新しいページ画像として適用", "Apply as New Page Image")
        : tr("一枚画像へ適用", "Apply to Single Image");
      dialog.querySelector('[data-retouch-add="paint"]').textContent = tr("＋ペイント", "+ Paint");
      dialog.querySelector('[data-retouch-add="curves"]').textContent = tr("カーブ", "Curves");
      dialog.querySelector('[data-retouch-action="duplicate-layer"]').textContent = tr("複製", "Duplicate");
      dialog.querySelector('[data-retouch-action="delete-layer"]').textContent = tr("削除", "Delete");
      dialog.querySelector('[data-retouch-panel-toggle="selection"]').textContent = tr("選択範囲", "Selection");
      dialog.querySelector('[data-retouch-panel-toggle="layers"]').textContent = tr("レイヤー", "Layers");
      dialog.querySelector('[data-retouch-panel-toggle="properties"]').textContent = tr("プロパティ", "Properties");
      const zoom = dialog.querySelector("[data-retouch-zoom]");
      if (zoom?.options?.length) zoom.options[0].textContent = tr("画面に合わせる", "Fit");
      renderTools();
      renderToolOptions();
      renderSelectionPanel();
      renderLayers();
      renderProperties();
    }
    function readGeometry() {
      try { return JSON.parse(localStorage.getItem(GEOMETRY_KEY) || "{}"); }
      catch { return {}; }
    }

    function applyGeometry() {
      const geometry = readGeometry();
      if (Number.isFinite(Number(geometry.width))) dialog.style.width = `${Math.max(940, Math.min(innerWidth - 12, Number(geometry.width)))}px`;
      if (Number.isFinite(Number(geometry.height))) dialog.style.height = `${Math.max(620, Math.min(innerHeight - 12, Number(geometry.height)))}px`;
      if (Number.isFinite(Number(geometry.left))) dialog.style.left = `${Math.max(6, Math.min(innerWidth - dialog.offsetWidth - 6, Number(geometry.left)))}px`;
      if (Number.isFinite(Number(geometry.top))) dialog.style.top = `${Math.max(6, Math.min(innerHeight - dialog.offsetHeight - 6, Number(geometry.top)))}px`;
    }

    function saveGeometry() {
      if (!dialog.open || dialog.classList.contains("maximized")) return;
      const rect = dialog.getBoundingClientRect();
      try { localStorage.setItem(GEOMETRY_KEY, JSON.stringify({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })); }
      catch {}
    }

    function loadPanelState() {
      try {
        const value = JSON.parse(localStorage.getItem(PANEL_GEOMETRY_KEY) || "{}");
        return value && typeof value === "object" ? value : {};
      } catch { return {}; }
    }

    function defaultPanelLayout() {
      const width = Math.max(280, Math.min(330, Math.round(workspace.clientWidth * 0.24)));
      const right = 10;
      const gap = 8;
      const top = 8;
      const usableHeight = Math.max(360, workspace.clientHeight - top * 2);
      const selectionHeight = Math.round(core.clamp(usableHeight * 0.27, 170, 220));
      const layersHeight = Math.round(core.clamp(usableHeight * 0.34, 200, 260));
      const remaining = usableHeight - selectionHeight - layersHeight - gap * 2;
      const propertiesHeight = Math.round(Math.max(180, remaining));
      const left = Math.max(8, workspace.clientWidth - width - right);
      const layersTop = top + selectionHeight + gap;
      const propertiesTop = Math.min(
        top + usableHeight - propertiesHeight,
        layersTop + layersHeight + gap,
      );
      return {
        selection: { left, top, width, height: selectionHeight, z: 81 },
        layers: { left, top: layersTop, width, height: layersHeight, z: 82 },
        properties: { left, top: Math.max(top, propertiesTop), width, height: propertiesHeight, z: 83 },
      };
    }

    function panelGeometry(panel) {
      return {
        left: parseFloat(panel.style.left) || panel.offsetLeft,
        top: parseFloat(panel.style.top) || panel.offsetTop,
        width: panel.offsetWidth,
        height: panel.offsetHeight,
        hidden: panel.hidden,
        collapsed: panel.classList.contains("collapsed"),
        z: Number(panel.style.zIndex) || 80,
      };
    }

    function savePanelState() {
      const state = {};
      dialog.querySelectorAll("[data-retouch-panel]").forEach((panel) => {
        state[panel.dataset.retouchPanel] = panelGeometry(panel);
      });
      try { localStorage.setItem(PANEL_GEOMETRY_KEY, JSON.stringify(state)); } catch {}
      panelState = state;
    }

    function applyPanelGeometry(panel, geometry) {
      const minWidth = 240;
      const minHeight = 120;
      const width = core.clamp(Number(geometry?.width) || 300, minWidth, Math.max(minWidth, workspace.clientWidth - 16));
      const height = core.clamp(Number(geometry?.height) || 260, minHeight, Math.max(minHeight, workspace.clientHeight - 16));
      const left = core.clamp(Number(geometry?.left) || 8, 8, Math.max(8, workspace.clientWidth - width - 8));
      const top = core.clamp(Number(geometry?.top) || 8, 8, Math.max(8, workspace.clientHeight - height - 8));
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.width = `${width}px`;
      panel.style.height = `${height}px`;
      panel.style.zIndex = String(Number(geometry?.z) || 80);
      panel.hidden = geometry?.hidden === true;
      panel.classList.toggle("collapsed", geometry?.collapsed === true);
    }

    function setupFloatingPanels(reset = false) {
      const defaults = defaultPanelLayout();
      const saved = reset ? {} : loadPanelState();
      let z = 84;
      dialog.querySelectorAll("[data-retouch-panel]").forEach((panel) => {
        const name = panel.dataset.retouchPanel;
        applyPanelGeometry(panel, { ...defaults[name], ...(saved[name] || {}) });
        z = Math.max(z, Number(panel.style.zIndex) || 0);
        if (panel.dataset.retouchPanelReady) return;
        panel.dataset.retouchPanelReady = "1";
        panel.addEventListener("pointerdown", () => {
          z += 1;
          panel.style.zIndex = String(z);
        }, true);
        const head = panel.querySelector(`[data-retouch-panel-drag="${name}"]`);
        head?.addEventListener("pointerdown", (event) => {
          if (event.button !== 0 || event.target.closest("button")) return;
          const rect = panel.getBoundingClientRect();
          const work = workspace.getBoundingClientRect();
          panelDragState = { name, panel, pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left - work.left, top: rect.top - work.top };
          try { head.setPointerCapture(event.pointerId); } catch {}
          event.preventDefault();
        });
        head?.addEventListener("pointermove", (event) => {
          if (!panelDragState || panelDragState.pointerId !== event.pointerId) return;
          const left = panelDragState.left + event.clientX - panelDragState.x;
          const top = panelDragState.top + event.clientY - panelDragState.y;
          applyPanelGeometry(panel, { ...panelGeometry(panel), left, top });
        });
        const end = (event) => {
          if (!panelDragState || panelDragState.pointerId !== event.pointerId) return;
          panelDragState = null;
          if (head?.hasPointerCapture(event.pointerId)) head.releasePointerCapture(event.pointerId);
          savePanelState();
        };
        head?.addEventListener("pointerup", end);
        head?.addEventListener("pointercancel", end);
        panel.querySelector(`[data-retouch-panel-collapse="${name}"]`)?.addEventListener("click", () => {
          panel.classList.toggle("collapsed");
          savePanelState();
        });
        panel.querySelector(`[data-retouch-panel-close="${name}"]`)?.addEventListener("click", () => {
          panel.hidden = true;
          savePanelState();
        });
        if ("ResizeObserver" in root) new ResizeObserver(() => {
          if (dialog.open && !panelDragState) savePanelState();
        }).observe(panel);
      });
      panelState = saved;
    }

    function togglePanel(name) {
      const panel = dialog.querySelector(`[data-retouch-panel="${name}"]`);
      if (!panel) return;
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        panel.classList.remove("collapsed");
        panel.style.zIndex = String(100 + Date.now() % 1000);
      }
      savePanelState();
    }

    function openDialog() {
      applyLanguage();
      if (!dialog.open) dialog.showModal();
      applyGeometry();
      requestAnimationFrame(() => {
        setupFloatingPanels();
        applyViewZoom();
        updateCanvasCursor();
      });
      refreshSource().catch((error) => setStatus(String(error?.message || error), "error"));
    }

    function closeDialog() {
      if (dialog.open) dialog.close();
    }

    launcher.addEventListener("click", openDialog);
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeDialog(); });
    dialog.addEventListener("close", () => {
      saveGeometry();
      savePanelState();
      brushRing.classList.remove("visible", "painting", "resizing");
      pointerState = null;
      brushRingClient = null;
      shiftDown = false;
      altDown = false;
      spaceDown = false;
      updateCanvasCursor();
      lassoPoints = [];
    });
    dialog.querySelector('[data-retouch-action="close"]').onclick = closeDialog;
    dialog.querySelector('[data-retouch-action="cancel"]').onclick = closeDialog;
    dialog.querySelector('[data-retouch-action="maximize"]').onclick = () => {
      dialog.classList.toggle("maximized");
      requestAnimationFrame(() => { setupFloatingPanels(); applyViewZoom(); });
    };
    dialog.querySelector('[data-retouch-action="undo"]').onclick = undoAction;
    dialog.querySelector('[data-retouch-action="redo"]').onclick = redoAction;
    const originalButton = dialog.querySelector('[data-retouch-action="hold-original"]');
    const showOriginal = () => { showOriginalOnResult = true; schedulePreview(0); };
    const hideOriginal = () => { showOriginalOnResult = false; schedulePreview(0); };
    originalButton.onpointerdown = (event) => { event.preventDefault(); showOriginal(); };
    originalButton.onpointerup = hideOriginal;
    originalButton.onpointercancel = hideOriginal;
    originalButton.onpointerleave = hideOriginal;
    dialog.querySelector('[data-retouch-action="split-compare"]').onclick = (event) => {
      splitCompare = !splitCompare;
      event.currentTarget.classList.toggle("active", splitCompare);
      schedulePreview(0);
    };
    dialog.querySelector('[data-retouch-action="fit-view"]').onclick = () => setViewZoom("fit");
    dialog.querySelector('[data-retouch-zoom]').onchange = (event) => setViewZoom(event.target.value === "fit" ? "fit" : Number(event.target.value));
    dialog.querySelectorAll("[data-retouch-panel-toggle]").forEach((button) => {
      button.onclick = () => togglePanel(button.dataset.retouchPanelToggle);
    });
    dialog.querySelector('[data-retouch-action="apply"]').onclick = applyResult;
    dialog.querySelector('[data-retouch-action="reset"]').onclick = resetDocument;
    dialog.querySelector('[data-retouch-action="duplicate-layer"]').onclick = duplicateLayer;
    dialog.querySelector('[data-retouch-action="delete-layer"]').onclick = deleteLayer;
    dialog.querySelector('[data-retouch-action="move-layer-up"]').onclick = () => moveLayer("up");
    dialog.querySelector('[data-retouch-action="move-layer-down"]').onclick = () => moveLayer("down");
    dialog.querySelector('[data-retouch-action="swap-colors"]').onclick = () => {
      const next = brush.color;
      brush.color = backgroundColor;
      backgroundColor = next;
      colorInput.value = brush.color;
      backgroundColorInput.value = backgroundColor;
      renderToolOptions();
      updateBrushRingStyle();
      saveSettings();
    };
    dialog.querySelector('[data-retouch-action="default-colors"]').onclick = () => {
      brush.color = "#ffffff";
      backgroundColor = "#000000";
      colorInput.value = brush.color;
      backgroundColorInput.value = backgroundColor;
      renderToolOptions();
      updateBrushRingStyle();
      saveSettings();
    };
    colorInput.oninput = () => { brush.color = colorInput.value; renderToolOptions(); updateBrushRingStyle(); saveSettings(); };
    backgroundColorInput.oninput = () => { backgroundColor = backgroundColorInput.value; saveSettings(); };
    dialog.querySelectorAll("[data-retouch-add]").forEach((button) => {
      button.onclick = () => button.dataset.retouchAdd === "paint" ? addPaintLayer() : addAdjustment(button.dataset.retouchAdd);
    });
    dialog.querySelector('[data-retouch-action="choose-file"]').onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (file) await setSource({ blob: file, name: file.name, source_kind: "external" });
    };

    const dropZone = dialog.querySelector("[data-retouch-drop-zone]");
    dropZone.addEventListener("dragover", (event) => {
      if (![...(event.dataTransfer?.types || [])].includes("Files")) return;
      event.preventDefault();
      dropZone.classList.add("quick-retouch-drop-active");
    });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("quick-retouch-drop-active"));
    dropZone.addEventListener("drop", async (event) => {
      const file = [...(event.dataTransfer?.files || [])].find((item) => /^image\/(?:png|jpeg|webp)$/i.test(item.type));
      if (!file) return;
      event.preventDefault();
      dropZone.classList.remove("quick-retouch-drop-active");
      await setSource({ blob: file, name: file.name, source_kind: "external" });
    });

    canvasWrap.addEventListener("wheel", (event) => {
      if (!source) return;
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 1.12 : 0.89, event);
    }, { passive: false });
    resultCanvas.addEventListener("contextmenu", (event) => {
      if (["brush", "eraser"].includes(activeTool) || pointerState?.mode === "brush-size") event.preventDefault();
    });
    resultCanvas.addEventListener("pointerdown", handleResultPointerDown);
    resultCanvas.addEventListener("pointermove", handleResultPointerMove);
    resultCanvas.addEventListener("pointerup", handleResultPointerUp);
    resultCanvas.addEventListener("pointercancel", handleResultPointerUp);
    resultCanvas.addEventListener("lostpointercapture", handleResultPointerUp);
    resultCanvas.addEventListener("pointerenter", updateBrushRing);
    resultCanvas.addEventListener("pointerleave", (event) => updateBrushRing(event));
    root.addEventListener("pointerup", handleResultPointerUp);
    root.addEventListener("pointercancel", handleResultPointerUp);
    root.addEventListener("blur", () => {
      if (!dialog.open || !pointerState) return;
      pointerState = null;
      lassoPoints = [];
      brushRing.classList.remove("painting", "resizing");
      updateCanvasCursor();
      updateBrushRing();
      schedulePreview(0);
    });
    compareDivider.addEventListener("pointerdown", (event) => {
      if (!splitCompare) return;
      event.preventDefault();
      pointerState = { mode: "compare", pointerId: event.pointerId };
      try { compareDivider.setPointerCapture(event.pointerId); } catch {}
    });
    compareDivider.addEventListener("pointermove", (event) => {
      if (pointerState?.mode !== "compare" || pointerState.pointerId !== event.pointerId) return;
      const rect = stage.getBoundingClientRect();
      compareSplit = core.clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0.05, 0.95);
      schedulePreview(0);
    });
    compareDivider.addEventListener("pointerup", (event) => {
      if (pointerState?.mode !== "compare") return;
      pointerState = null;
      if (compareDivider.hasPointerCapture(event.pointerId)) compareDivider.releasePointerCapture(event.pointerId);
    });

    const dragHandle = dialog.querySelector("[data-retouch-drag-handle]");
    dragHandle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button") || dialog.classList.contains("maximized")) return;
      const rect = dialog.getBoundingClientRect();
      dragState = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      try { dragHandle.setPointerCapture(event.pointerId); } catch {}
    });
    dragHandle.addEventListener("pointermove", (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      dialog.style.margin = "0";
      dialog.style.left = `${core.clamp(dragState.left + event.clientX - dragState.x, 6, innerWidth - dialog.offsetWidth - 6)}px`;
      dialog.style.top = `${core.clamp(dragState.top + event.clientY - dragState.y, 6, innerHeight - dialog.offsetHeight - 6)}px`;
    });
    const endDrag = (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      dragState = null;
      if (dragHandle.hasPointerCapture(event.pointerId)) dragHandle.releasePointerCapture(event.pointerId);
      saveGeometry();
    };
    dragHandle.addEventListener("pointerup", endDrag);
    dragHandle.addEventListener("pointercancel", endDrag);
    if ("ResizeObserver" in root) new ResizeObserver(saveGeometry).observe(dialog);

    root.addEventListener("speech-bubble:language-change", applyLanguage);
    function refreshModifierUi(event = null) {
      updateCanvasCursor(event);
      updateBrushRing();
      if (["rectangle", "lasso", "wand", "color_range"].includes(activeTool)) renderToolOptions();
    }

    root.addEventListener("keydown", (event) => {
      if (!dialog.open) return;
      let modifierChanged = false;
      if (event.key === "Shift" && !shiftDown) { shiftDown = true; modifierChanged = true; }
      if (event.key === "Alt" && !altDown) { altDown = true; modifierChanged = true; }
      if (modifierChanged) refreshModifierUi(event);
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && key === "z") { event.preventDefault(); event.shiftKey ? redoAction() : undoAction(); }
      else if (modifier && key === "y") { event.preventDefault(); redoAction(); }
      else if (modifier && event.shiftKey && key === "d") { event.preventDefault(); selectionAction("reselect"); }
      else if (modifier && event.shiftKey && key === "i") { event.preventDefault(); selectionAction("invert"); }
      else if (modifier && key === "a") { event.preventDefault(); selectionAction("all"); }
      else if (modifier && key === "d") { event.preventDefault(); selectionAction("none"); }
      else if (modifier && key === "j") { event.preventDefault(); duplicateLayer(); }
      else if (modifier && key === "0") { event.preventDefault(); setViewZoom("fit"); }
      else if (modifier && key === "1") { event.preventDefault(); setViewZoom(1); }
      else if (modifier && (event.key === "+" || event.key === "=")) { event.preventDefault(); zoomBy(1.25); }
      else if (modifier && event.key === "-") { event.preventDefault(); zoomBy(0.8); }
      else if (event.key === "Escape" && lassoPoints.length) { event.preventDefault(); lassoPoints = []; pointerState = null; schedulePreview(0); }
      else if (event.key === "[") { brush.size = Math.max(1, Math.round(brush.size * 0.85)); syncPairedControls("brushSize", brush.size); renderToolOptions(); updateBrushRing(); showBrushSizeHud(); saveSettings(); }
      else if (event.key === "]") { brush.size = Math.min(Math.max(500, Math.min(source?.width || 500, source?.height || 500)), Math.round(brush.size * 1.18)); syncPairedControls("brushSize", brush.size); renderToolOptions(); updateBrushRing(); showBrushSizeHud(); saveSettings(); }
      else if (event.key === " ") { spaceDown = true; event.preventDefault(); refreshModifierUi(event); }
      else if (event.key === "\\") { showOriginalOnResult = true; schedulePreview(0); }
      else if (event.key === "Tab") {
        event.preventDefault();
        const panels = [...dialog.querySelectorAll("[data-retouch-panel]")];
        const shouldShow = panels.every((panel) => panel.hidden);
        panels.forEach((panel) => { panel.hidden = !shouldShow; });
        savePanelState();
      }
      else if ({b:"brush",e:"eraser",i:"eyedropper",m:"rectangle",l:"lasso",w:"wand",u:"color_range",h:"hand",z:"zoom"}[key]) activateTool({b:"brush",e:"eraser",i:"eyedropper",m:"rectangle",l:"lasso",w:"wand",u:"color_range",h:"hand",z:"zoom"}[key]);
    });
    root.addEventListener("keyup", (event) => {
      if (!dialog.open) return;
      let modifierChanged = false;
      if (event.key === "Shift") { shiftDown = false; modifierChanged = true; }
      if (event.key === "Alt") { altDown = false; modifierChanged = true; }
      if (event.key === " ") { spaceDown = false; modifierChanged = true; }
      if (modifierChanged) refreshModifierUi(event);
      if (event.key === "\\") { showOriginalOnResult = false; schedulePreview(0); }
    });
    root.addEventListener("resize", () => {
      if (!dialog.open) return;
      requestAnimationFrame(() => { setupFloatingPanels(); applyViewZoom(); });
    });


    colorInput.value = brush.color;
    backgroundColorInput.value = backgroundColor;
    renderTools();
    renderToolOptions();
    applyLanguage();
    syncUndoButtons();
    updateBrushRingStyle();
    updateCanvasCursor();

    return Object.freeze({
      open: openDialog,
      close: closeDialog,
      dispose() {
        clearTimeout(previewTimer);
        clearTimeout(brushSizeTimer);
        if (brushRingFrame) cancelAnimationFrame(brushRingFrame);
        sourceBitmap?.close?.();
        if (thumbUrl) URL.revokeObjectURL(thumbUrl);
        brushRing.remove();
        dialog.remove();
      },
      hasDocument: () => Boolean(source),
    });
  }

  root.SpeechBubbleQuickRetouch = Object.freeze({ create, version: BUILD_VERSION });
})(typeof globalThis !== "undefined" ? globalThis : this);
