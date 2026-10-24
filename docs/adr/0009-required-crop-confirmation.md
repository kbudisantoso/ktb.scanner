# ADR 0009: Require explicit corners when crop is missing

Date: 2026-10-18. Status: accepted; later decisions supersede historical defaults as noted below.

## Context

A failed still/live consistency check previously substituted the entire original, sometimes labeling that failed detection A4. A plausible green live rectangle must not turn missing still evidence into a finished scan.

## Decision

Return CropRequired for missing plausible still geometry or unresolved conflict with a fresh comparable stable Auto hint. It contains source size, unconfirmed editor corners and reason only, with no image/format. Reject synthetic full-frame contours from rotated searches (all corners <=0.025 from the source frame). Open the original solely as a manual editor source; use a comparable hint or inset handles as an unconfirmed suggestion. Explicit confirmation is required before processing/acceptance/export. Keep trying supported original-edge/hint-oriented/rotated still hypotheses first; unchecked live corners are never a crop. Abort preserves the previous replacement target. Unexpected missing export geometry fails instead of returning partial success.

## Consequences and verification

This supersedes full-image fallbacks in ADRs 0004..0006. A stable paper ratio does not prove correct edges. Custom hosts must handle the open editing state. Additional attempts cannot eliminate all manual correction. Private replays remain local; no unsupported independent color-gradient fallback was adopted.

See [decisions](../DECISIONS.md), [implementation contract](../SPECIFICATION.md) and [test status](../testing/STATUS.md).
