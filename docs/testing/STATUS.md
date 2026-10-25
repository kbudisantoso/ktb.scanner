# Implementation and verification status

Updated 25 October 2026. The library and both reference integrations are implemented. Automated evidence below does not establish physical-device, production deployment or universal detection quality. Default diagnostics are off.

## English/German library and reference hosts, 25 October 2026

[ADR 0022](../adr/0022-localization-and-library-default.md) adds an explicit English library/viewer default, built-in German and compatible host text overrides. Both reference hosts start in German and offer English, including errors, result controls and PDF accessibility labels. Locale does not change image processing or paper-region inference. Switching result language preserves the actual PDF bytes. Diagnostics remain off by default; the outdated reference description was corrected.

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
