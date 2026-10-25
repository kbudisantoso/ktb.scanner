# Integration and local operation

Use Node >=22.13 (Node 24 LTS recommended), pnpm 11.15.1 and Python 3 for independent ZIP checks. The lockfile records the installed workspace resolution. Build the library before using its public entry points.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm test:core
pnpm test
pnpm exec playwright install chromium firefox webkit
pnpm test:browser
pnpm licenses:inventory
pnpm check:docs
pnpm check:package
```

`pnpm dev` builds/copies assets and starts Next.js on port 3000; `pnpm dev:astro` starts Astro on 4321. Rebuild after library changes. Browser tests start their own production hosts on ports 3177 and 4377; these must be free. They do not reuse unrelated servers. Node 24 LTS is recommended for reproducibility; browser archive installation previously stalled under Node 26.5.0 and succeeded with the Node 24 CLI.

## Imperative integration

Load only types and CSS initially, then import UI in a client-side action:

```ts
import type { ScannerController } from '@ktb/scanner';
import '@ktb/scanner/styles.css';

let scanner: ScannerController | undefined;
async function scan(mount: HTMLElement, initialFiles?: File[]) {
  const { createScanner } = await import('@ktb/scanner/react');
  scanner = createScanner({
    mount,
    assetBaseUrl: '/scanner-assets/',
    initialMode: 'auto',
    autoCaptureStabilityMs: 1000,
    imageType: 'image/jpeg',
    createPdf: true,
    includeOriginals: false,
    context: 'invoice',
    theme: { '--scanner-accent': '#176449' },
    texts: { 'Dokument scannen': 'Scan document' },
  });
  try {
    return await scanner.open({ initialFiles });
  } finally {
    await scanner.destroy();
    scanner = undefined;
  }
}
```

Call `destroy()` on host unmount too. `open({ signal })` and destruction cancel active resources and resolve `cancelled`. A controller can reopen after a session if it has not been destroyed; concurrent opens are rejected. The mount is an exclusive scanner container; unrelated host nodes are not overwritten. `initialFiles` enters import/review without a camera prompt.

The adapter returns `Processed | CropRequired`. A `crop-required` state has source size, proposed corners and `not-detected`/`capture-conflict`, with no image/format. Custom hosts must obtain explicit corner confirmation before issuing a processing request with those corners. Never convert it into a full-original page. The packaged UI handles this; cancelled replacement preserves the existing page. Unexpected missing export geometry fails with `CROP_REQUIRED`, not partial success.

## Capture stability

`autoCaptureStabilityMs` controls measured stable time before Auto capture, default 1,000 ms. Override per session with `scanner.open({ autoCaptureStabilityMs: 500 })`; open call > configuration > default. Both supplied values must be safe integers >=100, otherwise `CONFIG_INVALID` is raised before opening. The React `Scanner` accepts the same fields through `options` and `openOptions`, captured when opening. Manual capture is unaffected.

Core integrations can use `new AutoCapture('auto', 500)`. `DEFAULT_AUTO_CAPTURE_STABILITY_MS` and `AUTO_CAPTURE_STABILITY_PRESETS_MS` are exported from `@ktb/scanner`. The presets are 100/200/300/500/750/1,000/1,500/2,000/3,000/5,000 ms; other integer values >=100 also work. In the reference application choose **Optionen > Stabilisierungsdauer** before starting a session.

This is a minimum measured-evidence window, not a timer or a delay after the green contour closes. At least two fresh valid observations are needed. Detection is capped at about eight jobs per second, so especially 100-300 ms values depend on sampling and processing cadence. Unknown sharpness, movement and missing evidence still pause/reset capture. Diagnostics record the resolved value in `session-open` and `camera-start`.

## Geometry, format and region

Optional `paperRegion: 'DE'` is a weak A4/Letter prior. Otherwise use the explicit region of the primary browser locale, then global A4. No GPS/IP request or additional permission is introduced. Clear geometry/manual choices override the prior. Locale is not a measured capture location. The map follows Unicode CLDR 48; see [ADR 0008](adr/0008-perspective-and-regional-paper-format.md).

For custom UI, core exports `resolvePaperPreference(region, locales)`, `estimatePaperRatio(size, corners)` and `suggestFormat(size, { corners, preferredPaper, geometryUncertain })`. Use complete normalized source dimensions and original normalized corners, never an image already forced to a preset ratio. The adapter receives `preferredPaper` and returns the actual `Processed.format` to preserve through review/export. Unsupported edges may make a numerically stable estimate uncertain. If `uncertainPerspective` is true, `ratio` is raw edge geometry and `ratioRange` is only a model-based range; use `suggestFormat` rather than treating raw lengths as reliable Letter evidence.

Standard `FormatSelection` accepts optional `orientation: 'portrait' | 'landscape'` before separate `rotation`. Portrait plus rotation 90 produces a landscape image/PDF. UI orientation buttons describe resulting axes and account for rotation without turning text. Manual format/orientation survives later edits/replacement/export. Standard formats rectify the whole crop to the chosen ratio and fill its PDF page. Receipts/original ratio stay proportional. Metadata geometry stays independent; `physicalSizeMm` is null.

## Profile defaults and React component

`ScanProfile` is `auto | photo | color | grayscale | bw`. `open({ defaultProfile })` overrides controller configuration; without either use Auto. Explicit Auto can remove a configured manual default. Invalid values fail before opening. Each new page starts with that choice; manual page settings remain. Core `SCAN_PROFILES` supplies IDs, default German labels and recipes for host selectors.

Auto immediately chooses Photo or Color and applies processing; it never automatically removes color with Grayscale/S/W. Preserve automatic intent in `Recipe.enhancement` and actual profile/reason/statistics/suggested tones in `autoOptimization`. Manual tones override suggestions, and custom adapters must provide consistent data for Auto and omit it for manual profiles. Export recalculates image and resolution data together. This pixel heuristic is not semantic recognition; manual override/comparison remain necessary. Lens settings are independently editable, with evidence-tested Auto initially requested by Auto profile.

In a client component:

```tsx
import { lazy, Suspense, useState } from 'react';
import type { ScanResult } from '@ktb/scanner';
import '@ktb/scanner/styles.css';
const Scanner = lazy(() => import('@ktb/scanner/react').then(m => ({ default: m.Scanner })));

export function ScanButton({ onResult }: { onResult: (result: ScanResult) => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <button onClick={() => setOpen(true)}>Scan</button>
    {open && <Suspense fallback={<p>Opening scanner...</p>}>
      <Scanner
        open={open}
        className="host-scanner"
        options={{ assetBaseUrl: '/scanner-assets/' }}
        onResult={result => { setOpen(false); onResult(result); }}
        onError={() => setOpen(false)}
      />
    </Suspense>}
  </>;
}
```

`options` is `ScannerOptions` without mount; `openOptions` accepts files, signal and per-open profile. Options are captured when `open` becomes true; close/reopen for a new configuration. Callback updates do not restart sessions. Closing/unmounting cleans up without a late result callback. An explicit user cancellation resolves `cancelled`; then set `open=false`. `onError` handles opening/configuration errors; recoverable processing errors stay in the scanner. Core/React imports are SSR-safe, but invoke `createScanner` client-side. `className`, `theme` variables and `texts` are styling/localization hooks.

## Use confirmed results

The host owns returned blobs and any URLs it creates. Trigger downloads only through explicit user actions and revoke URLs when their views are removed.

```ts
const result = await scan(mount);
if (result.status === 'confirmed') {
  const first = result.pages[0];
  const url = URL.createObjectURL(first.image);
  downloadLink.href = url;
  downloadLink.download = first.image.type === 'image/png' ? 'page-1.png' : 'page-1.jpg';
  // Later, when removing this result view: URL.revokeObjectURL(url).

  const form = new FormData();
  form.append('manifest', JSON.stringify({
    schemaVersion: result.schemaVersion,
    sessionId: result.sessionId,
    pages: result.pages.map(({ id, revision, metadata }) => ({ id, revision, metadata })),
  }));
  result.pages.forEach((page, index) => {
    form.append('pages', page.image, `page-${index + 1}.${page.image.type === 'image/png' ? 'png' : 'jpg'}`);
  });
  if (result.pdf) form.append('pdf', result.pdf, 'scan.pdf');
  // Submit only through your own authorized host API.
}
```

There is no built-in endpoint. Servers must validate types, sizes, decodability, metadata and authorization independently. Optional originals keep their bytes/metadata; processed images do not inherit location/device EXIF. A session ID can contribute to a host idempotency key.

## Assets, CSP and lazy loading

`packages/scanner/scripts/build.mjs` builds processing/PDF workers, copies Scanic ESM/notices, verifies version/anchors and records the bounded `candidate-selection-and-debug-v2` instrumentation. It also collects runtime dependency notices. `scripts/copy-assets.mjs` copies complete assets into both hosts and generates SHA-256 inventories; PDF.js worker/license are Next.js-only. Never mix individual assets from different builds or serve an HTML fallback for a missing worker. Classic WASM is embedded; the optional unused ML branch may produce a build warning but is not activated.

Serve same-origin assets and allow module workers, Blob previews/media and the required styles. Typical CSP components include `worker-src 'self'`, `img-src 'self' blob: data:` and `media-src 'self' blob:`. WASM acceleration may require `script-src 'wasm-unsafe-eval'`; the classic engine has a JavaScript fallback. The editor injects styles; Next.js has its own script/nonce needs. These are integration considerations, not an already validated host CSP.

UI/engine load after opening, export PDF worker at export, corner editor when needed and PDF.js only in the selected reference PDF view. The library registers no service worker and requires no global cross-origin isolation.

## Phone access and HTTPS

`http://localhost:3000` works on the development Mac. A phone using `http://<LAN-IP>:3000` normally lacks a secure camera context. Use a locally trusted CA and a certificate whose SAN includes the exact LAN IP/hostname. Install/trust the CA deliberately on the test phone; keep all certificates/private keys outside Git. Do not bypass certificate warnings as the setup method.

Next.js supplies `dev:https`. Allow the specific LAN hostname/IP too, otherwise HTML can load while script/dev endpoints receive 403 and buttons appear inert. Origins are comma-separated hostnames/IPs, without protocol/port. For example, adapting paths and IP to your setup:

```sh
SCANNER_DEV_ORIGINS=192.168.1.20 pnpm --filter @ktb/demo-next dev:https \
  --port 3443 \
  --experimental-https-key /path/to/server.key \
  --experimental-https-cert /path/to/server.pem
```

Connect phone/Mac to the same local network and open `https://192.168.1.20:3443`. Keep the Mac/server running. This example address is not a public deployment or a guaranteed address on another network. Certificate expiry and trust must be checked. The Next.js manifest supports standalone installation, not offline use or draft recovery after browser termination.

## Diagnostics and capture cues

Diagnostics are off in both library and reference. Optional `diagnostics: { onEvent, engineBuffers?, isActive? }` can be supplied to `createScanner`; direct adapter creation accepts it as the second argument and export accepts the same option. Hosts own/bound collected artifacts separately. Without a receiver, no diagnostic images/buffers are generated. See [diagnostics](testing/DIAGNOSTICS.md) for schema, privacy, budgets, retention and manual replay.

`shutterSound` selects from core `SHUTTER_SOUNDS`/`ShutterSoundId`: `camera` (default), `deepscan`, `soul`, `notification`, `xylophone`, `beep`, `warp`, `powerdown`, `instant`, `teleport`, `transformer`, `electric`, `off`. The catalog has original product labels and local filenames. Only the selected clip is decoded in advance; playback at secured-frame time never waits for a network request. `off` makes no AudioContext or sound request. The reference offers a preview; automated tests physically mute output while exercising native audio. Preserve separate clip notices. No API key is needed for normal runtime.

## Shared React image viewer

`ImageViewer` is exported by `@ktb/scanner/react` and styled by the same stylesheet/tokens. Props: `image: Blob`, optional `before: Blob`, `alt: string`, `resetKey: string`, optional `texts` and `className`. Give its container a bounded height with available flex space. A changed reset key resets fit; source updates alone retain zoom. Supply a matching unoptimized crop as Before. The component owns/revokes object URLs; the parent owns blobs.

Tap/double tap switches fit/100%, magnifiers step zoom, pinch anchors at the midpoint and enlarged images can pan. Enter/Space toggles, +/- zooms and arrows pan. Hold Before to compare; pointer/keyboard release, cancellation, blur and visibility changes restore the result. Focused tools support Cancel/Apply and recipe undo. Finish accepts the confirmed current draft and exports directly; remaining imports require review or explicit discard. Tile cover crops are display-only.

## Limits and remaining acceptance

Default limits: 20 pages, 20 MiB/file, 100 MiB originals, 24 MP decode, 8 MP/4,096 px output, 128 MiB results and 384 MiB estimated working buffers. No artificial upscaling. PDF axes outside 10..5,000 mm fail. Long receipt text may still be limited by source/output resolution. White-paper/lens/format/quality heuristics are not physical measurement or OCR guarantees. Physical iPhone/Android camera, standalone, memory and assistive-technology acceptance remain in the [device protocol](testing/DEVICE-PROTOCOL.md) and [test status](testing/STATUS.md).
