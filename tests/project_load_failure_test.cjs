"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync("web/project/forge-project-adapter.js", "utf8");

function fixture(failure) {
  let fail = failure, puts = 0, imports = 0, cleanups = 0;
  const states = [], controls = new Map();
  const button = () => ({ disabled: false, hidden: false });
  for (const name of ["save", "import", "retry"]) controls.set(`[data-forge-project-${name}]`, button());
  const document = { documentElement: { lang: "en" }, querySelector: selector => controls.get(selector) || null };
  const manifest = { title: "Existing", layout: { text: "KEEP" }, images: [], image_trays: { shared: [] } };
  const context = {
    URLSearchParams, document, location: { search: "", origin: "http://localhost" },
    window: { opener: null, addEventListener() {} }, addEventListener() {}, setTimeout, clearTimeout,
    SpeechBubbleForgeProjectSettings: { text: (_ja, en) => en },
    SpeechBubbleForgeGalleryImport: { waitForGalleryImage() { imports++; throw new Error("must not import"); } },
    SpeechBubbleForgeProjectApi: {
      normalizeProjectId: id => id,
      ForgeProjectApi: class {
        async settings() { return {}; }
        async load() { return structuredClone(manifest); }
        async save(_id, payload) { puts++; return { ...manifest, ...payload }; }
        async cleanup() { cleanups++; return {}; }
      },
    },
  };
  vm.runInNewContext(source, context);
  const adapter = context.SpeechBubbleForgeProjectAdapter.create({ projectId: "project:test", runtime: {
    async restoreLayout() { if (fail) throw new Error(fail); },
    serializeLayout: async () => ({ text: "KEEP" }),
    setProjectReady: ready => states.push(ready),
  } });
  return { adapter, states, controls, retry: () => { fail = null; }, counts: () => ({ puts, imports, cleanups }) };
}
(async () => {
  for (const failure of ["image 503", "image decode failed", "invalid schema"]) {
    const f = fixture(failure);
    assert.equal(await f.adapter.save(), false, "save before initialize must be blocked");
    await assert.rejects(f.adapter.initialize(), new RegExp(failure));
    assert.equal(await f.adapter.save(), false, "failed restore must never PUT an empty layout");
    await assert.rejects(f.adapter.importSelectedForgeImage());
    assert.equal((await f.adapter.cleanupUnusedImages()).ok, false);
    assert.deepEqual(f.counts(), { puts: 0, imports: 0, cleanups: 0 });
    assert.equal(f.controls.get("[data-forge-project-save]").disabled, true);
    assert.equal(f.states.at(-1), false);
    f.retry(); await f.adapter.initialize();
    assert.equal(f.states.at(-1), true);
    assert.equal(await f.adapter.save(), true);
    assert.equal(f.counts().puts, 1);
  }
  console.log("project_load_failure_test: OK (503, decode, schema failures and retry)");
})().catch(error => { console.error(error); process.exitCode = 1; });
