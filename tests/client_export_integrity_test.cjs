"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync("web/project/editor-shell.js", "utf8");
const functions = source.slice(source.indexOf("    async function directoryFile("), source.indexOf("    function roundedTiming("));

function fixture({ backups = true, existing = true, downloadFailure = false, fault = () => {} } = {}) {
  const files = new Map(), events = [];
  if (existing) for (const [name, text] of Object.entries({
    "sample.png": "OLD_MAIN", "sample_overlay.png": "OLD_OVERLAY",
    "sample_backup_01.png": "OLDER_MAIN", "sample_overlay_backup_01.png": "OLDER_OVERLAY",
    "sample_backup_03.png": "OLDEST_MAIN",
  })) files.set(name, new Blob([text]));
  class Directory {
    constructor(prefix = "") { this.prefix = prefix; }
    async getDirectoryHandle(name) { return new Directory(this.prefix + name + "/"); }
    async getFileHandle(name, options = {}) {
      const key = this.prefix + name;
      if (!files.has(key) && !options.create) throw Object.assign(new Error(key), { name: "NotFoundError" });
      if (!files.has(key)) files.set(key, new Blob([]));
      return {
        getFile: async () => files.get(key),
        createWritable: async () => {
          events.push(["create", key]); fault("create", key);
          let pending;
          return {
            async write(value) { events.push(["write", key]); fault("write", key); pending = value; },
            async close() { files.set(key, pending); events.push(["close", key]); fault("close", key); },
            async abort() {},
          };
        },
      };
    }
    async *entries() { for (const key of [...files.keys()]) if (key.startsWith(this.prefix) && !key.slice(this.prefix.length).includes("/")) yield [key.slice(this.prefix.length)]; }
    async removeEntry(name, options = {}) {
      const key = this.prefix + name;
      fault("remove", key);
      if (options.recursive) { for (const n of [...files.keys()]) if (n.startsWith(key + "/")) files.delete(n); }
      else files.delete(key);
    }
  }
  const context = {
    Blob, performance, console, backupEnabled: backups, backupGenerations: 2,
    dateSubfolder: "none", filenameFormat: "source_only", createUuid: () => "test-id",
    uiText: (_ja, en) => en, resolveForgeUrl: value => value,
    fetch: async url => ({ ok: !(downloadFailure && url === "overlay"), status: 503, blob: async () => new Blob([url === "main" ? "NEW_MAIN" : "NEW_OVERLAY"]) }),
  };
  vm.runInNewContext(functions, context);
  const payload = { filename: "sample.png", download_url: "main", save_overlay: true, overlay_download_url: "overlay" };
  const snapshot = async () => Object.fromEntries(await Promise.all([...files].filter(([name]) => !name.includes("/")).map(async ([name, blob]) => [name, await blob.text()])));
  return { files, events, snapshot, run: () => context.saveClientExport(new Directory(), payload) };
}
(async () => {
  {
    const f = fixture({ downloadFailure: true }), before = await f.snapshot();
    await assert.rejects(f.run(), /503/);
    assert.deepEqual(await f.snapshot(), before, "download failure must leave originals AND backup history untouched");
    assert.equal(f.events.length, 0);
  }
  let cases = 1;
  for (const backups of [true, false]) for (const existing of [true, false]) for (const stage of ["create", "write", "close"]) {
    let failed = false;
    const f = fixture({ backups, existing, fault: (event, name) => {
      if (!failed && event === stage && name === "sample_overlay.png") { failed = true; throw new Error("second output failed"); }
    } });
    const before = await f.snapshot();
    await assert.rejects(f.run(), /second output failed/);
    assert.deepEqual(await f.snapshot(), before, `${stage}, backups=${backups}, existing=${existing}`);
    assert.ok(![...f.files.keys()].some(name => name.includes("/")), "successful rollback removes recovery copies");
    cases++;
  }
  {
    let failed = false;
    const f = fixture({ fault: (event, name) => {
      if (!failed && event === "write" && name === "sample_overlay_backup_01.png") { failed = true; throw new Error("backup failed"); }
    } }), before = await f.snapshot();
    await assert.rejects(f.run(), /backup failed/);
    assert.deepEqual(await f.snapshot(), before); cases++;
  }
  {
    const f = fixture(); await f.run(); const saved = await f.snapshot();
    assert.equal(saved["sample.png"], "NEW_MAIN"); assert.equal(saved["sample_overlay.png"], "NEW_OVERLAY");
    assert.equal(saved["sample_backup_01.png"], "OLD_MAIN"); assert.equal(saved["sample_backup_02.png"], "OLDER_MAIN");
    assert.equal(saved["sample_overlay_backup_01.png"], "OLD_OVERLAY"); cases++;
  }
  {
    let restoring = false;
    const f = fixture({ fault: (event, name) => {
      if (event === "close" && name === "sample_overlay.png" && !restoring) { restoring = true; throw new Error("output failed"); }
      if (restoring && event === "write" && name === "sample.png") throw new Error("rollback failed");
    } });
    await assert.rejects(f.run(), /recovery.*sbe-recovery/i);
    assert.equal(await f.files.get(".sbe-recovery-test-id/sample.png").text(), "OLD_MAIN"); cases++;
  }
  {
    const f = fixture({ existing: false, fault: (event, name) => {
      if (event === "close" && name === "sample_overlay.png") throw new Error("output failed");
      if (event === "remove" && name === "sample.png") throw new Error("remove failed");
    } });
    await assert.rejects(f.run(), error => /incomplete files/.test(error.message) && /sample.png/.test(error.message) && !/sbe-recovery/.test(error.message));
    cases++;
  }
  console.log(`client_export_integrity_test: OK (${cases} download/write/backup/rollback cases)`);
})().catch(error => { console.error(error); process.exitCode = 1; });
