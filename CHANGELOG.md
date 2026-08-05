# Changelog

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
- Forge settings are centralized under Settings > Comic Panel Editor; the duplicate Editor toolbar button was removed

### Fixed

- Forge language settings now load from the public config API and update an open Editor window immediately
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
