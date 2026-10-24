# ADR 0014: Document profiles and mobile result review

Date: 2026-10-18. Status: accepted; later decisions supersede historical defaults as noted below.

## Context

Conservative processing was too weak for shaded white paper. Results appeared below the start form, actions disappeared while scrolling and mixed PDF lengths inflated the preview area.

## Decision

Separate Photo, Color, Grayscale and S/W by effect. Recompute from originals, protect faint ink/colors and compare original/crop/result. Keep fixed completion actions and reachable page editing/replacement/order. Prioritize results in the reference, allow fitted/100% inspection with downloads/focus return and independently show actual PDF pages. Historical legacy/default profile choices are superseded by ADRs 0015/0016; stronger RGB whitening by ADR 0017; hard monochrome thresholding by ADR 0018; focused UI/on-demand PDF rendering by ADR 0020.

## Consequences and verification

Official Scanner Pro filter/equalization documentation informed interaction goals, not copied code or an equal-quality claim. Aggressive cleanup can damage photos/colors. Browser pixels/metadata/PDF/focus tests do not replace physical phone acceptance. Reference screenshots and private diagnosis images are not distributed.

See [decisions](../DECISIONS.md), [implementation contract](../SPECIFICATION.md) and [test status](../testing/STATUS.md).

## References

- [Scanner Pro filters](https://support.readdle.com/scannerpro/enhance-and-edit-your-scans/choose-a-filter)
- [Scanner Pro illumination equalization](https://readdle.com/blog/scanner-pro-shadow)
- [Scanner Pro curved-line control](https://support.readdle.com/scannerpro/enhance-and-edit-your-scans/straighten-curved-lines-on-scans)
