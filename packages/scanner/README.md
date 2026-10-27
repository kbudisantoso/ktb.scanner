# @ktb-tools/scanner

An embeddable document-scanning workflow for web applications. Built on [Scanic](https://github.com/marquaye/scanic), with a customizable React interface, reversible image processing and browser-side image/PDF export.

Integrate a complete scanner and receive user-confirmed files and structured metadata through one API:

- **Capture workflow:** camera or image import, Auto/Manual capture, stability feedback, independent still-image detection, review, retakes and page management.
- **Editing:** corner/perspective correction, rotation, output formats and reversible profiles/adjustments with original/before comparison.
- **Integration:** a framework-independent core, reusable React UI, theme tokens, localization, typed results, cancellation and resource cleanup.
- **Consistent output:** ordered images, an optional multi-page raster PDF and serializable metadata from the same confirmed page revisions.

Scanic supplies document detection, perspective correction and the corner editor; jsPDF generates PDFs. ktb.scanner combines these libraries with its session, capture, processing and review workflow. Originals and results remain in memory. There is no built-in upload or OCR text layer, and no general detection-quality advantage over Scanic is claimed.

This documentation targets library **0.2.0**. Check exact registry availability before installation; a locally built package archive provides the same source-version integration. Direct camera entry, preference notifications and the complete theme tokens were introduced in 0.2.0.

## Entry points

- `@ktb-tools/scanner`: DOM-free session, types, geometry, profiles and metadata.
- `@ktb-tools/scanner/react`: `createScanner`, themeable `Scanner` and reusable `ImageViewer` components.
- `@ktb-tools/scanner/scanic`: classic Scanic in an abortable worker.
- `@ktb-tools/scanner/export`: serial image and PDF creation.
- `@ktb-tools/scanner/styles.css`: scoped styles and semantic theme variables.

For all supported CSS variables/defaults, imperative/React themes, light/dark palettes, locally served fonts, viewer inheritance and styling limits, see the [public UI styling guide](https://github.com/kbudisantoso/ktb.scanner/blob/main/docs/UI-THEMING.md).

React 19 and React DOM are peers. Build the library and serve the complete `dist/assets/` directory at a same-origin URL. Workspace examples do this with `pnpm build:library` and `pnpm assets`. No CDN fallback, service worker or global cross-origin isolation is required.

```ts
import '@ktb-tools/scanner/styles.css';

async function scan(mount: HTMLElement, initialFiles?: File[]) {
  const { createScanner } = await import('@ktb-tools/scanner/react');
  const scanner = createScanner({
    mount,
    assetBaseUrl: '/scanner-assets/',
    initialMode: 'auto',
    locale: 'en',
    autoCaptureStabilityMs: 1000,
    imageType: 'image/jpeg',
    shutterSound: 'camera', // Use 'off' to avoid audio loading and playback.
    createPdf: true,
  });
  try {
    const result = await scanner.open({ initialFiles });
    if (result.status === 'confirmed') return result;
  } finally {
    await scanner.destroy();
  }
}
```

`scanner.open({ entry: 'camera' })` opens the existing camera UI directly. React uses `<Scanner open openOptions={{ entry: 'camera' }} ... />`. `ScannerEntry` is exported from the core and React entries: `workspace | camera`, default `workspace`. `initialMode` still selects Auto/Manual only. Nonempty `initialFiles` take precedence and open review without requesting a camera; empty arrays follow `entry`. Invalid entries reject `CONFIG_INVALID` before opening, even with files. Denial keeps retry/import/cancel available. No camera access occurs from imports or SSR. `open({ signal })` supports host cancellation and returns `{ status: 'cancelled' }`. Recoverable processing/export errors keep the session open. `destroy()` stops owned tracks and workers and releases preview resources. One session per controller; a destroyed controller cannot reopen. The host owns confirmed image/PDF blobs and serializable metadata.

`locale` defaults to `en`; `de` is built in. Both examples default to English, detect a German primary browser language and honor explicit DE/EN selection. The standalone `ImageViewer` also accepts `locale`. `createTranslator(locale, texts?)` is exported from the core; existing German message-key overrides and English-text overrides remain supported. Error codes are stable while API messages default to English. See the root [README](../../README.md) for complete demo setup, package installation, asset copying, React/controller integration and result ownership.

`onPreferenceChange?: (change: ScannerPreferenceChange) => void` was added to `ScannerOptions` in 0.2.0. Both core and React entry points export the type. It reports only real SDK UI changes as `{ preference: 'initialMode', value: 'auto' | 'manual' }` or `{ preference: 'imageType', value: 'image/jpeg' | 'image/png' }`, immediately and even if the session is subsequently cancelled. Initialization, reapplying options, unchanged values, page edits and ended sessions emit nothing. Host callback failures do not interrupt scanning; React uses the current `options.onPreferenceChange` handler without reopening. Reapply values with the existing `initialMode` / `imageType` options. The host owns validation, migration, persistence and reset; the SDK uses no localStorage or cookies. See [host examples](../../docs/INTEGRATION.md#global-ui-preferences). This API is not in npm 0.1.0.

`defaultProfile` accepts `auto`, `photo`, `color`, `grayscale` or `bw`. An `open()` override takes precedence over controller configuration; without either, Auto chooses and applies Photo or Color immediately. Grayscale and soft monochrome remain manual choices. All edits are recalculated from the original. `paperRegion` is a weak regional A4/Letter preference, not a GPS request or a size measurement. Manual paper formats and orientation take precedence; paper axes are separate from 90-degree image rotation.

`autoCaptureStabilityMs` configures the minimum measured stability window, default 1,000 ms. A per-open override takes precedence. Both supplied values must be safe integers from 100 through 5,000. Core users can pass a second argument to `new AutoCapture('auto', 600)`; exported `DEFAULT_AUTO_CAPTURE_STABILITY_MS` and `AUTO_CAPTURE_STABILITY_PRESETS_MS` describe the default and reference choices. Fresh distinct observations, geometry and sharpness still govern capture, so sampling/processing can exceed the selected minimum. See [integration](../../docs/INTEGRATION.md#capture-stability).

The theme extension in 0.2.0 closes styling gaps in the existing `theme` option: backdrop/stacking, `--scanner-primary-text`, `--scanner-warning-text`/border, camera palette/overlays/focus/shutter, control/panel/mobile radii, spacing, capture chrome and viewer background/radius. An explicit root focus also applies to mobile camera unless a camera-specific focus is supplied. `ImageViewer` consumes inherited `--scanner-font` directly, without an additional prop or host font declaration. Existing ten tokens/defaults remain compatible. See the [complete public token contract](https://github.com/kbudisantoso/ktb.scanner/blob/main/docs/adr/0026-complete-ui-theme-tokens.md). These additions are not in npm 0.1.0.

`SHUTTER_SOUNDS` and `ShutterSoundId` describe `camera` and `reflex` (CC0-1.0) plus `off`. `shutterSoundUrl` accepts a host-owned recording URL; `off` remains silent even when a custom URL is configured. See [capture sounds](../../docs/SOUNDS.md) for integration and credits. `ImageViewer` accepts an image blob, optional matching unoptimized crop, accessible alternative text and a reset key. It supports fit/100 percent, zoom steps, pinch, pan and held comparison. Use the same CSS and bounded container height. The parent owns blobs; the component owns its object URLs.

The public source and complete workspace build inputs are in [the project repository](https://github.com/kbudisantoso/ktb.scanner). See its [integration guide](https://github.com/kbudisantoso/ktb.scanner/blob/main/docs/INTEGRATION.md) for the declarative React API, theme/text options, limits, assets, HTTPS, downloads and FormData. [Verification status](https://github.com/kbudisantoso/ktb.scanner/blob/main/docs/testing/STATUS.md) distinguishes automated tests from physical-device acceptance. The examples target 0.2.0; verify registry availability or use a built archive from this source. The original 0.1.0 release remains unchanged.

Project source: GNU AGPL version 3 only; see LICENSE. Third-party code and integrated audio retain separate notices under `dist/assets/`. Audio is supplied as scanner feedback, not a standalone sound collection.
