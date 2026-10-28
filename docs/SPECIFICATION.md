# Implementation contract

Version 0.9, updated 28 October 2026. Implements the [requirements](REQUIREMENTS.md) and accepted [decisions](DECISIONS.md). Source code is not acceptance evidence; actual checks and open limitations belong in [test status](testing/STATUS.md).

## Delivery and architecture

The delivery is a complete embeddable scanning workflow covering capture workflow, editing, integration and consistent output (D-039). The package encapsulates the session and review path around Scanic and jsPDF so host developers receive confirmed files and metadata through one integration. Vendor engine responsibilities and ktb.scanner's workflow responsibilities remain explicit; this positioning introduces no additional runtime scope or detection-quality claim.

One TypeScript package provides the DOM-free `@ktb-tools/scanner` core and separate `/react`, `/scanic`, `/export` and `/styles.css` entry points. React/React DOM are peers. The reference Next.js application and smaller Astro host consume the built package and copied same-origin assets. No domain models, backend endpoints or implementation code from another product are copied.

The npm namespace is `ktb-tools` (D-042). GitHub releases with matching semantic-version tags on main run the existing complete checks before distributing the inspected archive via npm OIDC; the initial 0.1.0 bootstrap is complete. This contract targets 0.2.0, including direct camera entry, preference notifications and complete UI themes. Source-version preparation does not establish registry availability. Stable releases use `latest`, prereleases `next`. Package preparation, GitHub source publication, npm availability and app deployment are separate states. See the [release procedure](PUBLISHING.md#registry-release).

Classic Scanic 1.7.1 runs behind an adapter in a module worker. Build-time instrumentation checks the exact version and unique source anchors before exposing existing debug buffers and an optional candidate-selection callback. It fails closed on source drift. The installed vendor package is unchanged. Classic WASM is embedded in the distributed Scanic build; no ML mode or CDN fallback is activated. The corner editor loads on demand. jsPDF creates PDFs in a separate export worker; PDF.js belongs only to the reference preview.

Controlled assets carry the project license/NOTICE, dependency notices and supplemental Rust/WASM notices. Worker builds preserve bundled legal comments. Both reference hosts generate and link full notice collections and project source, including their React/framework and applicable PDF.js notices. Archive and delivered-notice checks run in CI; the [licensing audit](testing/LICENSE-AUDIT.md) records source/provenance limits and replacement of the previously restricted media.

Core imports must not access React, camera, window or document. UI/engine load after a host action; PDF generation and preview code load only when needed. The library installs no service worker and requires no global cross-origin isolation. Build and integration instructions are in [INTEGRATION.md](INTEGRATION.md).

## Controller, ownership and session state

`createScanner(options)` exposes `open({ entry?, signal?, initialFiles?, defaultProfile?, autoCaptureStabilityMs? })` and `destroy()`. Reject invalid configuration, overlapping opens and calls after destruction. `entry: 'workspace' | 'camera'` defaults to workspace. Camera enters the existing CameraView directly; `initialMode` still means Auto/Manual. Nonempty initial files override any valid entry and open review without requesting a camera. Empty arrays follow entry; invalid entries reject `CONFIG_INVALID` before resources even with files. Both controller and React `openOptions` share this contract. Imports/SSR request no camera. Denial retains retry/import/cancel. Session abort immediately invalidates camera work; cleanup also stops late streams and suppresses late device enumeration. See [ADR 0024](adr/0024-direct-camera-entry.md). Host abort resolves `cancelled`; recoverable processing/export errors remain visible in the session. Destroy stops owned workers/tracks, invalidates pending jobs and releases preview resources. The host owns confirmed blobs after completion and must revoke object URLs it creates.

A confirmed result has status, schema version 1, session ID, ordered stable accepted-page IDs/revisions, image blobs, serializable geometry/orientation/format/processing/quality metadata and an optional PDF blob. Originals are returned only when requested. Images and PDF must contain the same confirmed edit revision. Never report success with a missing page. Session operations preserve old pages through processing, cancellation and replacement failures. Export locks a snapshot and releases that lock on both success and failure.

Only accepted pages are exportable. A `CropRequired` processing result has `status: crop-required`, source size, proposed corners and a reason, but no image or format. The ready-made UI requires explicit corner confirmation before processing/acceptance. Custom hosts must do the same. Export encountering such a state fails with `CROP_REQUIRED`; it must not substitute the original or confirm a partial document.

## Global UI preference notifications

Optional `ScannerOptions.onPreferenceChange(change: ScannerPreferenceChange)` reports `{ preference: 'initialMode', value: CaptureMode }` or `{ preference: 'imageType', value: ImageMime }` only after genuine global UI changes. Export the union from core and React. Synchronous refs deduplicate events even before a React render. Validate UI values before changing state/gates; no events on initialization/reapplication, unchanged/invalid values, individual page edits or after session abort/end. Changes precede later cancellation and contain no document or session/device data. Callback throws/rejections cannot damage scanning.

Controller and React share the same option. React forwards to the latest handler through its existing props ref, preserving the open/configuration snapshot and camera lifetime. Reapply through `initialMode` and `imageType` on a later opening; do not add live external state control. Validation/migration/storage/reset and any theme/sound defaults belong to the host. No SDK localStorage, cookies or diagnosis-based preference channel. The result/completion contract is unchanged. See [ADR 0025](adr/0025-ui-preference-notifications.md) and [host examples](INTEGRATION.md#global-ui-preferences). This API was introduced in 0.2.0.

## Camera and automatic capture

Prefer the rear camera and request video only. Preserve import, camera selection and restart after denial/interruption. Request continuous autofocus only if supported; failure must not block camera startup. Camera light appears only when `torch` is supported, uses constraints and invalidates stale light requests on restart. Pause capture evidence while changing light.

Live video is independent of detection. Submit at most about eight reduced frames per second and allow one detection job; discard stale waiting frames. A job may include the bounded low-contrast recovery below; its full elapsed time still counts for freshness. Keep raw detection, smoothed display geometry and full-resolution still geometry separate. Display smoothing has about 180 ms response time. The tracker confirms jumps, holds display for 400 ms and fades it by 600 ms; held display supplies no capture evidence.

`autoCaptureStabilityMs` sets the required measured stable time: open-call override > controller configuration > 1,000 ms. Validate both supplied values as safe integers from 100 through 5,000 before opening resources. The progress contour and capture gate share the resolved duration. The reference offers 400/600/800/1,000/1,200/1,500/2,000 ms in Scan options; changes apply to subsequent sessions. API values need not match those presets. At least two distinct valid observations are necessary; the next fresh observation may arrive after the requested minimum, depending on the live-detection cadence and processing time. No timer-only capture or extra post-completion delay is introduced. Record the effective duration in diagnostic session-open and camera-start events. See [ADR 0021](adr/0021-configurable-capture-stability.md).

Measure against a fixed initial raw geometry so slow drift cannot hide behind smoothing. Starting bounds: 0.05 normalized anchor drift, 0.035 frame step and 15 percent area change. Only measured intervals up to 400 ms count. Uncertainty pauses for at most 1,200 ms since the last good measurement without later adding the missing interval. Movement, longer loss, mode change or cancellation resets the gate. Fresh sharp evidence is checked at the final claim; one claim produces one capture until explicitly rearmed.

Unknown sharpness on a detected blank page explains that manual capture is needed; measured blur has a separate hint. Manual capture remains available in Auto and is the only trigger in Manual. Switching to Manual immediately invalidates in-flight automatic decisions. Stale live answers cannot alter an already captured still.

At claim, synchronously copy one complete video frame before encoding. This prioritizes the claimed moment over a later asynchronous sensor photo. Retain the source dimensions after stopping the stream, show a proportionate frozen image and processing feedback, and optionally play the preloaded local cue. Unsupported/blocked audio never delays capture. Silence creates no AudioContext and downloads no cue. Reduced motion disables animation. Before a claim, leave at least 1.5 percent of the green perimeter open so a displayed complete outline always means the frame has been secured.

The built-in sound catalog contains only `off`, `camera` (roachpowder, Freesound 170229) and `reflex` (AudioSea, Freesound 645335). The two unchanged public HQ MP3s are designated CC0-1.0 by their creators and ship with provenance/checksums and the full dedication. `shutterSoundUrl` overrides the selected recording with an explicit host URL; `off` always returns no audio URL. Validate catalog IDs and HTTP(S)/Blob URL schemes before opening resources. Custom audio stays outside the generated asset directory. Build copying clears its owned directory so retired files cannot survive a rebuild. [D-040 and sound guide](SOUNDS.md).

## Shared camera/import processing

1. Validate file signature/type and configured budgets before decoding. Preserve original bytes. Normalize EXIF orientation once; subsequent corners use the same normalized source coordinates.
2. Detect at bounded working resolution, collecting 1,000/800 pixel hypotheses in a common source space. When normal detection is missing or lacks distributed source-pixel contrast across its boundary, allow one additional Scanic call with Canny thresholds 20/60, dilation 3 and no detection cascade. Admit additional contours only with spatially distinct inner/outer band evidence of consistent polarity along every side. A replacement must contain the normal target, including its live-continuity context; an inconclusive recovery preserves the normal selection and candidate pool. The entire still job shares one extra-call budget across both resolutions and independent +/-30-degree views used when the combined pool has no plausible hypothesis. Live corners do not seed automatic still recovery. Working images never silently replace export originals.
3. Validate convex geometry and minimum automatic area. Reject automatic contours below eight percent area or effectively equal to the source frame (all corners within 0.025 normalized distance). Explicit manual crops are exempt from these automatic plausibility restrictions.
4. Rank confidence, edge support, rectangularity, opposite-edge similarity, parallelism and paper-ratio proximity. Perspective and long receipts remain legal. Deduplicate pass contours and inner text/table rectangles. Prefer complete-looking candidates; among independent sheets choose horizontal middle or left-middle. Comparable separate sheets retain this positional rule. Weak overlapping fragments must not masquerade as another sheet.
5. Rank the entire still pool independently of any live hint. Do not filter candidates to match live geometry, prioritize a live-seeded refinement or reject a detected still merely because the live contour differs. Compare live/still geometry for diagnostics only. A stable hint at most 400 ms old, aspect-compatible and known to show the same frame area may initialize unconfirmed editor corners when independent detection is missing; it never establishes a crop. Missing plausible still geometry remains `crop-required`; explicit manual corners stay authoritative.
6. Refine original-resolution edges in narrow strips using gradients, robust line fitting and supported intersections. Accept only valid convex geometry with plausible movement and evidence. No universal border padding/inset.
7. If the normal fit leaves a weak top edge, test coherent outward bright lines over 64 positions and up to six percent of the long source axis. Require old evidence <0.4; new evidence >=0.6 and >0.15 better; >=47 supported samples and >=9 per quarter; >=85 percent bright neutral inner band; corner drift <=0.065 and area factor 1.0025..1.2. Preserve bottom corners and require new side continuation support. Manual corners and existing strong edges remain unchanged. Keep the uncertainty warning.
8. Apply optional radial correction, Scanic perspective extraction, chosen paper axes, separate 90-degree rotation and image profile. Recompute all edits/export from the original rather than repeatedly filtering compressed previews. Limit output without upscaling. Export encoding drops original location/device metadata.

For F-31, classify a contained panel before greedy duplicate suppression when its area is below 82 percent of a plausible complete outer candidate and two opposite panel sides follow the corresponding observed outer lines (pixel tolerance: max 4 px or 0.5 percent of the shorter source axis). The outer candidate must independently meet the existing supported-contour bounds: confidence >=0.35, edge support >=0.5 and contour-fit ratio 0.65..1.4. Keep the original candidate corners; do not grow a missing sheet. This affects shared candidate selection, including the white tracked camera outline, without changing temporal thresholds or the green progress clock. See [ADR 0005](adr/0005-paper-shape-and-live-continuity.md).

The candidate-specific overlap thresholds and failure reasons are specified in [ADR 0005](adr/0005-paper-shape-and-live-continuity.md). A plausible rectangle or estimated paper ratio does not establish correct document edges. No full-image fallback is allowed.

## Profiles, tones, quality and lens correction

Public profiles are `auto`, `photo`, `color`, `grayscale`, `bw`, mapped to recipes `auto`, `none`, `paper`, `grayscale`, `bw`. `document` remains a legacy direct-processing recipe only; it is not a visible profile. Default precedence is open call > controller configuration > Auto, validated before opening. Each new page starts with that default; manual page edits remain authoritative.

Auto immediately samples the corrected image at about 256 positions per long axis. Opaque neutral pixels have channel values >=90 and spread <=24; flat neighbors differ by <=18 total luminance values. Neutral coverage >=55 percent, flat coverage >=45 percent and neutral 85th percentile >=140 choose Color; otherwise Photo. This is a white-paper assumption, not semantic recognition. Color applies paper equalization, adaptive contrast 1..1.15 and sharpness 20/100. Auto never chooses Grayscale/S/W. Preserve Auto intent in the recipe and actual profile/reason/statistics/effective suggestions in `autoOptimization`. Explicit tone settings override those suggestions; manual profile metadata must not retain stale Auto data.

Color/Grayscale paper correction requires >=35 percent neutral opaque samples and a global 85th percentile >=110. Use per-channel local medians, target 64 pixel grid cells (at most 32 x 32), >=8 samples per cell, channel spread <=40 and background floor 35 percent of the global reference. Fill only unsupported cells, smooth twice and interpolate with linear edge continuation. Target 255 with gain capped at 3. Protect strong colors: full neutral weight through spread 40, fading to zero by 64. Keep alpha and faint relative strokes. Grayscale conversion follows correction/tones. Reserve 4 MiB for the extra RGB statistics before allocation. Photo and legacy filters do not receive this whitening.

S/W retains separate paper preparation: 85th-percentile common luminance field, 96 pixel target cells, neutral band 24, background floor 55 percent, clamped edges, target 250 and gain <=2.2. It then uses light edge-preserving noise smoothing and a soft local tone curve, not binary 0/255 thresholding. Protect dark ink below 60 and opposing supported faint lines. Reduce isolated gray impulses differing by >12 from all neighbors; apply a small 3 x 3 mean where range <=32. Estimate background from local mean plus 0.4 standard deviation and use a continuous transition width 36..116. Preserve gray text edges, punctuation and alpha. No blanket component removal, morphology or invented text.

Brightness/contrast range -100..100 and sharpness 0..100. Commit ranges after release/keyboard editing and process in the worker from original bytes. The full optimization reset selects Photo, neutral tones and lens Off; Auto resets manual filter/tone/lens-strength overrides. Individual adjustment resets affect only the selected brightness/contrast/sharpness value (0), or select Lens Auto and remove its manual strength. Other recipe values, corners, format and rotation remain unchanged. Original capture, unoptimized crop and result remain separately available. The comparison blob is omitted in final export and counted during review.

`Recipe.dewarp` means limited radial lens correction (`off`, `auto`, `manual`), not paper flattening. Manual strength is -0.18..0.18. Use a one-parameter division model around assumed image center before perspective extraction; original corner metadata retains its normalized source space. Auto needs at least three distributed edges with >=36 samples each, separate fit/check positions and agreeing per-edge estimates. Error <0.75 px means already straight. Applying requires >=40 percent independent improvement, residual <=1.25 px, a non-boundary solution and nonzero evidence. Otherwise leave the geometry unchanged and report status. No tangential/device calibration claim.

Quality uses unoptimized regions away from background/document borders: Laplacian variance, contrast/brightness and directed edge-transition evidence. Noise alone is not proof of sharp text. Missing structure is unknown; white paper alone is not overexposure. Quality revisions follow edits. Warnings can be overridden deliberately in review, but unknown sharpness cannot trigger Auto. This is not OCR/readability certification and cannot reconstruct motion-blurred characters.

## Format inference and output layout

Estimate an unconstrained ratio from normalized original corners and full source dimensions before applying a preset. The projective estimate assumes square pixels, zero skew and centered principal point. Reject implausible/near-affine/unstable solutions. Details, perturbations and uncertainty bounds are in [ADR 0008](adr/0008-perspective-and-regional-paper-format.md).

Compare A4/Letter logarithmic distances within 0.09; only a difference <=0.035 permits the weak regional prior when both are plausible. `paperRegion` is an optional two-letter host code, then the explicit region of the primary locale, otherwise global A4. No language maximization, GPS or IP lookup. CLDR 48 assigns Letter to BZ/CA/CL/CO/CR/GT/MX/NI/PA/PH/PR/SV/US/VE. Unsupported edges cannot make a stable numerical estimate authoritative; ambiguous perspective returns a bounded range and regional suggestion, or original ratio when insufficiently constrained. No crop means no format/result.

| Layout | Millimeters |
| --- | --- |
| A3 / A4 / A5 / A6 | 297 x 420 / 210 x 297 / 148 x 210 / 105 x 148 |
| Letter | 215.9 x 279.4 |
| Postcard | 100 x 150 |
| Receipt | 58/80/112 or custom width, proportional length; 80 is a default |
| Original ratio | Proportional, short side 210 as an explicitly assumed print layout |

A-series sizes are indistinguishable from ratio alone; A4 is the group default. Standard presets correct the entire crop to the selected ratio and fill the PDF page; pixel-rounding differences are compensated during embedding. Receipts/original ratio stay proportional. `orientation` specifies standard paper axes before separate `rotation`, preserving text direction when changing paper axes. Manual formats/orientation survive edits and replacements. Output sizes are layouts, not physical measurements; `physicalSizeMm` is null.

Export pages serially and embed the exact exported JPEG/PNG blobs in jsPDF without a lossy intermediary or UI screenshot. Mixed page layouts are allowed. Validate both PDF dimensions in 10..5,000 mm; one capture is one PDF page. Any page/encoding/PDF error prevents confirmation.

## Limits and lifetime

| Resource | Default |
| --- | --- |
| Pages / individual file | 20 / 20 MiB |
| Decoded original / all original bytes | 24 MP / 100 MiB |
| Output | 8 MP and longest side 4,096 px, without upscaling |
| Retained result blobs | 128 MiB |
| Estimated working buffers | 384 MiB |
| High-resolution processing | One page at a time |

Limits are configurable positive integers. The working estimate is not browser RSS. Preflight includes decode/output buffers; final result budget includes optional originals and PDF. Separate thumbnails have a maximum 256 pixel long side and count towards session budget. Pending replacement retains the old original in peak accounting. Recipe undo retains at most twelve small edit records, not extra image blobs.

## Focused mobile UI and host integration

[ADR 0020](adr/0020-focused-review-and-shared-viewer.md) supersedes the older stacked tools/single-page manager. Review uses a measured image viewer and fixed Previous/Next/Finish; Finish directly exports the confirmed current draft. Unreviewed import files block completion until reviewed or explicitly discarded, including after limits/errors. Tiles scroll within a bounded region and have at least 120 x 156 pixel top-left cover previews, without altering exports. Editing, atomic replacement, deleting and movement remain available.

Review and required corner confirmation use the current source: Retake/Wiederholen reopens the existing camera for camera candidates; Replace image/Bild tauschen opens a dedicated single-image picker without camera access for files. Accepted-page replacement follows the same distinction. Cancelling/empty selection or processing failure preserves the prior candidate, replacement target and remaining import queue; cancelling required corners for a replacement restores the preceding candidate. Return focus to the replacement action. Accepted pages keep their ID/bytes until atomic acceptance. Count rollback resources within existing budgets and invalidate pending work on session end. Review places replacement, direct discard and Add page beneath the document as three equal mobile columns, with Add page on the right. Labelled Undo, Original and Quality remain separate utility actions. Discard removes the candidate or unaccepted edits, preserving any previously accepted page; deleting that page remains a page-manager action. Individual discard and closing the session remain separate. This shared-UI change adds no public option and is unreleased, outside npm 0.2.0 (D-047).

Filter, Adjust, Format, Original and Quality reclaim the image workspace and hide unrelated navigation. Original and Quality are read-only and return to review with one OK button. Editing tools use Apply to keep edits and Cancel to restore the prior recipe/geometry and undo history, retaining the tool on restore failure. Hide the session-close X inside tools and both corner-editor states. Escape follows the visible local cancellation/rollback action, including when focus is on the scanner dialog. Restore focus to the originating tool after Cancel/Apply. Undo remains separate from the full optimization reset and the new individual adjustment resets. Unreleased Find edges/Kanten finden reruns existing independent still processing of the original without supplied corners/live hints, preserving existing rotation, full recipe and format. Only successful detection updates provisional editor corners; Apply creates the normal undo step, Cancel preserves the prior crop, and failed detection keeps manual choices. New manual input or editor/session cancellation invalidates pending/late results; Apply is blocked during search. Required crop still needs explicit confirmation. This shared-UI action adds no public API and is not in npm 0.2.0 (D-048). Lens Auto contains its actual status. Portrait/landscape share one rotated sheet icon; postcard has the German two-line label "Post-" / "karte" and accessible dimensions. Rotation has no toast. The corner loupe is detached and drawn from original pixels: TL/BR to bottom-left, TR/BL to top-left. Keep 48 pixel handles/keyboard arrows; edge grips and left-handed mode are deferred.

The public React `ImageViewer` is shared by review and result inspection. Fit uses decoded natural dimensions and available measured space. Tap/double tap toggles fit/100% once; stepped magnifiers and continuous midpoint-anchored pinch complement pan. Drag release does not toggle zoom. Retain zoom across tone/filter changes, reset it for pages/rotation. A split-image button holds the unoptimized crop at matching geometry/zoom; pointer, keyboard, cancellation, blur and visibility release restore the latest result.

Reference results retain blobs on returning to start; discard is explicit. PDF.js mounts only when selected, renders the active page first and keeps at most three canvases with retry. Landscape result actions move to the side. Default diagnostic recording is off. The library and standalone viewer default to English; `locale: 'de'` selects built-in German. Reference hosts default to English, detect a German primary browser language and honor explicit `?lang=en` / `?lang=de` selections across reloads, including results/PDF labels without changing document bytes. `texts` overrides existing German message keys or English text; semantic CSS variables style the reusable React component and controller. Opening snapshots configuration; updated callbacks do not restart sessions. Close/unmount cleans up; StrictMode cannot create duplicate sessions.

## UI theme completeness

The existing ten root tokens remain supported with unchanged defaults. Additional fallback tokens cover the modal backdrop/stacking, primary/warning foregrounds, camera palette/overlays/shutter/focus, control/panel/mobile radii, density, capture outline/loupe and standalone viewer background/radius. The full public fallback contract is in [ADR 0026](adr/0026-complete-ui-theme-tokens.md). Supplied theme properties are also applied to the owned backdrop, whose parent position cannot inherit from the scanner dialog. Both UI entry points use this same controller path.

An explicit `theme['--scanner-focus']` also supplies the camera focus unless `--scanner-camera-focus` is supplied. Without either, the existing mobile camera focus is preserved. `--scanner-warning-text` applies to general warnings and camera errors directly. Standalone `ImageViewer` consumes inherited `--scanner-font` via `font-family`, falling back to the host's inherited font; no viewer theme prop is added. Select carets consume an explicit arrow color with the existing muted-color fallback. `--scanner-spacing` scales chrome gaps/padding/margins while preserving dimensions, safe areas and the corner editor's minimum reserved handle space. Options still snapshot when opening; there is no new headless/slot/layout API or runtime preference channel.

These extensions require 0.2.0. They do not change the immutable 0.1.0 release, document bytes, processing, completion or host responsibilities.

## Diagnostics

An optional failure-tolerant diagnostic receiver gets correlated worker events, raw sources, available intermediate buffers and final artifacts. Without configuration, no diagnostic buffers/images are generated. The reference keeps its recording separately from result blobs in RAM. It has a shared 512 MiB/10,000 event budget across up to 100 sessions; heavy live/engine details use at most one quarter. Record at most 240 live frames in the first 60 seconds of each session. Detail exhaustion stops heavy detail transfer while preserving room for sources/processing/exports; total exhaustion stops and marks partial recording. Keep the selected engine debug path stable after stopping recording.

Schema 2 ZIP has `manifest.json`, globally unique file/event references and `sessionId` per event, unchanged originals/final image/PDF bytes, bounded intermediate views and typed raw buffers. Unavailable internal states are not claimed. ZIP generation/download are explicit and lazy. Deletion releases recording/archive after one hour from last completed session without download, or ten minutes after last download. A new session invalidates an old archive and restarts retention. Do not interrupt active scans/archive generation; recheck on foreground return. Reload discards RAM; downloaded device files are not deleted. No additional camera identifiers/location values are collected, though original bytes can contain metadata. Recording affects performance. See [diagnostic guide](testing/DIAGNOSTICS.md).

## Errors

Configuration/lifecycle: `CONFIG_INVALID`, `SCANNER_BUSY`, `SCANNER_DISPOSED`. Camera: `CAMERA_UNSUPPORTED`, `CAMERA_UNAVAILABLE`. Engine: `ENGINE_LOAD_FAILED`, `PROCESSING_TIMEOUT`, `PROCESSING_FAILED`. Input: `FILE_UNSUPPORTED`, `LIMIT_EXCEEDED`, `CORNERS_INVALID`. Export: `CROP_REQUIRED`, `EMPTY_SESSION`, `LAYOUT_INVALID`, `METADATA_INVALID`, `EXPORT_FAILED`. Recoverable errors preserve the session; host cancellation resolves `cancelled`.

## Tests and traceability

| Test | Expected coverage | Requirements |
| --- | --- | --- |
| T-01 | Lazy open/close, Busy/Disposed, cancellation, SSR-safe imports | F-01, I-05, N-03 |
| T-02 | Permissions, rear camera, restart, no audio tracks | F-02, F-03 |
| T-03 | Signatures, supported types, corrupt input, limits, EXIF | F-04, F-24, N-02 |
| T-04 | Convex corners, loupe, touch/keyboard, original-based redetection preserving page settings, Apply/Cancel/Undo, failure/late-answer invalidation and required confirmation with no image/format | F-05, F-06 |
| T-05 | Perspective grid, edge accuracy, quarter-turn rotation | F-06, F-07, N-01 |
| T-06 | Reversible profiles, faint digits, handwriting and colors | F-08, N-01 |
| T-07 | Independent projected A4/Letter, ambiguous A-series, invalid models, regional bounds and manual precedence without location requests | F-10, F-11, F-13 |
| T-08 | Presets, receipts, orientation/rotation and layouts | F-12, F-13, F-14, F-28 |
| T-09 | Adding/editing/ordering, source-aware DE/EN replacement and direct picker, cancellation/failure/required-crop rollback, retained import queue and atomic accepted-page replacement | F-09, F-15, F-16 |
| T-10 | No partial confirmation after export error/abort | F-17, F-27, I-03 |
| T-11 | Sharpness, lighting, unknown and honest quality claims | F-18, N-01 |
| T-12 | Local OCR/flattening remain outside commissioned scope | F-20, F-21, F-22 |
| T-13 | Track/worker/bitmap/URL lifetime and late answers | N-02, N-03 |
| T-14 | No uploads, persistence or CDN fallback | N-04, I-04 |
| T-15 | Themes, narrow views, focus, corners and ordering | I-02, N-05 |
| T-16 | Physical iPhone/Android, standalone, 12 MP and long sessions | N-02, N-06 |
| T-17 | Blob/JSON ownership and endpoint-free handoff | I-03, F-17 |
| T-18 | Reproducible install, pins, assets and notices | N-07, N-08, N-09 |
| T-19 | Configurable exact-boundary gate, defaults/validation/precedence, once-only, drift/blur/gaps | F-19, F-23 |
| T-20 | Shared full-original camera/import processing | F-04, F-06, F-24 |
| T-21 | In-flight invalidation and manual shutter | F-19, F-25 |
| T-22 | Measured progress at the configured duration, pauses/reset, contour/text | F-26, N-05 |
| T-23 | Decoded images, PDF pages/order/sizes and PDF.js pixel comparison | F-27, F-28 |
| T-24 | Both built hosts and actual file downloads | F-29, I-01, I-06 |
| T-25 | Opt-in diagnostics, independent ZIP reading, final bytes, limits/errors/abort | F-30, N-02, N-04 |
| T-26 | Multi-sheet completeness/middle/left, observed outer boundaries versus fold panels, low-contrast recovery, negative inner frames/absent/clipped/weak wrappers, preserved normal targets and independent still despite delayed live job | F-06, F-24, F-31, N-03 |
| T-27 | Paper scores, outliers, confirmed changes and paused evidence, no stale trigger | F-19, F-23, F-26, F-32 |
| T-28 | Frozen pixels before encoding, cue timing, proportional frozen image and reduced motion | F-24, F-26, F-33, N-05 |
| T-29 | Rotated known corners, dual resolutions with one shared recovery-call budget, bounded sharpening and optional autofocus | F-06, F-08, F-24, F-34, N-01 |
| T-30 | Mobile camera portrait/landscape, reachable controls, import, light and errors | F-35, F-02, F-03, F-04, F-25, I-02, N-05 |
| T-31 | Paper axes without content rotation, edits/metadata/rendered PDF consistency | F-36, F-07, F-13, F-28 |
| T-32 | Blank-page manual hint, shadow/ink/color protection, original/crop/result and export | F-18, F-19, F-37 |
| T-33 | Coherent top-edge recovery, preservation of strong edges and negative examples | F-05, F-06, F-24 |
| T-34 | Neutral byte equivalence, isolated adjustment resets, manual values, radial positives/negatives and matching comparison/export | F-38, F-39, N-04 |
| T-35 | Profile precedence, React lifecycle, focused tools, measured mobile targets, tiles, direct finish, queue failures, undo/cancel, zoom/pinch/held comparison, loupe, long receipts, themes and real downloads | F-40, F-41, F-42, F-37, N-05 |
| T-36 | Default/direct entry, file precedence/empty arrays/invalid values, denial/retry/import, pre/during abort, destroy, StrictMode and late streams | F-43, F-03, N-03 |
| T-37 | Genuine mode/export changes before cancel, silent reapplication, same-turn deduplication, invalid values, page-edit exclusion, callback failures/latest React handler and no events after close | F-44, F-25, F-28, N-03, N-04 |
| T-38 | Rendered theme application to backdrop, workspace, mobile denied-camera/error/options/focus/shutter, default/specific focus precedence and standalone viewer font/palette/radius | F-45, I-02, N-05 |

Synthetic calibration and acceptance fixtures remain separate. Browser emulation does not satisfy T-16 or formal assistive-technology acceptance. [Test status](testing/STATUS.md) and [device protocol](testing/DEVICE-PROTOCOL.md) identify that remaining work explicitly.
