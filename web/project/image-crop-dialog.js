(function (root) {
  "use strict";

  const tr = (ja, en) => document.documentElement.lang === "en" ? en : ja;
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number(value) || 0));
  const normalizeCrop = (value = {}) => {
    const x = clamp(value.x ?? 0, 0, .99);
    const y = clamp(value.y ?? 0, 0, .99);
    const w = clamp(value.w ?? 1, .01, 1 - x);
    const h = clamp(value.h ?? 1, .01, 1 - y);
    return { x, y, w, h };
  };
  const sameCrop = (a, b) => ["x", "y", "w", "h"].every((key) => Math.abs((a?.[key] ?? 0) - (b?.[key] ?? 0)) < 1e-6);

  function installStyle() {
    if (document.getElementById("speechBubbleImageCropDialogStyle")) return;
    const style = document.createElement("style");
    style.id = "speechBubbleImageCropDialogStyle";
    style.textContent = `
      .sb-image-crop-dialog{position:fixed;inset:0;z-index:10050;background:rgba(8,10,14,.78);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box}
      .sb-image-crop-dialog[hidden]{display:none}
      .sb-image-crop-panel{width:min(920px,96vw);height:min(820px,92vh);min-height:440px;display:flex;flex-direction:column;background:#1d222a;border:1px solid #687382;border-radius:10px;box-shadow:0 20px 70px #000b;overflow:hidden;color:#eef2f7}
      .sb-image-crop-head,.sb-image-crop-foot{display:flex;align-items:center;gap:8px;padding:9px 12px;background:#242a33;border-bottom:1px solid #414a56;flex:0 0 auto}
      .sb-image-crop-head strong{font-size:13px}.sb-image-crop-head span{font-size:11px;color:#aeb8c4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .sb-image-crop-foot{border-bottom:0;border-top:1px solid #414a56;justify-content:flex-end}
      .sb-image-crop-foot button{min-height:30px;padding:4px 11px}.sb-image-crop-foot [data-crop-confirm]{background:#2f6242;border-color:#69a77d;color:#fff}.sb-image-crop-foot [data-crop-cancel]{background:#513033;border-color:#93666a;color:#fff}
      .sb-image-crop-stage{position:relative;flex:1 1 auto;min-height:0;margin:12px;background:#11151a;overflow:hidden;touch-action:none;user-select:none}
      .sb-image-crop-image{position:absolute;object-fit:fill;pointer-events:none;user-select:none;-webkit-user-drag:none}
      .sb-image-crop-shade{position:absolute;background:rgba(0,0,0,.58);pointer-events:none}
      .sb-image-crop-box{position:absolute;border:2px solid #65b7ff;box-shadow:0 0 0 1px rgba(0,0,0,.85) inset;box-sizing:border-box;cursor:move;touch-action:none}
      .sb-image-crop-box::before,.sb-image-crop-box::after{content:"";position:absolute;pointer-events:none;opacity:.38}.sb-image-crop-box::before{left:33.333%;top:0;bottom:0;width:33.333%;border-left:1px solid #fff;border-right:1px solid #fff}.sb-image-crop-box::after{top:33.333%;left:0;right:0;height:33.333%;border-top:1px solid #fff;border-bottom:1px solid #fff}
      .sb-image-crop-handle{position:absolute;width:12px;height:12px;border:2px solid #1b2a38;background:#f4fbff;border-radius:2px;box-sizing:border-box;transform:translate(-50%,-50%)}
      .sb-image-crop-handle[data-handle=n]{left:50%;top:0;cursor:ns-resize}.sb-image-crop-handle[data-handle=s]{left:50%;top:100%;cursor:ns-resize}.sb-image-crop-handle[data-handle=w]{left:0;top:50%;cursor:ew-resize}.sb-image-crop-handle[data-handle=e]{left:100%;top:50%;cursor:ew-resize}
      .sb-image-crop-handle[data-handle=nw]{left:0;top:0;cursor:nwse-resize}.sb-image-crop-handle[data-handle=ne]{left:100%;top:0;cursor:nesw-resize}.sb-image-crop-handle[data-handle=sw]{left:0;top:100%;cursor:nesw-resize}.sb-image-crop-handle[data-handle=se]{left:100%;top:100%;cursor:nwse-resize}
      .sb-image-crop-status{margin-right:auto;font-size:11px;color:#b9c4d0}.sb-image-crop-reset{margin-right:auto}
    `;
    document.head.append(style);
  }

  async function open({ image, name = "", crop = null } = {}) {
    if (!image?.naturalWidth || !image?.naturalHeight) return null;
    installStyle();
    const start = normalizeCrop(crop);
    let current = { ...start };
    const overlay = document.createElement("div");
    overlay.className = "sb-image-crop-dialog";
    overlay.innerHTML = `
      <div class="sb-image-crop-panel" role="dialog" aria-modal="true" aria-label="${tr("画像クロップ", "Image Crop")}">
        <div class="sb-image-crop-head"><strong>${tr("画像クロップ", "Image Crop")}</strong><span></span></div>
        <div class="sb-image-crop-stage">
          <img class="sb-image-crop-image" draggable="false" alt="">
          <div class="sb-image-crop-shade" data-shade="top"></div><div class="sb-image-crop-shade" data-shade="left"></div><div class="sb-image-crop-shade" data-shade="right"></div><div class="sb-image-crop-shade" data-shade="bottom"></div>
          <div class="sb-image-crop-box">${["nw","n","ne","w","e","sw","s","se"].map((handle) => `<i class="sb-image-crop-handle" data-handle="${handle}"></i>`).join("")}</div>
        </div>
        <div class="sb-image-crop-foot"><button type="button" class="sb-image-crop-reset" data-crop-reset>${tr("リセット", "Reset")}</button><span class="sb-image-crop-status"></span><button type="button" data-crop-cancel>${tr("キャンセル", "Cancel")}</button><button type="button" data-crop-confirm>✓ ${tr("確定", "Apply")}</button></div>
      </div>`;
    document.body.append(overlay);
    const stage = overlay.querySelector(".sb-image-crop-stage");
    const img = overlay.querySelector(".sb-image-crop-image");
    const box = overlay.querySelector(".sb-image-crop-box");
    const status = overlay.querySelector(".sb-image-crop-status");
    overlay.querySelector(".sb-image-crop-head span").textContent = name || `${image.naturalWidth} × ${image.naturalHeight}`;
    img.src = image.currentSrc || image.src;
    let imageRect = { x: 0, y: 0, w: 1, h: 1 };
    let drag = null;

    function layoutImage() {
      const bounds = stage.getBoundingClientRect();
      const ratio = Math.min(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight);
      const w = Math.max(1, image.naturalWidth * ratio), h = Math.max(1, image.naturalHeight * ratio);
      imageRect = { x: (bounds.width - w) / 2, y: (bounds.height - h) / 2, w, h };
      Object.assign(img.style, { left: `${imageRect.x}px`, top: `${imageRect.y}px`, width: `${w}px`, height: `${h}px` });
      render();
    }
    function render() {
      current = normalizeCrop(current);
      const x = imageRect.x + current.x * imageRect.w, y = imageRect.y + current.y * imageRect.h;
      const w = current.w * imageRect.w, h = current.h * imageRect.h;
      Object.assign(box.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
      const top = overlay.querySelector('[data-shade="top"]'), left = overlay.querySelector('[data-shade="left"]'), right = overlay.querySelector('[data-shade="right"]'), bottom = overlay.querySelector('[data-shade="bottom"]');
      Object.assign(top.style, { left: `${imageRect.x}px`, top: `${imageRect.y}px`, width: `${imageRect.w}px`, height: `${Math.max(0, y - imageRect.y)}px` });
      Object.assign(bottom.style, { left: `${imageRect.x}px`, top: `${y + h}px`, width: `${imageRect.w}px`, height: `${Math.max(0, imageRect.y + imageRect.h - y - h)}px` });
      Object.assign(left.style, { left: `${imageRect.x}px`, top: `${y}px`, width: `${Math.max(0, x - imageRect.x)}px`, height: `${h}px` });
      Object.assign(right.style, { left: `${x + w}px`, top: `${y}px`, width: `${Math.max(0, imageRect.x + imageRect.w - x - w)}px`, height: `${h}px` });
      const px = Math.round(current.x * image.naturalWidth), py = Math.round(current.y * image.naturalHeight), pw = Math.round(current.w * image.naturalWidth), ph = Math.round(current.h * image.naturalHeight);
      status.textContent = `${pw} × ${ph} px  /  X ${px}, Y ${py}`;
    }
    function pointerPosition(event) {
      const rect = stage.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
    function begin(event) {
      if (event.button !== 0) return;
      const handle = event.target.closest("[data-handle]")?.dataset.handle || "move";
      const point = pointerPosition(event);
      drag = { pointerId: event.pointerId, handle, startX: point.x, startY: point.y, crop: { ...current } };
      box.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    }
    function move(event) {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const p = pointerPosition(event), dx = (p.x - drag.startX) / imageRect.w, dy = (p.y - drag.startY) / imageRect.h, startCrop = drag.crop;
      let x = startCrop.x, y = startCrop.y, w = startCrop.w, h = startCrop.h;
      if (drag.handle === "move") { x = clamp(startCrop.x + dx, 0, 1 - startCrop.w); y = clamp(startCrop.y + dy, 0, 1 - startCrop.h); }
      else {
        if (drag.handle.includes("w")) { const nx = clamp(startCrop.x + dx, 0, startCrop.x + startCrop.w - .01); w = startCrop.w + startCrop.x - nx; x = nx; }
        if (drag.handle.includes("e")) w = clamp(startCrop.w + dx, .01, 1 - startCrop.x);
        if (drag.handle.includes("n")) { const ny = clamp(startCrop.y + dy, 0, startCrop.y + startCrop.h - .01); h = startCrop.h + startCrop.y - ny; y = ny; }
        if (drag.handle.includes("s")) h = clamp(startCrop.h + dy, .01, 1 - startCrop.y);
      }
      current = normalizeCrop({ x, y, w, h }); render(); event.preventDefault();
    }
    function end(event) { if (!drag || drag.pointerId !== event.pointerId) return; drag = null; event.preventDefault(); }

    box.addEventListener("pointerdown", begin); box.addEventListener("pointermove", move); box.addEventListener("pointerup", end); box.addEventListener("pointercancel", end);
    const resizeObserver = "ResizeObserver" in root ? new ResizeObserver(layoutImage) : { observe() {}, disconnect() {} }; resizeObserver.observe(stage); layoutImage();

    return new Promise((resolve) => {
      let finished = false;
      const cleanup = (result) => { if (finished) return; finished = true; resizeObserver.disconnect(); window.removeEventListener("keydown", onKey, true); overlay.remove(); resolve(result); };
      const onKey = (event) => { if (event.key === "Escape") { event.preventDefault(); cleanup(null); } else if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); cleanup(normalizeCrop(current)); } };
      window.addEventListener("keydown", onKey, true);
      overlay.querySelector("[data-crop-cancel]").onclick = () => cleanup(null);
      overlay.querySelector("[data-crop-confirm]").onclick = () => cleanup(normalizeCrop(current));
      overlay.querySelector("[data-crop-reset]").onclick = () => { current = { x: 0, y: 0, w: 1, h: 1 }; render(); };
      overlay.addEventListener("pointerdown", (event) => { if (event.target === overlay) cleanup(null); });
    });
  }

  root.SpeechBubbleImageCropDialog = Object.freeze({ open, normalizeCrop, sameCrop });
})(typeof globalThis !== "undefined" ? globalThis : window);
