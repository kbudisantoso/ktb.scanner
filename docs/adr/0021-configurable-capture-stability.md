# ADR 0021: Configurable measured capture stability

Date: 2026-10-25. Status: accepted and implemented. Verification is recorded separately in [test status](../testing/STATUS.md). Extends the one-second trial in D-034 without changing geometry or image-processing thresholds.

## Context

The one-second trial was a fixed constant. Comparing shorter and longer capture windows should not require source changes or a host-specific scanner implementation. Below the live detection cadence, the requested duration cannot imply millisecond-exact camera timing.

## Decision

- Add `autoCaptureStabilityMs` to library configuration and per-open options. Precedence is open call, controller configuration, then 1,000 ms. Both supplied values must be safe integers >=100; invalid values fail with `CONFIG_INVALID` before creating a dialog or requesting a camera. Values are not restricted to presets.
- Keep the existing `new AutoCapture(mode)` default; a second duration argument configures custom core integrations. Export `DEFAULT_AUTO_CAPTURE_STABILITY_MS` and `AUTO_CAPTURE_STABILITY_PRESETS_MS` from the DOM-free core.
- The reference Scan options offer 100, 200, 300, 500, 750, 1,000, 1,500, 2,000, 3,000 and 5,000 ms. Use familiar rounded values for manual comparison rather than a Fibonacci sequence. The selection applies to subsequent sessions and is retained in the reference page's memory until reload.
- Progress and the capture decision use the same measured duration. One observation only anchors the window. Count subsequent valid source-time intervals; polling, held geometry and missing evidence never advance it. The first eligible fresh observation claims the frame synchronously, with no additional waiting period after green completion.
- Preserve sharpness requirements, freshness, movement bounds, uncertainty pauses, mode invalidation and once-only claims. Shorter timing intentionally reduces the amount of stability evidence; it does not improve the image or bypass checks.
- Include the resolved duration in diagnostic session-open and camera-start events so experiments remain attributable to their configuration.

## Consequences

At roughly eight detection jobs per second, 100 ms normally needs at least the next observation around 125 ms, and processing can lengthen that interval. Very short windows may trigger on momentary steadiness; device trials should compare false captures and image quality as well as speed. The one-second default remains until a separate decision changes it. Physical phone timing is not established by synthetic tests.
