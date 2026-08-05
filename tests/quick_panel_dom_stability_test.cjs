"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const legacy = fs.readFileSync("javascript/speech_bubble_forge.js", "utf8");
const project = fs.readFileSync("javascript/speech_bubble_project_bridge.js", "utf8");

const legacyInstall = legacy.match(/function installUi\(\) \{[\s\S]*?\n    \}/)?.[0] || "";
assert.ok(legacyInstall, "legacy installUi must exist");
assert.doesNotMatch(legacyInstall, /addGalleryButton/);
assert.doesNotMatch(legacyInstall, /addQuickPanel/);
assert.match(legacyInstall, /data-speech-bubble-forge/);
assert.match(legacy, /delete window\.speechBubbleForgeOpenSelected/);
assert.match(legacy, /delete window\.speechBubbleForgeOpenEditor/);

assert.match(project, /function ensureProjectPanel/);
assert.match(project, /data-speech-bubble-panel/);
assert.match(project, /data-action-project-editor/);
assert.match(project, /actions\.replaceChildren\(row\)/);

console.log("quick_panel_dom_stability_test: OK");
