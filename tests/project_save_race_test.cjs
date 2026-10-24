"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("web/project/forge-project-adapter.js", "utf8");
const PROJECT_ID = "project:11111111-1111-4111-8111-111111111111";
async function fixture() {
  let scene = "A", title = "Draft", tray = { mode: "shared", shared: [] };
  let ids = [], autorevision = 0;
  const requests = [], statuses = [], marks = [], timers = new Map();
  let nextTimer = 1;
  const api = {
    normalizeProjectId: id => id,
    ForgeProjectApi: class {
      async settings() { return {}; }
      async load() { return { title, layout: { scene }, images: [], image_trays: tray }; }
      save(_projectId, payload) {
        return new Promise((resolve, reject) => requests.push({ payload, resolve, reject }));
      }
    },
  };
  const context = {
    console,
    URLSearchParams,
    location: { search: "", origin: "http://127.0.0.1:7860" },
    document: { documentElement: { lang: "en" }, querySelector() { return null; } },
    window: { opener: null, addEventListener() {} },
    addEventListener() {},
    clearTimeout(id) { timers.delete(id); },
    setTimeout(callback) { const id = nextTimer++; timers.set(id, callback); return id; },
    SpeechBubbleForgeProjectApi: api,
    SpeechBubbleForgeGalleryImport: {},
    SpeechBubbleForgeProjectSettings: {
      text: (_ja, en) => en,
      get: () => ({ autosave_enabled: true, autosave_delay_ms: 500 }),
    },
  };
  vm.runInNewContext(source, context, { filename: "forge-project-adapter.js" });
  const adapter = context.SpeechBubbleForgeProjectAdapter.create({
    projectId: PROJECT_ID,
    runtime: {
      serializeLayout: async () => ({ scene }),
      getProjectTitle: () => title,
      referencedImageIds: () => ids,
      imageTrayIds: () => [],
      getImageTrayState: () => tray,
      setStatus: (_text, level) => statuses.push(level),
      markSaved: value => marks.push(value.scene),
    }
  });
  await adapter.initialize();
  async function flush() { for (let i = 0; i < 4; i++) await Promise.resolve(); }
  return {
    adapter, requests, statuses, marks, timers, flush,
    setScene(value) { scene = value; },
    setTitle(value) { title = value; },
    setIds(value) { ids = value; },
    setTray(value) { tray = value; },
    fireTimers: async () => {
      const callbacks = [...timers.values()];
      timers.clear();
      for (const callback of callbacks) await callback();
      await flush();
    }
  };
}

(async () => {
  // A save of A must not clear a newer edit B, and it must requeue autosave B.
  {
    const f = await fixture();
    const first = f.adapter.save("manual");
    await f.flush();
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].payload.layout.scene, "A");
    f.setScene("B");
    f.adapter.markDirty();
    f.requests[0].resolve({ layout: { scene: "A" }, title: "Draft", images: [] });
    assert.equal(await first, false);
    assert.equal(f.adapter.hasUnsavedChanges(), true);
    assert.deepEqual(f.marks, []);
    assert.ok(f.timers.size > 0, "new edit must receive another autosave");
    await f.fireTimers();
    assert.equal(f.requests.length, 2);
    assert.equal(f.requests[1].payload.layout.scene, "B");
    f.requests[1].resolve({ layout: { scene: "B" }, title: "Draft", images: [] });
    await f.flush();
    assert.equal(f.adapter.hasUnsavedChanges(), false);
    assert.deepEqual(f.marks, ["B"]);
  }
  // A timer firing while another request is pending must not swallow the new edit.
  {
    const f = await fixture();
    const active = f.adapter.save("autosave");
    await f.flush();
    f.setScene("B"); f.adapter.markDirty();
    await f.fireTimers();
    assert.equal(f.requests.length, 1);
    f.requests[0].resolve({ title: "Draft", images: [] });
    assert.equal(await active, false);
    assert.equal(f.adapter.hasUnsavedChanges(), true);
    await f.fireTimers();
    assert.equal(f.requests.length, 2);
    f.requests[1].resolve({ title: "Draft", images: [] });
    await f.flush();
    assert.equal(f.adapter.hasUnsavedChanges(), false);
  }
  // Even if a change event is delayed, compare the serialized layout before declaring clean.
  {
    const f = await fixture(), pending = f.adapter.save("manual");
    await f.flush(); f.setScene("B");
    f.requests[0].resolve({ title: "Draft", images: [] });
    assert.equal(await pending, false);
    assert.equal(f.adapter.hasUnsavedChanges(), true);
    assert.equal(f.marks.length, 0);
  }
  // Title and tray changes cannot be silently marked saved.
  {
    const f = await fixture(), pending = f.adapter.save("manual");
    await f.flush(); f.setTitle("Changed"); f.setTray({ mode: "separate", shared: [] });
    f.requests[0].resolve({ title: "Draft", images: [] });
    assert.equal(await pending, false);
    assert.equal(f.adapter.hasUnsavedChanges(), true);
  }
  // A stable save clears dirty state.
  {
    const f = await fixture(); f.adapter.markDirty();
    const pending = f.adapter.save("manual");
    await f.flush();
    f.requests[0].resolve({ title: "Draft", images: [] });
    assert.equal(await pending, true);
    assert.equal(f.adapter.hasUnsavedChanges(), false);
    assert.deepEqual(f.marks, ["A"]);
  }
  // A server rejection cannot clear unsaved work.
  {
    const f = await fixture(); f.adapter.markDirty();
    const pending = f.adapter.save("manual");
    await f.flush();
    f.requests[0].reject(new Error("disk full"));
    assert.equal(await pending, false);
    assert.equal(f.adapter.hasUnsavedChanges(), true);
    assert.equal(f.statuses.at(-1), "error");
  }
  console.log("project_save_race_test: OK (six save-integrity cases)");
})().catch(error => { console.error(error); process.exitCode = 1; });
