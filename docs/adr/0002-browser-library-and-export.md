# ADR 0002: Browser library with React, Scanic and PDF export

Date: 2026-10-14. Status: accepted; later decisions supersede historical defaults as noted below.

## Context

A single versioned library must support Next.js and Astro, local browser PDFs and page preservation through cancellation, editing and export failures.

## Decision

Use TypeScript/pnpm and one package with core, React, Scanic, export and stylesheet entry points; React is a peer. No other product's domain/AGPL implementation is copied. Classic Scanic runs in a module worker with version-checked locally served ESM and embedded WASM; no ML/CDN fallback. The editor loads on demand. Separate live display, capture gating and still geometry. Recompute edits from original plus recipe, serialize high-resolution work and terminate tracks/workers on abort. jsPDF embeds exact final image blobs in a separate lazy worker; PDF.js is reference-preview-only. D-010 makes standard paper ratio the rectification target for the whole crop, filling its PDF page. Receipts/original ratio remain proportional. Source licensing is now explicitly AGPLv3 under D-003.

## Consequences and verification

Hosts serve CSS and complete worker assets over same-origin HTTPS/localhost. OffscreenCanvas, createImageBitmap and module workers are processing prerequisites; no global cross-origin isolation is required. Missing assets/capabilities fail visibly without losing pages. Installed Scanic is 1.7.1; the initially proposed 1.7.0 was not published. Builds and device acceptance are separate evidence.

See [decisions](../DECISIONS.md), [implementation contract](../SPECIFICATION.md) and [test status](../testing/STATUS.md).
