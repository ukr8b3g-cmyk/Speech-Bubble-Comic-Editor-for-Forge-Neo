const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }
  get length() {
    return this.values.size;
  }
  key(index) {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }
  setItem(key, value) {
    this.values.set(String(key), String(value));
  }
  removeItem(key) {
    this.values.delete(String(key));
  }
}

global.localStorage = new MemoryStorage();
const script = fs.readFileSync(
  path.join(__dirname, "..", "javascript", "speech_bubble_cache.js"),
  "utf8",
);
vm.runInThisContext(script, { filename: "speech_bubble_cache.js" });

const Cache = global.SpeechBubbleForgeCache;
assert(Cache);
assert.strictEqual(Cache.MAX_DRAFT_DOCUMENTS, 100);
assert.strictEqual(Cache.MAX_STANDALONE_BACKGROUNDS, 10);
assert.strictEqual(Cache.MAX_GENERATED_BACKGROUNDS, 10);
assert.strictEqual(Cache.DRAFT_MAX_AGE_MS, 90 * 24 * 60 * 60 * 1000);

const now = Date.now();
const metadata = {};
for (let index = 0; index < 102; index++) {
  const id = `image:${String(index).padStart(64, "0")}`;
  localStorage.setItem(`speech-bubble/draft/${id}`, `{"index":${index}}`);
  metadata[id] = now - index * 1000;
}
const expiredId = `image:${"e".repeat(64)}`;
localStorage.setItem(`speech-bubble/draft/${expiredId}`, "{}");
metadata[expiredId] = now - Cache.DRAFT_MAX_AGE_MS - 1;
localStorage.setItem("speech-bubble/draft-meta:v1", JSON.stringify(metadata));

const retainedDrafts = Cache.pruneDrafts();
assert.strictEqual(Object.keys(retainedDrafts).length, 100);
assert.strictEqual(localStorage.getItem(`speech-bubble/draft/${expiredId}`), null);
assert.strictEqual(
  [...localStorage.values.keys()].filter((key) => key.startsWith("speech-bubble/draft/")).length,
  100,
);

const retainedBackgrounds = Cache.retainedBackgroundRecords(
  Array.from({ length: 12 }, (_, index) => ({
    documentId: `standalone:${index}`,
    updatedAt: index,
  })),
);
assert.strictEqual(retainedBackgrounds.length, 10);
assert.strictEqual(retainedBackgrounds[0].updatedAt, 11);
assert.strictEqual(retainedBackgrounds[9].updatedAt, 2);

const retainedGeneratedBackgrounds = Cache.retainedBackgroundRecords(
  Array.from({ length: 12 }, (_, index) => ({
    documentId: `generated:${index}`,
    kind: "generated",
    updatedAt: index,
  })),
  "generated",
);
assert.strictEqual(retainedGeneratedBackgrounds.length, 10);
assert.strictEqual(retainedGeneratedBackgrounds[0].updatedAt, 11);
assert.strictEqual(retainedGeneratedBackgrounds[9].updatedAt, 2);

assert(Cache.isEditingCacheKey("speech-bubble/layout/image:test"));
assert(Cache.isEditingCacheKey("speech-bubble/draft/image:test"));
assert(!Cache.isEditingCacheKey("speech_bubble:asset_favorites:v1"));

const editorSource = fs.readFileSync(
  path.join(__dirname, "..", "web", "speech-bubble-editor.html"),
  "utf8",
);
assert(editorSource.includes("await storeGeneratedBackground(cacheId,blob,name,tab,url)"));
assert(editorSource.includes("const cached=await cachedBackground(cacheId)"));
assert(editorSource.includes("保持済みの生成画像を再表示しました"));

delete global.localStorage;
delete global.SpeechBubbleForgeCache;
console.log("browser_cache_core_test: OK");
