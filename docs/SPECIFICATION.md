# Implementation contract

Version 0.8, 25 October 2026. Implements the [requirements](REQUIREMENTS.md) and accepted [decisions](DECISIONS.md). Source code is not acceptance evidence; actual checks and open limitations belong in [test status](testing/STATUS.md).

## Delivery and architecture

One TypeScript package provides the DOM-free `@ktb/scanner` core and separate `/react`, `/scanic`, `/export` and `/styles.css` entry points. React/React DOM are peers. The reference Next.js application and smaller Astro host consume the built package and copied same-origin assets. No domain models, backend endpoints or implementation code from another product are copied.

Classic Scanic 1.7.1 runs behind an adapter in a module worker. Build-time instrumentation checks the exact version and unique source anchors before exposing existing debug buffers and an optional candidate-selection callback. It fails closed on source drift. The installed vendor package is unchanged. Classic WASM is embedded in the distributed Scanic build; no ML mode or CDN fallback is activated. The corner editor loads on demand. jsPDF creates PDFs in a separate export worker; PDF.js belongs only to the reference preview.

Core imports must not access React, camera, window or document. UI/engine load after a host action; PDF generation and preview code load only when needed. The library installs no service worker and requires no global cross-origin isolation. Build and integration instructions are in [INTEGRATION.md](INTEGRATION.md).

## Controller, ownership and session state

`createScanner(options)` exposes `open({ signal?, initialFiles?, defaultProfile?, autoCaptureStabilityMs? })` and `destroy()`. Reject invalid configuration, overlapping opens and calls after destruction. Initial files open review without requesting a camera. Host abort resolves `cancelled`; recoverable processing/export errors remain visible in the session. Destroy stops owned workers/tracks, invalidates pending jobs and releases preview resources. The host owns confirmed blobs after completion and must revoke object URLs it creates.

A confirmed result has status, schema version 1, session ID, ordered stable accepted-page IDs/revisions, image blobs, serializable geometry/orientation/format/processing/quality metadata and an optional PDF blob. Originals are returned only when requested. Images and PDF must contain the same confirmed edit revision. Never report success with a missing page. Session operations preserve old pages through processing, cancellation and replacement failures. Export locks a snapshot and releases that lock on both success and failure.

Only accepted pages are exportable. A `CropRequired` processing result has `status: crop-required`, source size, proposed corners and a reason, but no image or format. The ready-made UI requires explicit corner confirmation before processing/acceptance. Custom hosts must do the same. Export encountering such a state fails with `CROP_REQUIRED`; it must not substitute the original or confirm a partial document.

## Camera and automatic capture

Prefer the rear camera and request video only. Preserve import, camera selection and restart after denial/interruption. Request continuous autofocus only if supported; failure must not block camera startup. Camera light appears only when `torch` is supported, uses constraints and invalidates stale light requests on restart. Pause capture evidence while changing light.

Live video is independent of detection. Submit at most about eight reduced frames per second and allow one detection job; discard stale waiting frames. Keep raw detection, smoothed display geometry and full-resolution still geometry separate. Display smoothing has about 180 ms response time. The tracker confirms jumps, holds display for 400 ms and fades it by 600 ms; held display supplies no capture evidence.

`autoCaptureStabilityMs` sets the required measured stable time: open-call override > controller configuration > 1,000 ms. Validate both supplied values as safe integers from 100 through 5,000 before opening resources. The progress contour and capture gate share the resolved duration. The reference offers 400/600/800/1,000/1,200/1,500/2,000 ms in Scan options; changes apply to subsequent sessions. API values need not match those presets. At least two distinct valid observations are necessary; the next fresh observation may arrive after the requested minimum, depending on the live-detection cadence and processing time. No timer-only capture or extra post-completion delay is introduced. Record the effective duration in diagnostic session-open and camera-start events. See [ADR 0021](adr/0021-configurable-capture-stability.md).

Measure against a fixed initial raw geometry so slow drift cannot hide behind smoothing. Starting bounds: 0.05 normalized anchor drift, 0.035 frame step and 15 percent area change. Only measured intervals up to 400 ms count. Uncertainty pauses for at most 1,200 ms since the last good measurement without later adding the missing interval. Movement, longer loss, mode change or cancellation resets the gate. Fresh sharp evidence is checked at the final claim; one claim produces one capture until explicitly rearmed.

Unknown sharpness on a detected blank page explains that manual capture is needed; measured blur has a separate hint. Manual capture remains available in Auto and is the only trigger in Manual. Switching to Manual immediately invalidates in-flight automatic decisions. Stale live answers cannot alter an already captured still.

At claim, synchronously copy one complete video frame before encoding. This prioritizes the claimed moment over a later asynchronous sensor photo. Retain the source dimensions after stopping the stream, show a proportionate frozen image and processing feedback, and optionally play the preloaded local cue. Unsupported/blocked audio never delays capture. Silence creates no AudioContext and downloads no cue. Reduced motion disables animation. Before a claim, leave at least 1.5 percent of the green perimeter open so a displayed complete outline always means the frame has been secured.

## Shared camera/import processing

1. Validate file signature/type and configured budgets before decoding. Preserve original bytes. Normalize EXIF orientation once; subsequent corners use the same normalized source coordinates.
2. Detect at bounded working resolution, collecting 1,000/800 pixel hypotheses in a common source space. Search additional rotated views when missing/conflicting, including +/-30 degrees and hint-oriented views. Working images never silently replace export originals.
3. Validate convex geometry and minimum automatic area. Reject automatic contours below eight percent area or effectively equal to the source frame (all corners within 0.025 normalized distance). Explicit manual crops are exempt from these automatic plausibility restrictions.
4. Rank confidence, edge support, rectangularity, opposite-edge similarity, parallelism and paper-ratio proximity. Perspective and long receipts remain legal. Deduplicate pass contours and inner text/table rectangles. Prefer complete-looking candidates; among independent sheets choose horizontal middle or left-middle. Comparable separate sheets retain this positional rule. Weak overlapping fragments must not masquerade as another sheet.
5. Compare a live hint only if at most 400 ms old, aspect-compatible and known to show the same frame area. It is never an automatically confirmed crop. An unresolved conflict with a stable Auto hint yields `crop-required`; a manual hint does not veto an independently better still.
6. Refine original-resolution edges in narrow strips using gradients, robust line fitting and supported intersections. Accept only valid convex geometry with plausible movement and evidence. No universal border padding/inset.
7. If the normal fit leaves a weak top edge, test coherent outward bright lines over 64 positions and up to six percent of the long source axis. Require old evidence <0.4; new evidence >=0.6 and >0.15 better; >=47 supported samples and >=9 per quarter; >=85 percent bright neutral inner band; corner drift <=0.065 and area factor 1.0025..1.2. Preserve bottom corners and require new side continuation support. Manual corners and existing strong edges remain unchanged. Keep the uncertainty warning.
8. Apply optional radial correction, Scanic perspective extraction, chosen paper axes, separate 90-degree rotation and image profile. Recompute all edits/export from the original rather than repeatedly filtering compressed previews. Limit output without upscaling. Export encoding drops original location/device metadata.

The candidate-specific overlap thresholds and failure reasons are specified in [ADR 0005](adr/0005-paper-shape-and-live-continuity.md). A plausible rectangle or estimated paper ratio does not establish correct document edges. No full-image fallback is allowed.

## Profiles, tones, quality and lens correction

Public profiles are `auto`, `photo`, `color`, `grayscale`, `bw`, mapped to recipes `auto`, `none`, `paper`, `grayscale`, `bw`. `document` remains a legacy direct-processing recipe only; it is not a visible profile. Default precedence is open call > controller configuration > Auto, validated before opening. Each new page starts with that default; manual page edits remain authoritative.

Auto immediately samples the corrected image at about 256 positions per long axis. Opaque neutral pixels have channel values >=90 and spread <=24; flat neighbors differ by <=18 total luminance values. Neutral coverage >=55 percent, flat coverage >=45 percent and neutral 85th percentile >=140 choose Color; otherwise Photo. This is a white-paper assumption, not semantic recognition. Color applies paper equalization, adaptive contrast 1..1.15 and sharpness 20/100. Auto never chooses Grayscale/S/W. Preserve Auto intent in the recipe and actual profile/reason/statistics/effective suggestions in `autoOptimization`. Explicit tone settings override those suggestions; manual profile metadata must not retain stale Auto data.

Color/Grayscale paper correction requires >=35 percent neutral opaque samples and a global 85th percentile >=110. Use per-channel local medians, target 64 pixel grid cells (at most 32 x 32), >=8 samples per cell, channel spread <=40 and background floor 35 percent of the global reference. Fill only unsupported cells, smooth twice and interpolate with linear edge continuation. Target 255 with gain capped at 3. Protect strong colors: full neutral weight through spread 40, fading to zero by 64. Keep alpha and faint relative strokes. Grayscale conversion follows correction/tones. Reserve 4 MiB for the extra RGB statistics before allocation. Photo and legacy filters do not receive this whitening.

S/W retains separate paper preparation: 85th-percentile common luminance field, 96 pixel target cells, neutral band 24, background floor 55 percent, clamped edges, target 250 and gain <=2.2. It then uses light edge-preserving noise smoothing and a soft local tone curve, not binary 0/255 thresholding. Protect dark ink below 60 and opposing supported faint lines. Reduce isolated gray impulses differing by >12 from all neighbors; apply a small 3 x 3 mean where range <=32. Estimate background from local mean plus 0.4 standard deviation and use a continuous transition width 36..116. Preserve gray text edges, punctuation and alpha. No blanket component removal, morphology or invented text.

Brightness/contrast range -100..100 and sharpness 0..100. Commit ranges after release/keyboard editing and process in the worker from original bytes. Reset selects Photo, neutral tones and lens Off; Auto resets manual filter/tone/lens-strength overrides. Original capture, unoptimized crop and result remain separately available. The comparison blob is omitted in final export and counted during review.

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

Filter, Adjust, Format, Original and Quality reclaim the image workspace and hide unrelated navigation. Original and Quality are read-only and return to review with one OK button. Editing tools use Apply to keep edits and Cancel to restore the prior recipe/geometry and undo history, retaining the tool on restore failure. Undo is separate from Reset. Lens Auto contains its actual status. Portrait/landscape share one rotated sheet icon; postcard has the German two-line label "Post-" / "karte" and accessible dimensions. Rotation has no toast. The corner loupe is detached and drawn from original pixels: TL/BR to bottom-left, TR/BL to top-left. Keep 48 pixel handles/keyboard arrows; edge grips and left-handed mode are deferred.

The public React `ImageViewer` is shared by review and result inspection. Fit uses decoded natural dimensions and available measured space. Tap/double tap toggles fit/100% once; stepped magnifiers and continuous midpoint-anchored pinch complement pan. Drag release does not toggle zoom. Retain zoom across tone/filter changes, reset it for pages/rotation. A split-image button holds the unoptimized crop at matching geometry/zoom; pointer, keyboard, cancellation, blur and visibility release restore the latest result.

Reference results retain blobs on returning to start; discard is explicit. PDF.js mounts only when selected, renders the active page first and keeps at most three canvases with retry. Landscape result actions move to the side. Default diagnostic recording is off. German texts are replaceable via `texts`; semantic CSS variables style the reusable React component and controller. Opening snapshots configuration; updated callbacks do not restart sessions. Close/unmount cleans up; StrictMode cannot create duplicate sessions.

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
| T-04 | Convex corners, loupe, touch/keyboard; required confirmation with no image/format | F-05, F-06 |
| T-05 | Perspective grid, edge accuracy, quarter-turn rotation | F-06, F-07, N-01 |
| T-06 | Reversible profiles, faint digits, handwriting and colors | F-08, N-01 |
| T-07 | Independent projected A4/Letter, ambiguous A-series, invalid models, regional bounds and manual precedence without location requests | F-10, F-11, F-13 |
| T-08 | Presets, receipts, orientation/rotation and layouts | F-12, F-13, F-14, F-28 |
| T-09 | Adding/editing/ordering and atomic page replacement | F-09, F-15, F-16 |
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
| T-26 | Multi-sheet completeness/middle/left and independent still despite delayed live job | F-06, F-24, F-31, N-03 |
| T-27 | Paper scores, outliers, confirmed changes and paused evidence, no stale trigger | F-19, F-23, F-26, F-32 |
| T-28 | Frozen pixels before encoding, cue timing, proportional frozen image and reduced motion | F-24, F-26, F-33, N-05 |
| T-29 | Rotated known corners, dual resolutions, bounded sharpening and optional autofocus | F-06, F-08, F-24, F-34, N-01 |
| T-30 | Mobile camera portrait/landscape, reachable controls, import, light and errors | F-35, F-02, F-03, F-04, F-25, I-02, N-05 |
| T-31 | Paper axes without content rotation, edits/metadata/rendered PDF consistency | F-36, F-07, F-13, F-28 |
| T-32 | Blank-page manual hint, shadow/ink/color protection, original/crop/result and export | F-18, F-19, F-37 |
| T-33 | Coherent top-edge recovery, preservation of strong edges and negative examples | F-05, F-06, F-24 |
| T-34 | Neutral byte equivalence, manual values/reset, radial positives/negatives and matching comparison/export | F-38, F-39, N-04 |
| T-35 | Profile precedence, React lifecycle, focused tools, measured mobile targets, tiles, direct finish, queue failures, undo/cancel, zoom/pinch/held comparison, loupe, long receipts, themes and real downloads | F-40, F-41, F-42, F-37, N-05 |

Synthetic calibration and acceptance fixtures remain separate. Browser emulation does not satisfy T-16 or formal assistive-technology acceptance. [Test status](testing/STATUS.md) and [device protocol](testing/DEVICE-PROTOCOL.md) identify that remaining work explicitly.
