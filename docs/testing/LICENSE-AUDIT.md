# Third-party licensing and OSS distribution audit

Review date: 26 October 2026. This checks the repository, installed dependency tree, library archive and reference application assets. The findings are specific to the pinned versions and current build. SPDX declarations alone do not prove compliance or ownership; no blanket legal or security certification is made.

## Findings and changes

| Area | Finding and treatment |
| --- | --- |
| Project source | Root and package use the same complete AGPL-3.0-only text and matching NOTICE. Contributions, security guidance, issue/PR templates and source links are present. Source publication, npm release and hosted deployment remain separate. |
| Library dependency notices | The build collects full notices for 24 resolved Scanic/jsPDF dependency instances, including optional dependencies conservatively. MIT, MIT AND Zlib, and the Apache-2.0 option of DOMPurify's dual license are retained. rgbcolor's MIT alternative is used. Missing root notice files now fail the build. |
| Embedded notices | jsPDF contains additional notices, including Adobe's BSD-style terms, beyond its root MIT text. Worker builds explicitly preserve legal comments and the notice check requires their presence. |
| jsPDF policy - accepted | jsPDF 4.2.1 declares MIT. D-041 accepts that declaration as the project's dependency licensing basis and retains all supplied notices. A historical MD5 comment lacks an explicit original-author license; this is retained as informational accepted provenance uncertainty, not a demonstrated violation or publication blocker. No additional upstream clearance is required by project policy. |
| Classical Scanic WASM | npm metadata alone omits the Rust runtime. Supplemental original MIT/Apache/Unicode notices now accompany the package source and copied assets. Sources and provenance limits are documented in [the WASM notice](../../packages/scanner/third-party/scanic-wasm/NOTICE). The Scanic npm `gitHead` matches the reviewed upstream commit. No independently attested binary SBOM is supplied upstream; this remains a source-based inventory. |
| Reference applications | Minified host bundles did not retain adequate license text. Both examples now generate and link `/third-party-notices.txt`, including complete project/runtime notices, React/React DOM/Scheduler, their host framework and its supplied vendored notices. Next.js includes PDF.js's supplied notices and licenses. The collection conservatively includes unused upstream notices too. |
| Asset handoff | The controlled asset tree now includes the project's complete license/NOTICE and supplemental WASM notices. Hosts must preserve that tree, add their own bundle notices, and make the corresponding source for their distributed version available. A generic repository link does not supply unpublished host modifications. |
| Media | D-040 resolves the restricted-media finding for the current tree/artifacts: the twelve Pixabay recordings and acquisition notices moved to ignored local storage, and only link-only ideas remain in the guide. The catalog now contains two checked CC0 recordings, roachpowder 170229 and AudioSea 645335, plus silence. Original source/creator/date/checksum attributions and full CC0 text are shipped. Existing Git history remains unchanged. |
| Local inventory tooling | The first pnpm inventory failed because the local package-store index was incomplete. An unchanged frozen-lockfile install repaired it; the official inventory then succeeded. The command now runs in CI. |

## Scope of dependency review

The installed macOS/arm64 production tree contained 237 package instances, including four workspace packages. Each instance had a package-level license declaration; the accepted upstream-MIT policy and provenance limits are recorded above. The complete resolved graph is in the lockfile; `pnpm licenses:inventory` records the local production inventory under ignored `artifacts/local/`.

The wider host/build tree includes MPL-2.0 Lightning CSS, an LGPL-3.0-or-later libvips binary, CC-BY-4.0 browser data and permissive MIT/ISC/BSD/Apache/BlueOak/CC0 components. These declarations must not be reduced to "all dependencies are MIT". They are not all included in the scanner/browser artifacts. In particular, a server/container distribution that includes native sharp/libvips needs its own complete deployment inventory and applicable notices/source/relinking handling. This audit does not approve an unbuilt future deployment. Other OS/CPU installations resolve different optional native packages.

Unused Scanic ML/ONNX models/loaders are not copied into controlled assets. The review covers the classic engine that is actually delivered. Package metadata and the complete workspace source/build inputs are available from the project repository; the library archive's included implementation source is not a standalone replacement for the whole workspace build.

## Media decision - resolved for the current distribution

On 26 October 2026 the bundled Pixabay catalog was removed from the current tree and future build/package outputs. Its unchanged files and original notices are retained only in ignored `local-assets/sounds/pixabay/`. Source-page links are documented solely as ideas for independently licensed custom audio. Pre-existing Git history was not rewritten.

Both replacement source pages explicitly designate the recordings CC0-1.0. The included files are unchanged public HQ MP3 previews, not the login-only original AIFF/WAV downloads. The [sound guide](../SOUNDS.md) and supplied notices preserve the exact source, creator, hashes and full dedication. No creator endorsement is implied. The NoTomorrow12 CC0 candidate was superseded by the later roachpowder suggestion and is linked only as an alternative. The independent jsPDF MD5 observation is handled by the accepted upstream-MIT policy D-041 above.

## Verification

The subsequent D-040/D-041 checkpoint replaces the media and accepts the jsPDF upstream-MIT policy. The current 179-file archive has exactly two CC0 clips with verified hashes, full dedication and credits. Both hosts carry the new notices; no retired audio remains in their generated directories. All 161 native tests, three Vitest checks and build/type/format/document/notice gates passed. The focused three-profile browser results are recorded in [test status](STATUS.md#cc0-capture-audio-and-host-owned-urls-26-october-2026). The earlier results below describe the initial pre-replacement audit.

The audit adds `pnpm check:notices`, run after a build. It checks full notice text, byte-preserving copies into both hosts, bundled jsPDF notices, framework/vendor notices and the complete project license. `pnpm check:package` independently inspects the actual tarball and requires the supplemental notices and project license in both source and controlled assets. CI runs both gates and the production inventory.

At the initial audit checkpoint, the library and both reference hosts built successfully. All 158 native tests, three Vitest checks, typecheck, formatting, documentation links, notice delivery and the actual 198-file package archive passed. Forty-six focused browser cases passed in WebKit and mobile WebKit without skips/retries, covering EN/DE notice links, HTTP delivery of complete texts and existing locale behavior. This audit did not repeat the complete four-browser regression matrix; CI includes the new notice checks for subsequent pushes.

The complete installed dependency audit (including development dependencies) reported zero known vulnerabilities in all severities on 26 October 2026. Gitleaks found no secrets across the 22 commits reachable from the pre-audit main tip or in the reviewed 228-file snapshot including these audit changes. The tracked snapshot contained no local instruction files, environments, certificates, diagnostic ZIPs or scratchpad paths. The final audit commit is checked separately before any push. Private local branches are outside the push scope. Physical-device acceptance and formal legal review are not implied by these checks.

## Primary sources

- [AGPL version 3](https://www.gnu.org/licenses/agpl-3.0.html), especially source availability and notices.
- [Scanic source at the npm gitHead](https://github.com/marquaye/scanic/tree/dec0cd018899a7e1c5d8f4880223f0e54941f616), including LICENSE, Cargo.lock and Dockerfile.
- [jsPDF license](https://github.com/parallax/jsPDF/blob/v4.2.1/LICENSE) and the license comments in the installed distribution.
- [jsPDF's MD5 attribution](https://github.com/parallax/jsPDF/blob/v4.2.1/src/libs/md5.js) and the [original author's explanation](https://www.myersdaily.org/joseph/javascript/md5-text.html); these do not establish an additional explicit license grant.
- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0), section 4 on redistribution/notices.
- [PDF.js license](https://github.com/mozilla/pdf.js/blob/v6.4.299/LICENSE) and the notices supplied in pdfjs-dist 6.4.299.
- Historical context: [Pixabay binding terms](https://pixabay.com/service/terms/), sections 4-6; checked version dated 20 October 2026. Acquisition notices record 18 October 2026, so these current terms are not proof of the exact text accepted on acquisition.
- [Pixabay summary](https://pixabay.com/service/license-summary/) and the [Open Source Definition](https://opensource.org/osd), especially redistribution and fields of endeavor.

The full license texts shipped by the installed packages and the supplemental Rust/WASM notices are authoritative inputs to the build checks; upstream main branches are not substitutes for pinned package contents.
