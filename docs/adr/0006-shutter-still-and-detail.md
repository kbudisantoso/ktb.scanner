# ADR 0006: Shutter timing, frozen image and diagnostic detail

Date: 2026-10-18. Status: accepted; later decisions supersede historical defaults as noted below.

## Context

A visually complete green border could precede capture, frozen geometry could collapse after stream stop, rotated stills could select another contour and heavy debug data could exhaust diagnostics before the original was recorded.

## Decision

The initial 18 October implementation processed the full video frame secured synchronously at claim. D-060 supersedes only that source selection on 5 November: keep the synchronous full-frame backup and exactly-once feedback, then prefer a supported native `ImageCapture.takePhoto()` result from the same track. Bound the wait to two seconds and validate file/header/source dimensions plus the remaining original/working budget. Fallback uses the secured frame, never a later video snapshot. Cancellation, stop and generation changes invalidate the operation. A timeout cannot cancel the hardware photo, so keep that track ineligible for another native request until its promise settles. Release the backup before still processing. Native exposure can be later than the claim and its field of view can differ; use unverified photo hints and independent still detection. Rebase continuous scene evidence after the known pipeline interruption without authorizing another automatic capture. Do not claim a particular sensor resolution or physical quality gain. Keep source dimensions separately and show proportionate frozen feedback plus predecoded optional local audio. Two CC0 cues and silence replace the earlier catalog under D-040; audio never blocks capture. Honor reduced motion. Use an explicit open contour path in source pixel geometry, not dashed host-scaled strokes. Leave >=1.5% open until the actual claim. Raw bounds are 0.05 anchor drift, 0.035 step and 15% area change; uncertainty <=1,200 ms pauses. D-034 changes the original two-second window to a one-second trial. Combine 1,000/800 pixel still views, additional rotations and original edge refinement. Stable comparable Auto hints may request more checks, never authorize an unchecked crop. Request supported autofocus; use bounded reversible sharpening, no frame fusion or text reconstruction.

## Consequences and verification

Heavy live/engine data uses at most one quarter of recording budgets, preserving room for originals/processing/export. Stopping transfer does not change the selected engine path. Encoding completion is distinct from capture timing. Extra hypotheses cost time; sharpening cannot undo arbitrary motion blur. Private replays remain local and physical camera/audio/readability acceptance remains separate. Third-party audio retains its notices.

See [decisions](../DECISIONS.md), [implementation contract](../SPECIFICATION.md) and [test status](../testing/STATUS.md).

## References

- [W3C Image Capture specification](https://www.w3.org/TR/image-capture/)
- [SVG stroke geometry and vector effects](https://www.w3.org/TR/SVG/painting#StrokeShape)
- [Image Capture focus capabilities](https://www.w3.org/TR/image-capture/#constrainable-properties)
