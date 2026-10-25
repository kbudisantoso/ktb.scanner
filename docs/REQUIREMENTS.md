# Product requirements

Version 0.8, 25 October 2026. This is the required scope, not a declaration that every device has passed acceptance. [Decisions](DECISIONS.md) resolve the initial version; the [implementation contract](SPECIFICATION.md) and [test status](testing/STATUS.md) distinguish implementation from evidence. The [evaluation](../EVALUATION.md) is historical research, not authorization for additional features.

## Purpose and boundary

People should capture readable document images directly in a host web application, correct them and hand them back without separate scanning software. The scanner is a reusable, themeable library for independent hosts, with a complete Next.js reference and a smaller Astro example. TypeScript/pnpm and explicit adapters follow the established workspace approach; no domain implementation from another application is copied.

The scanner owns capture/import, document geometry, reversible image processing, quality hints, page ordering and image/PDF export. The host owns authentication, permissions, business records, uploads and subsequent OCR/extraction. There is no booking, reimbursement or legal approval inside the scanner. The project source license is AGPLv3; third-party licenses remain separate.

Primary journeys: capture an invoice, collect an expense receipt, import an existing image, correct/replace a page and export a reviewed multi-page result. Cancelling a new page or failing to process/export must preserve previously accepted pages.

## Functional requirements

| ID | Priority | Requirement |
| --- | --- | --- |
| F-01 | MUST | Open lazily from the host and close through a documented interface. |
| F-02 | MUST | Capture in a permission-controlled browser, prioritizing phones, without microphone access. |
| F-03 | MUST | Prefer the rear camera; retain import after denied/unavailable camera access and support restart. |
| F-04 | MUST | Import JPEG, PNG and WebP through the same review pipeline as camera captures. |
| F-05 | MUST | Suggest document corners and allow direct correction. Missing/conflicting detection requires explicit corner confirmation before review acceptance/export; never substitute the entire original as a scan. |
| F-06 | MUST | Correct approximately planar perspective, crop at the actual paper boundary and preserve content. No universal polygon inset/outset as a substitute for edge evidence. |
| F-07 | MUST | Rotate in 90-degree steps with matching preview, image, metadata and PDF. |
| F-08 | MUST | Offer conservative reversible contrast/noise processing while retaining original bytes and a comparison. |
| F-09 | MUST | Review, repeat, accept and discard individual captures before handoff. Repeat must be directly visible after capture and during required corner confirmation; returning from the camera keeps the current candidate without accepting it. |
| F-10 | MUST | Derive format suggestions from unconstrained detected geometry, never from an already forced output ratio. |
| F-11 | MUST | Rank plausible formats using independent geometry and weak defaults; account for perspective and regional A4/Letter ambiguity. A4 defaults the indistinguishable A-series group; expose A6 without claiming receipt-block recognition. |
| F-12 | MUST | Offer A3/A4/A5/A6, Letter, postcard 100 x 150 mm, receipt and original ratio, all manually selectable. |
| F-13 | MUST | Distinguish defaults, suggestions and manual choices. Preserve manual choices; do not claim physical size measurement. |
| F-14 | MUST | Offer receipt widths 58/80/112 mm and a custom width, with proportional length and an explicit 80 mm default. |
| F-15 | MUST | Assemble multiple pages with independent settings and stable ordered identities. |
| F-16 | MUST | Edit, reorder, delete and atomically replace pages; keep the previous page until replacement acceptance. |
| F-17 | MUST | Hand off a non-empty, fully confirmed ordered collection of image blobs and serializable metadata. |
| F-18 | MUST | Show evidence-based blur, lighting or edge hints; represent unknown causes honestly. |
| F-19 | MUST | Auto-capture once after a configurable measured stability duration, default 1,000 ms, using fresh sharp evidence. Configure through the library or override per open; the reference app exposes experimental duration choices. Unknown sharpness blocks Auto and explicitly suggests manual capture. The manual shutter remains available. |
| F-20 | OPTIONAL | Add local sample OCR or SDK readability analysis only under a separate decision and comparison test. |
| F-21 | CONDITIONAL | If F-20 is introduced, run asynchronously, mark uncertainty, invalidate stale results and allow manual acceptance. |
| F-22 | OPTIONAL | Add reliable geometric paper flattening under a separate decision; visible folds alone are not a rejection. |
| F-23 | MUST | Smooth only the displayed live contour, confirm isolated jumps and bridge short losses for bounded time. Raw evidence still governs capture; display smoothing never determines the final crop. |
| F-24 | MUST | Secure the complete original, then independently detect/refine its edges. The live contour is only a fresh comparable hint. Camera and import share the same source-coordinate processing. |
| F-25 | MUST | Expose Auto/Manual; switching to Manual invalidates pending automatic triggers immediately while retaining live detection and processing. |
| F-26 | MUST | Animate the green contour during the same measured stability window that triggers capture. Pause bounded uncertainty without counting it; reset on movement/loss. Provide a text alternative and avoid repeated spoken percentages. |
| F-27 | MUST | Build one multi-page browser raster PDF from all confirmed images, without OCR; no partial successful handoff on an export failure. |
| F-28 | MUST | Offer JPEG quality 0.92 and PNG. Standard formats correct both crop axes and fill the chosen PDF page; receipts/original ratio remain proportional. No output clipping or artificial upscaling. |
| F-29 | MUST | Provide Next.js image/PDF previews, actual downloads, themes, contexts, synthetic samples and manifest, plus Astro using the same built package. |
| F-30 | MUST | Diagnostics are off by default in library and reference. Explicitly enabled collection spans sessions, exports raw/intermediate/final data locally and respects a 512 MiB budget and deletion deadlines. |
| F-31 | MUST | Prefer complete sheets over clipped candidates; deduplicate inner hypotheses, choose the horizontal middle, or the left of two complete sheets. Still processing remains independent of live jobs. |
| F-32 | MUST | Use rectangularity, parallel/opposite edges, plausible paper ratios and continuity as soft evidence; keep perspective and receipts possible. Never snap displayed corners into a fabricated ideal rectangle. |
| F-33 | MUST | Secure the actual frame at contour completion without a later photo wait. Freeze proportionally and provide optional local sound plus accessible processing animation. Audio failure must not delay capture. |
| F-34 | MUST | Search rotated still hypotheses; protect small text and offer bounded reversible sharpening. No keypad in the corner editor; direct handles, loupe and keyboard remain. |
| F-35 | MUST | Use a proportional mobile camera workspace, large shutter, short hint, reachable Auto/Manual/import/back and compact camera options. Respect safe areas and landscape; show light only when supported. |
| F-36 | MUST | Offer manual portrait/landscape paper axes separately from image rotation; preserve content orientation and output consistency. |
| F-37 | MUST | Offer optional likely-white-paper brightening and shadow equalization with unchanged originals, unoptimized crop comparison and reversible results. Protect faint ink/colors; never reconstruct text. |
| F-38 | MUST | Auto applies its chosen filter/settings immediately. Allow manual brightness/contrast/sharpness and reset, always recomputed from the original with matching export. |
| F-39 | MUST | Offer lens Off/Auto/Manual. Auto requires consistent independent edge evidence; otherwise leave geometry unchanged and show status. Manual strength is reversible; no full camera-calibration claim. |
| F-40 | MUST | Offer Auto, Photo, Color, Grayscale and soft Black-and-white. Whiten likely white paper in Color/Grayscale; suppress paper noise while preserving weak strokes and gray edges in S/W. Manual overrides take precedence. |
| F-41 | MUST | Use bounded phone workspaces with fixed actions and focused tools. Previous/Next/Finish exports directly; unreviewed files cannot disappear. Use independently scrollable tiles with minimum readable cover thumbnails. Support fit/100%, steps, pinch/pan, held Before, tool Cancel/Apply, Undo and a detached loupe. Preserve results on return to start; load/render PDF preview on demand. |
| F-42 | MUST | Allow profile defaults per library configuration and open call, with call > configuration > Auto. A reusable themeable React component and imperative facade share the same encapsulated session/processing implementation. |

## Integration requirements

| ID | Priority | Requirement |
| --- | --- | --- |
| I-01 | MUST | Integrate with React/Next.js and Astro, independent of business models. |
| I-02 | MUST | Allow host colors, font, layout tokens and replaceable UI texts; no fixed application brand in the core. Provide English as the library default and built-in German, with DE/EN reference hosts that default to English, detect German primary browser language and prioritize explicit language selection. |
| I-03 | MUST | Return files without built-in SaaS endpoints/credentials; upload and authorization belong to the host. |
| I-04 | MUST | Pin and control runtime assets; document dependencies and any external runtime/licensing connections. |
| I-05 | MUST | Document opening, cancellation, recoverable errors and resource ownership/cleanup. |
| I-06 | SHOULD | Support standalone installation; offline operation and durable drafts require separate decisions. |

## Non-functional requirements

| ID | Priority | Requirement |
| --- | --- | --- |
| N-01 | MUST | Preserve text, numbers, stamps and colors before cosmetic smoothness. No generative document-content completion. |
| N-02 | MUST | Keep feedback responsive during processing; enforce explicit memory/page limits while preserving accepted pages. |
| N-03 | MUST | Stop owned tracks/workers on close/abort and avoid permanently growing resources across repeated sessions. |
| N-04 | MUST | Keep documents local before confirmed handoff; no automatic content logging, telemetry or persistence. |
| N-05 | MUST | Support touch, keyboard, understandable failures and accessible state feedback; do not claim untested conformance. |
| N-06 | MUST | Verify critical processing with separate reproducible calibration/acceptance fixtures and real target devices. |
| N-07 | MUST | Use dependencies compatible with the intended distribution and preserve their license/model/media notices. |
| N-08 | MUST | Disclose platform and engine limits; no universal format, physical measurement or OCR guarantee. |
| N-09 | MUST | Deliver source, configuration, build instructions, tests, examples and known limitations together. |

Primary targets are current and previous supported iPhone Safari and Android Chrome generations, plus desktop Chrome/Firefox/Safari. Approximately 100 ms feedback and warm 12 MP review within five seconds are development targets, not measured device promises. [Device protocol](testing/DEVICE-PROTOCOL.md) defines acceptance.

## Exclusions and acceptance

No required native app, physical millimeter measurement, PDF import/editor, invoice-field extraction, automatic multi-document splitting, receipt panorama stitching, semantic text rotation, OCR layer, full paper flattening or durable crash recovery. TIFF/HEIC, persistence, full lens calibration and backend integration remain separate work.

All MUST requirements need evidence. Optional work counts as delivered only when separately authorized and tested. The [traceability tests](SPECIFICATION.md#tests-and-traceability) map requirements to expectations. Vendor claims and synthetic tests alone cannot establish physical-device acceptance.
