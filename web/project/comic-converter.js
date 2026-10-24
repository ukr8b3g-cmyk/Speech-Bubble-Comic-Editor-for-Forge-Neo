(function (root) {
  "use strict";

  const PREVIEW_LONG_EDGE = 768;
  const HISTORY_DB = "speech-bubble-editor-comic-converter";
  const HISTORY_STORE = "history";
  const HISTORY_MAX_PER_DOCUMENT = 5;
  const HISTORY_MAX_BYTES = 512 * 1024 * 1024;
  const HISTORY_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
  const GEOMETRY_KEY = "speech-bubble-editor:comic-converter-geometry:v1";
  const SETTINGS_KEY = "speech-bubble-editor:comic-converter-settings:v1";
  const tr = (japanese, english) => document.documentElement.lang === "en" ? english : japanese;
  const DEFAULTS = Object.freeze({
    mode: "grayscale",
    brightness: 0,
    contrast: 1.04,
    gamma: 1,
    smoothRadius: 2,
    posterLevels: 5,
    edgeThreshold: 0.055,
    edgeStrength: 0.3,
    toneStrength: 0,
    colorEdgeWeight: 1.25,
    lineCleanup: 0.04,
    preserveTones: true,
    solidBlack: true,
    sigma: 0.8,
    epsilon: -0.005,
    phi: 45,
    lineStrength: 0.95,
    k: 1.6,
    tau: 0.995,
  });
  const PRESET_SETTINGS = Object.freeze({
    comic: { ...DEFAULTS, mode: "comic" },
    grayscale: { ...DEFAULTS, mode: "grayscale" },
    monochrome: { ...DEFAULTS, mode: "monochrome" },
    xdog100: { ...DEFAULTS, mode: "xdog", lineStrength: 1, preserveTones: false, solidBlack: false },
  });
  const CONTROL_DEFS = [
    ["brightness", "明るさ", -100, 100, 1, 0],
    ["contrast", "コントラスト", 0.5, 2.5, 0.01, 2],
    ["gamma", "ガンマ", 0.4, 2.5, 0.01, 2],
    ["smoothRadius", "エッジ保持平滑化", 0, 5, 1, 0],
    ["posterLevels", "階調数", 2, 6, 0.5, 1],
    ["edgeThreshold", "主要輪郭しきい値", 0.015, 0.25, 0.005, 3],
    ["edgeStrength", "主要輪郭の濃さ", 0, 2.5, 0.05, 2],
    ["toneStrength", "網点・ディザ量", 0, 1, 0.05, 2],
    ["colorEdgeWeight", "色境界の検出", 0, 2.5, 0.05, 2],
    ["lineCleanup", "薄いノイズ除去", 0, 0.2, 0.005, 3],
  ];
  const XDOG_DEFS = [
    ["sigma", "線の太さ σ", 0.3, 3, 0.05, 2],
    ["epsilon", "細部・白抜け ε", -0.3, 0.2, 0.005, 3],
    ["phi", "線の硬さ φ", 1, 100, 1, 0],
    ["lineStrength", "線の濃さ", 0.3, 3, 0.05, 2],
    ["k", "Gaussian倍率 k", 1.1, 3, 0.05, 2],
    ["tau", "差分強度 τ", 0.8, 1.1, 0.005, 3],
  ];

  const workerSource = String.raw`
    let image = null;
    let grayCache = null;
    let grayKey = "";
    let blurCache = null;
    let blurKey = "";
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    function adjustedGray(params) {
      const key = [params.brightness, params.contrast, params.gamma].join("|");
      if (grayCache && grayKey === key) return grayCache;
      const src = image.data;
      const out = new Float32Array(image.width * image.height);
      const brightness = params.brightness / 255;
      const contrast = params.contrast;
      const invGamma = 1 / Math.max(0.01, params.gamma);
      for (let p = 0, i = 0; p < out.length; p++, i += 4) {
        const alpha = src[i + 3] / 255;
        let y = (0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2]) / 255;
        y = y * alpha + (1 - alpha);
        y = clamp((y - 0.5) * contrast + 0.5 + brightness, 0, 1);
        out[p] = Math.pow(y, invGamma);
      }
      grayCache = out;
      grayKey = key;
      blurCache = null;
      blurKey = "";
      return out;
    }
    function gaussianKernel(sigma) {
      const radius = Math.max(1, Math.ceil(sigma * 3));
      const kernel = new Float32Array(radius * 2 + 1);
      let sum = 0;
      for (let i = -radius; i <= radius; i++) {
        const value = Math.exp(-(i * i) / (2 * sigma * sigma));
        kernel[i + radius] = value;
        sum += value;
      }
      for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
      return {kernel, radius};
    }
    function gaussianBlur(src, width, height, sigma) {
      const {kernel, radius} = gaussianKernel(Math.max(0.1, sigma));
      const temp = new Float32Array(src.length);
      const out = new Float32Array(src.length);
      for (let y = 0; y < height; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
          let sum = 0;
          for (let j = -radius; j <= radius; j++) {
            const sx = clamp(x + j, 0, width - 1);
            sum += src[row + sx] * kernel[j + radius];
          }
          temp[row + x] = sum;
        }
      }
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let sum = 0;
          for (let j = -radius; j <= radius; j++) {
            const sy = clamp(y + j, 0, height - 1);
            sum += temp[sy * width + x] * kernel[j + radius];
          }
          out[y * width + x] = sum;
        }
      }
      return out;
    }
    function edgePreservingSmooth(src, width, height, radius) {
      if (radius <= 0) return src;
      const out = new Float32Array(src.length);
      const spatialSigma = Math.max(0.8, radius * 0.8);
      const rangeSigma = 0.12;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const center = src[y * width + x];
          let sum = 0, weightSum = 0;
          for (let dy = -radius; dy <= radius; dy++) {
            const sy = clamp(y + dy, 0, height - 1);
            for (let dx = -radius; dx <= radius; dx++) {
              const sx = clamp(x + dx, 0, width - 1);
              const sample = src[sy * width + sx];
              const spatial = Math.exp(-(dx * dx + dy * dy) / (2 * spatialSigma * spatialSigma));
              const range = Math.exp(-Math.pow(sample - center, 2) / (2 * rangeSigma * rangeSigma));
              const weight = spatial * range;
              sum += sample * weight;
              weightSum += weight;
            }
          }
          out[y * width + x] = sum / Math.max(1e-6, weightSum);
        }
      }
      return out;
    }
    function toRgba(values) {
      const rgba = new Uint8ClampedArray(values.length * 4);
      for (let p = 0, i = 0; p < values.length; p++, i += 4) {
        const value = Math.round(clamp(values[p], 0, 1) * 255);
        rgba[i] = rgba[i + 1] = rgba[i + 2] = value;
        rgba[i + 3] = image.data[i + 3];
      }
      return rgba;
    }
    function comicRender(gray, width, height, params) {
      const smooth = edgePreservingSmooth(gray, width, height, Math.round(params.smoothRadius));
      const levels = Math.max(2, params.posterLevels);
      const values = new Float32Array(gray.length);
      const edgeMap = new Float32Array(gray.length);
      const src = image.data;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = y * width + x;
          const xl = Math.max(0, x - 1), xr = Math.min(width - 1, x + 1);
          const yu = Math.max(0, y - 1), yd = Math.min(height - 1, y + 1);
          const grayEdge = Math.sqrt(
            (smooth[y * width + xr] - smooth[y * width + xl]) ** 2 +
            (smooth[yd * width + x] - smooth[yu * width + x]) ** 2
          );
          const li = (y * width + xl) * 4, ri = (y * width + xr) * 4;
          const ui = (yu * width + x) * 4, di = (yd * width + x) * 4;
          let colorSq = 0;
          for (let c = 0; c < 3; c++) {
            const dx = (src[ri + c] - src[li + c]) / 255;
            const dy = (src[di + c] - src[ui + c]) / 255;
            colorSq += dx * dx + dy * dy;
          }
          const combined = Math.max(grayEdge, Math.sqrt(colorSq / 6) * params.colorEdgeWeight);
          edgeMap[i] = clamp((combined - params.edgeThreshold) / Math.max(0.001, 0.30 - params.edgeThreshold), 0, 1);
        }
      }
      const g1 = gaussianBlur(smooth, width, height, Math.max(0.3, params.sigma));
      const g2 = gaussianBlur(smooth, width, height, Math.max(0.3, params.sigma) * params.k);
      const bayer4 = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = y * width + x;
          let base = params.preserveTones ? Math.round(smooth[i] * (levels - 1)) / (levels - 1) : 1;
          if (params.preserveTones && params.solidBlack && base < 0.22) base = 0;
          const dog = g1[i] - params.tau * g2[i];
          const xdog = dog >= params.epsilon ? 1 : 1 + Math.tanh(params.phi * (dog - params.epsilon));
          let fineAmount = (1 - clamp(xdog, 0, 1)) * params.lineStrength;
          if (fineAmount < params.lineCleanup) fineAmount = 0;
          let value = Math.min(base, 1 - fineAmount, 1 - edgeMap[i] * params.edgeStrength);
          if (params.preserveTones && params.toneStrength > 0 && value > 0.08 && value < 0.96) {
            const d = (bayer4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
            const toned = d < value ? 1 : 0;
            value = value * (1 - params.toneStrength) + toned * params.toneStrength;
          }
          values[i] = clamp(value, 0, 1);
        }
      }
      return values;
    }
    function processImage(params) {
      const started = performance.now();
      const gray = adjustedGray(params);
      let values;
      if (params.mode === "grayscale") {
        values = gray;
      } else if (params.mode === "monochrome") {
        values = new Float32Array(gray.length);
        for (let i = 0; i < gray.length; i++) values[i] = gray[i] >= 0.5 ? 1 : 0;
      } else if (params.mode === "xdog") {
        const g1 = gaussianBlur(gray, image.width, image.height, Math.max(0.3, params.sigma));
        const g2 = gaussianBlur(gray, image.width, image.height, Math.max(0.3, params.sigma) * params.k);
        values = new Float32Array(gray.length);
        for (let i = 0; i < gray.length; i++) {
          const dog = g1[i] - params.tau * g2[i];
          const xdog = dog >= params.epsilon ? 1 : 1 + Math.tanh(params.phi * (dog - params.epsilon));
          values[i] = clamp(1 - (1 - clamp(xdog, 0, 1)) * params.lineStrength, 0, 1);
        }
      } else {
        values = comicRender(gray, image.width, image.height, params);
      }
      const rgba = toRgba(values);
      return {rgba, total: performance.now() - started};
    }
    self.onmessage = event => {
      const message = event.data;
      if (message.type !== "process") return;
      image = {width: message.width, height: message.height, data: new Uint8ClampedArray(message.buffer)};
      grayCache = blurCache = null;
      grayKey = blurKey = "";
      const result = processImage(message.params);
      self.postMessage({
        type: "result", requestId: message.requestId, width: image.width, height: image.height,
        buffer: result.rgba.buffer, total: result.total
      }, [result.rgba.buffer]);
    };
  `;

  function openHistoryDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(HISTORY_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(HISTORY_STORE)) {
          const store = db.createObjectStore(HISTORY_STORE, { keyPath: "id" });
          store.createIndex("documentId", "documentId", { unique: false });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function historyRecords() {
    const db = await openHistoryDb();
    const records = await new Promise((resolve, reject) => {
      const transaction = db.transaction(HISTORY_STORE, "readonly");
      const request = transaction.objectStore(HISTORY_STORE).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return records;
  }

  async function deleteHistoryIds(ids) {
    if (!ids.length) return;
    const db = await openHistoryDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(HISTORY_STORE, "readwrite");
      const store = transaction.objectStore(HISTORY_STORE);
      ids.forEach((id) => store.delete(id));
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }

  async function pruneHistory() {
    const records = await historyRecords();
    const now = Date.now();
    const remove = new Set(records.filter((item) => now - Number(item.updatedAt || 0) > HISTORY_MAX_AGE).map((item) => item.id));
    const byDocument = new Map();
    for (const record of records) {
      if (remove.has(record.id)) continue;
      const list = byDocument.get(record.documentId) || [];
      list.push(record);
      byDocument.set(record.documentId, list);
    }
    for (const list of byDocument.values()) {
      list.sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt));
      list.slice(HISTORY_MAX_PER_DOCUMENT).forEach((item) => remove.add(item.id));
    }
    const retained = records
      .filter((item) => !remove.has(item.id))
      .sort((a, b) => Number(a.updatedAt) - Number(b.updatedAt));
    let total = retained.reduce((sum, item) => sum + (Number(item?.blob?.size) || 0), 0);
    for (const record of retained) {
      if (total <= HISTORY_MAX_BYTES) break;
      remove.add(record.id);
      total -= Number(record?.blob?.size) || 0;
    }
    await deleteHistoryIds([...remove]);
  }

  async function storeHistory(documentId, blob, name) {
    if (!documentId || !(blob instanceof Blob)) return;
    const db = await openHistoryDb();
    const historyId = `${documentId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(HISTORY_STORE, "readwrite");
      transaction.objectStore(HISTORY_STORE).put({
        id: historyId,
        documentId,
        name: String(name || "変換前画像"),
        blob,
        updatedAt: Date.now(),
      });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
    await pruneHistory();
    return historyId;
  }

  async function clearHistory() {
    const db = await openHistoryDb();
    const removed = await new Promise((resolve, reject) => {
      const transaction = db.transaction(HISTORY_STORE, "readwrite");
      const store = transaction.objectStore(HISTORY_STORE);
      const count = store.count();
      count.onsuccess = () => {
        const value = Number(count.result) || 0;
        store.clear();
        resolve(value);
      };
      count.onerror = () => reject(count.error);
    });
    db.close();
    return { removed };
  }

  function fieldMarkup([key, label, min, max, step]) {
    return `<label class="comic-converter-field"><span>${label}</span><span class="comic-converter-control"><input data-converter-range="${key}" type="range" min="${min}" max="${max}" step="${step}"><input data-converter-number="${key}" type="number" min="${min}" max="${max}" step="${step}"></span></label>`;
  }

  function create(options) {
    const launcher = document.querySelector("[data-comic-converter-open]");
    if (!launcher) return null;
    const sourceSummary = document.querySelector("[data-comic-converter-source-summary]");
    const dialog = document.createElement("dialog");
    dialog.className = "comic-converter-dialog";
    dialog.innerHTML = `
      <div class="comic-converter-window">
        <header class="comic-converter-head" data-converter-drag-handle>
          <strong>${tr("白黒変換", "Black & White Conversion")}</strong>
          <span data-converter-mode></span>
          <button type="button" data-converter-action="maximize" title="最大化／元に戻す">□</button>
          <button type="button" data-converter-action="close" aria-label="閉じる">×</button>
        </header>
        <div class="comic-converter-source-bar" data-converter-action="change-source" title="画像候補を開く／閉じる">
          <div data-converter-source-thumb class="comic-converter-source-thumb"></div>
          <div><strong data-converter-source-name>画像を選択してください</strong><small data-converter-source-info></small></div>
          <button type="button" data-converter-action="change-source">画像を変更</button>
        </div>
        <section class="comic-converter-source-picker" data-converter-source-picker hidden>
          <div class="comic-converter-candidates" data-converter-candidates></div>
          <div class="comic-converter-drop" data-converter-drop>
            <span>PNG / JPEG / WebPをドロップ・Ctrl+V</span>
            <button type="button" data-converter-action="choose-file">ファイルを選択</button>
          </div>
          <input data-converter-file type="file" accept="image/png,image/jpeg,image/webp" hidden>
        </section>
        <div class="comic-converter-body">
          <section class="comic-converter-previews">
            <figure data-source-drop tabindex="0" role="button"><figcaption>カラー原本 <small data-source-drop-hint></small></figcaption><canvas data-converter-source-canvas></canvas></figure>
            <figure><figcaption>変換結果 <small data-converter-timing></small></figcaption><canvas data-converter-result-canvas></canvas></figure>
          </section>
          <aside class="comic-converter-settings">
            <label>変換モード<select data-converter-preset><option value="grayscale">単純グレースケール</option><option value="manga_finish">Manga Finish — 高品質漫画仕上げ</option><option value="comic">白黒コミック</option><option value="monochrome">単純モノクロ</option><option value="xdog100">XDoG 100</option><option value="custom">カスタム</option></select></label>
            <div data-converter-legacy>${CONTROL_DEFS.map(fieldMarkup).join("")}
            <div class="comic-converter-checks">
              <label><input data-converter-check="preserveTones" type="checkbox">階調を残す</label>
              <label><input data-converter-check="solidBlack" type="checkbox">暗部を黒ベタ化</label>
            </div>
            <details class="comic-converter-xdog"><summary>XDoG調整</summary>${XDOG_DEFS.map(fieldMarkup).join("")}</details>
            <button type="button" data-converter-action="reset">初期設定に戻す</button></div><div data-manga-panel hidden></div>
          </aside>
        </div>
        <footer class="comic-converter-footer">
          <span data-converter-status>変換元画像を選択してください</span>
          <div class="comic-converter-footer-actions">
            <button type="button" data-converter-action="cancel">キャンセル</button>
            <button type="button" class="primary" data-converter-action="apply" disabled>画像トレイへ追加</button>
          </div>
        </footer>
      </div>`;
    document.body.append(dialog);

    const sourceCanvas = dialog.querySelector("[data-converter-source-canvas]");
    const resultCanvas = dialog.querySelector("[data-converter-result-canvas]");
    const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
    const resultCtx = resultCanvas.getContext("2d");
    const status = dialog.querySelector("[data-converter-status]");
    const applyButton = dialog.querySelector('[data-converter-action="apply"]');
    const picker = dialog.querySelector("[data-converter-source-picker]");
    const fileInput = dialog.querySelector("[data-converter-file]");
    const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
    const worker = new Worker(workerUrl);
    let source = null;
    let sourceBitmap = null;
    let previewTimer = null;
    let requestId = 0;
    let latestPreviewId = 0;
    let candidateUrls = [];
    let settings = { ...DEFAULTS };
    let currentPreset = "grayscale";
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      settings = { ...settings, ...saved };
      if (Object.keys(saved).length) currentPreset = "custom";
    } catch {}
    const manga = root.SpeechBubbleMangaFinishSettings;
    let activeEngine = "legacy", mangaState = manga.defaults(), fullCache = null;
    let sourceRevision = 0, sourceLoadRevision = 0, phase = "idle", controller = null;
    const contextKey = () => options.getContextKey?.() || options.getDocumentId?.() || "";
    try { mangaState=manga.restore(JSON.parse(localStorage.getItem(manga.contract.storage_key)||"null")); } catch {}
    const panel=dialog.querySelector("[data-manga-panel]");
    const labels={auto_tone:["暗部を自動補正","Auto shadow correction"],antialias:["輪郭のなめらかさ","Antialias"],screen_lines:["網点密度","Screen lines"],white_point:["白の基準","White point"],black_point:["黒ベタの基準","Black point"],light_tone:["薄いトーン","Light tone"],dark_tone:["濃いトーン","Dark tone"],gradation:["階調の保持","Gradation"],white_lines:["黒ベタ内の白線","White lines in blacks"],halftone:["45度網点を使用","Use 45 degree screen"]};
    panel.innerHTML=`<label>${tr("仕上げプリセット","Finish preset")}<select data-manga-preset>${Object.values(manga.presets).map(p=>`<option value="${p.id}">${p.label[document.documentElement.lang==="en"?"en":"ja"]}</option>`).join("")}<option value="custom">${tr("カスタム","Custom")}</option></select></label><small>${tr("標準はMangaScreen既定値。網点密度は画像幅に対する線数です。","Standard uses MangaScreen defaults. Screen lines are counted across image width.")}</small>${Object.entries(manga.contract.fields).map(([k,f])=>f.type==="boolean"?`<label class="manga-check"><input type="checkbox" data-manga-check="${k}">${tr(...labels[k])}</label>`:k==="antialias"?`<label><span>${tr(...labels[k])}</span><select data-manga-number="antialias"><option value="0">${tr("なし","Off")}</option><option value="1">${tr("弱","Light")}</option><option value="2">${tr("標準","Standard")}</option></select></label>`:`<label class="comic-converter-field"><span>${tr(...labels[k])}</span><span class="comic-converter-control"><input aria-label="${tr(...labels[k])}" data-manga-range="${k}" type="range" min="${f.min}" max="${f.max}" step="${f.ui_step}"><input aria-label="${tr(...labels[k])}" data-manga-number="${k}" type="number" min="${f.min}" max="${f.max}" step="${f.ui_step}"></span></label>`).join("")}<button type="button" data-manga-reset>${tr("プリセットをリセット","Reset preset")}</button><p>${tr("簡易プレビュー。網点の仕上がりは原寸確認で確認してください。","Quick preview. Check full resolution to inspect the screen.")}</p><button type="button" data-manga-full>${tr("原寸確認","Check full resolution")}</button><button type="button" data-manga-fit>${tr("全体","Fit")}</button><button type="button" data-manga-zoom>100%</button>`;
    function localizeManga(){
      dialog.querySelector("[data-source-drop-hint]").textContent=tr("画像をドロップ／クリックして変更","Drop an image / click to change");
      for(const [k,f] of Object.entries(manga.contract.fields)){const input=panel.querySelector(f.type==='boolean'?`[data-manga-check="${k}"]`:`[data-manga-number="${k}"]`);const label=input.closest('label');if(f.type==='boolean')label.lastChild.textContent=tr(...labels[k]);else label.querySelector('span').textContent=tr(...labels[k]);}
      panel.querySelectorAll('[data-manga-number=antialias] option').forEach((option,i)=>option.textContent=tr(['なし','弱','標準'][i],['Off','Light','Standard'][i]));
      const select=panel.querySelector('[data-manga-preset]');select.parentNode.firstChild.textContent=tr('仕上げプリセット','Finish preset');for(const option of select.options)option.textContent=option.value==='custom'?tr('カスタム','Custom'):manga.presets[option.value].label[document.documentElement.lang==='en'?'en':'ja'];
      panel.querySelector('small').textContent=tr('標準はMangaScreen既定値。網点密度は画像幅に対する線数です。','Standard uses MangaScreen defaults. Screen lines are counted across image width.');
      panel.querySelector('p').textContent=tr('簡易プレビュー。網点の仕上がりは原寸確認で確認してください。','Quick preview. Check full resolution to inspect the screen.');
      panel.querySelector('[data-manga-reset]').textContent=tr('プリセットをリセット','Reset preset');panel.querySelector('[data-manga-full]').textContent=tr('原寸確認','Check full resolution');panel.querySelector('[data-manga-fit]').textContent=tr('全体','Fit');
    }
    function syncManga(){for(const [k,f] of Object.entries(manga.contract.fields)){if(f.type==="boolean")panel.querySelector(`[data-manga-check="${k}"]`).checked=mangaState.settings[k];else for(const attr of ['range','number']){const input=panel.querySelector(`[data-manga-${attr}="${k}"]`);if(input)input.value=mangaState.settings[k];}}panel.querySelector('[data-manga-preset]').value=mangaState.custom?'custom':mangaState.basePresetId;}
    function saveManga(){try{localStorage.setItem(manga.contract.storage_key,JSON.stringify(mangaState));}catch{}}
    function invalidate(clearCache = true) {
      ++latestPreviewId;
      clearTimeout(previewTimer);
      controller?.abort();
      controller = null;
      if (clearCache) fullCache = null;
      applyButton.disabled = true;
    }
    function setPhase(value){phase=value;const locked=value==='full-render'||value==='committing';dialog.querySelectorAll('aside input,aside select,aside button,[data-converter-action="change-source"],[data-converter-action="choose-file"]').forEach(n=>n.disabled=locked);}
    panel.querySelector('[data-manga-preset]').onchange=e=>{if(!manga.presets[e.target.value])return;mangaState={version:1,basePresetId:e.target.value,custom:false,settings:{...manga.presets[e.target.value].settings}};syncManga();saveManga();schedulePreview();};
    panel.querySelector('[data-manga-reset]').onclick=()=>{mangaState.settings={...manga.presets[mangaState.basePresetId].settings};mangaState.custom=false;syncManga();saveManga();schedulePreview();};
    function editManga(e){const k=e.target.dataset.mangaRange||e.target.dataset.mangaNumber||e.target.dataset.mangaCheck;if(!k)return;if(e.target.dataset.mangaNumber && e.type==='input'){invalidate();return;}const value=e.target.type==='checkbox'?e.target.checked:e.target.value;if(value===''){syncManga();schedulePreview();return;}const next=manga.edit(mangaState.settings,k,value);mangaState.settings=next;mangaState.custom=true;syncManga();saveManga();schedulePreview();if(e.target.type!=='checkbox'&&Number(value)!==next[k])status.textContent=tr("値を許容範囲へ補正しました。","Value adjusted to the allowed range.");}
    panel.addEventListener('input',editManga);panel.addEventListener('change',e=>{if(e.target.dataset.mangaNumber)editManga(e);});panel.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.dataset.mangaNumber){e.preventDefault();e.target.blur();}});
    async function mangaRequest(blob, full, rev, ctx) {
      controller?.abort();
      const own = new AbortController();
      controller = own;
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; own.abort(); }, full ? 180000 : 30000);
      try {
        const query = new URLSearchParams(Object.entries(mangaState.settings).map(([k,v]) => [k,String(v)]));
        const response = await fetch((options.mangaApiPath || manga.contract.api_path) + '?' + query, {
          method: 'POST', headers: {'Content-Type': blob.type || 'application/octet-stream', 'X-SBE-Language': document.documentElement.lang === 'en' ? 'en' : 'ja'},
          body: blob, signal: own.signal,
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const error = new Error(data.detail || tr('変換に失敗しました。', 'Conversion failed.') + ` (${response.status})`);
          error.status = response.status;
          throw error;
        }
        const result = await response.blob();
        if (rev !== latestPreviewId || ctx !== contextKey()) throw new DOMException('Stale conversion', 'AbortError');
        return result;
      } catch (error) {
        if (timedOut) throw new Error(tr('処理がタイムアウトしました。終了を待って再実行してください。', 'Conversion timed out. Wait for it to finish, then retry.'));
        throw error;
      } finally {
        clearTimeout(timer);
        if (controller === own) controller = null;
      }
    }
    const canvasBlob=canvas=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG failed')),'image/png'));
    async function showMangaBlob(blob,rev,ctx){const bitmap=await imageForBlob(blob);try{if(rev!==latestPreviewId||ctx!==contextKey())return;resultCanvas.width=bitmap.width||bitmap.naturalWidth;resultCanvas.height=bitmap.height||bitmap.naturalHeight;resultCtx.drawImage(bitmap,0,0);}finally{bitmap.close?.();}}
    async function fullManga(){const rev=latestPreviewId,ctx=contextKey(),key=manga.key(ctx,sourceRevision,source.width,source.height,mangaState.settings);if(fullCache?.key===key)return fullCache.blob;const blob=await mangaRequest(source.blob,true,rev,ctx);fullCache={key,blob};return blob;}
    panel.querySelector('[data-manga-full]').onclick=async()=>{if(!source||phase==='full-render'||phase==='committing')return;invalidate(false);const rev=latestPreviewId,ctx=contextKey();setPhase('full-render');applyButton.disabled=true;try{const blob=await fullManga();await showMangaBlob(blob,rev,ctx);if(rev===latestPreviewId){status.textContent=tr('原寸確認完了','Full resolution ready');applyButton.disabled=false;}}catch(e){if(rev===latestPreviewId&&e.name!=='AbortError')status.textContent=e.message;}finally{if(rev===latestPreviewId)setPhase('idle');}};
    panel.querySelector('[data-manga-zoom]').onclick=()=>resultCanvas.classList.add('manga-actual-size');panel.querySelector('[data-manga-fit]').onclick=()=>resultCanvas.classList.remove('manga-actual-size');
    dialog.addEventListener('cancel',e=>{if(phase==='committing')e.preventDefault();});syncManga();

    const pending = new Map();

    worker.onmessage = (event) => {
      const resolve = pending.get(event.data.requestId);
      if (!resolve) return;
      pending.delete(event.data.requestId);
      resolve(event.data);
    };
    worker.onerror = (event) => {
      if(activeEngine!=="legacy"||!dialog.open)return;
      status.textContent = event.message || tr("変換処理でエラーが発生しました。", "A conversion error occurred.");
      status.dataset.level = "error";
    };

    function currentMode() {
      return options.getMode?.() === "comic" ? "comic" : "single";
    }

    function formatValue(key, value) {
      const def = [...CONTROL_DEFS, ...XDOG_DEFS].find((item) => item[0] === key);
      return Number(value).toFixed(def?.[5] || 0);
    }

    function syncControls() {
      for (const [key] of [...CONTROL_DEFS, ...XDOG_DEFS]) {
        const range = dialog.querySelector(`[data-converter-range="${key}"]`);
        const number = dialog.querySelector(`[data-converter-number="${key}"]`);
        if (range) range.value = settings[key];
        if (number) number.value = formatValue(key, settings[key]);
      }
      dialog.querySelector('[data-converter-check="preserveTones"]').checked = settings.preserveTones;
      dialog.querySelector('[data-converter-check="solidBlack"]').checked = settings.solidBlack;
      dialog.querySelector("[data-converter-preset]").value = currentPreset;
    }

    function markCustom() {
      currentPreset = "custom";
      dialog.querySelector("[data-converter-preset]").value = "custom";
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch {}
    }

    function applyPreset(preset) {
      if (!PRESET_SETTINGS[preset]) return;
      currentPreset = preset;
      settings = { ...PRESET_SETTINGS[preset] };
      syncControls();
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch {}
      schedulePreview();
    }

    function sourceDisplayName(name) {
      return String(name || tr("画像", "Image")).replace(/\.[^.]+$/, "");
    }

    function closeBitmap() {
      sourceBitmap?.close?.();
      sourceBitmap = null;
    }

    async function imageForBlob(blob) {
      if (typeof createImageBitmap === "function") return createImageBitmap(blob);
      return new Promise((resolve, reject) => {
        const image = new Image();
        const url = URL.createObjectURL(blob);
        image.onload = () => {
          URL.revokeObjectURL(url);
          resolve(image);
        };
        image.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error(tr("画像を読み込めませんでした。", "The image could not be loaded.")));
        };
        image.src = url;
      });
    }

    async function setSource(next) {
      if (!next?.blob || phase === "full-render" || phase === "committing") return;
      invalidate();source=null;closeBitmap();const loadRevision=++sourceLoadRevision;
      let nextBitmap;
      try { nextBitmap=await imageForBlob(next.blob); }
      catch(error) { if(loadRevision===sourceLoadRevision)status.textContent=tr("画像を読み込めません。","Could not load the image."); return; }
      if(loadRevision!==sourceLoadRevision||!dialog.open){nextBitmap.close?.();return;}
      ++sourceRevision;
      closeBitmap();
      sourceBitmap = nextBitmap;
      source = {
        ...next,
        name: sourceDisplayName(next.name),
        width: sourceBitmap.width || sourceBitmap.naturalWidth,
        height: sourceBitmap.height || sourceBitmap.naturalHeight,
      };
      dialog.querySelector("[data-converter-source-name]").textContent = source.name;
      dialog.querySelector("[data-converter-source-info]").textContent = `${source.width} × ${source.height}px`;
      const thumb = dialog.querySelector("[data-converter-source-thumb]");
      const thumbUrl = URL.createObjectURL(next.blob);
      candidateUrls.push(thumbUrl);
      thumb.style.backgroundImage = `url("${thumbUrl}")`;
      if (sourceSummary) sourceSummary.textContent = `${source.name} / ${source.width}×${source.height}`;
      picker.hidden = true;
      applyButton.disabled = true;
      drawSourcePreview();
      schedulePreview();
    }

    function previewDimensions() {
      const scale = Math.min(1, PREVIEW_LONG_EDGE / Math.max(source.width, source.height));
      return {
        width: Math.max(1, Math.round(source.width * scale)),
        height: Math.max(1, Math.round(source.height * scale)),
      };
    }

    function drawSourcePreview() {
      if (!sourceBitmap || !source) return;
      const size = previewDimensions();
      sourceCanvas.width = resultCanvas.width = size.width;
      sourceCanvas.height = resultCanvas.height = size.height;
      sourceCtx.clearRect(0, 0, size.width, size.height);
      sourceCtx.drawImage(sourceBitmap, 0, 0, size.width, size.height);
    }

    function processPixels(imageData, dedicated = false) {
      const id = ++requestId;
      const dedicatedUrl = dedicated
        ? URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }))
        : "";
      const targetWorker = dedicated ? new Worker(dedicatedUrl) : worker;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (dedicated) {
            targetWorker.terminate();
            URL.revokeObjectURL(dedicatedUrl);
          }
          pending.delete(id);
          reject(new Error(tr("変換処理がタイムアウトしました。", "The conversion timed out.")));
        }, dedicated ? 120000 : 30000);
        const finish = (payload) => {
          clearTimeout(timeout);
          if (dedicated) {
            targetWorker.terminate();
            URL.revokeObjectURL(dedicatedUrl);
          }
          resolve(payload);
        };
        if (dedicated) {
          targetWorker.onmessage = (event) => finish(event.data);
          targetWorker.onerror = (event) => {
            clearTimeout(timeout);
            targetWorker.terminate();
            URL.revokeObjectURL(dedicatedUrl);
            reject(new Error(event.message || tr("変換処理に失敗しました。", "The conversion failed.")));
          };
        } else {
          pending.set(id, finish);
        }
        targetWorker.postMessage(
          {
            type: "process",
            requestId: id,
            width: imageData.width,
            height: imageData.height,
            buffer: imageData.data.buffer,
            params: { ...settings },
          },
          [imageData.data.buffer],
        );
      });
    }

    function scheduleMangaPreview(){clearTimeout(previewTimer);invalidate();const rev=latestPreviewId,ctx=contextKey(),deadline=Date.now()+30000;async function run(){if(!source||rev!==latestPreviewId||ctx!==contextKey())return;try{drawSourcePreview();const blob=await canvasBlob(sourceCanvas);if(rev!==latestPreviewId)return;const result=(mangaState.settings.auto_tone||mangaState.settings.antialias)?await fullManga():await mangaRequest(blob,false,rev,ctx);await showMangaBlob(result,rev,ctx);if(rev===latestPreviewId){status.textContent=(mangaState.settings.auto_tone||mangaState.settings.antialias)?tr('原寸処理完了。100%表示で輪郭と網点を確認できます。','Full-resolution processing ready. Inspect edges and screen at 100%.'):tr('簡易プレビュー完了。網点は原寸確認してください。','Quick preview ready. Check full resolution for screen detail.');applyButton.disabled=false;}}catch(e){if(rev!==latestPreviewId||ctx!==contextKey())return;if(e.status===429&&Date.now()<deadline){previewTimer=setTimeout(run,1000);return;}if(e.name!=='AbortError')status.textContent=e.message;}}previewTimer=setTimeout(run,140);}
    function schedulePreview() {
      if(activeEngine === "manga_finish"){scheduleMangaPreview();return;}
      invalidate();
      clearTimeout(previewTimer);
      const revision = ++latestPreviewId;
      previewTimer = setTimeout(async () => {
        if (!source) return;
        status.textContent = tr("プレビューを変換しています…", "Converting preview…");
        status.dataset.level = "info";
        try {
          drawSourcePreview();
          const payload = await processPixels(
            sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height),
          );
          if (revision !== latestPreviewId) return;
          resultCtx.putImageData(
            new ImageData(new Uint8ClampedArray(payload.buffer), payload.width, payload.height),
            0,
            0,
          );
          dialog.querySelector("[data-converter-timing]").textContent = `${Math.round(payload.total)} ms`;
          status.textContent = tr(
            "プレビュー完了。確定時は元解像度で再変換します。",
            "Preview ready. The final image will be converted at full resolution.",
          );
          status.dataset.level = "ready";
          applyButton.disabled = false;
        } catch (error) {
          if(revision!==latestPreviewId)return;
          status.textContent = error?.message || tr("プレビュー変換に失敗しました。", "Preview conversion failed.");
          status.dataset.level = "error";
        }
      }, 140);
    }

    async function sourceCandidates() {
      const mode = currentMode();
      if (mode === "single") {
        const current = await options.getSingleSource?.();
        return current ? [{ ...current, id: "single-source", selected: true }] : [];
      }
      return (await options.getComicSources?.()) || [];
    }

    function clearCandidateUrls() {
      candidateUrls.forEach((url) => URL.revokeObjectURL(url));
      candidateUrls = [];
    }

    async function showSourcePicker(candidates = null, forceOpen = false) {
      picker.hidden = forceOpen ? false : !picker.hidden;
      if (picker.hidden) return;
      const host = dialog.querySelector("[data-converter-candidates]");
      host.replaceChildren();
      const items = candidates || (await sourceCandidates());
      for (const candidate of items) {
        if (!candidate.blob) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "comic-converter-candidate";
        const url = URL.createObjectURL(candidate.blob);
        candidateUrls.push(url);
        button.innerHTML = `<img alt=""><span></span><small>${candidate.width || "?"}×${candidate.height || "?"}</small>`;
        button.querySelector("img").src = url;
        button.querySelector("span").textContent = sourceDisplayName(candidate.name);
        button.onclick = () => setSource(candidate);
        host.append(button);
      }
      if (!host.children.length) {
        const empty = document.createElement("p");
        empty.textContent = currentMode() === "comic"
          ? tr(
              "画像トレイまたはコマ画像を選択するか、画像ファイルを読み込んでください。",
              "Select a Image Tray item or panel image, or load an image file.",
            )
          : tr("一枚画像を読み込んでください。", "Load a Single Image.");
        host.append(empty);
      }
    }

    async function refreshSource() {
      const ctx=contextKey(),revision=++sourceLoadRevision;
      const candidates = await sourceCandidates();
      if(!dialog.open||ctx!==contextKey()||revision!==sourceLoadRevision)return;
      const selected = candidates.find((item) => item.selected);
      if (selected) await setSource(selected);
      else {
        source = null;
        closeBitmap();
        if (sourceSummary) sourceSummary.textContent = tr("画像を選択してください", "Select an image");
        await showSourcePicker(candidates, true);
      }
    }

    async function finalBlob() {
      if(activeEngine === "manga_finish") return fullManga();
      const full = document.createElement("canvas");
      full.width = source.width;
      full.height = source.height;
      const context = full.getContext("2d", { willReadFrequently: true });
      context.drawImage(sourceBitmap, 0, 0, full.width, full.height);
      const payload = await processPixels(context.getImageData(0, 0, full.width, full.height), true);
      context.putImageData(
        new ImageData(new Uint8ClampedArray(payload.buffer), payload.width, payload.height),
        0,
        0,
      );
      return new Promise((resolve, reject) =>
        full.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error(tr("PNGを作成できませんでした。", "The PNG could not be created.")))),
          "image/png",
        ),
      );
    }

    async function applyResult() {
      if (!source || phase === "full-render" || phase === "committing") return;
      const capturedSource=source,ctx=contextKey(),rev=latestPreviewId,doc=options.getDocumentId?.();
      const canCommit=()=>dialog.open&&rev===latestPreviewId&&ctx===contextKey();
      setPhase("full-render");let historyId=null;
      const idleLabel =
        currentMode() === "comic" ? tr("画像トレイへ追加", "Add to Image Tray") : tr("一枚画像へ適用", "Apply to Single Image");
      applyButton.disabled = true;
      applyButton.textContent = tr("追加処理中…", "Adding…");
      status.textContent = tr("元解像度で変換しています…", "Converting at full resolution…");
      status.dataset.level = "info";
      try {
        const blob = await finalBlob();
        if(!canCommit())return;
        setPhase("committing");
        const name = `${source.name}-comic.png`;
        if (currentMode() === "comic") {
          const id = await options.addPageImage?.(blob, name, canCommit);
          if (!id) throw new Error(tr("画像トレイへ追加できませんでした。", "Could not add the image to Image Tray."));
          options.setStatus?.(
            tr(`${name}を画像トレイへ追加しました。`, `${name} was added to Image Tray.`),
            "saved",
          );
        } else {
          historyId=await storeHistory(doc, capturedSource.blob, capturedSource.name);
          if(!canCommit())throw new DOMException("Stale conversion","AbortError");
          const applied = await options.applySingleImage?.(blob, name, capturedSource, canCommit);
          if (!applied) throw new Error(tr("一枚画像へ適用できませんでした。", "Could not apply the conversion to the Single Image."));
          options.setStatus?.(
            tr("白黒変換を一枚画像へ適用しました。", "Black & White Conversion was applied to the Single Image."),
            "saved",
          );
        }
        historyId=null;dialog.close();
      } catch (error) {
        if(historyId)await deleteHistoryIds([historyId]);
        if(!canCommit())return;
        status.textContent = error?.message || tr("白黒変換を適用できませんでした。", "Black & White Conversion could not be applied.");
        status.dataset.level = "error";
      } finally {
        if (rev === latestPreviewId) {
          setPhase("idle");
          applyButton.disabled = !source;
          applyButton.textContent = idleLabel;
        }
      }
    }

    function resetSettings() {
      currentPreset = "grayscale";
      settings = { ...PRESET_SETTINGS.grayscale };
      syncControls();
      try {
        localStorage.removeItem(SETTINGS_KEY);
      } catch {}
      schedulePreview();
    }

    function readGeometry() {
      try {
        return JSON.parse(localStorage.getItem(GEOMETRY_KEY) || "{}");
      } catch {
        return {};
      }
    }

    function restoreGeometry() {
      const saved = readGeometry();
      const width = Math.min(innerWidth - 24, Math.max(760, Number(saved.width) || 1120));
      const height = Math.min(innerHeight - 24, Math.max(520, Number(saved.height) || 720));
      dialog.style.width = `${width}px`;
      dialog.style.height = `${height}px`;
      if (Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
        dialog.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, saved.left))}px`;
        dialog.style.top = `${Math.max(8, Math.min(innerHeight - height - 8, saved.top))}px`;
        dialog.style.margin = "0";
      }
    }

    function saveGeometry() {
      if (!dialog.open || dialog.classList.contains("maximized")) return;
      const rect = dialog.getBoundingClientRect();
      try {
        localStorage.setItem(
          GEOMETRY_KEY,
          JSON.stringify({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }),
        );
      } catch {}
    }

    function resetSession() {
      invalidate();
      ++sourceLoadRevision;
      setPhase("idle");
      source = null;
      closeBitmap();
      clearCandidateUrls();
      resultCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
    }

    function closeDialog() {
      if(phase === "committing")return;
      saveGeometry();
      dialog.close();
    }

    launcher.onclick = async () => {
      if(dialog.open)return;
      // The previous native close event may still be queued. Retire its work
      // before starting this session, even when reopening in the same task.
      resetSession();
      localizeManga();
      dialog.querySelector("[data-converter-mode]").textContent =
        currentMode() === "comic" ? tr("4コマ漫画", "4-panel Comic") : tr("一枚画像", "Single Image");
      applyButton.textContent =
        currentMode() === "comic" ? tr("画像トレイへ追加", "Add to Image Tray") : tr("一枚画像へ適用", "Apply to Single Image");
      dialog.showModal();
      restoreGeometry();
      clearCandidateUrls();
      await refreshSource();
    };
    dialog.querySelector("[data-converter-preset]").addEventListener("change", (event) => {
      invalidate();
      activeEngine=event.target.value==='manga_finish'?'manga_finish':'legacy';
      panel.hidden=activeEngine!=='manga_finish';dialog.querySelector('[data-converter-legacy]').hidden=!panel.hidden;
      if(activeEngine==='legacy'){if(event.target.value!=='custom'&&event.target.value!==currentPreset)applyPreset(event.target.value);else{syncControls();schedulePreview();}}else schedulePreview();
    });

    dialog.addEventListener("input", (event) => {
      const key = event.target.dataset.converterRange || event.target.dataset.converterNumber;
      if (key) {
        const value = Number(event.target.value);
        if (!Number.isFinite(value)) return;
        settings[key] = value;
        const range = dialog.querySelector(`[data-converter-range="${key}"]`);
        const number = dialog.querySelector(`[data-converter-number="${key}"]`);
        if (range !== event.target) range.value = value;
        if (number !== event.target) number.value = formatValue(key, value);
        markCustom();
        schedulePreview();
        return;
      }
      const check = event.target.dataset.converterCheck;
      if (check) {
        settings[check] = event.target.checked;
        markCustom();
        schedulePreview();
      }
    });

    dialog.addEventListener("click", async (event) => {
      const action = event.target.closest("[data-converter-action]")?.dataset.converterAction;
      if (!action) return;
      if (action === "close" || action === "cancel") closeDialog();
      else if (action === "change-source") await showSourcePicker();
      else if (action === "choose-file") fileInput.click();
      else if (action === "reset") resetSettings();
      else if (action === "apply") await applyResult();
      else if (action === "maximize") {
        dialog.classList.toggle("maximized");
        event.target.textContent = dialog.classList.contains("maximized") ? "❐" : "□";
      }
    });

    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (file) await setSource({ blob: file, name: file.name, source_kind: "external-file" });
    };
    const sourceDrop=dialog.querySelector('[data-source-drop]');
    const chooseSource=()=>{if(phase==='idle')fileInput.click();};
    sourceDrop.addEventListener('click',chooseSource);
    sourceDrop.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();chooseSource();}});
    for(const drop of [sourceDrop,dialog.querySelector('[data-converter-drop]')]){
      drop.addEventListener('dragover',event=>{event.preventDefault();event.stopPropagation();if(phase==='idle'){drop.classList.add('drag-active');event.dataTransfer.dropEffect='copy';}else event.dataTransfer.dropEffect='none';});
      drop.addEventListener('dragleave',()=>drop.classList.remove('drag-active'));
      drop.addEventListener('drop',async event=>{
        event.preventDefault();event.stopPropagation();drop.classList.remove('drag-active');
        if(phase!=='idle')return;
        const file=Array.from(event.dataTransfer?.files||[]).find(item=>/^image\/(?:png|jpeg|webp)$/i.test(item.type));
        if(file)await setSource({blob:file,name:file.name,source_kind:'external-file'});
        else status.textContent=tr('PNG / JPEG / WebP画像を選択してください。','Choose a PNG, JPEG or WebP image.');
      });
    }
    document.addEventListener("paste", async (event) => {
      if (!dialog.open || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      const item = Array.from(event.clipboardData?.items || []).find(
        (entry) => entry.kind === "file" && String(entry.type).startsWith("image/"),
      );
      const file = item?.getAsFile?.();
      if (file) {
        event.preventDefault();
        await setSource({ blob: file, name: file.name || "clipboard-image.png" });
      }
    });

    let moving = null;
    const dragHandle = dialog.querySelector("[data-converter-drag-handle]");
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
      dialog.style.left = `${Math.max(8, Math.min(innerWidth - rect.width - 8, event.clientX - moving.x))}px`;
      dialog.style.top = `${Math.max(8, Math.min(innerHeight - rect.height - 8, event.clientY - moving.y))}px`;
    });
    dragHandle.addEventListener("pointerup", () => {
      moving = null;
      saveGeometry();
    });
    new ResizeObserver(saveGeometry).observe(dialog);
    dialog.addEventListener("close", () => {
      // A delayed close event belongs to the old session after a rapid reopen.
      if (dialog.open) return;
      saveGeometry();
      resetSession();
    });

    syncControls();
    pruneHistory().catch(() => {});

    return {
      async storageStatus() {
        const records = await historyRecords().catch(() => []);
        return {
          conversion_history: records.length,
          conversion_history_bytes: records.reduce((sum, item) => sum + (Number(item?.blob?.size) || 0), 0),
          temporary_preview_files: 0,
        };
      },
      clearHistory,
      open: () => launcher.click(),
      close: closeDialog,
      cancelPending() {
        resetSession();
        dialog.close();
      },
      dispose() {
        invalidate();clearTimeout(previewTimer);++sourceLoadRevision;
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
        closeBitmap();
        clearCandidateUrls();
      },
    };
  }

  root.SpeechBubbleComicConverter = { create };
})(globalThis);
