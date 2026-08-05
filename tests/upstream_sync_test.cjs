"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");

const manifest = JSON.parse(fs.readFileSync("UPSTREAM_SYNC.json", "utf8"));
assert.equal(manifest.schema_version, 1);
assert.match(manifest.upstream.commit, /^[0-9a-f]{40}$/);
assert.ok(manifest.exact_files.length >= 4);

for (const entry of manifest.exact_files) {
  const content = fs.readFileSync(entry.forge);
  const sha256 = crypto.createHash("sha256").update(content).digest("hex");
  assert.equal(sha256, entry.sha256, `${entry.forge} drifted from the recorded upstream revision`);
}

console.log("upstream_sync_test: OK");
