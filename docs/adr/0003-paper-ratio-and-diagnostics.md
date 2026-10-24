# ADR 0003: Rectification ratio and local diagnostics

Date: 2026-10-18. Status: accepted; later decisions supersede historical defaults as noted below.

## Context

Proportionally fitting a perspective-distorted crop into A4 produced extra white margins. Device failures also needed raw/intermediate evidence rather than only the latest result.

## Decision

For standard presets, rectify the complete crop to the selected paper ratio before rotation/profiles, without clipping or upscaling either available crop axis. Fill the PDF page, compensating only integer-pixel rounding. Keep suggestion geometry independent of the forced target. An optional failure-tolerant receiver gets raw sources, geometry, metrics, decisions and available worker intermediates. Build-time instrumentation is restricted to Scanic 1.7.1 and unique anchors; source drift fails the build. Existing debug buffers are exposed only when enabled; installed vendor files are unchanged. The later optional candidate callback is independent of basic buffer exposure.

## Consequences and verification

The reference keeps up to 100 sessions in schema-2 diagnostics under 512 MiB, with at most 128 MiB heavy detail. Delete explicitly, after one hour without download or ten minutes after the latest download; new sessions invalidate old archives/restart retention. Do not interrupt active recording. Downloaded device files are unaffected. Original metadata may be present and recording affects performance. Diagnostics are off by default; no upload/persistence is introduced.

See [decisions](../DECISIONS.md), [implementation contract](../SPECIFICATION.md) and [test status](../testing/STATUS.md).
