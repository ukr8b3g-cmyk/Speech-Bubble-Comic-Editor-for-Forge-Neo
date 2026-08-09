"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const adapter = fs.readFileSync("web/project/forge-project-adapter.js", "utf8");
const comic = fs.readFileSync("web/project/comic-editor.js", "utf8");
const general = fs.readFileSync("web/project/general-comic-editor.js", "utf8");

assert.match(adapter, /aria-busy/);
assert.match(adapter, /requestAnimationFrame\(resolve\)/);
assert.match(adapter, /画像を追加しています/);
assert.match(comic, /async function attachBlob\(metadata, blob, render = true\)/);
assert.match(comic, /attachBlob\(metadata, file, false\)/);
assert.match(general, /function attachBlob\(metadata, blob, render = true\)/);
assert.match(general, /attachBlob\(metadata, file, false\)/);
console.log("project_import_responsiveness_test: OK");
