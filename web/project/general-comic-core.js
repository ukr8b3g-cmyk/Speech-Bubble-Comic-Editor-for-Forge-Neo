(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SpeechBubbleGeneralComicCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const CURRENT_STATE_VERSION = 1;
  const TEMPLATE_IDS = new Set(["standard_five", "equal_six", "main_focus"]);
  const PUBLIC_TEMPLATE_IDS = new Set(TEMPLATE_IDS);
  const MIN_PANEL_SIZE = 64, MAX_NODES = 127, MAX_DEPTH = 24, MAX_CANVAS_SIZE = 32768;
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, finite(value, minimum)));
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const makeDefaultId = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : fallback;
  const normalizeImageCrop = (value = {}) => { const x = clamp(value?.x ?? 0, 0, .99), y = clamp(value?.y ?? 0, 0, .99); return { x, y, w: clamp(value?.w ?? 1, .01, 1 - x), h: clamp(value?.h ?? 1, .01, 1 - y) }; };

  function panelNode(makeId = makeDefaultId, values = {}) {
    return { kind: "panel", id: String(values.id || `general-panel-${makeId()}`), visible: values.visible !== false,
      locked: values.locked === true, image_id: values.image_id ? String(values.image_id) : null,
      image_visible: values.image_visible !== false, image_locked: values.image_locked === true,
      fit: values.fit === "contain" ? "contain" : "cover", image_scale: clamp(values.image_scale ?? 1, .05, 20),
      image_offset_x: finite(values.image_offset_x), image_offset_y: finite(values.image_offset_y), image_rotation: Math.round(clamp(values.image_rotation ?? 0, -180, 180)), image_crop: normalizeImageCrop(values.image_crop),
      background: color(values.background, "#ffffff"),
      background_pattern: values.background_pattern && typeof values.background_pattern === "object" && !Array.isArray(values.background_pattern)
        ? clone(values.background_pattern) : null };
  }
  function splitNode(axis, ratio, first, second, makeId = makeDefaultId, values = {}) {
    const center = clamp(ratio ?? .5, .01, .99);
    return { kind: "split", id: String(values.id || `general-split-${makeId()}`), axis: axis === "y" ? "y" : "x",
      ratio: center, divider_start_ratio: clamp(values.divider_start_ratio ?? center, .01, .99),
      divider_end_ratio: clamp(values.divider_end_ratio ?? center, .01, .99), first, second };
  }
  function createTemplate(templateId = "standard_five", makeId = makeDefaultId) {
    const selected = TEMPLATE_IDS.has(templateId) ? templateId : "standard_five";
    if (selected === "standard_five") return splitNode("y", .33, panelNode(makeId), splitNode("y", .5,
      splitNode("x", .5, panelNode(makeId), panelNode(makeId), makeId),
      splitNode("x", .5, panelNode(makeId), panelNode(makeId), makeId), makeId), makeId);
    if (selected === "equal_six") return splitNode("y", 1 / 3,
      splitNode("x", .5, panelNode(makeId), panelNode(makeId), makeId),
      splitNode("y", .5, splitNode("x", .5, panelNode(makeId), panelNode(makeId), makeId),
        splitNode("x", .5, panelNode(makeId), panelNode(makeId), makeId), makeId), makeId);
    return splitNode("y", .52, panelNode(makeId), splitNode("y", .52,
      splitNode("x", .5, panelNode(makeId), panelNode(makeId), makeId), panelNode(makeId), makeId), makeId);
  }
  function defaultPage(width = 2480, height = 3508) {
    return { width: clamp(Math.round(finite(width, 2480)), 320, MAX_CANVAS_SIZE), height: clamp(Math.round(finite(height, 3508)), 480, MAX_CANVAS_SIZE),
      background: "#ffffff", border_color: "#111111", border_width: 4.5, gutter: 60,
      margin_top: 96, margin_right: 96, margin_bottom: 96, margin_left: 96,
      margin_linked: true, structure_locked: false, print_guides_visible: false };
  }
  function defaultState(width = 2480, height = 3508, makeId = makeDefaultId, templateId = "standard_five") {
    const selected = TEMPLATE_IDS.has(templateId) ? templateId : "standard_five";
    return { version: 1, enabled: false, created: false, template_id: selected,
      page: defaultPage(width, height), tree: createTemplate(selected, makeId), images: [] };
  }
  function normalizeTree(raw, makeId = makeDefaultId) {
    let count = 0; const ids = new Set();
    const unique = (prefix, requested) => { let id = String(requested || `${prefix}-${makeId()}`); while (ids.has(id)) id = `${prefix}-${makeId()}`; ids.add(id); return id; };
    function visit(node, depth = 0) {
      if (++count > MAX_NODES || depth > MAX_DEPTH) throw new Error("General comic panel tree is too large");
      if (!node || typeof node !== "object" || Array.isArray(node) || node.kind !== "split") {
        const result = panelNode(makeId, node && typeof node === "object" ? node : {}); result.id = unique("general-panel", result.id); return result;
      }
      const result = splitNode(node.axis, node.ratio, null, null, makeId, node); result.id = unique("general-split", result.id);
      result.first = visit(node.first, depth + 1); result.second = visit(node.second, depth + 1); return result;
    }
    return visit(raw);
  }
  function normalizeImages(value) {
    const seen = new Set(), output = [];
    for (const source of (Array.isArray(value) ? value : []).slice(0, 200)) {
      if (!source || typeof source !== "object" || !source.id || seen.has(String(source.id))) continue;
      const id = String(source.id); seen.add(id); output.push({ id, name: String(source.name || "image").slice(0, 260),
        mime: /^image\/(?:png|jpeg|webp)$/i.test(String(source.mime || "")) ? String(source.mime) : "image/png",
        width: Math.max(1, Math.round(finite(source.width, 1))), height: Math.max(1, Math.round(finite(source.height, 1))),
        sha256: /^[0-9a-f]{64}$/i.test(String(source.sha256 || "")) ? String(source.sha256).toLowerCase() : "", source: "stored" });
    }
    return output;
  }
  function normalizeState(raw, options = {}) {
    const makeId = options.makeId || makeDefaultId, width = options.width || 2480, height = options.height || 3508;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultState(width, height, makeId, options.templateId);
    const version = raw.version == null ? 1 : Number(raw.version);
    if (!Number.isInteger(version) || version < 1) throw new Error("Invalid general comic state version");
    if (version > CURRENT_STATE_VERSION) throw new Error(`Unsupported general comic state version: ${version}`);
    const page = raw.page && typeof raw.page === "object" ? raw.page : {}, defaults = defaultPage(width, height);
    const templateId = TEMPLATE_IDS.has(raw.template_id) ? raw.template_id : "standard_five";
    return { version: 1, enabled: raw.enabled === true, created: raw.created === true, template_id: templateId,
      page: { width: clamp(Math.round(finite(page.width, width)), 320, MAX_CANVAS_SIZE), height: clamp(Math.round(finite(page.height, height)), 480, MAX_CANVAS_SIZE),
        background: color(page.background, defaults.background), border_color: color(page.border_color, defaults.border_color),
        border_width: clamp(page.border_width ?? defaults.border_width, 0, 128), gutter: clamp(page.gutter ?? defaults.gutter, 0, 2048),
        margin_top: clamp(page.margin_top ?? defaults.margin_top, 0, 2048), margin_right: clamp(page.margin_right ?? defaults.margin_right, 0, 2048),
        margin_bottom: clamp(page.margin_bottom ?? defaults.margin_bottom, 0, 2048), margin_left: clamp(page.margin_left ?? defaults.margin_left, 0, 2048),
        margin_linked: page.margin_linked !== false, structure_locked: page.structure_locked === true,
        print_guides_visible: page.print_guides_visible === true },
      tree: normalizeTree(raw.tree || createTemplate(templateId, makeId), makeId), images: normalizeImages(raw.images) };
  }
  function findNode(node, id) { return !node || !id ? null : node.id === id ? node : node.kind === "split" ? findNode(node.first, id) || findNode(node.second, id) : null; }
  function findParent(node, id, parent = null) { return !node || !id ? null : node.id === id ? parent : node.kind === "split" ? findParent(node.first, id, node) || findParent(node.second, id, node) : null; }
  function collectPanels(node, output = []) { if (!node) return output; if (node.kind === "split") { collectPanels(node.first, output); collectPanels(node.second, output); } else output.push(node); return output; }
  function minimumSize(node, gutter = 0) { if (!node) return null; if (node.kind !== "split") return node.visible === false ? null : { width: MIN_PANEL_SIZE, height: MIN_PANEL_SIZE }; const a = minimumSize(node.first, gutter), b = minimumSize(node.second, gutter); if (!a) return b; if (!b) return a; return node.axis === "x" ? { width: a.width + gutter + b.width, height: Math.max(a.height, b.height) } : { width: Math.max(a.width, b.width), height: a.height + gutter + b.height }; }
  function ratioRange(node, rect, gutter = 0) { const a = minimumSize(node.first, gutter), b = minimumSize(node.second, gutter); if (!a || !b) return { minimum: .01, maximum: .99 }; const usable = Math.max(1, (node.axis === "x" ? rect.w : rect.h) - gutter); let minimum = clamp((node.axis === "x" ? a.width : a.height) / usable, .01, .99), maximum = clamp(1 - (node.axis === "x" ? b.width : b.height) / usable, .01, .99); if (minimum > maximum) minimum = maximum = clamp((minimum + maximum) / 2, .01, .99); return { minimum, maximum }; }
  const rectPolygon = (rect) => [{ x: rect.x, y: rect.y }, { x: rect.x + rect.w, y: rect.y }, { x: rect.x + rect.w, y: rect.y + rect.h }, { x: rect.x, y: rect.y + rect.h }];
  function polygonBounds(polygon) { const xs = polygon.map((point) => point.x), ys = polygon.map((point) => point.y); const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(0, Math.max(...xs) - x), h: Math.max(0, Math.max(...ys) - y) }; }
  function pointInPolygon(point, polygon) { let inside = false; for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) { const a = polygon[index], b = polygon[previous], crosses = (a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || Number.EPSILON) + a.x; if (crosses) inside = !inside; } return inside; }
  function clipPolygon(polygon, signedDistance, minimum = 0) {
    const output = [];
    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index], previous = polygon[(index + polygon.length - 1) % polygon.length], currentDistance = signedDistance(current) - minimum, previousDistance = signedDistance(previous) - minimum, currentInside = currentDistance >= -1e-7, previousInside = previousDistance >= -1e-7;
      if (currentInside !== previousInside) { const amount = previousDistance / (previousDistance - currentDistance || Number.EPSILON); output.push({ x: previous.x + (current.x - previous.x) * amount, y: previous.y + (current.y - previous.y) * amount }); }
      if (currentInside) output.push({ x: current.x, y: current.y });
    }
    return output;
  }
  function lineDistance(point, line) { const dx = line.x2 - line.x1, dy = line.y2 - line.y1, lengthSquared = dx * dx + dy * dy; if (lengthSquared <= Number.EPSILON) return Math.hypot(point.x - line.x1, point.y - line.y1); const amount = clamp(((point.x - line.x1) * dx + (point.y - line.y1) * dy) / lengthSquared, 0, 1); return Math.hypot(point.x - (line.x1 + amount * dx), point.y - (line.y1 + amount * dy)); }
  function clipLineToPolygon(line, polygon) {
    const dx = line.x2 - line.x1, dy = line.y2 - line.y1, hits = [];
    for (let index = 0; index < polygon.length; index += 1) { const a = polygon[index], b = polygon[(index + 1) % polygon.length], ex = b.x - a.x, ey = b.y - a.y, denominator = dx * ey - dy * ex; if (Math.abs(denominator) < 1e-9) continue; const ax = a.x - line.x1, ay = a.y - line.y1, t = (ax * ey - ay * ex) / denominator, u = (ax * dy - ay * dx) / denominator; if (t >= -1e-7 && t <= 1 + 1e-7 && u >= -1e-7 && u <= 1 + 1e-7) hits.push({ t, x: line.x1 + t * dx, y: line.y1 + t * dy }); }
    hits.sort((a, b) => a.t - b.t); const unique = hits.filter((item, index) => !index || Math.hypot(item.x - hits[index - 1].x, item.y - hits[index - 1].y) > 1e-5); return unique.length >= 2 ? { x1: unique[0].x, y1: unique[0].y, x2: unique.at(-1).x, y2: unique.at(-1).y } : line;
  }
  function splitPolygon(polygon, rect, axis, startRatio, endRatio, gutter) {
    const dimension = Math.max(1, axis === "x" ? rect.w : rect.h), usable = Math.max(1, dimension - gutter), toCenterRatio = (ratio) => (gutter / 2 + usable * clamp(ratio, .01, .99)) / dimension, start = toCenterRatio(startRatio), end = toCenterRatio(endRatio), line = axis === "x"
      ? { x1: rect.x + rect.w * start, y1: rect.y, x2: rect.x + rect.w * end, y2: rect.y + rect.h }
      : { x1: rect.x, y1: rect.y + rect.h * start, x2: rect.x + rect.w, y2: rect.y + rect.h * end };
    const dx = line.x2 - line.x1, dy = line.y2 - line.y1, length = Math.max(Number.EPSILON, Math.hypot(dx, dy)), firstSign = axis === "x" ? 1 : -1;
    const firstDistance = (point) => firstSign * (dx * (point.y - line.y1) - dy * (point.x - line.x1)) / length;
    return { first: clipPolygon(polygon, firstDistance, gutter / 2), second: clipPolygon(polygon, (point) => -firstDistance(point), gutter / 2), line: clipLineToPolygon(line, polygon) };
  }
  function dividerAngleDegrees(divider, startRatio = divider?.startRatio, endRatio = divider?.endRatio, gutter = 0) {
    if (!divider?.parentRect) return 0;
    const rect = divider.parentRect, axis = divider.axis === "y" ? "y" : "x", usable = Math.max(1, (axis === "x" ? rect.w : rect.h) - gutter), delta = (finite(endRatio, .5) - finite(startRatio, .5)) * usable;
    return axis === "y" ? Math.atan2(delta, Math.max(1, rect.w)) * 180 / Math.PI : Math.atan2(Math.max(1, rect.h), delta) * 180 / Math.PI;
  }
  function snapDividerEndpointToAngle(divider, endpoint, rawRatio, gutter = 0, stepDegrees = 15) {
    if (!divider?.parentRect) return { ratio: rawRatio, angle: 0 };
    const rect = divider.parentRect, axis = divider.axis === "y" ? "y" : "x", range = ratioRange(divider.node, rect, gutter), step = Math.max(1, Math.abs(finite(stepDegrees, 15))), start = endpoint === "start" ? rawRatio : divider.startRatio, end = endpoint === "end" ? rawRatio : divider.endRatio, angle = dividerAngleDegrees(divider, start, end, gutter), snappedAngle = Math.round(angle / step) * step, radians = snappedAngle * Math.PI / 180, usable = Math.max(1, (axis === "x" ? rect.w : rect.h) - gutter);
    let delta = axis === "y" ? Math.tan(radians) * rect.w / usable : Math.abs(Math.tan(radians)) < 1e-9 ? end - start : rect.h / Math.tan(radians) / usable;
    if (!Number.isFinite(delta)) delta = end - start;
    const ratio = endpoint === "start" ? end - delta : start + delta;
    return { ratio: clamp(ratio, range.minimum, range.maximum), angle: snappedAngle };
  }
  function dividerStraightDistancePx(divider, zoom = 1, gutter = 0) { if (!divider?.parentRect) return Infinity; const dimension = divider.axis === "x" ? divider.parentRect.w : divider.parentRect.h, usable = Math.max(1, dimension - gutter); return Math.abs(divider.endRatio - divider.startRatio) * usable * Math.max(.01, finite(zoom, 1)); }
  function computeLayout(tree, rect, gutter = 0) {
    const panels = [], dividers = [], clean = Math.max(0, finite(gutter));
    function visit(node, current, polygon, depth = 0) {
      if (!node || depth > MAX_DEPTH) return false;
      if (node.kind !== "split") { if (node.visible === false || polygon.length < 3) return false; panels.push({ id: node.id, node, rect: polygonBounds(polygon), polygon: clone(polygon) }); return true; }
      const firstVisible = minimumSize(node.first, clean), secondVisible = minimumSize(node.second, clean);
      if (!firstVisible && !secondVisible) return false;
      if (!firstVisible) return visit(node.second, current, polygon, depth + 1);
      if (!secondVisible) return visit(node.first, current, polygon, depth + 1);
      const range = ratioRange(node, current, clean), startRatio = clamp(node.divider_start_ratio ?? node.ratio, range.minimum, range.maximum), endRatio = clamp(node.divider_end_ratio ?? node.ratio, range.minimum, range.maximum), result = splitPolygon(polygon, current, node.axis, startRatio, endRatio, clean), line = result.line, lineBounds = polygonBounds([{ x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 }]), hitPadding = Math.max(8, clean / 2), hitRect = { x: lineBounds.x - hitPadding, y: lineBounds.y - hitPadding, w: lineBounds.w + hitPadding * 2, h: lineBounds.h + hitPadding * 2 };
      dividers.push({ id: node.id, node, axis: node.axis, parentRect: { ...current }, parentPolygon: clone(polygon), ratio: (startRatio + endRatio) / 2, startRatio, endRatio, line, hitRect, hitTolerance: Math.max(12, clean / 2) });
      visit(node.first, polygonBounds(result.first), result.first, depth + 1); visit(node.second, polygonBounds(result.second), result.second, depth + 1); return true;
    }
    visit(tree, rect, rectPolygon(rect)); return { panels, dividers };
  }
  const pointInRect = (point, rect) => Boolean(point && rect && point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h);
  const panelAtPoint = (layout, point) => [...(layout?.panels || [])].reverse().find((item) => item.node?.visible !== false && pointInPolygon(point, item.polygon || rectPolygon(item.rect))) || null;
  const dividerAtPoint = (layout, point, tolerance = 12) => [...(layout?.dividers || [])].reverse().find((item) => pointInPolygon(point, item.parentPolygon || rectPolygon(item.parentRect)) && lineDistance(point, item.line) <= Math.max(tolerance, item.hitTolerance || 1)) || null;
  function dividerHandleAtPoint(layout, point, radius = 18) { for (const item of [...(layout?.dividers || [])].reverse()) { if (Math.hypot(point.x - item.line.x1, point.y - item.line.y1) <= radius) return { divider: item, endpoint: "start" }; if (Math.hypot(point.x - item.line.x2, point.y - item.line.y2) <= radius) return { divider: item, endpoint: "end" }; } return null; }
  function setSplitRatio(tree, splitId, ratio) { const next = clone(tree), target = findNode(next, splitId); if (!target || target.kind !== "split") return { changed: false, tree: next }; const value = clamp(ratio, .01, .99), previousStart = target.divider_start_ratio ?? target.ratio, previousEnd = target.divider_end_ratio ?? target.ratio; if (Math.abs(previousStart - value) < 1e-9 && Math.abs(previousEnd - value) < 1e-9) return { changed: false, tree: next }; target.ratio = value; target.divider_start_ratio = value; target.divider_end_ratio = value; return { changed: true, tree: next }; }
  function setSplitRatios(tree, splitId, startRatio, endRatio) { const next = clone(tree), target = findNode(next, splitId); if (!target || target.kind !== "split") return { changed: false, tree: next }; const start = clamp(startRatio, .01, .99), end = clamp(endRatio, .01, .99), previousStart = target.divider_start_ratio ?? target.ratio, previousEnd = target.divider_end_ratio ?? target.ratio; if (Math.abs(previousStart - start) < 1e-9 && Math.abs(previousEnd - end) < 1e-9) return { changed: false, tree: next }; target.divider_start_ratio = start; target.divider_end_ratio = end; target.ratio = (start + end) / 2; return { changed: true, tree: next }; }
  function splitPanel(tree, panelId, axis, makeId = makeDefaultId) { const next = clone(tree); let result = null; function visit(node) { if (node.kind !== "split") { if (node.id !== panelId) return node; const original = panelNode(makeId, node); original.id = node.id; const sibling = panelNode(makeId, { background: node.background, background_pattern: node.background_pattern }); const split = splitNode(axis, .5, original, sibling, makeId); result = { changed: true, splitId: split.id, panelId: original.id, siblingId: sibling.id }; return split; } node.first = visit(node.first); if (!result) node.second = visit(node.second); return node; } const changed = visit(next); return result ? { ...result, tree: changed } : { changed: false, tree: next }; }
  function mergeDivider(tree, splitId, keep = "first") { const next = clone(tree); let result = null; function visit(node) { if (!node || node.kind !== "split") return node; if (node.id === splitId) { if (node.first?.kind === "split" || node.second?.kind === "split") return node; const kept = keep === "second" ? node.second : node.first, removed = keep === "second" ? node.first : node.second; result = { changed: true, keptPanelId: kept.id, removedPanelIds: collectPanels(removed).map((item) => item.id) }; return panelNode(makeDefaultId, kept); } node.first = visit(node.first); if (!result) node.second = visit(node.second); return node; } const changed = visit(next); return result ? { ...result, tree: changed } : { changed: false, tree: next }; }
  const pageContentRect = (page) => ({ x: page.margin_left, y: page.margin_top, w: Math.max(1, page.width - page.margin_left - page.margin_right), h: Math.max(1, page.height - page.margin_top - page.margin_bottom) });
  function readingOrder(layout, tolerance = 24) { return [...(layout?.panels || [])].sort((a, b) => Math.abs(a.rect.y - b.rect.y) > tolerance ? a.rect.y - b.rect.y : (b.rect.x + b.rect.w) - (a.rect.x + a.rect.w)); }
  return Object.freeze({ CURRENT_STATE_VERSION, TEMPLATE_IDS, PUBLIC_TEMPLATE_IDS, MIN_PANEL_SIZE, MAX_NODES, clone, finite, clamp, normalizeImageCrop, panelNode, splitNode, createTemplate, defaultPage, defaultState, normalizeTree, normalizeState, findNode, findParent, collectPanels, minimumSize, ratioRange, rectPolygon, polygonBounds, pointInPolygon, clipPolygon, lineDistance, splitPolygon, dividerAngleDegrees, snapDividerEndpointToAngle, dividerStraightDistancePx, computeLayout, pageContentRect, pointInRect, panelAtPoint, dividerAtPoint, dividerHandleAtPoint, setSplitRatio, setSplitRatios, splitPanel, mergeDivider, readingOrder });
});
