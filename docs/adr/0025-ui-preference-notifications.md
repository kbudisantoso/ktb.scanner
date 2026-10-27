# 0025: Global UI preferences without persistence

Status: accepted, 26 October 2026.

## Context

The host can already apply Auto/Manual and JPEG/PNG defaults. Internal UI choices must reach it even if the session is later cancelled, without deriving defaults from page metadata or moving storage into the library.

## Decision

Add `ScannerOptions.onPreferenceChange` in both controller and React `options`. Export the discriminated `ScannerPreferenceChange` union from core and React: `{ preference: 'initialMode', value: CaptureMode }` or `{ preference: 'imageType', value: ImageMime }`. Emit synchronously after a validated, changed global UI choice. Retain a synchronous value ref to deduplicate events before rerender. Never emit on initialization/reapplication, unchanged/invalid choices, per-page editing or after session end.

Keep the result/completion API unchanged. Isolate callback throws and rejected promises. React uses a stable forwarding callback and the current props ref, so handler updates do not restart a session/camera. Reapply with existing `initialMode` / `imageType` options on a later opening.

## Consequences

The host receives changes before later cancellation, with no content, filenames, identifiers or diagnostics. The host owns reading, validation, migration, writing and reset of durable defaults. Theme/sound are already host choices. There is no SDK localStorage/cookie access, parallel settings/storage abstraction or fully controlled live scanner state. This API targets 0.2.0 and is absent from 0.1.0. T-37 records the expected regression scope; test status records actual execution separately.
