# @ktb/scanner

An embeddable browser library for document capture, image import, review and multi-page raster-PDF export. Originals and results remain in memory. No built-in upload or OCR text layer.

## Entry points

- `@ktb/scanner`: DOM-free session, types, geometry, profiles and metadata.
- `@ktb/scanner/react`: `createScanner`, themeable `Scanner` and reusable `ImageViewer` components.
- `@ktb/scanner/scanic`: classic Scanic in an abortable worker.
- `@ktb/scanner/export`: serial image and PDF creation.
- `@ktb/scanner/styles.css`: scoped styles and semantic theme variables.

React 19 and React DOM are peers. Build the library and serve the complete `dist/assets/` directory at a same-origin URL. Workspace examples do this with `pnpm build:library` and `pnpm assets`. No CDN fallback, service worker or global cross-origin isolation is required.

```ts
import '@ktb/scanner/styles.css';

async function scan(mount: HTMLElement, initialFiles?: File[]) {
  const { createScanner } = await import('@ktb/scanner/react');
  const scanner = createScanner({
    mount,
    assetBaseUrl: '/scanner-assets/',
    initialMode: 'auto',
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

`initialFiles` opens review without requesting a camera. `open({ signal })` supports host cancellation and returns `{ status: 'cancelled' }`. Recoverable processing/export errors keep the session open. `destroy()` stops owned tracks and workers and releases preview resources. One session per controller; a destroyed controller cannot reopen. The host owns confirmed image/PDF blobs and serializable metadata.

`defaultProfile` accepts `auto`, `photo`, `color`, `grayscale` or `bw`. An `open()` override takes precedence over controller configuration; without either, Auto chooses and applies Photo or Color immediately. Grayscale and soft monochrome remain manual choices. All edits are recalculated from the original. `paperRegion` is a weak regional A4/Letter preference, not a GPS request or a size measurement. Manual paper formats and orientation take precedence; paper axes are separate from 90-degree image rotation.

`autoCaptureStabilityMs` configures the minimum measured stability window, default 1,000 ms. A per-open override takes precedence. Both supplied values must be safe integers >=100. Core users can pass a second argument to `new AutoCapture('auto', 500)`; exported `DEFAULT_AUTO_CAPTURE_STABILITY_MS` and `AUTO_CAPTURE_STABILITY_PRESETS_MS` describe the default and reference choices. Fresh distinct observations, geometry and sharpness still govern capture, so sampling/processing can exceed the selected minimum. See [integration](../../docs/INTEGRATION.md#capture-stability).

`SHUTTER_SOUNDS` and `ShutterSoundId` describe twelve local cues plus silence. `ImageViewer` accepts an image blob, optional matching unoptimized crop, accessible alternative text and a reset key. It supports fit/100 percent, zoom steps, pinch, pan and held comparison. Use the same CSS and bounded container height. The parent owns blobs; the component owns its object URLs.

The public source and complete workspace build inputs are in [the project repository](https://github.com/kbudisantoso/ktb.scanner). See its [integration guide](https://github.com/kbudisantoso/ktb.scanner/blob/main/docs/INTEGRATION.md) for the declarative React API, theme/text options, limits, assets, HTTPS, downloads and FormData. [Verification status](https://github.com/kbudisantoso/ktb.scanner/blob/main/docs/testing/STATUS.md) distinguishes automated tests from physical-device acceptance. A registry release has not yet been published.

Project source: GNU AGPL version 3 only; see LICENSE. Third-party code and integrated audio retain separate notices under `dist/assets/`. Audio is supplied as scanner feedback, not a standalone sound collection.
