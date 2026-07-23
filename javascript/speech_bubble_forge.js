(() => {
    "use strict";

    const EDITOR_WINDOW_NAME = "speech_bubble_forge_editor";
    const DEFAULT_SETTINGS = Object.freeze({
        output_dir: "outputs/speech-bubble-forge",
        window_width: 1440,
        window_height: 900,
        supersample: 2,
        auto_save: true,
        keep_previous_layout: true,
        save_overlay: true,
        asset_cache_version: "0",
    });

    let runtimeSettings = { ...DEFAULT_SETTINGS };
    let editorWindow = null;
    let activeSession = null;
    let currentTheme = null;
    let settingsLoadPromise = null;
    let editorCloseMonitor = null;
    let latestOpenRequestId = null;
    let pendingOpenRequest = null;
    let pingRetryTimers = [];

    const appRoot = () => (typeof gradioApp === "function" ? gradioApp() : document);

    function rootRelative(path) {
        const base = new URL(document.baseURI);
        const basePath = base.pathname.endsWith("/") ? base.pathname : base.pathname.replace(/[^/]*$/, "");
        return new URL(path.replace(/^\//, ""), `${base.origin}${basePath}`).toString();
    }

    function apiPath(path) {
        return rootRelative(path);
    }

    function randomKey() {
        return globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    }

    function toast(message, kind = "info", link = null) {
        const root = appRoot();
        let host = root.querySelector("#speech-bubble-forge-toast-host");
        if (!host) {
            host = document.createElement("div");
            host.id = "speech-bubble-forge-toast-host";
            (root === document ? document.body : root).appendChild(host);
        }
        const item = document.createElement("div");
        item.className = `speech-bubble-forge-toast ${kind}`;
        item.append(document.createTextNode(message));
        if (link) {
            const anchor = document.createElement("a");
            anchor.href = link;
            anchor.target = "_blank";
            anchor.rel = "noopener";
            anchor.textContent = "開く";
            item.append(" ", anchor);
        }
        host.appendChild(item);
        setTimeout(() => item.remove(), link ? 12000 : 5000);
    }

    function isVisible(element) {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    }

    function selectedGalleryImageInfo(tabName) {
        const root = appRoot();
        const gallery = root.querySelector(`#${tabName}_gallery`);
        if (!gallery) return null;

        let selectedButton = null;
        if (typeof selected_gallery_button === "function") {
            try {
                const candidate = selected_gallery_button();
                if (candidate && gallery.contains(candidate)) selectedButton = candidate;
            } catch {
                // Fall through to DOM queries.
            }
        }
        selectedButton ||= gallery.querySelector(".thumbnail-item.thumbnail-small.selected");
        selectedButton ||= gallery.querySelector('[aria-selected="true"]');

        let image = selectedButton?.querySelector("img") || null;
        if (!image) {
            const visible = Array.from(gallery.querySelectorAll("img")).filter(isVisible);
            visible.sort((a, b) => {
                const area = (item) => (item.naturalWidth || item.width || 0) * (item.naturalHeight || item.height || 0);
                return area(b) - area(a);
            });
            image = visible[0] || null;
        }
        const url = image?.currentSrc || image?.src || null;
        if (!url) return null;
        const cleanUrl = url.split("?")[0];
        const filename = decodeURIComponent(cleanUrl.split("/").pop() || `${tabName}_speech_bubble`).replace(/\.[^.]+$/, "");
        return {
            url,
            name: filename || `${tabName}_speech_bubble`,
            width: image.naturalWidth || image.width || 0,
            height: image.naturalHeight || image.height || 0,
        };
    }

    function currentTabName() {
        const root = appRoot();
        const txt = root.querySelector("#tab_txt2img");
        if (txt && isVisible(txt)) return "txt2img";
        const img = root.querySelector("#tab_img2img");
        if (img && isVisible(img)) return "img2img";
        return "txt2img";
    }

    function normalizeSettings(payload) {
        return {
            output_dir: String(payload?.output_dir || DEFAULT_SETTINGS.output_dir),
            window_width: Math.max(900, Math.min(3840, Number(payload?.window_width) || DEFAULT_SETTINGS.window_width)),
            window_height: Math.max(640, Math.min(2160, Number(payload?.window_height) || DEFAULT_SETTINGS.window_height)),
            supersample: Math.max(1, Math.min(4, Number(payload?.supersample) || DEFAULT_SETTINGS.supersample)),
            auto_save: payload?.auto_save !== false,
            keep_previous_layout: payload?.keep_previous_layout !== false,
            save_overlay: payload?.save_overlay !== false,
            asset_cache_version: String(payload?.asset_cache_version || DEFAULT_SETTINGS.asset_cache_version),
        };
    }

    async function loadRuntimeSettings(force = false) {
        if (settingsLoadPromise && !force) return settingsLoadPromise;
        settingsLoadPromise = (async () => {
            try {
                const response = await fetch(apiPath("speech-bubble-forge/config"), { cache: "no-store" });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                runtimeSettings = normalizeSettings(await response.json());
            } catch (error) {
                console.warn("[Speech Bubble Forge] Could not load settings; using defaults.", error);
                runtimeSettings = { ...DEFAULT_SETTINGS };
            }
            refreshPanelStates();
            return runtimeSettings;
        })();
        try {
            return await settingsLoadPromise;
        } finally {
            settingsLoadPromise = null;
        }
    }

    function parseRgb(value) {
        const match = String(value || "").match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/i);
        return match ? match.slice(1, 4).map(Number) : null;
    }

    function detectForgeTheme() {
        const queryTheme = new URLSearchParams(location.search).get("__theme");
        if (queryTheme === "light" || queryTheme === "dark") return queryTheme;
        const candidates = [
            appRoot().querySelector("#tabs"),
            appRoot().querySelector(".gradio-container"),
            document.body,
            document.documentElement,
        ];
        for (const candidate of candidates) {
            if (!candidate) continue;
            const rgb = parseRgb(getComputedStyle(candidate).backgroundColor);
            if (!rgb) continue;
            const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
            return luminance >= 0.55 ? "light" : "dark";
        }
        return matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark";
    }

    function syncTheme() {
        const next = detectForgeTheme();
        if (next === currentTheme) return;
        currentTheme = next;
        if (editorWindow && !editorWindow.closed) {
            editorWindow.postMessage({ type: "speech_bubble:set_theme", theme: next }, location.origin);
        }
    }

    function popupFeatures() {
        const availableWidth = screen.availWidth || window.innerWidth || runtimeSettings.window_width;
        const availableHeight = screen.availHeight || window.innerHeight || runtimeSettings.window_height;
        const width = Math.min(runtimeSettings.window_width, availableWidth);
        const height = Math.min(runtimeSettings.window_height, availableHeight);
        const left = Math.max(0, (screen.availLeft || 0) + Math.round((availableWidth - width) / 2));
        const top = Math.max(0, (screen.availTop || 0) + Math.round((availableHeight - height) / 2));
        return `popup=yes,resizable=yes,scrollbars=yes,width=${width},height=${height},left=${left},top=${top}`;
    }

    function buildEditorUrl(session) {
        const editor = new URL(apiPath("speech-bubble-forge/static/speech-bubble-editor.html"));
        editor.searchParams.set("host", "forge");
        editor.searchParams.set("jsonKey", session.key);
        editor.searchParams.set("apiBase", apiPath("speech_bubble").replace(/\/$/, ""));
        editor.searchParams.set("forgeApiBase", apiPath("speech-bubble-forge").replace(/\/$/, ""));
        editor.searchParams.set("revisionBase", "0");
        editor.searchParams.set("autoSave", runtimeSettings.auto_save ? "1" : "0");
        editor.searchParams.set("autoSaveDelay", "2200");
        editor.searchParams.set("keepLayout", runtimeSettings.keep_previous_layout ? "1" : "0");
        editor.searchParams.set("theme", currentTheme || detectForgeTheme());
        editor.searchParams.set("assetVersion", runtimeSettings.asset_cache_version);
        editor.searchParams.set("sourceTab", session.tabName || "");
        editor.searchParams.set("sourceName", session.sourceName || "speech_bubble");
        if (session.imageUrl) editor.searchParams.set("imageUrl", session.imageUrl);
        editor.searchParams.set("v", "20260723-04");
        return editor.toString();
    }

    function setPanelStatus(tabName, message, kind = "info", link = null) {
        const root = appRoot();
        const status = root.querySelector(`[data-speech-bubble-status="${tabName}"]`);
        if (!status) return;
        status.dataset.level = kind;
        status.replaceChildren(document.createTextNode(message));
        if (link) {
            const anchor = document.createElement("a");
            anchor.href = link;
            anchor.target = "_blank";
            anchor.rel = "noopener";
            anchor.textContent = "保存画像を開く";
            status.append(" ", anchor);
        }
    }

    function cleanupEditor() {
        clearEditorCloseMonitor();
        clearPingRetries();
        activeSession = null;
        pendingOpenRequest = null;
        latestOpenRequestId = null;
        editorWindow = null;
    }

    function clearEditorCloseMonitor() {
        if (!editorCloseMonitor) return;
        clearInterval(editorCloseMonitor);
        editorCloseMonitor = null;
    }

    function installEditorCloseMonitor() {
        clearEditorCloseMonitor();
        editorCloseMonitor = setInterval(() => {
            if (editorWindow && !editorWindow.closed) return;
            const tabName = activeSession?.tabName || currentTabName();
            cleanupEditor();
            setPanelStatus(tabName, "Editor: Ready", "info");
        }, 500);
    }

    function clearPingRetries() {
        pingRetryTimers.forEach(clearTimeout);
        pingRetryTimers = [];
    }

    function sendEditorPing(candidate, requestId) {
        candidate.postMessage({ type: "speech_bubble:host_ping", requestId }, location.origin);
    }

    function reconnectExistingEditor(candidate, requested, requestId) {
        editorWindow = candidate;
        pendingOpenRequest = { candidate, requested, requestId };
        latestOpenRequestId = requestId;
        clearPingRetries();
        for (const delay of [0, 140, 360]) {
            pingRetryTimers.push(setTimeout(() => {
                if (requestId !== latestOpenRequestId || !editorWindow || editorWindow.closed) return;
                sendEditorPing(candidate, requestId);
            }, delay));
        }
        candidate.focus();
        installEditorCloseMonitor();
        setPanelStatus(requested.tabName, "既存Editorへ再接続しています…", "info");
    }

    function sendSourceToExisting(session, requestId) {
        if (!editorWindow || editorWindow.closed || !session.imageUrl) return;
        editorWindow.postMessage(
            {
                type: "speech_bubble:load_source",
                requestId,
                key: activeSession?.key,
                image_url: session.imageUrl,
                source_name: session.sourceName,
                source_tab: session.tabName,
            },
            location.origin,
        );
    }

    function openEditor(options = {}) {
        const tabName = options.tabName || currentTabName();
        const requestId = randomKey();
        const requested = {
            key: activeSession?.key || `speech_bubble:forge:session:${randomKey()}`,
            imageUrl: options.imageUrl || "",
            sourceName: options.sourceName || "speech_bubble",
            tabName,
        };

        const candidate = window.open("", EDITOR_WINDOW_NAME, popupFeatures());
        if (!candidate) {
            cleanupEditor();
            setPanelStatus(tabName, "ポップアップがブロックされました。", "error");
            toast("ポップアップを許可してください。", "error");
            return;
        }

        let candidateUrl;
        try {
            candidateUrl = new URL(candidate.location.href || "about:blank", location.href);
        } catch {
            setPanelStatus(tabName, "既存ウィンドウの内容を確認できません。Editorは上書きしませんでした。", "error");
            candidate.focus();
            return;
        }

        if (candidateUrl.href === "about:blank") {
            editorWindow = candidate;
            activeSession = requested;
            latestOpenRequestId = requestId;
            candidate.location.replace(buildEditorUrl(requested));
            candidate.focus();
            installEditorCloseMonitor();
            setPanelStatus(
                tabName,
                `Editorを別ウィンドウで開きました。自動保存: ${runtimeSettings.auto_save ? "ON" : "OFF"}`,
                "success",
            );
            return;
        }

        const editorUrl = new URL(apiPath("speech-bubble-forge/static/speech-bubble-editor.html"));
        if (candidateUrl.origin !== editorUrl.origin || candidateUrl.pathname !== editorUrl.pathname) {
            setPanelStatus(tabName, "同名ウィンドウはSpeech Bubble Editorではありません。上書きしませんでした。", "error");
            candidate.focus();
            return;
        }

        reconnectExistingEditor(candidate, requested, requestId);
    }

    function handleOpenSelected(event, tabName = currentTabName()) {
        event?.preventDefault();
        event?.stopPropagation();
        const info = selectedGalleryImageInfo(tabName);
        if (!info) {
            setPanelStatus(tabName, "画像が選択されていません。", "error");
            toast("ギャラリーの画像を選択してください。", "error");
            return;
        }
        setPanelStatus(tabName, "Editorを開いています…", "info");
        openEditor({
            imageUrl: info.url,
            sourceName: info.name,
            tabName,
        });
    }

    function openSelected(tabName = currentTabName()) {
        handleOpenSelected(null, tabName);
    }

    function openBlank(tabName = currentTabName()) {
        openEditor({ sourceName: "speech_bubble", tabName });
    }

    function bestEffortGalleryInsert(tabName, imageUrl, filename) {
        const root = appRoot();
        const gallery = root.querySelector(`#${tabName}_gallery`);
        const row = root.querySelector(`#image_buttons_${tabName}`);
        if (!gallery || !row || !imageUrl) return false;

        let result = row.parentElement?.querySelector(`[data-speech-bubble-export-result="${tabName}"]`);
        if (!result) {
            result = document.createElement("a");
            result.dataset.speechBubbleExportResult = tabName;
            result.className = "speech-bubble-forge-export-result";
            result.target = "_blank";
            result.rel = "noopener";
            result.innerHTML = '<img alt="Speech Bubble export"><span></span>';
            row.insertAdjacentElement("afterend", result);
        }
        result.href = imageUrl;
        result.querySelector("img").src = imageUrl;
        result.querySelector("span").textContent = filename || "Speech Bubble export";

        const thumbnails = gallery.querySelector(".thumbnails");
        const alreadyAdded = thumbnails && Array.from(thumbnails.querySelectorAll("[data-speech-bubble-export-url]")).some((item) => item.dataset.speechBubbleExportUrl === imageUrl);
        if (thumbnails && !alreadyAdded) {
            const thumbnail = document.createElement("button");
            thumbnail.type = "button";
            thumbnail.className = "thumbnail-item thumbnail-small speech-bubble-forge-export-thumb";
            thumbnail.dataset.speechBubbleExportUrl = imageUrl;
            thumbnail.title = filename || "Speech Bubble export";
            const img = document.createElement("img");
            img.src = imageUrl;
            img.alt = filename || "Speech Bubble export";
            thumbnail.appendChild(img);
            thumbnail.addEventListener("click", () => window.open(imageUrl, "_blank", "noopener"));
            thumbnails.appendChild(thumbnail);
        }
        return true;
    }

    window.addEventListener("message", (event) => {
        if (event.origin !== location.origin) return;
        const data = event.data;
        if (!data || typeof data.type !== "string" || !data.type.startsWith("speech_bubble:")) return;
        if (data.type === "speech_bubble:editor_pong") {
            if (
                data.requestId !== latestOpenRequestId ||
                !pendingOpenRequest ||
                event.source !== pendingOpenRequest.candidate
            ) return;
            clearPingRetries();
            const { requested, requestId } = pendingOpenRequest;
            editorWindow = event.source;
            activeSession = {
                key: data.jsonKey || requested.key,
                imageUrl: "",
                sourceName: data.sourceName || requested.sourceName,
                tabName: data.sourceTab || requested.tabName,
                documentId: data.documentId || "",
                mode: data.mode || "",
            };
            installEditorCloseMonitor();
            editorWindow.postMessage({ type: "speech_bubble:request_focus", requestId }, location.origin);
            editorWindow.focus();
            if (requested.imageUrl) {
                sendSourceToExisting(requested, requestId);
            } else {
                pendingOpenRequest = null;
            }
            setPanelStatus(
                requested.tabName,
                "既存Editorへ再接続しました。前面に表示されない場合はタスクバーから選択してください。",
                "success",
            );
            return;
        }
        if (data.type === "speech_bubble:source_applied") {
            if (
                data.requestId !== latestOpenRequestId ||
                !pendingOpenRequest ||
                event.source !== editorWindow
            ) return;
            const requested = pendingOpenRequest.requested;
            activeSession = {
                key: data.jsonKey || activeSession?.key || requested.key,
                imageUrl: requested.imageUrl,
                sourceName: data.sourceName || requested.sourceName,
                tabName: data.sourceTab || requested.tabName,
                documentId: data.documentId || "",
                mode: data.mode || "image",
            };
            pendingOpenRequest = null;
            return;
        }
        if (editorWindow && event.source !== editorWindow) return;
        if (activeSession && data.key && data.key !== activeSession.key) return;
        const tabName = data.source_tab || activeSession?.tabName || currentTabName();

        switch (data.type) {
            case "speech_bubble:editor_ready":
                setPanelStatus(tabName, "Editor: Ready", "success");
                break;
            case "speech_bubble:source_loaded":
                if (activeSession && !pendingOpenRequest) {
                    activeSession.tabName = tabName;
                    activeSession.sourceName = data.source_name || activeSession.sourceName;
                }
                setPanelStatus(
                    tabName,
                    `画像読込: ${data.width || "?"}×${data.height || "?"} · ${data.restored || "新規レイアウト"}`,
                    "success",
                );
                break;
            case "speech_bubble:autosave_layout":
                setPanelStatus(
                    tabName,
                    `下書き自動保存 ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
                    "success",
                );
                break;
            case "speech_bubble:layout_saved":
                setPanelStatus(tabName, "画像ごとのレイアウトを保存しました。", "success");
                toast("レイアウトを保存しました。", "success");
                break;
            case "speech_bubble:layout_discarded":
                setPanelStatus(tabName, "未保存変更を破棄しました。", "info");
                break;
            case "speech_bubble:export_complete": {
                const compositeUrl = data.composite_url ? apiPath(data.composite_url) : null;
                if (compositeUrl) bestEffortGalleryInsert(tabName, compositeUrl, data.filename);
                window.focus();
                setPanelStatus(
                    tabName,
                    `画像書き出し完了: ${data.width || "?"}×${data.height || "?"} / SS ${data.supersample || runtimeSettings.supersample}`,
                    "success",
                    compositeUrl,
                );
                toast("画像を書き出しました。", "success", compositeUrl);
                break;
            }
            case "speech_bubble:editor_closed":
            case "speech_bubble:editor_closing":
            case "speech_bubble:cancel_editor":
                cleanupEditor();
                setPanelStatus(tabName, "Editor: Ready", "info");
                break;
            default:
                break;
        }
    });

    function iconMarkup() {
        return `<svg class="speech-bubble-forge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <path d="M4.25 4.5h11.5A3.25 3.25 0 0 1 19 7.75v5A3.25 3.25 0 0 1 15.75 16H9.2l-4.45 3.1.8-3.55A3.25 3.25 0 0 1 1 12.75v-5A3.25 3.25 0 0 1 4.25 4.5Z"/>
          <path stroke-width="1.75" d="m13.5 14.8 5.65-5.65 1.7 1.7-5.65 5.65-2.45.75.75-2.45Z"/>
          <path stroke-width="1.75" d="m18.2 10.1 1.7 1.7"/>
        </svg>`;
    }

    function directChildOf(parent, node) {
        let current = node;
        while (current && current.parentElement && current.parentElement !== parent) current = current.parentElement;
        return current?.parentElement === parent ? current : null;
    }

    function findScriptAnchor(settings, tabName) {
        const root = appRoot();
        const selectors = [
            `#script_${tabName}_script_container`,
            `#${tabName}_script_container`,
            `#script_${tabName}_script`,
            `#${tabName}_script`,
            `[id*="${tabName}"][id*="script"][id*="container"]`,
        ];
        for (const selector of selectors) {
            const candidate = root.querySelector(selector);
            if (candidate && settings.contains(candidate)) return directChildOf(settings, candidate) || candidate;
        }
        const labels = Array.from(settings.querySelectorAll("label, span, .label-wrap"));
        const label = labels.find((element) => element.textContent?.trim() === "Script");
        if (!label) return null;
        const container = label.closest(".gradio-dropdown, .block, .form, .gradio-row, .gradio-column") || label.parentElement;
        return directChildOf(settings, container) || container;
    }

    function addGalleryButton(tabName) {
        const root = appRoot();
        const row = root.querySelector(`#image_buttons_${tabName}`);
        if (!row || row.querySelector(`[data-speech-bubble-forge="${tabName}"]`)) return;

        const template = row.querySelector("button");
        const button = document.createElement("button");
        button.type = "button";
        button.id = `${tabName}_speech_bubble_editor`;
        button.dataset.speechBubbleForge = tabName;
        button.className = template?.className || "";
        button.classList.add("speech-bubble-forge-tool");
        button.title = "Speech Bubbleで編集";
        button.setAttribute("aria-label", "Speech Bubbleで編集");
        button.innerHTML = iconMarkup();
        button.addEventListener("click", (event) => handleOpenSelected(event, tabName));
        row.appendChild(button);
    }

    function addQuickPanel(tabName) {
        const root = appRoot();
        const settings = root.querySelector(`#${tabName}_settings`);
        if (!settings) return;

        let details = settings.querySelector(`[data-speech-bubble-panel="${tabName}"]`);
        if (!details) {
            details = document.createElement("details");
            details.className = "speech-bubble-forge-panel";
            details.dataset.speechBubblePanel = tabName;
            details.innerHTML = `
              <summary>Speech Bubble Editor</summary>
              <div class="speech-bubble-forge-panel-body">
                <div class="speech-bubble-forge-actions">
                  <button type="button" data-action="gallery">選択中の生成画像を開く <span aria-hidden="true">↗</span></button>
                  <button type="button" data-action="blank">エディターを開く <span aria-hidden="true">↗</span></button>
                </div>
                <p class="speech-bubble-forge-note">※ 別ウィンドウで開きます。ローカル画像はエディター内で選択・ドラッグ＆ドロップ・貼り付けできます。</p>
                <div class="speech-bubble-forge-status" data-speech-bubble-status="${tabName}" data-level="info" aria-live="polite">Editor: Ready</div>
              </div>`;
            details.querySelector('[data-action="gallery"]').addEventListener("click", (event) => handleOpenSelected(event, tabName));
            details.querySelector('[data-action="blank"]').addEventListener("click", () => openBlank(tabName));
        }

        const anchor = findScriptAnchor(settings, tabName);
        if (anchor && anchor !== details && anchor.parentElement === settings) {
            settings.insertBefore(details, anchor);
        } else if (!details.isConnected || details.parentElement !== settings) {
            settings.appendChild(details);
        }
    }

    function refreshPanelState(tabName) {
        const root = appRoot();
        const panel = root.querySelector(`[data-speech-bubble-panel="${tabName}"]`);
        if (!panel) return;
        const openButton = panel.querySelector('[data-action="gallery"]');
        const galleryButton = root.querySelector(`[data-speech-bubble-forge="${tabName}"]`);
        const info = selectedGalleryImageInfo(tabName);
        if (openButton) openButton.disabled = !info;
        if (galleryButton) galleryButton.disabled = !info;
        const status = panel.querySelector(`[data-speech-bubble-status="${tabName}"]`);
        if (status && status.textContent?.startsWith("Editor: Ready")) {
            const size = info?.width && info?.height ? ` · 選択画像 ${info.width}×${info.height}` : " · 画像未選択";
            status.textContent = `Editor: Ready${size} · 自動保存 ${runtimeSettings.auto_save ? "ON" : "OFF"}`;
        }
    }

    function refreshPanelStates() {
        for (const tabName of ["txt2img", "img2img"]) refreshPanelState(tabName);
    }

    function installUi() {
        syncTheme();
        for (const tabName of ["txt2img", "img2img"]) {
            addGalleryButton(tabName);
            addQuickPanel(tabName);
            refreshPanelState(tabName);
        }
    }

    window.speechBubbleForgeOpenSelected = openSelected;
    window.speechBubbleForgeOpenEditor = openBlank;

    const start = async () => {
        await loadRuntimeSettings();
        installUi();
    };

    if (typeof onUiLoaded === "function") onUiLoaded(start);
    else document.addEventListener("DOMContentLoaded", start);

    if (typeof onAfterUiUpdate === "function") onAfterUiUpdate(installUi);
    if (typeof onOptionsAvailable === "function") onOptionsAvailable(() => loadRuntimeSettings(true).then(installUi));
    if (typeof onOptionsChanged === "function") onOptionsChanged(() => loadRuntimeSettings(true).then(installUi));
})();
