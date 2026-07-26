"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const editor = fs.readFileSync(path.join(root, "web", "speech-bubble-editor.html"), "utf8");

assert.match(editor, /fontLoadPromises\.delete\(font\.id\)/);
assert.match(editor, /verticalGlyphSpriteCache\.clear\(\)/);
assert.match(editor, /item\.type==="text"&&item\.auto_fit/);
assert.match(editor, /MAX_SFX_TINT_CACHE = 192/);
assert.match(editor, /asset\?\.currentSrc\|\|asset\?\.src/);
assert.match(editor, /lruSet\(sfxTintCache,key,tinted,MAX_SFX_TINT_CACHE\)/);
assert.match(editor, /function clearSfxAssetCaches\(\)/);
assert.match(editor, /clearSfxAssetCaches\(\);USER_ASSET_REVISION/);
assert.match(editor, /grid-template-columns:clamp\(150px,22vw,224px\) minmax\(220px,1fr\) clamp\(230px,30vw,304px\)/);
assert.doesNotMatch(editor, /min-width:900px/);
assert.match(editor, /LAYOUT_ELEMENT_TYPES\.has\(String\(item\.type\|\|""\)\)/);
assert.match(editor, /normalizedLayoutPathPoints\(item\.path_points\)/);

console.log("editor_stability_regression_test: OK");
