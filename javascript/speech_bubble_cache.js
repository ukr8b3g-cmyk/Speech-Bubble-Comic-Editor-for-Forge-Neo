(() => {
    "use strict";

    const DRAFT_LAYOUT_PREFIX = "speech-bubble/draft/";
    const SAVED_LAYOUT_PREFIX = "speech-bubble/layout/";
    const LEGACY_DRAFT_LAYOUT_PREFIX = "speech_bubble:forge:layout:draft:";
    const LEGACY_SAVED_LAYOUT_PREFIX = "speech_bubble:forge:layout:saved:";
    const SESSION_LAYOUT_PREFIX = "speech_bubble:forge:session:";
    const DRAFT_META_KEY = "speech-bubble/draft-meta:v1";
    const LAST_STANDALONE_ID_KEY = "speech-bubble/standalone/last-document-id";
    const DOCUMENT_DB_NAME = "speech-bubble-forge-documents";
    const DOCUMENT_DB_STORE = "backgrounds";
    const MAX_DRAFT_DOCUMENTS = 100;
    const MAX_STANDALONE_BACKGROUNDS = 10;
    const MAX_GENERATED_BACKGROUNDS = 10;
    const DRAFT_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

    const appRoot = () => (typeof gradioApp === "function" ? gradioApp() : document);

    function openDocumentDb() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DOCUMENT_DB_NAME, 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(DOCUMENT_DB_STORE)) {
                    request.result.createObjectStore(DOCUMENT_DB_STORE, { keyPath: "documentId" });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    function draftMetadata() {
        try {
            const value = JSON.parse(localStorage.getItem(DRAFT_META_KEY) || "{}");
            return value && typeof value === "object" && !Array.isArray(value) ? value : {};
        } catch {
            return {};
        }
    }

    function saveDraftMetadata(value) {
        try {
            localStorage.setItem(DRAFT_META_KEY, JSON.stringify(value));
        } catch {
            // Storage quota errors are reflected by the usage display.
        }
    }

    function pruneDrafts() {
        const now = Date.now();
        const cutoff = now - DRAFT_MAX_AGE_MS;
        const metadata = draftMetadata();
        const entries = [];
        try {
            for (let index = 0; index < localStorage.length; index++) {
                const key = localStorage.key(index);
                if (!key?.startsWith(DRAFT_LAYOUT_PREFIX)) continue;
                const id = key.slice(DRAFT_LAYOUT_PREFIX.length);
                const updatedAt = Number(metadata[id]) || now;
                if (updatedAt < cutoff) {
                    localStorage.removeItem(key);
                    delete metadata[id];
                    index -= 1;
                    continue;
                }
                entries.push({ id, key, updatedAt });
            }
            entries.sort((left, right) => right.updatedAt - left.updatedAt);
            for (const entry of entries.slice(MAX_DRAFT_DOCUMENTS)) {
                localStorage.removeItem(entry.key);
                delete metadata[entry.id];
            }
            const retained = {};
            for (const entry of entries.slice(0, MAX_DRAFT_DOCUMENTS)) {
                retained[entry.id] = entry.updatedAt;
            }
            saveDraftMetadata(retained);
            return retained;
        } catch {
            return metadata;
        }
    }

    async function backgroundRecords() {
        if (!globalThis.indexedDB) return [];
        const db = await openDocumentDb();
        let records = [];
        await new Promise((resolve, reject) => {
            const transaction = db.transaction(DOCUMENT_DB_STORE, "readonly");
            const request = transaction.objectStore(DOCUMENT_DB_STORE).getAll();
            request.onsuccess = () => {
                records = Array.isArray(request.result) ? request.result : [];
            };
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
        });
        db.close();
        return records;
    }

    function backgroundRecordKind(record) {
        const id = String(record?.documentId || "");
        return record?.kind === "generated" || id.startsWith("generated:")
            ? "generated"
            : "standalone";
    }

    function retainedBackgroundRecords(records, kind = "standalone") {
        return records
            .filter((record) => backgroundRecordKind(record) === kind)
            .sort((left, right) => (Number(right.updatedAt) || 0) - (Number(left.updatedAt) || 0))
            .slice(0, kind === "generated" ? MAX_GENERATED_BACKGROUNDS : MAX_STANDALONE_BACKGROUNDS);
    }

    async function pruneBackgrounds() {
        const records = await backgroundRecords();
        const standalone = retainedBackgroundRecords(records, "standalone");
        const generated = retainedBackgroundRecords(records, "generated");
        const retainedIds = new Set([...standalone, ...generated].map((record) => record.documentId));
        const removed = records.filter((record) => !retainedIds.has(record.documentId));
        if (removed.length) {
            const db = await openDocumentDb();
            await new Promise((resolve, reject) => {
                const transaction = db.transaction(DOCUMENT_DB_STORE, "readwrite");
                const store = transaction.objectStore(DOCUMENT_DB_STORE);
                removed.forEach((record) => store.delete(record.documentId));
                transaction.oncomplete = resolve;
                transaction.onerror = () => reject(transaction.error);
            });
            db.close();
        }
        const previous = localStorage.getItem(LAST_STANDALONE_ID_KEY) || "";
        if (removed.some((record) => record.documentId === previous)) {
            const newest = standalone[0]?.documentId;
            if (newest) localStorage.setItem(LAST_STANDALONE_ID_KEY, newest);
            else localStorage.removeItem(LAST_STANDALONE_ID_KEY);
        }
        return { standalone, generated };
    }

    function isEditingCacheKey(key) {
        return key === DRAFT_META_KEY ||
            key === LAST_STANDALONE_ID_KEY ||
            key.startsWith(DRAFT_LAYOUT_PREFIX) ||
            key.startsWith(SAVED_LAYOUT_PREFIX) ||
            key.startsWith(LEGACY_DRAFT_LAYOUT_PREFIX) ||
            key.startsWith(LEGACY_SAVED_LAYOUT_PREFIX) ||
            key.startsWith(SESSION_LAYOUT_PREFIX);
    }

    function localCacheStats() {
        let bytes = 0;
        let drafts = 0;
        let layouts = 0;
        for (let index = 0; index < localStorage.length; index++) {
            const key = localStorage.key(index) || "";
            if (!isEditingCacheKey(key)) continue;
            const value = localStorage.getItem(key) || "";
            bytes += new Blob([key, value]).size;
            if (key.startsWith(DRAFT_LAYOUT_PREFIX) || key.startsWith(LEGACY_DRAFT_LAYOUT_PREFIX)) drafts += 1;
            if (key.startsWith(SAVED_LAYOUT_PREFIX) || key.startsWith(LEGACY_SAVED_LAYOUT_PREFIX)) layouts += 1;
        }
        return { bytes, drafts, layouts };
    }

    async function cacheStats() {
        pruneDrafts();
        const backgrounds = await pruneBackgrounds();
        const local = localCacheStats();
        const backgroundBytes = [...backgrounds.standalone, ...backgrounds.generated]
            .reduce((total, record) => total + Number(record.blob?.size || 0), 0);
        let originUsage = 0;
        let originQuota = 0;
        try {
            const estimate = await navigator.storage?.estimate?.();
            originUsage = Number(estimate?.usage || 0);
            originQuota = Number(estimate?.quota || 0);
        } catch {
            // The Speech Bubble-specific totals remain available.
        }
        return {
            speechBubbleBytes: local.bytes + backgroundBytes,
            drafts: local.drafts,
            layouts: local.layouts,
            backgrounds: backgrounds.standalone.length,
            generatedBackgrounds: backgrounds.generated.length,
            originUsage,
            originQuota,
        };
    }

    async function clearEditingCache() {
        const keys = [];
        for (let index = 0; index < localStorage.length; index++) {
            const key = localStorage.key(index) || "";
            if (isEditingCacheKey(key)) keys.push(key);
        }
        keys.forEach((key) => localStorage.removeItem(key));
        if (!globalThis.indexedDB) return;
        const db = await openDocumentDb();
        await new Promise((resolve, reject) => {
            const transaction = db.transaction(DOCUMENT_DB_STORE, "readwrite");
            transaction.objectStore(DOCUMENT_DB_STORE).clear();
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
        });
        db.close();
    }

    function formatBytes(value) {
        const bytes = Math.max(0, Number(value) || 0);
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
        return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
    }

    async function updateUsage(panel) {
        const output = panel.querySelector("[data-speech-bubble-cache-usage]");
        if (!output) return;
        output.textContent = "計測中…";
        try {
            const stats = await cacheStats();
            const origin = stats.originQuota
                ? ` / ブラウザー全体 ${formatBytes(stats.originUsage)} / ${formatBytes(stats.originQuota)}`
                : "";
            output.textContent =
                `編集キャッシュ ${formatBytes(stats.speechBubbleBytes)} ` +
                `（下書き ${stats.drafts}/${MAX_DRAFT_DOCUMENTS}・単体背景 ${stats.backgrounds}/${MAX_STANDALONE_BACKGROUNDS}` +
                `・再表示画像 ${stats.generatedBackgrounds}/${MAX_GENERATED_BACKGROUNDS}・レイアウトコピー ${stats.layouts}）${origin}`;
        } catch (error) {
            console.warn("[Speech Bubble Forge] Cache usage check failed.", error);
            output.textContent = "使用量を取得できませんでした";
        }
    }

    function setupCacheManager() {
        const panel = appRoot().querySelector("#speech-bubble-forge-cache-manager");
        if (!panel || panel.dataset.speechBubbleCacheReady === "1") return;
        panel.dataset.speechBubbleCacheReady = "1";
        const refresh = panel.querySelector("[data-speech-bubble-cache-refresh]");
        const clear = panel.querySelector("[data-speech-bubble-cache-clear]");
        refresh?.addEventListener("click", () => updateUsage(panel));
        clear?.addEventListener("click", async () => {
            if (!confirm("自動保存下書き、ローカルのレイアウトコピー、単体背景画像、再表示用生成画像を削除しますか？\n明示保存したForge側レイアウト、お気に入り、素材、保存先設定は削除しません。")) return;
            clear.disabled = true;
            try {
                await clearEditingCache();
                await updateUsage(panel);
            } catch (error) {
                console.warn("[Speech Bubble Forge] Cache clear failed.", error);
                const output = panel.querySelector("[data-speech-bubble-cache-usage]");
                if (output) output.textContent = "キャッシュを削除できませんでした";
            } finally {
                clear.disabled = false;
            }
        });
        updateUsage(panel);
    }

    globalThis.SpeechBubbleForgeCache = Object.freeze({
        DRAFT_MAX_AGE_MS,
        MAX_DRAFT_DOCUMENTS,
        MAX_STANDALONE_BACKGROUNDS,
        MAX_GENERATED_BACKGROUNDS,
        isEditingCacheKey,
        pruneDrafts,
        retainedBackgroundRecords,
    });

    if (typeof document === "undefined") return;
    if (typeof onUiLoaded === "function") onUiLoaded(setupCacheManager);
    else document.addEventListener("DOMContentLoaded", setupCacheManager);
    if (typeof onAfterUiUpdate === "function") onAfterUiUpdate(setupCacheManager);
})();
