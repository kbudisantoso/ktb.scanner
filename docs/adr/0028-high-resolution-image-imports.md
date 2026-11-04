# ADR 0028: High-resolution image imports with bounded working rasters

Date: 2026-11-04. Status: accepted.

## Context

A strict 24-MP admission limit rejects normal phone photos, including sensor modes whose dimensions slightly exceed the advertised megapixel count. Source dimensions and working allocation are different concerns. A large compressed photo can be processed at a useful lower resolution, while retaining its original bytes and coordinate system. The corner editor must follow the same policy rather than decode the full source again through an image element.

## Decision

Keep the existing `Limits` API. Raise default source admission to 256 MP and 64 MiB per file; explicitly supplied source caps remain hard admission limits. Keep the existing original/session, working and output budgets. Read image headers and EXIF orientation through bounded slices, skipping compressed pixel payloads.

Preserve full oriented source geometry separately from decoded working dimensions. Keep the existing sampling when it fits; otherwise request a proportional `createImageBitmap` resize before creating working surfaces. Validate returned dimensions. Plan subsequent crop, lens, comparison and output buffers from their actual sizes and select the largest working scale that fits when necessary. Do not upscale or change the 8-MP/4,096-px output caps. Original blobs and normalized corner coordinates remain reusable through edits, export and optional original return.

Decode the corner view only while its editor is mounted, with a 2,048-px side and 4-MP bound. Pass a canvas directly to the existing Scanic editor and loupe. Account for its simultaneous surfaces during processing and release bitmaps/canvases on failure, cancellation, replacement and unmount. Add no preview-storage API or alternate scanner implementation.

## Consequences

High-resolution supported photos can enter the normal review workflow without a host resize workaround. Working resolution can decrease when required by the configured budget; fitting inputs retain their previous raster behavior. `normalizedSourceSizePx` continues to describe the full oriented source, while output metadata describes the actual exported raster. Existing explicit source and session caps can still reject files.

The budget is an allocation estimate. A requested bitmap size does not guarantee a bound on browser-internal decoder memory, and this change does not add HEIC/RAW/PDF decoders or unlimited batch retention. Device quality and native memory behavior require separate evidence from API/geometry tests.

## Verification

Regressions cover high-resolution import, orientation and normalized corners, bounded editor surfaces, original-byte preservation, explicit cap rejection, unchanged fitting inputs and cancellation/resource cleanup. See the [implementation contract](../SPECIFICATION.md#limits-and-lifetime) and [test status](../testing/STATUS.md).
