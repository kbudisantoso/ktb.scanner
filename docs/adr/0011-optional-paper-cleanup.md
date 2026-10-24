# ADR 0011: Optional paper brightening and trustworthy comparison

Date: 2026-10-18. Status: accepted; later decisions supersede historical defaults as noted below.

## Context

Blank pages may lack sharpness evidence and need an explicit manual-capture hint. Poor/uneven lighting makes white paper gray. Correction should remain optional and preserve original/crop evidence.

## Decision

Unknown sharpness remains unknown, not silently accepted for Auto. A fresh contour explains the manual shutter; measured blur gets its own hint. A paper profile estimates a smoothed neutral bright background and applies bounded equalization while protecting chromatic pixels/alpha. Dark or predominantly colorful images without evidence remain unchanged. Preserve original bytes, unoptimized crop and result, recomputing from the original. Count the comparison blob in review limits and omit it at final export. Later ADRs 0014/0016/0017 refine profiles, Auto default and whitening.

## Consequences and verification

Pixel brightness cannot reliably distinguish white paper in gray light from genuinely gray paper. Comparison/manual override are essential; correction does not restore lost text. The historical deferral of manual tones/radial correction is superseded by ADR 0013; full camera calibration/flattening remains separate. No new dependency was introduced.

See [decisions](../DECISIONS.md), [implementation contract](../SPECIFICATION.md) and [test status](../testing/STATUS.md).

## References

- [OpenCV camera calibration](https://docs.opencv.org/4.13.0/dc/dbb/tutorial_py_calibration.html)
