"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

async function testApiSettingsEndpoint() {
  const requested = [];
  const context = {
    console,
    Blob,
    fetch: async (url) => {
      requested.push(String(url));
      return {
        ok: true,
        async json() {
          return { ok: true, language: "ja", shared_project_images: true };
        },
      };
    },
  };
  context.globalThis = context;
  vm.runInNewContext(
    fs.readFileSync("web/project/forge-project-api.js", "utf8"),
    context,
    { filename: "forge-project-api.js" },
  );
  const api = new context.SpeechBubbleForgeProjectApi.ForgeProjectApi({
    base: "/speech-bubble-forge",
  });
  const settings = await api.settings();
  assert.deepEqual({ ...settings }, {
    ok: true,
    language: "ja",
    shared_project_images: true,
  });
  assert.deepEqual(requested, ["/speech-bubble-forge/config"]);
}

function testHostLanguageDoesNotOverwriteLocalPreference() {
  const stored = new Map();
  let dispatches = 0;
  const context = {
    console,
    URLSearchParams,
    Event: class Event { constructor(type) { this.type = type; } },
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    navigator: { language: "en-US" },
    location: { search: "?theme=dark" },
    document: { documentElement: { lang: "en", dataset: {} } },
    localStorage: {
      getItem(key) { return stored.get(key) || null; },
      setItem(key, value) { stored.set(key, String(value)); },
    },
    dispatchEvent() { dispatches += 1; },
  };
  context.globalThis = context;
  vm.runInNewContext(
    fs.readFileSync("web/project/project-settings.js", "utf8"),
    context,
    { filename: "project-settings.js" },
  );

  const settings = context.SpeechBubbleForgeProjectSettings;
  settings.set({ language: "en" });
  const storedBeforeHost = stored.get(
    "speech-bubble-forge:comic-panel-editor-settings:v1",
  );
  settings.setHostSettings({ language: "ja", auto_save: true });

  assert.equal(context.document.documentElement.lang, "ja");
  assert.equal(settings.get().language, "ja");
  assert.equal(
    stored.get("speech-bubble-forge:comic-panel-editor-settings:v1"),
    storedBeforeHost,
    "Forge host settings must remain authoritative without rewriting the local fallback",
  );
  assert.ok(dispatches >= 4, "language and settings change events should be dispatched");
}

(async () => {
  await testApiSettingsEndpoint();
  testHostLanguageDoesNotOverwriteLocalPreference();
  console.log("project_settings_sync_test: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
