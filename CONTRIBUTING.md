# Contributing to ktb.scanner

Bug reports, focused fixes, documentation and synthetic image fixtures are welcome. The project follows the workspace and Conventional Commit patterns used by Club Manager, with checks tailored to a browser scanner library.

## Development

Use Node 24 LTS, pnpm 11.15.1 and Python 3. Camera tests require localhost or HTTPS. No backend, account, API key or database is needed for the normal scanning flow.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The Next.js reference runs at localhost:3000. `pnpm dev:astro` starts the second integration at localhost:4321. Both use the built library and locally delivered worker assets. See [integration](docs/INTEGRATION.md).

## Changes

- Keep framework-independent session, image and export logic inside the library. Examples must use its public entry points.
- Preserve SSR-safe core imports and lazy browser resources.
- Start from the original for reversible image edits. A processing failure must not confirm a partial result.
- For image-processing changes, use known geometry, faint strokes, punctuation, colored marks and negative examples. Inspect the actual resulting artifacts.
- Keep synthetic calibration and acceptance fixtures separate. Never commit real receipts, personal data, diagnostic ZIPs, secrets or certificates.
- Keep changes focused. Discuss a substantial API or workflow change before implementing it.

Create a branch such as `fix/42-receipt-preview` or `feat/57-export-option`. Use Conventional Commits with a domain scope, for example `fix(scanner): preserve faint ink`. Pull requests describe the problem, resulting behavior, relevant validation and API impact. Add synthetic screenshots for UI changes.

## Verification

```sh
pnpm test:core
pnpm test:release
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm check:docs
pnpm check:package
pnpm licenses:inventory
pnpm check:notices
pnpm exec playwright install chromium firefox webkit
pnpm test:browser
```

The full build produces the library, copies assets and builds both hosts. Browser tests use their own ports 3177 and 4377. Sound tests mute physical output while exercising native audio behavior. Known browser exceptions and remaining physical-device work are listed in the [test status](docs/testing/STATUS.md).

Headless Firefox on Linux needs an available audio backend for native Web Audio tests. CI starts PulseAudio with a virtual null sink; output stays muted and no hardware speaker is required. Use an equivalent audio backend when reproducing these tests on a headless Linux machine.

All four browser CI profiles use the [official Playwright image](https://playwright.dev/docs/docker), pinned to `v1.64.1-noble` and its immutable manifest digest. It already contains Chromium, Firefox, WebKit and their system libraries, so no job downloads browsers or reinstalls the full browser dependencies. Keep the image tag/digest and the exact `@playwright/test` version aligned; CI checks the package version and the selected engine's executable before building/testing. A container pull is still required on a fresh runner, so this is not a fixed runtime guarantee.

Firefox additionally installs PulseAudio and its command-line utilities, then starts the existing per-user server and virtual null sink inside the container. The root-user message from PulseAudio is a [warning](https://github.com/pulseaudio/pulseaudio/blob/v16.1/src/daemon/main.c#L758); the setup does not enable system-wide mode or change the physically muted test fixture. This remaining package installation still uses `apt`. The container uses `--init` for process reaping and `--ipc=host` for Chromium's shared-memory requirements; all run steps use Bash explicitly. All four profiles, complete test suites and the `CI Success` gate remain required. Container checks do not establish physical Safari/iPhone acceptance. No custom image is built or published.

`pnpm licenses:inventory` records the resolved production dependencies locally. Preserve third-party license notices, including CC0 audio attribution and the full CC0 dedication. Do not assume the source-code license relicenses media.

## Community

Keep reviews specific, respectful and focused on the code. Report security issues privately as described in [SECURITY.md](SECURITY.md). Use the issue templates for reproducible bugs and feature proposals.

Project source is licensed under GNU AGPL version 3 only; contributions are made under the same project license. Preserve separate third-party code and media notices. No contributor agreement or alternative commercial license is introduced by this project.
