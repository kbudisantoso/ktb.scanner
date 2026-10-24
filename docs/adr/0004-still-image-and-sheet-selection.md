# ADR 0004: Independent still detection and sheet selection

Date: 2026-10-18. Status: accepted; later decisions supersede historical defaults as noted below.

## Context

A single best contour can select an inner rectangle or wrong sheet. A manual shutter can also race a live detection job.

## Decision

Cancel live timers/jobs through their separate signal before capturing. A generation counter prevents late results/abort errors from changing still state. Independently detect/refine the full original; confirmed manual corners remain authoritative. A source-anchor-checked Scanic callback receives pass candidates. Validate geometry/evidence before position, deduplicate inner/pass contours, prefer complete-looking sheets, then horizontal middle or left-middle for an even count. A live hint requires <=400 ms age, compatible proportions and known same frame area; it never replaces still detection.

## Consequences and verification

Completeness and ordering remain heuristics; occluded or undetected sheets cannot be reliably ranked. ADR 0009 replaces any historical full-image fallback with required manual corner confirmation. Synthetic two/three-sheet, perspective, clipping and delayed-job cases supplement, rather than replace, physical-device diagnosis.

See [decisions](../DECISIONS.md), [implementation contract](../SPECIFICATION.md) and [test status](../testing/STATUS.md).
