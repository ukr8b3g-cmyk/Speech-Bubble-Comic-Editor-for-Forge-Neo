const assert = require("node:assert/strict");
const core = require("../web/legacy/comic-panels.js");

let nextId = 0;
const makeId = () => String(++nextId);
const page = { x: 0, y: 0, w: 1200, h: 1600 };

function verifyTemplate(id, expectedPanels) {
  nextId = 0;
  const tree = core.createTemplate(id, makeId);
  const layout = core.computeLayout(tree, page, 16);
  assert.equal(layout.panels.length, expectedPanels);
  for (const panel of layout.panels) {
    assert.ok(panel.rect.w >= core.MIN_PANEL_SIZE);
    assert.ok(panel.rect.h >= core.MIN_PANEL_SIZE);
    assert.ok(panel.rect.x >= 0 && panel.rect.y >= 0);
    assert.ok(panel.rect.x + panel.rect.w <= page.w + 1e-6);
    assert.ok(panel.rect.y + panel.rect.h <= page.h + 1e-6);
  }
}

verifyTemplate("vertical_four", 4);
verifyTemplate("two_column_sample", 5);
verifyTemplate("blank", 1);

nextId = 0;
let tree = core.createTemplate("blank", makeId);
const originalId = tree.id;
let result = core.splitPanel(tree, originalId, "x", makeId);
assert.equal(result.changed, true);
tree = result.tree;
assert.equal(core.computeLayout(tree, page, 16).panels.length, 2);
result = core.mergeSibling(tree, result.panelId, result.panelId, makeId);
assert.equal(result.changed, true);
tree = result.tree;
assert.equal(core.computeLayout(tree, page, 16).panels.length, 1);

nextId = 0;
tree = core.createTemplate("blank", makeId);
result = core.splitPanel(tree, tree.id, "y", makeId);
tree = result.tree;
const first = core.findNode(tree, result.panelId);
const second = core.findNode(tree, result.siblingId);
first.image_id = "first-image";
second.image_id = "second-image";
first.tone = core.defaultTone();
result = core.mergeSibling(tree, first.id, first.id, makeId);
assert.equal(result.changed, true);
assert.equal(result.tree.image_id, "first-image");
assert.equal(result.tree.tone.type, "halftone_dots");

const tone = core.normalizeTone({
  type: "halftone_dots",
  dot_size: 80,
  spacing: 10,
  opacity: 2,
});
assert.equal(tone.dot_size, 9.5);
assert.equal(tone.opacity, 1);

const cover = core.imageFit({ x: 0, y: 0, w: 100, h: 100 }, 200, 100, "cover", 1, 0, 0);
assert.equal(cover.w, 200);
assert.equal(cover.h, 100);
assert.equal(cover.x, -50);
const contain = core.imageFit({ x: 0, y: 0, w: 100, h: 100 }, 200, 100, "contain", 1, 0, 0);
assert.equal(contain.w, 100);
assert.equal(contain.h, 50);
assert.equal(contain.y, 25);

const malformed = core.normalizeState(
  {
    enabled: true,
    page: { gutter: 999, border_width: -3 },
    tree: { kind: "split", axis: "bad", ratio: Number.NaN, first: {}, second: {} },
  },
  { width: 800, height: 600, makeId },
);
assert.equal(malformed.enabled, true);
assert.equal(malformed.page.gutter, 64);
assert.equal(malformed.page.border_width, 0);
assert.equal(malformed.tree.axis, "x");

console.log("comic_panels_core_test: OK");
