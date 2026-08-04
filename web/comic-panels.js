(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SpeechBubbleComicCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TEMPLATE_IDS = new Set(["vertical_four", "two_column_sample", "blank"]);
  const MAX_NODES = 63;
  const MIN_PANEL_SIZE = 64;

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, finite(value, minimum)));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function defaultId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `comic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function panelNode(makeId = defaultId, values = {}) {
    return {
      kind: "panel",
      id: String(values.id || `panel-${makeId()}`),
      image_id: values.image_id ? String(values.image_id) : null,
      fit: values.fit === "contain" ? "contain" : "cover",
      image_scale: clamp(finite(values.image_scale, 1), 0.05, 20),
      image_offset_x: finite(values.image_offset_x, 0),
      image_offset_y: finite(values.image_offset_y, 0),
      background: /^#[0-9a-f]{6}$/i.test(String(values.background || ""))
        ? String(values.background)
        : "#ffffff",
      tone: normalizeTone(values.tone),
    };
  }

  function splitNode(axis, ratio, first, second, makeId = defaultId) {
    return {
      kind: "split",
      id: `split-${makeId()}`,
      axis: axis === "y" ? "y" : "x",
      ratio: clamp(finite(ratio, 0.5), 0.01, 0.99),
      first,
      second,
    };
  }

  function createTemplate(templateId = "blank", makeId = defaultId) {
    const selected = TEMPLATE_IDS.has(templateId) ? templateId : "blank";
    if (selected === "vertical_four") {
      return splitNode(
        "y",
        0.25,
        panelNode(makeId),
        splitNode(
          "y",
          1 / 3,
          panelNode(makeId),
          splitNode("y", 0.5, panelNode(makeId), panelNode(makeId), makeId),
          makeId,
        ),
        makeId,
      );
    }
    if (selected === "two_column_sample") {
      return splitNode(
        "x",
        0.5,
        splitNode("y", 0.5, panelNode(makeId), panelNode(makeId), makeId),
        splitNode(
          "y",
          1 / 3,
          panelNode(makeId),
          splitNode("y", 0.5, panelNode(makeId), panelNode(makeId), makeId),
          makeId,
        ),
        makeId,
      );
    }
    return panelNode(makeId);
  }

  function normalizeTone(value) {
    if (!value || value.type !== "halftone_dots") return null;
    const spacing = clamp(finite(value.spacing, 12), 4, 64);
    return {
      type: "halftone_dots",
      dot_size: clamp(finite(value.dot_size, 6), 1, spacing * 0.95),
      spacing,
      opacity: clamp(finite(value.opacity, 0.65), 0, 1),
      offset_x: finite(value.offset_x, 0),
      offset_y: finite(value.offset_y, 0),
      color: /^#[0-9a-f]{6}$/i.test(String(value.color || ""))
        ? String(value.color)
        : "#000000",
    };
  }

  function defaultTone() {
    return normalizeTone({
      type: "halftone_dots",
      dot_size: 6,
      spacing: 12,
      opacity: 0.65,
      color: "#000000",
    });
  }

  function normalizeTree(raw, makeId = defaultId) {
    let count = 0;
    const ids = new Set();
    function unique(prefix, requested) {
      let value = String(requested || `${prefix}-${makeId()}`);
      while (ids.has(value)) value = `${prefix}-${makeId()}`;
      ids.add(value);
      return value;
    }
    function visit(node, depth = 0) {
      count += 1;
      if (count > MAX_NODES || depth > 16) throw new Error("Comic panel tree is too large");
      if (!node || typeof node !== "object" || Array.isArray(node)) return panelNode(makeId);
      if (node.kind !== "split") {
        const clean = panelNode(makeId, node);
        clean.id = unique("panel", clean.id);
        return clean;
      }
      const clean = {
        kind: "split",
        id: unique("split", node.id),
        axis: node.axis === "y" ? "y" : "x",
        ratio: clamp(finite(node.ratio, 0.5), 0.01, 0.99),
        first: null,
        second: null,
      };
      clean.first = visit(node.first, depth + 1);
      clean.second = visit(node.second, depth + 1);
      return clean;
    }
    return visit(raw);
  }

  function defaultState(width = 1024, height = 1024, makeId = defaultId) {
    return {
      version: 1,
      enabled: false,
      template_id: "blank",
      page: {
        width: Math.max(1, Math.round(finite(width, 1024))),
        height: Math.max(1, Math.round(finite(height, 1024))),
        background: "#ffffff",
        border_color: "#111111",
        border_width: 4,
        gutter: 16,
      },
      tree: createTemplate("blank", makeId),
      images: [],
    };
  }

  function normalizeState(raw, options = {}) {
    const makeId = options.makeId || defaultId;
    const fallback = defaultState(options.width, options.height, makeId);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
    const page = raw.page && typeof raw.page === "object" ? raw.page : {};
    const images = Array.isArray(raw.images)
      ? raw.images
          .slice(0, 100)
          .filter((item) => item && typeof item === "object" && item.id)
          .map((item) => ({
            id: String(item.id),
            name: String(item.name || "image").slice(0, 260),
            mime: /^image\/(?:png|jpeg|webp)$/i.test(String(item.mime || ""))
              ? String(item.mime)
              : "image/png",
            width: Math.max(1, Math.round(finite(item.width, 1))),
            height: Math.max(1, Math.round(finite(item.height, 1))),
            sha256: /^[0-9a-f]{64}$/i.test(String(item.sha256 || ""))
              ? String(item.sha256).toLowerCase()
              : "",
            source: item.source === "document" ? "document" : "stored",
          }))
      : [];
    return {
      version: 1,
      enabled: raw.enabled === true,
      template_id: TEMPLATE_IDS.has(raw.template_id) ? raw.template_id : "blank",
      page: {
        width: Math.max(1, Math.round(finite(page.width, options.width || 1024))),
        height: Math.max(1, Math.round(finite(page.height, options.height || 1024))),
        background: /^#[0-9a-f]{6}$/i.test(String(page.background || ""))
          ? String(page.background)
          : "#ffffff",
        border_color: /^#[0-9a-f]{6}$/i.test(String(page.border_color || ""))
          ? String(page.border_color)
          : "#111111",
        border_width: clamp(finite(page.border_width, 4), 0, 20),
        gutter: clamp(finite(page.gutter, 16), 0, 64),
      },
      tree: normalizeTree(raw.tree, makeId),
      images,
    };
  }

  function minimumSize(node, gutter = 0) {
    if (!node || node.kind !== "split") return { width: MIN_PANEL_SIZE, height: MIN_PANEL_SIZE };
    const first = minimumSize(node.first, gutter);
    const second = minimumSize(node.second, gutter);
    if (node.axis === "x") {
      return {
        width: first.width + gutter + second.width,
        height: Math.max(first.height, second.height),
      };
    }
    return {
      width: Math.max(first.width, second.width),
      height: first.height + gutter + second.height,
    };
  }

  function ratioRange(node, rect, gutter = 0) {
    const total = node.axis === "x" ? rect.w : rect.h;
    const usable = Math.max(1, total - gutter);
    const first = minimumSize(node.first, gutter);
    const second = minimumSize(node.second, gutter);
    const firstMinimum = node.axis === "x" ? first.width : first.height;
    const secondMinimum = node.axis === "x" ? second.width : second.height;
    let minimum = firstMinimum / usable;
    let maximum = 1 - secondMinimum / usable;
    if (minimum > maximum) {
      minimum = 0.5;
      maximum = 0.5;
    }
    return { minimum: clamp(minimum, 0.01, 0.99), maximum: clamp(maximum, 0.01, 0.99) };
  }

  function computeLayout(tree, pageRect, gutter = 0) {
    const panels = [];
    const dividers = [];
    function visit(node, rect) {
      if (!node || node.kind !== "split") {
        panels.push({ id: node.id, node, rect: { ...rect } });
        return;
      }
      const usable = Math.max(1, (node.axis === "x" ? rect.w : rect.h) - gutter);
      const range = ratioRange(node, rect, gutter);
      const ratio = clamp(node.ratio, range.minimum, range.maximum);
      if (node.axis === "x") {
        const firstWidth = usable * ratio;
        const firstRect = { x: rect.x, y: rect.y, w: firstWidth, h: rect.h };
        const secondRect = {
          x: rect.x + firstWidth + gutter,
          y: rect.y,
          w: usable - firstWidth,
          h: rect.h,
        };
        dividers.push({
          id: node.id,
          node,
          axis: "x",
          rect: { x: rect.x + firstWidth, y: rect.y, w: gutter, h: rect.h },
          container: { ...rect },
          range,
        });
        visit(node.first, firstRect);
        visit(node.second, secondRect);
      } else {
        const firstHeight = usable * ratio;
        const firstRect = { x: rect.x, y: rect.y, w: rect.w, h: firstHeight };
        const secondRect = {
          x: rect.x,
          y: rect.y + firstHeight + gutter,
          w: rect.w,
          h: usable - firstHeight,
        };
        dividers.push({
          id: node.id,
          node,
          axis: "y",
          rect: { x: rect.x, y: rect.y + firstHeight, w: rect.w, h: gutter },
          container: { ...rect },
          range,
        });
        visit(node.first, firstRect);
        visit(node.second, secondRect);
      }
    }
    visit(tree, pageRect);
    return { panels, dividers };
  }

  function findNode(tree, requestedId) {
    if (!tree) return null;
    if (tree.id === requestedId) return tree;
    if (tree.kind !== "split") return null;
    return findNode(tree.first, requestedId) || findNode(tree.second, requestedId);
  }

  function findParent(tree, requestedId, parent = null) {
    if (!tree) return null;
    if (tree.id === requestedId) return { node: tree, parent };
    if (tree.kind !== "split") return null;
    return findParent(tree.first, requestedId, tree) || findParent(tree.second, requestedId, tree);
  }

  function replaceNode(tree, requestedId, replacement) {
    if (tree.id === requestedId) return replacement;
    if (tree.kind !== "split") return tree;
    tree.first = replaceNode(tree.first, requestedId, replacement);
    tree.second = replaceNode(tree.second, requestedId, replacement);
    return tree;
  }

  function splitPanel(tree, panelId, axis, makeId = defaultId) {
    const source = findNode(tree, panelId);
    if (!source || source.kind !== "panel") return { tree, changed: false, panelId: null };
    const first = panelNode(makeId, source);
    const second = panelNode(makeId);
    const replacement = splitNode(axis, 0.5, first, second, makeId);
    return {
      tree: replaceNode(tree, panelId, replacement),
      changed: true,
      panelId: first.id,
      siblingId: second.id,
    };
  }

  function mergeSibling(tree, panelId, prefer = panelId, makeId = defaultId) {
    const match = findParent(tree, panelId);
    const parent = match?.parent;
    if (!parent || parent.kind !== "split" || parent.first.kind !== "panel" || parent.second.kind !== "panel") {
      return { tree, changed: false, panelId: null };
    }
    const preferred = parent.first.id === prefer ? parent.first : parent.second.id === prefer ? parent.second : match.node;
    const other = preferred === parent.first ? parent.second : parent.first;
    const merged = panelNode(makeId, preferred);
    merged.id = `panel-${makeId()}`;
    if (!merged.image_id && other.image_id) {
      merged.image_id = other.image_id;
      merged.fit = other.fit;
      merged.image_scale = other.image_scale;
      merged.image_offset_x = other.image_offset_x;
      merged.image_offset_y = other.image_offset_y;
    }
    if (!merged.tone && other.tone) merged.tone = normalizeTone(other.tone);
    return {
      tree: replaceNode(tree, parent.id, merged),
      changed: true,
      panelId: merged.id,
    };
  }

  function panelAt(layout, point) {
    return (
      layout.panels.find(
        (item) =>
          point.x >= item.rect.x &&
          point.x <= item.rect.x + item.rect.w &&
          point.y >= item.rect.y &&
          point.y <= item.rect.y + item.rect.h,
      ) || null
    );
  }

  function dividerAt(layout, point, hitSize = 10) {
    return (
      layout.dividers.find((item) => {
        const paddingX = item.axis === "x" ? Math.max(hitSize, item.rect.w) / 2 : 0;
        const paddingY = item.axis === "y" ? Math.max(hitSize, item.rect.h) / 2 : 0;
        const centerX = item.rect.x + item.rect.w / 2;
        const centerY = item.rect.y + item.rect.h / 2;
        return (
          point.x >= item.rect.x - paddingX &&
          point.x <= item.rect.x + item.rect.w + paddingX &&
          point.y >= item.rect.y - paddingY &&
          point.y <= item.rect.y + item.rect.h + paddingY &&
          (item.axis === "x" ? Math.abs(point.x - centerX) <= Math.max(hitSize / 2, item.rect.w / 2) : true) &&
          (item.axis === "y" ? Math.abs(point.y - centerY) <= Math.max(hitSize / 2, item.rect.h / 2) : true)
        );
      }) || null
    );
  }

  function imageFit(panelRect, imageWidth, imageHeight, fit = "cover", scale = 1, offsetX = 0, offsetY = 0) {
    const width = Math.max(1, finite(imageWidth, 1));
    const height = Math.max(1, finite(imageHeight, 1));
    const base =
      fit === "contain"
        ? Math.min(panelRect.w / width, panelRect.h / height)
        : Math.max(panelRect.w / width, panelRect.h / height);
    const applied = base * clamp(scale, 0.05, 20);
    const drawWidth = width * applied;
    const drawHeight = height * applied;
    return {
      x: panelRect.x + panelRect.w / 2 - drawWidth / 2 + finite(offsetX, 0),
      y: panelRect.y + panelRect.h / 2 - drawHeight / 2 + finite(offsetY, 0),
      w: drawWidth,
      h: drawHeight,
      scale: applied,
    };
  }

  return {
    TEMPLATE_IDS,
    MIN_PANEL_SIZE,
    clamp,
    clone,
    panelNode,
    splitNode,
    createTemplate,
    defaultTone,
    normalizeTone,
    normalizeTree,
    defaultState,
    normalizeState,
    minimumSize,
    ratioRange,
    computeLayout,
    findNode,
    findParent,
    replaceNode,
    splitPanel,
    mergeSibling,
    panelAt,
    dividerAt,
    imageFit,
  };
});
