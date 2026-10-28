# ADR 0005: Paper shape, continuity and paused capture evidence

Date: 2026-10-18. Status: accepted; later decisions supersede historical defaults as noted below.

## Context

Isolated quadrilateral outliers, brief detection losses and uncertain sharpness repeatedly reset capture. Smoothing alone would hide actual movement.

## Decision

Score rectangularity, parallel/opposite sides and proximity to A/B, Letter or postcard ratios in source pixel coordinates. Group comparable overlapping hypotheses before applying complete/middle/left sheet priorities. Keep perspective and receipts possible; never snap corners to an ideal rectangle. Separate raw observations from displayed tracking. Confirm jumps with a second consistent observation, hold/fade display briefly and supply no capture geometry from held/rejected frames. Sum measured stable intervals only; uncertainty pauses without adding the missing time. Fresh sharp evidence is required at claim. Polling cannot trigger capture or alter a running job's mode generation. Current tolerances are in ADR 0006 and the implementation contract.

## Consequences and verification

Unreleased update, 28 October 2026: before greedy duplicate suppression, keep an independently supported complete outer candidate over a contained fold panel below 82% of its area when both opposite panel sides follow the observed outer sides within a bounded pixel tolerance. Preserve original candidate corners and existing evidence/stability thresholds. This addresses white live-edge switches caused by competing panels; green progress is a separate overlay. An outer boundary absent from the candidate pool cannot be reconstructed by this rule. [Native regressions](../../tests/unit/folded-boundaries.test.ts) and a [real-worker synthetic case](../../tests/browser/folded-boundaries.spec.ts) cover this extension.

Suppress a smaller inner hypothesis below 82% outer area when >90% of it overlaps a comparable-confidence outer contour. Exclude a weak crossing fragment with >45% overlap and outer advantages >0.15 score/confidence and >0.10 rectangularity. An almost equal-confidence edge fragment may lose with a shared corner <0.025, >=18% overlap, <60% area, >0.22 score and >0.12 shape advantage, with outer confidence no more than 0.05 lower. A remaining preferred fragment <60% of a >65%-overlapping alternative yields ambiguous-overlapping-contours. After unsuccessful independent attempts, ADR 0009 requires corners. These are tested starting bounds, not general camera calibration. Pauses can extend wall-clock capture time; held display is never proof of continuing detection.

See [decisions](../DECISIONS.md), [implementation contract](../SPECIFICATION.md) and [test status](../testing/STATUS.md).
