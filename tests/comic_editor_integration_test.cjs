const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("web/speech-bubble-editor.html", "utf8");
const editor = fs.readFileSync("web/legacy/comic-editor.js", "utf8");
const css = fs.readFileSync("web/legacy/comic-editor.css", "utf8");

for (const asset of ["comic-editor.css", "comic-panels.js", "comic-editor.js"]) {
  assert.ok(html.includes(`./legacy/${asset}`), `${asset} must be loaded by the Editor`);
}

assert.match(html, /comicEditor=window\.SpeechBubbleComicEditor\.create/);
assert.match(html, /comicEditor\?\.restore\(comicLayout\)/);
assert.match(html, /payload\.comic=comic/);
assert.match(html, /comic:comicEditor\?\.serialize\(\)/);
assert.match(html, /comicEditor\.drawUnderlay\(ctx,\{overlay:comicOverlayExport\}\)/);
assert.match(html, /comicEditor\?\.drawOverlay\(ctx\)/);
assert.match(html, /comicOverlayExport=true/);
assert.match(html, /exportTransport==="multipart_canvas_v1"\|\|comicEditor\?\.isActive\(\)/);
assert.match(html, /comicEditor\?\.handlePointerDown/);
assert.match(html, /comicEditor\?\.handlePointerMove/);
assert.match(html, /comicEditor\?\.handlePointerEnd/);
assert.match(html, /comicEditor\?\.handleImageDrop/);
assert.match(html, /comicEditor\?\.handleContextMenu/);
assert.match(html, /comicEditor\.confirmExport/);

for (const feature of [
  "vertical_four",
  "two_column_sample",
  "split-y",
  "split-x",
  "merge",
  "image_scale",
  "tone_enabled",
  "dot_size",
  "density",
  "tone_opacity",
  "空きコマへ順番に配置",
]) {
  assert.ok(editor.includes(feature), `comic editor must include ${feature}`);
}

assert.match(editor, /speech-bubble-forge-comic-images/);
assert.match(editor, /MAX_IMAGE_BYTES = 96 \* 1024 \* 1024/);
assert.match(editor, /MAX_IMAGES = 100/);
assert.match(editor, /source: "stored"/);
assert.match(css, /\.comic-image-tray/);
assert.match(css, /\.comic-context-menu/);

console.log("comic_editor_integration_test: OK");
