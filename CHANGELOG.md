# Changelog

## [0.6.0] - Unreleased

### Added

- Speech Bubble Comic Editor project window with Single Image, 4-Panel Manga, and Comic workspaces
- Shared or per-workspace Image Tray with Forge gallery and local-file import
- Opt-in isnet-anime background-removal model download and Forge-hosted inference API
- Built-in kawaii and corner stamp assets used by the common material drawer

### Changed

- Forge launch branding now uses Speech Bubble Comic Editor for Forge Neo, with Comic Panel Editor as the short UI name
- Background-removal and comic-conversion results are stored through the common project image route

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
