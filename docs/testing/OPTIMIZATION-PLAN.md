# Image and quality optimization scope

The 18 October 2026 scope explicitly added manual tones and bounded radial lens correction. Their implementation decisions are in [ADRs](../adr/README.md), with actual evidence in [status](STATUS.md). This plan is an implementation/acceptance record, not authorization for further untested algorithms.

1. Make Auto/profile processing visible and reversible. Keep original bytes and unoptimized crop comparison. Provide brightness, contrast, sharpness and reset; recalculate from original rather than a previously compressed result.
2. Apply optional Off/Auto/Manual radial correction before perspective extraction. Estimate from independently supported edges with separate fitting/check positions; inconsistent evidence leaves geometry unchanged with status. Manual strength remains available. Preserve original coordinate metadata and matching preview/export. This is not full device calibration or paper flattening.
3. Supplement variance with directed transition evidence so noise alone cannot imply sharp text. Blank paper remains unknown with a manual-capture hint. Unsupported geometry is not reliable receipt/format evidence. Preserve required crop confirmation and manual format choices.
4. Distinguish Auto, Photo, Color, Grayscale and soft S/W. Whiten likely white paper while protecting faint strokes/colors. S/W now uses the continuous low-noise curve in ADR 0018, superseding the earlier binary proposal. No OCR or invented content.
5. Use focused review tools, held comparison and a shared measured viewer, with safe page/result navigation per [mobile plan](MOBILE-UX-PLAN.md). Keep camera behavior intact. Test both themes, actual images/PDFs, focus and downloads. All sound tests remain physically muted while native audio runs.

## Evidence boundaries

Browser emulation, synthetic fixtures and local replay can run here. They cannot establish real autofocus, sensor quality, phone memory, standalone behavior, speaker quality or assistive-technology acceptance. A brightness/sharpening filter does not reconstruct missing characters. Preserve private originals/replays outside Git and document remaining cases explicitly.

## Design and method references

- [IPOL one-parameter division models](https://www.ipol.im/pub/art/2014/106/) motivates straight-line evidence; its code is not copied.
- [OpenCV camera calibration](https://docs.opencv.org/4.13.0/dc/dbb/tutorial_py_calibration.html) describes the more complete calibrated model.
- [Scanner Pro filters](https://support.readdle.com/scannerpro/enhance-and-edit-your-scans/choose-a-filter) and [lighting equalization](https://readdle.com/blog/scanner-pro-shadow) inform product behavior, not an equal-algorithm/quality claim.
