# Changelog

## Unreleased

### Added

- Individual brightness, contrast, sharpness and lens reset actions in Adjust preserve unrelated page settings.

- **Find edges** (**Kanten finden**) reruns automatic detection from the original in the corner editor while retaining page settings. Preview the proposed corners before applying them; cancelling the editor preserves the previous crop, and unsuccessful detection keeps the current corner selection.

### Fixed

- Put replacement, direct discard and Add page below the review document with equally sized mobile actions; keep Undo visibly labelled.
- Hide the session-close X inside editing tools and make Escape follow local cancellation and focus restoration.

- Imported images now offer **Replace image** (**Bild tauschen**) with a direct single-image picker; camera captures retain **Retake** (**Wiederholen**). Cancelling or failing a replacement preserves the previous candidate/page and remaining imports.
- Keep observed complete document boundaries instead of replacing them with stronger internal fold panels that share both opposite paper sides.
- Determine the final crop independently from the captured original, so an inaccurate live-camera contour cannot force an inner crop or override complete-sheet selection.
- Improve detection of low-contrast outer document edges in camera and still processing.

## 0.2.0 - 2026-10-27

A backward-compatible SDK release for direct camera entry, immediate UI preference notifications and complete light/dark styling of the reusable scanner UI. The existing confirmed-blob completion contract and host ownership of storage, filenames, downloads and PWA behavior are unchanged.

### Added

- Typed `OpenOptions.entry: 'workspace' | 'camera'` for `createScanner().open()` and React `openOptions`. `scanner.open({ entry: 'camera' })` enters the existing camera directly. Omitted entry preserves the workspace; nonempty `initialFiles` always take the import path without a camera request, while empty arrays follow the entry. Invalid entries reject before resources open. ([PR #7](https://github.com/kbudisantoso/ktb.scanner/pull/7))
- `ScannerOptions.onPreferenceChange` and exported `ScannerPreferenceChange` for real global UI changes to Auto/Manual and JPEG/PNG. Notifications arrive immediately, including before later cancellation. Initialization, reapplication, unchanged values, page edits and ended sessions emit nothing. Callback failures are isolated; React reaches the current handler without restarting the session or camera. Reapply through existing `initialMode` and `imageType` options; persistence stays in the host. ([PR #8](https://github.com/kbudisantoso/ktb.scanner/pull/8))
- Forty additional working theme tokens, for fifty supported tokens in total. Theme the backdrop/stacking, primary and warning foregrounds, mobile camera palette/focus/overlays/shutter/flash, control and panel radii, spacing, shadows, capture outline and corner loupe. Existing ten tokens and fallback defaults remain supported. Both public UI integrations use the existing `theme` option. Standalone `ImageViewer` consumes inherited `--scanner-font` directly. ([PR #9](https://github.com/kbudisantoso/ktb.scanner/pull/9))

### Fixed

- Report SDK version 0.2.0 consistently in exported page metadata and reference-host diagnostic archives.
- Opening/cleanup guards cover reentrant abort/destroy, late camera permission/device responses and pending torch changes. Direct entry adds no second camera/session implementation and preserves retry, import and cancellation after denial.
- Localize invalid-entry errors in English and German.
- Keep the selected paper-orientation foreground visible on its accent surface instead of allowing a later selected-button rule to overwrite it.

### Documentation

- Complete public [styling guide](docs/UI-THEMING.md): all token defaults/scopes, full light/dark palettes, imperative/React examples, locally served fonts, inheritance, viewer integration, contrast and visible focus. [Integration examples](docs/INTEGRATION.md) align existing completion labels with the host result handler. ([PR #10](https://github.com/kbudisantoso/ktb.scanner/pull/10))

### Upgrading from 0.1.0

Use the matching 0.2.0 package, stylesheet and complete worker/media asset tree together; rebuild the host and recopy all assets. Existing integrations keep their defaults. The new options are optional, and existing confirmed images/PDF blobs and serializable metadata retain their contract. No SDK localStorage/cookies, downloader, filename rules, headless/slot API or private website code is introduced. AGPL and separate third-party notices are unchanged.

Browser camera access still requires a suitable secure context and native permission.

[Full changes since 0.1.0](https://github.com/kbudisantoso/ktb.scanner/compare/v0.1.0...v0.2.0).

## 0.1.0 - 2026-10-26

- Public package namespace `@ktb-tools/scanner` and a GitHub release workflow with full checks, inspected artifacts and npm OIDC publishing after one-time bootstrap setup.
- GNU AGPL version 3 source license, English project documentation and separate third-party media notices.
- Focused mobile tools, direct finish, scrollable page tiles and a shared pinch/zoom/held-comparison viewer.
- Browser document-scanner library with a framework-independent core and reusable React interface.
- Classic Scanic detection, camera capture, image import, manual crop, reversible processing and multiple pages.
- JPEG/PNG image output and a multi-page browser-generated raster PDF.
- Automatic, photo, color, grayscale and soft monochrome profiles; manual tone and radial-correction controls.
- Next.js reference application and Astro integration with locally supplied assets.
- Explicit opt-in diagnostics; camera, geometry, processing, export, mobile layout and lifecycle regression tests.

Published on npm as `@ktb-tools/scanner@0.1.0` from tag `v0.1.0` at `d277d32d6f9df52c6c95dd31e79885ddd3b11793`.
