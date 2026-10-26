# Dependency capability review

Reviewed 26 October 2026 for published `@ktb-tools/scanner@0.1.0`. This review addresses the specific reported Socket findings. It does not certify every dependency, future version, host integration or execution path.

## Evidence and versions

The public npm tarball was downloaded and compared byte for byte with the inspected GitHub candidate artifact; they match. The npm license is `AGPL-3.0-only` and `latest` resolves to 0.1.0.

Exact npm archives for core-js 3.51.0, regenerator-runtime 0.13.11, canvg 3.0.11, html2canvas 1.4.1, Scanic 1.7.1 and React DOM 19.3.1 were downloaded and checked against npm's SHA-512 integrity before static inspection. Their install scripts were not executed for this review.

The workspace lock and embedded PDF worker use core-js **3.50.0**. Socket reports **3.51.0** in the dependency graph because upstream jsPDF/canvg declarations allow compatible newer versions. A consumer does not inherit this repository's lockfile. Static inspection covered the reported 3.51.0; the browser tests cover the built library assets. These are distinct scopes.

## Findings

| Reported finding | Verified behavior | Disposition |
| --- | --- | --- |
| `https://scanner.invalid/` URL string | `resolveShutterSoundUrl` uses this base only to parse relative host-supplied URLs and validate the protocol. It returns the original configured URL or the local asset URL, never the placeholder URL. | No request to this address is initiated by this validation. |
| Copyleft / non-permissive license | Project source deliberately declares AGPL-3.0-only. Socket classifies copyleft and non-permissive licenses as license alerts. | Expected license characteristics; preserve the selected license and all third-party obligations. |
| React DOM `static.js` allegedly loads an opaque native addon | The archive has no files ending in `.node`. `require('./static.node')` resolves to `static.node.js`, a JavaScript file selecting JavaScript server implementations. The package export map also explicitly selects `./static.node.js` for Node. | The specific native-addon allegation is a false positive. This does not certify all React code. |
| core-js dynamic `Function` | Real dynamic-code constructs exist, including global-object discovery, compatibility implementations, Node-module discovery and string-based scheduling handlers. | Do not describe every instance as harmless or unreachable. The scanner's tested modern-browser import/export path works without JavaScript `unsafe-eval`. |
| regenerator-runtime dynamic `Function` | The global-runtime assignment uses `globalThis` when available and a `Function` fallback otherwise. | Compatibility capability; not a requirement for the tested modern-browser scanner flow. |
| core-js network capability | The inspected URLSearchParams implementation can wrap native `fetch`/`Request` to normalize arguments when the native URL implementation is insufficient. | This wrapper forwards caller-requested operations; the inspected code does not initiate an independent request. |
| canvg network capability | SVG parsing/rendering supports loading source SVGs and linked images via fetch. It is a transitive jsPDF dependency. | A real capability. The scanner's PDF worker embeds PNG/JPEG bytes using `addImage`; it does not invoke SVG rendering. |
| html2canvas network capability | DOM rendering can load image URLs and use configured proxy requests. It is a transitive jsPDF dependency. | A real capability. The scanner does not generate PDFs from HTML or call html2canvas. |
| Scanic network capability | Its generic WASM initializer accepts URLs; the separately distributed ML detector can load models and has a CDN default. | The scanner explicitly selects classic detection and uses the embedded WASM and controlled same-origin assets. The ML detector/model files are not copied into those assets. |
| core-js `postinstall` | The exact 3.51.0 script prints a support banner, reads environment flags and reads/writes a temporary banner-history file. No network operation appears in that script. | Real install-time execution, with the inspected limited behavior. The prebuilt scanner archive needs no dependency lifecycle scripts; hosts can install with `--ignore-scripts`. |

The library's own sound loader uses fetch for the selected recording. Built-in recordings use controlled local assets. A host can explicitly supply a cross-origin `shutterSoundUrl`; this intentionally permits a request to that host-configured destination and is outside the default same-origin test below. Scanner worker asset URLs themselves are checked against the application's origin.

## Runtime verification

[network-csp.spec.ts](../../tests/browser/network-csp.spec.ts) imports two synthetic pages, runs real classic detection/processing, exports JPEG or PNG and downloads a generated PDF. It blocks external HTTP(S) destinations and records attempted requests, including worker requests. Both document and worker responses receive a CSP that permits same-origin assets and WebAssembly compilation but omits JavaScript `'unsafe-eval'`. Blob/data image previews and the host's inline scripts/styles remain allowed.

All **eight cases passed**: two image types in Chromium, Firefox, WebKit and mobile WebKit. Processing, Scanic and PDF worker assets were actually requested, PDFs were produced, and no external HTTP(S) request was observed. An initial test-interceptor error treated WebKit Blob previews as HTTP requests; it was corrected by allowing non-network URLs to continue. The final run has no skips or retries. Typecheck, formatting and documentation checks also passed.

Reproduce against the built reference hosts:

```sh
pnpm build
pnpm exec playwright test tests/browser/network-csp.spec.ts --workers=2
```

This verifies the specified fixture-driven import/export path, not every optional dependency API, camera device, custom host endpoint or future version. Capability alerts should be reviewed individually; neither a score nor this review is a blanket waiver.

## Primary references

- [React DOM 19.3.1 static entry](https://raw.githubusercontent.com/facebook/react/v19.3.1/packages/react-dom/npm/static.js) and [JavaScript Node implementation entry](https://raw.githubusercontent.com/facebook/react/v19.3.1/packages/react-dom/npm/static.node.js).
- [Node CommonJS file resolution](https://nodejs.org/api/modules.html#file-modules).
- [Exact core-js 3.51.0 archive](https://registry.npmjs.org/core-js/-/core-js-3.51.0.tgz), notably `internals/global-this.js`, `internals/function-bind.js`, `internals/async-iterator-prototype.js`, `internals/get-built-in-node-module.js`, `internals/schedulers-fix.js`, `internals/task.js`, `modules/web.url-search-params.constructor.js` and `postinstall.js`.
- [Exact regenerator-runtime archive](https://registry.npmjs.org/regenerator-runtime/-/regenerator-runtime-0.13.11.tgz), notably `runtime.js`.
- [Exact canvg archive](https://registry.npmjs.org/canvg/-/canvg-3.0.11.tgz), [html2canvas archive](https://registry.npmjs.org/html2canvas/-/html2canvas-1.4.1.tgz) and [Scanic archive](https://registry.npmjs.org/scanic/-/scanic-1.7.1.tgz).
- [Socket license alert categories](https://docs.socket.dev/docs/license) and [score methodology](https://docs.socket.dev/docs/package-scores).
- Scanner implementation: [sound URL validation](../../packages/scanner/src/sounds.ts), [same-origin worker URLs](../../packages/scanner/src/worker-client.ts), [classic processing](../../packages/scanner/src/processing.worker.ts) and [raster PDF worker](../../packages/scanner/src/pdf.worker.ts).
