# 0024: Per-open direct camera entry

Status: accepted, 26 October 2026.

## Context

A host Scan button needs to enter the reusable scanner camera without a second selection. `initialMode` already means Auto/Manual. Import and browser permission recovery must remain available.

## Decision

Add optional `OpenOptions.entry: ScannerEntry`, where `ScannerEntry` is `workspace | camera`. Default to the existing workspace. React passes the same option through `openOptions`. Nonempty initial files always take the import path; empty arrays follow entry. Validate entry even when files are supplied, before any UI or resources. Use the existing CameraView and session; request no camera during import/SSR.

## Consequences

Denial retains retry, import and cancellation. Abort/destroy invalidate pending camera work, stop late tracks and suppress late device enumeration. StrictMode and callback updates keep one session per opening. No new camera implementation, storage, download or completion API. The API targets 0.2.0 and is not present in 0.1.0. See T-36 and the verification status for actual evidence.
