# Physical-device and performance acceptance

Formal device acceptance is open. Informal iPhone recordings and local replays support investigation but do not constitute a complete device matrix. Add measurements only after actually performing each run.

## Record each run

Date, source version, device/RAM, OS and complete browser version, engine/package versions, HTTPS setup, normal tab/standalone, cold/warm state, network profile, input format/bytes/pixels, page count, action, duration, visible errors and resource findings. Use synthetic or explicitly appropriate images, with private material excluded from public artifacts.

| Target | Context | Status |
| --- | --- | --- |
| iPhone Safari, current supported generation | Tab and standalone | Formal run outstanding |
| iPhone Safari, previous supported generation | Tab | Formal run outstanding |
| Android Chrome, current supported generation | Tab and standalone | Formal run outstanding |
| Android Chrome, previous supported generation | Tab | Formal run outstanding |
| Desktop Chromium/Firefox/WebKit on macOS arm64 | Automated/emulated | Passed matrix; installed browsers/hardware remain separate |

## Procedure

1. Fresh launch: inspect network before/after opening. No engine/PDF download before need and no external runtime fallback.
2. Allow, deny and delay camera permission, including closing while permission is pending. Test rear camera, camera choice, orientation and restart; no audio track.
3. Auto: stable sheet, blur, slow drift, contour loss and late mode switch. Current D-034 trial uses one second of measured evidence with bounded uncertainty pauses. Exactly one claim; completed border, secured frame, optional cue and frozen image must agree. Check silence, blocked audio, foreground/background and restart.
4. Compare the full stream original with import. Separate focus/motion blur from scaling; inspect original/export at 100%. Frozen orientation remains proportional after stream stop. Test EXIF mirrors/rotations, reference grids, low-contrast backgrounds and oblique views.
5. Correct corners with touch/loupe and keyboard. Verify detached magnifier placement, original/held crop comparison, rotation and profiles. Inspect faint thermal text, handwriting, stamps, color and 4,096 px long receipts. Check optional lens correction, tones, Cancel/Apply and Undo.
6. Mix formats, replace/cancel, reorder/delete and approach limits with PNGs/long receipts. Preserve accepted pages. Verify queued failure/retry/explicit discard and direct finish without silently losing input. Page tiles scroll independently and never become thin receipt strips.
7. Export JPEG/PNG and decode again. Independently render PDF with PDF.js; compare count/order/layout/image bytes and actual downloads. Standard presets fill their page; proportional layouts preserve their ratios.
8. Background transitions, twenty pages and at least twenty repeated sessions. Browser camera indicator must stop; workers, URLs, bitmaps and memory must not grow permanently per session. Check on-demand PDF preview/cache and retained results after returning to start.
9. Keyboard/screenreader: initial dialog focus, tab containment, focus return, corners, ordering, warnings, cancellation/discard and hold controls. Avoid repeated spoken progress percentages. Check enlarged text/zoom with reachable controls; no blanket conformance claim without evidence.

## Measurements

Use at least one cold and five warm runs for a typical 12 MP image. Record capture-to-review, export and interaction feedback, reporting median/maximum. Targets: about 100 ms visible feedback and warm review within five seconds where feasible. Report deviations rather than choosing only favorable images.

Separate calibration from acceptance fixtures. Measure source-pixel edge deviation, content loss, manual correction rate and misleading quality warnings; fewer warnings alone are not a quality improvement. Synthetic tests complement real images, not replace them.

For a fundamental Scanic failure, produce a synthetic reproduction with exact versions, expected/actual geometry and impact. Do not silently replace it with another/commercial engine.
