# ADR 0010: Paper axes independent of image rotation

Date: 2026-10-18. Status: accepted; later decisions supersede historical defaults as noted below.

## Context

An oblique portrait page can have greater projected width than height. Selecting A4 then yielded landscape; turning the image also turned text and did not correct the mistaken axes.

## Decision

Add optional portrait/landscape orientation to standard formats, defining paper axes before the separate image rotation. rectifiedSize/layoutMm use the same setting and preserve the complete crop without upscaling either source axis. UI buttons describe the resulting orientation after rotation and convert back to stored pre-rotation axes. Profile/preset/corner edits and export preserve manual orientation. Receipts/original ratio remain proportional; aria-pressed exposes selection.

## Consequences and verification

The optional metadata extension keeps schema version 1 and rejects invalid values. Orientation is not proof of correct edges/physical size. Native geometry and real browser marker/PDF tests check that content does not rotate when only paper axes change. Higher-resolution local re-detection was not generally adopted when it produced inner/no contours; weak top-left edges remain a separate problem.

See [decisions](../DECISIONS.md), [implementation contract](../SPECIFICATION.md) and [test status](../testing/STATUS.md).
