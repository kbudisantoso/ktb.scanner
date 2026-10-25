# ktb.scanner

An embeddable browser document scanner with a framework-independent TypeScript core, a themeable React interface, classic Scanic detection and local image/PDF export.

Capture a page or import JPEG, PNG or WebP, correct its corners, choose a reversible image profile, arrange multiple pages and export JPEG/PNG plus a multi-page raster PDF. Processing stays in the browser. There is no upload, account, automatic persistence, service worker or OCR text layer.

## Run locally

Use Node >=22.13 (Node 24 LTS recommended), pnpm 11.15.1 and Python 3 for independent ZIP checks.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The Next.js reference application runs at `http://localhost:3000`. `pnpm dev:astro` starts the smaller Astro integration at `http://localhost:4321`. Both build the library and copy its controlled assets. A phone camera needs a trusted HTTPS connection; see [local HTTPS and integration](docs/INTEGRATION.md#phone-access-and-https).

## Library

| Entry point | Responsibility |
| --- | --- |
| `@ktb/scanner` | DOM-free session, geometry, profiles, metadata and types |
| `@ktb/scanner/react` | `createScanner`, the declarative `Scanner` component and reusable `ImageViewer` |
| `@ktb/scanner/scanic` | Abortable worker adapter for classic Scanic detection and correction |
| `@ktb/scanner/export` | Serial image and browser PDF creation |
| `@ktb/scanner/styles.css` | Scoped styles and theme tokens |

React 19 and React DOM are peers. UI, camera, engine and PDF resources load when needed. All worker/media assets are served locally, with no CDN fallback. The host owns returned blobs and any later upload. The reference app demonstrates two themes, document contexts, real PDF.js previews, downloads and explicitly opt-in local diagnostics. Astro uses the same built package.

Without a host profile override, Auto immediately chooses Photo or Color and applies appropriate adjustments. Manual profiles, tones, lens settings, format and orientation remain editable. Standard paper formats correct the whole crop to the chosen aspect ratio; they do not measure physical paper size. Automatic capture defaults to one second of measured stable evidence, configurable through `autoCaptureStabilityMs` in configuration or per open, with bounded pauses for uncertainty. The reference Scan options expose experimental durations from 100 to 5,000 ms.

This repository contains the workspace package; a registry release of `@ktb/scanner` has not been published. See [package API](packages/scanner/README.md), [integration](docs/INTEGRATION.md) and [distribution](docs/PUBLISHING.md).

## Verify

```sh
pnpm test:core
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm exec playwright install chromium firefox webkit
pnpm test:browser
pnpm check:docs
pnpm check:package
```

Browser tests exercise both built examples and independently render the generated PDFs. Sound tests keep physical output muted while exercising native audio behavior. Synthetic and emulated tests do not replace physical-device acceptance; see [verification status](docs/testing/STATUS.md) and [device protocol](docs/testing/DEVICE-PROTOCOL.md).

## Documentation and contributions

[Requirements](docs/REQUIREMENTS.md), [implementation contract](docs/SPECIFICATION.md), [decisions](docs/DECISIONS.md), [ADRs](docs/adr/README.md), [dependencies](docs/DEPENDENCIES.md), [contributing](CONTRIBUTING.md), [security](SECURITY.md) and [changelog](CHANGELOG.md). Public documentation is English; the default interface is German and its texts can be replaced by the host.

## License

Project source is licensed under [GNU AGPL version 3](LICENSE), SPDX `AGPL-3.0-only`. Third-party code and media retain their own licenses and notices. The integrated Pixabay audio clips are not relicensed under AGPL; preserve their individual notices and do not distribute them as a standalone sound collection. See [dependencies and media notices](docs/DEPENDENCIES.md).
