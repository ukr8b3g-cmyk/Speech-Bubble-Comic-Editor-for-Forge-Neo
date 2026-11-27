"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");

const source = readFileSync(path.join(__dirname, "../web/project/background-removal.js"), "utf8");

function section(start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, start);
  return source.slice(first, last);
}

function fixture({ confirmDownload = true } = {}) {
  const handlers = {};
  const waits = [];
  const inferenceModels = [];
  const applyButton = { disabled: false };
  let downloadState = "missing";
  let requestError = false;
  let decode = async () => ({ close() {} });
  const modelSelect = { value: "inspyrenet", addEventListener(event, handler) { handlers[event] = handler; } };
  const dialog = { open: true, addEventListener(event, handler) { handlers[event] = handler; } };
  // Execute the production handlers and async model flow with a two-pixel mask.
  const api = runInNewContext([
    "const source = { blob: { type: 'image/png' } }, sourcePixels = {};",
    "let aiMask = new Uint8ClampedArray([255, 255]), aiMaskModel = 'inspyrenet';",
    "let editedMask = new Uint8ClampedArray([40, 220]), maskMode = 'auto';",
    "let maskModeStates = { auto: null, guided: null };",
    "let history = [{ mask: new Uint8ClampedArray([40, 255]) }];",
    "let redo = [{ mask: new Uint8ClampedArray([10, 220]) }];",
    "let processingRequest = 0, inferenceRevision = 0, processingRunning = false;",
    "let guidedProcessed = true, guidedDirty = false;",
    "const guideKeepMask = new Uint8ClampedArray([160, 0]), guideRemoveMask = new Uint8ClampedArray(2);",
    "const aiApiBase = '/forge/background-removal';",
    "const aiInferenceAvailable = true, sourceCanvas = { width: 2, height: 1 };",
    "const tr = (_, english) => english;",
    "const noop = () => {};",
    "const updateMaskModeUi = noop, scheduleRender = noop, markMaskChanged = noop, updateHistoryButtons = noop;",
    "const initializeGuideMasks = noop, setStatus = noop, historyLimit = () => 24;",
    "const editSnapshot = () => ({ mask: new Uint8ClampedArray(editedMask) });",
    "const restoreEditSnapshot = state => { editedMask = state?.mask || null; };",
    "const pushHistory = () => { history.push(editSnapshot()); redo = []; };",
    "const copySnapshotList = list => list.slice();",
    "const responseError = async (_, message) => new Error(message);",
    source.includes("    function updateApplyAvailability()")
      ? section("    function updateApplyAvailability()", "    function updateHistoryButtons()") : "",
    section("    function saveActiveMaskModeState()", "    function initializeGuideMasks()"),
    section("    function modelUrl(", "    function displayModelStatus("),
    "const displayModelStatus = noop;",
    section("    async function startModelDownload(", "    function maskBlob()"),
    section("    async function refreshModelInfo()", "    launcher.addEventListener"),
    section('    dialog.addEventListener("click"', '    fileInput.addEventListener("change"'),
    "({ inspect: () => ({ mask: editedMask, aiMask, history, redo, processingRunning }),",
    "switchMode(mode) { saveActiveMaskModeState(); maskMode = mode; restoreMaskModeState(maskModeStates[mode]); } })",
  ].join("\n"), {
    modelSelect, dialog, applyButton,
    confirm: () => confirmDownload,
    setTimeout: callback => waits.push(callback),
    imageBitmap: (...args) => decode(...args),
    document: {
      createElement() {
        return { getContext: () => ({
          drawImage() {},
          getImageData: () => ({ data: new Uint8ClampedArray([77, 0, 0, 255, 201, 0, 0, 255]) }),
        }) };
      },
    },
    async fetch(url) {
      const { pathname, searchParams } = new URL(url, "http://editor.test");
      const model = searchParams.get("model");
      if (pathname.endsWith("/infer")) {
        inferenceModels.push(model);
        return { ok: !requestError, blob: async () => ({}) };
      }
      if (pathname.endsWith("/download")) downloadState = "downloading";
      if (pathname.endsWith("/cancel")) downloadState = "missing";
      const state = model === "inspyrenet" ? "ready" : downloadState;
      return { ok: true, json: async () => ({ model, state, ready: state === "ready", available: true }) };
    },
  }, { filename: "editor-background-removal" });

  const initial = api.inspect();
  return {
    api, waits, inferenceModels, applyButton,
    select(model = "isnet-anime") { modelSelect.value = model; return handlers.change(); },
    click(action) {
      return handlers.click({ target: { closest: selector => selector === "[data-br-action]"
        ? { dataset: { brAction: action } } : null } });
    },
    ready() { downloadState = "ready"; },
    failRequest() { requestError = true; },
    setDecode(fn) { decode = fn; },
    assertPreserved() {
      const state = api.inspect();
      assert.equal(state.mask, initial.mask, "the edited mask must remain active");
      assert.equal(state.aiMask, initial.aiMask);
      assert.equal(state.history, initial.history);
      assert.equal(state.redo, initial.redo);
      assert.deepEqual([...state.mask], [40, 220]);
      assert.deepEqual([...state.history[0].mask], [40, 255]);
      assert.deepEqual([...state.redo[0].mask], [10, 220]);
    },
  };
}

async function until(predicate) {
  for (let i = 0; i < 20 && !predicate(); i++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(predicate(), "asynchronous step did not start");
}

test("declining the download preserves the edited mask and history", async () => {
  const editor = fixture({ confirmDownload: false });
  await editor.select();
  editor.assertPreserved();
  assert.deepEqual(editor.inferenceModels, []);
  assert.equal(editor.applyButton.disabled, false);
});

test("cancelling an in-progress download keeps Undo and Redo usable", async () => {
  const editor = fixture();
  const switched = editor.select();
  await until(() => editor.waits.length);
  editor.assertPreserved();
  await editor.click("cancel-download");
  editor.waits.shift()();
  await switched;
  editor.assertPreserved();
  assert.equal(editor.api.inspect().processingRunning, false);
  assert.equal(editor.applyButton.disabled, false);
  await editor.click("undo");
  assert.deepEqual([...editor.api.inspect().mask], [40, 255]);
  await editor.click("redo");
  assert.deepEqual([...editor.api.inspect().mask], [40, 220]);
});

test("an inference or decoding failure leaves the previous result applicable", async () => {
  for (const stage of ["inference", "decode"]) {
    const editor = fixture();
    editor.ready();
    if (stage === "inference") editor.failRequest();
    else editor.setDecode(async () => { throw new Error("Invalid mask image"); });
    await editor.select();
    editor.assertPreserved();
    assert.equal(editor.applyButton.disabled, false, stage);
  }
});

test("the automatic result changes only after the new mask is decoded", async () => {
  const editor = fixture();
  editor.ready();
  let finishDecode;
  editor.setDecode(() => new Promise(resolve => { finishDecode = resolve; }));
  const switched = editor.select();
  await until(() => finishDecode);
  editor.assertPreserved();
  finishDecode({ close() {} });
  await switched;
  assert.deepEqual([...editor.api.inspect().mask], [77, 201]);
  assert.equal(editor.api.inspect().history.length, 0);
  assert.equal(editor.api.inspect().redo.length, 0);
  assert.equal(editor.applyButton.disabled, false);
});

test("guided removal uses the selected model and retains the auto mode baseline", async () => {
  const editor = fixture();
  editor.api.switchMode("guided");
  editor.ready();
  await editor.select();
  assert.deepEqual(editor.inferenceModels, []);
  await editor.click("run-mask");
  assert.deepEqual(editor.inferenceModels, ["isnet-anime"]);
  assert.deepEqual([...editor.api.inspect().mask], [160, 201]);
  editor.api.switchMode("auto");
  assert.deepEqual([...editor.api.inspect().mask], [40, 220]);
  assert.deepEqual([...editor.api.inspect().aiMask], [255, 255]);
  assert.equal(editor.api.inspect().history.length, 1);
});

test("a superseded inference cannot overwrite the newer result", async () => {
  const editor = fixture();
  editor.ready();
  let finishOldDecode;
  editor.setDecode(() => new Promise(resolve => { finishOldDecode = resolve; }));
  const switched = editor.select();
  await until(() => finishOldDecode);
  editor.setDecode(async () => ({ close() {} }));
  await editor.select("inspyrenet");
  const current = editor.api.inspect().mask;
  assert.deepEqual([...current], [77, 201]);
  finishOldDecode({ close() {} });
  await switched;
  assert.equal(editor.api.inspect().mask, current);
});
