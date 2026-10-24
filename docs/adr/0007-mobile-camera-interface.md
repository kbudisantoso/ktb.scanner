# ADR 0007: Direct mobile camera controls

Date: 2026-10-18. Status: accepted; later decisions supersede historical defaults as noted below.

## Context

Stacked forms, large headings and explanatory blocks limited the phone preview. Useful reference patterns prioritized camera area, a short in-image hint and reachable shutter/import actions.

## Decision

Use a dynamic-viewport camera surface with safe-area padding. Center the complete source proportionally and map the contour to the identical source area. Keep the frozen image proportional. Overlay compact header/footer controls; move capture controls right in landscape. Expose an 82 px shutter, Auto/Manual, import and back. Camera choice/restart live in options. Use one state-dependent hint, accessible action names, visible focus and >=44 px targets. Offer torch only when the track reports support; tolerate constraint failures, invalidate stale light jobs and pause capture evidence during switching.

## Consequences and verification

This is the same library, texts, theme, import pipeline and cleanup. No vendor reference images or additional product modes are distributed. Letterboxing is preferable to distorting/cropping the source or misaligning the contour. Emulated layout/torch cases do not establish real iPhone/Android camera/light behavior.

See [decisions](../DECISIONS.md), [implementation contract](../SPECIFICATION.md) and [test status](../testing/STATUS.md).
