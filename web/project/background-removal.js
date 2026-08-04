(function (root) {
  "use strict";

  const GEOMETRY_KEY = "speech-bubble-editor:background-removal-geometry:v1";
  const DEFAULT_HISTORY_LIMIT = 24;
  const selectionCore = root.SpeechBubbleBackgroundSelection;
  const edgeCore = root.SpeechBubbleBackgroundEdge;
  if (!selectionCore) {
    throw new Error("SpeechBubbleBackgroundSelection must be loaded before background-removal.js");
  }
  if (!edgeCore) {
    throw new Error("SpeechBubbleBackgroundEdge must be loaded before background-removal.js");
  }

  function isEnglish() {
    return document.documentElement.lang === "en";
  }

  function tr(ja, en) {
    return isEnglish() ? en : ja;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  async function responseError(response, fallback) {
    const payload = await response.json().catch(() => ({}));
    return new Error(payload.detail || fallback || `Request failed (${response.status})`);
  }

  function morphMask(data, width, height, amount) {
    let current = new Uint8ClampedArray(data);
    const dilate = amount > 0;
    for (let step = 0; step < Math.abs(amount); step += 1) {
      const next = new Uint8ClampedArray(current.length);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          let value = dilate ? 0 : 255;
          for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy += 1) {
            const row = yy * width;
            for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx += 1) {
              value = dilate ? Math.max(value, current[row + xx]) : Math.min(value, current[row + xx]);
            }
          }
          next[y * width + x] = value;
        }
      }
      current = next;
    }
    return current;
  }

  function fillBinaryHoles(mask, width, height) {
    const outside = new Uint8Array(mask.length);
    const queue = new Int32Array(mask.length);
    let head = 0;
    let tail = 0;
    const push = (index) => {
      if (outside[index] || mask[index] !== 0) return;
      outside[index] = 1;
      queue[tail++] = index;
    };
    for (let x = 0; x < width; x += 1) {
      push(x);
      push((height - 1) * width + x);
    }
    for (let y = 0; y < height; y += 1) {
      push(y * width);
      push(y * width + width - 1);
    }
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = (index / width) | 0;
      if (x > 0) push(index - 1);
      if (x + 1 < width) push(index + 1);
      if (y > 0) push(index - width);
      if (y + 1 < height) push(index + width);
    }
    const output = new Uint8ClampedArray(mask.length);
    for (let index = 0; index < mask.length; index += 1) {
      output[index] = mask[index] || !outside[index] ? 255 : 0;
    }
    return output;
  }

  function removeSmallComponents(mask, width, height, minimumSize) {
    const binary = new Uint8Array(mask.length);
    const visited = new Uint8Array(mask.length);
    const output = new Uint8ClampedArray(mask);
    const queue = new Int32Array(mask.length);
    const component = new Int32Array(mask.length);
    for (let index = 0; index < mask.length; index += 1) binary[index] = mask[index] > 127 ? 1 : 0;
    for (let start = 0; start < binary.length; start += 1) {
      if (!binary[start] || visited[start]) continue;
      let head = 0;
      let tail = 0;
      let count = 0;
      queue[tail++] = start;
      visited[start] = 1;
      while (head < tail) {
        const index = queue[head++];
        component[count++] = index;
        const x = index % width;
        const y = (index / width) | 0;
        const neighbors = [];
        if (x > 0) neighbors.push(index - 1);
        if (x + 1 < width) neighbors.push(index + 1);
        if (y > 0) neighbors.push(index - width);
        if (y + 1 < height) neighbors.push(index + width);
        for (const neighbor of neighbors) {
          if (binary[neighbor] && !visited[neighbor]) {
            visited[neighbor] = 1;
            queue[tail++] = neighbor;
          }
        }
      }
      if (count < minimumSize) {
        for (let index = 0; index < count; index += 1) output[component[index]] = 0;
      }
    }
    return output;
  }

  function featherMask(mask, width, height, radius) {
    if (radius <= 0) return new Uint8ClampedArray(mask);
    const source = document.createElement("canvas");
    source.width = width;
    source.height = height;
    const sourceContext = source.getContext("2d", { willReadFrequently: true });
    const image = sourceContext.createImageData(width, height);
    for (let pixel = 0, offset = 0; pixel < mask.length; pixel += 1, offset += 4) {
      image.data[offset] = image.data[offset + 1] = image.data[offset + 2] = image.data[offset + 3] = mask[pixel];
    }
    sourceContext.putImageData(image, 0, 0);
    const blurred = document.createElement("canvas");
    blurred.width = width;
    blurred.height = height;
    const context = blurred.getContext("2d", { willReadFrequently: true });
    context.filter = `blur(${clamp(radius, 1, 12)}px)`;
    context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, width, height).data;
    const output = new Uint8ClampedArray(mask.length);
    for (let pixel = 0, offset = 0; pixel < output.length; pixel += 1, offset += 4) output[pixel] = pixels[offset];
    return output;
  }

  function create(options) {
    const launcher = document.querySelector("[data-background-removal-open]");
    if (!launcher) return null;
    const aiInferenceAvailable = options.aiInferenceAvailable !== false;
    const aiApiBase = String(options.aiApiBase || "/speech-bubble-forge/background-removal").replace(/\/$/, "");

    const dialog = document.createElement("dialog");
    dialog.className = "background-removal-dialog";
    dialog.innerHTML = `
      <div class="background-removal-window">
        <header class="background-removal-head" data-bg-remove-drag-handle>
          <strong data-br-text="title">背景削除</strong>
          <span data-br-text="subtitle">AI背景削除＆マスク編集</span>
          <span class="spacer"></span>
          <button type="button" class="background-removal-window-action" data-br-action="maximize" aria-label="最大化" title="最大化">□</button>
          <button type="button" class="background-removal-window-action" data-br-action="close" aria-label="閉じる" title="閉じる">×</button>
        </header>
        <div class="background-removal-source-bar" data-br-action="change-source" title="画像候補を開く／閉じる">
          <div class="background-removal-source-thumb" data-br-source-thumb></div>
          <div><strong data-br-source-name>画像を選択してください</strong><small data-br-source-size></small></div>
          <button type="button" data-br-action="change-source" data-br-text="changeImage">画像を変更</button>
        </div>
        <section class="background-removal-source-picker" data-br-source-picker hidden>
          <div class="background-removal-candidates" data-br-candidates></div>
          <div class="background-removal-drop" data-br-drop>
            <span data-br-text="dropImage">PNG / JPEG / WebPをドロップ</span>
            <button type="button" data-br-action="choose-file" data-br-text="chooseFile">ファイルを選択</button>
          </div>
          <input type="file" data-br-file accept="image/png,image/jpeg,image/webp" hidden>
        </section>
        <div class="background-removal-body">
          <main class="background-removal-previews">
            <figure>
              <figcaption data-br-text="original">元画像</figcaption>
              <div class="background-removal-viewport" data-br-viewport="source"><canvas data-br-source-canvas></canvas></div>
              <div class="background-removal-zoom-row">
                <button type="button" data-br-action="pan" data-br-text="pan">移動</button><output data-br-zoom-source>100%</output><button type="button" data-br-action="zoom-out">−</button><button type="button" data-br-action="zoom-in">＋</button><button type="button" data-br-action="fit" data-br-text="fit">フィット</button><button type="button" data-br-action="actual">1:1</button>
              </div>
            </figure>
            <figure>
              <figcaption data-br-result-caption>透過結果（赤：マスク表示）</figcaption>
              <div class="background-removal-viewport" data-br-viewport="result"><canvas class="background-removal-result-canvas" data-br-result-canvas></canvas><div class="background-removal-brush-cursor" data-br-cursor hidden></div></div>
              <div class="background-removal-zoom-row">
                <button type="button" data-br-action="pan" data-br-text="pan">移動</button><output data-br-zoom-result>100%</output><button type="button" data-br-action="zoom-out">−</button><button type="button" data-br-action="zoom-in">＋</button><button type="button" data-br-action="fit" data-br-text="fit">フィット</button><button type="button" data-br-action="actual">1:1</button>
              </div>
            </figure>
          </main>
          <aside class="background-removal-tools">
            <h3 data-br-text="maskMethod">マスク作成方法</h3>
            <div class="background-removal-mask-mode" role="group" aria-label="マスク作成方法">
              <button type="button" class="active" data-br-mask-mode="auto" data-br-text="automaticMask">自動</button>
              <button type="button" data-br-mask-mode="guided" data-br-text="guidedMask">範囲指定</button>
            </div>
            <p class="hint" data-br-mask-mode-help>AIが背景を自動判定します。</p>
            <p class="background-removal-process-state" data-br-process-state data-state="neutral">自動処理待ち</p>
            <h3 data-br-text="maskAction">マスク操作</h3>
            <div class="background-removal-tool-pair">
              <button type="button" data-br-tool="keep" title="消した領域を復元します (B)"><span data-br-text="keepAction">残す</span></button>
              <button type="button" class="active" data-br-tool="erase" title="領域を透明にします (E)"><span data-br-text="eraseAction">消す</span></button>
            </div>
            <h3 data-br-text="tools">ツール</h3>
            <div class="background-removal-edit-tool-pair" role="group" aria-label="編集ツール">
              <button type="button" class="active" data-br-edit-tool="wand" aria-pressed="true">
                <svg class="background-removal-wand-icon" viewBox="0 0 24 24" aria-hidden="true"><path class="background-removal-wand-shaft" d="m9 9 11 11"></path><path d="m3.5 3.5 4 4m0-4-4 4M14 3v4m-2-2h4"></path></svg>
                <span data-br-text="wandTool">自動選択</span>
              </button>
              <button type="button" data-br-edit-tool="brush" aria-pressed="false">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.8 4.2 19.8 9.2 10 19c-1.2 1.2-2.8 1.8-4.5 1.7 1.2-.7 1.8-1.8 1.8-3.3 0-1 .4-1.9 1.1-2.6Z"></path><path d="m13.2 5.8 5 5"></path></svg>
                <span data-br-text="brushTool">ブラシ</span>
              </button>
            </div>
            <div data-br-brush-settings>
              <label class="background-removal-brush-size"><span data-br-text="brushSize">ブラシサイズ</span><input data-br-brush-size type="range" min="4" max="512" value="120"><input data-br-brush-number type="number" min="4" max="512" value="120" aria-label="ブラシサイズ"></label>
              <label class="background-removal-brush-size"><span data-br-text="brushHardness">ブラシの硬さ</span><input data-br-brush-hardness type="range" min="0" max="100" value="100"><input data-br-brush-hardness-number type="number" min="0" max="100" value="100" aria-label="ブラシの硬さ（%）"></label>
              <p class="hint" data-br-text="rightDrag">右ドラッグ：サイズ変更</p>
            </div>
            <div data-br-wand-settings hidden>
              <label class="background-removal-control-row"><span data-br-text="wandTolerance">許容値</span><input data-br-wand-tolerance type="range" min="0" max="255" step="1" value="12"><input data-br-wand-tolerance-number type="number" min="0" max="255" step="1" value="12" aria-label="自動選択の許容値"></label>
              <p class="hint" data-br-text="wandHelp">クリック位置からつながる近い色を選択します。色むらは残った部分を追加クリックしてください。</p>
            </div>
            <button type="button" class="background-removal-run-mask" data-br-action="run-mask" disabled>自動背景削除を実行</button>
            <h3 data-br-text="viewMode">表示モード</h3>
            <select class="background-removal-view-select" data-br-view aria-label="表示モード"><option value="result" data-br-text="result">透過結果</option><option value="overlay" data-br-text="redOverlay">赤マスク重ね表示</option><option value="mask" data-br-text="maskOnly">マスクのみ</option></select>
            <label class="background-removal-control-row" data-br-overlay-row hidden><span data-br-text="overlayOpacity">赤マスク濃度</span><input data-br-overlay-opacity type="range" min="10" max="90" value="55"><input data-br-overlay-number type="number" min="10" max="90" value="55" aria-label="赤マスク濃度"></label>
            <h3 data-br-text="maskCorrection">マスク補正</h3>
            <div class="background-removal-adjustments">
              <label class="background-removal-control-row"><span data-br-text="threshold">マスクしきい値</span><input data-br-threshold type="range" min="0" max="255" value="1"><input data-br-threshold-number type="number" min="0" max="255" value="1" aria-label="マスクしきい値"></label>
              <label class="background-removal-control-row"><span data-br-text="morph">拡張・縮小</span><input data-br-morph type="range" min="-10" max="10" value="0"><input data-br-morph-number type="number" min="-10" max="10" value="0" aria-label="拡張・縮小"></label>
              <label class="background-removal-control-row"><span data-br-text="feather">境界ぼかし</span><input data-br-feather type="range" min="0" max="12" value="0"><input data-br-feather-number type="number" min="0" max="12" value="0" aria-label="境界ぼかし"></label>
              <div class="background-removal-checks"><label><input data-br-fill-holes type="checkbox"><span data-br-text="fillHoles">穴埋め</span></label><label><input data-br-remove-small type="checkbox"><span data-br-text="removeSmall">小領域除去</span></label></div>
            </div>
            <h3 data-br-text="edgeCorrection">エッジカラー補正</h3>
            <div class="background-removal-edge-correction">
              <div class="background-removal-edge-row">
                <label><span data-br-text="defringeWidth">フリンジ幅</span><span class="background-removal-edge-number"><input data-br-defringe-width type="number" min="1" max="10" step="1" value="1"><span>px</span></span></label>
                <button type="button" data-br-action="apply-defringe" data-br-text="applyDefringe" disabled>フリンジ削除</button>
              </div>
              <label class="background-removal-control-row"><span data-br-text="decontaminateColors">不要なカラーの除去</span><input data-br-decontaminate type="range" min="0" max="100" step="1" value="50"><input data-br-decontaminate-number type="number" min="0" max="100" step="1" value="50" aria-label="不要なカラーの除去（%）"></label>
              <button type="button" data-br-action="apply-decontaminate" data-br-text="applyDecontaminate" disabled>不要色を除去</button>
              <div class="background-removal-edge-matte-row"><button type="button" data-br-action="remove-white-matte" data-br-text="removeWhiteMatte" disabled>白マット削除</button><button type="button" data-br-action="remove-black-matte" data-br-text="removeBlackMatte" disabled>黒マット削除</button></div>
              <p class="background-removal-edge-state" data-br-edge-state data-state="neutral">エッジ補正なし</p>
              <button type="button" data-br-action="reset-edge-correction" data-br-text="resetEdgeCorrection" disabled>エッジ補正を解除</button>
            </div>
            <h3 data-br-text="operations">操作</h3>
            <div class="background-removal-operation-pair">
              <button type="button" data-br-action="undo" data-br-text="undo" disabled>元に戻す</button>
              <button type="button" data-br-action="redo" data-br-text="redo" disabled>やり直す</button>
            </div>
            <button type="button" data-br-action="reset-mask" disabled>自動マスクを初期状態に戻す</button>
            <section class="background-removal-model" data-br-model-panel>
              <strong data-br-text="model">AIモデル</strong>
              <output data-br-model-status>確認中…</output>
              <progress data-br-model-progress max="1" value="0"></progress>
              <div><button type="button" data-br-action="download-model" data-br-text="downloadModel">モデルを取得</button><button type="button" data-br-action="cancel-download" data-br-text="cancelDownload" hidden>中止</button></div>
            </section>
          </aside>
        </div>
        <footer class="background-removal-footer">
          <span data-br-status data-level="info">画像を選択してください。</span>
          <button type="button" data-br-action="cancel" data-br-text="cancel">キャンセル</button>
          <button type="button" class="primary" data-br-action="apply" disabled>画像トレイへ追加</button>
        </footer>
      </div>
    `;
    document.body.append(dialog);

    const text = {
      title: ["背景削除", "Background Removal"], subtitle: ["AI背景削除＆マスク編集", "AI background removal & mask editing"],
      maximize: ["最大化", "Maximize"], restore: ["元のサイズ", "Restore"], close: ["閉じる", "Close"],
      changeImage: ["画像を変更", "Change Image"], dropImage: ["PNG / JPEG / WebPをドロップ", "Drop PNG / JPEG / WebP"], chooseFile: ["ファイルを選択", "Choose File"],
      original: ["元画像", "Original"], fit: ["フィット", "Fit"], pan: ["移動", "Pan"], maskAction: ["マスク操作", "Mask Action"], tools: ["ツール", "Tools"],
      maskMethod: ["処理方法", "Processing Method"], automaticMask: ["自動", "Automatic"], guidedMask: ["範囲指定", "Guided Selection"],
      automaticMaskHelp: ["AIが背景を自動判定します。", "AI detects the background automatically."], guidedMaskHelp: ["残す部分・消す部分を塗って指定します。", "Paint areas to keep or remove before running AI background removal."],
      keepAction: ["残す", "Keep"], eraseAction: ["消す", "Remove"], keepBrush: ["復元ブラシ", "Restore Brush"], eraseBrush: ["消しゴムツール", "Eraser Tool"], brushTool: ["ブラシ", "Brush"], wandTool: ["自動選択", "Magic Wand"], wandTolerance: ["許容値", "Tolerance"], wandHelp: ["クリック位置からつながる近い色を選択します。色むらは残った部分を追加クリックしてください。", "Selects similar connected colors from the clicked point. Click remaining shades again when needed."], brushSize: ["ブラシサイズ", "Brush Size"], brushHardness: ["ブラシの硬さ", "Brush Hardness"], rightDrag: ["右ドラッグ：サイズ変更", "Right-drag: change size"],
      viewMode: ["表示モード", "View Mode"], result: ["透過結果", "Transparent Result"], redOverlay: ["赤マスク重ね表示", "Red Mask Overlay"], maskOnly: ["マスクのみ", "Mask Only"],
      maskCorrection: ["マスク補正", "Mask Correction"], morph: ["マスク拡張・縮小", "Grow / Shrink Mask"], feather: ["境界ぼかし", "Feather Edge"], fillHoles: ["穴埋め", "Fill Holes"], removeSmall: ["小領域除去", "Remove Small Regions"],
      edgeCorrection: ["エッジカラー補正", "Edge Color Correction"], defringeWidth: ["フリンジ幅", "Defringe Width"], applyDefringe: ["フリンジ削除", "Defringe"], decontaminateColors: ["不要なカラーの除去", "Decontaminate Colors"], applyDecontaminate: ["不要色を除去", "Remove Color Fringe"], removeWhiteMatte: ["白マット削除", "Remove White Matte"], removeBlackMatte: ["黒マット削除", "Remove Black Matte"], resetEdgeCorrection: ["エッジ補正を解除", "Clear Edge Correction"], edgeCorrectionNone: ["エッジ補正なし", "No edge correction"],
      details: ["詳細", "Details"], threshold: ["マスクしきい値", "Mask Threshold"], overlayOpacity: ["赤マスク濃度", "Red Overlay Opacity"], operations: ["操作", "Operations"],
      guideKeep: ["残す", "Keep"], guideRemove: ["消す", "Remove"], runGuided: ["指定を反映して背景削除", "Apply Selection and Remove Background"], rerunGuided: ["指定を反映して再実行", "Apply Selection and Run Again"], runningGuided: ["背景を解析しています…", "Analyzing Background…"],
      runAutomatic: ["自動背景削除を実行", "Run Automatic Background Removal"], rerunAutomatic: ["自動処理を再実行", "Run Automatic Processing Again"],
      manualMaskEditing: ["AI自動処理は利用できません。自動選択またはブラシでマスクを編集してください。", "AI automatic processing is unavailable. Edit the mask with Magic Wand or Brush."],
      aiUnavailable: ["AI自動処理は利用不可", "AI automatic processing unavailable"],
      manualMaskReady: ["手動マスク編集", "Manual mask editing"],
      autoWaiting: ["自動処理待ち", "Waiting for automatic processing"], autoApplied: ["自動処理済み", "Automatic processing complete"], guidedPending: ["指定内容は未反映", "Selection changes not applied"], guidedApplied: ["指定内容を反映済み", "Selection applied"],
      undo: ["元に戻す", "Undo"], redo: ["やり直す", "Redo"], resetAutoMask: ["自動マスクを初期状態に戻す", "Reset Automatic Mask"], resetGuidedMask: ["範囲指定をリセット", "Reset Guided Selection"], model: ["AIモデル", "AI Model"],
      downloadModel: ["モデルを取得", "Download Model"], cancelDownload: ["中止", "Cancel"], cancel: ["キャンセル", "Cancel"],
    };

    const sourceCanvas = dialog.querySelector("[data-br-source-canvas]");
    const resultCanvas = dialog.querySelector("[data-br-result-canvas]");
    const sourceViewport = dialog.querySelector('[data-br-viewport="source"]');
    const resultViewport = dialog.querySelector('[data-br-viewport="result"]');
    const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
    const resultContext = resultCanvas.getContext("2d", { willReadFrequently: true });
    const status = dialog.querySelector("[data-br-status]");
    const applyButton = dialog.querySelector('[data-br-action="apply"]');
    const brushInput = dialog.querySelector("[data-br-brush-size]");
    const brushNumber = dialog.querySelector("[data-br-brush-number]");
    const brushHardnessInput = dialog.querySelector("[data-br-brush-hardness]");
    const brushHardnessNumber = dialog.querySelector("[data-br-brush-hardness-number]");
    const brushSettings = dialog.querySelector("[data-br-brush-settings]");
    const wandSettings = dialog.querySelector("[data-br-wand-settings]");
    const wandToleranceInput = dialog.querySelector("[data-br-wand-tolerance]");
    const wandToleranceNumber = dialog.querySelector("[data-br-wand-tolerance-number]");
    const thresholdInput = dialog.querySelector("[data-br-threshold]");
    const thresholdNumber = dialog.querySelector("[data-br-threshold-number]");
    const opacityInput = dialog.querySelector("[data-br-overlay-opacity]");
    const opacityNumber = dialog.querySelector("[data-br-overlay-number]");
    const morphInput = dialog.querySelector("[data-br-morph]");
    const morphNumber = dialog.querySelector("[data-br-morph-number]");
    const featherInput = dialog.querySelector("[data-br-feather]");
    const featherNumber = dialog.querySelector("[data-br-feather-number]");
    const fillHolesInput = dialog.querySelector("[data-br-fill-holes]");
    const removeSmallInput = dialog.querySelector("[data-br-remove-small]");
    const defringeWidthInput = dialog.querySelector("[data-br-defringe-width]");
    const decontaminateInput = dialog.querySelector("[data-br-decontaminate]");
    const decontaminateNumber = dialog.querySelector("[data-br-decontaminate-number]");
    const edgeState = dialog.querySelector("[data-br-edge-state]");
    const viewSelect = dialog.querySelector("[data-br-view]");
    const brushCursor = dialog.querySelector("[data-br-cursor]");
    const sourcePicker = dialog.querySelector("[data-br-source-picker]");
    const fileInput = dialog.querySelector("[data-br-file]");
    const modelPanel = dialog.querySelector("[data-br-model-panel]");
    let source = null;
    let sourceBitmap = null;
    let sourcePixels = null;
    let aiMask = null;
    let editedMask = null;
    let maskMode = "auto";
    let maskModeStates = { auto: null, guided: null };
    let guideKeepMask = null;
    let guideRemoveMask = null;
    let guidedProcessed = false;
    let guidedDirty = false;
    let processingRunning = false;
    let inferenceRevision = 0;
    let history = [];
    let redo = [];
    let tool = "erase";
    let editTool = "wand";
    let viewMode = "result";
    let renderQueued = false;
    let drawing = false;
    let panning = false;
    let panTool = false;
    let brushResizeState = null;
    let lastPoint = null;
    let lastClient = null;
    let cursorClient = null;
    let view = { scale: 1, x: 0, y: 0 };
    let pollTimer = null;
    let candidateUrls = [];
    let sourceThumbUrl = null;
    let edgeCorrection = edgeCore.defaultSettings();
    let sourceRevision = 0;
    let maskRevision = 0;
    let processedMaskCache = { key: "", value: null };
    let correctedPixelsCache = { key: "", value: null };
    let edgeControlEditing = false;
    let decontaminateDisplay = 50;

    function historyLimit() { return DEFAULT_HISTORY_LIMIT; }

    function setStatus(message, level = "info") {
      status.textContent = message;
      status.dataset.level = level;
      options.setStatus?.(message, level === "ready" ? "saved" : level);
    }

    function applyLanguage() {
      dialog.querySelectorAll("[data-br-text]").forEach((element) => {
        const pair = text[element.dataset.brText];
        if (pair) element.textContent = pair[isEnglish() ? 1 : 0];
      });
      defringeWidthInput.setAttribute("aria-label", tr("フリンジ幅（px）", "Defringe width (px)"));
      decontaminateNumber.setAttribute("aria-label", tr("不要なカラーの除去（%）", "Decontaminate colors (%)"));
      dialog.querySelector('[data-br-tool="keep"]').title = tr("消した領域を復元します (B)", "Restore erased areas (B)");
      dialog.querySelector('[data-br-tool="erase"]').title = tr("領域を透明にします (E)", "Erase areas to transparency (E)");
      if (source) updateSourceBar();
      const maximize = dialog.querySelector('[data-br-action="maximize"]');
      const close = dialog.querySelector('[data-br-action="close"]');
      const maximized = dialog.classList.contains("maximized");
      maximize.title = maximize.ariaLabel = text[maximized ? "restore" : "maximize"][isEnglish() ? 1 : 0];
      close.title = close.ariaLabel = text.close[isEnglish() ? 1 : 0];
      applyButton.textContent = options.getMode() === "comic" ? tr("画像トレイへ追加", "Add to Image Tray") : tr("一枚画像へ適用", "Apply to Single Image");
      updateMaskModeUi();
      updateEditToolUi();
      syncEdgeCorrectionUi();
      updateResultCaption();
    }

    function updateResultCaption() {
      if (maskMode === "guided" && (!guidedProcessed || guidedDirty)) {
        dialog.querySelector("[data-br-result-caption]").textContent = tr("範囲指定（緑：残す／赤：消す）", "Guided Selection (green: keep / red: remove)");
        return;
      }
      const captions = {
        result: tr("透過結果（赤：マスク表示）", "Transparent Result (red: mask display)"),
        overlay: tr("赤マスク重ね表示", "Red Mask Overlay"),
        mask: tr("マスクのみ", "Mask Only"),
      };
      dialog.querySelector("[data-br-result-caption]").textContent = captions[viewMode];
    }

    function clearCandidateUrls() {
      for (const url of candidateUrls) URL.revokeObjectURL(url);
      candidateUrls = [];
    }

    function clearSourceThumbUrl() {
      if (sourceThumbUrl) URL.revokeObjectURL(sourceThumbUrl);
      sourceThumbUrl = null;
    }

    async function imageBitmap(blob) {
      if ("createImageBitmap" in root) return createImageBitmap(blob);
      const image = new Image();
      const url = URL.createObjectURL(blob);
      try {
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
          image.src = url;
        });
        return image;
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    function closeBitmap() {
      sourceBitmap?.close?.();
      sourceBitmap = null;
    }

    function updateSourceBar() {
      const name = dialog.querySelector("[data-br-source-name]");
      const size = dialog.querySelector("[data-br-source-size]");
      const thumb = dialog.querySelector("[data-br-source-thumb]");
      name.textContent = source?.name || tr("画像を選択してください", "Select an image");
      size.textContent = source ? `${source.width || sourceBitmap?.width || 0} × ${source.height || sourceBitmap?.height || 0}px` : "";
      thumb.replaceChildren();
      clearSourceThumbUrl();
      if (source?.blob) {
        const image = document.createElement("img");
        sourceThumbUrl = URL.createObjectURL(source.blob);
        image.src = sourceThumbUrl;
        image.alt = "";
        thumb.append(image);
      }
    }

    function updateHistoryButtons() {
      dialog.querySelector('[data-br-action="undo"]').disabled = !history.length;
      dialog.querySelector('[data-br-action="redo"]').disabled = !redo.length;
      dialog.querySelector('[data-br-action="reset-mask"]').disabled = maskMode === "auto" ? !aiMask : !sourcePixels;
    }

    function resetMaskCorrections() {
      thresholdInput.value = thresholdNumber.value = "1";
      morphInput.value = morphNumber.value = "0";
      featherInput.value = featherNumber.value = "0";
      fillHolesInput.checked = false;
      removeSmallInput.checked = false;
    }

    function invalidateCorrectedPixels() {
      correctedPixelsCache = { key: "", value: null };
    }

    function markMaskChanged() {
      maskRevision += 1;
      processedMaskCache = { key: "", value: null };
      invalidateCorrectedPixels();
    }

    function markSourceChanged() {
      sourceRevision += 1;
      markMaskChanged();
    }

    function edgeWidthActive(settings = edgeCorrection) {
      return settings.defringe || settings.decontaminateAmount > 0;
    }

    function syncEdgeCorrectionUi() {
      edgeCorrection = edgeCore.normalizeSettings(edgeCorrection);
      if (document.activeElement !== defringeWidthInput) defringeWidthInput.value = String(edgeCorrection.width);
      const percent = Math.round(edgeCorrection.decontaminateAmount * 100);
      if (edgeCorrection.decontaminateAmount > 0) decontaminateDisplay = percent;
      if (document.activeElement !== decontaminateInput) decontaminateInput.value = String(decontaminateDisplay);
      if (document.activeElement !== decontaminateNumber) decontaminateNumber.value = String(decontaminateDisplay);

      const defringeButton = dialog.querySelector('[data-br-action="apply-defringe"]');
      const decontaminateButton = dialog.querySelector('[data-br-action="apply-decontaminate"]');
      const whiteButton = dialog.querySelector('[data-br-action="remove-white-matte"]');
      const blackButton = dialog.querySelector('[data-br-action="remove-black-matte"]');
      defringeButton.classList.toggle("active", edgeCorrection.defringe);
      decontaminateButton.classList.toggle("active", edgeCorrection.decontaminateAmount > 0);
      whiteButton.classList.toggle("active", edgeCorrection.matte === "white");
      blackButton.classList.toggle("active", edgeCorrection.matte === "black");
      defringeButton.setAttribute("aria-pressed", String(edgeCorrection.defringe));
      decontaminateButton.setAttribute("aria-pressed", String(edgeCorrection.decontaminateAmount > 0));
      whiteButton.setAttribute("aria-pressed", String(edgeCorrection.matte === "white"));
      blackButton.setAttribute("aria-pressed", String(edgeCorrection.matte === "black"));

      const labels = [];
      if (edgeCorrection.defringe) labels.push(tr(`フリンジ ${edgeCorrection.width}px`, `Defringe ${edgeCorrection.width}px`));
      if (edgeCorrection.decontaminateAmount > 0) labels.push(tr(`不要色 ${percent}%`, `Decontaminate ${percent}%`));
      if (edgeCorrection.matte === "white") labels.push(tr("白マット", "White Matte"));
      if (edgeCorrection.matte === "black") labels.push(tr("黒マット", "Black Matte"));
      edgeState.textContent = labels.length ? labels.join(" / ") : text.edgeCorrectionNone[isEnglish() ? 1 : 0];
      edgeState.dataset.state = labels.length ? "applied" : "neutral";

      const disabled = !sourcePixels || !editedMask;
      for (const button of [defringeButton, decontaminateButton, whiteButton, blackButton, dialog.querySelector('[data-br-action="reset-edge-correction"]')]) button.disabled = disabled;
    }

    function commitEdgeCorrection(next, message) {
      if (!sourcePixels || !editedMask) {
        setStatus(tr("先に背景削除を実行してください。", "Run background removal first."), "error");
        return false;
      }
      const normalized = edgeCore.normalizeSettings(next);
      if (JSON.stringify(normalized) === JSON.stringify(edgeCorrection)) return false;
      pushHistory();
      edgeCorrection = normalized;
      invalidateCorrectedPixels();
      syncEdgeCorrectionUi();
      scheduleRender();
      setStatus(message, "ready");
      return true;
    }

    function copyMask(mask) {
      return mask ? new Uint8ClampedArray(mask) : null;
    }

    function editSnapshot() {
      return {
        mask: copyMask(editedMask),
        guideKeep: copyMask(guideKeepMask),
        guideRemove: copyMask(guideRemoveMask),
        guidedProcessed,
        guidedDirty,
        edgeCorrection: edgeCore.normalizeSettings(edgeCorrection),
      };
    }

    function copyEditSnapshot(snapshot) {
      return snapshot ? {
        mask: copyMask(snapshot.mask),
        guideKeep: copyMask(snapshot.guideKeep),
        guideRemove: copyMask(snapshot.guideRemove),
        guidedProcessed: Boolean(snapshot.guidedProcessed),
        guidedDirty: Boolean(snapshot.guidedDirty),
        edgeCorrection: edgeCore.normalizeSettings(snapshot.edgeCorrection),
      } : null;
    }

    function copySnapshotList(items) {
      return items.map(copyEditSnapshot);
    }

    function restoreEditSnapshot(snapshot) {
      editedMask = copyMask(snapshot?.mask);
      guideKeepMask = copyMask(snapshot?.guideKeep);
      guideRemoveMask = copyMask(snapshot?.guideRemove);
      guidedProcessed = Boolean(snapshot?.guidedProcessed);
      guidedDirty = Boolean(snapshot?.guidedDirty);
      edgeCorrection = edgeCore.normalizeSettings(snapshot?.edgeCorrection);
      if (edgeCorrection.decontaminateAmount <= 0) decontaminateDisplay = 50;
      markMaskChanged();
      syncEdgeCorrectionUi();
    }

    function saveActiveMaskModeState() {
      maskModeStates[maskMode] = sourcePixels ? {
        current: editSnapshot(),
        history: copySnapshotList(history),
        redo: copySnapshotList(redo),
      } : null;
    }

    function restoreMaskModeState(state) {
      restoreEditSnapshot(state?.current);
      history = state ? copySnapshotList(state.history) : [];
      redo = state ? copySnapshotList(state.redo) : [];
    }

    function initializeGuideMasks() {
      const length = resultCanvas.width * resultCanvas.height;
      guideKeepMask ||= new Uint8ClampedArray(length);
      guideRemoveMask ||= new Uint8ClampedArray(length);
    }

    function updateMaskModeUi() {
      dialog.querySelectorAll("[data-br-mask-mode]").forEach((button) => {
        const active = button.dataset.brMaskMode === maskMode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
        button.disabled = !aiInferenceAvailable;
      });
      const guided = maskMode === "guided";
      dialog.dataset.maskMode = maskMode;
      dialog.querySelector("[data-br-mask-mode-help]").textContent = text[!aiInferenceAvailable ? "manualMaskEditing" : guided ? "guidedMaskHelp" : "automaticMaskHelp"][isEnglish() ? 1 : 0];
      modelPanel.hidden = false;
      const keepButton = dialog.querySelector('[data-br-tool="keep"]');
      const eraseButton = dialog.querySelector('[data-br-tool="erase"]');
      keepButton.title = guided ? tr("必ず残す部分を緑で指定します (B)", "Mark areas that must be kept in green (B)") : tr("消した領域を復元します (B)", "Restore erased areas (B)");
      eraseButton.title = guided ? tr("必ず消す部分を赤で指定します (E)", "Mark areas that must be removed in red (E)") : tr("領域を透明にします (E)", "Erase areas to transparency (E)");
      const processState = dialog.querySelector("[data-br-process-state]");
      const processStateKey = !aiInferenceAvailable ? "manualMaskReady" : processingRunning ? "runningGuided" : guided ? (guidedProcessed && !guidedDirty ? "guidedApplied" : "guidedPending") : (aiMask ? "autoApplied" : "autoWaiting");
      processState.textContent = text[processStateKey][isEnglish() ? 1 : 0];
      processState.dataset.state = !aiInferenceAvailable ? "neutral" : guided ? (guidedProcessed && !guidedDirty ? "applied" : "pending") : "neutral";
      const runMask = dialog.querySelector('[data-br-action="run-mask"]');
      runMask.classList.toggle("guided", guided);
      runMask.disabled = !aiInferenceAvailable || !sourcePixels || processingRunning;
      const runTextKey = processingRunning ? "runningGuided" : guided ? (guidedProcessed ? "rerunGuided" : "runGuided") : (aiMask ? "rerunAutomatic" : "runAutomatic");
      runMask.textContent = text[!aiInferenceAvailable ? "aiUnavailable" : runTextKey][isEnglish() ? 1 : 0];
      if (!aiInferenceAvailable) displayModelStatus({ available: false, state: "unavailable", ready: false, progress: 0 });
      const reset = dialog.querySelector('[data-br-action="reset-mask"]');
      reset.textContent = text[guided ? "resetGuidedMask" : "resetAutoMask"][isEnglish() ? 1 : 0];
      selectTool(tool);
      updateHistoryButtons();
      syncEdgeCorrectionUi();
    }

    function selectTool(nextTool) {
      tool = nextTool;
      dialog.querySelectorAll("[data-br-tool]").forEach((button) => {
        const active = button.dataset.brTool === tool;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    }

    function updateEditToolUi() {
      dialog.dataset.editTool = editTool;
      dialog.querySelectorAll("[data-br-edit-tool]").forEach((button) => {
        const active = button.dataset.brEditTool === editTool;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      brushSettings.hidden = editTool !== "brush";
      wandSettings.hidden = editTool !== "wand";
      const wandActive = editTool === "wand" && !panTool;
      resultViewport.classList.toggle("background-removal-wand-active", wandActive);
      if (editTool !== "brush" || panTool) {
        brushCursor.hidden = true;
        cursorClient = null;
      }
    }

    function selectEditTool(nextTool) {
      if (!['brush', 'wand'].includes(nextTool)) return;
      editTool = nextTool;
      panTool = false;
      dialog.querySelectorAll('[data-br-action="pan"]').forEach((button) => button.classList.remove("active"));
      updateEditToolUi();
    }

    async function selectMaskMode(nextMode) {
      if (!aiInferenceAvailable) return;
      if (!['auto', 'guided'].includes(nextMode) || nextMode === maskMode) return;
      saveActiveMaskModeState();
      maskMode = nextMode;
      if (maskMode === "guided") inferenceRevision += 1;
      restoreMaskModeState(maskModeStates[maskMode]);
      if (maskMode === "guided" && sourcePixels) initializeGuideMasks();
      if (!editedMask && maskMode === "auto" && aiMask) {
        editedMask = new Uint8ClampedArray(aiMask);
        markMaskChanged();
      }
      selectTool(maskMode === "guided" ? "keep" : "erase");
      applyButton.disabled = maskMode === "guided" ? !guidedProcessed || guidedDirty : !editedMask;
      updateMaskModeUi();
      scheduleRender();
      if (maskMode === "auto" && !editedMask && source?.blob) await runMaskRemoval();
      else if (maskMode === "guided" && sourcePixels) setStatus(tr("残す部分・消す部分を塗ってから、背景削除を実行してください。", "Paint areas to keep or remove, then run background removal."), "info");
    }

    function pushHistory() {
      if (!sourcePixels) return;
      history.push(editSnapshot());
      while (history.length > historyLimit()) history.shift();
      redo = [];
      updateHistoryButtons();
    }

    function selectedRegionHasChange(indices, targetMask, targetValue, oppositeMask = null, oppositeValue = 0) {
      for (let offset = 0; offset < indices.length; offset += 1) {
        const index = indices[offset];
        if (targetMask[index] !== targetValue || (oppositeMask && oppositeMask[index] !== oppositeValue)) return true;
      }
      return false;
    }

    function applyMagicWand(point) {
      if (!sourcePixels || !sourceCanvas.width || !sourceCanvas.height) return;
      const x = Math.floor(point.x);
      const y = Math.floor(point.y);
      if (x < 0 || y < 0 || x >= sourceCanvas.width || y >= sourceCanvas.height) return;

      const selection = selectionCore.selectContiguousRgba(
        sourcePixels.data,
        sourceCanvas.width,
        sourceCanvas.height,
        x,
        y,
        Number(wandToleranceInput.value),
      );
      if (!selection.count) {
        setStatus(tr("選択できる領域がありません。", "No selectable region was found."), "info");
        return;
      }

      if (maskMode === "guided") {
        initializeGuideMasks();
        const selectedGuide = tool === "keep" ? guideKeepMask : guideRemoveMask;
        const oppositeGuide = tool === "keep" ? guideRemoveMask : guideKeepMask;
        if (!selectedRegionHasChange(selection.indices, selectedGuide, 255, oppositeGuide, 0)) {
          setStatus(tr("この領域はすでに同じ指定です。", "This region already has the same instruction."), "info");
          return;
        }
        pushHistory();
        for (let offset = 0; offset < selection.count; offset += 1) {
          const index = selection.indices[offset];
          selectedGuide[index] = 255;
          oppositeGuide[index] = 0;
        }
        guidedDirty = true;
        applyButton.disabled = true;
      } else {
        if (!editedMask) return;
        const targetValue = tool === "keep" ? 255 : 0;
        if (!selectedRegionHasChange(selection.indices, editedMask, targetValue)) {
          setStatus(tr("この領域はすでに同じ状態です。", "This region already has the same state."), "info");
          return;
        }
        pushHistory();
        for (let offset = 0; offset < selection.count; offset += 1) {
          editedMask[selection.indices[offset]] = targetValue;
        }
        applyButton.disabled = false;
      }

      markMaskChanged();
      updateMaskModeUi();
      scheduleRender();
      setStatus(
        tool === "keep"
          ? tr("自動選択した領域を残しました。", "Kept the automatically selected region.")
          : tr("自動選択した領域を消しました。必要に応じて残った色を追加クリックしてください。", "Removed the automatically selected region. Click remaining shades again when needed."),
        "ready",
      );
    }

    function processedMask() {
      if (!editedMask) return null;
      const threshold = Number(thresholdInput.value);
      const morph = Number(morphInput.value) || 0;
      const feather = Number(featherInput.value) || 0;
      const key = [maskRevision, threshold, morph, feather, fillHolesInput.checked ? 1 : 0, removeSmallInput.checked ? 1 : 0].join("|");
      if (processedMaskCache.key === key && processedMaskCache.value) return processedMaskCache.value;
      let output = new Uint8ClampedArray(editedMask.length);
      for (let index = 0; index < editedMask.length; index += 1) output[index] = editedMask[index] >= threshold ? editedMask[index] : 0;
      if (morph) output = morphMask(output, resultCanvas.width, resultCanvas.height, morph);
      if (fillHolesInput.checked) {
        const binary = new Uint8Array(output.length);
        for (let index = 0; index < output.length; index += 1) binary[index] = output[index] > 127 ? 1 : 0;
        output = fillBinaryHoles(binary, resultCanvas.width, resultCanvas.height);
      }
      if (removeSmallInput.checked) output = removeSmallComponents(output, resultCanvas.width, resultCanvas.height, Math.max(64, Math.round(output.length * 0.0005)));
      if (feather) output = featherMask(output, resultCanvas.width, resultCanvas.height, feather);
      processedMaskCache = { key, value: output };
      return output;
    }

    function correctedResultPixels(alpha) {
      const settings = edgeCore.normalizeSettings(edgeCorrection);
      const key = [sourceRevision, processedMaskCache.key, settings.width, settings.defringe ? 1 : 0, settings.decontaminateAmount, settings.matte].join("|");
      if (correctedPixelsCache.key === key && correctedPixelsCache.value) return correctedPixelsCache.value;
      const value = edgeCore.applyEdgeCorrection(sourcePixels.data, alpha, sourceCanvas.width, sourceCanvas.height, settings);
      correctedPixelsCache = { key, value };
      return value;
    }

    function scheduleRender() {
      if (renderQueued) return;
      renderQueued = true;
      requestAnimationFrame(() => {
        renderQueued = false;
        renderResult();
      });
    }

    function renderResult() {
      if (!sourcePixels) return;
      if (maskMode === "guided" && (!guidedProcessed || guidedDirty)) {
        const output = new ImageData(new Uint8ClampedArray(sourcePixels.data), sourceCanvas.width, sourceCanvas.height);
        for (let pixel = 0, offset = 0; pixel < guideKeepMask.length; pixel += 1, offset += 4) {
          const keep = guideKeepMask[pixel] / 255 * 0.62;
          const remove = guideRemoveMask[pixel] / 255 * 0.62;
          if (keep >= remove && keep > 0) {
            output.data[offset] = Math.round(output.data[offset] * (1 - keep) + 54 * keep);
            output.data[offset + 1] = Math.round(output.data[offset + 1] * (1 - keep) + 210 * keep);
            output.data[offset + 2] = Math.round(output.data[offset + 2] * (1 - keep) + 112 * keep);
          } else if (remove > 0) {
            output.data[offset] = Math.round(output.data[offset] * (1 - remove) + 255 * remove);
            output.data[offset + 1] = Math.round(output.data[offset + 1] * (1 - remove) + 64 * remove);
            output.data[offset + 2] = Math.round(output.data[offset + 2] * (1 - remove) + 64 * remove);
          }
          output.data[offset + 3] = 255;
        }
        resultContext.putImageData(output, 0, 0);
        updateResultCaption();
        return;
      }
      if (!editedMask) {
        resultContext.putImageData(sourcePixels, 0, 0);
        updateResultCaption();
        return;
      }
      const alpha = processedMask();
      const basePixels = viewMode === "mask"
        ? new Uint8ClampedArray(sourcePixels.data)
        : new Uint8ClampedArray(correctedResultPixels(alpha));
      const output = new ImageData(basePixels, sourceCanvas.width, sourceCanvas.height);
      const opacity = Number(opacityInput.value) / 100;
      for (let pixel = 0, offset = 0; pixel < alpha.length; pixel += 1, offset += 4) {
        if (viewMode === "result") {
          output.data[offset + 3] = alpha[pixel];
        } else if (viewMode === "mask") {
          output.data[offset] = output.data[offset + 1] = output.data[offset + 2] = alpha[pixel];
          output.data[offset + 3] = 255;
        } else {
          const strength = opacity * (1 - alpha[pixel] / 255);
          output.data[offset] = Math.round(output.data[offset] * (1 - strength) + 255 * strength);
          output.data[offset + 1] = Math.round(output.data[offset + 1] * (1 - strength) + 48 * strength);
          output.data[offset + 2] = Math.round(output.data[offset + 2] * (1 - strength) + 48 * strength);
          output.data[offset + 3] = 255;
        }
      }
      resultContext.putImageData(output, 0, 0);
      updateResultCaption();
    }

    function applyTransform() {
      for (const canvas of [sourceCanvas, resultCanvas]) {
        canvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
      }
      const percent = `${Math.round(view.scale * 100)}%`;
      dialog.querySelector("[data-br-zoom-source]").textContent = percent;
      dialog.querySelector("[data-br-zoom-result]").textContent = percent;
      if (cursorClient) updateBrushCursor(cursorClient.x, cursorClient.y);
    }

    function fitView() {
      if (!sourceCanvas.width) return;
      const width = Math.max(100, Math.min(sourceViewport.clientWidth, resultViewport.clientWidth) - 24);
      const height = Math.max(100, Math.min(sourceViewport.clientHeight, resultViewport.clientHeight) - 24);
      view.scale = clamp(Math.min(width / sourceCanvas.width, height / sourceCanvas.height), 0.02, 8);
      view.x = (resultViewport.clientWidth - sourceCanvas.width * view.scale) / 2;
      view.y = (resultViewport.clientHeight - sourceCanvas.height * view.scale) / 2;
      applyTransform();
    }

    function setScale(scale, clientX = null, clientY = null, viewport = resultViewport) {
      const nextScale = clamp(scale, 0.02, 8);
      if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
        const rect = viewport.getBoundingClientRect();
        const imageX = (clientX - rect.left - view.x) / view.scale;
        const imageY = (clientY - rect.top - view.y) / view.scale;
        view.x = clientX - rect.left - imageX * nextScale;
        view.y = clientY - rect.top - imageY * nextScale;
      }
      view.scale = nextScale;
      applyTransform();
    }

    function clientToImagePoint(clientX, clientY, viewport = resultViewport, shouldClamp = true) {
      const rect = viewport.getBoundingClientRect();
      const point = {
        x: (clientX - rect.left - view.x) / view.scale,
        y: (clientY - rect.top - view.y) / view.scale,
      };
      if (!shouldClamp) return point;
      return {
        x: clamp(point.x, 0, Math.max(0, resultCanvas.width - 1)),
        y: clamp(point.y, 0, Math.max(0, resultCanvas.height - 1)),
      };
    }

    function updateBrushCursor(clientX, clientY) {
      cursorClient = { x: clientX, y: clientY };
      const point = clientToImagePoint(clientX, clientY, resultViewport, false);
      const paintSurfaceReady = editedMask || (maskMode === "guided" && guideKeepMask && guideRemoveMask);
      const inImage = paintSurfaceReady && point.x >= 0 && point.y >= 0 && point.x <= resultCanvas.width && point.y <= resultCanvas.height;
      if (!inImage) {
        brushCursor.hidden = true;
        return;
      }
      const diameter = Number(brushInput.value) * view.scale;
      brushCursor.style.left = `${view.x + point.x * view.scale}px`;
      brushCursor.style.top = `${view.y + point.y * view.scale}px`;
      brushCursor.style.width = `${diameter}px`;
      brushCursor.style.height = `${diameter}px`;
      brushCursor.hidden = false;
    }

    function setBrushSize(value) {
      const next = Math.round(clamp(Number(value) || 120, 4, 512));
      brushInput.value = String(next);
      brushNumber.value = String(next);
      if (cursorClient) updateBrushCursor(cursorClient.x, cursorClient.y);
    }

    function actualView() {
      if (!sourceCanvas.width) return;
      view.scale = 1;
      view.x = (resultViewport.clientWidth - sourceCanvas.width) / 2;
      view.y = (resultViewport.clientHeight - sourceCanvas.height) / 2;
      applyTransform();
    }

    function scaleFromViewportCenter(factor) {
      const rect = resultViewport.getBoundingClientRect();
      setScale(view.scale * factor, rect.left + rect.width / 2, rect.top + rect.height / 2, resultViewport);
    }

    function paintLine(start, end) {
      const radius = Number(brushInput.value) / 2;
      const hardness = clamp(Number(brushHardnessInput.value) || 0, 0, 100) / 100;
      const distance = Math.hypot(end.x - start.x, end.y - start.y);
      const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.35)));
      for (let step = 0; step <= steps; step += 1) {
        const amount = step / steps;
        const centerX = start.x + (end.x - start.x) * amount;
        const centerY = start.y + (end.y - start.y) * amount;
        const radiusSquared = radius * radius;
        for (let y = Math.max(0, Math.floor(centerY - radius)); y <= Math.min(resultCanvas.height - 1, Math.ceil(centerY + radius)); y += 1) {
          const row = y * resultCanvas.width;
          for (let x = Math.max(0, Math.floor(centerX - radius)); x <= Math.min(resultCanvas.width - 1, Math.ceil(centerX + radius)); x += 1) {
            const distanceSquared = (x - centerX) ** 2 + (y - centerY) ** 2;
            if (distanceSquared > radiusSquared) continue;
            const normalizedDistance = Math.sqrt(distanceSquared) / radius;
            const strength = hardness >= 0.999 || normalizedDistance <= hardness
              ? 1
              : Math.max(0, (1 - normalizedDistance) / Math.max(0.001, 1 - hardness));
            const index = row + x;
            if (maskMode === "guided") {
              guidedDirty = true;
              const amount = Math.round(255 * strength);
              const selectedGuide = tool === "keep" ? guideKeepMask : guideRemoveMask;
              const oppositeGuide = tool === "keep" ? guideRemoveMask : guideKeepMask;
              selectedGuide[index] = Math.max(selectedGuide[index], amount);
              oppositeGuide[index] = Math.min(oppositeGuide[index], 255 - amount);
            } else {
              editedMask[index] = tool === "keep"
                ? Math.max(editedMask[index], Math.round(255 * strength))
                : Math.min(editedMask[index], Math.round(255 * (1 - strength)));
            }
          }
        }
      }
      markMaskChanged();
    }

    async function setSource(next) {
      if (!next?.blob || !String(next.blob.type || "").startsWith("image/")) return;
      closeBitmap();
      source = next;
      sourceBitmap = await imageBitmap(next.blob);
      source.width = sourceBitmap.width;
      source.height = sourceBitmap.height;
      sourceCanvas.width = resultCanvas.width = sourceBitmap.width;
      sourceCanvas.height = resultCanvas.height = sourceBitmap.height;
      sourceContext.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
      sourceContext.drawImage(sourceBitmap, 0, 0);
      sourcePixels = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
      edgeCorrection = edgeCore.defaultSettings();
      decontaminateDisplay = 50;
      markSourceChanged();
      inferenceRevision += 1;
      aiMask = editedMask = null;
      maskModeStates = { auto: null, guided: null };
      guideKeepMask = guideRemoveMask = null;
      guidedProcessed = false;
      guidedDirty = false;
      processingRunning = false;
      history = [];
      redo = [];
      editTool = "wand";
      panTool = false;
      dialog.querySelectorAll('[data-br-action="pan"]').forEach((button) => button.classList.remove("active"));
      updateEditToolUi();
      syncEdgeCorrectionUi();
      updateHistoryButtons();
      updateSourceBar();
      sourcePicker.hidden = true;
      if (!aiInferenceAvailable) {
        aiMask = new Uint8ClampedArray(sourceCanvas.width * sourceCanvas.height);
        aiMask.fill(255);
        editedMask = new Uint8ClampedArray(aiMask);
        markMaskChanged();
      }
      applyButton.disabled = !editedMask;
      requestAnimationFrame(fitView);
      if (!aiInferenceAvailable) {
        maskMode = "auto";
        updateMaskModeUi();
        scheduleRender();
        setStatus(text.manualMaskEditing[isEnglish() ? 1 : 0], "info");
      } else if (maskMode === "guided") {
        initializeGuideMasks();
        updateMaskModeUi();
        scheduleRender();
        setStatus(tr("残す部分・消す部分を塗ってから、背景削除を実行してください。", "Paint areas to keep or remove, then run background removal."), "info");
      } else {
        updateMaskModeUi();
        await runMaskRemoval();
      }
    }

    async function currentSource() {
      if (options.getMode() === "comic") {
        const candidates = await options.getComicSources();
        return candidates.find((candidate) => candidate.selected) || null;
      }
      return options.getSingleSource();
    }

    async function refreshSource() {
      const selected = await currentSource();
      if (!selected) {
        setStatus(options.getMode() === "comic"
          ? tr("画像トレイまたは画像入りコマを選択してください。", "Select an Image Tray item or a panel containing an image.")
          : tr("一枚画像を読み込んでください。", "Load a Single Image."), "error");
        applyButton.disabled = true;
        return;
      }
      await setSource(selected);
    }

    async function showSourcePicker() {
      sourcePicker.hidden = !sourcePicker.hidden;
      if (sourcePicker.hidden) return;
      const host = dialog.querySelector("[data-br-candidates]");
      host.replaceChildren();
      clearCandidateUrls();
      if (options.getMode() !== "comic") return;
      const candidates = await options.getComicSources();
      for (const candidate of candidates) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `background-removal-candidate${candidate.selected ? " selected" : ""}`;
        const image = document.createElement("img");
        const url = URL.createObjectURL(candidate.blob);
        candidateUrls.push(url);
        image.src = url;
        image.alt = "";
        const label = document.createElement("span");
        label.textContent = candidate.name;
        button.append(image, label);
        button.addEventListener("click", () => setSource(candidate));
        host.append(button);
      }
    }

    async function modelStatus() {
      if (!aiInferenceAvailable) {
        return { available: false, ready: false, state: "unavailable", progress: 0 };
      }
      const response = await fetch(`${aiApiBase}/model`);
      if (!response.ok) throw await responseError(response, tr("モデル状態を取得できません。", "Could not retrieve model status."));
      return response.json();
    }

    function displayModelStatus(model) {
      const output = dialog.querySelector("[data-br-model-status]");
      const progress = dialog.querySelector("[data-br-model-progress]");
      const cancel = dialog.querySelector('[data-br-action="cancel-download"]');
      const download = dialog.querySelector('[data-br-action="download-model"]');
      progress.value = Number(model.progress || 0);
      if (model.available === false || model.state === "unavailable") {
        cancel.hidden = true;
        download.hidden = true;
        progress.hidden = true;
        output.textContent = model.reason || model.error || text.aiUnavailable[isEnglish() ? 1 : 0];
        return;
      }
      progress.hidden = false;
      cancel.hidden = model.state !== "downloading";
      download.hidden = model.state === "downloading" || model.ready;
      if (model.ready) output.textContent = tr("isnet-anime：準備完了", "isnet-anime: Ready");
      else if (model.state === "downloading") output.textContent = `${tr("取得中", "Downloading")} ${Math.round(Number(model.progress || 0) * 100)}%`;
      else output.textContent = model.error || tr("未取得（約168 MB）", "Not downloaded (about 168 MB)");
    }

    async function startModelDownload() {
      if (!aiInferenceAvailable) throw new Error(text.aiUnavailable[isEnglish() ? 1 : 0]);
      const consent = confirm(tr(
        "AI背景削除モデル isnet-anime（約168 MB）を取得します。\n配布元: rembg GitHub Release\nモデル: Apache-2.0\n続行しますか？",
        "Download the isnet-anime AI background-removal model (about 168 MB)?\nDistribution: rembg GitHub Release\nModel: Apache-2.0",
      ));
      if (!consent) return false;
      const response = await fetch(`${aiApiBase}/model/download`, { method: "POST", body: "{}" });
      if (!response.ok) throw await responseError(response);
      displayModelStatus(await response.json());
      await waitForModel();
      return true;
    }

    async function waitForModel() {
      clearTimeout(pollTimer);
      const model = await modelStatus();
      displayModelStatus(model);
      if (model.ready) return model;
      if (model.state === "error") throw new Error(model.error || tr("モデルを取得できませんでした。", "Model download failed."));
      if (model.state !== "downloading") return model;
      await new Promise((resolve) => { pollTimer = setTimeout(resolve, 300); });
      return waitForModel();
    }

    async function ensureModelAndInfer(targetMode = maskMode) {
      if (!aiInferenceAvailable) {
        setStatus(text.manualMaskEditing[isEnglish() ? 1 : 0], "info");
        return false;
      }
      try {
        let model = await modelStatus();
        displayModelStatus(model);
        if (!model.ready) {
          const started = await startModelDownload();
          if (!started) {
            setStatus(tr("モデル取得をキャンセルしました。", "Model download was cancelled."), "info");
            return false;
          }
          model = await modelStatus();
        }
        if (model.ready && maskMode === targetMode) return infer(targetMode);
      } catch (error) {
        if (maskMode === targetMode) setStatus(error.message, "error");
      }
      return false;
    }

    function applyGuidedResult() {
      if (!aiMask || maskMode !== "guided") return false;
      initializeGuideMasks();
      pushHistory();
      editedMask = new Uint8ClampedArray(aiMask);
      for (let index = 0; index < editedMask.length; index += 1) {
        editedMask[index] = Math.max(editedMask[index], guideKeepMask[index]);
        editedMask[index] = Math.min(editedMask[index], 255 - guideRemoveMask[index]);
      }
      markMaskChanged();
      guidedProcessed = true;
      guidedDirty = false;
      applyButton.disabled = false;
      updateMaskModeUi();
      scheduleRender();
      setStatus(tr("範囲指定を反映して背景を削除しました。必要に応じて補正できます。", "Background removed with the guided selection. You can refine the result."), "ready");
      return true;
    }

    async function runMaskRemoval() {
      if (!source?.blob || processingRunning) return;
      if (!aiInferenceAvailable) {
        setStatus(text.manualMaskEditing[isEnglish() ? 1 : 0], "info");
        return;
      }
      const requestedMode = maskMode;
      processingRunning = true;
      updateMaskModeUi();
      setStatus(tr("AIで背景を解析しています…", "Analyzing the background with AI…"), "info");
      try {
        if (requestedMode === "guided" && aiMask) applyGuidedResult();
        else await ensureModelAndInfer(requestedMode);
      } finally {
        processingRunning = false;
        updateMaskModeUi();
      }
    }

    async function infer(targetMode = maskMode) {
      if (!source?.blob) return;
      if (!aiInferenceAvailable) {
        setStatus(text.manualMaskEditing[isEnglish() ? 1 : 0], "info");
        return false;
      }
      const requestRevision = ++inferenceRevision;
      const requestSource = source;
      processingRunning = true;
      applyButton.disabled = true;
      updateMaskModeUi();
      setStatus(tr("AIで背景を解析しています…", "Analyzing the background with AI…"), "info");
      try {
        const response = await fetch(`${aiApiBase}/infer`, {
          method: "POST",
          headers: { "Content-Type": source.blob.type || "application/octet-stream" },
          body: source.blob,
        });
        if (requestRevision !== inferenceRevision || requestSource !== source || maskMode !== targetMode) return false;
        if (!response.ok) throw await responseError(response, tr("背景削除に失敗しました。", "Background removal failed."));
        const maskBitmap = await imageBitmap(await response.blob());
        if (requestRevision !== inferenceRevision || requestSource !== source || maskMode !== targetMode) {
          maskBitmap.close?.();
          return false;
        }
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = sourceCanvas.width;
        maskCanvas.height = sourceCanvas.height;
        const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
        maskContext.drawImage(maskBitmap, 0, 0, maskCanvas.width, maskCanvas.height);
        const raw = maskContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
        aiMask = new Uint8ClampedArray(maskCanvas.width * maskCanvas.height);
        for (let offset = 0, pixel = 0; pixel < aiMask.length; offset += 4, pixel += 1) aiMask[pixel] = raw[offset];
        maskBitmap.close?.();
        if (targetMode === "guided") return applyGuidedResult();
        editedMask = new Uint8ClampedArray(aiMask);
        markMaskChanged();
        maskModeStates.auto = null;
        history = [];
        redo = [];
        updateHistoryButtons();
        applyButton.disabled = false;
        scheduleRender();
        setStatus(tr("AIマスクを作成しました。右側で補正できます。", "AI mask created. You can refine it on the right."), "ready");
        return true;
      } finally {
        if (requestRevision === inferenceRevision) {
          processingRunning = false;
          updateMaskModeUi();
        }
      }
    }

    function maskBlob() {
      const alpha = processedMask();
      const output = new ImageData(new Uint8ClampedArray(correctedResultPixels(alpha)), sourceCanvas.width, sourceCanvas.height);
      const canvas = document.createElement("canvas");
      canvas.width = sourceCanvas.width;
      canvas.height = sourceCanvas.height;
      canvas.getContext("2d").putImageData(output, 0, 0);
      return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG generation failed")), "image/png"));
    }

    async function applyResult() {
      if (!editedMask || !source) return;
      applyButton.disabled = true;
      try {
        const blob = await maskBlob();
        const base = String(source.name || "background-removed").replace(/\.[^.]+$/, "");
        const name = `${base}-no-bg.png`;
        const applied = options.getMode() === "comic"
          ? await options.addPageImage(blob, name)
          : await options.applySingleImage(blob, name);
        if (applied === false) throw new Error(tr("編集画面へ適用できませんでした。", "Could not apply the result to the editor."));
        setStatus(options.getMode() === "comic" ? tr("画像トレイへ追加しました。", "Added to the Image Tray.") : tr("一枚画像へ適用しました。", "Applied to Single Image."), "ready");
        closeDialog();
      } catch (error) {
        applyButton.disabled = false;
        setStatus(error.message, "error");
      }
    }

    function readGeometry() {
      try { return JSON.parse(localStorage.getItem(GEOMETRY_KEY) || "{}"); } catch { return {}; }
    }

    function restoreGeometry() {
      const saved = readGeometry();
      const width = Math.min(innerWidth - 20, Math.max(900, Number(saved.width) || 1320));
      const height = Math.min(innerHeight - 20, Math.max(620, Number(saved.height) || 820));
      dialog.style.width = `${width}px`;
      dialog.style.height = `${height}px`;
      if (Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
        dialog.style.left = `${clamp(saved.left, 8, innerWidth - width - 8)}px`;
        dialog.style.top = `${clamp(saved.top, 8, innerHeight - height - 8)}px`;
        dialog.style.margin = "0";
      }
    }

    function saveGeometry() {
      if (!dialog.open || dialog.classList.contains("maximized")) return;
      const rect = dialog.getBoundingClientRect();
      try { localStorage.setItem(GEOMETRY_KEY, JSON.stringify({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })); } catch {}
    }

    function closeDialog() {
      saveGeometry();
      dialog.close();
    }

    launcher.addEventListener("click", async () => {
      dialog.showModal();
      restoreGeometry();
      applyLanguage();
      setStatus(tr("画像を確認しています…", "Checking the image…"));
      await refreshSource();
    });

    dialog.addEventListener("click", async (event) => {
      const maskModeButton = event.target.closest("[data-br-mask-mode]");
      if (maskModeButton) {
        await selectMaskMode(maskModeButton.dataset.brMaskMode);
        return;
      }
      const toolButton = event.target.closest("[data-br-tool]");
      if (toolButton) {
        selectTool(toolButton.dataset.brTool);
        panTool = false;
        dialog.querySelectorAll('[data-br-action="pan"]').forEach((button) => button.classList.remove("active"));
        updateEditToolUi();
        return;
      }
      const editToolButton = event.target.closest("[data-br-edit-tool]");
      if (editToolButton) {
        selectEditTool(editToolButton.dataset.brEditTool);
        return;
      }
      const action = event.target.closest("[data-br-action]")?.dataset.brAction;
      if (!action) return;
      if (action === "close" || action === "cancel") closeDialog();
      else if (action === "maximize") {
        dialog.classList.toggle("maximized");
        event.target.textContent = dialog.classList.contains("maximized") ? "❐" : "□";
        applyLanguage();
        requestAnimationFrame(fitView);
      } else if (action === "change-source") await showSourcePicker();
      else if (action === "choose-file") fileInput.click();
      else if (action === "download-model") {
        try {
          const started = await startModelDownload();
          if (started && source && maskMode === "auto") await infer("auto");
        } catch (error) {
          setStatus(error.message, "error");
        }
      }
      else if (action === "cancel-download" && aiInferenceAvailable) await fetch(`${aiApiBase}/model/cancel`, { method: "POST", body: "{}" });
      else if (action === "run-mask") await runMaskRemoval();
      else if (action === "zoom-in") scaleFromViewportCenter(1.2);
      else if (action === "zoom-out") scaleFromViewportCenter(1 / 1.2);
      else if (action === "fit") fitView();
      else if (action === "actual") actualView();
      else if (action === "pan") {
        panTool = !panTool;
        dialog.querySelectorAll('[data-br-action="pan"]').forEach((button) => button.classList.toggle("active", panTool));
        updateEditToolUi();
      } else if (action === "apply-defringe") {
        commitEdgeCorrection({
          ...edgeCorrection,
          width: Number(defringeWidthInput.value),
          defringe: true,
        }, tr("フリンジ削除を適用しました。", "Defringe applied."));
      } else if (action === "apply-decontaminate") {
        decontaminateDisplay = Math.round(clamp(Number(decontaminateInput.value) || 0, 0, 100));
        commitEdgeCorrection({
          ...edgeCorrection,
          width: Number(defringeWidthInput.value),
          decontaminateAmount: edgeCorrection.decontaminateAmount > 0 ? 0 : decontaminateDisplay / 100,
        }, edgeCorrection.decontaminateAmount > 0
          ? tr("不要なカラーの補正を解除しました。", "Color decontamination cleared.")
          : tr("不要なカラーを補正しました。", "Edge colors were decontaminated."));
      } else if (action === "remove-white-matte") {
        commitEdgeCorrection({
          ...edgeCorrection,
          matte: edgeCorrection.matte === "white" ? "none" : "white",
        }, tr("白マット補正を更新しました。", "White matte correction updated."));
      } else if (action === "remove-black-matte") {
        commitEdgeCorrection({
          ...edgeCorrection,
          matte: edgeCorrection.matte === "black" ? "none" : "black",
        }, tr("黒マット補正を更新しました。", "Black matte correction updated."));
      } else if (action === "reset-edge-correction") {
        decontaminateDisplay = 50;
        commitEdgeCorrection(edgeCore.defaultSettings(), tr("エッジカラー補正を解除しました。", "Edge color correction cleared."));
      } else if (action === "undo" && history.length) {
        redo.push(editSnapshot());
        restoreEditSnapshot(history.pop());
        updateHistoryButtons();
        applyButton.disabled = maskMode === "guided" ? !guidedProcessed || guidedDirty : !editedMask;
        updateMaskModeUi();
        scheduleRender();
      } else if (action === "redo" && redo.length) {
        history.push(editSnapshot());
        while (history.length > historyLimit()) history.shift();
        restoreEditSnapshot(redo.pop());
        updateHistoryButtons();
        applyButton.disabled = maskMode === "guided" ? !guidedProcessed || guidedDirty : !editedMask;
        updateMaskModeUi();
        scheduleRender();
      } else if (action === "reset-mask") {
        if (maskMode === "auto" && aiMask) {
          pushHistory();
          editedMask = new Uint8ClampedArray(aiMask);
          markMaskChanged();
          resetMaskCorrections();
          updateMaskModeUi();
          scheduleRender();
          setStatus(tr("自動マスクを初期状態に戻しました。", "Automatic mask reset to its initial state."), "ready");
        } else if (maskMode === "guided" && sourcePixels) {
          pushHistory();
          editedMask = null;
          guideKeepMask = guideRemoveMask = null;
          markMaskChanged();
          guidedProcessed = false;
          guidedDirty = false;
          initializeGuideMasks();
          resetMaskCorrections();
          applyButton.disabled = true;
          updateMaskModeUi();
          scheduleRender();
          setStatus(tr("範囲指定をリセットしました。", "Guided selection reset."), "info");
        }
      } else if (action === "apply") await applyResult();
    });

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (file) await setSource({ blob: file, name: file.name });
    });

    const drop = dialog.querySelector("[data-br-drop]");
    drop.addEventListener("dragover", (event) => { event.preventDefault(); drop.classList.add("drag-active"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag-active"));
    drop.addEventListener("drop", async (event) => {
      event.preventDefault();
      drop.classList.remove("drag-active");
      const file = Array.from(event.dataTransfer?.files || []).find((item) => String(item.type).startsWith("image/"));
      if (file) await setSource({ blob: file, name: file.name });
    });

    function bindRangeAndNumber(range, number, minimum, maximum, onChange) {
      const update = (value) => {
        const next = clamp(Number(value) || 0, minimum, maximum);
        range.value = String(next);
        number.value = String(next);
        onChange(next);
      };
      range.addEventListener("input", () => update(range.value));
      number.addEventListener("input", () => update(number.value));
    }

    bindRangeAndNumber(brushInput, brushNumber, 4, 512, setBrushSize);
    bindRangeAndNumber(brushHardnessInput, brushHardnessNumber, 0, 100, scheduleRender);
    bindRangeAndNumber(wandToleranceInput, wandToleranceNumber, 0, 255, () => {});
    bindRangeAndNumber(thresholdInput, thresholdNumber, 0, 255, scheduleRender);
    bindRangeAndNumber(opacityInput, opacityNumber, 10, 90, scheduleRender);
    bindRangeAndNumber(morphInput, morphNumber, -10, 10, scheduleRender);
    bindRangeAndNumber(featherInput, featherNumber, 0, 12, scheduleRender);
    for (const input of [fillHolesInput, removeSmallInput]) input.addEventListener("change", scheduleRender);
    defringeWidthInput.addEventListener("change", () => {
      const width = Math.round(clamp(Number(defringeWidthInput.value) || 1, 1, edgeCore.MAX_EDGE_WIDTH));
      defringeWidthInput.value = String(width);
      if (edgeWidthActive() && width !== edgeCorrection.width) {
        commitEdgeCorrection({ ...edgeCorrection, width }, tr("フリンジ幅を更新しました。", "Edge width updated."));
      } else {
        edgeCorrection = edgeCore.normalizeSettings({ ...edgeCorrection, width });
      }
    });
    const updateDecontaminateControl = (value) => {
      decontaminateDisplay = Math.round(clamp(Number(value) || 0, 0, 100));
      decontaminateInput.value = String(decontaminateDisplay);
      decontaminateNumber.value = String(decontaminateDisplay);
      if (edgeCorrection.decontaminateAmount <= 0) return;
      const nextAmount = decontaminateDisplay / 100;
      if (nextAmount === edgeCorrection.decontaminateAmount) return;
      if (!edgeControlEditing) {
        pushHistory();
        edgeControlEditing = true;
      }
      edgeCorrection = edgeCore.normalizeSettings({
        ...edgeCorrection,
        width: Number(defringeWidthInput.value),
        decontaminateAmount: nextAmount,
      });
      invalidateCorrectedPixels();
      syncEdgeCorrectionUi();
      scheduleRender();
    };
    decontaminateInput.addEventListener("input", () => updateDecontaminateControl(decontaminateInput.value));
    decontaminateNumber.addEventListener("input", () => updateDecontaminateControl(decontaminateNumber.value));
    const finishEdgeControlEdit = () => { edgeControlEditing = false; syncEdgeCorrectionUi(); };
    decontaminateInput.addEventListener("change", finishEdgeControlEdit);
    decontaminateNumber.addEventListener("change", finishEdgeControlEdit);
    decontaminateNumber.addEventListener("blur", finishEdgeControlEdit);
    viewSelect.addEventListener("change", () => {
      viewMode = viewSelect.value;
      dialog.querySelector("[data-br-overlay-row]").hidden = viewMode !== "overlay";
      scheduleRender();
    });

    function beginViewportPointer(event, viewport, editable) {
      if (!sourceCanvas.width) return;
      if (!editable && event.button !== 1 && !(event.button === 0 && panTool)) return;
      if (editable && !editedMask && maskMode !== "guided") return;
      event.preventDefault();
      if (editable && event.button === 2 && editTool !== "brush") return;
      if (editable && event.button === 0 && editTool === "wand" && !panTool) {
        applyMagicWand(clientToImagePoint(event.clientX, event.clientY, resultViewport, false));
        return;
      }
      viewport.setPointerCapture(event.pointerId);
      lastClient = { x: event.clientX, y: event.clientY };
      if (editable && event.button === 2) {
        brushResizeState = { pointerId: event.pointerId, startClientX: event.clientX, startSize: Number(brushInput.value) };
        resultViewport.style.cursor = "ew-resize";
      } else if (event.button === 1 || (event.button === 0 && panTool)) {
        panning = true;
        viewport.style.cursor = "grabbing";
      } else if (editable && event.button === 0) {
        pushHistory();
        drawing = true;
        lastPoint = clientToImagePoint(event.clientX, event.clientY, resultViewport);
        paintLine(lastPoint, lastPoint);
        scheduleRender();
      }
    }

    function moveViewportPointer(event, viewport, editable) {
      if (editable && editTool === "brush" && !panTool) updateBrushCursor(event.clientX, event.clientY);
      else if (editable) {
        brushCursor.hidden = true;
      }
      if (brushResizeState) {
        if (event.pointerId !== brushResizeState.pointerId) return;
        event.preventDefault();
        setBrushSize(brushResizeState.startSize + (event.clientX - brushResizeState.startClientX));
        return;
      }
      if (!lastClient) return;
      event.preventDefault();
      if (panning) {
        view.x += event.clientX - lastClient.x;
        view.y += event.clientY - lastClient.y;
        applyTransform();
      } else if (editable && drawing) {
        const point = clientToImagePoint(event.clientX, event.clientY, resultViewport);
        paintLine(lastPoint, point);
        lastPoint = point;
        scheduleRender();
      }
      lastClient = { x: event.clientX, y: event.clientY };
    }

    function endViewportPointer(event) {
      if (brushResizeState && event?.pointerId !== undefined && event.pointerId !== brushResizeState.pointerId) return;
      drawing = false;
      panning = false;
      brushResizeState = null;
      lastPoint = null;
      lastClient = null;
      sourceViewport.style.cursor = "";
      resultViewport.style.cursor = "";
      updateHistoryButtons();
      if (maskMode === "guided" && guidedDirty) {
        applyButton.disabled = true;
        updateMaskModeUi();
      }
    }

    for (const [viewport, editable] of [[sourceViewport, false], [resultViewport, true]]) {
      viewport.addEventListener("pointerdown", (event) => beginViewportPointer(event, viewport, editable));
      viewport.addEventListener("pointermove", (event) => moveViewportPointer(event, viewport, editable));
      viewport.addEventListener("pointerup", endViewportPointer);
      viewport.addEventListener("pointercancel", endViewportPointer);
      viewport.addEventListener("lostpointercapture", endViewportPointer);
      viewport.addEventListener("wheel", (event) => {
        if (!sourceCanvas.width) return;
        event.preventDefault();
        setScale(view.scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12), event.clientX, event.clientY, viewport);
      }, { passive: false });
    }
    resultViewport.addEventListener("pointerleave", (event) => {
      if (event.buttons) return;
      brushCursor.hidden = true;
      cursorClient = null;
    });
    resultViewport.addEventListener("contextmenu", (event) => event.preventDefault());

    let moving = null;
    const dragHandle = dialog.querySelector("[data-bg-remove-drag-handle]");
    dragHandle.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button") || dialog.classList.contains("maximized")) return;
      const rect = dialog.getBoundingClientRect();
      moving = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      dragHandle.setPointerCapture(event.pointerId);
    });
    dragHandle.addEventListener("pointermove", (event) => {
      if (!moving) return;
      const rect = dialog.getBoundingClientRect();
      dialog.style.margin = "0";
      dialog.style.left = `${clamp(event.clientX - moving.x, 8, innerWidth - rect.width - 8)}px`;
      dialog.style.top = `${clamp(event.clientY - moving.y, 8, innerHeight - rect.height - 8)}px`;
    });
    dragHandle.addEventListener("pointerup", () => { moving = null; saveGeometry(); });
    new ResizeObserver(() => { saveGeometry(); if (dialog.open) requestAnimationFrame(fitView); }).observe(dialog);
    dialog.addEventListener("close", () => {
      inferenceRevision += 1;
      clearTimeout(pollTimer);
      clearCandidateUrls();
      clearSourceThumbUrl();
      closeBitmap();
      source = null;
      aiMask = editedMask = sourcePixels = null;
      edgeCorrection = edgeCore.defaultSettings();
      decontaminateDisplay = 50;
      markSourceChanged();
      maskModeStates = { auto: null, guided: null };
      guideKeepMask = guideRemoveMask = null;
      guidedProcessed = false;
      guidedDirty = false;
      processingRunning = false;
      maskMode = "auto";
      selectTool("erase");
      editTool = "wand";
      panTool = false;
      updateEditToolUi();
      sourceContext.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
      resultContext.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
      updateSourceBar();
      updateMaskModeUi();
      syncEdgeCorrectionUi();
      applyButton.disabled = true;
    });
    document.addEventListener("keydown", (event) => {
      if (!dialog.open) return;
      const active = document.activeElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(active?.tagName) || active?.isContentEditable) return;
      if (!event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === "b") { event.preventDefault(); dialog.querySelector('[data-br-tool="keep"]').click(); }
      else if (!event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === "e") { event.preventDefault(); dialog.querySelector('[data-br-tool="erase"]').click(); }
      else if (event.ctrlKey && event.key === "0") { event.preventDefault(); fitView(); }
      else if (event.ctrlKey && event.key.toLowerCase() === "z" && !event.shiftKey) dialog.querySelector('[data-br-action="undo"]').click();
      else if ((event.ctrlKey && event.key.toLowerCase() === "y") || (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "z")) dialog.querySelector('[data-br-action="redo"]').click();
    });
    root.addEventListener("speech-bubble:language-change", applyLanguage);
    applyLanguage();

    return { open: () => launcher.click(), refreshSource, close: closeDialog };
  }

  root.SpeechBubbleBackgroundRemoval = { create };
})(window);
