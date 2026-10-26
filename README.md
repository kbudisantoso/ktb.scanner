# ktb.scanner

An embeddable document-scanning workflow for web applications. Built on [Scanic](https://github.com/marquaye/scanic), with a customizable React interface, reversible image processing and browser-side image/PDF export.

Add a complete scanner to your application and receive user-confirmed files and structured metadata through one integration. ktb.scanner handles the capture, review, editing and export workflow, including session state, cancellation and resource cleanup. Processing stays in the browser. A framework-independent TypeScript core, reusable React components and complete Next.js and Astro examples support integration into your own host.

The library defaults to **English** and includes **German**. Both examples default to English and automatically use German when the browser's primary language is German. An explicit DE/EN selection takes precedence. This repository is the open-source library and reference implementation. A separately hosted **KTB Scanner** example will be linked here when available.

## What your application gets

| Area | Benefit |
| --- | --- |
| Capture workflow | Camera capture or image import, Auto/Manual modes, stability feedback and independent still-image detection, followed by review, retakes and multi-page management. |
| Editing | Correct corners, perspective, rotation and output format; apply reversible profiles and image adjustments, with original/before comparison. |
| Integration | An imperative API and reusable React interface with theme tokens, localization, typed results, cancellation, recoverable errors and resource cleanup. |
| Consistent output | Ordered image blobs, an optional multi-page PDF and serializable metadata representing the same confirmed page revisions. |

The value is the complete workflow and the integration work it handles for host developers. Detection, automatic format suggestions and image cleanup remain heuristics; no general detection-quality advantage over Scanic is claimed. See [verification and known limits](docs/testing/STATUS.md) for the evidence and outstanding device acceptance.

## Built on

Document detection and perspective correction are powered by **[Scanic](https://github.com/marquaye/scanic)**. ktb.scanner wraps that engine and adds capture/session management, stability tracking, quality checks, reversible image optimization and the integrated review/export workflow.

| Dependency | Role |
| --- | --- |
| [Scanic](https://github.com/marquaye/scanic) | Classic document detection, perspective correction and the corner editor |
| [jsPDF](https://github.com/parallax/jsPDF) | Browser-side multi-page PDF generation |
| [React / React DOM](https://github.com/facebook/react) | Reusable scanner interface; peer dependencies of the library |
| [PDF.js](https://github.com/mozilla/pdf.js) | PDF preview in the Next.js demo only |
| [Next.js](https://github.com/vercel/next.js) / [Astro](https://github.com/withastro/astro) | Reference application hosts |

These projects retain their own licenses. See [dependencies and pinned versions](docs/DEPENDENCIES.md) and [NOTICE](NOTICE) for third-party boundaries, bundled notices and media credits.

## Features

| Area | Included |
| --- | --- |
| Capture | Rear-camera preference, Auto/Manual modes, manual shutter in Auto, camera restart and supported camera light |
| Automatic capture | Measured geometric stability and sharpness, progress outline, proportional frozen photo, processing feedback and optional local capture sound |
| Import | JPEG, PNG and WebP; preserved original bytes and orientation normalization |
| Crop | Independent still-image detection, perspective correction, original-resolution edge refinement, touch/keyboard corner editor with detached magnifier; explicit confirmation when detection is uncertain |
| Image profiles | Auto, Photo, Color, Grayscale and soft Black-and-white; optional paper brightening/shadow equalization and reversible brightness, contrast, sharpening and limited radial lens correction |
| Review | Direct Retake, Undo, focused editing tools, original/before comparison, fit/100%, stepped zoom, pinch and pan |
| Multiple pages | Add, replace, edit, delete and reorder; scrollable page tiles; atomic replacement and direct completion |
| Output layouts | A3/A4/A5/A6, Letter, 100 × 150 mm postcard, receipt widths and original ratio; independent portrait/landscape and image rotation |
| Image/PDF export | JPEG at quality 0.92 or PNG; one browser-generated PDF containing all confirmed pages and their actual output layouts |
| Quality hints | Image-based sharpness, lighting and edge warnings, including explicit unknown states; no OCR/readability certification |
| Integration | DOM-free core, separate React/engine/export entries, imperative controller, reusable `Scanner` and `ImageViewer`, theme tokens, text overrides, typed blobs and JSON metadata |
| Languages | English library default, built-in German, localized controls/errors and explicit language configuration |
| Diagnostics | Opt-in local recording across sessions, raw/intermediate/final artifacts, bounded memory, local ZIP download and retention; off by default |
| Reference hosts | Full Next.js workshop with two themes, samples, actual downloads and lazy PDF.js preview; small Astro host using the same built package |

There is no built-in upload, account, document persistence, service worker, OCR text layer, PDF import or cloud synchronization. TIFF/HEIC import and general paper flattening are outside the current implementation. Lens correction is a bounded radial model, not full camera calibration. Detection, automatic format suggestions and cleanup remain heuristics; see [verification and known limits](docs/testing/STATUS.md).

## Run the demo applications

Requirements: Node **>=22.13.0** (Node 24 LTS recommended), **pnpm 11.15.1**, and Python 3 for independent archive checks. No API key, `.env`, backend or external scanner service is required.

```sh
git clone https://github.com/kbudisantoso/ktb.scanner.git
cd ktb.scanner
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://localhost:3000**. `pnpm dev` builds the library and copies its worker/media assets before starting Next.js. After editing library code, rebuild it and recopy assets with `pnpm build:library && pnpm assets`.

In the workshop:

1. Choose **Scan document** to open the scanner, **Import images** for existing files, or the sample-documents button for synthetic examples.
2. Capture/import, confirm uncertain corners, review the result and use **Retake** to take another image. Add more pages or choose **Finish** to export.
3. Inspect actual page images and the generated PDF, then download them deliberately. Returning to the start keeps the result; discarding is explicit.
4. Open **Options** to change language, initial profile, theme, output image format, capture cue and stabilization duration. Use **Sprache / Language** to switch DE/EN, or use `?lang=en` / `?lang=de` to override browser detection. Manual selections remain explicit in the URL when reloading.
5. Diagnostics start **off**. Enable them explicitly if required; recorded document bytes remain local to that page session. Reloading loses in-memory scans and diagnostics.

The Astro example runs separately:

```sh
pnpm dev:astro
```

Open **http://localhost:4321** or **http://localhost:4321/?lang=en**. Its language control also localizes the scanner and download labels. Camera/import, processing and export use the same library.

Build and run the production Next.js example:

```sh
pnpm build
pnpm --filter @ktb/demo-next start --port 3000
```

`pnpm build` builds the library/assets and both hosts. For a local preview of the built static Astro example, run `pnpm --filter @ktb/demo-astro preview`; its deployable site is `apps/demo-astro/dist/`. These commands do not deploy a public service.

### Phone access over local Wi-Fi

A phone camera requires a secure browser context. Plain `http://<Mac-LAN-IP>:3000` is generally insufficient. Put phone and computer on the same network, prepare a trusted local CA and a server certificate covering the exact LAN IP/hostname, install/trust that CA on the test phone, and keep keys/certificates outside Git.

On macOS, one option is [mkcert](https://github.com/FiloSottile/mkcert). Substitute your computer's current LAN address:

```sh
brew install mkcert
mkcert -install
mkdir -p .certificates/local
mkcert -cert-file .certificates/local/server.pem \
  -key-file .certificates/local/server.key \
  192.168.1.20 localhost 127.0.0.1
mkcert -CAROOT
```

The last command prints the CA directory. Transfer only its public `rootCA.pem` to your test iPhone, install the certificate profile in Settings, then enable it under **Settings > General > About > Certificate Trust Settings**. [Apple's certificate trust instructions](https://support.apple.com/en-us/102390) explain the additional trust step. Never transfer `rootCA-key.pem` or the server's private key. These files must not enter Git. For Android and other platforms, follow mkcert's mobile-device instructions and check browser trust before camera testing.

Prepare the library/assets, then start HTTPS with your actual certificate paths:

```sh
pnpm build:library
pnpm assets
SCANNER_DEV_ORIGINS=192.168.1.20 pnpm --filter @ktb/demo-next dev:https \
  --port 3443 \
  --experimental-https-key /absolute/path/to/server.key \
  --experimental-https-cert /absolute/path/to/server.pem
```

Open `https://192.168.1.20:3443` on the phone and allow camera access. The development computer and server must stay running. Include the exact hostname/IP in `SCANNER_DEV_ORIGINS`, without protocol or port, so Next.js allows its development resources. Reissue the server certificate if the LAN address changes. Verify certificate trust, expiry and local firewall access. Do not rely on bypassing certificate warnings. See the [HTTPS integration guide](docs/INTEGRATION.md#phone-access-and-https).

## Use the library in your own project

### 1. Obtain and install the package

The npm organization is `ktb-tools`; **`@ktb-tools/scanner@0.1.0` is published** (tag `v0.1.0`, commit `d277d32d6f9df52c6c95dd31e79885ddd3b11793`). Install it with `pnpm add @ktb-tools/scanner@0.1.0 react@19 react-dom@19`. The new `OpenOptions.entry` API described below is unreleased; use a locally built archive to try it. Do not overwrite the published version. See the [release guide](docs/PUBLISHING.md#registry-release).

From this repository:

```sh
pnpm install --frozen-lockfile
mkdir -p artifacts/local/packages
pnpm --filter @ktb-tools/scanner pack --pack-destination "$PWD/artifacts/local/packages"
```

The package's `prepack` builds clean output. With the current version, this creates `artifacts/local/packages/ktb-tools-scanner-0.1.0.tgz`, including built entry points, declarations, CSS, complete worker/media assets, source/build scripts, license and dependency notices.

From your host project, install that archive and the React peers:

```sh
pnpm add --ignore-scripts /absolute/path/to/ktb.scanner/artifacts/local/packages/ktb-tools-scanner-0.1.0.tgz react@19.3.1 react-dom@19.3.1
```

The archive is already built and needs no dependency install scripts; `--ignore-scripts` also avoids an unnecessary dependency postinstall prompt in pnpm 11. Use a bundler with ESM, dynamic imports and CSS support, for example Next.js, Astro or Vite. The ready-made UI requires React/React DOM 19 even when the host uses another framework. Core-only consumers do not need to render React. Within this workspace the examples use `workspace:*`; external projects should consume a reproducible package artifact, not an unbuilt sibling directory.

### 2. Serve the assets from your host

Create `scripts/copy-scanner-assets.mjs` in your project:

```js
import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('./assets/', import.meta.resolve('@ktb-tools/scanner')));
const destination = 'public/scanner-assets';
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
```

Run it from the host project root before development and every production build:

```sh
node scripts/copy-scanner-assets.mjs
```

`public/` is the static directory used by Next.js, Astro and Vite; adapt it for other hosts. Preserve the **entire** asset tree, including notices, engine code, both workers and sound files. Serve it at `/scanner-assets/` on the same origin as the application. A nested deployment needs the corresponding public URL in `assetBaseUrl`. There is no CDN fallback and no runtime API key.

Import the styles once in your global/client entry (the root layout for Next.js):

```ts
import '@ktb-tools/scanner/styles.css';
```

Verify `/scanner-assets/processing.worker.js`, `/scanner-assets/pdf.worker.js` and `/scanner-assets/scanic.js` return JavaScript, not an HTML fallback/404. Your host CSP must allow the actual module workers, Blob previews/media, injected editor styles and any required WASM execution. No global cross-origin isolation is required. [Asset/CSP details](docs/INTEGRATION.md#assets-csp-and-lazy-loading).

### 3. Choose an integration API

The imperative controller works in React, Astro and other browser hosts. Call it from a client-side interaction after the mount exists:

```ts
import type { ScanResult } from '@ktb-tools/scanner';
import '@ktb-tools/scanner/styles.css';

export async function scanDocument(
  mount: HTMLElement,
  initialFiles?: File[],
  signal?: AbortSignal,
): Promise<ScanResult> {
  const { createScanner } = await import('@ktb-tools/scanner/react');
  const scanner = createScanner({
    mount,
    assetBaseUrl: '/scanner-assets/',
    locale: 'de',
    initialMode: 'auto',
    autoCaptureStabilityMs: 1000,
    imageType: 'image/jpeg',
    shutterSound: 'off',
    createPdf: true,
  });
  try {
    return await scanner.open({ initialFiles, signal });
  } finally {
    await scanner.destroy();
  }
}
```

An empty open shows the capture/import workspace. To enter the existing camera directly from the host button, use `scanner.open({ entry: 'camera', signal })`. `entry` accepts `workspace` (default) or `camera`; it is independent of `initialMode: 'auto' | 'manual'`. Nonempty `initialFiles` always enter import/review without requesting a camera, even with `entry: 'camera'`; an empty array does not override the entry. Invalid entries reject with `CONFIG_INVALID` before resources open, including when files are supplied. Camera denial retains retry, import and cancellation. The mount belongs exclusively to the scanner. Forward a host `AbortSignal` for navigation/unmount. Do not create controllers during SSR or module initialization; importing the core/React entry itself is SSR-safe. Keep at most one active session per controller. A destroyed controller cannot reopen.

For React/Next.js, use the shared declarative component in a client module:

```tsx
'use client';
import { lazy, Suspense, useState } from 'react';
import type { ScanResult } from '@ktb-tools/scanner';

const Scanner = lazy(() =>
  import('@ktb-tools/scanner/react').then((module) => ({ default: module.Scanner })),
);

export function DocumentCapture({ onScan }: { onScan: (result: ScanResult) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Scan document</button>
      {open && (
        <Suspense fallback={<p role="status">Opening scanner...</p>}>
          <Scanner
            open
            openOptions={{ entry: 'camera' }}
            options={{ assetBaseUrl: '/scanner-assets/', locale: 'en', createPdf: true }}
            onResult={(result) => {
              setOpen(false);
              onScan(result);
            }}
            onError={(error) => {
              setOpen(false);
              console.error(error);
            }}
          />
        </Suspense>
      )}
    </>
  );
}
```

The component owns mount/unmount cleanup. Options are captured on opening; close/reopen to apply another locale or configuration. Callback updates do not restart sessions. `openOptions` accepts `entry: 'camera' | 'workspace'`, initial files, cancellation, a per-open `defaultProfile` and `autoCaptureStabilityMs`. The [Next.js host](apps/demo-next/app/page.tsx) and [Astro host](apps/demo-astro/src/client.ts) are complete working references.

### 4. Handle results and file ownership

`ScanResult` is `{ status: 'cancelled' }` or a confirmed result with `schemaVersion`, `sessionId`, ordered `pages` and an optional PDF `Blob`. Each page has a stable accepted ID, revision, image `Blob` and JSON-serializable metadata. Optional originals require `includeOriginals: true`. Failed processing/export stays recoverable in the session; an incomplete PDF is not returned as a successful document.

The host owns confirmed blobs after the scanner closes. For previews/downloads create object URLs, then revoke them when replaced or the view is removed:

```ts
export function imageDownload(page: { image: Blob }, index: number): HTMLAnchorElement {
  const link = document.createElement('a');
  const url = URL.createObjectURL(page.image);
  link.href = url;
  link.download = `scan-${index + 1}.${page.image.type === 'image/png' ? 'png' : 'jpg'}`;
  link.textContent = `Download page ${index + 1}`;
  return link;
}
```

Append the link to your UI and revoke its URL with `URL.revokeObjectURL(link.href)` when removing it. A PDF link uses `result.pdf` and a `.pdf` filename. Downloads should follow an explicit user action. See [result gallery and PDF preview](apps/demo-next/app/Results.tsx).

For a future upload, build a `FormData` payload in the host:

```ts
import type { ScanResult } from '@ktb-tools/scanner';

export function scanPayload(result: Extract<ScanResult, { status: 'confirmed' }>): FormData {
  const data = new FormData();
  result.pages.forEach((page, index) => {
    data.append('pages', page.image, `scan-${index + 1}.${page.image.type === 'image/png' ? 'png' : 'jpg'}`);
  });
  if (result.pdf) data.append('pdf', result.pdf, 'scan.pdf');
  data.append('metadata', new Blob([JSON.stringify({
    schemaVersion: result.schemaVersion,
    sessionId: result.sessionId,
    pages: result.pages.map(({ id, revision, metadata }) => ({ id, revision, metadata })),
  })], { type: 'application/json' }));
  return data;
}
```

The library sends nothing. Your host supplies its endpoint, authentication, cancellation and server-side file/metadata validation. Do not place service credentials in the scanner configuration.

## Configuration and localization

| Option | Default / behavior |
| --- | --- |
| `locale` | `en`; built-in `en` and `de`, independent of paper-region inference |
| `texts` | Optional host overrides; existing German message keys remain supported, and English default text can also be overridden |
| `defaultProfile` | `auto`; accepts `auto`, `photo`, `color`, `grayscale`, `bw`; an open-call override wins |
| `initialMode` | `auto`; `manual` retains detection but captures only on shutter |
| `autoCaptureStabilityMs` | 1,000; any integer **100-5,000 ms**, with a per-open override. Demo presets are 400/600/800/1,000/1,200/1,500/2,000 ms |
| `imageType` | `image/jpeg` at 0.92; `image/png` is also supported |
| `onPreferenceChange` | Optional notification of real SDK UI changes to `initialMode` / `imageType`, including cancelled sessions; unreleased |
| `createPdf` | `true`; raster PDF without searchable OCR text |
| `shutterSound` | `camera` (default) or `reflex`, both CC0; `off` creates no sound/context/request |
| `shutterSoundUrl` | Optional host-owned audio URL; overrides the cue, while `off` stays silent. See [custom audio](docs/SOUNDS.md) |
| `paperRegion` | Optional ISO region as a weak A4/Letter prior; no GPS/IP permission |
| `theme` | Semantic `--scanner-*` CSS variables |
| `includeOriginals` | `false`; original bytes/EXIF are returned only when explicitly enabled |
| `limits` | Optional positive integer overrides for resource budgets |
| `diagnostics` | Omitted/off; opt-in receiver owned by the host |

English is explicit and stable; the library does not silently follow browser language. For German set `locale: 'de'`. `createTranslator('de')` is available from the DOM-free core for a matching host interface. Placeholder values support labels such as `t('Seite {number}', { number: 2 })`. `ImageViewer` also accepts `locale`, `texts`, `image`, optional matching `before`, `alt` and `resetKey`.

The unreleased `onPreferenceChange` option reports real global changes immediately, including before a later cancellation. Its exported `ScannerPreferenceChange` union contains only `{ preference: 'initialMode', value: 'auto' | 'manual' }` or `{ preference: 'imageType', value: 'image/jpeg' | 'image/png' }`. Apply saved values through the existing `initialMode` / `imageType` options on a later opening. Both controller and React `options` use the same callback; React reaches the latest handler without restarting. Initialization, unchanged values and page edits produce no event. Persistence, validation/migration/reset, theme and sound storage belong to the host. See [host preference integration](docs/INTEGRATION.md#global-ui-preferences-unreleased).

Style the reusable UI without duplicating scanner logic:

```ts
const theme = {
  '--scanner-background': '#f4f6f2',
  '--scanner-surface': '#ffffff',
  '--scanner-text': '#172a22',
  '--scanner-accent': '#176449',
  '--scanner-font': 'system-ui, sans-serif',
};
```

Pass this as `theme` in either API. The unreleased UI-theme extension also applies theme variables to the backdrop, adds primary/warning foregrounds and camera palette/focus tokens, and lets standalone `ImageViewer` consume inherited `--scanner-font` directly. Existing defaults stay unchanged; see the [token contract](docs/adr/0026-complete-ui-theme-tokens.md). Full [configuration, viewer and lifecycle details](docs/INTEGRATION.md).

Default limits: **20 pages**, **20 MiB/file**, **24 MP input**, **100 MiB originals**, **8 MP/4,096 px output** without upscaling, **128 MiB retained results**, **384 MiB estimated working buffers**, and one high-resolution page at a time. These are configurable budgets, not a browser RSS guarantee. Extremely long receipts remain limited by source/output resolution.

## Package entry points

| Entry | Responsibility |
| --- | --- |
| `@ktb-tools/scanner` | DOM-free session, types, geometry, profiles, locale helpers and metadata |
| `@ktb-tools/scanner/react` | `createScanner`, `Scanner` and reusable `ImageViewer` |
| `@ktb-tools/scanner/scanic` | Abortable worker adapter for classic Scanic detection/correction |
| `@ktb-tools/scanner/export` | Serial images and browser PDF creation |
| `@ktb-tools/scanner/styles.css` | Scoped styles and theme variables |

React/engine resources load on scanner open; PDF generation and the reference PDF.js viewer load when needed. Serve controlled assets locally. No service worker is registered and no backend or global cross-origin isolation is required.

## Verify and contribute

```sh
pnpm test:core
pnpm test:release
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm exec playwright install chromium firefox webkit
pnpm test:browser
pnpm check:docs
pnpm check:package
```

Sound tests mute physical output while exercising native audio behavior. Browser emulation and synthetic inputs do not replace phone or assistive-technology acceptance. See [test status](docs/testing/STATUS.md), [device protocol](docs/testing/DEVICE-PROTOCOL.md), [contribution guide](CONTRIBUTING.md) and [security policy](SECURITY.md).

Further documentation: [package API](packages/scanner/README.md), [requirements](docs/REQUIREMENTS.md), [implementation contract](docs/SPECIFICATION.md), [decisions](docs/DECISIONS.md), [ADRs](docs/adr/README.md), [dependencies](docs/DEPENDENCIES.md), [publishing status](docs/PUBLISHING.md) and [changelog](CHANGELOG.md).

## License

Project source is [GNU AGPL version 3](LICENSE), SPDX `AGPL-3.0-only`. Third-party code/media retain their own licenses and notices. The two supplied capture recordings are CC0-1.0, with creator/source attributions and the full dedication included. Preserve dependency/media notices when distributing the package. See [dependencies](docs/DEPENDENCIES.md).

The [third-party audit](docs/testing/LICENSE-AUDIT.md) records the verified distribution checks and replacement of restricted audio with CC0 recordings. Both reference hosts link their generated full license collection and project source. `pnpm check:notices` verifies delivered notice text after building.
