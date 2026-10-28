# ADR 0013: Manual image controls and bounded radial correction

Date: 2026-10-18. Status: accepted; later decisions supersede historical defaults as noted below.

Unreleased UI update: D-056 in [decisions](../DECISIONS.md) removes the aggregate Filter reset described below. Existing Auto/profile selection remains; individual neutral-reset icons sit beside adjustment sliders. Processing algorithms and host profile precedence are unchanged.

## Context

An obscure profile alone did not expose useful optimization or manual adjustment. A lack of full device calibration does not prevent a limited, evidence-tested estimate from several straight document edges.

## Decision

Expose Auto/Reset and brightness/contrast -100..100, sharpness 0..100, recomputed in a worker from original bytes after range release/keyboard editing. Reset chooses Photo, neutral tones and lens Off; current Auto selection follows ADR 0016. Recipe.dewarp is off/auto/manual for radial correction only; manual strength is -0.18..0.18. Use a division model around assumed center, normalized by half the long source axis. Auto gathers up to 48 edge positions, requires >=36 distributed samples on >=3 edges and separates fit/check positions. Require agreeing edge estimates, initial error >=0.75 px, >=40% independent improvement, residual <=1.25 px and a non-boundary/nonzero solution. Unsupported evidence leaves geometry unchanged with status. Apply before perspective; preserve original coordinate metadata and generate comparison before lens/tone changes. Record actual LensCorrection status/strength/evidence; account for buffers.

## Consequences and verification

Directed smoothed edge profiles supplement Laplacian variance so noise or sampling offset alone cannot imply readable sharp text. Blank structure remains unknown. Unsupported frame-border crops require manual confirmation; manual corners alone do not establish paper size, and profile changes do not clear edge warnings. This supersedes the limited-control deferral in ADR 0011. There is no tangential correction/full calibration/flattening or copied external algorithm code; independent synthetic and real artifact checks remain separate from hardware acceptance.

See [decisions](../DECISIONS.md), [implementation contract](../SPECIFICATION.md) and [test status](../testing/STATUS.md).

## References

- [IPOL one-parameter division models](https://www.ipol.im/pub/art/2014/106/)
- [OpenCV camera calibration](https://docs.opencv.org/4.13.0/dc/dbb/tutorial_py_calibration.html)
