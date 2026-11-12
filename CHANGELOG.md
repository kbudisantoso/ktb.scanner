# Changelog

## Unreleased

### Fixed

- Keep a hold-still state until the final capture is secured, then give the SDK completion sound and visual feedback once. Moving after that cue cannot replace the chosen image with a later photo.
- Prefer image-supported document boundaries over competing background fragments when selecting a still-image crop, including when finding edges again.

## 0.3.0 - 2026-11-06

Local OCR, continuous capture and a larger review workspace, with improved camera acquisition and bounded high-resolution photo imports. The host retains ownership of confirmed blobs, storage, filenames and downloads.

### Added

- Optional local OCR through `@ktb-tools/scanner/ocr`: Paddle Latin or Tesseract German/English recognition, per-page text, cancellation and a searchable PDF preserving final images and layouts. Recognize pages sequentially and optionally reuse unchanged page revisions in memory. The SDK defaults to Tesseract; the Next.js demo defaults to Paddle and starts OCR manually, with an activity indicator and selectable text.
- Optional `captureWorkflow: 'continuous'` keeps the camera open for multiple pages and opens sequential review from **Review pages (n)**. The SDK default remains `review-each`; both demos expose the choice. Retake replaces the current page, and every page still requires review or explicit discard before export.
- **Find edges** (**Kanten finden**) reruns detection from the original in the corner editor while retaining page settings. Proposals require Apply; cancelling preserves the previous crop, and unsuccessful detection keeps the current selection.
- Finger-following horizontal page swipes at fit, with proportional neighboring-page transitions, short-gesture rebound and reduced-motion support. Optional `ImageViewer.onPageSwipe` leaves standalone page navigation with the host.
- Prefer a supported native camera photo from the existing track, retaining immediate frozen feedback and the secured full video frame as a fallback. Preserve cancellation, continuous capture and resource limits without a second camera stream.

### Fixed

- Keep live detection and automatic capture running when media time remains constant but presented-frame counters advance. Separate result freshness from bounded observation cadence so fresh slower measurements can advance stability; smooth only the displayed contour.
- Import high-resolution JPEG, PNG and WebP photos with proportional working-size adjustment while preserving original bytes and source coordinates. Keep corner editing bounded as well.
- Avoid premature memory-limit errors when changing filters on large, nearly full-frame scans by planning actual processing buffers. Preserve fitting source detail before perspective extraction instead of adding an unnecessary resize.
- Keep supported complete document boundaries around internal fold panels, recover supported low-contrast outer edges and determine the final still crop independently of inaccurate live hints. These changes do not reconstruct absent edges or flatten paper.
- Imported images offer **Replace image** (**Bild tauschen**) through a single-image picker; camera captures retain **Retake** (**Wiederholen**). Cancelling or failing replacement preserves the prior candidate/page and remaining imports.
- Give review more image space: place replacement, direct discard and Add page below the document with equal-width mobile actions; remove the extra Undo/Original row, retain labelled tool-local Undo and show inline neutral adjustment resets. Keep Filter's existing Auto default without an extra reset action, center shared-viewer zoom, keep counted hints at the bottom right and correct the filter icon.
- Hide the session-close X inside editing tools and make Escape follow local cancellation and focus restoration. Preserve touch activation of adjustment resets and prevent accidental native selection/callouts without changing native form editing or image gestures.
- Render the Next.js reference host in its selected language from the first HTML response.

### Changed

- Raise default source admission to 256 MP and 64 MiB per file. Explicit host caps still apply; original/session retention and the 8-MP/4,096-px output caps remain unchanged. Choose a smaller working raster only when required by the configured budget.
- Update the reference hosts to Next.js 16.4.5, including its security fixes, Astro 7.4.7 and PDF.js 6.5.438. These framework dependencies belong to the reference hosts, not the scanner runtime package.

### Upgrading from 0.2.0

Use the matching 0.3.0 package, stylesheet and complete worker/model/media asset tree together; rebuild the host and recopy all assets. Load optional OCR lazily through `@ktb-tools/scanner/ocr` after confirmed scanning has closed. The scanner's existing raster result remains unchanged; OCR is a separate host-invoked operation. The SDK OCR default is Tesseract, while the reference Next.js host selects Paddle and invokes it manually.

Workspace/reference builds now require Node >=22.23.4 and pnpm 11.28.11; Node 24 LTS is recommended. SDK sound settings suppress SDK playback only; a native browser/OS camera sound is controlled separately. Existing confirmed-blob ownership and the host boundary for storage, filenames, downloads and PWA behavior remain unchanged. Preserve AGPL and all separate runtime/model/media notices.

[Full changes since 0.2.0](https://github.com/kbudisantoso/ktb.scanner/compare/v0.2.0...v0.3.0).

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
