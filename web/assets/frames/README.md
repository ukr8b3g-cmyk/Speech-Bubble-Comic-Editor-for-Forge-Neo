# Frame asset manifest

Each folder-level `*/manifest.json` is the source of truth for an installed frame asset. Copy a frame folder into this directory and restart ComfyUI; the editor and Python renderer discover it automatically. Do not add new decorative frames to the shared `manifest.json` or hard-code them in JavaScript/Python.

The shared `manifest.json` is retained only for legacy procedural border presets and the common asset contract. A folder-level manifest wins when the same ID exists in both locations.

Folder manifests use `schemaVersion: 1`, camelCase keys such as `renderMode`, `runtimeAsset`, `defaultScale` and paths relative to their own folder. Unsafe paths, missing files, duplicate IDs and unsupported modes are skipped with a warning without stopping ComfyUI.

## Render modes

- `border`: generated solid border.
- `nine-slice`: decorative raster/SVG frame split into four corners and four edges.
- `full-overlay`: one full-canvas transparent overlay, such as water droplets or film damage.
- `edge-repeat`: four fixed-aspect corners plus four fixed-aspect edge tiles repeated with even spacing.
- `decorated-border`: one procedural continuous border plus independent corner and edge decorations.


## Minimal installable folder structures

Frame folders are discovered from `web/assets/frames/*/manifest.json`. For supported modes, copying one folder into this directory and restarting ComfyUI is sufficient.

### Edge repeat

`runtimeAsset` is optional. The eight part files are the runtime source of truth.

```text
<frame_id>/
├─ manifest.json
├─ preview.webp
└─ parts/
   ├─ corner_tl.webp
   ├─ corner_tr.webp
   ├─ corner_bl.webp
   ├─ corner_br.webp
   ├─ edge_top.webp
   ├─ edge_bottom.webp
   ├─ edge_left.webp
   └─ edge_right.webp
```

Use `renderMode: "edge-repeat"`. Corners and edge tiles are placed without changing their source aspect ratios. Edge tiles are repeated on their own axes and any remainder is distributed as spacing rather than absorbed by stretching.

### Decorated border

`runtimeAsset` is optional. The continuous border is declared in `baseBorder`; all character, flower and symbol images are independent transparent parts.

```text
<frame_id>/
├─ manifest.json
├─ preview.webp
└─ parts/
   ├─ corner_tl.webp
   ├─ corner_tr.webp
   ├─ corner_bl.webp
   ├─ corner_br.webp
   ├─ animal_a.webp
   ├─ animal_b.webp
   └─ accent.webp
```

Use `renderMode: "decorated-border"`. The browser and Pillow renderer draw `baseBorder` once as a continuous rounded rectangle, then place corner and edge decorations with `space-evenly`. Do not bake the continuous border into the repeated item images.

### Preview

Folder manifests may declare `preview: "preview.webp"`. This image is used only for the frame browser card and is not required for final rendering. If `preview` is omitted, a compatible `runtimeAsset` may be used as the legacy fallback.

## Slice values

Use `slice.units: "ratio"` for new assets. Ratios are measured against the source asset width/height and remain valid when a master asset is replaced by a higher-resolution version.

## Asset requirements

- Keep a lossless PNG master outside the runtime package.
- Ship lossless WebP or PNG.
- Use straight alpha, a decontaminated edge and 2–4 px RGB alpha bleed.
- Do not bake shadows or glows into the frame. Runtime effects are generated from the cleaned alpha.

## Frame Asset Size Contract

### Nine-slice raster assets

- Runtime masters are normally `1024x1536` (portrait) or `1536x1024` (landscape).
- The source short side must be at least 1024 px. At 100% frame scale, the intended maximum output long side is 1536 px.
- The editor warns when corner/source scaling exceeds 1.25x and recommends replacement or regeneration above 1.5x.
- A higher-resolution replacement must preserve aspect ratio, composition and slice boundaries.
- Store all slice positions as ratios.

Each raster preset should declare its actual dimensions:

```json
"nativeSize": { "width": 1024, "height": 1536 }
```

### Full-overlay raster assets

- Preserve aspect ratio and use `fit_mode: "cover"` by default.
- Supported modes are `cover`, `contain`, `stretch` and `tile`.
- Do not use `stretch` unless distortion is intentional.
- The source short side must be at least 1024 px. Add aspect-specific variants when visible distortion or excessive cropping would occur.

### SVG assets

- Require `width`, `height` and `viewBox`; the two aspect ratios must match.
- Use `1024x1536` logical coordinates for the existing portrait frame preset.
- Convert text to paths. Do not reference external fonts, CSS or images.
- Do not embed shadows or glows.
- Until Python SVG rendering is implemented, rasterize SVG masters to lossless WebP during the asset build step.

### Alpha preparation

- Use straight alpha and remove background-color contamination.
- Apply 2–4 px of RGB alpha bleed at a 1024 px short side, scaled proportionally for larger masters.
