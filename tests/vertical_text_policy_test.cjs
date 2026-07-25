"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const editor = fs.readFileSync(
    path.join(__dirname, "..", "web", "speech-bubble-editor.html"),
    "utf8",
);
const policyStart = editor.indexOf("const VERTICAL_ROTATE_CLOCKWISE=");
const policyEnd = editor.indexOf("const verticalGlyphSpriteCache=", policyStart);
assert.ok(policyStart >= 0 && policyEnd > policyStart, "vertical policy block must exist");
const policySource = editor.slice(policyStart, policyEnd);
const Policy = vm.runInNewContext(
    `(()=>{${policySource};return{fallbackVerticalGraphemes,segmentVerticalGraphemes,verticalGraphemePolicy};})()`,
    {Intl},
);

assert.equal(Policy.verticalGraphemePolicy("2").kind, "upright-center");
assert.equal(Policy.verticalGraphemePolicy("お").kind, "upright-center");
assert.equal(Policy.verticalGraphemePolicy("ー").kind, "rotate-clockwise");
assert.equal(Policy.verticalGraphemePolicy("「").kind, "rotate-clockwise");
assert.equal(Policy.verticalGraphemePolicy("…").kind, "rotate-clockwise");
assert.equal(Policy.verticalGraphemePolicy("。").kind, "upright-top-right");
assert.equal(Policy.verticalGraphemePolicy("ゃ").kind, "upright-top-right");

assert.deepEqual(
    [...Policy.fallbackVerticalGraphemes("か\u3099き\u3099")],
    ["か\u3099", "き\u3099"],
);
assert.deepEqual(
    [...Policy.fallbackVerticalGraphemes("👩\u200d💻")],
    ["👩\u200d💻"],
);
assert.deepEqual(
    [...Policy.segmentVerticalGraphemes("2おおー")].map(
        grapheme => Policy.verticalGraphemePolicy(grapheme).kind,
    ),
    ["upright-center", "upright-center", "upright-center", "rotate-clockwise"],
);

assert.match(editor, /function alphaCropCanvas\(/);
assert.match(editor, /function rotateCanvasClockwise\(/);
assert.match(editor, /function renderVerticalGlyphSprite\(/);
assert.match(editor, /function drawVerticalTextColumns\(/);
assert.match(editor, /verticalGlyphSpriteCache\.size>512/);
assert.match(editor, /drawVerticalTextColumns\(ctx,item,logicalW,padX,padY,size,spacing,strokeWidth\)/);
assert.doesNotMatch(
    editor,
    /if\(String\(item\.writing\|\|""\)\.startsWith\("vertical"\)\)\{const colW=/,
);

console.log("vertical_text_policy_test: OK");
