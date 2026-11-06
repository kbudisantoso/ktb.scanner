# Dependencies and versions

Project source is AGPL-3.0-only; dependencies retain their own licenses. Direct versions are pinned in manifests, with complete resolution in `pnpm-lock.yaml`. Installed package contents and actual builds determine the distributed versions.

| Package | Pin | Use | Upstream license/source |
| --- | --- | --- | --- |
| Scanic | 1.7.1 | Classic detection, perspective, corner editor | MIT; [Manifest](https://github.com/marquaye/scanic/blob/main/package.json), [API](https://github.com/marquaye/scanic/blob/main/src/scanic.d.ts) |
| jsPDF | 4.2.1 | PDF worker | MIT; [Release](https://github.com/parallax/jsPDF/releases/tag/v4.2.1), [Manifest](https://github.com/parallax/jsPDF/blob/master/package.json) |
| Tesseract.js / Tesseract.js Core | 7.0.0 / 7.0.0 | Build inputs for copied optional OCR worker and three LSTM core variants | Apache-2.0; [Worker](https://github.com/naptha/tesseract.js/tree/v7.0.0), [Core](https://github.com/naptha/tesseract.js-core/tree/v7.0.0) |
| tessdata_fast German / English | 4.1.0, commit `65727574dfcd264acbb0c3e07860e4e9e9b22185` | Optional local recognition models | Apache-2.0; [Models](https://github.com/tesseract-ocr/tessdata_fast/tree/65727574dfcd264acbb0c3e07860e4e9e9b22185), [provenance/checksums](../packages/scanner/assets/ocr/models.json) |
| PaddleOCR JavaScript SDK | 0.4.2 | Optional serial local OCR, main entry compiled into a dedicated worker | Apache-2.0; [Source](https://github.com/PaddlePaddle/PaddleOCR/tree/e5046169b225bcdfbe25d45b4e809ff0f1a69c2c/paddleocr-js) |
| ONNX Runtime Web / OpenCV.js | 1.31.1 / 4.10.0-release.1 | Paddle CPU-WASM execution and page preparation | MIT / Apache-2.0; [ORT](https://github.com/microsoft/onnxruntime/tree/v1.31.1), [OpenCV.js](https://github.com/TechStark/opencv-js) |
| PP-OCRv5 mobile detector / Latin recognizer | Pinned converted ONNX bytes and 502-character dictionary | Local Paddle models, reproducible SDK TAR packaging | Apache-2.0; [provenance and checksums](../packages/scanner/assets/ocr/paddle/models.json) |
| Tesseract GlyphLessFont | tessconfigs `3decf1c8252ba6dbeef0bf908f4b0aab7f18d113` | Invisible Unicode text in Paddle PDFs | Apache-2.0; [font provenance](../packages/scanner/assets/ocr/paddle/pdf-font.json) |
| pdf-lib | 1.17.1 | Optional searchable-PDF image/text assembly worker | MIT; [Source](https://github.com/Hopding/pdf-lib/tree/v1.17.1) |
| PDF.js / pdfjs-dist | 6.5.438 | Next.js PDF preview only | Apache-2.0; [Release](https://github.com/mozilla/pdf.js/releases/tag/v6.5.438), [License](https://github.com/mozilla/pdf.js/blob/master/LICENSE) |
| React / React DOM | 19.3.1 | Peer / demo runtime | MIT; [React](https://github.com/facebook/react) |
| Next.js | 16.4.5 | Full reference application | MIT; [Next.js](https://github.com/vercel/next.js) |
| Astro | 7.4.7 | Small host example | MIT; [Astro](https://github.com/withastro/astro) |
| @types/node | 26.6.6 | Development-only build/test types | MIT; [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node) |
| TypeScript | 7.0.2 | Types / declarations | Apache-2.0; [TypeScript](https://github.com/microsoft/TypeScript) |
| esbuild | 0.28.2 | Library/worker build | MIT; [esbuild](https://github.com/evanw/esbuild) |
| Playwright | 1.64.1 | Browser integration | Apache-2.0; [Playwright](https://github.com/microsoft/playwright) |
| Prettier | 3.9.10 | Formatting | MIT; [Prettier](https://github.com/prettier/prettier) |

Scanic 1.7.1 provides scanDocument, extractDocument and createCornerEditor with keyboard/loupe support. The earlier 1.7.0 branch version was unavailable in the registry. Build-time instrumentation verifies exact source anchors, exposes existing buffers when enabled and adds an optional candidate selector. Installed vendor files remain unchanged. Preserve MIT and modification notices. Classic WASM bytes are embedded; the unused Scanic ML branch and commercial SDKs are not distributed. Unreleased OCR uses its own explicitly listed local models and worker assets.

Tesseract packages are pinned build dependencies: the library copies the browser worker and scalar/SIMD/Relaxed-SIMD LSTM core assets, rather than importing the upstream Node.js factory/dependency tree at runtime. The exact prebuilt worker's bundled components have separate source-bound notices under `third-party/tesseract-worker/`; native engine/toolchain supplements are under `third-party/tesseract-wasm/`, and model provenance/license is under `third-party/tessdata-fast/`. These preserve original texts and document their evidence limits; they are not an independently attested binary SBOM. The model build checks hashes, and both hosts receive every asset/notice. No library-owned persistent model cache or runtime CDN is used.

Paddle uses the SDK main entry, not its separately prebuilt worker. Workspace overrides pin the actual ORT/OpenCV dependency graph. Model/Latin-dictionary and GlyphLessFont hashes are checked during the build; `third-party/paddle-ocr/` preserves model, conversion, runtime and supplemental notices. Package and host checks cover the delivered artifacts. Paddle-specific OpenCV evaluation permissions apply only to its optional worker; see [OCR integration](INTEGRATION.md#local-ocr-and-searchable-pdf).

jsPDF supplies raster images/page operations; PDF.js independently renders generated files. `pnpm licenses:inventory` writes the resolved production inventory to ignored `artifacts/local/licenses.json`. Library builds collect transitive notices under `dist/assets/licenses/` with an inventory. Host copying includes Scanic/PDF.js notices. Inspect the actual packed archive before distribution with `pnpm check:package`. Notice discovery includes hyphenated filenames such as stackblur-canvas `LICENSE-MIT.txt`; the archive gate rejects dependencies with missing notice files.

Supplemental Rust/WASM notices accompany the classic Scanic engine under `third-party/scanic-wasm/`. Both examples generate `/third-party-notices.txt` for their bundled React/framework/PDF.js code and link the full notices and project source. The asset tree includes the project license and NOTICE. `pnpm check:notices` verifies these delivered copies after a build. See the [licensing audit](testing/LICENSE-AUDIT.md) for exact scope, host/native dependencies and the resolved replacement of the restricted audio.

The project relies on jsPDF's upstream MIT declaration under D-041 and preserves all supplied notices. Its historical MD5 attribution remains an informational accepted provenance uncertainty, with no additional clearance requirement or publication blocker. See the audit for the checked primary sources.

## Integrated media

The current catalog ships two CC0-1.0 recordings plus silence: [Camera Shutter by roachpowder](https://freesound.org/people/roachpowder/sounds/170229/) and [Pentax MZ-7 Shutter by AudioSea](https://freesound.org/people/AudioSea/sounds/645335/). Their publicly supplied HQ MP3s are included unchanged. Creator/title/source/date/checksum attributions and the complete CC0 text accompany the files. See [capture sounds and custom audio](SOUNDS.md) for the credits, alternative CC0 candidate, integration options and link-only Pixabay ideas.

The twelve previous Pixabay downloads and notices are preserved outside versioned source and excluded from the current source tree, package and demo build. Earlier Git history is unchanged. The jsPDF upstream-MIT policy is separate from this media replacement.

## Security audit

The [dependency capability review](testing/DEPENDENCY-SECURITY.md) explains reported Socket findings, exact upstream sources and a same-origin import/PDF regression test without JavaScript `unsafe-eval`. Capability detection is distinct from behavior in the scanner's actual execution path; the review documents the remaining scope limits.

Next.js was updated from 16.3.8 to pinned 16.4.1 after the 23 October audit reported [SVG optimization](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [Server Actions denial of service](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) and [typed-array use-cache](https://github.com/advisories/GHSA-673q-mjm6-r5xr) advisories. The repeat production audit on 24 October 2026 reports zero known vulnerabilities in every severity. This describes the resolved tree at that time, not a general security guarantee. Recheck after dependency changes.

The 26 October 2026 audit of the updated complete dependency tree, including development packages, also reported zero known vulnerabilities in every severity. Its scope and accepted licensing policies are recorded in the audit above.

The 6 November review also checks primary upstream advisories rather than relying only on registry audit counts. Next.js 16.4.5 fixes seven moderate upstream advisories affecting earlier 16.4 versions, while the same-day full lockfile audit returned zero advisories. The reference host now pins 16.4.5; these framework dependencies are not part of the scanner runtime package. See the [official security release](https://github.com/vercel/next.js/releases/tag/v16.4.5). The workspace uses pnpm 11.28.11 and requires Node >=22.23.4 for the updated Astro reference; Node 24 LTS remains the recommended build environment. The established OCR/Scanic engine pins and provenance checks remain unchanged.
