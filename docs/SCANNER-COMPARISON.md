# Historical comparison: Scanic and jscanify/OpenCV.js

Research date: 14 October 2026, with the installed-version update from 18 October. This records documentation/static-source findings, not a comparative device benchmark or a current market survey. Scanic 1.7.1 was subsequently selected and tested in this project; [test status](testing/STATUS.md) is authoritative for actual implementation evidence.

| Criterion | Scanic | jscanify with OpenCV.js |
| --- | --- | --- |
| Architecture | Specialized JavaScript/Rust-WASM document scanner, without OpenCV | Small scanner wrapper over general OpenCV.js processing |
| Detection in inspected code | Multi-pass classical contour pipeline; optional ML path | Fixed Canny thresholds and largest contour selection |
| Perspective | Own corners accepted | Own corners/output dimensions accepted |
| Manual correction | Existing touch/keyboard/loupe editor with theme tokens | UI must be added around exposed coordinates |
| Integration | ESM/types and documented worker/OffscreenCanvas support | Inspected wrapper uses global cv/DOM canvas; worker adaptation needed |
| Processing/product workflow | Own filters, quality, capture/page/session/format work still needed | Same product work, with broader OpenCV algorithms available |
| Footprint claims | Project-reported core size/speed, not independently comparable | Depends on OpenCV build; custom builds are possible |
| Code license | MIT core; optional model/runtime requires separate inventory | MIT wrapper, Apache-2.0 OpenCV from 4.5.0 |

Sources: [Scanic API](https://marquaye.github.io/scanic/api/reference), [editor](https://marquaye.github.io/scanic/guide/corner-editor), [source/manifest](https://github.com/marquaye/scanic), [jscanify source](https://raw.githubusercontent.com/puffinsoft/jscanify/master/src/jscanify.js), [manifest](https://raw.githubusercontent.com/puffinsoft/jscanify/master/package.json) and [OpenCV license](https://opencv.org/license/).

## Interpretation and risks

The inspected jscanify extractPaper path had early-return/input and transformation-matrix cleanup concerns; these are static findings, not a measured failure rate for every release. OpenCV maturity does not automatically establish wrapper lifecycle safety. Scanic's changelog described active worker/memory/bundler fixes, but a branch version was not proof of a published package: the original 1.7.0 pin was unavailable, and actual 1.7.1 contents were later installed/checked. Do not adopt an unverified latest tag.

[Scanic ML](https://marquaye.github.io/scanic/guide/ml-detection) was not selected. Document-presence confidence is not readable-text confidence. Model/runtime download, matching binaries, self-hosting and licensing need separate review before activation. [Project performance figures](https://marquaye.github.io/scanic/guide/performance) without shared builds/images/compression/devices do not establish a quality/speed ranking. OpenCV also supports WASM and [configurable builds](https://docs.opencv.org/4.13.0/d4/da1/tutorial_js_setup.html).

## Commercial comparisons

Scanbot's [jscanify](https://scanbot.io/scanbot-document-scanner-sdk-vs-jscanify/) and [OpenCV](https://scanbot.io/scanbot-document-scanner-sdk-vs-opencv/) comparisons emphasize finished UI/Auto/filter/quality/support work. These are vendor arguments, not independent measurements. The OpenCV page dated its information to 27 October 2025. An APK-size argument is not a web-package measurement. No Scanic-specific Scanbot comparison was found in that targeted historical search; do not attribute general competitor criticism to Scanic.

A missing wrapper JPEG/PNG-export checkbox does not prevent browser canvas output; [Scanbot's own tutorial](https://scanbot.io/techblog/js-camera-document-scanner-tutorial/) saves PNG. Missing full OCR/searchable PDF is less relevant here because local raster PDF is implemented and OCR remains separate. No vague privacy checkbox proves a data leak; inspect actual traffic/storage. Four corners or an ML detector also cannot establish physical paper size or flattening.

## Resulting decision

Scanic's specialized browser API/editor reduced initial integration work, so it was selected. jscanify/OpenCV remains a possible separately authorized alternative if needed; no commercial adapter or maintained multi-engine production stack was commissioned. The [requirements](REQUIREMENTS.md), [decisions](DECISIONS.md) and [ADRs](adr/README.md) supersede this historical recommendation. Physical-device/real-image acceptance is still required.
