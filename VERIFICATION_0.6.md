# Speech Bubble Comic Editor for Forge Neo 0.6 verification

## Automated checks

- JavaScript tests: `node tests/*.cjs` (run each file)
- Browser smoke test: Playwright Chromium is installed in GitHub Actions
- Python tests: `python -m pytest -q`
- Upstream exact-file SHA-256: `node tests/upstream_sync_test.cjs`
- Whitespace: `git diff --check`

## Manual checks

- Forge shows only the blue **Open Comic Panel Editor** launcher.
- Properties and Layers open as movable floating panels.
- Page Images starts collapsed; its whole heading toggles it and no gear button appears.
- Local file drop and Forge gallery import add an image to Page Images and the current workspace.
- External files processed by Comic Conversion or Background Removal do not inherit an unrelated layer transform.
- Page Images removal can be undone with the image content intact.
- The Editor has no duplicate Forge Settings button; settings are managed from Forge Settings > Comic Panel Editor.
- Japanese / English changes are reflected in an Editor window that is already open.
- The empty-canvas drop guide is hidden by default.
- Cleanup is blocked while the project has unsaved changes.
- A project with a missing image file opens with a repair warning instead of failing completely.
