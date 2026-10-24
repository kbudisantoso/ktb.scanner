# ADR 0012: Recover a coherently supported top outer edge

Date: 2026-10-18. Status: accepted; later decisions supersede historical defaults as noted below.

## Context

Several top-left corners remained inside the sheet. Choosing each strongest local gradient could follow content/background instead of a weak outer edge; broader search alone was unreliable.

## Decision

After an unsupported ordinary fit, test only a weak top edge. Use 64 positions in a strip up to 6% of the long source axis. Require old evidence <0.4, new >=0.6 and >0.15 improvement, >=47 supported positions/>=9 each quarter, >=85% bright neutral inner band, outward movement, valid convexity, drift <=0.065 and area factor 1.0025..1.2. Intersect with unchanged side lines and preserve bottom corners exactly. New longer side continuations need their own gradients. Otherwise retain the prior proposal. Do not alter manual corners/strong edges or remove the uncertainty warning. No logo-specific rule or fixed padding.

## Consequences and verification

Targeted replays improved two particular upper-edge failures and earlier examples, while unresolved conflicts remain confirmation-required. Motion blur and arbitrary bad hypotheses remain outside this limited correction. Negative synthetic tests and existing references limit regression risk; private images/corners/manifests stay local and physical acceptance remains open.

See [decisions](../DECISIONS.md), [implementation contract](../SPECIFICATION.md) and [test status](../testing/STATUS.md).
