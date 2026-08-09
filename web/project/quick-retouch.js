(function (root) {
  "use strict";

  const core = root.SpeechBubbleQuickRetouchCore;
  if (!core) throw new Error("SpeechBubbleQuickRetouchCore must be loaded first");

  const BUILD_VERSION = "0.7.10";
  const PREVIEW_LONG_EDGE = 920;
  const GEOMETRY_KEY = "speech-bubble-editor:quick-retouch-geometry:v2";
  const SETTINGS_KEY = "speech-bubble-editor:quick-retouch-settings:v5";
  const PANEL_GEOMETRY_KEY = "speech-bubble-editor:quick-retouch-panels:v1";
  const MAX_HISTORY_BYTES = 512 * 1024 * 1024;
  const MAX_HISTORY_STEPS = 32;
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
        settings: {
          hue: 0,
          saturation: 0,
          lightness: 0,
          colorize: false,
          targetColor: "master",
          targetWidth: 30,
          targetSoftness: 30,
          targetSamples: [],
          targetExcluded: [],
        },
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
        <div class="quick-retouch-source-bar" data-retouch-action="toggle-source-picker" title="${tr("画像候補を開く／閉じる", "Open / close image sources")}">
          <div class="quick-retouch-source-thumb" data-retouch-source-thumb></div>
          <div><strong data-retouch-source-name>${tr("画像を選択してください", "Select an image")}</strong><small data-retouch-source-info></small></div>
          <button type="button" data-retouch-action="toggle-source-picker"></button>
        </div>
        <section class="quick-retouch-source-picker" data-retouch-source-picker hidden>
          <div class="quick-retouch-source-candidates" data-retouch-candidates></div>
          <div class="quick-retouch-source-drop" data-retouch-source-drop>
            <span>${tr("PNG / JPEG / WebPをドロップ", "Drop PNG / JPEG / WebP")}</span>
            <button type="button" data-retouch-action="choose-file"></button>
          </div>
          <input data-retouch-file type="file" accept="image/png,image/jpeg,image/webp" hidden>
        </section>
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
              <button type="button" data-retouch-action="fit-view"></button>
              <button type="button" data-retouch-action="zoom-out" title="${tr("縮小", "Zoom out")}">−</button>
              <select data-retouch-zoom aria-label="${tr("ズーム", "Zoom")}"><option value="0.25">25%</option><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option><option value="1.5">150%</option><option value="2">200%</option></select>
              <button type="button" data-retouch-action="zoom-in" title="${tr("拡大", "Zoom in")}">＋</button>
              <button type="button" data-retouch-action="hold-original"></button>
              <div class="quick-retouch-compare-buttons" role="group" aria-label="${tr("比較表示", "Compare view")}">
                <span>${tr("比較", "Compare")}</span>
                <button type="button" data-retouch-compare-mode="none"></button>
                <button type="button" data-retouch-compare-mode="vertical"></button>
                <button type="button" data-retouch-compare-mode="horizontal"></button>
              </div>
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
                <div class="quick-retouch-layer-controls" data-retouch-layer-controls></div>
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
    const sourcePicker = dialog.querySelector("[data-retouch-source-picker]");
    const sourceCandidatesHost = dialog.querySelector("[data-retouch-candidates]");
    const sourceDrop = dialog.querySelector("[data-retouch-source-drop]");
    const fileInput = dialog.querySelector("[data-retouch-file]");
    const status = dialog.querySelector("[data-retouch-status]");
    const applyButton = dialog.querySelector('[data-retouch-action="apply"]');
    const propertiesHost = dialog.querySelector("[data-retouch-properties]");
    const layerList = dialog.querySelector("[data-retouch-layer-list]");
    const layerControlsHost = dialog.querySelector("[data-retouch-layer-controls]");
    const propertiesPanel = dialog.querySelector('[data-retouch-panel="properties"]');
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
    let baseCanvas = null;
    let sourceImageData = null;
    let baseLayerState = { visible: true, locked: false };
    let selectionCanvas = null;
    let layers = [];
    let activeTarget = { kind: "paint", layerId: "" };
    let activeTool = "brush";
    let previewData = null;
    let previewTimer = null;
    let previewRevision = 0;
    let showOriginalOnResult = false;
    let compareMode = "none";
    let compareSplit = 0.5;
    let selectionDisplay = "overlay";
    let lastVisibleSelectionDisplay = "overlay";
    let selectionOperation = "replace";
    let selectionFeather = 0;
    let selectionModifyRadius = 1;
    let wandTolerance = 30;
    let wandContiguous = true;
    let wandSampleMerged = true;
    let wandAntialias = true;
    let colorRangeTolerance = 15;
    let colorRangeContiguous = false;
    let colorRangeSampleMerged = true;
    let colorRangeSamples = [];
    let colorRangeSeedPoint = null;
    let colorSampleMode = "replace";
    let colorRangeExcluded = [];
    let pendingColorRangeMask = null;
    let colorRangeBaseSelection = null;
    let colorRangeOperation = "replace";
    let colorRangeRecalcTimer = 0;
    let colorRangeRecalcGeneration = 0;
    let shapeSelectionMode = "rectangle";
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
    let sourceCandidateUrls = [];
    let quickMaskReturnTarget = null;
    let dragState = null;
    let curveDrag = null;
    let lastRenderMs = 0;
    let hueSampleMode = "";
    let savedActiveTool = "brush";
    let savedActiveTargetKind = "paint";
    let initialDocumentSnapshot = null;

    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      brush = { ...brush, ...(saved.brush || {}) };
      selectionDisplay = ["boundary", "overlay", "hidden"].includes(saved.selectionDisplay) ? saved.selectionDisplay : selectionDisplay;
      if (selectionDisplay !== "hidden") lastVisibleSelectionDisplay = selectionDisplay;
      backgroundColor = /^#[0-9a-f]{6}$/i.test(saved.backgroundColor || "") ? saved.backgroundColor : backgroundColor;
      wandContiguous = saved.wandContiguous !== false;
      wandSampleMerged = saved.wandSampleMerged !== false;
      wandAntialias = saved.wandAntialias !== false;
      wandTolerance = core.clamp(saved.wandTolerance ?? wandTolerance, 0, 100);
      colorRangeTolerance = core.clamp(saved.colorRangeTolerance === 30 && saved.colorRangeToleranceDefaultMigrated !== true ? 15 : saved.colorRangeTolerance ?? colorRangeTolerance, 0, 100);
      colorRangeContiguous = saved.colorRangeContiguous === true;
      colorRangeSampleMerged = saved.colorRangeSampleMerged !== false;
      shapeSelectionMode = ["rectangle", "ellipse"].includes(saved.shapeSelectionMode) ? saved.shapeSelectionMode : shapeSelectionMode;
      savedActiveTool = ["brush", "eraser", "eyedropper", "rectangle", "lasso", "wand", "color_range", "hand", "zoom"].includes(saved.activeTool) ? saved.activeTool : savedActiveTool;
      savedActiveTargetKind = ["paint", "base"].includes(saved.activeTargetKind) ? saved.activeTargetKind : savedActiveTargetKind;
    } catch {}

    function saveSettings() {
      savedActiveTool = activeTool;
      savedActiveTargetKind = activeTarget.kind === "base" ? "base" : "paint";
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({
          brush,
          selectionDisplay,
          backgroundColor,
          wandTolerance,
          wandContiguous,
          wandSampleMerged,
          wandAntialias,
          colorRangeTolerance,
          colorRangeToleranceDefaultMigrated: true,
          colorRangeContiguous,
          colorRangeSampleMerged,
          shapeSelectionMode,
          activeTool,
          activeTargetKind: activeTarget.kind === "base" ? "base" : "paint",
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
      if (activeTarget.kind === "base") return baseLayerState.locked ? null : baseCanvas;
      const layer = activeLayer();
      if (activeTarget.kind === "paint" && layer?.type === "paint") return layer.canvas;
      if (activeTarget.kind === "mask" && layer?.type === "adjustment") return layer.mask;
      return null;
    }

    function activeIsMask() {
      return activeTarget.kind === "selection" || activeTarget.kind === "mask";
    }

    function transparentPixels(width, height) {
      return new Uint8ClampedArray(Math.max(0, width * height * 4));
    }

    function effectiveSelectionMask() {
      if (!source) return null;
      const selected = selectionCanvas ? maskData(selectionCanvas) : core.createMask(source.width, source.height, 0);
      return core.maskHasSelection(selected) ? selected : core.createMask(source.width, source.height, 255);
    }

    function basePixelsScaled(width, height) {
      if (!baseLayerState.visible || !baseCanvas) return transparentPixels(width, height);
      return imageDataScaled(baseCanvas, width, height).data;
    }

    function renderedReferenceImageData(fullResolution = true) {
      if (!source || !baseCanvas) return sourceImageData;
      const width = fullResolution ? source.width : previewDimensions().width;
      const height = fullResolution ? source.height : previewDimensions().height;
      const base = basePixelsScaled(width, height);
      const payload = [];
      const masks = new Map();
      for (const layer of layers) {
        if (layer.type === "paint") {
          payload.push({ id: layer.id, type: "paint", visible: layer.visible, opacity: layer.opacity, pixels: imageDataScaled(layer.canvas, width, height).data });
        } else {
          payload.push({ id: layer.id, type: "adjustment", adjustmentType: layer.adjustmentType, visible: layer.visible, opacity: layer.opacity, settings: JSON.parse(JSON.stringify(layer.settings)) });
          masks.set(layer.id, maskScaled(layer.mask, width, height));
        }
      }
      return new ImageData(core.renderStack(base, payload, masks), width, height);
    }

    function activeReferenceImageData(merged = false) {
      if (merged) return renderedReferenceImageData(true);
      if (activeTarget.kind === "base" && baseCanvas) return baseCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, source.width, source.height);
      const layer = activeLayer();
      if (layer?.type === "paint") return layer.canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, source.width, source.height);
      return baseCanvas?.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, source.width, source.height) || sourceImageData;
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
        resultContext.beginPath();
        if (pointerState.shape === "ellipse") resultContext.ellipse(x + width / 2, y + height / 2, Math.max(0.5, width / 2), Math.max(0.5, height / 2), 0, 0, Math.PI * 2);
        else resultContext.rect(x, y, width, height);
        resultContext.fillStyle = "rgba(60,145,255,.16)";
        resultContext.fill();
        resultContext.lineWidth = 3.5;
        resultContext.strokeStyle = "rgba(8,18,28,.9)";
        resultContext.stroke();
        resultContext.lineWidth = 1.5;
        resultContext.strokeStyle = "#d9f0ff";
        resultContext.stroke();
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
      const isQuickMask = activeTarget.kind === "selection";
      const isColorRangePreview = Boolean(pendingColorRangeMask);
      const mask = isColorRangePreview
        ? scaleMaskArray(pendingColorRangeMask, source.width, source.height, size.width, size.height)
        : maskScaled(isLayerMask ? activeLayer()?.mask : selectionCanvas, size.width, size.height);
      if (!mask) return;
      const hasMask = core.maskHasSelection(mask);
      if (selectionDisplay === "boundary" && !isLayerMask && !isColorRangePreview && !isQuickMask) {
        if (hasMask) drawSelectionBoundary(mask, size.width, size.height);
        return;
      }
      if (!hasMask && !isQuickMask) return;
      const overlay = resultContext.createImageData(size.width, size.height);
      for (let index = 0, offset = 0; index < mask.length; index += 1, offset += 4) {
        const selectedAmount = mask[index] / 255;
        const amount = isQuickMask ? 1 - selectedAmount : selectedAmount;
        if (amount <= 0) continue;
        overlay.data[offset] = isQuickMask ? 232 : isLayerMask ? 236 : isColorRangePreview ? 130 : 48;
        overlay.data[offset + 1] = isQuickMask ? 52 : isLayerMask ? 68 : isColorRangePreview ? 82 : 145;
        overlay.data[offset + 2] = isQuickMask ? 66 : isLayerMask ? 132 : 255;
        overlay.data[offset + 3] = Math.round(amount * (isQuickMask ? 92 : isLayerMask ? 92 : isColorRangePreview ? 104 : 76));
      }
      const overlayCanvas = createCanvas(size.width, size.height);
      overlayCanvas.getContext("2d").putImageData(overlay, 0, 0);
      resultContext.drawImage(overlayCanvas, 0, 0);
      if (!isLayerMask && !isQuickMask && hasMask) drawSelectionBoundary(mask, size.width, size.height, isColorRangePreview ? "color-range" : "selection");
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
      const value = String(Number(scale.toFixed(4)));
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
      const edited = core.renderStack(basePixelsScaled(size.width, size.height), payload, masks);
      let output = edited;
      if (showOriginalOnResult) output = new Uint8ClampedArray(original.data);
      else if (compareMode === "vertical") {
        output = new Uint8ClampedArray(edited);
        const splitX = Math.round(size.width * compareSplit);
        for (let y = 0; y < size.height; y += 1) {
          const end = (y * size.width + splitX) * 4;
          const start = y * size.width * 4;
          output.set(original.data.subarray(start, end), start);
        }
      } else if (compareMode === "horizontal") {
        output = new Uint8ClampedArray(edited);
        const splitY = Math.round(size.height * compareSplit);
        const end = splitY * size.width * 4;
        output.set(original.data.subarray(0, end), 0);
      }
      previewData = new ImageData(output, size.width, size.height);
      resultContext.putImageData(previewData, 0, 0);
      drawSelectionOverlay();
      drawInteractionGuides();
      lastRenderMs = performance.now() - started;
      dialog.querySelector("[data-retouch-hud]").textContent = `${source.width}×${source.height} · ${Math.round(size.width / source.width * 100)}% · ${Math.round(lastRenderMs)} ms`;
      compareDivider.hidden = compareMode === "none";
      compareDivider.classList.toggle("horizontal", compareMode === "horizontal");
      compareDivider.style.left = compareMode === "vertical" ? `${compareSplit * 100}%` : "0";
      compareDivider.style.top = compareMode === "horizontal" ? `${compareSplit * 100}%` : "0";
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
      baseCanvas = cloneCanvas(sourceCanvas);
      baseLayerState = { visible: true, locked: false };
      selectionCanvas = maskCanvas(source.width, source.height, 0);
      layers = [];
      activeTarget = { kind: "paint", layerId: "" };
      history = [];
      redo = [];
      colorRangeSamples = [];
      colorRangeSeedPoint = null;
      colorRangeExcluded = [];
      pendingColorRangeMask = null;
      hueSampleMode = "";
      showOriginalOnResult = false;
      compareMode = "none";
      compareSplit = 0.5;
      viewZoom = "fit";
      lassoPoints = [];
      lastDeselectedSelection = null;
      resetViewPan();
      if (thumbUrl) URL.revokeObjectURL(thumbUrl);
      thumbUrl = URL.createObjectURL(next.blob);
      sourceThumb.style.backgroundImage = `url("${thumbUrl}")`;
      if (sourcePicker) sourcePicker.hidden = true;
      dialog.querySelector("[data-retouch-source-name]").textContent = source.name;
      dialog.querySelector("[data-retouch-source-info]").textContent = `${source.width} × ${source.height}px`;
      dialog.querySelector("[data-retouch-document]").textContent = `${source.name} · ${source.width}×${source.height}`;
      const originalSizeLabel = dialog.querySelector("[data-retouch-original-size]");
      if (originalSizeLabel) originalSizeLabel.textContent = `${source.width} × ${source.height}px`;
      applyButton.disabled = false;
      const initialPaint = addPaintLayer(false);
      activeTarget = savedActiveTargetKind === "base"
        ? { kind: "base", layerId: "" }
        : { kind: "paint", layerId: initialPaint?.id || "" };
      activeTool = savedActiveTool;
      lastDeselectedSelection = null;
      initialDocumentSnapshot = snapshotState();
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

    function clearSourceCandidateUrls() {
      sourceCandidateUrls.forEach((url) => URL.revokeObjectURL(url));
      sourceCandidateUrls = [];
    }

    async function showSourcePicker(forceOpen = false) {
      if (!sourcePicker) return;
      sourcePicker.hidden = forceOpen ? false : !sourcePicker.hidden;
      if (sourcePicker.hidden) return;
      clearSourceCandidateUrls();
      sourceCandidatesHost.replaceChildren();
      const candidates = await sourceCandidates();
      for (const candidate of candidates) {
        if (!candidate?.blob) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.className = `quick-retouch-source-candidate${candidate.selected ? " selected" : ""}`;
        const url = URL.createObjectURL(candidate.blob);
        sourceCandidateUrls.push(url);
        button.innerHTML = `<img alt=""><span></span><small></small>`;
        button.querySelector("img").src = url;
        button.querySelector("span").textContent = sourceDisplayName(candidate.name);
        button.querySelector("small").textContent = candidate.width && candidate.height ? `${candidate.width}×${candidate.height}` : "";
        button.onclick = async (event) => { event.stopPropagation(); await setSource(candidate); };
        sourceCandidatesHost.append(button);
      }
      if (!sourceCandidatesHost.children.length) {
        const empty = document.createElement("p");
        empty.textContent = currentMode() === "comic"
          ? tr("ページ画像・画像トレイから選ぶか、画像ファイルを読み込んでください。", "Choose a Page Image / Image Tray item, or load an image file.")
          : tr("一枚画像を読み込んでください。", "Load a Single Image.");
        sourceCandidatesHost.append(empty);
      }
    }

    async function refreshSource() {
      const candidates = await sourceCandidates();
      const selected = candidates.find((item) => item.selected) || candidates[0];
      if (selected) return setSource(selected);
      setStatus(tr("画像を選択するか、画像ファイルを読み込んでください。", "Select an image or load an image file."), "error");
      applyButton.disabled = true;
      dialog.querySelector("[data-retouch-source-name]").textContent = tr("画像を選択してください", "Select an image");
      dialog.querySelector("[data-retouch-source-info]").textContent = "";
      await showSourcePicker(true);
      return false;
    }

    function layerCanvasSnapshot(layer) {
      if (layer.type === "paint") {
        return { canvas: layer.canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, layer.canvas.width, layer.canvas.height).data.slice() };
      }
      return { mask: maskData(layer.mask) };
    }

    function snapshotBytes(snapshot) {
      let total = (snapshot.selection?.byteLength || 0) + (snapshot.base?.byteLength || 0);
      total += snapshot.lastDeselectedSelection?.byteLength || 0;
      total += snapshot.pendingColorRangeMask?.byteLength || 0;
      for (const layer of snapshot.layers || []) total += layer.canvas?.byteLength || layer.mask?.byteLength || 0;
      return total;
    }

    function snapshotState() {
      return {
        selection: maskData(selectionCanvas),
        base: baseCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, source.width, source.height).data.slice(),
        baseLayerState: { ...baseLayerState },
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
        activeTool,
        selectionDisplay,
        lastVisibleSelectionDisplay,
        selectionOperation,
        lastDeselectedSelection: lastDeselectedSelection ? new Uint8ClampedArray(lastDeselectedSelection) : null,
        colorRangeSamples: colorRangeSamples.map((sample) => ({ ...sample })),
        colorRangeExcluded: colorRangeExcluded.map((sample) => ({ ...sample })),
        colorRangeSeedPoint: colorRangeSeedPoint ? { ...colorRangeSeedPoint } : null,
        pendingColorRangeMask: pendingColorRangeMask ? new Uint8ClampedArray(pendingColorRangeMask) : null,
        colorRangeBaseSelection: colorRangeBaseSelection ? new Uint8ClampedArray(colorRangeBaseSelection) : null,
        colorRangeOperation,
        colorSampleMode,
        hueSampleMode,
        brush: { ...brush },
        backgroundColor,
        viewZoom,
        viewPanX,
        viewPanY,
        showOriginalOnResult,
        compareMode,
        compareSplit,
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
        baseCanvas.getContext("2d", { willReadFrequently: true }).putImageData(
          new ImageData(new Uint8ClampedArray(snapshot.base), source.width, source.height),
          0,
          0,
        );
        baseLayerState = { visible: true, locked: false, ...(snapshot.baseLayerState || {}) };
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
        activeTool = snapshot.activeTool || "brush";
        selectionDisplay = ["boundary", "overlay", "hidden"].includes(snapshot.selectionDisplay) ? snapshot.selectionDisplay : "overlay";
        lastVisibleSelectionDisplay = ["boundary", "overlay"].includes(snapshot.lastVisibleSelectionDisplay) ? snapshot.lastVisibleSelectionDisplay : "overlay";
        selectionOperation = core.normalizeSelectionOperation(snapshot.selectionOperation);
        lastDeselectedSelection = snapshot.lastDeselectedSelection ? new Uint8ClampedArray(snapshot.lastDeselectedSelection) : null;
        colorRangeSamples = (snapshot.colorRangeSamples || []).map((sample) => ({ ...sample }));
        colorRangeExcluded = (snapshot.colorRangeExcluded || []).map((sample) => ({ ...sample }));
        colorRangeSeedPoint = snapshot.colorRangeSeedPoint ? { ...snapshot.colorRangeSeedPoint } : null;
        pendingColorRangeMask = snapshot.pendingColorRangeMask ? new Uint8ClampedArray(snapshot.pendingColorRangeMask) : null;
        colorRangeBaseSelection = snapshot.colorRangeBaseSelection ? new Uint8ClampedArray(snapshot.colorRangeBaseSelection) : null;
        colorRangeOperation = core.normalizeSelectionOperation(snapshot.colorRangeOperation);
        colorSampleMode = snapshot.colorSampleMode || "replace";
        hueSampleMode = snapshot.hueSampleMode || "";
        brush = { ...brush, ...(snapshot.brush || {}) };
        backgroundColor = snapshot.backgroundColor || backgroundColor;
        viewZoom = snapshot.viewZoom ?? "fit";
        viewPanX = Number(snapshot.viewPanX) || 0;
        viewPanY = Number(snapshot.viewPanY) || 0;
        showOriginalOnResult = snapshot.showOriginalOnResult === true;
        compareMode = ["none", "vertical", "horizontal"].includes(snapshot.compareMode) ? snapshot.compareMode : "none";
        compareSplit = core.clamp(snapshot.compareSplit ?? 0.5, 0.05, 0.95);
        colorInput.value = brush.color;
        backgroundColorInput.value = backgroundColor;
        renderTools();
        renderSelectionPanel();
        renderLayers();
        renderProperties();
        renderToolOptions();
        dialog.querySelectorAll("[data-retouch-compare-mode]").forEach((button) => {
          button.classList.toggle("active", button.dataset.retouchCompareMode === compareMode);
          button.setAttribute("aria-pressed", String(button.dataset.retouchCompareMode === compareMode));
        });
        applyViewZoom();
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
      return effectiveSelectionMask();
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
      if (activeTarget.kind === "base") {
        setStatus(tr("ベース画像は削除できません。非表示またはロックできます。", "The Base Image cannot be deleted. Hide or lock it instead."), "info");
        return;
      }
      const layer = activeLayer();
      if (!layer) return;
      pushHistory();
      const index = layers.indexOf(layer);
      layers.splice(index, 1);
      let next = layers[Math.min(index, layers.length - 1)] || layers.at(-1) || null;
      if (!next) next = addPaintLayer(false);
      activeTarget = next
        ? { kind: next.type === "paint" ? "paint" : "adjustment", layerId: next.id }
        : { kind: "base", layerId: "" };
      renderLayers();
      renderProperties();
      schedulePreview();
    }
    function duplicateLayer() {
      if (activeTarget.kind === "base") {
        if (!baseCanvas) return;
        pushHistory();
        const copy = layerDefaults("paint");
        copy.name = tr("ベース画像 コピー", "Base Image copy");
        copy.canvas = cloneCanvas(baseCanvas);
        layers.unshift(copy);
        activeTarget = { kind: "paint", layerId: copy.id };
        renderLayers();
        renderProperties();
        schedulePreview();
        return;
      }
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
      const baseThumb = layerList.querySelector("[data-retouch-base-thumb]");
      if (baseThumb) {
        baseThumb.width = 80;
        baseThumb.height = 76;
        baseThumb.getContext("2d").drawImage(baseCanvas, 0, 0, baseThumb.width, baseThumb.height);
      }
    }
    function renderLayerControls() {
      if (!layerControlsHost) return;
      const layer = activeLayer();
      const editableLayer = layer && (activeTarget.kind === "paint" || activeTarget.kind === "adjustment" || activeTarget.kind === "mask");
      const opacity = editableLayer ? Math.round(layer.opacity * 100) : 100;
      layerControlsHost.innerHTML = `<label class="quick-retouch-layer-opacity-control"><span>${tr("不透明度", "Opacity")}</span><input type="range" min="0" max="100" step="1" value="${opacity}" data-retouch-layer-opacity ${editableLayer ? "" : "disabled"}><output>${opacity}%</output></label>`;
      const range = layerControlsHost.querySelector("[data-retouch-layer-opacity]");
      const output = layerControlsHost.querySelector("output");
      if (range && editableLayer) {
        range.addEventListener("pointerdown", beginControlHistory);
        range.addEventListener("input", () => {
          layer.opacity = core.clamp(Number(range.value) / 100, 0, 1);
          output.textContent = `${Math.round(layer.opacity * 100)}%`;
          schedulePreview(0);
        });
        range.addEventListener("change", () => { endControlHistory(); renderLayers(); });
      }
    }

    function renderLayers() {
      renderLayerControls();
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
          saveSettings();
          schedulePreview(0);
        });
        row.onclick = () => {
          activeTarget = { kind: targetKind, layerId: layer.id };
          renderLayers();
          renderProperties();
          renderToolOptions();
          saveSettings();
          schedulePreview(0);
        };
        layerList.append(row);
      }
      const baseRow = document.createElement("div");
      baseRow.className = `quick-retouch-layer-row base-layer${activeTarget.kind === "base" ? " active" : ""}`;
      baseRow.innerHTML = `<button type="button" class="quick-retouch-eye" data-retouch-base-visible aria-pressed="${String(baseLayerState.visible)}">${baseLayerState.visible ? "👁" : "·"}</button><canvas class="quick-retouch-layer-thumb" data-retouch-base-thumb></canvas><div><strong>${tr("ベース画像", "Base Image")}</strong><small>${tr("画像レイヤー", "Image layer")}</small></div><button type="button" class="quick-retouch-lock-button${baseLayerState.locked ? " active" : ""}" data-retouch-base-lock title="${baseLayerState.locked ? tr("ロックを解除", "Unlock") : tr("ロック", "Lock")}">${baseLayerState.locked ? "🔒" : "🔓"}</button>`;
      baseRow.querySelector("[data-retouch-base-visible]").onclick = (event) => {
        event.stopPropagation();
        pushHistory();
        baseLayerState.visible = !baseLayerState.visible;
        renderLayers();
        schedulePreview();
      };
      baseRow.querySelector("[data-retouch-base-lock]").onclick = (event) => {
        event.stopPropagation();
        pushHistory();
        baseLayerState.locked = !baseLayerState.locked;
        renderLayers();
        renderProperties();
        updateBrushRingStyle();
        setStatus(baseLayerState.locked
          ? tr("ベース画像をロックしました。", "Base Image locked.")
          : tr("ベース画像を編集可能にしました。", "Base Image is editable."), "ready");
      };
      baseRow.onclick = () => {
        activeTarget = { kind: "base", layerId: "" };
        renderLayers();
        renderProperties();
        renderToolOptions();
        saveSettings();
      };
      layerList.append(baseRow);
      dialog.querySelector("[data-retouch-layer-count]").textContent = `${layers.length + 1}`;
      dialog.querySelector('[data-retouch-action="delete-layer"]').disabled = activeTarget.kind === "base" || !activeLayer();
      dialog.querySelector('[data-retouch-action="duplicate-layer"]').disabled = activeTarget.kind !== "base" && !activeLayer();
      const active = activeLayer();
      const index = active ? layers.indexOf(active) : -1;
      dialog.querySelector('[data-retouch-action="move-layer-up"]').disabled = index < 0 || index >= layers.length - 1;
      dialog.querySelector('[data-retouch-action="move-layer-down"]').disabled = index <= 0;
      renderLayerThumbnails();
    }
    function controlMarkup(key, label, value, min, max, step = 1) {
      return `<label class="quick-retouch-field quick-retouch-field-${key}"><span>${label}</span><span class="quick-retouch-control"><input type="range" data-retouch-setting="${key}" min="${min}" max="${max}" step="${step}" value="${value}"><input type="number" data-retouch-setting-number="${key}" min="${min}" max="${max}" step="${step}" value="${value}"></span></label>`;
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
      const quickMask = activeTarget.kind === "selection";
      selectionHost.innerHTML = `
        <div class="quick-retouch-selection-summary">
          <button type="button" class="quick-retouch-eye" data-retouch-selection-visible aria-pressed="${String(visible)}">${visible ? "👁" : "·"}</button>
          <canvas class="quick-retouch-layer-thumb" data-retouch-selection-thumb></canvas>
          <div><strong>${hasSelection ? tr("選択範囲あり", "Selection active") : tr("選択範囲なし", "No selection")}</strong><small>${quickMask ? tr("クイックマスク編集中", "Editing Quick Mask") : visible ? tr("表示中", "Visible") : tr("表示は非表示・選択は保持", "Hidden visually; selection retained")}</small></div>
        </div>
        <div class="quick-retouch-button-row"><button type="button" data-retouch-selection-action="all">${tr("全選択", "Select All")}</button><button type="button" data-retouch-selection-action="none">${tr("解除", "Deselect")}</button><button type="button" data-retouch-selection-action="invert" ${hasSelection ? "" : "disabled"}>${tr("反転", "Invert")}</button></div>
        ${hasSelection ? `<div class="quick-retouch-segmented" data-retouch-selection-display-buttons><button type="button" data-selection-display="boundary">${tr("境界線", "Boundary")}</button><button type="button" data-selection-display="overlay">${tr("マスク", "Overlay")}</button><button type="button" data-selection-display="hidden">${tr("非表示", "Hidden")}</button></div>${controlMarkup("selectionFeather", tr("境界ぼかし（px）", "Feather (px)"), selectionFeather, 0, 40, 1)}${controlMarkup("selectionModifyRadius", tr("拡張・縮小量（px）", "Expand / contract amount"), selectionModifyRadius, 1, 32, 1)}<div class="quick-retouch-button-row two"><button type="button" data-retouch-selection-action="expand">${tr("拡張", "Expand")}</button><button type="button" data-retouch-selection-action="shrink">${tr("縮小", "Contract")}</button></div>` : ""}
        <button type="button" class="quick-retouch-wide-button${quickMask ? " active" : ""}" data-retouch-quick-mask>${quickMask ? tr("クイックマスクを終了 (Q)", "Exit Quick Mask (Q)") : tr("クイックマスク (Q)", "Quick Mask (Q)")}</button>
        <div class="quick-retouch-status-note">${tr("選択範囲は1つだけです。追加・削除・反転で整え、調整レイヤー作成時にその瞬間の選択がレイヤーマスクへコピーされます。", "There is one current selection. Refine it with add, subtract, or invert; creating an adjustment layer copies that selection into its layer mask.")}</div>`;
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
        <label>${tr("編集対象", "Target colors")}<select data-retouch-hs-target><option value="master">${tr("マスター", "Master")}</option><option value="red">${tr("赤系", "Reds")}</option><option value="yellow">${tr("黄色系", "Yellows")}</option><option value="green">${tr("緑系", "Greens")}</option><option value="cyan">${tr("シアン系", "Cyans")}</option><option value="blue">${tr("青系", "Blues")}</option><option value="magenta">${tr("マゼンタ系", "Magentas")}</option><option value="custom">${tr("画像から対象色を指定", "Pick Target Color from Image")}</option></select></label>
        <details class="quick-retouch-hs-advanced"><summary>${tr("対象色を詳細調整", "Advanced target color")}</summary><div class="quick-retouch-status-note">${tr("選択範囲は作成しません。画像から取得した色だけに色相・彩度の効果を適用します。", "This does not create a selection. Hue and Saturation affect only colors sampled from the image.")}</div><div class="quick-retouch-option-group quick-retouch-hs-sampler"><span>${tr("調整する色を取得", "Sample Adjustment Colors")}</span><div class="quick-retouch-segmented"><button type="button" data-retouch-hs-sample-mode="replace" class="${hueSampleMode === "replace" ? "active" : ""}">${tr("指定", "Set")}</button><button type="button" data-retouch-hs-sample-mode="add" class="${hueSampleMode === "add" ? "active" : ""}">${tr("色を追加", "Add Color")}</button><button type="button" data-retouch-hs-sample-mode="exclude" class="${hueSampleMode === "exclude" ? "active" : ""}">${tr("色を除外", "Exclude Color")}</button></div></div>
        <div class="quick-retouch-color-samples" data-retouch-hs-samples></div>
        ${controlMarkup("targetWidth", tr("色域幅", "Range width"), layer.settings.targetWidth ?? 30, 1, 90, 1)}
        ${controlMarkup("targetSoftness", tr("境界ぼかし", "Range softness"), layer.settings.targetSoftness ?? 30, 0, 90, 1)}</details>
        ${controlMarkup("hue", tr("色相", "Hue"), layer.settings.hue, -180, 180, 1)}
        ${controlMarkup("saturation", tr("彩度", "Saturation"), layer.settings.saturation, -100, 100, 1)}
        ${controlMarkup("lightness", tr("明度", "Lightness"), layer.settings.lightness, -100, 100, 1)}
        <label class="quick-retouch-check"><input type="checkbox" data-retouch-setting-check="colorize" ${layer.settings.colorize ? "checked" : ""}><span>${tr("色彩の統一", "Colorize")}</span></label>
        ${adjustmentMaskMarkup()}`;
      propertiesHost.querySelector("[data-retouch-hs-target]").value = layer.settings.targetColor || "master";
      renderHueTargetSamples(layer);
    }

    function renderHueTargetSamples(layer) {
      const host = propertiesHost.querySelector("[data-retouch-hs-samples]");
      if (!host) return;
      host.replaceChildren();
      const append = (hue, excluded = false) => {
        const node = document.createElement("span");
        node.className = `quick-retouch-color-sample${excluded ? " excluded" : ""}`;
        node.style.background = `hsl(${Math.round(Number(hue) || 0)} 85% 55%)`;
        node.title = excluded ? tr("除外する色相", "Excluded hue") : tr("対象に含める色相", "Included hue");
        host.append(node);
      };
      (layer.settings.targetSamples || []).forEach((hue) => append(hue, false));
      (layer.settings.targetExcluded || []).forEach((hue) => append(hue, true));
    }

    function renderBrightnessProperties(layer) {
      propertiesHost.innerHTML = `
        ${controlMarkup("brightness", tr("明るさ", "Brightness"), layer.settings.brightness, -100, 100, 1)}
        ${controlMarkup("contrast", tr("コントラスト", "Contrast"), layer.settings.contrast, -100, 100, 1)}
        ${controlMarkup("gamma", tr("ガンマ", "Gamma"), layer.settings.gamma, 0.2, 3, 0.01)}
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
        if (propertiesPanel) propertiesPanel.hidden = true;
        return;
      }
      const layer = activeLayer();
      if (layer?.adjustmentType !== "hue_saturation") hueSampleMode = "";
      const shouldShow = activeTarget.kind === "mask" || (activeTarget.kind === "adjustment" && layer?.type === "adjustment");
      const propertiesToggle = dialog.querySelector('[data-retouch-panel-toggle="properties"]');
      if (propertiesToggle) propertiesToggle.disabled = !shouldShow;
      if (propertiesPanel) propertiesPanel.hidden = !shouldShow;
      if (!shouldShow) { propertiesHost.innerHTML = ""; return; }
      dialog.querySelector("[data-retouch-properties-title]").textContent = activeTarget.kind === "mask"
        ? tr("レイヤーマスク", "Layer Mask")
        : layer?.name || tr("プロパティ", "Properties");
      if (activeTarget.kind === "mask") renderPaintProperties(layer, true);
      else if (layer?.adjustmentType === "hue_saturation") renderHueProperties(layer);
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
      if (key === "targetWidth" || key === "targetSoftness") return core.clamp(value, key === "targetWidth" ? 1 : 0, 90);
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
      else if (key === "colorRangeTolerance") { colorRangeTolerance = value; recalculateColorRange({ preview: true }); }
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
      if (action !== "none" && pendingColorRangeMask) clearColorRangeState(true);
      let selection = maskData(selectionCanvas);
      if (action === "reselect") {
        if (!lastDeselectedSelection || lastDeselectedSelection.length !== selection.length) {
          setStatus(tr("再選択できる選択範囲がありません。", "There is no previous selection to reselect."), "info");
          return;
        }
        pushHistory();
        selection = new Uint8ClampedArray(lastDeselectedSelection);
      } else {
        if (action === "invert" && !core.maskHasSelection(selection)) {
          setStatus(tr("反転する選択範囲がありません。", "There is no selection to invert."), "info");
          return;
        }
        pushHistory();
        if (action === "all") selection.fill(255);
        else if (action === "none") {
          if (core.maskHasSelection(selection)) lastDeselectedSelection = selection.slice();
          selection.fill(0);
          clearColorRangeState(true);
          setStatus(tr("選択範囲と色域選択候補を解除しました。", "Selection and Color Range preview were cleared."), "info");
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

    function toggleQuickMask() {
      if (!source) return;
      if (activeTarget.kind === "selection") {
        activeTarget = quickMaskReturnTarget || { kind: "paint", layerId: layers.find((layer) => layer.type === "paint")?.id || "" };
        quickMaskReturnTarget = null;
        setStatus(tr("クイックマスクを終了しました。", "Quick Mask closed."), "ready");
      } else {
        quickMaskReturnTarget = { ...activeTarget };
        activeTarget = { kind: "selection", layerId: "" };
        activeTool = "brush";
        selectionDisplay = "overlay";
        lastVisibleSelectionDisplay = "overlay";
        setStatus(tr("クイックマスク：赤い部分は選択外です。ブラシで選択へ追加、消しゴムで削除します。", "Quick Mask: red areas are outside the selection. Brush adds; Eraser subtracts."), "ready");
      }
      renderTools();
      renderToolOptions();
      renderLayers();
      renderProperties();
      renderSelectionPanel();
      schedulePreview(0);
    }

    function bindSelectionPanelEvents() {
      selectionHost.querySelector("[data-retouch-selection-visible]")?.addEventListener("click", () => {
        if (selectionDisplay === "hidden") selectionDisplay = lastVisibleSelectionDisplay || "overlay";
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
      selectionHost.querySelector("[data-retouch-quick-mask]")?.addEventListener("click", toggleQuickMask);
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
      propertiesHost.querySelector("[data-retouch-hs-target]")?.addEventListener("change", (event) => {
        const layer = activeLayer();
        if (!layer?.settings) return;
        pushHistory();
        layer.settings.targetColor = event.target.value;
        if (event.target.value !== "custom") {
          layer.settings.targetSamples = [];
          layer.settings.targetExcluded = [];
        }
        hueSampleMode = "";
        renderProperties();
        updateCanvasCursor();
        schedulePreview(0);
      });
      propertiesHost.querySelectorAll("[data-retouch-hs-sample-mode]").forEach((button) => {
        button.onclick = () => {
          const next = button.dataset.retouchHsSampleMode;
          hueSampleMode = hueSampleMode === next ? "" : next;
          renderProperties();
          updateCanvasCursor();
        };
      });
      propertiesHost.querySelector("[data-retouch-color-range='apply']")?.addEventListener("click", applyColorRange);
      propertiesHost.querySelector("[data-retouch-color-range='clear']")?.addEventListener("click", () => {
        clearColorRangeState(true);
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

    const freehandLassoIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 6.5c2.8-3 8.9-2.8 11.9.1 3.2 3.1 1.7 8.2-2.2 10-4.2 1.9-10.2.3-11.1-3.7-.7-3.1 2.1-5.1 5.2-4.5 2.7.5 3.5 3.4 1.8 5.2-1.1 1.2-3.2 1.2-4.2-.1"/><path d="M7 19c1.2-.7 2.5-.7 3.7.1"/></svg>';
    const rectangleSelectionIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx=".5" stroke-dasharray="3 2"/></svg>';
    const ellipseSelectionIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="8" ry="6.5" stroke-dasharray="3 2"/></svg>';

    function closeShapeSelectionMenu() { dialog.querySelector(".quick-retouch-shape-menu")?.setAttribute("hidden", ""); }
    function openShapeSelectionMenu(anchor) {
      let menu = dialog.querySelector(".quick-retouch-shape-menu");
      if (!menu) {
        menu = document.createElement("div");
        menu.className = "quick-retouch-shape-menu";
        menu.innerHTML = `<button type="button" data-shape-selection="rectangle">${tr("長方形選択", "Rectangle Select")}</button><button type="button" data-shape-selection="ellipse">${tr("楕円形選択", "Ellipse Select")}</button>`;
        menu.addEventListener("click", (event) => {
          const button = event.target.closest("[data-shape-selection]");
          if (!button) return;
          shapeSelectionMode = button.dataset.shapeSelection;
          closeShapeSelectionMenu();
          activateTool("rectangle");
        });
        dialog.append(menu);
      }
      menu.querySelectorAll("[data-shape-selection]").forEach((button) => button.classList.toggle("active", button.dataset.shapeSelection === shapeSelectionMode));
      menu.hidden = false;
      const rect = anchor.getBoundingClientRect();
      menu.style.left = `${Math.min(rect.right + 5, root.innerWidth - menu.offsetWidth - 8)}px`;
      menu.style.top = `${Math.min(rect.top, root.innerHeight - menu.offsetHeight - 8)}px`;
    }

    function toolDefinitions() {
      return [
        { group: tr("描画", "Paint") },
        { id: "brush", icon: "🖌", label: tr("ブラシ", "Brush"), key: "B" },
        { id: "eraser", icon: "▰", label: tr("消しゴム", "Eraser"), key: "E" },
        { id: "eyedropper", icon: "⌞", label: tr("描画色スポイト", "Paint Color Eyedropper"), key: "I" },
        { group: tr("選択", "Selection") },
        { id: "lasso", icon: freehandLassoIcon, label: tr("投げ縄選択", "Freehand Lasso"), key: "L" },
        { id: "rectangle", icon: shapeSelectionMode === "ellipse" ? ellipseSelectionIcon : rectangleSelectionIcon, label: shapeSelectionMode === "ellipse" ? tr("楕円形選択", "Ellipse Select") : tr("長方形選択", "Rectangle Select"), key: "M", flyout: true },
        { id: "wand", icon: "✦", label: tr("自動選択", "Magic Wand"), key: "W" },
        { id: "color_range", icon: "◎", label: tr("色から選択", "Select by Color"), key: "U" },
        { group: tr("表示", "View") },
        { id: "hand", icon: "✋", label: tr("手のひら", "Hand"), key: "H" },
        { id: "zoom", icon: "🔍", label: tr("ズーム", "Zoom"), key: "Z" },
      ];
    }

    function activateTool(id) {
      activeTool = id;
      hueSampleMode = "";
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
      saveSettings();
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
        if (definition.flyout) {
          button.classList.add("has-flyout");
          let holdTimer = 0;
          let held = false;
          button.onpointerdown = (event) => { if (event.button === 0) holdTimer = root.setTimeout(() => { held = true; openShapeSelectionMenu(button); }, 420); };
          const cancelHold = () => { clearTimeout(holdTimer); holdTimer = 0; };
          button.onpointerup = cancelHold;
          button.onpointercancel = cancelHold;
          button.onpointerleave = cancelHold;
          button.oncontextmenu = (event) => { event.preventDefault(); cancelHold(); openShapeSelectionMenu(button); };
          button.onclick = () => { if (held) { held = false; return; } closeShapeSelectionMenu(); activateTool(definition.id); };
        } else button.onclick = () => { closeShapeSelectionMenu(); activateTool(definition.id); };
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
        ["intersect", tr("絞り込み", "Refine")],
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
          ${mask ? `<span class="quick-retouch-option-note">${tr("マスク編集：ブラシで追加、消しゴムで削除", "Mask edit: brush adds, eraser removes")}</span>` : activeTool === "brush" ? `<label class="quick-retouch-option-color quick-retouch-drawing-color"><span>${tr("描画色", "Color")}</span><input type="color" data-tool-color value="${brush.color}"></label>` : ""}`;
      } else if (activeTool === "eyedropper") {
        toolOptionsHost.innerHTML = `<strong>${tr("描画色スポイト", "Paint Color Eyedropper")}</strong><span class="quick-retouch-option-note">${tr("クリックした色をブラシの描画色に設定します。Alt＋クリックでも一時的に使用できます。", "Click to set the brush foreground color. Alt-click also samples temporarily.")}</span>`;
      } else if (["rectangle", "lasso", "wand", "color_range"].includes(activeTool)) {
        toolOptionsHost.innerHTML = `<strong>${({rectangle:shapeSelectionMode === "ellipse" ? tr("楕円形選択", "Ellipse Select") : tr("長方形選択", "Rectangle Select"),lasso:tr("投げ縄選択", "Freehand Lasso"),wand:tr("自動選択（魔法の杖）", "Magic Wand"),color_range:tr("色から選択", "Select by Color")})[activeTool]}</strong>
          ${selectionOperationMarkup()}
          ${compactOption("selectionFeather", tr("ぼかし", "Feather"), selectionFeather, 0, 40, 1, " px")}
          ${activeTool === "wand" ? `${compactOption("wandTolerance", tr("許容値", "Tolerance"), wandTolerance, 0, 100, 1)}<label class="quick-retouch-option-check"><input type="checkbox" data-tool-check="wandContiguous" ${wandContiguous ? "checked" : ""}><span>${tr("隣接部分のみ", "Contiguous")}</span></label><label class="quick-retouch-option-check" title="${tr("表示レイヤーの合成結果を参照", "Sample the visible merged result")}"><input type="checkbox" data-tool-check="wandSampleMerged" ${wandSampleMerged ? "checked" : ""}><span>${tr("表示参照", "Merged")}</span></label><label class="quick-retouch-option-check" title="${tr("選択境界のギザギザを滑らかにします", "Smooths jagged selection edges")}"><input type="checkbox" data-tool-check="wandAntialias" ${wandAntialias ? "checked" : ""}><span>Anti-alias</span></label>` : ""}
          ${activeTool === "color_range" ? `${compactOption("colorRangeTolerance", tr("許容範囲", "Tolerance"), colorRangeTolerance, 0, 100, 1)}<label class="quick-retouch-option-check" title="${tr("表示レイヤーの合成結果を参照", "Sample the visible merged result")}"><input type="checkbox" data-tool-check="colorRangeSampleMerged" ${colorRangeSampleMerged ? "checked" : ""}><span>${tr("表示参照", "Merged")}</span></label><span class="quick-retouch-option-note">${tr("画像をクリックすると選択へ即時反映します。", "Click the image to update the selection immediately.")}</span>` : ""}
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
        let wheelCommitTimer = 0;
        control.onpointerdown = beginControlHistory;
        control.oninput = () => {
          applySetting(key, control.value);
          const output = toolOptionsHost.querySelector(`[data-tool-output="${key}"]`);
          if (output) output.textContent = `${control.value}${["brushSize", "selectionFeather"].includes(key) ? " px" : ["brushHardness", "brushOpacity"].includes(key) ? "%" : ""}`;
        };
        control.onchange = () => { if (key === "colorRangeTolerance") recalculateColorRange({ preview: false }); endControlHistory(); };
        control.onwheel = (event) => {
          event.preventDefault();
          beginControlHistory();
          const step = Number(control.step) || 1;
          const amount = step * (event.shiftKey ? 5 : 1) * (event.deltaY < 0 ? 1 : -1);
          control.value = String(core.clamp(Number(control.value) + amount, Number(control.min), Number(control.max)));
          control.oninput();
          clearTimeout(wheelCommitTimer);
          wheelCommitTimer = root.setTimeout(() => { if (key === "colorRangeTolerance") recalculateColorRange({ preview: false }); endControlHistory(); }, 180);
        };
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
      toolOptionsHost.querySelector("[data-tool-check='wandSampleMerged']")?.addEventListener("change", (event) => {
        wandSampleMerged = event.target.checked;
        saveSettings();
      });
      toolOptionsHost.querySelector("[data-tool-check='wandAntialias']")?.addEventListener("change", (event) => {
        wandAntialias = event.target.checked;
        saveSettings();
      });
      toolOptionsHost.querySelector("[data-tool-check='colorRangeSampleMerged']")?.addEventListener("change", (event) => {
        pushHistory();
        colorRangeSampleMerged = event.target.checked;
        saveSettings();
        recalculateColorRange({ preview: false });
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
    function sourcePixelAt(point, imageData = sourceImageData) {
      const x = Math.max(0, Math.min(source.width - 1, Math.floor(point.x)));
      const y = Math.max(0, Math.min(source.height - 1, Math.floor(point.y)));
      const offset = (y * source.width + x) * 4;
      return {
        r: imageData.data[offset],
        g: imageData.data[offset + 1],
        b: imageData.data[offset + 2],
        a: imageData.data[offset + 3],
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

    function clearColorRangeState(clearSamples = true) {
      clearTimeout(colorRangeRecalcTimer);
      colorRangeRecalcGeneration += 1;
      pendingColorRangeMask = null;
      colorRangeSeedPoint = null;
      colorRangeBaseSelection = null;
      if (clearSamples) {
        colorRangeSamples = [];
        colorRangeExcluded = [];
        colorSampleMode = "replace";
      }
    }

    function cancelColorRangePreview() {
      if (!pendingColorRangeMask && !colorRangeSamples.length && !colorRangeExcluded.length) return false;
      clearColorRangeState(true);
      renderToolOptions();
      renderProperties();
      schedulePreview(0);
      setStatus(tr("色域選択の候補をキャンセルしました。", "Color Range preview was cancelled."), "info");
      return true;
    }

    function recalculateColorRange({ preview = false } = {}) {
      clearTimeout(colorRangeRecalcTimer);
      const generation = ++colorRangeRecalcGeneration;
      if (!sourceImageData || !colorRangeSamples.length) {
        pendingColorRangeMask = null;
        schedulePreview(0);
        return;
      }
      setStatus(tr("色域を計算しています…", "Calculating Color Range…"));
      colorRangeRecalcTimer = root.setTimeout(() => {
        if (generation !== colorRangeRecalcGeneration) return;
        const reference = activeReferenceImageData(colorRangeSampleMerged);
        const longest = Math.max(reference.width, reference.height);
        const sampleStep = preview ? (longest > 1800 ? 4 : longest > 900 ? 2 : 1) : 1;
        let incoming = core.colorRangeMask(reference, colorRangeSamples, colorRangeExcluded, colorRangeTolerance, sampleStep);
        if (selectionFeather > 0) incoming = core.featherMask(incoming, source.width, source.height, selectionFeather);
        if (generation !== colorRangeRecalcGeneration) return;
        const base = colorRangeBaseSelection || maskData(selectionCanvas);
        putMask(selectionCanvas, core.combineMasks(base, incoming, colorRangeOperation));
        pendingColorRangeMask = null;
        renderSelectionPanel();
        schedulePreview(0);
        setStatus(preview ? tr("色域を簡易表示しています…", "Showing a fast Color Range preview…") : tr("色域を選択へ反映しました。", "Color Range was applied to the Selection."), "ready");
      }, preview ? 90 : 0);
    }

    function applyColorRange() {
      if (!pendingColorRangeMask) return;
      pushHistory();
      combineSelection(pendingColorRangeMask);
      pendingColorRangeMask = null;
      colorRangeSeedPoint = null;
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
      const hardness = core.clamp(brush.hardness, 0, 1);
      const hardnessRadius = Math.max(0, Math.min(radius - 0.01, radius * hardness));
      const hardnessStop = Math.max(0.001, Math.min(0.999, hardness));
      const gradient = stampContext.createRadialGradient(localX, localY, hardnessRadius, localX, localY, radius);
      const alpha = core.clamp(brush.opacity, 0, 1);
      const maskTarget = activeIsMask();
      if (maskTarget) {
        const value = erase ? 0 : 255;
        gradient.addColorStop(0, `rgba(${value},${value},${value},${alpha})`);
        gradient.addColorStop(hardnessStop, `rgba(${value},${value},${value},${alpha})`);
        gradient.addColorStop(1, `rgba(${value},${value},${value},0)`);
      } else if (erase) {
        gradient.addColorStop(0, `rgba(0,0,0,${alpha})`);
        gradient.addColorStop(hardnessStop, `rgba(0,0,0,${alpha})`);
        gradient.addColorStop(1, "rgba(0,0,0,0)");
      } else {
        const color = parseHexColor(brush.color);
        gradient.addColorStop(0, `rgba(${color.r},${color.g},${color.b},${alpha})`);
        gradient.addColorStop(hardnessStop, `rgba(${color.r},${color.g},${color.b},${alpha})`);
        gradient.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);
      }
      stampContext.fillStyle = gradient;
      stampContext.beginPath();
      stampContext.arc(localX, localY, radius, 0, Math.PI * 2);
      stampContext.fill();

      const targetContext = canvas.getContext("2d", { willReadFrequently: true });
      const selectionMask = maskData(selectionCanvas);
      const constrain = activeTarget.kind !== "selection" && core.maskHasSelection(selectionMask);
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
      const effectiveMask = effectiveSelectionMask();
      for (let offset = 0; offset < targetData.length; offset += 4) {
        const localPixel = offset / 4;
        const localX = localPixel % width;
        const localY = Math.floor(localPixel / width);
        const maskValue = effectiveMask[(top + localY) * source.width + left + localX] || 0;
        const sourceAlpha = stampData[offset + 3] / 255 * (maskValue / 255);
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
      else if (hueSampleMode) cursorTool = `color-range-${hueSampleMode}`;
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
      const hueLayer = activeLayer();
      if (hueSampleMode && hueLayer?.adjustmentType === "hue_saturation") {
        event.preventDefault();
        pushHistory();
        const color = previewPixelAt(point);
        const hueDegrees = Math.round(core.rgbToHsl(color.r, color.g, color.b)[0] * 360) % 360;
        hueLayer.settings.targetColor = "custom";
        hueLayer.settings.targetSamples = Array.isArray(hueLayer.settings.targetSamples) ? hueLayer.settings.targetSamples : [];
        hueLayer.settings.targetExcluded = Array.isArray(hueLayer.settings.targetExcluded) ? hueLayer.settings.targetExcluded : [];
        if (hueSampleMode === "exclude") hueLayer.settings.targetExcluded.push(hueDegrees);
        else if (hueSampleMode === "add") hueLayer.settings.targetSamples.push(hueDegrees);
        else {
          hueLayer.settings.targetSamples = [hueDegrees];
          hueLayer.settings.targetExcluded = [];
        }
        renderProperties();
        schedulePreview(0);
        setStatus(tr("色相・彩度の対象色を取得しました。", "Hue / Saturation target color sampled."), "ready");
        return;
      }
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
        pointerState = { mode: "rectangle", shape: shapeSelectionMode, pointerId: event.pointerId, start: point, current: point, operation: effectiveSelectionOperation(event) };
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
          const reference = activeReferenceImageData(wandSampleMerged);
          const color = sourcePixelAt(point, reference);
          let mask = wandContiguous
            ? core.floodSelect(reference, point.x, point.y, wandTolerance)
            : core.colorRangeMask(reference, [color], [], wandTolerance);
          if (wandAntialias) mask = core.featherMask(mask, source.width, source.height, 1);
          combineSelection(mask, operation);
          setStatus(tr("自動選択を反映しました。", "Magic Wand selection applied."), "ready");
        }, 0);
        return;
      }
      if (activeTool === "color_range") {
        const reference = activeReferenceImageData(colorRangeSampleMerged);
        const color = sourcePixelAt(point, reference);
        pushHistory();
        colorRangeBaseSelection = maskData(selectionCanvas);
        colorRangeOperation = effectiveSelectionOperation(event);
        colorRangeSamples = [color];
        colorRangeExcluded = [];
        colorRangeSeedPoint = { x: point.x, y: point.y };
        recalculateColorRange({ preview: false });
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
          setStatus(activeTarget.kind === "base" && baseLayerState.locked
            ? tr("ベース画像はロックされています。レイヤーの鍵をクリックして解除してください。", "The Base Image is locked. Click the layer lock to unlock it.")
            : tr("ペイントレイヤー、ベース画像、選択範囲、または調整レイヤーマスクを選択してください。", "Select a Paint layer, the Base Image, the Selection, or an adjustment mask."), "error");
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
        const mask = pointerState.shape === "ellipse" ? core.ellipseMask(source.width, source.height, pointerState.start.x, pointerState.start.y, end.x, end.y) : core.rectangleMask(source.width, source.height, pointerState.start.x, pointerState.start.y, end.x, end.y);
        combineSelection(mask, pointerState.operation);
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
    function handleResultPointerCancel(event) {
      if (["rectangle", "lasso"].includes(pointerState?.mode)) {
        pointerState = null;
        lassoPoints = [];
        if (resultCanvas.hasPointerCapture(event.pointerId)) resultCanvas.releasePointerCapture(event.pointerId);
        updateCanvasCursor(event);
        schedulePreview(0);
        return;
      }
      handleResultPointerUp(event);
    }
    async function renderFullBlob() {
      const started = performance.now();
      const sourceData = baseLayerState.visible
        ? baseCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, source.width, source.height)
        : new ImageData(transparentPixels(source.width, source.height), source.width, source.height);
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
        closeDialog();
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
      if (!source || !initialDocumentSnapshot) return;
      const confirmed = typeof root.confirm !== "function" || root.confirm(
        tr("Quick Retouch開始後の編集内容をすべて破棄して、開始時の状態へ戻しますか？", "Discard all edits made since Quick Retouch opened and return to the starting state?"),
      );
      if (!confirmed) return;
      pushHistory();
      restoreSnapshot(initialDocumentSnapshot);
      setStatus(tr("Quick Retouchを開始時の状態へ戻しました。Undoでリセット直前へ戻せます。", "Returned to the starting state. Undo restores the state before reset."), "ready");
    }

    function applyLanguage() {
      dialog.querySelector("[data-retouch-title]").textContent = tr(`簡易レタッチ（Quick Retouch ${BUILD_VERSION}）`, `Quick Retouch ${BUILD_VERSION}`);
      dialog.querySelector("[data-retouch-selection-title]").textContent = tr("選択範囲", "Selection");
      dialog.querySelector("[data-retouch-layers-title]").textContent = tr("レイヤー", "Layers");
      dialog.querySelector("[data-retouch-properties-title]").textContent = tr("プロパティ", "Properties");
      dialog.querySelectorAll('[data-retouch-action="choose-file"]').forEach((button) => { button.textContent = tr("ファイルを選択", "Choose File"); });
      dialog.querySelectorAll('[data-retouch-action="toggle-source-picker"]').forEach((button) => { if (button.tagName === "BUTTON") button.textContent = tr("画像を変更", "Change Image"); });
      dialog.querySelector('[data-retouch-action="fit-view"]').textContent = tr("全体", "Fit");
      dialog.querySelector('[data-retouch-action="hold-original"]').textContent = tr("編集前を表示（長押し）", "Hold to View Before");
      const compareLabels = {
        none: tr("なし", "None"),
        vertical: tr("左右", "L/R"),
        horizontal: tr("上下", "T/B"),
      };
      dialog.querySelectorAll("[data-retouch-compare-mode]").forEach((button) => {
        button.textContent = compareLabels[button.dataset.retouchCompareMode] || button.dataset.retouchCompareMode;
        button.classList.toggle("active", button.dataset.retouchCompareMode === compareMode);
        button.setAttribute("aria-pressed", String(button.dataset.retouchCompareMode === compareMode));
      });
      dialog.querySelector('[data-retouch-action="cancel"]').textContent = tr("キャンセル", "Cancel");
      dialog.querySelector('[data-retouch-action="reset"]').textContent = tr("開始時に戻す", "Return to Start");
      dialog.querySelector('[data-retouch-action="reset"]').title = tr("Quick Retouchを開いた時点の状態へ戻します", "Return to the state when Quick Retouch was opened");
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
      dialog.classList.toggle("maximized", geometry.maximized === true);
      if (Number.isFinite(Number(geometry.width))) dialog.style.width = `${Math.max(940, Math.min(innerWidth - 12, Number(geometry.width)))}px`;
      if (Number.isFinite(Number(geometry.height))) dialog.style.height = `${Math.max(620, Math.min(innerHeight - 12, Number(geometry.height)))}px`;
      if (Number.isFinite(Number(geometry.left))) dialog.style.left = `${Math.max(6, Math.min(innerWidth - dialog.offsetWidth - 6, Number(geometry.left)))}px`;
      if (Number.isFinite(Number(geometry.top))) dialog.style.top = `${Math.max(6, Math.min(innerHeight - dialog.offsetHeight - 6, Number(geometry.top)))}px`;
    }

    function saveGeometry() {
      if (!dialog.open) return;
      const previous = readGeometry();
      const maximized = dialog.classList.contains("maximized");
      const rect = dialog.getBoundingClientRect();
      const geometry = maximized
        ? { ...previous, maximized: true }
        : { left: rect.left, top: rect.top, width: rect.width, height: rect.height, maximized: false };
      try { localStorage.setItem(GEOMETRY_KEY, JSON.stringify(geometry)); }
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
      if (!dialog.open) return;
      saveGeometry();
      savePanelState();
      saveSettings();
      dialog.close();
    }

    launcher.addEventListener("click", openDialog);
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeDialog(); });
    dialog.addEventListener("close", () => {
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
      saveGeometry();
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
    dialog.querySelectorAll("[data-retouch-compare-mode]").forEach((button) => {
      button.onclick = () => {
        compareMode = ["none", "vertical", "horizontal"].includes(button.dataset.retouchCompareMode)
          ? button.dataset.retouchCompareMode
          : "none";
        dialog.querySelectorAll("[data-retouch-compare-mode]").forEach((item) => {
          item.classList.toggle("active", item.dataset.retouchCompareMode === compareMode);
          item.setAttribute("aria-pressed", String(item.dataset.retouchCompareMode === compareMode));
        });
        schedulePreview(0);
      };
    });
    dialog.querySelector('[data-retouch-action="fit-view"]').onclick = () => setViewZoom("fit");
    dialog.querySelector('[data-retouch-action="zoom-out"]').onclick = () => zoomBy(0.8);
    dialog.querySelector('[data-retouch-action="zoom-in"]').onclick = () => zoomBy(1.25);
    dialog.querySelector('[data-retouch-zoom]').onchange = (event) => setViewZoom(Number(event.target.value));
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
    dialog.querySelectorAll('[data-retouch-action="choose-file"]').forEach((button) => { button.onclick = (event) => { event.stopPropagation(); fileInput.click(); }; });
    dialog.querySelectorAll('[data-retouch-action="toggle-source-picker"]').forEach((node) => { node.addEventListener("click", (event) => { if (node.tagName === "BUTTON") event.stopPropagation(); showSourcePicker(false).catch((error) => setStatus(String(error?.message || error), "error")); }); });
    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (file) await setSource({ blob: file, name: file.name, source_kind: "external" });
    };

    sourceDrop?.addEventListener("dragover", (event) => {
      if (![...(event.dataTransfer?.types || [])].includes("Files")) return;
      event.preventDefault();
      sourceDrop.classList.add("drag-active");
    });
    sourceDrop?.addEventListener("dragleave", () => sourceDrop.classList.remove("drag-active"));
    sourceDrop?.addEventListener("drop", async (event) => {
      const file = [...(event.dataTransfer?.files || [])].find((item) => /^image\/(?:png|jpeg|webp)$/i.test(item.type));
      if (!file) return;
      event.preventDefault();
      event.stopPropagation();
      sourceDrop.classList.remove("drag-active");
      await setSource({ blob: file, name: file.name, source_kind: "external" });
    });

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
    resultCanvas.addEventListener("pointercancel", handleResultPointerCancel);
    resultCanvas.addEventListener("lostpointercapture", handleResultPointerUp);
    resultCanvas.addEventListener("pointerenter", updateBrushRing);
    resultCanvas.addEventListener("pointerleave", (event) => updateBrushRing(event));
    root.addEventListener("pointerup", handleResultPointerUp);
    root.addEventListener("pointercancel", handleResultPointerCancel);
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
      if (compareMode === "none") return;
      event.preventDefault();
      pointerState = { mode: "compare", pointerId: event.pointerId };
      try { compareDivider.setPointerCapture(event.pointerId); } catch {}
    });
    compareDivider.addEventListener("pointermove", (event) => {
      if (pointerState?.mode !== "compare" || pointerState.pointerId !== event.pointerId) return;
      const rect = stage.getBoundingClientRect();
      compareSplit = compareMode === "horizontal"
        ? core.clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0.05, 0.95)
        : core.clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0.05, 0.95);
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
      else if (event.key === "Escape" && cancelColorRangePreview()) { event.preventDefault(); }
      else if (event.key === "Escape" && hueSampleMode) { event.preventDefault(); hueSampleMode = ""; renderProperties(); updateCanvasCursor(); }
      else if (event.key === "Escape" && pointerState?.mode === "rectangle") { event.preventDefault(); pointerState = null; schedulePreview(0); }
      else if (event.key === "Escape" && lassoPoints.length) { event.preventDefault(); lassoPoints = []; pointerState = null; schedulePreview(0); }
      else if (event.key === "[") { brush.size = Math.max(1, Math.round(brush.size * 0.85)); syncPairedControls("brushSize", brush.size); renderToolOptions(); updateBrushRing(); showBrushSizeHud(); saveSettings(); }
      else if (event.key === "]") { brush.size = Math.min(Math.max(500, Math.min(source?.width || 500, source?.height || 500)), Math.round(brush.size * 1.18)); syncPairedControls("brushSize", brush.size); renderToolOptions(); updateBrushRing(); showBrushSizeHud(); saveSettings(); }
      else if (event.key === " ") { spaceDown = true; event.preventDefault(); refreshModifierUi(event); }
      else if (event.key === "\\") { showOriginalOnResult = true; schedulePreview(0); }
      else if (key === "q") { event.preventDefault(); toggleQuickMask(); }
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
