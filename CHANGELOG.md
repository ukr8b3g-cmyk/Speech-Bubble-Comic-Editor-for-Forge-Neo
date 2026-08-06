# Changelog

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
