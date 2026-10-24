# ADR 0015: Compact mobile workspace and React API

Date: 2026-10-19. Status: accepted; later decisions supersede historical defaults as noted below.

## Context

Long settings displaced the phone image. An additional vague document profile was not useful. Hosts needed per-open defaults and a declarative styleable component using the same encapsulated logic.

## Decision

Use bounded review/tool workspaces with fixed actions, short names and single active adjustment groups. Export a DOM-free profile catalog and validated configuration/open overrides. The public Scanner component delegates to createScanner, snapshots options on opening, uses current callbacks without restart, cleans up on close/unmount and avoids duplicate StrictMode sessions. Tokens/texts work for both APIs; Astro keeps the imperative example.

## Consequences and verification

The historical four-profile Color default was superseded by ADR 0016 (Auto). The historical development diagnostic default was superseded by D-033 (off everywhere). The single-page manager/persistent comparison rows were superseded by ADR 0020. Legacy document recipes remain processor-compatible but absent from UI. Normal actions stay in the viewport while tiles, enlarged images and technical details can move/scroll internally. The linked mobile plan and test status describe current behavior.

See [decisions](../DECISIONS.md), [implementation contract](../SPECIFICATION.md) and [test status](../testing/STATUS.md).
