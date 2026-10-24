# Synthetic measurements

These are development-machine/synthetic-image measurements, not physical phone-camera results. Runs at different feature levels or parallel load cannot establish an isolated algorithm speedup. Full formal acceptance is in the [device protocol](DEVICE-PROTOCOL.md).

## Geometry and quality, 18 October 2026

`acceptance-perspective` is 1,200 x 1,500 px with known projected corners. Real Scanic plus local refinement measured corner errors 2.18 / 1.48 / 2.58 / 1.68 source pixels in all four browser profiles, below the predetermined 16 px limit. This single-image result is not a general accuracy guarantee.

Calibration uses separate sharp/blur fixtures, with three deterministic box-filter passes independent of Canvas filter support. Font rasterization differs by browser.

| Metric | Observed range | Interpretation |
| --- | --- | --- |
| Sharp-region Laplacian variance | About 1,730..2,299 | Classified sharp |
| Blurred-region variance | About 0.95..1.35 | Blur warning |
| Initial structured-region threshold | 45 | Separates these two calibration classes |

Perspective/grid/receipt/low-contrast/shadow/blur acceptance images use the real engine; original dimensions remain visible. EXIF 2/6/8 and unchanged bytes are separately checked. Independent PDF.js output ratios/color samples match within test tolerances. General manual-correction, real-camera content-loss and misleading-warning rates remain unmeasured.

## Historical desktop 12 MP runs

Environment: Apple M3 Max, macOS arm64, Node 26.5.0, pnpm 11.15.1, Playwright Chromium 145.0.7632.6. Timing starts with test-file delivery and ends at usable review; one cold/five warm imports per session. No sensor/autofocus latency is included.

| Run | Cold ms | Warm runs ms | Warm median / max ms | Export plus PDF preview ms |
| --- | --- | --- | --- | --- |
| 18 Oct initial document profile | 1,968 | 1,912 / 1,913 / 2,916 / 1,913 / 1,911 | 1,913 / 2,916 | 1,884 |
| 18 Oct dual-resolution/feedback | 1,948 | 1,908 / 1,908 / 3,918 / 1,910 / 1,912 | 1,910 / 3,918 | 1,881 |
| 19 Oct compact UI, fixed Color | 1,693 | 903 / 906 / 905 / 899 / 931 | 905 / 931 | 1,250 |
| 19 Oct Auto profile | 2,717 | 1,983 / 989 / 2,009 / 922 / 984 | 989 / 2,009 | 1,309 |
| 19 Oct stronger RGB whitening | 2,717 | 1,978 / 1,928 / 1,915 / 1,941 / 1,932 | 1,932 / 1,978 | 1,949 |

Initial PNG: 3,000 x 4,000 px / 781,538 bytes, output 2,359 x 3,384. Later fixed Color/Auto input: 737,491 bytes, output 2,360 x 3,337. Later tests had diagnostics off and four parallel workers; the dual-resolution run had two. Added automatic classification, lens estimation and RGB operations change the workload. RGB statistics reserve 4 MiB in the estimate; browser RSS is not measured. Approximately 100 ms interaction feedback was not separately quantified.

## Resources and views

Across four browser profiles, twenty real-processing sessions alternated abort during work and abort after review. Observed scanner-owned worker/URL counts returned to zero after each. This does not measure browser-internal decoder caches or total RSS. An earlier sporadic WebKit process crash remains documented in [status](STATUS.md), despite later complete runs passing.

The 24 October final focused-workspace matrix passed 311 cases with 37 unchanged exceptions. Both themes were checked at 320 x 568, 390 x 664 and 844 x 390. Normal controls have >=44 px targets and stay within the viewport; page tiles, image panning and technical details intentionally move/scroll internally. Native WebKit selects need explicit appearance/44 px height; min-height alone yielded 23 px. Landscape result actions now use a side dock, preserving fitted receipt height.

Viewer cases cover decoded dimensions/aspect ratio, actual 100% sizing, fit reset, page changes, native Chromium pinch and held-comparison cancellation. Tile previews are >=120 x 156 px and cover from the top left without altering export. Geometry/image processing did not change in that UI work.

`pnpm test:browser` writes ignored `artifacts/local/browser-results.json` with measurement attachments/screenshots. Reproducible tests/generators are versioned; private originals and local replay artifacts are not.
