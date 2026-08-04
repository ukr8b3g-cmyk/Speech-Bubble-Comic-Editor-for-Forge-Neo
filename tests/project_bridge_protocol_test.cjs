const assert = require("node:assert/strict");
const protocol = require("../web/project/project-bridge-protocol.js");

assert.equal(protocol.VERSION, 1);
const request = protocol.galleryRequest("txt2img");
assert.equal(request.type, protocol.TYPES.REQUEST_GALLERY_IMAGE);
assert.equal(request.tab, "txt2img");
assert.ok(request.requestId);
assert.equal(protocol.isMessage(request, protocol.TYPES.REQUEST_GALLERY_IMAGE), true);
assert.equal(protocol.isMessage({ ...request, protocolVersion: 2 }), false);

const blob = new Blob(["abc"], { type: "image/png" });
const success = protocol.gallerySuccess(request.requestId, {
  blob,
  name: "test.png",
  mime: "image/png",
  width: 1,
  height: 1,
  sourceTab: "txt2img",
});
assert.equal(success.ok, true);
assert.equal(success.image.blob.size, 3);

const failure = protocol.galleryFailure(request.requestId, new Error("failed"));
assert.equal(failure.ok, false);
assert.equal(failure.error, "failed");

console.log("project_bridge_protocol_test: OK");
