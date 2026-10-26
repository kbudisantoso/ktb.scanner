# 0023: npm namespace and GitHub release workflow

Status: accepted, 26 October 2026.

## Context

External hosts need a versioned dependency rather than a sibling checkout. The initial `@ktb` scope is unavailable. The confirmed npm organization is `ktb-tools`; a personal npm account administers it without using the personal name in the package name. Public GitHub source already exists, while npm has no first release yet.

## Decision

Use `@ktb-tools/scanner`, starting at 0.1.0. Keep example/workspace packages private. Published GitHub releases trigger the pinned workflow `publish.yml`; manual runs default to candidate-only mode. Require a matching `v<package-version>` tag on main, complete reusable quality/browser checks and secret scanning, and independent inspection of the actual tarball. Publish that exact artifact in a separate OIDC job, with no long-lived npm token or dependency lifecycle execution. Stable versions use `latest`, prereleases `next`; GitHub prerelease status must agree.

npm requires the package to exist before a trusted publisher is configured. Bootstrap once by interactively publishing the checked candidate artifact through the owning npm account. Configure GitHub owner `kbudisantoso`, repository `ktb.scanner`, workflow `publish.yml`, environment `npm`, with direct publishing allowed. Subsequent actual OIDC publications receive npm provenance. Preserve the first manual release's actual provenance status.

## Consequences

Update public imports, example dependencies, archive checks and integration instructions together. Keep complete assets and all notices in every package. Artifact retries accept only identical published bytes and fail on conflicting existing versions or registry errors. Release attachment writes and OIDC permissions belong to separate jobs. The normal CI remains read-only. There is no app deployment, automatic release from every push, placeholder package, credential in the repository, or publication merely from this configuration change.

First authentication, account 2FA, hosted workflow verification and real npm publication remain operational work. Newly configured npm trust expires after two days without an actual successful OIDC publish. See the [release guide](../PUBLISHING.md#registry-release) for steps and official references.
