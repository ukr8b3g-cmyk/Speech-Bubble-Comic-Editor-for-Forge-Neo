const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const quickEditor = fs.readFileSync("web/speech-bubble-editor.html", "utf8");
const projectEditor = fs.readFileSync("web/project-editor.html", "utf8");
const quickBridge = fs.readFileSync(
  "javascript/speech_bubble_forge.js",
  "utf8",
);
const projectBridge = fs.readFileSync(
  "javascript/speech_bubble_project_bridge.js",
  "utf8",
);
const projectApi = fs.readFileSync(
  "web/project/forge-project-api.js",
  "utf8",
);
const projectAdapter = fs.readFileSync(
  "web/project/forge-project-adapter.js",
  "utf8",
);
const backgroundRemoval = fs.readFileSync(
  "web/project/background-removal.js",
  "utf8",
);
const projectImageTray = fs.readFileSync(
  "web/project/project-image-tray.js",
  "utf8",
);
const projectSettings = fs.readFileSync(
  "web/project/project-settings.js",
  "utf8",
);
const forgeProjectCss = fs.readFileSync(
  "web/project/forge-project.css",
  "utf8",
);
const comicEditor = fs.readFileSync(
  "web/project/comic-editor.js",
  "utf8",
);
const generalComicEditor = fs.readFileSync(
  "web/project/general-comic-editor.js",
  "utf8",
);
const metadata = fs.readFileSync("metadata.ini", "utf8");
const apiPy = fs.readFileSync("speech_bubble_forge/api.py", "utf8");

const inlineScripts = [...projectEditor.matchAll(
  /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi,
)].map((match) => match[1]).filter((source) => source.trim());
inlineScripts.forEach((source, index) => {
  new vm.Script(source, { filename: `project-editor-inline-${index + 1}.js` });
});

assert.match(quickEditor, /Speech Bubble Editor/);
assert.match(projectEditor, /project-schema\.js/);
assert.match(projectEditor, /editor-mode-controller\.js/);
assert.match(projectEditor, /general-comic-editor\.js/);
assert.match(projectEditor, /forge-project-adapter\.js/);
assert.match(projectEditor, /project-image-tray\.js/);
assert.match(projectEditor, /project-settings\.js/);
assert.doesNotMatch(projectEditor, /common-asset-drawer\.js/);
assert.match(projectEditor, /Comic Panel Editor/);
assert.match(projectEditor, /forgeProjectImageStore/);
assert.match(projectEditor, /initializeProjectImageTray/);
assert.match(projectEditor, /grid-template-columns:clamp\(176px,14vw,224px\)[^;]+clamp\(540px,34vw,640px\)/);
assert.match(projectEditor, /@media \(max-width:1100px\)[\s\S]*grid-template-rows:minmax\(260px,58%\) minmax\(180px,42%\)/);
assert.match(projectEditor, /<section id="propertiesDock" class="properties-dock">/);
assert.match(projectEditor, /<section id="layersDock" class="layers-dock">/);
assert.match(projectEditor, /initializeRightDockFloating\(\)/);
assert.doesNotMatch(projectEditor, /if\(isForgeProjectHost&&!isPaletteWindow\)/);
assert.match(projectEditor, /getImageTrayState/);
assert.match(projectEditor, /forgeImportBehavior/);
assert.match(projectEditor, /registerSingleImageAsset[\s\S]*forgeProjectImageStore\.put/);
assert.match(projectEditor, /isForgeProjectHost\s*\?\s*"multipart_canvas_v1"/);
assert.match(projectEditor, /forgeProjectAdapter\?\.save\?\.\("manual"\)/);
assert.match(
  projectEditor,
  /ensureFontLoaded\(restoredFont\)\.then\(loaded=>\{if\(!loaded\|\|!state\.elements\.includes\(item\)\)return;verticalGlyphSpriteCache\.clear\(\);fitTextBox/,
  "restored vertical text must clear fallback glyph sprites after its font loads",
);

assert.match(quickBridge, /speech_bubble_forge_editor/);
assert.doesNotMatch(quickBridge, /speech_bubble_forge_project_editor/);
assert.match(projectBridge, /speech_bubble_forge_project_editor/);
assert.match(projectBridge, /speech_bubble_project:request_gallery_image/);
assert.match(projectBridge, /speech_bubble_project:gallery_image/);
assert.match(projectBridge, /event\.origin !== location\.origin/);
assert.match(projectBridge, /event\.source !== projectWindow/);
assert.match(projectBridge, /UUID_RE/);
assert.match(projectBridge, /forgeApiBase", "\/speech-bubble-forge"/);
assert.match(projectBridge, /コミックパネルエディターを開く ↗/);
assert.match(projectBridge, /actions\.replaceChildren\(row\)/);
assert.match(projectBridge, /function ensureProjectPanel/);
assert.match(projectBridge, /speech_bubble_project:open_settings/);
assert.doesNotMatch(quickBridge, /addGalleryButton\(tabName\);/);
assert.doesNotMatch(quickBridge, /addQuickPanel\(tabName\);/);

assert.match(projectApi, /\/projects\//);
assert.match(projectApi, /uploadImage/);
assert.match(projectAdapter, /importSelectedForgeImage/);
assert.match(projectAdapter, /runtime\.forgeImportBehavior/);
assert.match(projectAdapter, /image_ids: currentImageIds\(\)/);
assert.match(projectAdapter, /image_trays: runtime\.getImageTrayState/);
assert.match(projectImageTray, /mode: "shared"/);
assert.match(projectImageTray, /forge_import: "place"/);
assert.match(projectImageTray, /ページ画像/);
assert.match(projectImageTray, /canvasPanel\.append\(tray\)/);
assert.match(projectImageTray, /project-image-tray-badge selected-badge/);
assert.match(projectImageTray, /project-image-tray-badge used-badge/);
assert.match(projectImageTray, /let initiallyCollapsed = true/);
assert.doesNotMatch(projectImageTray, /data-project-tray-settings/);
assert.match(projectSettings, /show_empty_guide: false/);
assert.match(projectSettings, /autosave_enabled: true/);
assert.match(projectSettings, /shared_project_images/);
assert.match(projectSettings, /source\.autosave_enabled = source\.auto_save !== false/);
assert.match(projectSettings, /options\.openHostSettings\?\.\(\)/);
assert.doesNotMatch(projectSettings, /forge-project-settings-dialog/);
assert.doesNotMatch(forgeProjectCss, /forge-project-settings-dialog/);
assert.match(forgeProjectCss, /> \.comic-image-tray/);
assert.match(
  comicEditor,
  /footer\.parentElement\?\.insertBefore\(tray, footer\)/,
  "comic tray must be inserted beside its actual footer parent",
);
assert.match(
  generalComicEditor,
  /footer\.parentElement\?\.insertBefore\(tray, footer\)/,
  "general comic tray must be inserted beside its actual footer parent",
);
assert.match(metadata, /Name=Speech Bubble Comic Editor for Forge Neo/);
assert.match(backgroundRemoval, /aiInferenceAvailable/);
assert.match(backgroundRemoval, /await startModelDownload\(\)/);
assert.match(backgroundRemoval, /const consent = confirm/);
assert.match(backgroundRemoval, /manualMaskEditing/);
assert.doesNotMatch(backgroundRemoval, /\/desktop\/background-removal/);

assert.match(apiPy, /register_project_routes/);
assert.match(apiPy, /register_background_removal_routes/);
assert.doesNotMatch(
  quickEditor,
  /forge-project-adapter\.js/,
  "Quick Editor must not load the Project Editor adapter",
);

console.log("project_editor_integration_test: OK");
