# ADR 0017: Whiter paper in Color and Grayscale

Date: 2026-10-19. Status: accepted; later decisions supersede historical defaults as noted below.

## Context

Earlier common brightness fields left paper gray and color casts visible, especially near shaded boundaries. More aggressive binary S/W had a different noise problem.

## Decision

Use per-channel local median background fields and linear boundary continuation. Target channel value 255 with gain <=3 after global evidence checks; protect saturated colors and alpha, carry faint ink relative to its background and convert Grayscale afterwards. Fill only unsupported grid cells, keeping valid darker background evidence. Auto Color uses the same path; manual overrides and original/crop comparisons remain. Reserve 4 MiB for RGB statistics and report the white-correction mode. Photo/legacy filters and the separate S/W paper-preparation path remain unchanged.

## Consequences and verification

Genuinely gray/slightly tinted paper can also become white; Photo is the unchanged alternative. Strong shadows/dense photos/lost text are not universally repaired. Neutral color casts are intentionally corrected while saturated marks are protected. Tests cover faint lines, pale colored text, strong marks, alpha, JPEG/PNG and export equivalence. ADR 0018 separately replaces S/W's old hard threshold.

See [decisions](../DECISIONS.md), [implementation contract](../SPECIFICATION.md) and [test status](../testing/STATUS.md).
