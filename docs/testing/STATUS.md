# Implementation and verification status

Updated 27 October 2026. The library and both reference integrations are implemented. Automated evidence below does not establish physical-device, production deployment or universal detection quality. Default diagnostics are off.

## Public UI styling guide, 27 October 2026

The [UI styling guide](../UI-THEMING.md) inventories all 50 supported variables with exact defaults/fallbacks and scope. It distinguishes the original ten npm 0.1.0 root variables from the unreleased extended tokens, explains root/ancestor precedence and backdrop propagation, and supplies complete [public-API examples](../examples/ui-theming.tsx) for both integrations and a standalone viewer. The complete light/dark palettes include explicit primary and warning foregrounds plus camera colors, avoiding the former dark-warning/mobile-error foreground conflict without host selectors.

The published 0.1.0 archive was fetched with install scripts disabled. Its original stylesheet SHA-256 is `db3e3e7a2ccc021887880cfaf38ab7c219fade050647f5a9d5d5afa769b9a8bd`; this is the release baseline, not the extended stylesheet. All 50 documented/example names match actual extended CSS/component consumers; the internal camera-height calculation is intentionally excluded. The complete example and the guide's imperative block typecheck against built public declarations, with ordinary host CSS-module declarations, and bundle through the public package exports.

Chromium executed 17 rendered example scenarios against the built extended package: actual React `ThemedScanButton` in light/dark and EN/DE at 1280 x 900, 390 x 664 and 844 x 390; mobile camera denial/options, global warnings, standalone viewers and imperative opening/host abort. Checks found zero horizontal overflow and visible keyboard focus, primary/format-control text contrast of at least 4.5:1 and warning contrast of at least 7.79:1. Viewer computed styles confirmed inherited colors and direct font-token consumption, including changing the variable to monospace without setting host `font-family`. Synthetic screenshots of workspace, camera options, warnings and viewers were inspected. Screenshots and temporary verification scripts remain local and untracked.

This documentation's source-consumer inventory, public-declaration example checks, example bundle, formatting, document links and diff checks passed. After integrating the extended runtime, full library/Next.js/Astro build, 161 core tests, three Vitest checks, four release tests, typecheck, lint, actual 179-file package archive and delivered notices also passed in the documentation worktree. Runtime browser evidence is recorded with the separate theme-token implementation; this documentation additionally runs the 17 bounded rendered example scenarios above. The example run synthetically denies camera access and does not establish physical camera/device, actual custom-font-file or assistive-technology acceptance. Hosted PR checks remain separate. No release or publication is performed by this documentation.

## Complete reusable UI theming, 27 October 2026

The existing ten theme variables/defaults remain supported. Forty additional consumed fallback tokens close backdrop/stacking, primary/warning contrast pairs, camera palette/focus/overlays/shutter/flash, chrome radii/spacing/shadows, capture contour/loupe, select caret and standalone viewer gaps. The controller applies theme properties to its owned backdrop; an explicit global focus also reaches the camera unless a camera-specific value is supplied. `ImageViewer` consumes inherited font without an extra host font declaration. A selected paper-orientation cascade conflict was corrected so its primary foreground remains visible on the accent background. [ADR 0026](../adr/0026-complete-ui-theme-tokens.md) records every supported fallback and scope. New tokens are unreleased and do not alter npm 0.1.0.

Local verification passed: complete library/Next.js/Astro build, 161 core tests, three Vitest tests including SSR imports, four release tests, typecheck, formatting, document links, actual 179-file package archive, delivered notices and diff checks. No processing/export/session contract, license, release or host storage/download code changed.

The final targeted run passed 66 cases with two existing WebKit canvas-stream exceptions across Chromium, Firefox, WebKit and mobile WebKit. All 36 new theme cases passed: both public UIs, custom and default backdrop/foreground/spacing/radii/focus, denied mobile-camera/error/options/shutter states, shadow roles, explicit camera-focus precedence, actual SVG contour colors, real corner-loupe canvas pixels, default values, standalone viewer font/inherited fallback and keyboard Tab focus, plus the actual selected Format-panel orientation foreground. Twenty-four existing focused-review cases passed in two themes and three viewport sizes, as did denied-camera recovery in all four profiles. The first run exposed a pre-existing thumbnail test race: cards can render before Blob URL images; the assertion now waits for those images before computing styles. Intermediate new-test selector/import-path errors were corrected before the final run. Audio output was physically muted by the shared fixture; documents were synthetic.

The first hosted mobile-WebKit run exposed a separate boundary-test fixture race: Next.js hydration recovered its page after the test replaced `document.body`, removing all corner handles. The trace showed the handles present and the host recovery 38 ms later. The bounds fixture now serves static same-origin HTML with the actual built SDK stylesheet and Scanic asset. It preserves all 48-pixel, focus, drag, gutter, viewport and clipping assertions and additionally rejects framework requests/page errors. All twelve profile/viewport cases passed without skips or retries, and the fixture correction was independently reviewed.

Reproduce with `pnpm exec playwright test tests/browser/theming.spec.ts tests/browser/mobile-camera.spec.ts tests/browser/review-ui.spec.ts --workers=4` after building. Screenshots are attached by the synthetic renderer tests. Rendered/computed-style checks and emulation do not establish physical iPhone/Android or assistive-technology acceptance. Hosted CI is checked independently on the pull request; no tag, release, registry publication or deployment is included.


## Global UI preference notifications, 26 October 2026

The unreleased `ScannerOptions.onPreferenceChange` API reports validated changed Auto/Manual and JPEG/PNG preferences before a later cancellation. Existing `initialMode` / `imageType` options reapply defaults; persistence, migration/reset and all host storage remain outside the library. See [ADR 0025](../adr/0025-ui-preference-notifications.md).

Local verification: all 44 focused browser cases passed without retries or skips across Chromium, Firefox, WebKit and mobile WebKit. They cover both API entries and EN/DE, real global selections, cancellation and silent reapplication, invalid/same-turn duplicate values, synchronous and rejected asynchronous callback failures, current React handlers without camera/session restart, synchronous close inside a callback, session-close diagnostic reentry, and exclusion of page rotation/profile edits. The import/edit/confirmation case returned an actual PNG blob using the selected format. Camera access is synthetically denied in these preference tests; no physical camera claim is made. The test fixture physically mutes audio output.

Frozen install, full library/Next.js/Astro build, 161 native tests, three Vitest checks, four release checks, typecheck, formatting, documentation links, actual 179-file package inspection, delivered notices and diff checks passed. Public declaration checks compile valid discriminated callback uses from both entry points and reject invalid mode/export/page-edit values. Both new integration host examples were separately typechecked against the built public declarations, with a bundler-style CSS module declaration. This is a focused local run, not a new full browser matrix or physical iPhone/Android/assistive-technology acceptance. Hosted PR checks remain separate.

After integrating the direct-camera entry, the combined preference, entry, React API and lifecycle run passed all 160 cases in the four browser profiles, without skips or retries. This includes direct-camera callback updates without reinitialization and the existing twenty-cycle worker/preview cleanup checks. The two integration APIs and both public type additions were verified together.

The preference extension was subsequently merged through [PR #8](https://github.com/kbudisantoso/ktb.scanner/pull/8), merge commit `ab0866f`. Its [hosted CI run](https://github.com/kbudisantoso/ktb.scanner/actions/runs/40417286657) passed all seven checks: 527 browser cases passed and 25 known cases were skipped, out of 552. One WebKit setup job was cancelled after slow Ubuntu-mirror downloads and rerun on a fresh runner; its full test profile then passed. The successful other jobs were retained. The API remains unreleased.

Reproduce after building with `pnpm exec playwright test tests/browser/preferences.spec.ts tests/browser/entry.spec.ts tests/browser/react-api.spec.ts tests/browser/lifecycle.spec.ts --workers=4`.

## Direct camera entry, 26 October 2026

`OpenOptions.entry` selects the existing workspace (default) or camera in both public UI integrations. Nonempty files take precedence without camera access; empty arrays follow entry. Entry validation, error recovery and session ownership are covered by [ADR 0024](../adr/0024-direct-camera-entry.md). This API is unreleased; npm 0.1.0 remains unchanged.

Local checks passed: library and both production host builds, 161 native tests, three Vitest tests (including core/React SSR), four release tests, public built-entry typechecking, formatting, documentation links, the actual 179-file archive and delivered notices. Independent API/lifecycle review findings were corrected before the final check.

All 56 new entry browser cases passed across Chromium, Firefox, WebKit and mobile WebKit: defaults, Auto/Manual independence, file precedence, invalid entries and EN/DE errors, denied permission/retry/import, confirmed blobs, pre-abort, pending abort/destroy/React close/unmount, StrictMode, late tracks and reentrant cancellation during opening. A broader 220-case run passed 209 cases with ten existing WebKit canvas-stream exceptions; an existing Chromium reopen test exposed a missing wait for the host's closed render. After adding that wait, the reopen test passed all four profiles. The remaining broad cases include the twenty-cycle real-processing worker/URL cleanup checks. Synthetic mobile denial screenshots are attached to the entry tests. Audio output was physically muted by the shared test fixture.

The camera-entry change was subsequently merged through [PR #7](https://github.com/kbudisantoso/ktb.scanner/pull/7), merge commit `b833080`. Its [hosted CI run](https://github.com/kbudisantoso/ktb.scanner/actions/runs/40415973224) passed all seven jobs. The complete browser matrix executed 508 cases: Chromium 127 passed; Firefox 126 passed / one known skip; WebKit and mobile WebKit each 115 passed / twelve known skips. Total: 483 passed and 25 known skips, with no failed cases. The targeted checks above remain the earlier local evidence. The new API remains unreleased.

Reproduce after building with `pnpm exec playwright test tests/browser/entry.spec.ts tests/browser/react-api.spec.ts tests/browser/lifecycle.spec.ts tests/browser/i18n.spec.ts tests/browser/camera.spec.ts tests/browser/mobile-camera.spec.ts --workers=4`. These are emulated/browser checks, not physical iPhone/Android or assistive-technology acceptance. Hosted CI is checked on the pull request independently; no release, tag, registry publication or deployment is part of this change.


## Dependency capability review, 26 October 2026

The reported Socket URL, license, dynamic-code, network, installation and React DOM alerts were checked against exact integrity-verified npm archives and the scanner source. The specific React DOM opaque-native-addon allegation is contradicted by the archive: its `static.node.js` entry and implementations are JavaScript, with no `.node` binaries. The remaining capabilities and scope limits are recorded in the [dependency security review](DEPENDENCY-SECURITY.md), including the reported core-js 3.51.0 versus embedded/locked 3.50.0 distinction.

Eight new JPEG/PNG import-to-PDF cases passed in all four browser profiles with external HTTP(S) blocked and no JavaScript `unsafe-eval` permission. Headers apply to worker responses too. No external request was observed in these fixture-driven flows. The PDF itself was downloaded and inspected. Typecheck, formatting and local documentation checks passed. There was no runtime dependency or processing-code change, registry publication or external report submission as part of this review.

## npm namespace and release workflow, 26 October 2026

D-042 uses the confirmed organization `ktb-tools` and package `@ktb-tools/scanner`. Public imports, both workspace consumers, lockfile, archive inspection and guides use the same name. The release workflow reuses full quality/browser CI and secret scanning for the tagged commit, inspects an actual artifact, and separates candidate building, OIDC publication and GitHub release attachment. The bundled adapter version now follows the package version. See the [first-publication and release procedure](../PUBLISHING.md#registry-release).

Local verification passed: frozen install, library and both production hosts, 161 native tests, three Vitest checks, four release tests, typecheck, formatting, documentation links, actual 179-file archive and delivered notices. actionlint 1.7.12 passed against all three workflows; its official binary checksum was verified. Release tests exercise a real temporary Git repository, exact tag/checkout matching, main ancestry and draft rejection, plus version/channel/package guards, identical-artifact retries and registry errors. Two successive archive builds were byte-identical. An independent temporary consumer installed the tarball with React peers and imported all public entries, rendered the closed React component without browser globals, and resolved CSS, workers, media and license assets.

Targeted imports, lazy loading, EN/DE, multi-page export and PDF/download flows passed across all four browser profiles: 18 Chromium/WebKit/mobile-WebKit cases, then six Firefox cases after installing the missing matching Firefox binary. These are integration checks for the namespace change, not a new full browser or physical-device acceptance run. The previous full GitHub CI on `d88aeb3` passed. At that preparation checkpoint, the new release workflow had only been verified locally and statically; no tag or hosted release run had been performed.

The subsequent [GitHub candidate run](https://github.com/kbudisantoso/ktb.scanner/actions/runs/40334197865) for tag `v0.1.0` at `d277d32` completed successfully with `publish=false`. Quality, secret scanning, all four complete browser profiles and artifact packaging passed. The first Firefox job was interrupted after extremely slow Ubuntu package-mirror downloads; retrying only the outstanding jobs on a fresh runner passed. The package artifact was downloaded and its supplied SHA-256 verified with `shasum`; independent content inspection passed for all 179 files. Both publish and release-attachment jobs were skipped. No npm publication, trusted-publisher configuration or app deployment was performed.

Local-storage housekeeping subsequently removed private media-storage paths from public documentation. Generic `*.gitignore` directory exclusion now protects both documentation traversal and archive inspection without naming private directories. Documentation/format checks and archive inspection passed; a synthetic archive containing such a private directory was rejected. Generated output paths referenced by tracked scripts remain unchanged.

## CC0 capture audio and host-owned URLs, 26 October 2026

D-040 replaces the previous twelve-clip catalog with silence and two CC0 recordings: roachpowder's Camera Shutter and AudioSea's Pentax MZ-7 Shutter. Exact public HQ MP3 bytes, creator/source/date/checksum notices and full CC0 text are supplied. The NoTomorrow12 candidate remains a link-only alternative after the later roachpowder preference. Previous Pixabay files/notices are retained byte-for-byte outside versioned source and build inputs; the current tree and built/package assets exclude them. Earlier Git history is unchanged. D-041 accepts jsPDF's upstream MIT declaration and preserves its historical MD5 attribution as informational uncertainty, without a further clearance requirement.

`shutterSoundUrl` supports host-owned audio without changing the library/catalog. Controller and React use the same URL resolution; `off` creates neither a request nor an AudioContext, including when an override is configured. Relative HTTP(S), absolute HTTP(S) and Blob URLs are allowed; unsupported schemes and retired catalog IDs fail before audio opens. Generated host assets are rebuilt so stale retired sounds cannot remain publicly served. See [sound integration and credits](../SOUNDS.md).

Both hosts/library built, all 161 native tests and three Vitest checks passed, as did typecheck, formatting, document links and delivered-notice checks. The independent archive gate verified 179 files and exactly two MP3s with CC0 notices and matching source hashes. All 24 archived original files match their local checksum inventory; every current source/generated asset directory contains only the two CC0 clips.

The focused Chromium/WebKit/mobile-WebKit audio/notice run passed 22 cases with eight deliberate WebKit synthetic-camera exceptions. It exercises all three choices, real muted preview playback, both sounds under Auto/Manual in Chromium, exact frame/audio timing, and delivered attribution texts. Nine additional final-build URL/configuration cases passed in those three profiles without skips/retries, verifying native custom-URL decoding, no built-in fallback request, explicit silence and configuration errors. Physical sound output remained muted throughout. Firefox and a complete four-browser regression were not repeated for this change; physical iPhone/Android acceptance remains separate.

## Browser-language selection in the demos, 25 October 2026

Both reference hosts now use English as their fallback and German for a German primary browser language, including regional variants. Explicit `?lang=en` / `?lang=de` and manual selections take precedence and survive reload; automatic detection does not rewrite the URL. The library itself retains its explicit English default. Static host HTML, Next.js metadata and the reference manifest use English.

All 56 new browser-language cases passed across both hosts and Chromium, Firefox, WebKit and mobile WebKit. They cover English/German/Swiss German, unsupported browser language, explicit overrides, unsupported query fallback and manual selection followed by reload. The existing twenty localization/mobile cases also passed. Both production hosts/library/assets built; 158 native tests, three Vitest checks, typecheck, formatting and documentation checks passed.

The complete 440-case run passed 394 cases and retained the 41 deliberate camera/audio/benchmark exceptions. Four isolated receipt-viewer cases still expected German without a locale provider; their selectors now exercise the intended English fallback. One desktop-WebKit landscape review case reported a clipped top-left corner handle. A subsequent eight-case run passed all four receipt-viewer and all four landscape review profiles. No corner-editor code or assertion was changed for that intermittent finding; its reproducibility and physical-device relevance remain open. This is not a claim of a single clean 440-case run.

Reproduce language coverage with `pnpm exec playwright test tests/browser/i18n.spec.ts --workers=4`; the focused follow-up uses `pnpm exec playwright test tests/browser/long-receipt.spec.ts tests/browser/review-ui.spec.ts --grep 'long receipts|focused ink 844x390' --workers=2` after building.

## English/German library and reference hosts, 25 October 2026

[ADR 0022](../adr/0022-localization-and-library-default.md) adds an explicit English library/viewer default, built-in German and compatible host text overrides. At this initial checkpoint both reference hosts started in German; their updated browser-aware behavior is recorded above. Errors, result controls and PDF accessibility labels are localized. Locale does not change image processing or paper-region inference. Switching result language preserves the actual PDF bytes. Diagnostics remain off by default; the outdated reference description was corrected.

Verification: 158 native tests and three Vitest checks passed. The full 376-case browser regression run passed 335 cases with zero failures/retries and 41 deliberate exceptions: 38 synthetic Safari camera/audio cases and three benchmark profiles outside the desktop Chromium measurement. A subsequent 20-case localization run passed in all four browser profiles after the final label fixes, without skips. It covers the default English controller, German and host overrides, real processing/PDF export in both hosts, unchanged PDF bytes across language changes, and reachable >=44 px English review/tool controls at 320 x 568 and 844 x 390. Physical-device and assistive-technology acceptance remains open.

The final library/assets and Next.js/Astro production builds, typecheck, formatting, documentation links and diff checks passed. The actual package archive passed the release gate with 180 files, all public entry points/sources/notices and twelve integrated cues. An independent temporary host installed that archive with React peers and ran the README asset-copy script, imported all four APIs, rendered the closed React component without browser globals and verified locale helpers/styles/worker/media assets. Dependency install scripts are unnecessary for the built archive; the README uses `--ignore-scripts` to avoid pnpm 11 rejecting a dependency postinstall. These checks perform no registry release, push or deployment.

Reproduce with the standard checks, then `pnpm exec playwright test --workers=4` and `pnpm exec playwright test tests/browser/i18n.spec.ts --workers=4` against the built hosts. The second run includes the additional English mobile layout cases.

## Direct Repeat action, 25 October 2026

The library review and required-crop view expose Repeat directly. It reopens the camera without accepting the candidate. Returning from the camera preserves the candidate and restores focus; a successful retake clears the prior required-crop state. Individual discard remains in More actions.

Verification: 32 browser cases passed without skips or retries across Chromium, Firefox, WebKit and mobile WebKit. They cover required-crop and review cancellation, unchanged preview bytes after returning, replacement without an extra exported page, preservation of accepted pages during cancelled replacement, and both themes at 320 x 568, 390 x 664 and 844 x 390. A separate mobile WebKit check verified Repeat and all quick actions, including a quality hint, fit at 320 x 568 with >=44 px targets. Library/Next.js/Astro builds, typecheck, formatting, three Vitest tests, documentation links and diff checks passed. Camera access is deliberately denied in the retake test; actual camera acquisition remains covered separately and physical phone acceptance remains open.

Reproduce with `pnpm exec playwright test tests/browser/flows.spec.ts tests/browser/crop-required.spec.ts tests/browser/review-ui.spec.ts --grep 'visible repeat|missing crop blocks|focused' --workers=2` after building.

## Configurable capture stability, 25 October 2026

[ADR 0021](../adr/0021-configurable-capture-stability.md) adds library/per-open stability duration and reference Scan options. Default remains 1,000 ms. The reference choices are 400/600/800/1,000/1,200/1,500/2,000 ms. Independently, the library accepts any integer from 100 through 5,000 ms. Native checks cover all seven presets, both API guardrail boundaries and the non-preset 875 ms value. Invalid values, precedence, stale/duplicate/unknown observations, Manual and once-only claims are covered. Diagnostic session-open and camera-start record the effective value.

Latest verification: 155 native tests and three Vitest tests passed. Library/assets, Next.js and Astro builds, typecheck, formatting, documentation links and diff checks passed. A targeted 16-case browser run passed ten cases and skipped six synthetic camera cases under the existing WebKit canvas-stream limitation. It covered Chromium/Firefox capture at 400/1,000/2,000 ms and configuration validation/overrides in all four profiles, including API values of 100/5,000/875 ms independently of the presets. A separate mobile WebKit check selected all seven choices at 320 x 568 and confirmed the default of 1,000 ms.

Before narrowing the reference choices and adding the upper API guardrail, a 48-case run passed 40 cases and skipped eight cases under the same WebKit limitation. That run additionally covered Auto shutter timing and focused review in both themes at three viewport sizes; its mobile control was reachable and >=44 px. The local phone HTTPS application was checked to serve the duration setting. No physical phone timing or full new browser-matrix result is claimed; the earlier complete matrix is recorded below.

Reproduce the latest targeted run with `pnpm exec playwright test tests/browser/camera.spec.ts tests/browser/react-api.spec.ts --grep 'stability|recurring live' --workers=2` after building.

## Focused review verification, 24 October 2026

Focused mobile review is recorded in [ADR 0020](../adr/0020-focused-review-and-shared-viewer.md). The final UI checkpoint includes direct Finish, explicit handling of pending imports, scrollable page tiles, focused Cancel/Apply tools, bounded recipe Undo, shared fit/100%/zoom/pinch/pan viewer, held Before, detached original-pixel corner loupe and actual inline lens status. Results survive returning to start. PDF preview loads on demand, renders the selected page first and caches at most three canvases. Landscape result actions use a side dock; development chrome cannot cover the footer.

| Check | Result | Scope |
| --- | --- | --- |
| Native tests | 143 passed, zero failed | Capture/geometry/session/metrics/profiles/tones/radial correction, limits and races |
| Vitest | Three passed | Native-suite integration, built DOM-free core import and closed React SSR rendering |
| Build | Passed | Library, real processing/PDF assets, Next.js 16.4.1 and Astro 7.3.5 |
| Typecheck | Passed | Library/React, tests, Astro client and Next.js |
| Formatting | Passed | Standard configured sources; Astro markup is framework-built rather than covered by a Prettier plugin |
| Browser matrix | 311 passed, 37 unchanged deliberate exceptions, zero failed | 348 cases in Chromium, Firefox, WebKit and mobile WebKit, about 4.3 minutes; no retry-based recovery |
| Artifact checks | Passed | Decoded image dimensions, ordering/layout, independent PDF.js rendering/color samples, actual download bytes |
| Resource cycles | Passed in final run | Twenty real-processing abort/review cycles per profile return scanner-owned worker/URL counts to zero; historical crash caveat below |
| Mobile UI | Passed in emulation | Both themes at 320 x 568, 390 x 664 and 844 x 390, >=44 px targets/clipping/reachable actions |
| Production dependency audit | Zero known vulnerabilities | All severities, repeat `pnpm audit --prod --json` on 24 October 2026 |
| Docs/diff | Passed for the UI checkpoint | Local links/requirements, formatting and `git diff --check` |
| Hosted CI | [Workflow runs](https://github.com/kbudisantoso/ktb.scanner/actions) | Evaluated on the public branch independently of local checks |
| Physical devices/assistive technology | Formal acceptance open | Informal iPhone recordings/replays are not the complete protocol |

Environment: Apple M3 Max/macOS arm64, Node 26.5.0, pnpm 11.15.1 and Playwright 1.58.2 (Chromium 145.0.7632.6, Firefox 146.0.1, WebKit 26.0). Mobile WebKit emulates iPhone 13 on the development Mac; it is not a real current/previous iOS device test. Source publication checks are recorded separately once performed.

## Verified behavior

- Lazy opening, initial focus/return, controller busy/disposed/pre-abort/reopen, host abort during processing/PDF and repeated cleanup. No partial export confirmation.
- Real-engine import in both built hosts, explicit missing-crop confirmation, manual corner correction/keyboard loupe, rotation, manual paper/profile precedence, page ordering/replacement, JPEG/PNG/PDF and real downloads.
- Independent camera still despite delayed/wrong live answers; full 1,280 x 960 synthetic video frame rather than a reduced work image. Video-only requests and stopped tracks. Synthetic live streams run in Chromium/Firefox; WebKit stream limitations are explicitly skipped.
- Capture clock/continuity with exact one-second measured boundary, once-only claim, slow drift, blur/unknown, brief pauses, longer losses and mode changes. Pixel tests verify the green open path until the actual secured-frame claim. The latest duration change leaves geometry/freshness/reset thresholds unchanged.
- Original EXIF 2/6/8 normalized once, with unchanged input bytes. Perspective acceptance errors were at most 2.59 source px under a predetermined 16 px threshold; no general edge-accuracy guarantee.
- Multiple sheets: complete before clipped, middle of three, left of two, deduplicated inner/overlapping hypotheses. Required corners replace all full-original fallbacks.
- Automatic Photo/Color selection, stronger RGB white-paper correction, reversible tones/radial model, gray-preserving low-noise monochrome, faint strokes/punctuation/colors/alpha and matching export pixels.
- The new UI checks real Undo/Cancel bytes and history, queued-limit errors without duplicated/omitted pages, twenty-page internal scrolling, minimum cover thumbnails, direct Finish, held release outside the button/blur, keyboard, native Chromium two-touch pinch and long receipt fit/pan/reset/orientation.
- Diagnostic opt-in, multi-session retention/deletion, atomic budgets, raw/viewable buffers, independent Python ZIP/CRC reading, original/final PDF byte identity and evidence retained after failure/abort. Debug adaptation was compared with unchanged vendor processing on its fixed fixture; this does not establish equivalence for every image/path.
- All sound tests physically mute output while native requests/decoding/scheduling/time progress execute. Product silence independently requests no sound and creates no AudioContext.

The running local HTTPS reference was checked with a verified CA chain, page/worker HTTP 200 and synthetic emulated mobile WebKit views. This verifies local delivery, not physical phone camera/trust/audio behavior. Private originals, archives, replays and screenshots remain ignored. Reproducible source tests are versioned.

## Historical investigation record

The following is a condensed English record of earlier verification, preserving unresolved findings rather than presenting old assumptions as current behavior.

| Investigation | Finding and resulting change |
| --- | --- |
| Initial device replays | Raw geometry, display geometry and capture evidence were conflated; separate timing/continuity and still analysis were introduced. A diagnostic sample cannot represent an unrecorded capture. |
| Shutter/rotation/detail passes | The frame was already secured synchronously, but a host-scaled dashed outline could appear complete at 50% progress. An explicit source-proportional open path fixed that display error. Dual still resolutions/rotations and reserved diagnostic capacity followed. |
| Diagnostic set 7 | Weak overlapping fragments could win against a whole page with almost equal confidence. Add constrained fragment rejection and ambiguity/required-confirmation handling rather than only loosening movement thresholds. |
| Sets 8/9 | Projected raw edge ratios could turn oblique A4 into Letter. Add independent projective estimation, perturbation checks, a bounded uncertainty range and weak regional A4/Letter preference. |
| Sets 10/11 | A full-original replacement falsely looked like a successful A4 scan. Remove that fallback completely; unresolved still conflicts require explicit corners. Some private replays remain confirmation-required. |
| Sets 12/13 | Oblique portrait paper could have landscape projected axes. Add paper orientation separately from image rotation. |
| Set 14/top-edge work | Coherent outward top-edge support improved targeted top-left clipping cases while preserving strong/manual edges. It did not solve arbitrary hypotheses or motion blur. |
| Set 15/quality and controls | Add visible optimization, independent tone/radial controls and directed edge-transition sharpness evidence. Broad transitions/noisy variance still require calibration and cannot establish readable text. |
| Auto/whitening, 19 Oct | Auto applies immediately without a manual priority; actual decision is separate from recipe intent. Per-channel whitening makes Color/Grayscale paper brighter while protecting strong colors/faint strokes. |
| Set 16, 19 Oct | Hard S/W amplified grain/folds; replace it with soft local tone mapping/stroke protection. A long receipt existed at 100% but fit was empty; measure actual available space and decoded dimensions. Final then-current run: 303 passed/37 exceptions/zero failed. |
| 23 Oct | Default diagnostics switched off. Next.js updated after security advisories; CI/contribution scaffolding added without claiming a publication. |
| 24 Oct | One-second capture trial: 143 native/three Vitest passed; isolated synthetic camera checks passed with known WebKit exceptions. Subsequent full focused-UI matrix is the 311/37 result above. |

## Historical WebKit crash and remaining limits

An earlier 104-case run had one desktop-WebKit process crash during twenty open/import/abort cycles; an isolated repetition crashed once and passed twice. A temporary older-worker/vendor comparison passed three times, but also changed loading conditions and could not establish a sole cause. Subsequent complete resource runs passed. No unproven production workaround was added; the cause and physical Safari relevance remain unresolved.

Outstanding formal acceptance:

1. Real current/previous supported iPhone Safari and Android Chrome, tab/standalone, permission delays, rear camera/focus/light, movement/long sessions, actual shutter cue and resource behavior.
2. Real-camera edge/content loss, faint thermal-print readability, manual correction rate and misleading quality warnings, including light backgrounds, folds and highly oblique views.
3. Actual interaction latency and phone memory/12 MP performance. Synthetic desktop numbers are in [measurements](MEASUREMENTS.md), not phone promises.
4. VoiceOver/other assistive technology and enlarged-text acceptance. Emulated target/focus checks do not certify conformance.
5. Registry namespace ownership and a first npm release remain separate work; source publication does not claim a registry release.

Follow the [device protocol](DEVICE-PROTOCOL.md). A lower warning/reset rate alone is not evidence of better document quality.

## Source distribution checks, 24 October 2026

A clean tracked export contained 208 files, without local instructions/configuration, certificates, environments, original photos or diagnostic archives. Gitleaks scanned the exported content without a finding. Independent frozen-lockfile installation, library and both host builds, 143 native tests, three Vitest checks, typecheck, formatting, document links and package checks all passed from that export. No private environment or development history was needed.

The release gate rebuilds into a clean generated directory before packing. The actual archive has 176 files with all public entry points, sources/build scripts, project license/notices, twelve cues and all collected dependency notices. It rejects local configuration and missing licenses, including hyphenated license filenames. An independent temporary consumer installed the tarball and imported all four APIs, rendered the closed React component without browser globals, and resolved styles, workers, cue and license files. At that packaging checkpoint, all thirteen runtime JavaScript files matched the fully browser-tested build byte for byte. This verifies package/source preparation, not an npm registry publication.

A final pre-push navigation follow-up restores the actual reviewed page after opening another tile's actions and returning from the grid, so Previous/Next reflect the displayed page after sorting. The strengthened regression passed all 24 browser/theme/viewport combinations; both hosts rebuilt, typecheck/formatting/diff checks passed. The 311-case full-matrix result above precedes this narrow follow-up; hosted CI independently checks the public tip.

## Dependency maintenance and corner targets, 25 October 2026

The combined dependency updates passed all GitHub checks in [PR 4](https://github.com/kbudisantoso/ktb.scanner/pull/4) and [PR 5](https://github.com/kbudisantoso/ktb.scanner/pull/5). Browser collection now declares its React runtimes directly. Preview audio receives a source only on explicit playback and releases it on sound changes. Linux Firefox uses a virtual PulseAudio null sink while native audio tests retain physically muted output. The complete dependency audit reported zero known vulnerabilities on 25 October 2026.

A separate corner-editor regression exposed two layout causes: Scanic reserves a smaller image gutter than the enlarged touch handles require, and the generic button press transform replaced their anchored drag transform. Reserve an outer gutter, retain 48 px targets and exclude corner handles from that generic press animation. A deterministic browser check places all four corners at the source boundaries, checks focus and active dragging at 320 x 568, 390 x 664 and 844 x 390, and verifies unchanged source coordinates. This fixes the previously intermittent clipping finding without weakening viewport assertions or changing image detection/crop geometry. Physical-device acceptance remains separate.

The final local corner-boundary and existing review regression run passed all 36 cases across Chromium, Firefox, WebKit and mobile WebKit without skips or retries. Builds, typecheck, formatting and document checks passed.

The subsequent hosted run passed all corner cases but exposed a preview-test race in both WebKit profiles: reading the old blob URL during Cancel's asynchronous replacement could fail after its revocation. The Undo/Cancel check now waits for the complete visible-image byte assertion, retaining exact SHA-256 equality and a bounded timeout. All twelve repeated local WebKit/mobile-WebKit workspace cases passed, followed by typecheck and formatting. Hosted CI verifies the final change separately.
