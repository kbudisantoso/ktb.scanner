# Historical browser-scanner evaluation

Research date: 14 October 2026. This is a condensed English record of the original evaluation, not a current SDK price/release survey or acceptance report. The implemented contract is in [requirements](docs/REQUIREMENTS.md), [decisions](docs/DECISIONS.md) and [integration](docs/INTEGRATION.md). Later explicit choices supersede original alternatives, including browser raster-PDF generation, AGPLv3 and the focused mobile review.

## Problem and product boundary

An independent scanner should support business-document and expense workflows without embedding their roles/models. The host supplies theme/context, permissions and eventual upload. The scanner supplies capture/import, geometry, reversible processing, quality hints, pages and confirmed files/metadata. Backend OCR/extraction, search text and business approval are separate. The initial backend-only PDF proposal was superseded: the browser now exports reviewed images plus a multi-page raster PDF without OCR.

## Candidate findings

- [Scanic](https://github.com/marquaye/scanic) offers a specialized browser pipeline, perspective correction, TypeScript and a [themeable corner editor](https://marquaye.github.io/scanic/guide/corner-editor) under MIT. It was selected for the first implementation. The initial branch/changelog version 1.7.0 was not an installable registry pin; installed 1.7.1 was later checked against types/ESM and real worker builds.
- [jscanify](https://github.com/puffinsoft/jscanify) is an MIT wrapper around [OpenCV.js](https://docs.opencv.org/4.13.0/da/d6e/tutorial_py_geometric_transformations.html). It covers contour/extraction but leaves substantial workflow/UI/lifecycle work. Static cleanup/global-cv/DOM-canvas concerns are detailed in the [comparison](docs/SCANNER-COMPARISON.md), not a general measured error rate. OpenCV's configurable build and mature algorithms remain useful alternatives, not a currently implemented second engine.
- [Scanbot's OpenCV](https://scanbot.io/scanbot-document-scanner-sdk-vs-opencv/) and [jscanify](https://scanbot.io/scanbot-document-scanner-sdk-vs-jscanify/) comparisons help enumerate integration/UI/support work, but are vendor sources. No independent reproducible direct benchmark with shared document corpus, versions and mobile devices was found in that historical targeted search. That does not prove none exists.
- Commercial Scanbot/Dynamsoft options need explicit scope/domain/redistribution contracts and quotations. A demo/trial is not a production license. Historical advertised entry pricing did not establish a price for these hosts. No commercial SDK was adopted and no commercial adapter is required before continuing the free-engine implementation.

Project size/speed tables are not comparable without shared build/image/compression/device conditions. Optional [Scanic ML](https://marquaye.github.io/scanic/guide/ml-detection) is not enabled: it would need its own model/runtime/asset/license and quality evaluation. Document-presence confidence does not certify readable text.

## Geometry, formats and image quality

Separate live display from measured capture evidence and independently analyze the complete still. Do not determine the final crop from a smoothed preview. Retain original bytes and one normalized coordinate space. Refine supported paper boundaries rather than universally padding/insetting them. Perspective rectification is not geometric paper flattening.

Estimate unconstrained ratio before a preset is forced. A-series paper sizes are geometrically ambiguous; A4 is a default, not a physical measurement. Receipt widths 58/80/112 mm are layout presets supported by [Epson](https://files.support.epson.com/pdf/pos/bulk/tm-t20iv_trg_en_rev_c.pdf) and [Star](https://star-m.jp/eng/products/s_print/tsp800ii/index.html) product documentation, not values measurable from an uncalibrated photograph. A6 alternatives do not imply a dedicated receipt-block classifier. Later decisions add perspective/region uncertainty, manual orientation and full-ratio rectification of standard presets.

Filters must retain faint print, handwriting, stamps and colors. Shadow/contrast cleanup cannot reconstruct lost characters. Original/crop/result and manual override remain essential. Low-noise S/W now preserves gray text edges rather than hard thresholding. The current Auto profile chooses Photo/Color and applies immediately, rather than imposing a manual profile at launch.

## Quality and optional OCR

The evaluation considered SDK analysis or a local [Tesseract.js](https://github.com/naptha/tesseract.js) probe on distributed text regions, with worker/time/language budgets and revision-linked results. Confidence or one readable heading would not certify every line. That extension was not adopted: this version uses image metrics and represents insufficient structure as unknown. Blank detected paper explicitly requests manual capture. Full OCR and business extraction remain host/backend work. No recognized content is generated or reconstructed.

## Integration and lifecycle

TypeScript interfaces, one DOM-free core and separate React/engine/export entry points allow a single implementation in Next.js and Astro. React is a peer, with a declarative component plus imperative open/destroy facade. The host maps semantic CSS variables and replaceable texts. Camera requires trusted HTTPS/localhost and explicit permission, with no microphone. Distinguish video, full capture and reduced work dimensions; keep bounded sequential processing and clean up tracks/workers/bitmaps/URLs.

Serialize multi-page work, preserve accepted pages across cancellation/replacement/errors, and keep output order/revisions consistent. A confirmed result cannot be empty or partial. No built-in endpoints/credentials or automatic document persistence. A host can submit binary blobs plus a manifest through its own authorized API and independently validate every file/permission. Standalone installation is not offline/draft recovery.

## Licensing and evaluation limits

The earlier permissive/dual-license alternatives were proposals only. The explicit source decision is now GNU AGPL version 3 only. No application implementation from another repository was copied. Third-party source/media keep separate notices; commercial adapters would need a new decision and actual distribution rights. Package separation or dynamic import alone is not a license conclusion. See [distribution](docs/PUBLISHING.md), LICENSE and [dependencies](docs/DEPENDENCIES.md).

The original research suggested ambitious targets such as a 95% simple-case automatic-crop rate and three-second p95 warm review. They were not measured capabilities or accepted universal promises. Current development targets and limits follow later decisions; actual desktop/synthetic evidence is in [measurements](docs/testing/MEASUREMENTS.md). Real-phone edge/content loss, manual correction rates, misleading quality warnings, focus/audio, memory and previous/current browser generations remain formal acceptance work. Vendor documentation/static inspection alone cannot close it.
