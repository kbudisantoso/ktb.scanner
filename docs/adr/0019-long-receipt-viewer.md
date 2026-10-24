# ADR 0019: Fit long receipts reliably

Date: 2026-10-19. Status: accepted; later decisions supersede historical defaults as noted below.

## Context

A phone screenshot showed an empty fitted view although the image existed at 100%. The affected export was 220 x 1,698 px. Intrinsic grid height, percentage maxima and retained scroll position did not guarantee a bounded visible image.

## Decision

Measure available content space and decoded image dimensions, calculate explicit proportional fit without upscaling and constrain grid axes. Observe viewport changes. Page changes start fitted; zoom/fit resets must not preserve stale positions. Keep loading state, page navigation, real download and focus return. ADR 0020 generalizes this into the shared React zoom/pan/pinch viewer and moves landscape result actions aside to retain image height.

## Consequences and verification

Test actual long dimensions and an extreme receipt, bounds/aspect ratio, 100% pan, fit reset, page switching and landscape across four browser profiles. A complete fitted receipt will naturally be narrow; inspection zoom remains necessary. The original affected photo was 774 x 2,048 px, with a 220 px wide export; viewer changes do not create missing image information.

See [decisions](../DECISIONS.md), [implementation contract](../SPECIFICATION.md) and [test status](../testing/STATUS.md).
