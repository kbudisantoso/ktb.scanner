# ADR 0016: Auto without a manual profile override

Date: 2026-10-19. Status: accepted; later decisions supersede historical defaults as noted below.

## Context

A fixed manual default and extra Auto click prevent the expected immediate automatic choice/adjustment. Hosts still need explicit overrides and one library implementation.

## Decision

Add Auto to ScanProfile/catalog. Precedence is open > configuration > Auto; reference omits a manual default when Auto is selected. Apply on every new page immediately. Conservative sampling chooses Color for >=55% bright neutral, >=45% flat coverage and neutral 85th percentile >=140; otherwise Photo. Color uses equalization, bounded contrast and sharpness 20; Photo preserves colors. Never automatically choose Grayscale/S/W. Start evidence-tested radial Auto. Keep Auto intent in recipe and actual choice/reason/statistics/settings in autoOptimization. Manual filters/tones take precedence and survive geometry/export. Selecting Auto again removes manual overrides; Reset explicitly selects neutral Photo/lens Off. UI and both APIs use the same worker.

## Consequences and verification

Neutral bright photos may be treated as paper; dark/colorful paper may remain Photo. This is not semantic/OCR/material recognition or a blur repair guarantee. Custom adapters must return consistent Auto resolution data and omit it for manual profiles. Export resolves image and metadata together, never stale settings. Physical calibration remains open.

See [decisions](../DECISIONS.md), [implementation contract](../SPECIFICATION.md) and [test status](../testing/STATUS.md).
