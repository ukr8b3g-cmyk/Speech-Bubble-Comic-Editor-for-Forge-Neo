"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const editor = fs.readFileSync("web/project-editor.html", "utf8");
const bridge = fs.readFileSync("javascript/speech_bubble_project_bridge.js", "utf8");
const settings = fs.readFileSync("javascript/speech_bubble_settings.js", "utf8");
const settingsPy = fs.readFileSync("speech_bubble_forge/settings.py", "utf8");
const settingsUi = fs.readFileSync("scripts/speech_bubble_forge.py", "utf8");
const manifest = JSON.parse(fs.readFileSync(
  "web/assets/sfx/sfx-png-corrected-list-v2/manifest.json",
  "utf8",
));

assert.match(bridge, /let configuredLanguage = "auto"/);
assert.match(bridge, /async function loadConfiguredLanguage\(\)/);
assert.match(bridge, /let row = actions\.querySelector/);
assert.doesNotMatch(bridge, /if \(actions\.querySelector\("\[data-action-project-editor\]"\)\) return/);

assert.match(editor, /FORGE_UI_TRANSLATIONS/);
assert.match(editor, /FORGE_TITLE_TRANSLATIONS/);
assert.match(editor, /function applyAccessibleTooltips\(\)/);
assert.match(editor, /DRAWER_WIDTHS_KEY = "speech_bubble:drawer_widths:v2"/);
assert.match(editor, /SFX_SECTION_STATE_KEY = "speech_bubble:sfx_drawer_sections:v1"/);
assert.match(editor, /function restoreDrawerWidth\(drawer\)/);
assert.match(editor, /locked=false,fit="cover"/);
assert.match(editor, /role:"forge-gallery",assetId:String\(asset\.id\),locked:false/);

assert.match(settings, /MODEL_ENDPOINT/);
assert.match(settings, /speech_bubble_forge_language/);
assert.match(settings, /data-speech-bubble-model-download/);
assert.match(settingsUi, /Appearance（表示）/);
assert.match(settingsUi, /AI Background Removal Model/);
assert.match(settingsPy, /DEFAULT_LANGUAGE = "auto"/);
assert.match(settingsPy, /DEFAULT_SHOW_EMPTY_GUIDE = False/);

assert.equal(manifest.revision, 3);
for (let index = 21; index <= 35; index += 1) {
  const prefix = `${String(index).padStart(2, "0")}_`;
  const item = manifest.items.find((entry) => entry.asset.includes(`/` + prefix));
  assert.ok(item, `missing SFX manifest entry ${prefix}`);
  assert.equal(item.defaults?.fillColor, "#EC407A");
  assert.equal(item.defaults?.outlineColor, "#111111");
  assert.equal(item.defaults?.outlineWidth, 3);
  assert.ok(fs.existsSync(`web/assets/sfx/sfx-png-corrected-list-v2/${item.asset}`));
}

console.log("forge_ui_parity_test: OK");
