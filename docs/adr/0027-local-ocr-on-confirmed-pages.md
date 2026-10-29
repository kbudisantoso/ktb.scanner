# ADR 0027: Local OCR on confirmed pages

Status: Accepted for unreleased source, 29 October 2026.

## Context

Hosts need to try local text recognition and searchable PDF output on phones. The existing scanner already returns final confirmed images and a raster PDF. Running OCR while camera, processing and export workers remain alive would increase peak memory and couple recognition to every review edit.

## Decision

Add a separate optional `@ktb-tools/scanner/ocr` entry with `createSearchablePdf`. It takes confirmed ordered page revisions after scanning closes, returns text/confidence per page and a new searchable PDF, and leaves the existing scanner options/results untouched. The reference result view owns invocation, language selection, progress, cancellation and display; persistence, downloads and any backend remain host responsibilities.

Use exact Tesseract.js and Core 7.0.0 with official `tessdata_fast` German/English models at commit `65727574dfcd264acbb0c3e07860e4e9e9b22185`. Ship same-origin workers, the three LSTM core variants, model hashes/provenance and notices. No CDN fallback, model storage or language classifier is introduced. Default recognition uses both selected languages; UI locale is independent.

A private version-pinned adapter controls the native worker from construction through `load`, `loadLanguage`, `initialize`, `setParameters` and serial `recognize` calls. This avoids waiting for the public factory's asynchronous initialization before obtaining a termination handle. Match jobs explicitly, bound waiting, terminate on cancellation/errors and isolate observer failures.

Recognize a temporary unscaled PNG copy with a fixed 10-pixel white margin. This prevents tight image borders from hiding text during automatic layout analysis without forcing a single text block and breaking multiple-column reading order. Release preparation resources and include the padded raster and actual encoded bytes in phase-specific memory estimates.

Reuse Tesseract's invisible `pdfTextOnly` page to retain its baseline, font and Unicode mapping. After terminating OCR, a separate pdf-lib worker builds a fresh document from unchanged final JPEG/PNG images and the corresponding text overlays. Crop the text page's MediaBox proportionally to remove the working margin, including its origin; both image and text then use the existing image/layout box and PDF coordinate conversion. No extra rotation or lossy conversion of the final image. This avoids implementing PDF text/font placement from glyph bounding boxes.

## Consequences

OCR remains explicit and lazy; the ordinary raster workflow does not load models. One recognition worker handles pages serially, then ends before PDF assembly. Resource estimates include retained blobs, raster/engine buffers, text and intermediate PDF layers; actual output bytes are checked. There is no constant-memory or free-device-RAM guarantee.

Only a complete successful result replaces the host's displayed PDF. Failure, cancellation and stale work preserve the previous confirmed result; text is tied to page ID/revision. The reference offers native selectable text separately from its existing canvas PDF preview. Recognition errors, layout/reading-order mistakes and blank text remain possible; searchable output does not establish structured fields or PDF/UA conformance.

Verify lifecycle with controlled worker failures and real synthetic OCR/PDF output through independent PDF.js text, geometry and rendering checks. Physical-device quality and timing must be assessed on that device; browser emulation is not that measurement.
