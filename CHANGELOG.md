# Changelog

## [0.7.10] - Unreleased

### Added

- Four-Panel Manga panel images now expose non-destructive Edit Crop / Reset Crop controls in image Properties.
- Comic Layout panel images expose the same crop controls and persist crop rectangles per panel image.
- A shared crop overlay provides eight edge/corner handles, crop-box dragging, Reset, Apply, Cancel, Enter, and Escape without increasing the editor dock height.
- Four-Panel Manga and Comic Layout support crop entry from the Properties button, C key, and image double-click.

### Changed

- Cropped panel images are rendered from the selected source rectangle and then use the existing Cover / Contain, scale, and offset behavior.
- Assigning a new image to a panel resets that panel image crop to the full source image.
- The Single Image C-key route now requires the selected editor object itself to be an image instead of falling back to another visible image layer.
- Comic panel core files are now recorded as Forge-adapted files because panel crop state is persisted there.

### Fixed

- Crop editing is no longer limited to Single Image mode; Four-Panel Manga and Comic Layout panel images now retain and render non-destructive crop state.

## [0.7.9] - Unreleased

### Added

- Comic Panel Editor image layers now support non-destructive crop data, with Edit Crop / Reset Crop controls in image Properties.
- Crop mode can also be entered by double-clicking a selected image or pressing C, and shows a temporary Confirm / Cancel / Reset toolbar over the canvas.
- Multi-selection Properties now provides icon-only alignment and distribution controls for normal movable objects, including text, bubbles, SFX, stamps, and image layers.
- Alignment reference can be Selection Objects, the common Panel, or the Page. Alignment is available for 2+ editable objects; distribution for 3+.

### Changed

- Single Image replacement paths now use shared replacement behavior instead of keeping the dimensions of the first loaded image.
- When replacing the primary Single Image, an otherwise empty page automatically adopts the new image dimensions; an edited page asks whether to resize the canvas or preserve the current canvas.
- Explicit +Image remains an additive image-layer action while direct replacement, local drop/file replacement, and Forge source replacement use the replacement path.

### Fixed

- Replacing a portrait Single Image with a landscape image (or the reverse) no longer leaves the page canvas stuck at the previous aspect ratio when resize is selected or safe to perform automatically.
- Crop confirmation/reset and alignment/distribution are recorded as editor history operations for Undo / Redo.

## [0.7.8] - Unreleased

### Changed

- Quick Retouch checkboxes are visually standardized to 16 × 16 px while their label rows remain easy to click.
- Brush drawing color is kept inline with Size / Hardness / Opacity; Eraser hides the unused drawing-color control.
- Compare view is now a direct three-button control: None / Left-Right / Top-Bottom.
- Zoom controls are compact: Fit, minus, a narrow percentage selector, and plus.
- Magic Wand labels are shortened to Contiguous / Merged / AA with explanatory tooltips.
- Color Range uses clearer Set / + Add / − Exclude sampling and the actions “Confirm Selection” / “Clear Preview”.
- The permanently disabled Blend selector is removed from Layers until blend modes are implemented; layer opacity remains available.
- Forge selected-image import yields to the UI between acquisition, upload, and placement, prevents double clicks while busy, and batches image-tray/canvas refreshes to reduce stalls.

### Fixed

- Repeated image decoding during Comic / Comic Layout imports no longer triggers a tray render and full canvas render for every intermediate image; refresh happens after the batch.
- Quick Retouch cache/build identifiers are updated for 0.7.8.


## [0.7.7] - Unreleased

### Changed

- Quick Retouch now uses one current Selection Mask; the separate global Protection Range UI has been removed.
- The Selection panel is compact and Photoshop-like, with Select All, Deselect, Invert, Boundary / Mask / Hidden, feather, expand / contract, and Quick Mask.
- Quick Mask is toggled with Q; red overlay means outside the current selection, while Brush adds and Eraser subtracts.
- Selection tools are ordered Lasso, Rectangle, Magic Wand, Color Range and share New / Add / Subtract / Intersect options.
- Paint and Base Image no longer use a dedicated Properties panel; layer opacity is controlled in the Layers panel. Properties is reserved for adjustment layers and masks.
- Hue / Saturation, Saturation, Lightness, Brightness, and Contrast controls use visual gradient sliders; advanced H/S target sampling is collapsed by default.
- Quick Retouch image input now uses the same expandable source-picker pattern as Background Removal and Comic Conversion, including page/image candidates, drag and drop, and file selection.
- Selection history no longer stores the removed Protection mask and the history budget is raised to 32 steps / 512 MiB while retaining one history entry per stroke or completed control drag.

### Fixed

- Inverting the current selection now feeds the inverted mask directly into newly created adjustment layer masks without subtracting a second protection mask.
- Deselect and Color Range cancellation operate on the single current selection model, reducing cases where a hidden secondary mask made H/S scope appear reversed.

## [0.7.6] - Unreleased

### Fixed

- Undo and Redo snapshots now include selection display state, previous selection, Color Range preview/samples, Hue/Saturation sampler mode, brush colors, zoom, free pan, and comparison state
- Deselect and Ctrl+D now clear both the confirmed selection and any Color Range preview/samples, while Protection remains independent
- Escape cancels an active Color Range preview without destroying the previously confirmed selection
- Return to Start now restores a single immutable document snapshot instead of rebuilding only some canvases and layers
- Return to Start is undoable, so Undo restores the state immediately before the reset
- Inverting a selection before creating an adjustment layer copies the current inverted selection minus Protection into the new layer mask

### Changed

- “Hold for Original” is renamed to “Hold to View Before”
- Comparison is now selectable as none, left/right split, or top/bottom split
- The reset action is renamed to “Return to Start” and asks for confirmation before discarding edits
- History capacity is increased to 24 steps and 384 MiB while retaining bounded memory behavior
- Project Editor and Quick Retouch cache identifiers are updated for 0.7.6

## [0.7.5] - Unreleased

### Added

- Quick Retouch now includes an independent red Protection Mask that can be built from the current selection and subtracted from painting, erasing, and adjustment-layer masks
- Magic Wand options now include tolerance, contiguous selection, sampling the visible composite, and anti-aliasing
- Color Range now supports contiguous mode, visible-composite sampling, and distinct set/add/exclude sampler states with a purple preview
- Hue / Saturation adjustments can target Master, Reds, Yellows, Greens, Cyans, Blues, Magentas, or custom sampled hue ranges
- Quick Retouch restores the last active tool, editable target, selection display, floating-panel layout, normal window geometry, and maximized state

### Changed

- The former permanently locked Original layer is now an editable Base Image layer with visibility and lock toggles
- Base Image pixels can be painted or erased directly after unlock, while the source used by Page Images and hold-to-view Original remains available outside the editable layer
- Selection display now defaults to the blue/cyan mask overlay instead of boundary-only display
- New adjustment-layer masks are created from the effective selection after subtracting the Protection Mask
- Base Image can be duplicated into a paint layer, but cannot be deleted or moved out of its base position

### Fixed

- Selection and protection overlays remain visually distinct: confirmed selection is blue/cyan, Color Range preview is purple, and protected pixels are red
- Direct Base Image editing participates in Quick Retouch Undo / Redo snapshots together with visibility, lock state, and Protection Mask data

## [0.7.4] - Unreleased

### Fixed

- Quick Retouch CSS and JavaScript now use a new cache key, and the Project Editor launch URL includes the build version
- Brush and Eraser outline overlay is attached inside the modal dialog top layer so it cannot be hidden behind the dialog
- Hand, Space-drag, and middle-mouse drag now move the canvas even when the fitted image is smaller than the workspace
- Pointer-centered wheel zoom preserves the edited canvas position while using the independent pan offset
- The Quick Retouch title and JavaScript API expose version 0.7.4 for runtime verification

## [0.7.3] - Unreleased

### Added

- Photoshop-style high-visibility Brush and Eraser outlines with center marks and actual on-canvas diameter
- Dedicated Eyedropper, Magic Wand, and Color Range sampler cursors, including add/exclude badges
- Live Shift / Alt / Shift+Alt feedback in selection mode buttons
- Blue-purple Color Range preview distinct from the normal blue selection overlay

### Changed

- Right-button horizontal brush resizing now updates the outline and nearby pixel-size HUD in real time
- Alt temporarily switches Brush or Eraser to the foreground-color Eyedropper without sharing Color Range sampler state
- Selection visualization can remain hidden while selection data is edited or replaced
- Pointer capture loss, cancellation, window blur, and out-of-window release now terminate brush sizing and painting states safely

## [0.7.2] - Unreleased

### Added

- Mouse-wheel zoom centered near the pointer in Quick Retouch
- Middle-mouse drag panning, in addition to the Hand tool and Space-drag
- Photoshop-style Quick Retouch shortcuts for Select All, Deselect, Reselect, Invert Selection, layer duplication, Fit, 100%, and zoom
- Tool-specific canvas cursors for Brush, Eraser, Hand, Pan, and Zoom
- High-visibility live brush outline while resizing with right-button horizontal drag

### Changed

- Quick Retouch Brush and Zoom tool icons are more recognizable
- The Hand and Zoom option hints now document wheel and middle-button operation
- The original image remains permanently protected as the non-destructive source layer

## [0.7.1] - Unreleased

### Added

- Quick Retouch dialog for small post-generation corrections without overwriting the source image
- Independent Selection panel with Select All, Deselect, Invert, Add, Subtract, Intersect, boundary, blue overlay, and hidden display modes
- Rectangle, freehand mouse Lasso, connected/non-contiguous Magic Wand, and sampled Color Range selection tools
- Paint layers with brush, eraser, eyedropper, size, hardness, opacity, and common color swatches
- Non-destructive Hue / Saturation, Brightness / Contrast / Gamma, and RGB channel Curves adjustment layers
- Per-adjustment grayscale masks copied from the current Selection Mask and editable with the mask brush
- Tone Curve control points, numeric Input / Output editing, five presets, histogram backdrop, and 256-value LUT rendering
- Single-canvas editing, hold-to-view Original, draggable split comparison, bounded Undo / Redo history, full-resolution PNG rendering, and Page Images integration
- Photoshop-like tool order, dynamic Tool Options bar, foreground/background color wells, red/blue brush cursor, right-drag brush resizing, Japanese/English UI, and regression tests

### Changed

- Quick Retouch now starts with Brush and Paint 1 instead of the Selection Mask
- Selection, Layers, and Properties are movable, resizable, collapsible floating panels inside the Editor window
- Paint, erase, and adjustment-mask strokes can be constrained by the current selection
- Processing a standalone external image into an empty Single Image workspace now preserves its source dimensions and aspect ratio
- Project image records now accept the `retouched` source kind
- Project settings are read from the public `/speech-bubble-forge/config` API
- The duplicate Editor-side Forge Settings button remains removed; settings are managed from Forge Neo

### Known initial limitations

- Quick Retouch sessions are flattened into a new project image when applied; editable retouch layers are not yet stored in the project file
- Clone Stamp, Healing Brush, blur/sharpen tools, gradients, and AI inpainting are not included in this initial version
- The injected Chromium harness passes, but full interaction testing must still be completed inside an actual Forge Neo installation

## [0.6.0] - Unreleased

### Added

- Speech Bubble Comic Editor project window with Single Image, 4-Panel Manga, and Comic workspaces
- Shared or per-workspace Image Tray with Forge gallery and local-file import
- Opt-in isnet-anime background-removal model download and Forge-hosted inference API
- Built-in kawaii and corner stamp assets in the app-style material accordions
- Japanese and English UI switching across the Project Editor, Properties, Layers, asset drawers, and tooltips
- Forge Settings sections for Appearance and the optional AI background-removal model
- Fifteen additional pink built-in SFX assets synchronized with the Desktop editor

### Changed

- Forge launch branding now uses Speech Bubble Comic Editor for Forge Neo, with Comic Panel Editor as the short UI name
- Background-removal and comic-conversion results are stored through the common project image route
- Project settings are managed from Forge Settings > Comic Panel Editor
- Page Images uses the full-width app-style accordion and starts collapsed
- New image layers start unlocked, and each asset drawer remembers its own width and section state
- Settings remain centralized in Forge Neo Settings > Comic Panel Editor

### Fixed

- Properties and Layers use movable floating panels in the Forge project editor
- Page Images changes participate in Undo and Redo
- External processing sources no longer inherit an unrelated image layer transform
- Projects with missing image files open in repair mode instead of failing completely

## [0.5.0] - Unreleased

### Added

- Layer-based Speech Bubble, Text, SFX, Comic Stamp, Frame, and Emphasis Lines editing
- Standalone local-image editing and per-image layout storage
- User Presets for PNG and static WebP assets
- Comic-page templates, split/merge dividers, a persistent multi-image tray, and dynamic dot halftone
- PNG, JPEG, WebP, and transparent Overlay PNG export
- Local Self Diagnostics

### Changed

- Export uses the Editor Canvas as the visual source and sends multipart binary data
- Settings are organized into User Presets, Export & Saving, Editor & Layout, and Cache & Diagnostics
- Vertical text uses grapheme-aware placement shared by Canvas and Pillow rendering

### Fixed

- Editor window reuse, reconnect, focus, and duplicate-launch handling
- User Preset style previews, replacement, rename, and retained asset references
- Export naming, dated folders, generation backups, and source-image overwrite prevention

The detailed development record is retained in [`docs/CHANGELOG_0.5.0.md`](docs/CHANGELOG_0.5.0.md). The release date remains unset until tag or Release publication is confirmed.
