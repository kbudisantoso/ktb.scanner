# ADR 0018: Low-noise monochrome with soft gray edges

Date: 2026-10-19. Status: accepted; later decisions supersede historical defaults as noted below.

## Context

Hard local 0/255 decisions amplified paper grain, spots and folds. A binary result no longer matched the desired S/W behavior.

## Decision

Keep bw as a profile ID but use slight edge-preserving noise reduction and a local continuous document curve. Protect dark ink and opposing supported thin lines; suppress isolated gray impulses/low paper grain while allowing faint characters and text edges to remain gray. No hard threshold, new text, OCR, blanket small-component morphology or general stain-removal claim. Keep existing S/W paper preparation separate and leave Photo/Color/Grayscale unchanged. Recompute from original; PNG is monochrome with gray levels, not a promised bitonal format. Manual tones remain effective.

## Consequences and verification

Measure background disturbance rates plus faint horizontal/vertical lines, dark ink, punctuation, gray edges, alpha and export consistency. Private replay is visual supporting evidence, not proof that every removed dark component is noise. Severe dirt, low resolution and motion blur can remain; no character reconstruction is performed.

See [decisions](../DECISIONS.md), [implementation contract](../SPECIFICATION.md) and [test status](../testing/STATUS.md).
