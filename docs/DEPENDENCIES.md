# Dependencies and versions

Project source is AGPL-3.0-only; dependencies retain their own licenses. Direct versions are pinned in manifests, with complete resolution in `pnpm-lock.yaml`. Installed package contents and actual builds determine the distributed versions.

| Package | Pin | Use | Upstream license/source |
| --- | --- | --- | --- |
| Scanic | 1.7.1 | Classic detection, perspective, corner editor | MIT; [Manifest](https://github.com/marquaye/scanic/blob/main/package.json), [API](https://github.com/marquaye/scanic/blob/main/src/scanic.d.ts) |
| jsPDF | 4.2.1 | PDF worker | MIT; [Release](https://github.com/parallax/jsPDF/releases/tag/v4.2.1), [Manifest](https://github.com/parallax/jsPDF/blob/master/package.json) |
| PDF.js / pdfjs-dist | 6.4.299 | Next.js PDF preview only | Apache-2.0; [Release](https://github.com/mozilla/pdf.js/releases/tag/v6.4.299), [License](https://github.com/mozilla/pdf.js/blob/master/LICENSE) |
| React / React DOM | 19.3.1 | Peer / demo runtime | MIT; [React](https://github.com/facebook/react) |
| Next.js | 16.4.2 | Full reference application | MIT; [Next.js](https://github.com/vercel/next.js) |
| Astro | 7.4.1 | Small host example | MIT; [Astro](https://github.com/withastro/astro) |
| @types/node | 26.6.5 | Development-only build/test types; runtime minimum is unchanged | MIT; [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node) |
| TypeScript | 7.0.2 | Types / declarations | Apache-2.0; [TypeScript](https://github.com/microsoft/TypeScript) |
| esbuild | 0.28.2 | Library/worker build | MIT; [esbuild](https://github.com/evanw/esbuild) |
| Playwright | 1.64.1 | Browser integration | Apache-2.0; [Playwright](https://github.com/microsoft/playwright) |
| Prettier | 3.9.10 | Formatting | MIT; [Prettier](https://github.com/prettier/prettier) |

Scanic 1.7.1 provides scanDocument, extractDocument and createCornerEditor with keyboard/loupe support. The earlier 1.7.0 branch version was unavailable in the registry. Build-time instrumentation verifies exact source anchors, exposes existing buffers when enabled and adds an optional candidate selector. Installed vendor files remain unchanged. Preserve MIT and modification notices. Classic WASM bytes are embedded; no ML models, OCR data or commercial SDKs are distributed.

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
