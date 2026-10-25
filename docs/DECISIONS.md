# Initial-version decisions

Updated 25 October 2026. These decisions resolve the initial product scope. The source license is explicitly AGPLv3. Implementation, automated verification and physical-device acceptance remain separate; see [test status](testing/STATUS.md).

| ID | Decision | Consequences and limits |
| --- | --- | --- |
| D-001 | Classic Scanic behind an adapter | Exact installed version 1.7.1; 1.7.0 was unavailable. No silent engine replacement; physical suitability remains to be verified. |
| D-002 | Independent library, complete Next.js reference and small Astro example | Local images and browser raster PDF, without changes to other products or a production backend. |
| D-003 | AGPL version 3 only, explicitly selected | Replaces the private/UNLICENSED development decision. Workspace/examples remain non-publishable packages; source is open. Preserve separate third-party notices. |
| D-004 | Reversible conservative processing, own sharpness/exposure metrics and Auto/Manual | Auto defaults per D-029. No local OCR/full flattening. Capture stability defaults to 1,000 ms and is configurable per D-037; smoothing is display-only. |
| D-005 | Session in RAM only | No service worker, automatic persistence or recovery promise. Next.js manifest supports standalone use, not offline recovery. |
| D-006 | Primary iPhone Safari and Android Chrome, current/previous supported generations | Add desktop browsers. About 100 ms feedback and warm 12 MP review within five seconds are development targets, not device measurements. |
| D-007 | Replaceable German UI texts, theme tokens and two reference themes | Green progress plus text, keyboard corners/order and focus handling. No untested accessibility conformance claim. |
| D-008 | JPEG/PNG/WebP import; JPEG 0.92/PNG and multi-page raster PDF export | No OCR layer. Original return is opt-in. TIFF, HEIC/HEIF and PDF import are deferred. |
| D-009 | TypeScript/pnpm, one package with separate React entry | DOM/React-free core import, workers, controlled assets, Vitest and Playwright. |
| D-010 | Paper format determines rectification target ratio | Correct both crop axes and fill the PDF page without added margins. Receipts/original ratio remain proportional. |
| D-011 | Local reference diagnostics across sessions | Explicit opt-in per D-033. Shared 512 MiB, at most 128 MiB heavy detail; explicit deletion, one hour without download, ten minutes after download. No upload/persistence. |
| D-012 | Fresh still detection and multi-sheet choice | Cancel live jobs before capture; prefer complete sheets, then horizontal middle/left-middle. Inner/duplicate/weaker fragments do not count as independent sheets. |
| D-013 | Soft paper-shape evidence and bounded continuity | Score raw pixel geometry without idealizing corners. Hold display 400 ms/fade by 600 ms; evidence intervals <=400 ms; uncertainty pauses <=1,200 ms. Bounds: 0.05 anchor drift, 0.035 frame step, 15% area change. |
| D-014 | Secure the frame at green completion with immediate feedback | One synchronous complete streamframe, then encoding/processing. Proportional freeze, optional local cue and reduced-motion feedback. Twelve named cues plus silence; audio cannot delay capture. |
| D-015 | Dual still resolutions and rotated hypotheses | Combine 1,000/800 pixel candidates, refine original edges and search rotations for conflicts. No full-frame substitute; no corner keypad. |
| D-016 | Capture quality and reversible detail enhancement | Optional supported autofocus, one frame/no fusion. Bounded sharpening cannot recover lost characters. |
| D-017 | Direct mobile camera workspace | Proportional complete source and matching overlay, large shutter, compact options, import and safe areas; light only when supported. [ADR 0007](adr/0007-mobile-camera-interface.md). |
| D-018 | Independent perspective ratio and weak regional prior | Geometry before format, uncertainty ranges when needed, host/primary-locale paper preference only near ambiguity. No location request. [ADR 0008](adr/0008-perspective-and-regional-paper-format.md). |
| D-019 | Never automatically fall back to the entire original | Missing/conflicting contours yield `crop-required` without image/format. Explicit corners are required before acceptance/export. [ADR 0009](adr/0009-required-crop-confirmation.md). |
| D-020 | Paper orientation separate from image rotation | Portrait/landscape correct target axes without turning text. Preserve manual orientation across edits/export. [ADR 0010](adr/0010-manual-paper-orientation.md). |
| D-021 | Explain Auto blockage from unknown sharpness | On a detected blank page, retain Auto but explicitly request manual capture. Measured blur has a different hint. |
| D-022 | Optional paper brightening with an unchanged crop comparison | Estimate neutral background conservatively; retain original/crop/result and original-based recalculation. Auto default follows D-029. [ADR 0011](adr/0011-optional-paper-cleanup.md). |
| D-023 | Targeted recovery of weak top outer edges | Require a coherent bright outward line and supported side continuation; preserve strong/manual edges and uncertainty. No fixed padding. [ADR 0012](adr/0012-coherent-top-edge-recovery.md). |
| D-024 | Automatic optimization and reversible manual controls | Brightness/contrast -100..100, sharpness 0..100, Reset and comparisons. Focused presentation follows D-035. [ADR 0013](adr/0013-visible-controls-and-radial-correction.md). |
| D-025 | Limited radial lens Off/Auto/Manual | Own one-parameter model before perspective; independent agreeing edges required for Auto, otherwise unchanged. No full camera calibration/flattening. [ADR 0013](adr/0013-visible-controls-and-radial-correction.md). |
| D-026 | Distinct Photo/Color/Grayscale/S/W | Original-based processing, no synthetic text. D-029 adds Auto; D-030 strengthens white paper and D-031 softens S/W. [ADR 0014](adr/0014-document-profiles-and-review.md). |
| D-027 | Mobile review and results | Reachable actions, zoom and actual image/PDF downloads. Layout updated by D-035. [ADR 0014](adr/0014-document-profiles-and-review.md). |
| D-028 | Encapsulated React component and per-open defaults | Same controller, texts/tokens and cleanup. Default precedence is call > configuration > Auto under D-029. Earlier single-page manager is superseded by D-035. [ADR 0015](adr/0015-compact-mobile-workspace.md). |
| D-029 | Auto when no manual profile override is supplied | Choose/optimize Photo or Color immediately, never automatically remove colors. Preserve explicit profiles/tones and record intent separately from resolved settings. [ADR 0016](adr/0016-automatic-profile-selection.md). |
| D-030 | Whiter Color/Grayscale paper | Local per-channel correction towards 255, gain capped at 3, protect strong colors/weak strokes. Auto uses it for Color. [ADR 0017](adr/0017-whiter-color-and-grayscale-paper.md). |
| D-031 | Low-noise S/W with soft gray edges | Replace hard thresholding with supported-stroke protection, slight smoothing and a local continuous curve. No OCR, blanket spot removal or reconstructed text. [ADR 0018](adr/0018-soft-monochrome.md). |
| D-032 | Reliable long-receipt fitting | Measure available space and decoded pixels; page changes reset fit. Viewer interaction updated by D-035. [ADR 0019](adr/0019-long-receipt-viewer.md). |
| D-033 | Diagnostics off by default everywhere | Record only explicitly enabled sessions; buffers remain separately opt-in. Existing collections follow explicit deletion/retention, not a default-setting change. |
| D-034 | One-second automatic-capture trial | Explicitly requested 24 October 2026: 1,000 instead of 2,000 ms of measured stable evidence. Progress/claim share the clock; freshness, geometry, sharpness and pause/reset thresholds are unchanged. Device evaluation remains open. |
| D-035 | Focused A2 review and shared viewer | Visible Repeat in review/required crop without accepting the draft, Previous/Next/direct Finish, bounded page tiles, Cancel/Apply/Undo for editing; read-only Original and Quality close with one OK button. Tap/pinch/pan/held Before, detached corner loupe, inline actual lens status, matching orientation icons and postcard label. Queued files cannot be omitted. Preserve results on return; load/render PDFs on demand. [ADR 0020](adr/0020-focused-review-and-shared-viewer.md). |
| D-036 | Public project preparation follows the established workspace workflow | English public documentation, AGPL source/notices, contribution/security/issue guidance, CI and secret scanning. Local configuration, diagnostics and scratchpad work are excluded. Source publication and npm release are separate; never publish private development history by accident. |
| D-037 | Configurable measured capture stability | `autoCaptureStabilityMs` is an integer from 100 through 5,000; open call > controller configuration > 1,000 ms. Reference choices: 400/600/800/1,000/1,200/1,500/2,000 ms. Actual fresh observations govern progress and capture, without changing geometry, sharpness or pause thresholds. [ADR 0021](adr/0021-configurable-capture-stability.md). |

## Output and resource defaults

20 pages, 20 MiB/file, 24 MP decoded input, 100 MiB original bytes, 8 MP/4,096 px output with no upscaling, 128 MiB results and 384 MiB estimated working buffers. One high-resolution page at a time. The working estimate is not browser RSS. Recipe undo holds at most twelve edit records.

A3/A4/A5/A6 are ratio-ambiguous; A4 is the group default. Letter, postcard 100 x 150 mm, original ratio and receipts are available. Receipt widths are 58/80/112 mm or custom, with an explicit 80 mm default. Original ratio assumes 210 mm short side for printing. PDF axes must be 10..5,000 mm. Standard layouts rectify the full crop and fill the page; receipts/original ratio remain proportional. Layout values are not physical measurements.

## Deferred decisions

| Topic | When | Affected delivery |
| --- | --- | --- |
| Registry namespace and first npm release | Before registry publication | Scope ownership, version policy and package signing/publishing |
| TIFF, HEIC/HEIF, PDF import | Separate extension | Decoders, licensing and memory tests |
| Local OCR, paper flattening, receipt stitching | After initial device/quality acceptance | Models, quality metrics and new recipes |
| Full camera calibration | Separate calibrated-device work | Intrinsics, tangential terms and device profiles |
| Durable drafts/offline assets | Before persistence implementation | Deletion, quotas, lifecycle and host service worker |
| Production backend integration | Separate host integration | Authorization, endpoints, validation and OCR/extraction |

[ADR 0002](adr/0002-browser-library-and-export.md) defines the implemented package architecture; [ADR 0001](adr/0001-scanic-first-and-capture-behavior.md) records the original candidate decision. Later accepted decisions supersede historical defaults.
