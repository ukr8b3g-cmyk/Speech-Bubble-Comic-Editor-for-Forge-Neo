(() => {
    "use strict";

    const SETTINGS_UI_VERSION = "1.0.0";
    const API_ROOT = "/speech-bubble-forge";
    const USER_ASSET_ENDPOINT = `${API_ROOT}/user-assets`;
    const DIAGNOSTIC_ENDPOINT = `${API_ROOT}/diagnostics`;
    const SETTINGS_STATE_KEY = "speech-bubble/settings-groups:v1";
    const LAST_DIAGNOSTIC_KEY = "speech-bubble/diagnostics:last:v1";
    const USER_ASSET_CHANNEL = "speech-bubble-forge:user-assets:v1";
    const PREVIEW_BACKGROUND_KEY = "speech-bubble/user-preset-preview-background:v1";
    const PREVIEW_CUSTOM_COLOR_KEY = "speech-bubble/user-preset-preview-color:v1";
    const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
    const MAX_SOURCE_PIXELS = 25_000_000;
    const MAX_PREVIEW_BACKGROUND_BYTES = 32 * 1024 * 1024;
    const MAX_PREVIEW_BACKGROUND_PIXELS = 100_000_000;
    const MAX_PREVIEW_BACKGROUND_HISTORY = 3;
    const PREVIEW_ZOOM_MIN = 0.01;
    const PREVIEW_ZOOM_MAX = 4;
    const RECOMMENDED_SIDE = 512;
    const RESIZE_SIDE = 768;
    const NAME_MAX_LENGTH = 48;
    const STYLE_SWATCHES = [
        "#111111", "#ffffff", "#9ca3af", "#ef4444", "#f97316", "#facc15", "#84cc16", "#22c55e",
        "#14b8a6", "#38bdf8", "#60a5fa", "#3b82f6", "#6366f1", "#8b5cf6", "#c026d3", "#ec4899",
        "#8b6f5c", "#f5deb3", "#fca5a5", "#fde68a", "#fef3c7", "#94a83d", "#387b5e", "#256d68",
        "#2b6c8d", "#3554a5", "#5b4bb7", "#b28ac9", "#e7b6d4",
    ];

    const GROUP_OPTIONS = {
        export: [
            "speech_bubble_forge_output_format",
            "speech_bubble_forge_png_compression",
            "speech_bubble_forge_jpeg_quality",
            "speech_bubble_forge_webp_quality",
            "speech_bubble_forge_webp_lossless",
            "speech_bubble_forge_save_overlay_v2",
            "speech_bubble_forge_filename_format",
            "speech_bubble_forge_date_subfolder",
            "speech_bubble_forge_backup_enabled",
            "speech_bubble_forge_backup_generations",
            "speech_bubble_forge_prompt_export_location_v2",
            "speech_bubble_forge_use_forge_output_dir",
            "speech_bubble_forge_remember_export_directory",
            "speech_bubble_forge_reset_export_directory",
            "speech_bubble_forge_output_dir",
        ],
        editor: [
            "speech_bubble_forge_window_width",
            "speech_bubble_forge_window_height",
            "speech_bubble_forge_supersample",
            "speech_bubble_forge_auto_save",
            "speech_bubble_forge_keep_previous_layout",
        ],
        cache: [
            "speech_bubble_forge_browser_cache_manager",
            "speech_bubble_forge_rebuild_asset_cache",
        ],
    };

    const appRoot = () => (typeof gradioApp === "function" ? gradioApp() : document);

    class ApiError extends Error {
        constructor(message, detail = {}, status = 0) {
            super(message);
            this.name = "ApiError";
            this.detail = detail;
            this.status = status;
            this.code = detail?.code || "request_failed";
        }
    }

    function formatBytes(value) {
        const bytes = Math.max(0, Number(value) || 0);
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    }

    function normalizedName(value) {
        return String(value || "")
            .normalize("NFKC")
            .replace(/[\u0000-\u001f\u007f]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, NAME_MAX_LENGTH);
    }

    function filenameStem(name) {
        const value = String(name || "preset").replace(/\.[^.]+$/, "");
        return normalizedName(value) || "preset";
    }

    function registrationRequestSpec(replacePresetId = "") {
        const presetId = String(replacePresetId || "").trim();
        return presetId
            ? { path: `${USER_ASSET_ENDPOINT}/${encodeURIComponent(presetId)}/image`, method: "PUT", replacingImage: true }
            : { path: USER_ASSET_ENDPOINT, method: "POST", replacingImage: false };
    }

    function canonicalImageDataUrl(file, dataUrl) {
        const type = String(file?.type || "").toLowerCase();
        const name = String(file?.name || "").toLowerCase();
        const mime = type === "image/webp" || (type !== "image/png" && name.endsWith(".webp")) ? "image/webp" : "image/png";
        return String(dataUrl || "").replace(/^data:[^;,]*;base64,/i, `data:${mime};base64,`);
    }

    function acceptedImageFile(file) {
        if (!(file instanceof Blob)) return false;
        const type = String(file.type || "").toLowerCase();
        const name = String(file.name || "").toLowerCase();
        return type === "image/png" || type === "image/webp" || name.endsWith(".png") || name.endsWith(".webp");
    }

    function acceptedPreviewBackgroundFile(file) {
        if (!(file instanceof Blob)) return false;
        const type = String(file.type || "").toLowerCase();
        const name = String(file.name || "").toLowerCase();
        return ["image/png", "image/jpeg", "image/webp"].includes(type)
            || /\.(png|jpe?g|webp)$/i.test(name);
    }

    function previewFitScale(viewWidth, viewHeight, imageWidth, imageHeight) {
        const width = Math.max(1, Number(viewWidth) || 1);
        const height = Math.max(1, Number(viewHeight) || 1);
        const sourceWidth = Math.max(1, Number(imageWidth) || 1);
        const sourceHeight = Math.max(1, Number(imageHeight) || 1);
        return Math.min(width / sourceWidth, height / sourceHeight);
    }

    function previewStampRect(viewWidth, viewHeight, backgroundWidth, backgroundHeight, zoom, panX, panY, stampX, stampY, stampWidth, stampHeight) {
        const scale = Math.max(PREVIEW_ZOOM_MIN, Number(zoom) || 1);
        const originX = (Number(viewWidth) || 0) / 2 + (Number(panX) || 0) - (Number(backgroundWidth) || 0) * scale / 2;
        const originY = (Number(viewHeight) || 0) / 2 + (Number(panY) || 0) - (Number(backgroundHeight) || 0) * scale / 2;
        const width = Math.max(1, (Number(stampWidth) || 1) * scale);
        const height = Math.max(1, (Number(stampHeight) || 1) * scale);
        return {
            x: originX + ((Number(stampX) || 0) - (Number(stampWidth) || 1) / 2) * scale,
            y: originY + ((Number(stampY) || 0) - (Number(stampHeight) || 1) / 2) * scale,
            width,
            height,
            originX,
            originY,
        };
    }

    async function apiRequest(path, options = {}) {
        const response = await fetch(path, {
            cache: "no-store",
            credentials: "same-origin",
            ...options,
        });
        let payload = null;
        try {
            payload = await response.json();
        } catch {
            payload = null;
        }
        if (!response.ok) {
            const detail = payload?.detail && typeof payload.detail === "object" ? payload.detail : payload || {};
            const message = detail.message || payload?.detail || `Request failed (${response.status})`;
            throw new ApiError(String(message), detail, response.status);
        }
        return payload || {};
    }

    function readFileDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(reader.error || new Error("ファイルを読み込めませんでした"));
            reader.readAsDataURL(file);
        });
    }

    function loadPreviewImage(url) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error("画像をプレビューできませんでした"));
            image.src = url;
        });
    }

    async function decodeImageFile(file) {
        if (typeof globalThis.createImageBitmap === "function") {
            try {
                const bitmap = await globalThis.createImageBitmap(file);
                return {
                    image: bitmap,
                    width: bitmap.width,
                    height: bitmap.height,
                    release: () => bitmap.close?.(),
                };
            } catch {
                // Fall back to the browser Image decoder below.
            }
        }
        let objectUrl = "";
        try {
            objectUrl = URL.createObjectURL(file);
            const image = await loadPreviewImage(objectUrl);
            return {
                image,
                width: image.naturalWidth,
                height: image.naturalHeight,
                release: () => {},
            };
        } finally {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        }
    }

    async function analyzeImageFile(file) {
        if (!acceptedImageFile(file)) {
            throw new ApiError("PNGまたは静止WebPを選択してください", { code: "unsupported_format" });
        }
        if (file.size > MAX_UPLOAD_BYTES) {
            throw new ApiError("ファイルサイズは4MB以下にしてください", {
                code: "file_too_large",
                actual_bytes: file.size,
                maximum_bytes: MAX_UPLOAD_BYTES,
            });
        }
        const decoded = await decodeImageFile(file);
        try {
            const { image, width, height } = decoded;
            if (!width || !height) throw new ApiError("画像サイズを取得できませんでした", { code: "decode_failed" });
            if (width * height > MAX_SOURCE_PIXELS) {
                throw new ApiError("画像の総画素数が大きすぎます", {
                    code: "dimensions_too_large",
                    width,
                    height,
                    maximum_pixels: MAX_SOURCE_PIXELS,
                });
            }

            const probe = document.createElement("canvas");
            const ratio = Math.min(1, 512 / Math.max(width, height));
            probe.width = Math.max(1, Math.round(width * ratio));
            probe.height = Math.max(1, Math.round(height * ratio));
            const context = probe.getContext("2d", { willReadFrequently: true });
            context.drawImage(image, 0, 0, probe.width, probe.height);
            const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
            let hasAlpha = false;
            for (let index = 3; index < pixels.length; index += 4) {
                if (pixels[index] < 255) {
                    hasAlpha = true;
                    break;
                }
            }
            return {
                file,
                dataUrl: "",
                previewImage: image,
                releasePreviewImage: decoded.release,
                width,
                height,
                hasAlpha,
                oversize: Math.max(width, height) > RESIZE_SIDE,
                format: file.type === "image/webp" || String(file.name || "").toLowerCase().endsWith(".webp") ? "WebP" : "PNG",
            };
        } catch (error) {
            decoded.release();
            throw error;
        }
    }

    function findSettingNode(root, key) {
        const direct = root.querySelector(`#setting_${key}`);
        if (direct) return direct;
        const input = root.querySelector(`#${key}`) || root.querySelector(`[name="${key}"]`);
        if (!input) return null;
        return input.closest(`[id^="setting_"]`) || input.closest(".gradio-row") || input.closest(".block") || input.parentElement;
    }

    function storedGroupState() {
        try {
            const value = JSON.parse(localStorage.getItem(SETTINGS_STATE_KEY) || "{}");
            return value && typeof value === "object" && !Array.isArray(value) ? value : {};
        } catch {
            return {};
        }
    }

    function saveGroupState(panel) {
        const state = {};
        panel.querySelectorAll("[data-speech-bubble-settings-group]").forEach((details) => {
            state[details.dataset.speechBubbleSettingsGroup] = details.open;
        });
        try {
            localStorage.setItem(SETTINGS_STATE_KEY, JSON.stringify(state));
        } catch {
            // Accordion state is optional.
        }
    }

    function settingValue(root, key) {
        const node = findSettingNode(root, key);
        const input = node?.querySelector("input, select, textarea");
        if (!input) return null;
        if (input.type === "checkbox") return input.checked;
        return input.value;
    }

    function updateSettingSummaries(panel) {
        const root = appRoot();
        const format = String(settingValue(root, "speech_bubble_forge_output_format") || "PNG").toUpperCase();
        const backup = settingValue(root, "speech_bubble_forge_backup_enabled") !== false ? "Backup ON" : "Backup OFF";
        const output = String(settingValue(root, "speech_bubble_forge_output_dir") || "Forge output").trim();
        const exportSummary = panel.querySelector('[data-speech-bubble-summary="export"]');
        if (exportSummary) exportSummary.textContent = `${format} / ${backup} / ${output || "Forge output"}`;

        const width = settingValue(root, "speech_bubble_forge_window_width") || 1440;
        const height = settingValue(root, "speech_bubble_forge_window_height") || 900;
        const supersample = settingValue(root, "speech_bubble_forge_supersample") || 2;
        const autosave = settingValue(root, "speech_bubble_forge_auto_save") !== false ? "Auto Save ON" : "Auto Save OFF";
        const editorSummary = panel.querySelector('[data-speech-bubble-summary="editor"]');
        if (editorSummary) editorSummary.textContent = `${width} × ${height} / SS ${supersample} / ${autosave}`;

        const cacheSummary = panel.querySelector('[data-speech-bubble-summary="cache"]');
        const cacheUsage = panel.querySelector("[data-speech-bubble-cache-usage]")?.textContent?.trim();
        if (cacheSummary) cacheSummary.textContent = cacheUsage || "編集キャッシュ・素材キャッシュ・自己診断";
    }

    function organizeSettingRows(panel) {
        const root = appRoot();
        for (const [group, keys] of Object.entries(GROUP_OPTIONS)) {
            const target = panel.querySelector(`[data-speech-bubble-settings-body="${group}"]`);
            if (!target) continue;
            for (const key of keys) {
                const node = findSettingNode(root, key);
                if (!node) continue;
                node.dataset.speechBubbleSettingGroup = group;
                node.dataset.speechBubbleSettingKey = key;
                const refreshButton = root.querySelector(`#refresh_${key}`);
                if (refreshButton && !node.contains(refreshButton)) {
                    node.dataset.speechBubbleSettingRefresh = "true";
                    node.append(refreshButton);
                }
                if (target.contains(node)) continue;
                target.append(node);
            }
        }
        const exportHeading = findSettingNode(root, "speech_bubble_forge_export_settings_note");
        if (exportHeading) exportHeading.hidden = true;
        updateSettingSummaries(panel);
    }

    function styleEditorMarkup() {
        return `
          <section class="speech-bubble-user-style-editor" data-user-style-editor>
            <div class="speech-bubble-user-style-heading"><strong>初期スタイル</strong><small>次回配置するレイヤーへ適用</small></div>
            <div class="speech-bubble-user-style-mode-row">
              <div class="speech-bubble-forge-segmented speech-bubble-user-style-mode">
                <button type="button" data-style-mode="original" aria-pressed="true">Original</button>
                <button type="button" data-style-mode="fill" aria-pressed="false">Fill</button>
              </div>
              <div class="speech-bubble-user-style-dimensions">
                <label>Width<input type="number" min="1" max="8192" step="1" data-style-width></label>
                <label>Height<input type="number" min="1" max="8192" step="1" data-style-height></label>
              </div>
            </div>
            <label>Size (%)
              <div class="speech-bubble-user-style-number"><input type="number" min="10" max="400" step="1" data-style-size-number><input type="range" min="10" max="400" step="1" data-style-size-range></div>
            </label>
            <label>Opacity
              <div class="speech-bubble-user-style-number"><input type="number" min="0" max="1" step="0.05" data-style-opacity-number><input type="range" min="0" max="1" step="0.05" data-style-opacity-range></div>
            </label>
            <div class="speech-bubble-user-style-grid">
              <label>Fill Color<input type="color" data-style-fill></label>
              <label>Outline Color<input type="color" data-style-stroke></label>
            </div>
            <div class="speech-bubble-user-palette-controls">
              <span>Swatches</span>
              <div class="speech-bubble-forge-segmented">
                <button type="button" data-style-color-target="fill" aria-pressed="true">Fill</button>
                <button type="button" data-style-color-target="stroke" aria-pressed="false">Outline</button>
              </div>
            </div>
            <div class="speech-bubble-user-style-palette" data-style-palette></div>
            <label>Outline Width
              <div class="speech-bubble-user-style-number"><input type="number" min="0" max="100" step="0.5" data-style-stroke-width-number><input type="range" min="0" max="100" step="0.5" data-style-stroke-width-range></div>
            </label>
            <details class="speech-bubble-user-shadow" open>
              <summary>Drop Shadow</summary>
              <div>
                <label class="speech-bubble-user-shadow-enable"><input type="checkbox" data-style-shadow-enabled>有効</label>
                <label>Shadow Color<input type="color" data-style-shadow-color></label>
                <div class="speech-bubble-user-style-palette" data-style-shadow-palette aria-label="Shadow color swatches"></div>
                <div class="speech-bubble-user-shadow-direction">
                  <span>Direction</span>
                  <div class="speech-bubble-user-direction-pad" aria-label="Shadow direction">
                    <button type="button" data-style-shadow-dir="-1,-1" title="左上">↖</button><button type="button" data-style-shadow-dir="0,-1" title="上">↑</button><button type="button" data-style-shadow-dir="1,-1" title="右上">↗</button>
                    <button type="button" data-style-shadow-dir="-1,0" title="左">←</button><button type="button" data-style-shadow-dir="0,0" title="方向オフ">•</button><button type="button" data-style-shadow-dir="1,0" title="右">→</button>
                    <button type="button" data-style-shadow-dir="-1,1" title="左下">↙</button><button type="button" data-style-shadow-dir="0,1" title="下">↓</button><button type="button" data-style-shadow-dir="1,1" title="右下">↘</button>
                  </div>
                </div>
                <div class="speech-bubble-user-style-grid speech-bubble-user-shadow-numbers">
                  <label>X<input type="number" min="-500" max="500" step="1" data-style-shadow-x></label>
                  <label>Y<input type="number" min="-500" max="500" step="1" data-style-shadow-y></label>
                  <label>Blur<input type="number" min="0" max="200" step="1" data-style-shadow-blur></label>
                </div>
              </div>
            </details>
            <details class="speech-bubble-user-glow">
              <summary>Outer Glow</summary>
              <div>
                <label class="speech-bubble-user-effect-enable"><input type="checkbox" data-style-glow-enabled>Enable Outer Glow</label>
                <label>Glow Color<input type="color" data-style-glow-color></label>
                <div class="speech-bubble-user-style-palette" data-style-glow-palette aria-label="Glow color swatches"></div>
                <label>Opacity
                  <div class="speech-bubble-user-style-number"><input type="number" min="0" max="1" step="0.05" data-style-glow-opacity-number><input type="range" min="0" max="1" step="0.05" data-style-glow-opacity-range></div>
                </label>
                <label>Blur
                  <div class="speech-bubble-user-style-number"><input type="number" min="0" max="200" step="1" data-style-glow-blur-number><input type="range" min="0" max="200" step="1" data-style-glow-blur-range></div>
                </label>
                <label>Spread
                  <div class="speech-bubble-user-style-number"><input type="number" min="0" max="100" step="1" data-style-glow-spread-number><input type="range" min="0" max="100" step="1" data-style-glow-spread-range></div>
                </label>
              </div>
            </details>
          </section>`;
    }

    function stylePreviewMarkup(hidden = false) {
        return `
          <div class="speech-bubble-user-style-preview" data-user-style-preview-wrap data-preview-background="transparent"${hidden ? " hidden" : ""}>
            <canvas width="640" height="360" data-user-style-preview tabindex="0" aria-label="初期スタイルのプレビュー。任意画像のドロップと貼り付けに対応"></canvas>
            <div class="speech-bubble-user-preview-tools">
              <div class="speech-bubble-user-preview-background">
                <div class="speech-bubble-forge-segmented speech-bubble-user-preview-area-mode" aria-label="プレビュー表示領域">
                  <button type="button" data-preview-area-mode="standard" aria-pressed="true">標準</button>
                  <button type="button" data-preview-area-mode="expanded" aria-pressed="false">拡大</button>
                </div>
                <span>編集背景</span>
                <div class="speech-bubble-user-preview-background-actions">
                  <div class="speech-bubble-forge-segmented">
                    <button type="button" data-preview-background-mode="transparent" aria-pressed="true">透明</button>
                    <button type="button" data-preview-background-mode="white" aria-pressed="false">白</button>
                    <button type="button" data-preview-background-mode="gray" aria-pressed="false">灰</button>
                    <button type="button" data-preview-background-mode="black" aria-pressed="false">黒</button>
                  </div>
                  <label class="speech-bubble-user-preview-color" title="任意の背景色"><input type="color" value="#7f858d" data-preview-background-color aria-label="任意の背景色"></label>
                  <button type="button" data-preview-background-choose>任意画像</button>
                  <input type="file" data-preview-background-file accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" hidden>
                </div>
                <div class="speech-bubble-user-preview-view">
                  <div class="speech-bubble-forge-segmented">
                    <button type="button" data-preview-view-fit>全体表示</button>
                    <button type="button" data-preview-view-actual>100%</button>
                    <button type="button" data-preview-stamp-center>中央へ</button>
                  </div>
                  <output data-preview-zoom>全体表示</output>
                </div>
              </div>
              <div class="speech-bubble-user-preview-history" data-preview-background-history hidden>
                <span>一時保持</span><div data-preview-background-history-list></div><button type="button" data-preview-background-clear>全消去</button>
              </div>
              <small data-preview-background-status>任意画像はページ内で直近3件まで一時保持します</small>
            </div>
          </div>`;
    }

    function ensureDialogs() {
        if (document.getElementById("speech-bubble-user-preset-dialog")) return;
        const host = document.createElement("div");
        host.innerHTML = `
          <dialog id="speech-bubble-user-preset-dialog" class="speech-bubble-forge-dialog speech-bubble-user-preset-dialog">
            <div class="speech-bubble-forge-dialog-head"><strong data-user-dialog-title>ユーザープリセットを追加</strong><button type="button" data-user-dialog-close aria-label="閉じる">×</button></div>
            <div class="speech-bubble-forge-dialog-body">
              <div class="speech-bubble-user-editor-layout">
                <section class="speech-bubble-user-editor-preview-column">
                  <div class="speech-bubble-user-dialog-drop" data-user-dialog-drop tabindex="0" role="button">
                    <strong>PNG / WebPをドロップ</strong><span>または</span><button type="button" data-user-dialog-choose>ファイルを選択</button>
                  </div>
                  <input type="file" data-user-dialog-file accept="image/png,image/webp,.png,.webp" hidden>
                  ${stylePreviewMarkup(true)}
                  <div class="speech-bubble-user-metadata" data-user-dialog-metadata></div>
                  <label class="speech-bubble-user-confirm" data-user-dialog-resize-row hidden><input type="checkbox" data-user-dialog-resize>長辺${RESIZE_SIDE}pxへ縮小して登録する（任意）</label>
                  <label class="speech-bubble-user-confirm" data-user-dialog-opaque-row hidden><input type="checkbox" data-user-dialog-opaque>透明背景なしでも登録する</label>
                </section>
                <section class="speech-bubble-user-editor-controls-column">
                  <label>種類<select data-user-dialog-category><option value="sfx">Onomatopoeia / SFX</option><option value="stamp">Comic Stamps / Symbols</option></select></label>
                  <label>名前<input type="text" data-user-dialog-name maxlength="${NAME_MAX_LENGTH}" autocomplete="off"></label>
                  <div data-user-dialog-style-section>${styleEditorMarkup()}</div>
                  <div class="speech-bubble-user-conflict" data-user-dialog-conflict hidden>
                    <strong>同じ名前のプリセットがあります</strong><span data-user-dialog-conflict-message></span>
                    <div><button type="button" data-user-dialog-conflict-edit>既存を編集</button><button type="button" data-user-dialog-conflict-replace>既存を置換</button><button type="button" data-user-dialog-conflict-rename>別名で保存</button><button type="button" data-user-dialog-conflict-cancel>キャンセル</button></div>
                  </div>
                  <div class="speech-bubble-user-dialog-status" data-user-dialog-status aria-live="polite"></div>
                </section>
              </div>
            </div>
            <div class="speech-bubble-forge-dialog-actions"><button type="button" data-user-dialog-cancel>キャンセル</button><button type="button" class="primary" data-user-dialog-save disabled>登録する</button></div>
          </dialog>

          <dialog id="speech-bubble-user-manager-dialog" class="speech-bubble-forge-dialog speech-bubble-user-manager-dialog">
            <div class="speech-bubble-forge-dialog-head"><strong>ユーザープリセット管理</strong><button type="button" data-user-manager-close aria-label="閉じる">×</button></div>
            <div class="speech-bubble-forge-dialog-body">
              <div class="speech-bubble-user-manager-tabs" role="tablist"><button type="button" data-user-manager-category="sfx" aria-pressed="true">Onomatopoeia / SFX</button><button type="button" data-user-manager-category="stamp" aria-pressed="false">Comic Stamps / Symbols</button></div>
              <div class="speech-bubble-user-manager-tools"><input type="search" data-user-manager-search placeholder="名前で検索…"><div class="speech-bubble-forge-segmented"><button type="button" data-user-manager-view="grid" aria-pressed="true" title="グリッド表示">▦</button><button type="button" data-user-manager-view="list" aria-pressed="false" title="リスト表示">☷</button></div></div>
              <div class="speech-bubble-user-archive-tools"><span data-user-manager-archive-count>旧世代素材 0件</span><button type="button" data-user-manager-archive>整理</button></div>
              <div class="speech-bubble-user-manager-grid" data-user-manager-grid></div>
              <div class="speech-bubble-user-dialog-status" data-user-manager-status aria-live="polite"></div>
            </div>
            <div class="speech-bubble-forge-dialog-actions"><button type="button" data-user-manager-add>＋ 新規追加</button><button type="button" data-user-manager-close>閉じる</button></div>
          </dialog>

          <dialog id="speech-bubble-user-edit-dialog" class="speech-bubble-forge-dialog speech-bubble-user-edit-dialog">
            <div class="speech-bubble-forge-dialog-head"><strong>ユーザープリセットを編集</strong><button type="button" data-user-edit-close aria-label="閉じる">×</button></div>
            <div class="speech-bubble-forge-dialog-body">
              <div class="speech-bubble-user-editor-layout">
                <section class="speech-bubble-user-editor-preview-column">
                  ${stylePreviewMarkup()}
                  <div class="speech-bubble-user-metadata" data-user-edit-metadata></div>
                  <button type="button" data-user-edit-replace>画像を差し替える</button>
                  <small>初期スタイルの変更は、次回配置するレイヤーから適用されます。</small>
                </section>
                <section class="speech-bubble-user-editor-controls-column">
                  <label>名前<input type="text" data-user-edit-name maxlength="${NAME_MAX_LENGTH}"></label>
                  <label>種類<select data-user-edit-category><option value="sfx">Onomatopoeia / SFX</option><option value="stamp">Comic Stamps / Symbols</option></select></label>
                  ${styleEditorMarkup()}
                  <div class="speech-bubble-user-dialog-status" data-user-edit-status aria-live="polite"></div>
                </section>
              </div>
            </div>
            <div class="speech-bubble-forge-dialog-actions"><button type="button" data-user-edit-cancel>キャンセル</button><button type="button" data-user-edit-save-as>別名で保存</button><button type="button" class="primary" data-user-edit-save>上書き保存</button></div>
          </dialog>

          <dialog id="speech-bubble-diagnostic-dialog" class="speech-bubble-forge-dialog speech-bubble-diagnostic-dialog">
            <div class="speech-bubble-forge-dialog-head"><strong>Self Diagnostics</strong><button type="button" data-diagnostic-close aria-label="閉じる">×</button></div>
            <div class="speech-bubble-forge-dialog-body"><div class="speech-bubble-diagnostic-overall" data-diagnostic-overall></div><div class="speech-bubble-diagnostic-results" data-diagnostic-results></div></div>
            <div class="speech-bubble-forge-dialog-actions"><button type="button" data-diagnostic-copy>レポートをコピー</button><button type="button" data-diagnostic-close>閉じる</button></div>
          </dialog>`;
        document.body.append(...host.children);
        for (const dialog of [
            document.getElementById("speech-bubble-user-preset-dialog"),
            document.getElementById("speech-bubble-user-edit-dialog"),
        ]) {
            initializePreviewBackgroundControls(dialog);
            initializeStyleEditor(dialog);
        }
    }

    const previewBackgroundHistory = [];
    const previewViewSessions = new WeakMap();
    let activePreviewBackgroundId = "";
    let activePreviewBackgroundMode = "transparent";

    function previewSession(dialog) {
        let session = previewViewSessions.get(dialog);
        if (!session) {
            session = {
                areaMode: "standard",
                viewMode: "fit",
                zoom: 1,
                panX: 0,
                panY: 0,
                stampX: null,
                stampY: null,
                drag: null,
                stampRect: null,
            };
            previewViewSessions.set(dialog, session);
        }
        return session;
    }

    function activePreviewBackground() {
        if (activePreviewBackgroundMode !== "image") return null;
        return previewBackgroundHistory.find((item) => item.id === activePreviewBackgroundId) || null;
    }

    function previewBackgroundMode() {
        try {
            const saved = localStorage.getItem(PREVIEW_BACKGROUND_KEY);
            return ["transparent", "white", "gray", "black", "custom"].includes(saved) ? saved : "transparent";
        } catch {
            return "transparent";
        }
    }

    function previewCustomBackgroundColor() {
        try {
            const saved = String(localStorage.getItem(PREVIEW_CUSTOM_COLOR_KEY) || "");
            return /^#[0-9a-f]{6}$/i.test(saved) ? saved.toLowerCase() : "#7f858d";
        } catch {
            return "#7f858d";
        }
    }

    function renderAllStylePreviews() {
        for (const dialog of document.querySelectorAll(".speech-bubble-user-preset-dialog, .speech-bubble-user-edit-dialog")) {
            renderStylePreview(dialog);
        }
    }

    function updatePreviewControlState(dialog) {
        const session = previewSession(dialog);
        const background = activePreviewBackground();
        dialog?.querySelectorAll("[data-preview-area-mode]").forEach((button) => {
            button.setAttribute("aria-pressed", String(button.dataset.previewAreaMode === session.areaMode));
        });
        const viewControls = dialog?.querySelector(".speech-bubble-user-preview-view");
        if (viewControls) viewControls.hidden = !background;
        for (const selector of ["[data-preview-view-fit]", "[data-preview-view-actual]", "[data-preview-stamp-center]"]) {
            const button = dialog?.querySelector(selector);
            if (button) button.disabled = !background;
        }
        const fit = dialog?.querySelector("[data-preview-view-fit]");
        const actual = dialog?.querySelector("[data-preview-view-actual]");
        fit?.setAttribute("aria-pressed", String(Boolean(background) && session.viewMode === "fit"));
        actual?.setAttribute("aria-pressed", String(Boolean(background) && session.viewMode === "actual"));
        const zoom = dialog?.querySelector("[data-preview-zoom]");
        if (zoom) {
            zoom.textContent = background
                ? (session.viewMode === "fit" ? `全体 ${Math.round(session.zoom * 100)}%` : `${Math.round(session.zoom * 100)}%`)
                : "スタンプ表示";
        }
    }

    function applyPreviewBackgroundMode(mode, { persist = true } = {}) {
        let selected = ["transparent", "white", "gray", "black", "custom", "image"].includes(mode) ? mode : "transparent";
        if (selected === "image" && !previewBackgroundHistory.some((item) => item.id === activePreviewBackgroundId)) {
            selected = previewBackgroundMode();
        }
        activePreviewBackgroundMode = selected;
        const customColor = previewCustomBackgroundColor();
        document.querySelectorAll("[data-user-style-preview-wrap]").forEach((wrap) => {
            wrap.dataset.previewBackground = selected;
            wrap.style.setProperty("--speech-bubble-preview-background-color", customColor);
            wrap.querySelectorAll("[data-preview-background-mode]").forEach((button) => {
                button.setAttribute("aria-pressed", String(button.dataset.previewBackgroundMode === selected));
            });
            const color = wrap.querySelector("[data-preview-background-color]");
            if (color) {
                color.value = customColor;
                color.classList.toggle("active", selected === "custom");
            }
            wrap.querySelector("[data-preview-background-choose]")?.setAttribute("aria-pressed", String(selected === "image"));
            updatePreviewControlState(wrap.closest("dialog"));
        });
        if (persist && selected !== "image") {
            try {
                localStorage.setItem(PREVIEW_BACKGROUND_KEY, selected);
            } catch {
                // Preview background is an editing-only preference.
            }
        }
        renderPreviewBackgroundHistory();
        renderAllStylePreviews();
    }

    function applyPreviewCustomBackgroundColor(color) {
        const selected = /^#[0-9a-f]{6}$/i.test(String(color || "")) ? String(color).toLowerCase() : "#7f858d";
        try {
            localStorage.setItem(PREVIEW_CUSTOM_COLOR_KEY, selected);
        } catch {
            // A custom preview color is optional.
        }
        applyPreviewBackgroundMode("custom");
    }

    function resetPreviewView(dialog, viewMode = "fit") {
        const session = previewSession(dialog);
        const background = previewBackgroundHistory.find((item) => item.id === activePreviewBackgroundId) || null;
        session.viewMode = viewMode === "actual" ? "actual" : "fit";
        session.zoom = session.viewMode === "actual" ? 1 : session.zoom;
        session.panX = 0;
        session.panY = 0;
        session.stampX = background ? background.width / 2 : null;
        session.stampY = background ? background.height / 2 : null;
        session.drag = null;
    }

    function resetAllPreviewViews(viewMode = "fit") {
        for (const dialog of document.querySelectorAll(".speech-bubble-user-preset-dialog, .speech-bubble-user-edit-dialog")) {
            resetPreviewView(dialog, viewMode);
        }
    }

    function previewBackgroundStatus(dialog, message, level = "info") {
        const output = dialog?.querySelector("[data-preview-background-status]");
        if (!output) return;
        output.textContent = message;
        output.dataset.level = level;
    }

    function renderPreviewBackgroundHistory() {
        for (const dialog of document.querySelectorAll(".speech-bubble-user-preset-dialog, .speech-bubble-user-edit-dialog")) {
            const row = dialog.querySelector("[data-preview-background-history]");
            const list = dialog.querySelector("[data-preview-background-history-list]");
            if (!row || !list) continue;
            row.hidden = previewBackgroundHistory.length === 0;
            const items = previewBackgroundHistory.map((entry) => {
                const item = document.createElement("span");
                item.className = "speech-bubble-user-preview-history-item";
                const select = document.createElement("button");
                select.type = "button";
                select.className = "speech-bubble-user-preview-history-select";
                select.title = `${entry.name} / ${entry.width} × ${entry.height}px`;
                select.setAttribute("aria-label", `${entry.name}を背景に使用`);
                select.setAttribute("aria-pressed", String(activePreviewBackgroundMode === "image" && entry.id === activePreviewBackgroundId));
                const thumbnail = document.createElement("img");
                thumbnail.src = entry.url;
                thumbnail.alt = "";
                select.append(thumbnail);
                select.addEventListener("click", () => selectPreviewBackground(entry.id));
                const remove = document.createElement("button");
                remove.type = "button";
                remove.className = "speech-bubble-user-preview-history-remove";
                remove.textContent = "×";
                remove.title = `${entry.name}を一時保持から削除`;
                remove.setAttribute("aria-label", remove.title);
                remove.addEventListener("click", () => removePreviewBackground(entry.id));
                item.append(select, remove);
                return item;
            });
            list.replaceChildren(...items);
        }
    }

    function selectPreviewBackground(id) {
        const entry = previewBackgroundHistory.find((item) => item.id === id);
        if (!entry) return;
        activePreviewBackgroundId = entry.id;
        resetAllPreviewViews("fit");
        renderPreviewBackgroundHistory();
        applyPreviewBackgroundMode("image", { persist: false });
        for (const dialog of document.querySelectorAll(".speech-bubble-user-preset-dialog, .speech-bubble-user-edit-dialog")) {
            previewBackgroundStatus(dialog, `${entry.name} / ${entry.width} × ${entry.height}px（ページ内のみ保持）`);
        }
    }

    function removePreviewBackground(id) {
        const index = previewBackgroundHistory.findIndex((item) => item.id === id);
        if (index < 0) return;
        const [removed] = previewBackgroundHistory.splice(index, 1);
        if (activePreviewBackgroundId === id) {
            activePreviewBackgroundId = previewBackgroundHistory[0]?.id || "";
            if (activePreviewBackgroundId) {
                resetAllPreviewViews("fit");
                activePreviewBackgroundMode = "image";
            } else {
                activePreviewBackgroundMode = previewBackgroundMode();
            }
        }
        try {
            renderPreviewBackgroundHistory();
            applyPreviewBackgroundMode(activePreviewBackgroundMode, { persist: activePreviewBackgroundMode !== "image" });
        } finally {
            URL.revokeObjectURL(removed.url);
        }
    }

    function clearPreviewBackgrounds() {
        const removed = previewBackgroundHistory.splice(0);
        activePreviewBackgroundId = "";
        resetAllPreviewViews("fit");
        try {
            renderPreviewBackgroundHistory();
            applyPreviewBackgroundMode(previewBackgroundMode());
            for (const dialog of document.querySelectorAll(".speech-bubble-user-preset-dialog, .speech-bubble-user-edit-dialog")) {
                previewBackgroundStatus(dialog, "任意画像を消去しました。画像はディスクへ保存されていません。");
            }
        } finally {
            for (const entry of removed) URL.revokeObjectURL(entry.url);
        }
    }

    async function addPreviewBackgroundFile(file, dialog) {
        if (!acceptedPreviewBackgroundFile(file)) {
            previewBackgroundStatus(dialog, "背景にはPNG、JPEG、WebPを使用してください。", "error");
            return;
        }
        if (file.size > MAX_PREVIEW_BACKGROUND_BYTES) {
            previewBackgroundStatus(dialog, `背景画像は${formatBytes(MAX_PREVIEW_BACKGROUND_BYTES)}以下にしてください。`, "error");
            return;
        }
        const url = URL.createObjectURL(file);
        try {
            const image = await loadPreviewImage(url);
            const width = image.naturalWidth;
            const height = image.naturalHeight;
            if (!width || !height || width * height > MAX_PREVIEW_BACKGROUND_PIXELS) {
                throw new Error("背景画像の総画素数が大きすぎます。");
            }
            const entry = {
                id: globalThis.crypto?.randomUUID?.() || `preview-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                name: normalizedName(file.name) || "貼り付け画像",
                size: file.size,
                url,
                image,
                width,
                height,
            };
            previewBackgroundHistory.unshift(entry);
            while (previewBackgroundHistory.length > MAX_PREVIEW_BACKGROUND_HISTORY) {
                const expired = previewBackgroundHistory.pop();
                URL.revokeObjectURL(expired.url);
            }
            activePreviewBackgroundId = entry.id;
            resetAllPreviewViews("fit");
            renderPreviewBackgroundHistory();
            applyPreviewBackgroundMode("image", { persist: false });
            for (const target of document.querySelectorAll(".speech-bubble-user-preset-dialog, .speech-bubble-user-edit-dialog")) {
                previewBackgroundStatus(target, `${entry.name} / ${width} × ${height}px（ページ内のみ保持）`);
            }
        } catch (error) {
            URL.revokeObjectURL(url);
            previewBackgroundStatus(dialog, error.message || "背景画像を読み込めませんでした。", "error");
        }
    }

    function previewCanvasPoint(canvas, event) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (event.clientX - rect.left) * canvas.width / Math.max(1, rect.width),
            y: (event.clientY - rect.top) * canvas.height / Math.max(1, rect.height),
        };
    }

    function resetPreviewAreaMode(dialog) {
        if (!dialog) return;
        const session = previewSession(dialog);
        session.areaMode = "standard";
        dialog.classList.remove("preview-expanded");
        resetPreviewView(dialog, "fit");
        updatePreviewControlState(dialog);
        requestAnimationFrame(() => renderStylePreview(dialog));
    }

    function setPreviewAreaMode(dialog, mode) {
        if (mode !== "expanded") {
            resetPreviewAreaMode(dialog);
            return;
        }
        const session = previewSession(dialog);
        session.areaMode = "expanded";
        dialog.classList.add("preview-expanded");
        if (activePreviewBackground()) resetPreviewView(dialog, "actual");
        updatePreviewControlState(dialog);
        requestAnimationFrame(() => renderStylePreview(dialog));
    }

    function setPreviewZoomAtPoint(dialog, nextZoom, point) {
        const canvas = dialog?.querySelector("[data-user-style-preview]");
        const background = activePreviewBackground();
        if (!canvas || !background) return;
        const session = previewSession(dialog);
        const oldZoom = Math.max(PREVIEW_ZOOM_MIN, session.zoom || previewFitScale(canvas.width, canvas.height, background.width, background.height));
        const zoom = Math.max(PREVIEW_ZOOM_MIN, Math.min(PREVIEW_ZOOM_MAX, Number(nextZoom) || oldZoom));
        const originX = canvas.width / 2 + session.panX - background.width * oldZoom / 2;
        const originY = canvas.height / 2 + session.panY - background.height * oldZoom / 2;
        const imageX = (point.x - originX) / oldZoom;
        const imageY = (point.y - originY) / oldZoom;
        session.zoom = zoom;
        session.viewMode = "custom";
        session.panX = point.x - canvas.width / 2 + background.width * zoom / 2 - imageX * zoom;
        session.panY = point.y - canvas.height / 2 + background.height * zoom / 2 - imageY * zoom;
        renderStylePreview(dialog);
    }

    function bindPreviewCanvas(dialog) {
        const canvas = dialog?.querySelector("[data-user-style-preview]");
        if (!canvas || canvas.dataset.previewReady === "1") return;
        canvas.dataset.previewReady = "1";
        canvas.addEventListener("dragenter", (event) => { event.preventDefault(); canvas.classList.add("drag-active"); });
        canvas.addEventListener("dragover", (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; canvas.classList.add("drag-active"); });
        canvas.addEventListener("dragleave", () => canvas.classList.remove("drag-active"));
        canvas.addEventListener("drop", (event) => {
            event.preventDefault();
            event.stopPropagation();
            canvas.classList.remove("drag-active");
            const file = [...(event.dataTransfer?.files || [])].find(acceptedPreviewBackgroundFile);
            if (file) addPreviewBackgroundFile(file, dialog);
            else previewBackgroundStatus(dialog, "背景にはPNG、JPEG、WebPをドロップしてください。", "error");
        });
        canvas.addEventListener("paste", (event) => {
            const file = [...(event.clipboardData?.files || [])].find(acceptedPreviewBackgroundFile)
                || [...(event.clipboardData?.items || [])].find((item) => item.kind === "file" && /^image\//i.test(item.type))?.getAsFile();
            if (!file) return;
            event.preventDefault();
            addPreviewBackgroundFile(file, dialog);
        });
        canvas.addEventListener("pointerdown", (event) => {
            const background = activePreviewBackground();
            if (!background || ![0, 1].includes(event.button)) return;
            const session = previewSession(dialog);
            const point = previewCanvasPoint(canvas, event);
            const rect = session.stampRect;
            const stamp = rect && point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
            session.drag = {
                type: !event.shiftKey && event.button === 0 && stamp ? "stamp" : "canvas",
                x: point.x,
                y: point.y,
                panX: session.panX,
                panY: session.panY,
                stampX: session.stampX,
                stampY: session.stampY,
            };
            canvas.dataset.previewDragging = session.drag.type;
            canvas.setPointerCapture(event.pointerId);
            event.preventDefault();
        });
        canvas.addEventListener("pointermove", (event) => {
            const background = activePreviewBackground();
            const session = previewSession(dialog);
            if (!background || !session.drag) return;
            const point = previewCanvasPoint(canvas, event);
            if (session.drag.type === "stamp") {
                session.stampX = Math.max(0, Math.min(background.width, session.drag.stampX + (point.x - session.drag.x) / session.zoom));
                session.stampY = Math.max(0, Math.min(background.height, session.drag.stampY + (point.y - session.drag.y) / session.zoom));
            } else {
                session.panX = session.drag.panX + point.x - session.drag.x;
                session.panY = session.drag.panY + point.y - session.drag.y;
            }
            renderStylePreview(dialog);
        });
        const finishDrag = () => {
            const session = previewSession(dialog);
            session.drag = null;
            delete canvas.dataset.previewDragging;
        };
        canvas.addEventListener("pointerup", finishDrag);
        canvas.addEventListener("pointercancel", finishDrag);
        canvas.addEventListener("lostpointercapture", finishDrag);
        canvas.addEventListener("wheel", (event) => {
            if (!activePreviewBackground()) return;
            event.preventDefault();
            const session = previewSession(dialog);
            const factor = Math.exp(-event.deltaY * 0.0015);
            setPreviewZoomAtPoint(dialog, session.zoom * factor, previewCanvasPoint(canvas, event));
        }, { passive: false });
        if (typeof ResizeObserver === "function") {
            const observer = new ResizeObserver(() => renderStylePreview(dialog));
            observer.observe(canvas);
            canvas._previewResizeObserver = observer;
        }
    }

    function initializePreviewBackgroundControls(dialog) {
        const wrap = dialog?.querySelector("[data-user-style-preview-wrap]");
        if (!wrap) return;
        if (wrap.dataset.previewControlsReady === "1") {
            updatePreviewControlState(dialog);
            return;
        }
        wrap.dataset.previewControlsReady = "1";
        wrap.querySelectorAll("[data-preview-background-mode]").forEach((button) => {
            button.addEventListener("click", () => applyPreviewBackgroundMode(button.dataset.previewBackgroundMode));
        });
        const color = wrap.querySelector("[data-preview-background-color]");
        color.value = previewCustomBackgroundColor();
        color.addEventListener("input", () => applyPreviewCustomBackgroundColor(color.value));
        color.addEventListener("click", () => applyPreviewBackgroundMode("custom"));
        const fileInput = wrap.querySelector("[data-preview-background-file]");
        wrap.querySelector("[data-preview-background-choose]").addEventListener("click", () => {
            fileInput.value = "";
            fileInput.click();
        });
        fileInput.addEventListener("change", () => {
            const file = fileInput.files?.[0];
            if (file) addPreviewBackgroundFile(file, dialog);
        });
        wrap.querySelector("[data-preview-background-clear]").addEventListener("click", clearPreviewBackgrounds);
        wrap.querySelectorAll("[data-preview-area-mode]").forEach((button) => {
            button.addEventListener("click", () => setPreviewAreaMode(dialog, button.dataset.previewAreaMode));
        });
        wrap.querySelector("[data-preview-view-fit]").addEventListener("click", () => {
            resetPreviewView(dialog, "fit");
            renderStylePreview(dialog);
        });
        wrap.querySelector("[data-preview-view-actual]").addEventListener("click", () => {
            resetPreviewView(dialog, "actual");
            renderStylePreview(dialog);
        });
        wrap.querySelector("[data-preview-stamp-center]").addEventListener("click", () => {
            const background = activePreviewBackground();
            if (!background) return;
            const session = previewSession(dialog);
            session.stampX = background.width / 2;
            session.stampY = background.height / 2;
            renderStylePreview(dialog);
        });
        bindPreviewCanvas(dialog);
        dialog.addEventListener("close", () => {
            if (previewSession(dialog).areaMode === "expanded") resetPreviewAreaMode(dialog);
        });
        renderPreviewBackgroundHistory();
        applyPreviewBackgroundMode(activePreviewBackgroundId ? "image" : previewBackgroundMode(), { persist: false });
    }

    function clampStyleNumber(value, minimum, maximum, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
    }

    function defaultStyleDefaults(width = 360, height = 360) {
        return {
            mask_mode: false,
            width: Math.max(1, Math.min(8192, Math.round(Number(width) || 360))),
            height: Math.max(1, Math.min(8192, Math.round(Number(height) || 360))),
            opacity: 1,
            fill: "#ffffff",
            stroke: "#111111",
            stroke_width: 0,
            shadow_enabled: false,
            shadow_color: "#000000",
            shadow_x: 6,
            shadow_y: 6,
            shadow_blur: 4,
            glow_enabled: false,
            glow_color: "#ffffff",
            glow_opacity: 0.75,
            glow_blur: 16,
            glow_spread: 0,
        };
    }

    function normalizedStyleDefaults(value, width = 360, height = 360) {
        const defaults = defaultStyleDefaults(width, height);
        const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
        const color = (candidate, fallback) => /^#[0-9a-f]{6}$/i.test(String(candidate || "")) ? String(candidate).toLowerCase() : fallback;
        return {
            mask_mode: source.mask_mode === true,
            width: clampStyleNumber(source.width, 1, 8192, defaults.width),
            height: clampStyleNumber(source.height, 1, 8192, defaults.height),
            opacity: clampStyleNumber(source.opacity, 0, 1, defaults.opacity),
            fill: color(source.fill, defaults.fill),
            stroke: color(source.stroke, defaults.stroke),
            stroke_width: clampStyleNumber(source.stroke_width, 0, 100, defaults.stroke_width),
            shadow_enabled: source.shadow_enabled === true,
            shadow_color: color(source.shadow_color, defaults.shadow_color),
            shadow_x: clampStyleNumber(source.shadow_x, -500, 500, defaults.shadow_x),
            shadow_y: clampStyleNumber(source.shadow_y, -500, 500, defaults.shadow_y),
            shadow_blur: clampStyleNumber(source.shadow_blur, 0, 200, defaults.shadow_blur),
            glow_enabled: source.glow_enabled === true,
            glow_color: color(source.glow_color, defaults.glow_color),
            glow_opacity: clampStyleNumber(source.glow_opacity, 0, 1, defaults.glow_opacity),
            glow_blur: clampStyleNumber(source.glow_blur, 0, 200, defaults.glow_blur),
            glow_spread: clampStyleNumber(source.glow_spread, 0, 100, defaults.glow_spread),
        };
    }

    function styleEditorRoot(dialog) {
        return dialog?.querySelector("[data-user-style-editor]") || null;
    }

    function setStylePair(root, name, value) {
        for (const suffix of ["number", "range"]) {
            const input = root?.querySelector(`[data-style-${name}-${suffix}]`);
            if (input) input.value = String(value);
        }
    }

    function styleSourceDimensions(root) {
        return {
            width: Math.max(1, Number(root?.dataset.styleSourceWidth) || 360),
            height: Math.max(1, Number(root?.dataset.styleSourceHeight) || 360),
        };
    }

    function updateStyleSizeFromDimensions(dialog) {
        const root = styleEditorRoot(dialog);
        if (!root) return;
        const source = styleSourceDimensions(root);
        const width = clampStyleNumber(root.querySelector("[data-style-width]")?.value, 1, 8192, source.width);
        const height = clampStyleNumber(root.querySelector("[data-style-height]")?.value, 1, 8192, source.height);
        const percent = Math.round(((width / source.width) + (height / source.height)) * 50);
        setStylePair(root, "size", clampStyleNumber(percent, 10, 400, 100));
    }

    function styleDefaultsFromDialog(dialog) {
        const root = styleEditorRoot(dialog);
        const source = styleSourceDimensions(root);
        if (!root) return defaultStyleDefaults(source.width, source.height);
        return normalizedStyleDefaults({
            mask_mode: root.querySelector('[data-style-mode="fill"]')?.getAttribute("aria-pressed") === "true",
            width: root.querySelector("[data-style-width]")?.value,
            height: root.querySelector("[data-style-height]")?.value,
            opacity: root.querySelector("[data-style-opacity-number]")?.value,
            fill: root.querySelector("[data-style-fill]")?.value,
            stroke: root.querySelector("[data-style-stroke]")?.value,
            stroke_width: root.querySelector("[data-style-stroke-width-number]")?.value,
            shadow_enabled: root.querySelector("[data-style-shadow-enabled]")?.checked === true,
            shadow_color: root.querySelector("[data-style-shadow-color]")?.value,
            shadow_x: root.querySelector("[data-style-shadow-x]")?.value,
            shadow_y: root.querySelector("[data-style-shadow-y]")?.value,
            shadow_blur: root.querySelector("[data-style-shadow-blur]")?.value,
            glow_enabled: root.querySelector("[data-style-glow-enabled]")?.checked === true,
            glow_color: root.querySelector("[data-style-glow-color]")?.value,
            glow_opacity: root.querySelector("[data-style-glow-opacity-number]")?.value,
            glow_blur: root.querySelector("[data-style-glow-blur-number]")?.value,
            glow_spread: root.querySelector("[data-style-glow-spread-number]")?.value,
        }, source.width, source.height);
    }

    function applyStyleDefaults(dialog, value, width = 360, height = 360) {
        const root = styleEditorRoot(dialog);
        if (!root) return;
        const style = normalizedStyleDefaults(value, width, height);
        root.dataset.styleSourceWidth = String(Math.max(1, Number(width) || style.width));
        root.dataset.styleSourceHeight = String(Math.max(1, Number(height) || style.height));
        root.querySelectorAll("[data-style-mode]").forEach((button) => {
            button.setAttribute("aria-pressed", String(button.dataset.styleMode === (style.mask_mode ? "fill" : "original")));
        });
        root.querySelector("[data-style-width]").value = String(style.width);
        root.querySelector("[data-style-height]").value = String(style.height);
        setStylePair(root, "opacity", style.opacity);
        root.querySelector("[data-style-fill]").value = style.fill;
        root.querySelector("[data-style-stroke]").value = style.stroke;
        setStylePair(root, "stroke-width", style.stroke_width);
        root.querySelector("[data-style-shadow-enabled]").checked = style.shadow_enabled;
        root.querySelector("[data-style-shadow-color]").value = style.shadow_color;
        root.querySelector("[data-style-shadow-x]").value = String(style.shadow_x);
        root.querySelector("[data-style-shadow-y]").value = String(style.shadow_y);
        root.querySelector("[data-style-shadow-blur]").value = String(style.shadow_blur);
        root.querySelector("[data-style-glow-enabled]").checked = style.glow_enabled;
        root.querySelector("[data-style-glow-color]").value = style.glow_color;
        setStylePair(root, "glow-opacity", style.glow_opacity);
        setStylePair(root, "glow-blur", style.glow_blur);
        setStylePair(root, "glow-spread", style.glow_spread);
        updateStyleSizeFromDimensions(dialog);
        updateStyleEditorUi(dialog);
        renderStylePreview(dialog);
    }

    function tintedStylePreview(image, width, height, color = "") {
        const surface = document.createElement("canvas");
        surface.width = Math.max(1, Math.ceil(width));
        surface.height = Math.max(1, Math.ceil(height));
        const context = surface.getContext("2d");
        context.drawImage(image, 0, 0, surface.width, surface.height);
        if (color) {
            context.globalCompositeOperation = "source-in";
            context.fillStyle = color;
            context.fillRect(0, 0, surface.width, surface.height);
            context.globalCompositeOperation = "source-over";
        }
        return surface;
    }

    function drawStyleOuterGlow(context, asset, x, y, width, height, style, scale = 1) {
        if (!style.glow_enabled) return;
        const glow = tintedStylePreview(asset, width, height, style.glow_color);
        const spread = style.glow_spread * scale;
        const passes = spread > 0 ? 12 : 1;
        context.save();
        context.globalAlpha = style.opacity * style.glow_opacity;
        context.filter = style.glow_blur > 0 ? `blur(${style.glow_blur * scale}px)` : "none";
        for (let index = 0; index < passes; index += 1) {
            const angle = passes === 1 ? 0 : index / passes * Math.PI * 2;
            context.drawImage(
                glow,
                x + (passes === 1 ? 0 : Math.cos(angle) * spread),
                y + (passes === 1 ? 0 : Math.sin(angle) * spread),
                width,
                height,
            );
        }
        context.restore();
    }

    function styledPresetThumbnailDataUrl(preset, image) {
        const canvas = document.createElement("canvas");
        canvas.width = 384;
        canvas.height = 240;
        const context = canvas.getContext("2d");
        const style = normalizedStyleDefaults(preset?.style_defaults, preset?.width, preset?.height);
        const effectPadding = Math.max(
            4,
            style.stroke_width * 2,
            style.shadow_enabled
                ? Math.max(Math.abs(style.shadow_x), Math.abs(style.shadow_y)) + style.shadow_blur * 2
                : 0,
            style.glow_enabled ? style.glow_spread + style.glow_blur * 3 : 0,
        );
        const scale = Math.min(
            (canvas.width - 24) / Math.max(1, style.width + effectPadding * 2),
            (canvas.height - 24) / Math.max(1, style.height + effectPadding * 2),
            1,
        );
        const width = Math.max(1, style.width * scale);
        const height = Math.max(1, style.height * scale);
        const x = (canvas.width - width) / 2;
        const y = (canvas.height - height) / 2;
        const asset = tintedStylePreview(image, width, height, style.mask_mode ? style.fill : "");
        const outline = style.stroke_width > 0 ? tintedStylePreview(image, width, height, style.stroke) : null;
        drawStyleOuterGlow(context, asset, x, y, width, height, style, scale);
        context.save();
        context.globalAlpha = style.opacity;
        if (style.shadow_enabled) {
            context.save();
            context.shadowColor = style.shadow_color;
            context.shadowOffsetX = style.shadow_x;
            context.shadowOffsetY = style.shadow_y;
            context.shadowBlur = style.shadow_blur;
            context.drawImage(asset, x, y, width, height);
            context.restore();
        }
        if (outline) {
            const steps = Math.max(16, Math.min(96, Math.ceil(style.stroke_width * 5)));
            for (let index = 0; index < steps; index += 1) {
                const angle = index / steps * Math.PI * 2;
                context.drawImage(
                    outline,
                    x + Math.cos(angle) * style.stroke_width,
                    y + Math.sin(angle) * style.stroke_width,
                    width,
                    height,
                );
            }
        }
        context.drawImage(asset, x, y, width, height);
        context.restore();
        return canvas.toDataURL("image/png");
    }

    function applyStyledPresetThumbnail(target, preset) {
        if (!target || !preset?.thumbnail_url) return;
        target.src = preset.thumbnail_url;
        const image = new Image();
        image.onload = () => {
            try {
                target.src = styledPresetThumbnailDataUrl(preset, image);
            } catch {
                target.src = preset.thumbnail_url;
            }
        };
        image.src = preset.thumbnail_url;
    }

    function syncStylePreviewCanvasSize(canvas) {
        const rect = canvas?.getBoundingClientRect?.();
        const width = Math.max(1, Math.round(rect?.width || canvas?.width || 640));
        const height = Math.max(1, Math.round(rect?.height || canvas?.height || 360));
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
    }

    function renderStylePreview(dialog) {
        const root = styleEditorRoot(dialog);
        const canvas = dialog?.querySelector("[data-user-style-preview]");
        const image = root?._previewImage;
        const imageWidth = Number(root?._previewImageWidth || image?.naturalWidth || image?.width);
        if (!root || !canvas || !image || !imageWidth) return;
        syncStylePreviewCanvasSize(canvas);
        const context = canvas.getContext("2d");
        const style = styleDefaultsFromDialog(dialog);
        const source = styleSourceDimensions(root);
        const background = activePreviewBackground();
        const session = previewSession(dialog);
        let scale = Math.min((canvas.width - 96) / source.width, (canvas.height - 80) / source.height, 1);
        let width = Math.max(1, Math.min(canvas.width * 3, style.width * scale));
        let height = Math.max(1, Math.min(canvas.height * 3, style.height * scale));
        let x = (canvas.width - width) / 2;
        let y = (canvas.height - height) / 2;
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (background) {
            if (session.viewMode === "fit") {
                session.zoom = previewFitScale(canvas.width, canvas.height, background.width, background.height);
                session.panX = 0;
                session.panY = 0;
            } else if (session.viewMode === "actual") {
                session.zoom = 1;
            }
            session.zoom = Math.max(PREVIEW_ZOOM_MIN, Math.min(PREVIEW_ZOOM_MAX, Number(session.zoom) || 1));
            if (!Number.isFinite(session.stampX) || !Number.isFinite(session.stampY)) {
                session.stampX = background.width / 2;
                session.stampY = background.height / 2;
            }
            const rect = previewStampRect(
                canvas.width,
                canvas.height,
                background.width,
                background.height,
                session.zoom,
                session.panX,
                session.panY,
                session.stampX,
                session.stampY,
                style.width,
                style.height,
            );
            x = rect.x;
            y = rect.y;
            width = rect.width;
            height = rect.height;
            scale = session.zoom;
            session.stampRect = rect;
            context.drawImage(
                background.image,
                rect.originX,
                rect.originY,
                background.width * scale,
                background.height * scale,
            );
        } else {
            session.stampRect = { x, y, width, height };
        }
        const asset = tintedStylePreview(image, width, height, style.mask_mode ? style.fill : "");
        const outline = style.stroke_width > 0 ? tintedStylePreview(image, width, height, style.stroke) : null;
        const effectScale = background ? scale : 1;
        drawStyleOuterGlow(context, asset, x, y, width, height, style, scale);
        context.save();
        context.globalAlpha = style.opacity;
        if (style.shadow_enabled) {
            context.save();
            context.shadowColor = style.shadow_color;
            context.shadowOffsetX = style.shadow_x * effectScale;
            context.shadowOffsetY = style.shadow_y * effectScale;
            context.shadowBlur = style.shadow_blur * effectScale;
            context.drawImage(asset, x, y, width, height);
            context.restore();
        }
        if (outline) {
            const outlineWidth = style.stroke_width * effectScale;
            const steps = Math.max(16, Math.min(96, Math.ceil(outlineWidth * 5)));
            for (let index = 0; index < steps; index += 1) {
                const angle = index / steps * Math.PI * 2;
                context.drawImage(outline, x + Math.cos(angle) * outlineWidth, y + Math.sin(angle) * outlineWidth, width, height);
            }
        }
        context.drawImage(asset, x, y, width, height);
        context.restore();
        updatePreviewControlState(dialog);
    }

    function setStylePreviewImage(dialog, src) {
        const root = styleEditorRoot(dialog);
        const wrap = dialog?.querySelector("[data-user-style-preview-wrap]");
        if (!root || !src) return;
        const request = String(src);
        root._previewRequest = request;
        const image = new Image();
        image.onload = () => {
            if (root._previewRequest !== request) return;
            root._previewImage = image;
            root._previewImageWidth = image.naturalWidth;
            root._previewImageHeight = image.naturalHeight;
            const background = activePreviewBackground();
            if (background) {
                const session = previewSession(dialog);
                session.stampX = background.width / 2;
                session.stampY = background.height / 2;
            }
            if (wrap) wrap.hidden = false;
            renderStylePreview(dialog);
        };
        image.onerror = () => {
            if (root._previewRequest === request && wrap) wrap.hidden = true;
        };
        image.src = request;
    }

    function setDecodedStylePreviewImage(dialog, image, width, height) {
        const root = styleEditorRoot(dialog);
        const wrap = dialog?.querySelector("[data-user-style-preview-wrap]");
        if (!root || !image || !width || !height) return;
        root._previewRequest = "";
        root._previewImage = image;
        root._previewImageWidth = width;
        root._previewImageHeight = height;
        if (wrap) wrap.hidden = false;
        renderStylePreview(dialog);
    }

    function clearStylePreviewImage(dialog) {
        const root = styleEditorRoot(dialog);
        const canvas = dialog?.querySelector("[data-user-style-preview]");
        if (root) {
            root._previewRequest = "";
            root._previewImage = null;
            root._previewImageWidth = 0;
            root._previewImageHeight = 0;
        }
        if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    }

    function updateStyleEditorUi(dialog) {
        const root = styleEditorRoot(dialog);
        if (!root) return;
        const target = root.dataset.styleColorTarget === "stroke" ? "stroke" : "fill";
        root.querySelectorAll("[data-style-color-target]").forEach((button) => {
            button.setAttribute("aria-pressed", String(button.dataset.styleColorTarget === target));
        });
        const selectedColor = String(root.querySelector(`[data-style-${target}]`)?.value || "").toLowerCase();
        root.querySelectorAll("[data-style-palette] button").forEach((button) => {
            const active = button.dataset.color === selectedColor;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
        });
        const selectedShadow = String(root.querySelector("[data-style-shadow-color]")?.value || "").toLowerCase();
        root.querySelectorAll("[data-style-shadow-palette] button").forEach((button) => {
            const active = button.dataset.color === selectedShadow;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
        });
        const selectedGlow = String(root.querySelector("[data-style-glow-color]")?.value || "").toLowerCase();
        root.querySelectorAll("[data-style-glow-palette] button").forEach((button) => {
            const active = button.dataset.color === selectedGlow;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
        });
        const shadowEnabled = root.querySelector("[data-style-shadow-enabled]")?.checked === true;
        const shadowX = Number(root.querySelector("[data-style-shadow-x]")?.value) || 0;
        const shadowY = Number(root.querySelector("[data-style-shadow-y]")?.value) || 0;
        const activeDirection = shadowEnabled ? `${Math.sign(shadowX)},${Math.sign(shadowY)}` : "0,0";
        root.querySelectorAll("[data-style-shadow-dir]").forEach((button) => {
            const active = button.dataset.styleShadowDir === activeDirection;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
        });
        root.querySelectorAll(".speech-bubble-user-shadow input:not([data-style-shadow-enabled])").forEach((input) => {
            input.disabled = !shadowEnabled;
        });
        const glowEnabled = root.querySelector("[data-style-glow-enabled]")?.checked === true;
        root.querySelectorAll(".speech-bubble-user-glow input:not([data-style-glow-enabled])").forEach((input) => {
            input.disabled = !glowEnabled;
        });
    }

    function selectStyleMode(root, mode) {
        root?.querySelectorAll("[data-style-mode]").forEach((button) => {
            button.setAttribute("aria-pressed", String(button.dataset.styleMode === mode));
        });
    }

    function styleShadowDirection(currentX, currentY, directionX, directionY) {
        const dx = Math.sign(Number(directionX) || 0);
        const dy = Math.sign(Number(directionY) || 0);
        const distance = Math.max(6, Math.abs(Number(currentX) || 0), Math.abs(Number(currentY) || 0));
        return {
            enabled: dx !== 0 || dy !== 0,
            x: dx * distance,
            y: dy * distance,
        };
    }

    function initializeStyleEditor(dialog) {
        const root = styleEditorRoot(dialog);
        if (!root || root.dataset.styleReady === "1") return;
        root.dataset.styleReady = "1";
        root.dataset.styleColorTarget = "fill";
        const palette = root.querySelector("[data-style-palette]");
        const makeSwatch = (color, onSelect) => {
            const button = document.createElement("button");
            button.type = "button";
            button.title = color;
            button.setAttribute("aria-label", color);
            button.dataset.color = color.toLowerCase();
            button.style.setProperty("--speech-bubble-swatch-color", color);
            button.addEventListener("click", onSelect);
            return button;
        };
        palette.replaceChildren(...STYLE_SWATCHES.map((color) => makeSwatch(color, () => {
                const target = root.dataset.styleColorTarget === "stroke" ? "stroke" : "fill";
                root.querySelector(`[data-style-${target}]`).value = color;
                if (target === "fill") selectStyleMode(root, "fill");
                updateStyleEditorUi(dialog);
                renderStylePreview(dialog);
        })));
        root.querySelector("[data-style-shadow-palette]").replaceChildren(...STYLE_SWATCHES.map((color) => makeSwatch(color, () => {
            root.querySelector("[data-style-shadow-color]").value = color;
            updateStyleEditorUi(dialog);
            renderStylePreview(dialog);
        })));
        root.querySelector("[data-style-glow-palette]").replaceChildren(...STYLE_SWATCHES.map((color) => makeSwatch(color, () => {
            root.querySelector("[data-style-glow-color]").value = color;
            updateStyleEditorUi(dialog);
            renderStylePreview(dialog);
        })));
        root.querySelectorAll("[data-style-mode]").forEach((button) => button.addEventListener("click", () => {
            selectStyleMode(root, button.dataset.styleMode);
            renderStylePreview(dialog);
        }));
        root.querySelectorAll("[data-style-color-target]").forEach((button) => button.addEventListener("click", () => {
            root.dataset.styleColorTarget = button.dataset.styleColorTarget;
            updateStyleEditorUi(dialog);
        }));
        root.querySelectorAll("[data-style-shadow-dir]").forEach((button) => button.addEventListener("click", () => {
            const [dx, dy] = button.dataset.styleShadowDir.split(",").map(Number);
            const direction = styleShadowDirection(
                root.querySelector("[data-style-shadow-x]").value,
                root.querySelector("[data-style-shadow-y]").value,
                dx,
                dy,
            );
            root.querySelector("[data-style-shadow-enabled]").checked = direction.enabled;
            root.querySelector("[data-style-shadow-x]").value = String(direction.x);
            root.querySelector("[data-style-shadow-y]").value = String(direction.y);
            updateStyleEditorUi(dialog);
            renderStylePreview(dialog);
        }));
        const bindPair = (name, callback = () => renderStylePreview(dialog)) => {
            const number = root.querySelector(`[data-style-${name}-number]`);
            const range = root.querySelector(`[data-style-${name}-range]`);
            for (const input of [number, range]) {
                input.addEventListener("input", () => {
                    const other = input === number ? range : number;
                    other.value = input.value;
                    callback(input.value);
                });
            }
        };
        bindPair("size", (value) => {
            const source = styleSourceDimensions(root);
            const percent = clampStyleNumber(value, 10, 400, 100);
            root.querySelector("[data-style-width]").value = String(Math.max(1, Math.round(source.width * percent / 100)));
            root.querySelector("[data-style-height]").value = String(Math.max(1, Math.round(source.height * percent / 100)));
            renderStylePreview(dialog);
        });
        bindPair("opacity");
        bindPair("stroke-width");
        bindPair("glow-opacity");
        bindPair("glow-blur");
        bindPair("glow-spread");
        for (const input of root.querySelectorAll("[data-style-width], [data-style-height]")) {
            input.addEventListener("input", () => {
                updateStyleSizeFromDimensions(dialog);
                renderStylePreview(dialog);
            });
        }
        for (const input of root.querySelectorAll('input[type="color"], [data-style-shadow-x], [data-style-shadow-y], [data-style-shadow-blur]')) {
            input.addEventListener("input", () => {
                if (input.matches("[data-style-fill]")) selectStyleMode(root, "fill");
                updateStyleEditorUi(dialog);
                renderStylePreview(dialog);
            });
        }
        root.querySelector("[data-style-shadow-enabled]").addEventListener("change", () => {
            updateStyleEditorUi(dialog);
            renderStylePreview(dialog);
        });
        root.querySelector("[data-style-glow-enabled]").addEventListener("change", () => {
            updateStyleEditorUi(dialog);
            renderStylePreview(dialog);
        });
        applyStyleDefaults(dialog, null);
    }

    const state = {
        panel: null,
        category: "sfx",
        catalog: { presets: [], counts: { sfx: 0, stamp: 0 }, revision: 0 },
        pending: null,
        replacePresetId: "",
        managerCategory: "sfx",
        managerView: "grid",
        editPresetId: "",
        lastDiagnostic: null,
        broadcast: null,
    };

    function setPanelStatus(message, level = "info") {
        const output = state.panel?.querySelector("[data-speech-bubble-user-status]");
        if (!output) return;
        output.textContent = message || "";
        output.dataset.level = level;
    }

    function updateCategoryButtons() {
        state.panel?.querySelectorAll("[data-speech-bubble-user-category]").forEach((button) => {
            const active = button.dataset.speechBubbleUserCategory === state.category;
            button.setAttribute("aria-pressed", String(active));
        });
    }

    function updateCatalogUi() {
        if (!state.panel) return;
        for (const category of ["sfx", "stamp"]) {
            const count = Number(state.catalog.counts?.[category] || 0);
            const output = state.panel.querySelector(`[data-speech-bubble-user-count="${category}"]`);
            if (output) output.textContent = `${count}個`;
        }
        const summary = state.panel.querySelector("[data-speech-bubble-user-summary]");
        if (summary) summary.textContent = `SFX ${state.catalog.counts?.sfx || 0}個 / Stamps ${state.catalog.counts?.stamp || 0}個`;
        renderManager();
    }

    async function loadCatalog({ quiet = false } = {}) {
        try {
            state.catalog = await apiRequest(USER_ASSET_ENDPOINT);
            updateCatalogUi();
            if (!quiet) setPanelStatus("ユーザープリセットを更新しました", "success");
            return state.catalog;
        } catch (error) {
            if (!quiet) setPanelStatus(error.message, "error");
            throw error;
        }
    }

    function notifyCatalogChanged(revision) {
        try {
            state.broadcast ||= new BroadcastChannel(USER_ASSET_CHANNEL);
            state.broadcast.postMessage({ type: "catalog_changed", revision: Number(revision) || Date.now() });
        } catch {
            try {
                localStorage.setItem("speech-bubble/user-assets/revision", String(revision || Date.now()));
            } catch {
                // Editor will refresh on its next launch.
            }
        }
    }

    function closeAddDialog() {
        const dialog = document.getElementById("speech-bubble-user-preset-dialog");
        dialog._pendingImageRequest = null;
        if (dialog?.open) dialog.close();
        releasePendingPreviewImage(state.pending);
        clearStylePreviewImage(dialog);
        state.pending = null;
        state.replacePresetId = "";
    }

    function releasePendingPreviewImage(pending) {
        try {
            pending?.releasePreviewImage?.();
        } catch {
            // The decoded preview is already released.
        }
    }

    function registrationReady() {
        const dialog = document.getElementById("speech-bubble-user-preset-dialog");
        if (!dialog || !state.pending) return false;
        const name = normalizedName(dialog.querySelector("[data-user-dialog-name]")?.value);
        const opaqueConfirmed = state.pending.hasAlpha || dialog.querySelector("[data-user-dialog-opaque]")?.checked;
        return Boolean(name && opaqueConfirmed);
    }

    function updateRegistrationState() {
        const dialog = document.getElementById("speech-bubble-user-preset-dialog");
        if (!dialog) return;
        const save = dialog.querySelector("[data-user-dialog-save]");
        if (save) save.disabled = !registrationReady();
    }

    function pendingOutputDimensions(dialog) {
        const width = Math.max(1, Number(state.pending?.width) || 360);
        const height = Math.max(1, Number(state.pending?.height) || 360);
        if (!state.pending?.oversize || !dialog?.querySelector("[data-user-dialog-resize]")?.checked) return { width, height };
        const ratio = RESIZE_SIDE / Math.max(width, height);
        return {
            width: Math.max(1, Math.round(width * ratio)),
            height: Math.max(1, Math.round(height * ratio)),
        };
    }

    function updateAddStyleForResize() {
        const dialog = document.getElementById("speech-bubble-user-preset-dialog");
        const root = styleEditorRoot(dialog);
        if (!dialog || !root || !state.pending || state.replacePresetId) return;
        const previousSource = styleSourceDimensions(root);
        const current = styleDefaultsFromDialog(dialog);
        const percent = ((current.width / previousSource.width) + (current.height / previousSource.height)) * 50;
        const nextSource = pendingOutputDimensions(dialog);
        current.width = Math.max(1, Math.round(nextSource.width * percent / 100));
        current.height = Math.max(1, Math.round(nextSource.height * percent / 100));
        applyStyleDefaults(dialog, current, nextSource.width, nextSource.height);
    }

    async function setPendingFile(file, { keepName = false } = {}) {
        const dialog = document.getElementById("speech-bubble-user-preset-dialog");
        const status = dialog.querySelector("[data-user-dialog-status]");
        const request = {};
        dialog._pendingImageRequest = request;
        status.textContent = "画像を確認しています…";
        status.dataset.level = "info";
        try {
            const pending = await analyzeImageFile(file);
            if (dialog._pendingImageRequest !== request) {
                releasePendingPreviewImage(pending);
                return;
            }
            releasePendingPreviewImage(state.pending);
            state.pending = pending;
            setDecodedStylePreviewImage(dialog, pending.previewImage, pending.width, pending.height);
            if (!keepName) dialog.querySelector("[data-user-dialog-name]").value = filenameStem(file.name);
            dialog.querySelector("[data-user-dialog-metadata]").innerHTML = `
              <span><strong>サイズ</strong>${state.pending.width} × ${state.pending.height}px</span>
              <span><strong>形式</strong>${state.pending.format}</span>
              <span><strong>容量</strong>${formatBytes(file.size)}</span>
              <span><strong>透明背景</strong>${state.pending.hasAlpha ? "あり" : "なし"}</span>`;
            dialog.querySelector("[data-user-dialog-resize-row]").hidden = !state.pending.oversize;
            dialog.querySelector("[data-user-dialog-resize]").checked = false;
            dialog.querySelector("[data-user-dialog-opaque-row]").hidden = state.pending.hasAlpha;
            dialog.querySelector("[data-user-dialog-opaque]").checked = false;
            dialog.querySelector("[data-user-dialog-conflict]").hidden = true;
            const existing = state.catalog.presets.find((preset) => preset.id === state.replacePresetId);
            const output = pendingOutputDimensions(dialog);
            applyStyleDefaults(dialog, existing?.style_defaults, output.width, output.height);
            const notices = [];
            if (state.pending.oversize) notices.push(`元サイズで登録できます。必要なら長辺${RESIZE_SIDE}pxへ縮小してください。`);
            if (!state.pending.hasAlpha) notices.push("透明背景がありません。確認後に登録できます。");
            status.textContent = notices.join(" ") || `推奨サイズ${RECOMMENDED_SIDE}px / 登録可能です。`;
            status.dataset.level = state.pending.oversize || !state.pending.hasAlpha ? "warn" : "success";
        } catch (error) {
            if (dialog._pendingImageRequest !== request) return;
            releasePendingPreviewImage(state.pending);
            state.pending = null;
            clearStylePreviewImage(dialog);
            status.textContent = error.message;
            status.dataset.level = "error";
            dialog.querySelector("[data-user-style-preview-wrap]").hidden = true;
            dialog.querySelector("[data-user-dialog-metadata]").replaceChildren();
            dialog.querySelector("[data-user-dialog-resize-row]").hidden = true;
            dialog.querySelector("[data-user-dialog-opaque-row]").hidden = true;
            dialog.querySelector("[data-user-dialog-conflict]").hidden = true;
        }
        updateRegistrationState();
    }

    async function openAddDialog(file = null, category = state.category, options = {}) {
        ensureDialogs();
        const dialog = document.getElementById("speech-bubble-user-preset-dialog");
        dialog._pendingImageRequest = null;
        releasePendingPreviewImage(state.pending);
        clearStylePreviewImage(dialog);
        state.replacePresetId = String(options.replacePresetId || "");
        state.pending = null;
        dialog.querySelector("[data-user-dialog-title]").textContent = state.replacePresetId ? "プリセット画像を差し替え" : "ユーザープリセットを追加";
        dialog.querySelector("[data-user-dialog-category]").value = category === "stamp" ? "stamp" : "sfx";
        dialog.querySelector("[data-user-dialog-category]").disabled = Boolean(state.replacePresetId);
        const existing = state.catalog.presets.find((preset) => preset.id === state.replacePresetId);
        dialog.querySelector("[data-user-dialog-name]").value = existing?.name || "";
        dialog.querySelector("[data-user-dialog-name]").disabled = Boolean(state.replacePresetId);
        dialog.querySelector("[data-user-dialog-save]").textContent = state.replacePresetId ? "差し替える" : "登録する";
        dialog.querySelector("[data-user-style-preview-wrap]").hidden = true;
        dialog.querySelector("[data-user-dialog-style-section]").hidden = Boolean(state.replacePresetId);
        dialog.querySelector("[data-user-dialog-metadata]").replaceChildren();
        dialog.querySelector("[data-user-dialog-resize-row]").hidden = true;
        dialog.querySelector("[data-user-dialog-opaque-row]").hidden = true;
        dialog.querySelector("[data-user-dialog-conflict]").hidden = true;
        dialog.querySelector("[data-user-dialog-status]").textContent = "PNGまたは静止WebPを選択してください。";
        dialog.querySelector("[data-user-dialog-status]").dataset.level = "info";
        applyStyleDefaults(dialog, existing?.style_defaults);
        updateRegistrationState();
        if (!dialog.open) dialog.showModal();
        if (file) await setPendingFile(file, { keepName: Boolean(state.replacePresetId) });
    }

    async function pendingImageDataUrl(pending = state.pending) {
        if (!pending?.file) return "";
        if (!pending.dataUrl) {
            pending.dataUrl = canonicalImageDataUrl(pending.file, await readFileDataUrl(pending.file));
        }
        return pending.dataUrl;
    }

    function registrationPayload(conflict = "error", imageDataUrl = "") {
        const dialog = document.getElementById("speech-bubble-user-preset-dialog");
        return {
            category: dialog.querySelector("[data-user-dialog-category]").value,
            name: normalizedName(dialog.querySelector("[data-user-dialog-name]").value),
            image_data_url: imageDataUrl,
            original_name: state.pending?.file?.name || "",
            resize_oversize: Boolean(dialog.querySelector("[data-user-dialog-resize]").checked),
            allow_opaque: Boolean(dialog.querySelector("[data-user-dialog-opaque]").checked),
            style_defaults: styleDefaultsFromDialog(dialog),
            conflict,
        };
    }

    async function submitRegistration(conflict = "error") {
        if (!registrationReady()) return;
        const dialog = document.getElementById("speech-bubble-user-preset-dialog");
        const save = dialog.querySelector("[data-user-dialog-save]");
        const status = dialog.querySelector("[data-user-dialog-status]");
        save.disabled = true;
        status.textContent = state.replacePresetId ? "画像を差し替えています…" : "登録しています…";
        status.dataset.level = "info";
        try {
            const requestSpec = registrationRequestSpec(state.replacePresetId);
            const payload = registrationPayload(conflict, await pendingImageDataUrl());
            const result = await apiRequest(requestSpec.path, {
                method: requestSpec.method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            closeAddDialog();
            await loadCatalog({ quiet: true });
            notifyCatalogChanged(result.revision);
            setPanelStatus(requestSpec.replacingImage || conflict === "replace" ? "プリセットを更新しました" : "プリセットを登録しました", "success");
        } catch (error) {
            if (error.code === "duplicate_name") {
                try {
                    await loadCatalog({ quiet: true });
                } catch {
                    // Continue with the duplicate details returned by the API.
                }
                const conflictBox = dialog.querySelector("[data-user-dialog-conflict]");
                conflictBox.hidden = false;
                conflictBox.dataset.suggestedName = error.detail?.suggested_name || "";
                conflictBox.dataset.existingId = error.detail?.existing_id || "";
                const existing = state.catalog.presets.find((preset) => preset.id === conflictBox.dataset.existingId);
                const category = existing?.category === "stamp" ? "Comic Stamps / Symbols" : "Onomatopoeia / SFX";
                dialog.querySelector("[data-user-dialog-conflict-message]").textContent = existing
                    ? `既存: ${category}「${existing.name}」 / 別名候補: ${error.detail?.suggested_name || "別名"}`
                    : `別名候補: ${error.detail?.suggested_name || "別名"}`;
                dialog.querySelector("[data-user-dialog-conflict-edit]").disabled = !existing;
                status.textContent = "既存を編集・置換するか、別名で保存してください。";
                status.dataset.level = "warn";
            } else if (error.code === "opaque_confirmation_required") {
                state.pending.hasAlpha = false;
                dialog.querySelector("[data-user-dialog-opaque-row]").hidden = false;
                status.textContent = "透明背景なしで登録する場合は確認してください。";
                status.dataset.level = "warn";
            } else {
                status.textContent = error.message;
                status.dataset.level = "error";
            }
        } finally {
            updateRegistrationState();
        }
    }

    function prepareAlternateRegistrationName(dialog) {
        const conflictBox = dialog.querySelector("[data-user-dialog-conflict]");
        const input = dialog.querySelector("[data-user-dialog-name]");
        const suggested = normalizedName(conflictBox?.dataset.suggestedName);
        if (suggested) input.value = suggested;
        conflictBox.hidden = true;
        const status = dialog.querySelector("[data-user-dialog-status]");
        status.textContent = "別名を確認・変更してから「登録する」を押してください。";
        status.dataset.level = "info";
        updateRegistrationState();
        input.focus();
        input.select();
    }

    function confirmConflictReplacement(dialog) {
        const conflictBox = dialog.querySelector("[data-user-dialog-conflict]");
        const existing = state.catalog.presets.find((preset) => preset.id === conflictBox?.dataset.existingId);
        const name = existing?.name || normalizedName(dialog.querySelector("[data-user-dialog-name]")?.value) || "既存プリセット";
        return confirm(`注意: 既存プリセット「${name}」を上書きします。\n元の画像と初期スタイルへ戻せません。配置済みレイヤーは変更されません。\n続行しますか？`);
    }

    function managerPresets() {
        const dialog = document.getElementById("speech-bubble-user-manager-dialog");
        const query = String(dialog?.querySelector("[data-user-manager-search]")?.value || "").trim().normalize("NFKC").toLocaleLowerCase("ja");
        return state.catalog.presets.filter((preset) => preset.category === state.managerCategory && (!query || preset.name.normalize("NFKC").toLocaleLowerCase("ja").includes(query)));
    }

    function closeOpenPresetMenus(except = null) {
        document.querySelectorAll(".speech-bubble-user-card-menu.open").forEach((menu) => {
            if (menu === except) return;
            menu.classList.remove("open");
            menu.closest(".speech-bubble-user-card")?.querySelector(".speech-bubble-user-card-more")?.setAttribute("aria-expanded", "false");
        });
    }

    function presetCard(preset) {
        const card = document.createElement("article");
        card.className = "speech-bubble-user-card";
        card.dataset.presetId = preset.id;
        const thumbnail = document.createElement("img");
        thumbnail.alt = "";
        applyStyledPresetThumbnail(thumbnail, preset);
        const info = document.createElement("div");
        info.className = "speech-bubble-user-card-info";
        const name = document.createElement("strong");
        name.textContent = preset.name;
        const metadata = document.createElement("small");
        metadata.textContent = `${preset.width}×${preset.height} / ${String(preset.format).toUpperCase()} / ${formatBytes(preset.file_size)}`;
        info.append(name, metadata);
        const more = document.createElement("button");
        more.type = "button";
        more.className = "speech-bubble-user-card-more";
        more.textContent = "…";
        more.title = "操作メニュー";
        more.setAttribute("aria-expanded", "false");
        const menu = document.createElement("div");
        menu.className = "speech-bubble-user-card-menu";
        for (const [action, label] of [["edit", "編集"], ["replace", "画像を差し替え"], ["delete", "削除"]]) {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.userCardAction = action;
            button.textContent = label;
            if (action === "delete") button.className = "danger";
            button.addEventListener("click", () => handlePresetAction(action, preset));
            menu.append(button);
        }
        more.addEventListener("click", (event) => {
            event.stopPropagation();
            const opening = !menu.classList.contains("open");
            closeOpenPresetMenus(menu);
            menu.classList.toggle("open", opening);
            more.setAttribute("aria-expanded", String(opening));
        });
        card.append(thumbnail, info, more, menu);
        return card;
    }

    function renderManager() {
        const dialog = document.getElementById("speech-bubble-user-manager-dialog");
        if (!dialog) return;
        dialog.querySelectorAll("[data-user-manager-category]").forEach((button) => {
            const active = button.dataset.userManagerCategory === state.managerCategory;
            button.setAttribute("aria-pressed", String(active));
            const count = Number(state.catalog.counts?.[button.dataset.userManagerCategory] || 0);
            button.textContent = button.dataset.userManagerCategory === "sfx" ? `Onomatopoeia / SFX (${count})` : `Comic Stamps / Symbols (${count})`;
        });
        dialog.querySelectorAll("[data-user-manager-view]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.userManagerView === state.managerView)));
        const archive = state.catalog.archive || {};
        const oldGenerationCount = Number(archive.old_generation_assets || 0);
        const pendingCount = Number(archive.pending_assets || 0);
        dialog.querySelector("[data-user-manager-archive-count]").textContent = `旧世代素材 ${oldGenerationCount}件`;
        const organize = dialog.querySelector("[data-user-manager-archive]");
        organize.disabled = pendingCount < 1;
        organize.textContent = pendingCount > 0 ? `整理（${pendingCount}件）` : "整理済み";
        const grid = dialog.querySelector("[data-user-manager-grid]");
        grid.classList.toggle("list", state.managerView === "list");
        const presets = managerPresets();
        grid.replaceChildren(...presets.map(presetCard));
        if (!presets.length) {
            const empty = document.createElement("div");
            empty.className = "speech-bubble-user-manager-empty";
            empty.textContent = "該当するユーザープリセットはありません。";
            grid.append(empty);
        }
    }

    function openManager() {
        ensureDialogs();
        const dialog = document.getElementById("speech-bubble-user-manager-dialog");
        state.managerCategory = state.category;
        dialog.querySelector("[data-user-manager-search]").value = "";
        renderManager();
        if (!dialog.open) dialog.showModal();
    }

    async function organizeUserAssetArchive() {
        const dialog = document.getElementById("speech-bubble-user-manager-dialog");
        const pendingCount = Number(state.catalog.archive?.pending_assets || 0);
        if (pendingCount < 1) return;
        if (!confirm(`旧世代素材${pendingCount}件をarchiveへ移動します。\n過去レイアウトからは引き続き読み込めます。続行しますか？`)) return;
        const button = dialog.querySelector("[data-user-manager-archive]");
        const status = dialog.querySelector("[data-user-manager-status]");
        button.disabled = true;
        status.textContent = "旧世代素材を整理しています…";
        status.dataset.level = "info";
        try {
            const result = await apiRequest(`${USER_ASSET_ENDPOINT}/archive/organize`, { method: "POST" });
            await loadCatalog({ quiet: true });
            notifyCatalogChanged(result.revision);
            status.textContent = `整理しました（素材${result.moved_assets || 0}件、サムネイル${result.moved_thumbnails || 0}件）。過去レイアウトは維持されます。`;
            status.dataset.level = "success";
        } catch (error) {
            status.textContent = error.message;
            status.dataset.level = "error";
        } finally {
            renderManager();
        }
    }

    async function handlePresetAction(action, preset) {
        closeOpenPresetMenus();
        if (action === "edit") {
            const dialog = document.getElementById("speech-bubble-user-edit-dialog");
            clearStylePreviewImage(dialog);
            state.editPresetId = preset.id;
            dialog.querySelector("[data-user-edit-name]").value = preset.name;
            dialog.querySelector("[data-user-edit-category]").value = preset.category;
            dialog.querySelector("[data-user-edit-metadata]").innerHTML = `
              <span><strong>サイズ</strong>${preset.width} × ${preset.height}px</span>
              <span><strong>形式</strong>${String(preset.format).toUpperCase()}</span>
              <span><strong>容量</strong>${formatBytes(preset.file_size)}</span>
              <span><strong>透明背景</strong>${preset.has_alpha ? "あり" : "なし"}</span>`;
            applyStyleDefaults(dialog, preset.style_defaults, preset.width, preset.height);
            setStylePreviewImage(dialog, preset.asset_url);
            dialog.querySelector("[data-user-edit-status]").textContent = "";
            if (!dialog.open) dialog.showModal();
            return;
        }
        if (action === "replace") {
            const input = document.querySelector("[data-user-dialog-file]");
            input.value = "";
            input.dataset.replacePresetId = preset.id;
            input.click();
            return;
        }
        if (action === "delete") {
            if (!confirm(`「${preset.name}」を削除しますか？\n配置済みレイヤー用の画像ファイルは保持されます。`)) return;
            const status = document.querySelector("[data-user-manager-status]");
            status.textContent = "削除しています…";
            try {
                const result = await apiRequest(`${USER_ASSET_ENDPOINT}/${encodeURIComponent(preset.id)}`, { method: "DELETE" });
                await loadCatalog({ quiet: true });
                notifyCatalogChanged(result.revision);
                status.textContent = "削除しました。配置済みレイヤーは維持されます。";
                status.dataset.level = "success";
            } catch (error) {
                status.textContent = error.message;
                status.dataset.level = "error";
            }
        }
    }

    function editedPresetPayload(dialog) {
        return {
            name: normalizedName(dialog.querySelector("[data-user-edit-name]").value),
            category: dialog.querySelector("[data-user-edit-category]").value,
            style_defaults: styleDefaultsFromDialog(dialog),
        };
    }

    async function savePresetEdit() {
        const dialog = document.getElementById("speech-bubble-user-edit-dialog");
        const status = dialog.querySelector("[data-user-edit-status]");
        const payload = editedPresetPayload(dialog);
        if (!payload.name) {
            status.textContent = "名前を入力してください。";
            status.dataset.level = "error";
            return;
        }
        const existing = state.catalog.presets.find((preset) => preset.id === state.editPresetId);
        if (!confirm(`注意: 既存プリセット「${existing?.name || payload.name}」を上書きします。\n元の名前と初期スタイルへ戻せません。配置済みレイヤーは変更されません。\n続行しますか？`)) return;
        try {
            const result = await apiRequest(`${USER_ASSET_ENDPOINT}/${encodeURIComponent(state.editPresetId)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            dialog.close();
            await loadCatalog({ quiet: true });
            notifyCatalogChanged(result.revision);
        } catch (error) {
            if (error.code === "duplicate_name") {
                status.textContent = `同じ名前があります。候補: ${error.detail?.suggested_name || "別名"}`;
            } else {
                status.textContent = error.message;
            }
            status.dataset.level = "error";
        }
    }

    async function savePresetAs() {
        const dialog = document.getElementById("speech-bubble-user-edit-dialog");
        const status = dialog.querySelector("[data-user-edit-status]");
        const existing = state.catalog.presets.find((preset) => preset.id === state.editPresetId);
        const payload = editedPresetPayload(dialog);
        if (!existing || !payload.name) {
            status.textContent = existing ? "別名を入力してください。" : "元のプリセットが見つかりません。";
            status.dataset.level = "error";
            dialog.querySelector("[data-user-edit-name]")?.focus();
            return;
        }
        if (payload.name.localeCompare(existing.name, "ja", { sensitivity: "base" }) === 0) {
            const input = dialog.querySelector("[data-user-edit-name]");
            input.value = `${existing.name} (2)`;
            input.focus();
            input.select();
            status.textContent = "別名を確認・変更して、もう一度「別名で保存」を押してください。";
            status.dataset.level = "info";
            return;
        }
        status.textContent = "別名で保存しています…";
        status.dataset.level = "info";
        try {
            const response = await fetch(existing.asset_url, { cache: "no-store", credentials: "same-origin" });
            if (!response.ok) throw new Error(`元画像を取得できませんでした (${response.status})`);
            const result = await apiRequest(USER_ASSET_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...payload,
                    image_data_url: await readFileDataUrl(await response.blob()),
                    original_name: existing.original_name || "",
                    resize_oversize: false,
                    allow_opaque: true,
                    conflict: "error",
                }),
            });
            dialog.close();
            await loadCatalog({ quiet: true });
            notifyCatalogChanged(result.revision);
            setPanelStatus(`「${payload.name}」を別名で保存しました`, "success");
        } catch (error) {
            if (error.code === "duplicate_name") {
                status.textContent = `同じ名前があります。名前欄で別名を指定してください。候補: ${error.detail?.suggested_name || "別名"}`;
            } else {
                status.textContent = error.message;
            }
            status.dataset.level = "error";
        }
    }

    function statusGlyph(status) {
        return status === "pass" ? "✓" : status === "warn" ? "⚠" : status === "skip" ? "−" : "✕";
    }

    function diagnosticReportText(report) {
        const lines = [
            `Speech Bubble Forge Self Diagnostics`,
            `Overall: ${report.overall || "unknown"}`,
            `Extension: ${report.extension_version || "unknown"}`,
            `Settings UI: ${report.settings_ui_version || SETTINGS_UI_VERSION}`,
            "",
        ];
        for (const check of report.checks || []) {
            lines.push(`${statusGlyph(check.status)} [${check.status}] ${check.label}: ${check.message}`);
        }
        lines.push("", `Generated: ${new Date(report.generated_at || Date.now()).toISOString()}`);
        return lines.join("\n");
    }

    function renderDiagnostic(report) {
        const dialog = document.getElementById("speech-bubble-diagnostic-dialog");
        const overall = dialog.querySelector("[data-diagnostic-overall]");
        overall.dataset.status = report.overall || "warn";
        overall.textContent = report.overall === "pass" ? "すべての必須診断に合格しました" : report.overall === "fail" ? "修正が必要な項目があります" : "警告またはスキップ項目があります";
        const results = dialog.querySelector("[data-diagnostic-results]");
        results.replaceChildren(...(report.checks || []).map((check) => {
            const row = document.createElement("div");
            row.className = "speech-bubble-diagnostic-row";
            row.dataset.status = check.status;
            const icon = document.createElement("span");
            icon.textContent = statusGlyph(check.status);
            const text = document.createElement("div");
            const title = document.createElement("strong");
            title.textContent = check.label;
            const message = document.createElement("small");
            message.textContent = check.message;
            text.append(title, message);
            row.append(icon, text);
            return row;
        }));
        if (!dialog.open) dialog.showModal();
    }

    function editorHandshake() {
        if (!("BroadcastChannel" in globalThis)) {
            return Promise.resolve({ id: "editor_handshake", label: "Editor handshake", status: "skip", message: "BroadcastChannel非対応のためスキップ" });
        }
        return new Promise((resolve) => {
            const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const channel = new BroadcastChannel(USER_ASSET_CHANNEL);
            const timer = setTimeout(() => {
                channel.close();
                resolve({ id: "editor_handshake", label: "Editor handshake", status: "skip", message: "Editor未起動のためスキップ" });
            }, 700);
            channel.addEventListener("message", (event) => {
                if (event.data?.type !== "diagnostic_pong" || event.data?.nonce !== nonce) return;
                clearTimeout(timer);
                channel.close();
                resolve({ id: "editor_handshake", label: "Editor handshake", status: "pass", message: `Editor応答あり (${event.data.mode || "unknown"})` });
            });
            channel.postMessage({ type: "diagnostic_ping", nonce });
        });
    }

    async function runDiagnostics() {
        ensureDialogs();
        const button = state.panel?.querySelector("[data-speech-bubble-diagnostic-run]");
        if (button) button.disabled = true;
        try {
            const [backend, handshake] = await Promise.all([
                apiRequest(DIAGNOSTIC_ENDPOINT, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ frontend_version: SETTINGS_UI_VERSION }),
                }),
                editorHandshake(),
            ]);
            backend.checks = [
                { id: "frontend_loaded", label: "Frontend JavaScript", status: "pass", message: `Settings UI ${SETTINGS_UI_VERSION}` },
                { id: "listener_singleton", label: "Settings event listeners", status: "pass", message: "Singleton binding active" },
                handshake,
                ...(backend.checks || []),
            ];
            const rank = { pass: 0, skip: 0, warn: 1, fail: 2 };
            const highest = Math.max(...backend.checks.map((check) => rank[check.status] ?? 2), 0);
            backend.overall = highest === 2 ? "fail" : highest === 1 ? "warn" : "pass";
            backend.generated_at = new Date().toISOString();
            state.lastDiagnostic = backend;
            try {
                localStorage.setItem(LAST_DIAGNOSTIC_KEY, JSON.stringify(backend));
            } catch {
                // The current report remains available in memory.
            }
            updateLastDiagnosticUi();
            renderDiagnostic(backend);
        } catch (error) {
            const report = {
                overall: "fail",
                extension_version: "unknown",
                settings_ui_version: SETTINGS_UI_VERSION,
                generated_at: new Date().toISOString(),
                checks: [{ id: "diagnostic_api", label: "Diagnostics API", status: "fail", message: error.message }],
            };
            state.lastDiagnostic = report;
            updateLastDiagnosticUi();
            renderDiagnostic(report);
        } finally {
            if (button) button.disabled = false;
        }
    }

    function loadLastDiagnostic() {
        try {
            const report = JSON.parse(localStorage.getItem(LAST_DIAGNOSTIC_KEY) || "null");
            if (report && typeof report === "object") state.lastDiagnostic = report;
        } catch {
            state.lastDiagnostic = null;
        }
    }

    function updateLastDiagnosticUi() {
        const label = state.panel?.querySelector("[data-speech-bubble-diagnostic-last]");
        const show = state.panel?.querySelector("[data-speech-bubble-diagnostic-show]");
        if (!state.lastDiagnostic) {
            if (label) label.textContent = "前回: 未実行";
            if (show) show.disabled = true;
            return;
        }
        const time = new Date(state.lastDiagnostic.generated_at || Date.now());
        if (label) label.textContent = `前回: ${time.toLocaleString()} / ${state.lastDiagnostic.overall || "unknown"}`;
        if (show) show.disabled = false;
    }

    function bindDropTarget(target, onFile) {
        if (!target || target.dataset.speechBubbleDropReady === "1") return;
        target.dataset.speechBubbleDropReady = "1";
        const activate = (active) => target.classList.toggle("drag-active", active);
        target.addEventListener("dragenter", (event) => { event.preventDefault(); activate(true); });
        target.addEventListener("dragover", (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; activate(true); });
        target.addEventListener("dragleave", (event) => { if (!target.contains(event.relatedTarget)) activate(false); });
        target.addEventListener("drop", (event) => {
            event.preventDefault();
            activate(false);
            const file = [...(event.dataTransfer?.files || [])].find(acceptedImageFile);
            if (file) onFile(file);
            else setPanelStatus("PNGまたはWebPをドロップしてください", "error");
        });
        target.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                target.querySelector("button")?.click();
            }
        });
    }

    function bindDialogs() {
        ensureDialogs();
        const add = document.getElementById("speech-bubble-user-preset-dialog");
        if (add.dataset.bound !== "1") {
            add.dataset.bound = "1";
            const fileInput = add.querySelector("[data-user-dialog-file]");
            const dialogDrop = add.querySelector("[data-user-dialog-drop]");
            bindDropTarget(dialogDrop, (file) => setPendingFile(file, { keepName: Boolean(state.replacePresetId) }));
            dialogDrop.addEventListener("click", (event) => {
                if (event.target.closest("button")) return;
                fileInput.value = "";
                fileInput.click();
            });
            add.querySelector("[data-user-dialog-choose]").addEventListener("click", () => { fileInput.value = ""; fileInput.click(); });
            fileInput.addEventListener("change", () => {
                const file = fileInput.files?.[0];
                const replacementId = fileInput.dataset.replacePresetId || "";
                delete fileInput.dataset.replacePresetId;
                if (file && replacementId) {
                    const preset = state.catalog.presets.find((item) => item.id === replacementId);
                    openAddDialog(file, preset?.category || "sfx", { replacePresetId: replacementId });
                } else if (file) {
                    setPendingFile(file, { keepName: Boolean(state.replacePresetId) });
                }
            });
            add.querySelector("[data-user-dialog-name]").addEventListener("input", () => {
                add.querySelector("[data-user-dialog-conflict]").hidden = true;
                updateRegistrationState();
            });
            add.querySelector("[data-user-dialog-resize]").addEventListener("change", () => {
                updateAddStyleForResize();
                updateRegistrationState();
            });
            add.querySelector("[data-user-dialog-opaque]").addEventListener("change", updateRegistrationState);
            add.querySelector("[data-user-dialog-save]").addEventListener("click", () => submitRegistration("error"));
            add.querySelector("[data-user-dialog-conflict-replace]").addEventListener("click", () => {
                if (confirmConflictReplacement(add)) submitRegistration("replace");
            });
            add.querySelector("[data-user-dialog-conflict-edit]").addEventListener("click", () => {
                const existingId = add.querySelector("[data-user-dialog-conflict]")?.dataset.existingId;
                const existing = state.catalog.presets.find((preset) => preset.id === existingId);
                if (!existing) return;
                closeAddDialog();
                handlePresetAction("edit", existing);
            });
            add.querySelector("[data-user-dialog-conflict-rename]").addEventListener("click", () => prepareAlternateRegistrationName(add));
            add.querySelector("[data-user-dialog-conflict-cancel]").addEventListener("click", () => { add.querySelector("[data-user-dialog-conflict]").hidden = true; });
            add.querySelectorAll("[data-user-dialog-close], [data-user-dialog-cancel]").forEach((button) => button.addEventListener("click", closeAddDialog));
            add.addEventListener("cancel", () => {
                add._pendingImageRequest = null;
                releasePendingPreviewImage(state.pending);
                clearStylePreviewImage(add);
                state.pending = null;
                state.replacePresetId = "";
            });
        }

        const manager = document.getElementById("speech-bubble-user-manager-dialog");
        if (manager.dataset.bound !== "1") {
            manager.dataset.bound = "1";
            manager.querySelectorAll("[data-user-manager-close]").forEach((button) => button.addEventListener("click", () => manager.close()));
            manager.querySelectorAll("[data-user-manager-category]").forEach((button) => button.addEventListener("click", () => { state.managerCategory = button.dataset.userManagerCategory; renderManager(); }));
            manager.querySelectorAll("[data-user-manager-view]").forEach((button) => button.addEventListener("click", () => { state.managerView = button.dataset.userManagerView; renderManager(); }));
            manager.querySelector("[data-user-manager-search]").addEventListener("input", renderManager);
            manager.querySelector("[data-user-manager-archive]").addEventListener("click", organizeUserAssetArchive);
            manager.querySelector("[data-user-manager-add]").addEventListener("click", () => openAddDialog(null, state.managerCategory));
        }

        const edit = document.getElementById("speech-bubble-user-edit-dialog");
        if (edit.dataset.bound !== "1") {
            edit.dataset.bound = "1";
            edit.querySelectorAll("[data-user-edit-close], [data-user-edit-cancel]").forEach((button) => button.addEventListener("click", () => edit.close()));
            edit.querySelector("[data-user-edit-save]").addEventListener("click", savePresetEdit);
            edit.querySelector("[data-user-edit-save-as]").addEventListener("click", savePresetAs);
            edit.querySelector("[data-user-edit-replace]").addEventListener("click", () => {
                const input = document.querySelector("[data-user-dialog-file]");
                edit.close();
                input.value = "";
                input.dataset.replacePresetId = state.editPresetId;
                input.click();
            });
        }

        const diagnostic = document.getElementById("speech-bubble-diagnostic-dialog");
        if (diagnostic.dataset.bound !== "1") {
            diagnostic.dataset.bound = "1";
            diagnostic.querySelectorAll("[data-diagnostic-close]").forEach((button) => button.addEventListener("click", () => diagnostic.close()));
            diagnostic.querySelector("[data-diagnostic-copy]").addEventListener("click", async () => {
                if (!state.lastDiagnostic) return;
                const text = diagnosticReportText(state.lastDiagnostic);
                try {
                    await navigator.clipboard.writeText(text);
                } catch {
                    const textarea = document.createElement("textarea");
                    textarea.value = text;
                    document.body.append(textarea);
                    textarea.select();
                    document.execCommand("copy");
                    textarea.remove();
                }
            });
        }
    }

    function setupPanel() {
        const panel = appRoot().querySelector("#speech-bubble-forge-settings-panel");
        if (!panel) return;
        panel.closest(".settings-info")?.classList.add("speech-bubble-forge-settings-host");
        state.panel = panel;
        organizeSettingRows(panel);
        bindDialogs();
        if (panel.dataset.speechBubbleSettingsReady === "1") {
            updateSettingSummaries(panel);
            return;
        }
        panel.dataset.speechBubbleSettingsReady = "1";
        panel.dataset.speechBubbleListenerSingleton = "1";

        const savedState = storedGroupState();
        panel.querySelectorAll("[data-speech-bubble-settings-group]").forEach((details) => {
            const group = details.dataset.speechBubbleSettingsGroup;
            if (Object.prototype.hasOwnProperty.call(savedState, group)) details.open = Boolean(savedState[group]);
            details.addEventListener("toggle", () => saveGroupState(panel));
        });

        panel.querySelectorAll("[data-speech-bubble-user-category]").forEach((button) => button.addEventListener("click", () => {
            state.category = button.dataset.speechBubbleUserCategory;
            updateCategoryButtons();
        }));
        const panelFile = panel.querySelector("[data-speech-bubble-user-file]");
        panel.querySelector("[data-speech-bubble-user-choose]").addEventListener("click", (event) => {
            event.stopPropagation();
            panelFile.value = "";
            panelFile.click();
        });
        panelFile.addEventListener("change", () => {
            const file = panelFile.files?.[0];
            if (file) openAddDialog(file, state.category);
        });
        const drop = panel.querySelector("[data-speech-bubble-user-drop]");
        bindDropTarget(drop, (file) => openAddDialog(file, state.category));
        drop.addEventListener("click", (event) => {
            if (event.target.closest("button")) return;
            panelFile.value = "";
            panelFile.click();
        });
        panel.querySelector("[data-speech-bubble-user-manage]").addEventListener("click", openManager);
        panel.querySelector("[data-speech-bubble-diagnostic-run]").addEventListener("click", runDiagnostics);
        panel.querySelector("[data-speech-bubble-diagnostic-show]").addEventListener("click", () => state.lastDiagnostic && renderDiagnostic(state.lastDiagnostic));
        panel.addEventListener("input", () => updateSettingSummaries(panel));
        panel.addEventListener("change", () => updateSettingSummaries(panel));

        updateCategoryButtons();
        loadLastDiagnostic();
        updateLastDiagnosticUi();
        loadCatalog({ quiet: true }).catch((error) => setPanelStatus(error.message, "error"));
    }

    globalThis.SpeechBubbleForgeSettingsCore = Object.freeze({
        MAX_PREVIEW_BACKGROUND_BYTES,
        MAX_PREVIEW_BACKGROUND_HISTORY,
        MAX_PREVIEW_BACKGROUND_PIXELS,
        MAX_SOURCE_PIXELS,
        MAX_UPLOAD_BYTES,
        NAME_MAX_LENGTH,
        RECOMMENDED_SIDE,
        RESIZE_SIDE,
        SETTINGS_UI_VERSION,
        acceptedImageFile,
        acceptedPreviewBackgroundFile,
        canonicalImageDataUrl,
        defaultStyleDefaults,
        filenameStem,
        formatBytes,
        normalizedName,
        normalizedStyleDefaults,
        previewFitScale,
        previewStampRect,
        registrationRequestSpec,
        styleShadowDirection,
    });

    if (typeof document === "undefined") return;
    window.addEventListener("beforeunload", () => {
        for (const entry of previewBackgroundHistory) URL.revokeObjectURL(entry.url);
    }, { once: true });
    document.addEventListener("pointerdown", (event) => {
        if (!event.target.closest(".speech-bubble-user-card-more, .speech-bubble-user-card-menu")) closeOpenPresetMenus();
    });
    if (typeof onUiLoaded === "function") onUiLoaded(setupPanel);
    else document.addEventListener("DOMContentLoaded", setupPanel);
    if (typeof onAfterUiUpdate === "function") onAfterUiUpdate(setupPanel);
})();
