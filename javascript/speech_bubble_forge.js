// Legacy session/theme bridge and host Settings link.
// The current launcher is speech_bubble_project_bridge.js.
(() => {
    "use strict";

    const EDITOR_WINDOW_NAME = "speech_bubble_forge_editor";
    const EDITOR_WINDOW_STATE_KEY = "speech-bubble/editor/window-state:v1";
    const DEFAULT_SETTINGS = Object.freeze({
        output_dir: "outputs/speech-bubble-forge",
        fixed_output_dir: "outputs/speech-bubble-forge",
        forge_output_dir: "outputs",
        forge_output_dirs: {},
        prompt_export_location: true,
        use_forge_output_dir: true,
        remember_export_directory: true,
        export_directory_version: "0",
        filename_format: "source_datetime",
        date_subfolder: "none",
        backup_enabled: true,
        backup_generations: 5,
        output_format: "png",
        png_compression: 6,
        jpeg_quality: 95,
        webp_quality: 90,
        webp_lossless: false,
        window_width: 1440,
        window_height: 900,
        supersample: 2,
        auto_save: true,
        keep_previous_layout: true,
        save_overlay: false,
        export_transport: "legacy_json_v1",
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
    let focusRetryTimers = [];

    const appRoot = () => (typeof gradioApp === "function" ? gradioApp() : document);

    function buttonWithText(scope, text, selectors) {
        if (!scope) return null;
        const expected = String(text || "").trim().toLocaleLowerCase();
        for (const selector of selectors) {
            const match = Array.from(scope.querySelectorAll(selector)).find((button) => {
                return button.textContent?.trim().toLocaleLowerCase() === expected;
            });
            if (match) return match;
        }
        return null;
    }

    function openSpeechBubbleSettings(event) {
        event?.preventDefault();
        event?.stopPropagation();
        const root = appRoot();
        const mainSettingsTab = buttonWithText(root, "Settings", [
            "#tabs > .tab-nav button",
            "#tabs > div.tab-nav button",
            "#tabs button[role='tab']",
        ]);
        if (!mainSettingsTab) {
            toast("Settingsタブを開けませんでした。上部のSettingsからComic Panel Editorを選択してください。", "error");
            return;
        }
        mainSettingsTab.click();
        let completed = false;
        for (const delay of [0, 80, 220, 500]) {
            setTimeout(() => {
                if (completed) return;
                const settings = root.querySelector("#settings");
                const section = buttonWithText(settings, "Comic Panel Editor", [
                    ":scope > .tab-nav button",
                    ":scope > div.tab-nav button",
                    ".tab-nav button",
                ]);
                if (section) section.click();
                const panel = root.querySelector("#speech-bubble-forge-settings-panel");
                if (!panel || (!section && delay < 500)) return;
                completed = true;
                panel.scrollIntoView({ behavior: "smooth", block: "start" });
                panel.classList.add("speech-bubble-settings-link-target");
                setTimeout(() => panel.classList.remove("speech-bubble-settings-link-target"), 1400);
            }, delay);
        }
    }

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

    function randomUuid() {
        if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
        const bytes = new Uint8Array(16);
        globalThis.crypto?.getRandomValues?.(bytes);
        if (!bytes.some(Boolean)) {
            for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
        }
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
            fixed_output_dir: String(payload?.fixed_output_dir || DEFAULT_SETTINGS.fixed_output_dir),
            forge_output_dir: String(payload?.forge_output_dir || DEFAULT_SETTINGS.forge_output_dir),
            forge_output_dirs: payload?.forge_output_dirs && typeof payload.forge_output_dirs === "object"
                ? payload.forge_output_dirs
                : DEFAULT_SETTINGS.forge_output_dirs,
            prompt_export_location: payload?.prompt_export_location !== false,
            use_forge_output_dir: payload?.use_forge_output_dir !== false,
            remember_export_directory: payload?.remember_export_directory !== false,
            export_directory_version: String(payload?.export_directory_version || DEFAULT_SETTINGS.export_directory_version),
            filename_format: ["source_datetime", "source_sequence", "source_only", "speech_bubble_datetime"].includes(payload?.filename_format)
                ? payload.filename_format
                : DEFAULT_SETTINGS.filename_format,
            date_subfolder: ["none", "year_month", "year_month_day"].includes(payload?.date_subfolder)
                ? payload.date_subfolder
                : DEFAULT_SETTINGS.date_subfolder,
            backup_enabled: payload?.backup_enabled !== false,
            backup_generations: Math.max(1, Math.min(20, Number(payload?.backup_generations) || DEFAULT_SETTINGS.backup_generations)),
            output_format: ["png", "jpeg", "webp"].includes(payload?.output_format)
                ? payload.output_format
                : DEFAULT_SETTINGS.output_format,
            png_compression: Math.max(0, Math.min(9, Number.isFinite(Number(payload?.png_compression)) ? Number(payload.png_compression) : DEFAULT_SETTINGS.png_compression)),
            jpeg_quality: Math.max(1, Math.min(100, Number(payload?.jpeg_quality) || DEFAULT_SETTINGS.jpeg_quality)),
            webp_quality: Math.max(1, Math.min(100, Number(payload?.webp_quality) || DEFAULT_SETTINGS.webp_quality)),
            webp_lossless: payload?.webp_lossless === true,
            window_width: Math.max(900, Math.min(3840, Number(payload?.window_width) || DEFAULT_SETTINGS.window_width)),
            window_height: Math.max(640, Math.min(2160, Number(payload?.window_height) || DEFAULT_SETTINGS.window_height)),
            supersample: Math.max(1, Math.min(4, Number(payload?.supersample) || DEFAULT_SETTINGS.supersample)),
            auto_save: payload?.auto_save !== false,
            keep_previous_layout: payload?.keep_previous_layout !== false,
            save_overlay: payload?.save_overlay === true,
            export_transport: String(payload?.export_transport || DEFAULT_SETTINGS.export_transport),
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
        const availableLeft = Number(screen.availLeft) || 0;
        const availableTop = Number(screen.availTop) || 0;
        let saved = null;
        try {
            saved = JSON.parse(localStorage.getItem(EDITOR_WINDOW_STATE_KEY) || "null");
        } catch {
            // Use the configured initial size when stored state is unavailable.
        }
        const restoreMaximized = saved?.mode === "maximized";
        const storedWidth = Number(saved?.width);
        const storedHeight = Number(saved?.height);
        const width = restoreMaximized
            ? availableWidth
            : Math.min(availableWidth, Math.max(640, Number.isFinite(storedWidth) ? storedWidth : runtimeSettings.window_width));
        const height = restoreMaximized
            ? availableHeight
            : Math.min(availableHeight, Math.max(480, Number.isFinite(storedHeight) ? storedHeight : runtimeSettings.window_height));
        const centeredLeft = availableLeft + Math.round((availableWidth - width) / 2);
        const centeredTop = availableTop + Math.round((availableHeight - height) / 2);
        const storedLeft = Number(saved?.left);
        const storedTop = Number(saved?.top);
        const left = restoreMaximized
            ? availableLeft
            : Math.min(Math.max(Number.isFinite(storedLeft) ? storedLeft : centeredLeft, availableLeft), availableLeft + availableWidth - width);
        const top = restoreMaximized
            ? availableTop
            : Math.min(Math.max(Number.isFinite(storedTop) ? storedTop : centeredTop, availableTop), availableTop + availableHeight - height);
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
        editor.searchParams.set("promptExportLocation", runtimeSettings.prompt_export_location ? "1" : "0");
        editor.searchParams.set("useForgeOutputDir", runtimeSettings.use_forge_output_dir ? "1" : "0");
        editor.searchParams.set("rememberExportDirectory", runtimeSettings.remember_export_directory ? "1" : "0");
        editor.searchParams.set("exportDirectoryVersion", runtimeSettings.export_directory_version);
        editor.searchParams.set(
            "forgeOutputDir",
            runtimeSettings.forge_output_dirs?.[session.tabName] || runtimeSettings.forge_output_dir,
        );
        editor.searchParams.set("filenameFormat", runtimeSettings.filename_format);
        editor.searchParams.set("dateSubfolder", runtimeSettings.date_subfolder);
        editor.searchParams.set("backupEnabled", runtimeSettings.backup_enabled ? "1" : "0");
        editor.searchParams.set("backupGenerations", String(runtimeSettings.backup_generations));
        editor.searchParams.set("saveOverlay", runtimeSettings.save_overlay ? "1" : "0");
        editor.searchParams.set("exportTransport", runtimeSettings.export_transport);
        editor.searchParams.set("theme", currentTheme || detectForgeTheme());
        editor.searchParams.set("assetVersion", runtimeSettings.asset_cache_version);
        editor.searchParams.set("sourceTab", session.tabName || "");
        editor.searchParams.set("sourceName", session.sourceName || "speech_bubble");
        editor.searchParams.set("mode", session.mode || (session.imageUrl ? "image" : "standalone"));
        if (session.standaloneId) editor.searchParams.set("standaloneId", session.standaloneId);
        if (session.imageUrl) editor.searchParams.set("imageUrl", session.imageUrl);
        editor.searchParams.set("v", "20260726-01");
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
        clearFocusRetries();
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

    function clearFocusRetries() {
        focusRetryTimers.forEach(clearTimeout);
        focusRetryTimers = [];
    }

    function requestEditorFocus(candidate = editorWindow, requestId = latestOpenRequestId) {
        if (!candidate || candidate.closed) return;
        clearFocusRetries();
        for (const delay of [0, 90, 240]) {
            focusRetryTimers.push(setTimeout(() => {
                if (
                    !candidate ||
                    candidate.closed ||
                    candidate !== editorWindow ||
                    (requestId && requestId !== latestOpenRequestId)
                ) return;
                candidate.postMessage(
                    { type: "speech_bubble:request_focus", requestId },
                    location.origin,
                );
                candidate.focus();
            }, delay));
        }
    }

    function sendEditorPing(candidate, requestId) {
        candidate.postMessage({ type: "speech_bubble:host_ping", requestId }, location.origin);
    }

    function reconnectExistingEditor(candidate, requested, requestId) {
        editorWindow = candidate;
        pendingOpenRequest = { candidate, requested, requestId };
        latestOpenRequestId = requestId;
        clearPingRetries();
        for (const delay of [0, 140, 360, 800, 1400]) {
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
                mode: session.mode || "image",
            },
            location.origin,
        );
    }

    function sendContextToExisting(session, requestId) {
        if (!editorWindow || editorWindow.closed) return;
        editorWindow.postMessage(
            {
                type: "speech_bubble:switch_context",
                requestId,
                mode: session.mode,
                documentId: session.documentId,
                imageUrl: session.imageUrl || "",
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
            mode: options.mode || (options.imageUrl ? "image" : "standalone"),
            standaloneId: options.standaloneId || "",
            documentId: options.standaloneId ? `standalone:${options.standaloneId}` : "",
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
            setPanelStatus(tabName, "同名ウィンドウはComic Panel Editorではありません。上書きしませんでした。", "error");
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
            mode: "image",
        });
    }

    function openSelected(tabName = currentTabName()) {
        handleOpenSelected(null, tabName);
    }

    function openBlank(tabName = currentTabName()) {
        openEditor({ sourceName: "speech_bubble", tabName, mode: "standalone", standaloneId: randomUuid() });
    }

    function removeLegacyExportResults() {
        const root = appRoot();
        root.querySelectorAll(
            "[data-speech-bubble-export-result], [data-speech-bubble-export-url], .speech-bubble-forge-export-result, .speech-bubble-forge-export-thumb",
        ).forEach((node) => node.remove());
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
            requestEditorFocus(editorWindow, requestId);
            if (requested.mode === "image" && requested.imageUrl) {
                sendSourceToExisting(requested, requestId);
            } else if (
                requested.mode === "standalone" &&
                (data.mode !== requested.mode || data.documentId !== requested.documentId)
            ) {
                sendContextToExisting(requested, requestId);
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
        if (data.type === "speech_bubble:source_applied" || data.type === "speech_bubble:context_applied") {
            if (
                data.requestId !== latestOpenRequestId ||
                !pendingOpenRequest ||
                event.source !== editorWindow
            ) return;
            const requested = pendingOpenRequest.requested;
            activeSession = {
                key: data.jsonKey || activeSession?.key || requested.key,
                imageUrl: data.mode === "image" ? requested.imageUrl : "",
                sourceName: data.sourceName || requested.sourceName,
                tabName: data.sourceTab || requested.tabName,
                documentId: data.documentId || "",
                mode: data.mode || requested.mode,
            };
            pendingOpenRequest = null;
            return;
        }
        if (editorWindow && event.source !== editorWindow) return;
        if (activeSession && data.key && data.key !== activeSession.key) return;
        const tabName = data.source_tab || activeSession?.tabName || currentTabName();

        switch (data.type) {
            case "speech_bubble:editor_ready":
                requestEditorFocus(event.source, latestOpenRequestId);
                setPanelStatus(tabName, "Editor: Ready", "success");
                break;
            case "speech_bubble:source_loaded":
                if (activeSession && !pendingOpenRequest) {
                    activeSession.tabName = tabName;
                    activeSession.sourceName = data.source_name || activeSession.sourceName;
                    activeSession.documentId = data.document_id || activeSession.documentId;
                    activeSession.mode = data.document_id?.startsWith("standalone:") ? "standalone" : data.document_id?.startsWith("image:") ? "image" : activeSession.mode;
                }
                setPanelStatus(
                    tabName,
                    `画像読込: ${data.width || "?"}×${data.height || "?"} · ${data.restored || "新規レイアウト"}`,
                    "success",
                );
                break;
            case "speech_bubble:document_changed":
                if (activeSession && !pendingOpenRequest) {
                    activeSession.documentId = data.document_id || activeSession.documentId;
                    activeSession.mode = data.mode || activeSession.mode;
                }
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
                const timings = data.timings_ms && typeof data.timings_ms === "object" ? data.timings_ms : null;
                const seconds = (value) => `${(Math.max(0, Number(value) || 0) / 1000).toFixed(Number(value) < 1000 ? 2 : 1)}s`;
                const timingText = timings
                    ? ` / 合計 ${seconds(timings.total)} / PNG ${seconds(timings.canvas_png)} / API ${seconds(timings.api_roundtrip)}${timings.folder_save ? ` / 保存 ${seconds(timings.folder_save)}` : ""}`
                    : "";
                removeLegacyExportResults();
                window.focus();
                if (timings) console.info("Speech Bubble export timings", timings);
                setPanelStatus(
                    tabName,
                    `画像書き出し完了: ${data.width || "?"}×${data.height || "?"} / ${data.render_mode === "browser_canvas_v1" ? "WYSIWYG" : `SS ${data.supersample || runtimeSettings.supersample}`}${timingText}`,
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
        removeLegacyExportResults();
        const root = appRoot();
        root.querySelectorAll("[data-speech-bubble-forge]").forEach((element) => element.remove());
    }

    delete window.speechBubbleForgeOpenSelected;
    delete window.speechBubbleForgeOpenEditor;
    window.speechBubbleForgeOpenSettings = openSpeechBubbleSettings;

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
