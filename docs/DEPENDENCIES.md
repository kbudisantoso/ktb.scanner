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
| TypeScript | 5.9.3 | Types / declarations | Apache-2.0; [TypeScript](https://github.com/microsoft/TypeScript) |
| esbuild | 0.28.2 | Library/worker build | MIT; [esbuild](https://github.com/evanw/esbuild) |
| Vitest | 5.0.5 | Tests / built import | MIT; [Vitest](https://github.com/vitest-dev/vitest) |
| Playwright | 1.64.1 | Browser integration | Apache-2.0; [Playwright](https://github.com/microsoft/playwright) |
| Prettier | 3.9.10 | Formatting | MIT; [Prettier](https://github.com/prettier/prettier) |

Scanic 1.7.1 provides scanDocument, extractDocument and createCornerEditor with keyboard/loupe support. The earlier 1.7.0 branch version was unavailable in the registry. Build-time instrumentation verifies exact source anchors, exposes existing buffers when enabled and adds an optional candidate selector. Installed vendor files remain unchanged. Preserve MIT and modification notices. Classic WASM bytes are embedded; no ML models, OCR data or commercial SDKs are distributed.

jsPDF supplies raster images/page operations; PDF.js independently renders generated files. `pnpm licenses:inventory` writes the resolved production inventory to ignored `artifacts/local/licenses.json`. Library builds collect transitive notices under `dist/assets/licenses/` with an inventory. Host copying includes Scanic/PDF.js notices. Inspect the actual packed archive before distribution with `pnpm check:package`. Notice discovery includes hyphenated filenames such as stackblur-canvas `LICENSE-MIT.txt`; the archive gate rejects dependencies with missing notice files.

## Integrated media

Twelve unchanged local Pixabay cues retain separate media terms; they are not AGPL/MIT source assets. Product display labels come from `SHUTTER_SOUNDS`; original titles/artists below preserve provenance. Silence is always available. No API key/external audio request is required at runtime. Do not redistribute as a standalone sound collection. Preserve supplied notices, the [Pixabay license summary](https://pixabay.com/service/license-summary/) and [binding terms](https://pixabay.com/service/terms/).

| ID | Original title / credit | Source and supplied notice |
| --- | --- | --- |
| `beep` | Incoming Text Beep / Virtual_Vibes | [Source](https://pixabay.com/de/sound-effects/technologie-incoming-text-beep-464674/), [notice](../packages/scanner/assets/beep.NOTICE.txt) |
| `deepscan` | DeepScan.mp3 (Pixabay sound effect 14662) / noirenex (Freesound); uploader: freesound_community | [Source](https://pixabay.com/sound-effects/film-special-effects-deepscanmp3-14662/), [notice](../packages/scanner/assets/deepscan.NOTICE.txt) |
| `electric` | Electric Boom 1 / AleXZavesa | [Source](https://pixabay.com/de/sound-effects/electric-boom-1-463651/), [notice](../packages/scanner/assets/electric.NOTICE.txt) |
| `instant` | Instant Teleport / Chriddof (Freesound); uploader: freesound_community | [Source](https://pixabay.com/de/sound-effects/film-spezialeffekte-instant-teleport-90645/), [notice](../packages/scanner/assets/instant.NOTICE.txt) |
| `notification` | Incoming Notification / lucadialessandro | [Source](https://pixabay.com/de/sound-effects/technologie-incoming-notification-547634/), [notice](../packages/scanner/assets/notification.NOTICE.txt) |
| `powerdown` | Power Down / Rvgerxini (Freesound); uploader: freesound_community | [Source](https://pixabay.com/de/sound-effects/film-spezialeffekte-power-down-42676/), [notice](../packages/scanner/assets/powerdown.NOTICE.txt) |
| `camera` | iPhone Camera Capture (Pixabay sound effect 6448) / pooky1 (Freesound); uploader: freesound_community | [Source](https://pixabay.com/sound-effects/film-special-effects-iphone-camera-capture-6448/), [notice](../packages/scanner/assets/shutter.NOTICE.txt) |
| `soul` | Sucking A Soul Out Of A Human (Pixabay sound effect 451533) / HiSound | [Source](https://pixabay.com/de/sound-effects/grusel-sucking-a-soul-out-of-a-human-451533/), [notice](../packages/scanner/assets/soul.NOTICE.txt) |
| `teleport` | Teleport Game Sound Effect / gargamel10 | [Source](https://pixabay.com/de/sound-effects/film-spezialeffekte-teleport-game-sound-effect-379236/), [notice](../packages/scanner/assets/teleport.NOTICE.txt) |
| `transformer` | transformers-sound / lolsuckmujuice (Freesound) | [Source](https://pixabay.com/de/sound-effects/film-spezialeffekte-transformers-sound-43700/), [notice](../packages/scanner/assets/transformer.NOTICE.txt) |
| `warp` | Warp SFX / Breviceps (Freesound); uploader: freesound_community | [Source](https://pixabay.com/de/sound-effects/film-spezialeffekte-warp-sfx-6897/), [notice](../packages/scanner/assets/warp.NOTICE.txt) |
| `xylophone` | Eingang Incoming Chat Xylophone / Johnny Weltraum (Freesound); uploader: freesound_community | [Source](https://pixabay.com/de/sound-effects/film-spezialeffekte-eingang-incoming-chat-xylophone-86243/), [notice](../packages/scanner/assets/xylophone.NOTICE.txt) |

## Security audit

Next.js was updated from 16.3.8 to pinned 16.4.1 after the 23 October audit reported [SVG optimization](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [Server Actions denial of service](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) and [typed-array use-cache](https://github.com/advisories/GHSA-673q-mjm6-r5xr) advisories. The repeat production audit on 24 October 2026 reports zero known vulnerabilities in every severity. This describes the resolved tree at that time, not a general security guarantee. Recheck after dependency changes.
