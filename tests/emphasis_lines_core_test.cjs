const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync(
  "web/speech-bubble-editor.html",
  "utf8",
);
const coreMatch = html.match(
  /\/\/ Emphasis Lines core start([\s\S]*?)\/\/ Emphasis Lines core end/,
);
assert(coreMatch, "Emphasis Lines core block must exist");

const context = {};
vm.runInNewContext(
  `${coreMatch[1]}
globalThis.EmphasisLinesCore = {
  EMPHASIS_EDGE_OVERSHOOT,
  EMPHASIS_PRESETS,
  EMPHASIS_GEOMETRY_KEYS,
  normalizeEmphasisParams,
  generateNormalizedEmphasisRays,
  validEmphasisRays
};`,
  context,
);
const Core = context.EmphasisLinesCore;

assert.strictEqual(Core.EMPHASIS_PRESETS.length, 4);
assert.strictEqual(Core.EMPHASIS_EDGE_OVERSHOOT, 0.035);
for (const key of ["inner_random", "seed", "w", "h"]) {
  assert(Core.EMPHASIS_GEOMETRY_KEYS.has(key));
}
for (const key of ["color", "opacity", "overshoot", "visible"]) {
  assert(!Core.EMPHASIS_GEOMETRY_KEYS.has(key));
}
for (const preset of Core.EMPHASIS_PRESETS) {
  assert(!Object.hasOwn(preset, "overshoot"));
  assert.strictEqual(preset.line_length, 1);
  assert.strictEqual(preset.length_random, 0);
  assert.strictEqual(preset.inner_random, 0.5);
  assert.strictEqual(preset.taper, 1);
  const source = {...preset, preset: preset.id, seed: 1234};
  const first = Core.generateNormalizedEmphasisRays(source, 1024, 1024);
  const second = Core.generateNormalizedEmphasisRays(source, 1024, 1024);
  assert.deepStrictEqual(first, second);
  assert(first.length > 0, `${preset.id} must generate rays`);
  assert(Core.validEmphasisRays(first));
}

const seedOne = Core.generateNormalizedEmphasisRays(
  {...Core.EMPHASIS_PRESETS[0], preset: "center", seed: 1},
  1024,
  1024,
);
const seedTwo = Core.generateNormalizedEmphasisRays(
  {...Core.EMPHASIS_PRESETS[0], preset: "center", seed: 2},
  1024,
  1024,
);
assert.notDeepStrictEqual(seedOne, seedTwo);
const maximumRays = Core.generateNormalizedEmphasisRays(
  {
    ...Core.EMPHASIS_PRESETS[0],
    preset: "center",
    line_count: 500,
    seed: 3,
  },
  1024,
  1024,
);
assert(maximumRays.length > 0 && maximumRays.length <= 500);

const flatSource = {
  ...Core.EMPHASIS_PRESETS[0],
  preset: "center",
  seed: 987654321,
  inner_random: 0,
  line_length: 1,
  length_random: 0,
};
const flatRays = Core.generateNormalizedEmphasisRays(
  flatSource,
  1024,
  1024,
);
const randomRays = Core.generateNormalizedEmphasisRays(
  {...flatSource, inner_random: 0.5},
  1024,
  1024,
);
assert.strictEqual(flatRays.length, randomRays.length);
let innerChanged = false;
for (let index = 0; index < flatRays.length; index += 1) {
  assert.deepStrictEqual(flatRays[index][1], randomRays[index][1]);
  assert.deepStrictEqual(flatRays[index][2], randomRays[index][2]);
  if (
    JSON.stringify(flatRays[index][0])
      !== JSON.stringify(randomRays[index][0])
    || JSON.stringify(flatRays[index][3])
      !== JSON.stringify(randomRays[index][3])
  ) {
    innerChanged = true;
  }
}
assert(innerChanged, "Center Random must change an inner endpoint");
assert.strictEqual(
  Core.normalizeEmphasisParams({
    ...Core.EMPHASIS_PRESETS[0],
    preset: "center",
    overshoot: 0.12,
  }).overshoot,
  Core.EMPHASIS_EDGE_OVERSHOOT,
);

const framesIndex = html.indexOf('data-left-section="frames"');
const emphasisIndex = html.indexOf('data-left-section="emphasis"');
const textIndex = html.indexOf('id="addText"');
assert(framesIndex < emphasisIndex && emphasisIndex < textIndex);
for (const requiredId of [
  "quickEmphasisLines",
  "emphasisProps",
  "emphasisColorSwatches",
  "emphasisRandomDetails",
  "emphasisCenterDetails",
  "newEmphasisSeed",
  "resetEmphasisCenter",
]) {
  assert(html.includes(`id="${requiredId}"`), `${requiredId} must exist`);
}
assert(!html.includes('data-key="overshoot"'));
assert(!html.includes('id="regenerateEmphasisLines"'));
assert(!/<details id="emphasis(?:Random|Center)Details"[^>]*\sopen(?:\s|>)/.test(html));
const emphasisProps = html.match(
  /<div id="emphasisProps" hidden>([\s\S]*?)\n        <\/div>\n        <details id="transformDetails"/,
)?.[1] || "";
assert.strictEqual(
  (emphasisProps.match(/class="emphasis-control-row"/g) || []).length,
  13,
);

console.log("emphasis_lines_core_test: OK");
