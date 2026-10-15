"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const editor = fs.readFileSync("web/project/editor-shell.js", "utf8");
const launcher = fs.readFileSync("javascript/speech_bubble_project_bridge.js", "utf8");
const adapterSrc = fs.readFileSync("web/project/forge-project-adapter.js", "utf8");

const start = editor.indexOf("    function applyForgeProjectSettings(");
const end = editor.indexOf("    function initializeForgeProjectSettings()", start);
assert.ok(start !== -1 && end > start);
const runtime = vm.createContext({
  isForgeProjectHost: true,
  window: { SpeechBubbleForgeProjectSettings: { get: () => ({}) } },
  projectImageTray: { applySettings() {} },
  applyForgeProjectLanguage() {},
  updateActionState() {},
});
vm.runInContext(`
  let promptExportLocation=false, useForgeOutputDir=true, rememberExportDirectory=true;
  let exportDirectoryVersion="0", forgeOutputDir="", filenameFormat="source_datetime";
  let dateSubfolder="none", backupEnabled=true, backupGenerations=5, saveOverlay=false;
  let showEmptyCanvasGuide=false;
  ${editor.slice(start,end)}
  globalThis.read = () => ({
    promptExportLocation, saveOverlay, useForgeOutputDir, rememberExportDirectory,
    exportDirectoryVersion, forgeOutputDir, backupEnabled, backupGenerations
  });
`, runtime);
runtime.applyForgeProjectSettings({
  save_overlay: true,
  prompt_export_location: true,
  use_forge_output_dir: false,
  remember_export_directory: false,
  export_directory_version: "123",
  forge_output_dir: "D:/Forge",
  backup_enabled: false,
  backup_generations: 3
});
assert.equal(runtime.read().saveOverlay, true);
assert.equal(runtime.read().promptExportLocation, true);
assert.equal(runtime.read().useForgeOutputDir, false);
assert.equal(runtime.read().rememberExportDirectory, false);
assert.equal(runtime.read().exportDirectoryVersion, "123");
assert.equal(runtime.read().forgeOutputDir, "D:/Forge");
assert.equal(runtime.read().backupEnabled, false);
runtime.applyForgeProjectSettings({ save_overlay: false, prompt_export_location: false });
assert.equal(runtime.read().saveOverlay, false);
assert.equal(runtime.read().promptExportLocation, false);
assert.match(editor, /if\(saveOverlay\)\{/);
assert.match(editor, /if\(rendered\.overlayBlob\)form\.append\("overlay"/);
assert.match(editor, /else if\(promptExportLocation\)\{/);
assert.match(launcher, /speech_bubble_project:set_host_settings/);
assert.match(launcher, /syncHostSettings\(\);/);

const listeners = new Map(), applied = [], stored = [];
const opener = { closed: false };
const projectId = "project:11111111-1111-4111-8111-111111111111";
const fake = {
  console, URLSearchParams,
  window: { opener, addEventListener: (event, callback) => listeners.set(event, callback) },
  document: { documentElement: { lang: "en" } },
  location: { search: "", origin: "http://127.0.0.1:7860" },
  clearTimeout() {}, setTimeout() {},
  addEventListener() {},
  SpeechBubbleForgeProjectApi: {
    normalizeProjectId: id => id,
    ForgeProjectApi: class {},
  },
  SpeechBubbleForgeGalleryImport: {},
  SpeechBubbleForgeProjectSettings: {
    text: (_ja, en) => en,
    setHostSettings: settings => stored.push(settings)
  },
};
vm.runInNewContext(adapterSrc, fake, { filename: "forge-project-adapter.js" });
fake.SpeechBubbleForgeProjectAdapter.create({
  projectId,
  runtime: {
    applyHostSettings: value => applied.push(value),
    setStatus() {}
  }
});
const valid = { type: "speech_bubble_project:set_host_settings", protocolVersion: 1,
  projectId, settings: { save_overlay: true, prompt_export_location: true } };
for (const event of [
  { origin: "http://wrong", source: opener, data: valid },
  { origin: fake.location.origin, source: {}, data: valid },
  { origin: fake.location.origin, source: opener, data: { ...valid, projectId: "project:other" } },
  { origin: fake.location.origin, source: opener, data: { ...valid, protocolVersion: 2 } },
]) listeners.get("message")(event);
assert.equal(applied.length, 0, "untrusted host messages must not update export settings");
listeners.get("message")({origin: fake.location.origin, source: opener, data: valid});
assert.equal(applied.length, 1);
assert.equal(stored.length, 1);
assert.equal(applied[0].save_overlay, true);
console.log("project_export_host_settings_test: OK (host overlay, picker and trusted live updates)");
