# Local diagnostic recording

Recording supports reproducible detection/export analysis. It does not itself improve detection and is not device acceptance. Both library and reference default to off; internal engine buffers are a separate opt-in.

## Record and download

1. Open the reference over trusted HTTPS on the phone and reload the current build.
2. Open "Diagnose aus" and explicitly enable "Diagnose aufzeichnen".
3. First reproduce without "Interne Scanic-Puffer". Record a separate detailed run with buffers when needed.
4. Capture/import, edit and confirm normally. Already collected evidence survives scanner cancellation and processing failures.
5. Select "Diagnose-ZIP erstellen", then "Diagnose-ZIP herunterladen" and deliberately share the downloaded file if appropriate.

There is no automatic upload. Originals/metadata may contain personal information; do not attach private receipts or archives to public issues. Recordings accumulate across sessions. "Diagnosedaten löschen" releases collection/archive. Otherwise delete one hour after the last recorded session without download, or ten minutes after the last download-link activation. Archive generation alone is not download, and the browser cannot confirm a completed device write. A new session invalidates the old ZIP and restarts retention. Do not expire active scans/archive generation; recheck on foreground return. Reload discards RAM but never deletes files already downloaded to the device.

## Included data and budgets

- Unchanged full import/camera originals, normalized source view, detection image, perspective output, paper/rotation output, enhanced preview, thumbnail and final image/PDF.
- Intermediate PNGs have at most 1,000 px long side; recorded live workframes at most 800 px. They are not the complete camera stream. Originals/final output are not reduced for recording.
- Optional available Scanic buffers retain typed raw `.bin` bytes; identifiable 8-bit grayscale buffers also get PNG views. The manifest records type/platform/native byte order and dimensions only when unambiguous. Source-anchor-checked instrumentation exposes existing 1.7.1 debug buffers without changing installed vendor files. Unavailable states are not invented.
- Across at most 100 sessions: 512 MiB of files plus serialized event metadata and at most 10,000 events. Heavy live/engine detail uses at most one quarter (128 MiB/2,500 events), reserving capacity for sources, processing, exports and decision events. This does not guarantee a complete twenty-page recording or bound total browser RSS.
- Each session records at most 240 live frames in its first 60 seconds, subject to the shared detail budget. Later decisions/stills/exports can continue within the total budget. Older evidence is not overwritten.
- `detailStopped: detail-limit` stops heavy details only; `stopped` ends collection. `detailBytes`, `detailOmitted` and `truncated` disclose omissions. Reject an over-budget event atomically while preserving previous files.

Recording costs encoding/transfer time. Scanic 1.7.1 buffer mode disables its complete WASM-Canny fast path to expose intermediate buffers. Recorded timings, especially with buffers enabled, are not undisturbed benchmarks. Once selected, that engine path remains fixed even after recording/detail exhaustion; `isActive('buffers')` controls transfer, not pipeline switching.

## Manifest and correlation

Schema 2 `manifest.json` contains package/engine versions, browser identifier, viewport, collection start, mode, limits, sessions and ordered events. Each session has a stable ID/times/mode/environment; aggregate mode is `mixed` when needed. Every event has `sessionId`, a collection-unique sequence, main-thread receipt `atMs`, relative `elapsedMs`, structured data and optional artifact references with unique ZIP path, bytes, MIME, coordinate space, encoding and known pixel dimensions. Schema 1 archives contain only one session.

| Event or field | Meaning |
| --- | --- |
| `job` | Correlates worker start, intermediates, completion and failure |
| `process-input.data.diagnosticContext` | Original page identity, source and initial/edit/export purpose |
| `page-accepted` | Maps draft ID to stable accepted-page ID |
| `live-detection` / `live-decision` | Same source timestamp, receipt/latency, raw/displayed corners, generations, progress and decision reason |
| `live-watchdog` | Waiting/evidence expiry without invalidating a running detection job |
| `candidate-selection` | Candidate geometry/evidence/paper scores, continuity, completeness, exclusions and final selection |
| `capture-shutter` | Synchronously secured pixels, dimensions and software playback start; not proof of audible sound |
| `capture-complete` | Encoding duration, streamframe provenance and frozen hint/Auto stability |
| `passMaxDimension` / `still-combined` | Individual 1,000/800 px passes and combined selection |
| `still-orientation-retry` / `still-guided-edge-check` | Additional rotated hypotheses and independent original-edge checks |
| `capture-crop-guard` / `crop-required` | Required confirmation, reason/source size/unconfirmed handles, with no result image |
| `crop-confirmed` | Explicit corner confirmation |
| `live-still-comparison` | Agreement, disagreement or non-comparable coordinate reason |
| `export-page` | Final ID/revision/order/metadata and PDF `boxMm` |
| `format-suggestion` | Raw/estimated ratio, method, uncertainty range/reason, prior and actual format |
| `top-edge-recovery` | Previous geometry, evidence, application or rejection; an attempted check is not an improvement |
| `paper-cleanup` / `lens-correction` | Actual processing status, neutral coverage, strength/evidence/errors |
| `lens-corrected` / `manual-adjustments` / `color-profile` | Available intermediate pixels and confirmed recipe settings |

Coordinate spaces distinguish original bytes before orientation normalization, normalized source, engine work image and output image. Normalized corners refer to the normalized source; raw Scanic coordinates use the work dimensions named by their event. `formatGeometryUncertain` separates confirmed corners from independently supported format geometry. `session-open.paperPreference` records A4/Letter plus `host-region`/`browser-region`/`default`, not GPS, region codes or locale strings. An uncertain fallback ratio is raw geometry, not reconstructed physical measurement; see [ADR 0008](../adr/0008-perspective-and-regional-paper-format.md).

The ZIP uses STORE and CRC32. Already compressed images/PDFs are not reencoded, and the final PDF is byte-identical to the returned blob. Archive generation waits until scanner closure to avoid concurrent new evidence.

## Replay and further investigation

Import an archived original through the same pipeline and apply its recorded corners/recipe/format. Source/receipt timestamps can replay live decisions against the state machine. There is no automatic ZIP-replay importer, full camera stream or identical autofocus/exposure guarantee.

Soft paper scores/continuity are implemented. Weak paper-on-light-background boundaries remain difficult. Detection-only local contrast or illumination-robust gradients are possible experiments, not shipped improvements or justification to change export pixels. [Scanic's pipeline](https://marquaye.github.io/scanic/guide/how-it-works), [OpenCV CLAHE](https://docs.opencv.org/4.13.0/d6/db6/classcv_1_1CLAHE.html) and [homography documentation](https://docs.opencv.org/4.13.0/d9/dab/tutorial_homography.html) provide background. A known aspect ratio is soft evidence, not proof of corners/size. Evaluate real failures against separate images and time series; do not loosen all thresholds just to reduce resets.
