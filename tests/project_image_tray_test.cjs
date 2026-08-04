const assert = require("node:assert/strict");

delete globalThis.SpeechBubbleProjectImageTray;
require("../web/project/project-image-tray.js");

const tray = globalThis.SpeechBubbleProjectImageTray;
assert.ok(tray);

const ids = ["image-a", "image-b"];
assert.deepEqual(tray.normalizeState(null, ids), {
  mode: "shared",
  forge_import: "place",
  shared: ids,
  workspaces: { single: [], comic: [], comic_layout: [] },
});

assert.deepEqual(
  tray.normalizeState(
    {
      mode: "separate",
      forge_import: "tray_only",
      shared: ["unknown"],
      workspaces: {
        single: ["image-a", "image-a"],
        comic: ["image-b"],
        comic_layout: ["unknown"],
      },
    },
    ids,
  ),
  {
    mode: "separate",
    forge_import: "tray_only",
    shared: [],
    workspaces: {
      single: ["image-a"],
      comic: ["image-b"],
      comic_layout: [],
    },
  },
);

console.log("project_image_tray_test: OK");
