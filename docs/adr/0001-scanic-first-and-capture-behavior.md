# ADR 0001: Evaluate Scanic first and separate capture from still processing

Date: 2026-10-14. Status: accepted; later decisions supersede historical defaults as noted below.

## Context

The module should avoid commercial SDK fees while allowing its own workflow, filters and quality metrics. A jumping demo contour and background-heavy crops motivated independent display, capture and still geometry; they were observations, not a measured engine benchmark.

## Decision

Evaluate Scanic first, retaining jscanify/OpenCV as an alternative rather than maintaining several production engines. Smooth the visible contour only. Offer Auto and Manual; changing mode invalidates pending automatic triggers, and the manual shutter remains available. Secure the complete original, independently detect/refine the still, then rectify and process reversibly. Import uses that same pipeline without a live hint. Crop at supported paper edges, without universal padding/inset. Use simple own filters/quality metrics initially; OCR/flattening require later decisions. The original stability proposal was 2,000 ms; D-034 now explicitly trials 1,000 ms. Progress uses the same measured window and has a text alternative.

## Consequences and verification

The integration owns workflow and capture gating. A smooth outline/confidence score does not establish stability, sharpness or readable text. ADR 0002 superseded the historical open implementation/package/PDF questions. D-003 now establishes AGPLv3; physical suitability remains open. Requirements F-04..F-09, F-18/F-19, F-23..F-26 and N-01..N-03/N-05 require actual evidence.

See [decisions](../DECISIONS.md), [implementation contract](../SPECIFICATION.md) and [test status](../testing/STATUS.md).
