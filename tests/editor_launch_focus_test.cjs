const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "javascript", "speech_bubble_forge.js"),
  "utf8",
);

assert(source.includes("let focusRetryTimers = [];"));
assert(source.includes("function requestEditorFocus("));
assert(source.includes("for (const delay of [0, 90, 240])"));
assert(source.includes("for (const delay of [0, 140, 360, 800, 1400])"));
assert(source.includes('case "speech_bubble:editor_ready":'));
assert(source.includes("requestEditorFocus(event.source, latestOpenRequestId);"));
assert(source.includes('editor.searchParams.set("v", "20260724-06");'));

console.log("editor_launch_focus_test: OK");
