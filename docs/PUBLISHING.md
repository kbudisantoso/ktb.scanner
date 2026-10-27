# Public distribution

Project source is licensed under GNU AGPL version 3 only (`AGPL-3.0-only`), explicitly selected for this project. Full text is in the root and library LICENSE; NOTICE explains third-party boundaries. Workspace and example manifests stay `private: true` to prevent accidental package publication; the library is prepared for public packaging. Version 0.1.0 is published; the current source and integration guides target 0.2.0. Source preparation alone does not establish registry availability.

Public documentation is English. The library defaults to English with built-in German; both reference applications default to English, detect German browser language and support explicit DE/EN selection. Hosts can override text. Contribution guidance, issue/PR templates, security policy, pinned CI actions, dependency updates and CLI secret scanning follow the established workspace workflow. Application code/infrastructure from other products are not copied.

Public project source: [kbudisantoso/ktb.scanner](https://github.com/kbudisantoso/ktb.scanner). Actual hosted check results are available in [Actions](https://github.com/kbudisantoso/ktb.scanner/actions); npm publication and demo deployment remain separate.

## Source publication

Before a public push, review the exact tracked snapshot and package archive. Exclude local working instructions/configuration, environments, credentials, original documents, diagnosis ZIPs, certificates, screenshots and scratchpad files. Root instructions remain local. Preserve private development history locally; use a reviewed clean root for the first public branch rather than pushing old branches or tags. Never use an all-branches push from the private development repository.

Run the [contribution checks](../CONTRIBUTING.md#verification), build both integrations, inspect package entry points/assets/notices, verify a clean exported source build and scan the candidate snapshot for secrets. A secret scan supplements, rather than replaces, content review.

Create the public repository only after these checks. Enable private vulnerability reporting and require `CI Success` and the secret-scan status where the account supports branch protection. Keep verification workflow permissions read-only. The release workflow grants OIDC only to the publish job and release-attachment write access only to its attachment job. Verify hosted workflow runs; local success does not establish hosted Linux success.

## Registry release

The confirmed npm organization is **`ktb-tools`**, managed through a personal npm account. The public package is **`@ktb-tools/scanner`**, initially version **0.1.0**. Version 0.1.0 is published from tag `v0.1.0` at `d277d32d6f9df52c6c95dd31e79885ddd3b11793`. Never overwrite that version. The 0.2.0 release is authorized by D-046 in [decisions](DECISIONS.md) and uses the subsequent-release procedure below; registry availability must be verified for the exact version. GitHub source publication, npm releases and application deployment are separate operations; no workflow deploys a hosted scanner application.

`.github/workflows/publish.yml` publishes when a GitHub release is **published**, not when a draft is saved or a commit is pushed. Tags must exactly match `v<package-version>` and point to a commit on `main`. Stable versions use npm's `latest` channel; semantic prereleases such as `0.2.0-beta.1` must be marked as GitHub prereleases and use `next`. Version numbers are immutable; increase the library version before the next release. Root/example versions do not determine the npm version.

The workflow runs the existing complete quality/browser matrix and secret scan against the tagged commit, builds the archive with pinned pnpm, independently inspects its contents and uploads it with `SHA256SUMS`. A separate job downloads that exact artifact and publishes it using **npm Trusted Publishing (OIDC)**, without dependency installation or lifecycle scripts. Successful publication attaches the archive/checksum to the GitHub release. Repeating a run is accepted only if npm already contains the same SHA-512 archive integrity; a different existing package fails rather than being silently accepted. Before publication, a 404 immediately means the checked version is missing. After publication, the registry check allows up to five minutes for temporary 404 responses while npm processing propagates, waiting 5, 10 and then at most 15 seconds between checks. Each fetch is limited to 30 seconds or the remaining overall budget, whichever is shorter. Success requires HTTP 200 with the identical archive integrity; mismatched bytes, authorization failures, malformed JSON, other HTTP errors and network failures fail immediately. Exhausting the deadline fails verification and never triggers another publication.

### First publication: historical one-time account setup

The initial 0.1.0 publication is complete. The following records the bootstrap procedure; it is not an instruction to republish 0.1.0. npm trusted-publisher configuration requires an existing package. Bootstrap with the real, inspected first release archive; do not publish an empty placeholder or put a publishing token in GitHub.

1. Enable npm account 2FA and confirm that your account can publish under `ktb-tools`.
2. Merge/push the reviewed release-workflow and namespace changes to `main`. Ensure `packages/scanner/package.json` contains the intended version and update the changelog with its actual release date when preparing publication.
3. Create/push the tag for that commit, for example `git tag -a v0.1.0 -m "Release 0.1.0"` and `git push origin refs/tags/v0.1.0`. Do not publish the GitHub release yet.
4. In GitHub **Actions > Publish npm package > Run workflow**, select branch `main`, enter `v0.1.0`, and leave **publish disabled**. This performs the full checks and produces candidate artifact `npm-package-0.1.0` without publishing.
5. Download/extract that artifact. On the Mac, verify it with `shasum -a 256 -c SHA256SUMS`. In that directory run `npm login --registry=https://registry.npmjs.org/`, then `npm publish ./ktb-tools-scanner-0.1.0.tgz --access public --tag latest --ignore-scripts --registry=https://registry.npmjs.org/`. Complete npm's interactive authentication/2FA. The bootstrap is a manual publication and has no GitHub OIDC provenance; never claim otherwise.
6. On npm, open **Packages > @ktb-tools/scanner > Settings > Trusted publishing**, choose **GitHub Actions** and enter the exact values below. Enable direct **npm publish** permission; stage-only permission does not run this workflow.

| Field | Value |
| --- | --- |
| Organization or user | `kbudisantoso` (GitHub repository owner, not the npm organization) |
| Repository | `ktb.scanner` |
| Workflow filename | `publish.yml` |
| Environment | `npm` |

The GitHub job uses environment `npm`. Create/configure it under **Repository Settings > Environments** if you want additional release approvals; any branch/tag restriction must permit the intended `v*` release tags. Do not add an `NPM_TOKEN` secret. Create the trusted-publisher configuration close to the next actual OIDC publication: npm expires a new, unused configuration after two days. A rerun that only confirms already-published bytes does not perform an OIDC publication and therefore does not validate that configuration. Recreate an expired configuration if needed.

7. In GitHub **Releases > Draft a new release**, select existing tag `v0.1.0`, add release notes and publish. The workflow verifies the already-published first artifact and attaches it. Inspect both the Actions result and the npm package page. This does not retroactively give the manual bootstrap provenance.

### Subsequent GitHub releases

1. Update only the library version in `packages/scanner/package.json`, the changelog, release notes and relevant public guides. Run checks, open a release-preparation PR and merge it to `main` after review and CI. Workspace/example manifests stay private and need no matching version bump. Reinstall if dependency declarations change; never reuse a published version.
2. On GitHub, open **Releases > Draft a new release**, create/select the matching tag (for example `v0.2.0`) on the reviewed `main` commit, and add notes. Mark semantic prereleases as **pre-release**.
3. Click **Publish release**. The workflow checks/builds, publishes to npm using OIDC, verifies the registry archive and attaches it to the release. Drafting alone does not publish to npm. Confirm workflow success; a GitHub release page by itself is not evidence of npm publication.
4. Consumers install, for example, `pnpm add @ktb-tools/scanner@0.2.0`. CSS and complete asset-copy integration remain required.

For a failed run caused by external setup, correct the setup and rerun it. A workflow-only fix can instead be reviewed, checked and merged to `main`, then run **Publish npm package > Run workflow** from that new `main` commit with the existing unchanged release tag and **publish** enabled. The selected ref supplies the workflow; every package checkout still uses the validated tag/commit, and identical-byte registry guards remain active. For example, use `npm publish "./release/$RELEASE_ARCHIVE"` with the explicit `./`: npm can interpret `release/archive.tgz` as a GitHub shortcut. A runtime/package code change requires a new reviewed version and tag. Never move an already-published release tag or change its archive bytes.

The registry-check script is read from the validated release tag, just like the package source. The bounded post-publication wait therefore applies only to tags containing that script change; selecting a newer workflow with an older tag does not replace its script. Preserve existing tags and archive bytes. For an older run that failed during propagation, independently verify the exact version/integrity is available before rerunning its verification/attachment path.

A manual dispatch does not attach release assets: the `attach` job requires a release event. After verifying successful publication of the identical archive, rerun the failed jobs of the original release-triggered run. Its registry check accepts the identical published bytes, skips the already-completed npm publication, verifies them again and permits the release-attachment job to upload the archive/checksum. A candidate-only manual run remains the default. Keep credentials out of source, demos, artifacts and logs.

Official references: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/), [npm trust prerequisites](https://docs.npmjs.com/cli/v11/commands/npm-trust), and [GitHub release-triggered package publishing](https://docs.github.com/en/actions/tutorials/publish-packages/publish-nodejs-packages).

The package includes built entry points, declarations, source/build scripts, styles, worker/media assets, project license and third-party notices. The public repository provides the complete workspace build inputs and lockfile. Retain a source link appropriate to the distributed version when integrating or modifying the scanner. Run `pnpm check:package` to build from a clean output directory and inspect an actual archive, not only `files` metadata. The gate verifies entry points, source files, two CC0 cues and every collected dependency notice, while rejecting local configuration.

## Media and artifacts

The two bundled capture recordings retain their CC0-1.0 designation. Preserve each creator/source/checksum notice, the complete CC0 dedication, and Scanic/jsPDF/PDF.js notices. The former Pixabay downloads are untracked experiments outside build inputs; only source-page suggestions remain in the [custom sound guide](SOUNDS.md). This removes them from the current source tree and future artifacts, without rewriting pre-existing Git history.

The [third-party audit](testing/LICENSE-AUDIT.md) records the media replacement and the accepted jsPDF upstream-MIT policy. Include supplemental WASM notices and the full project license in controlled assets. Both reference builds generate a linked notice collection; `pnpm check:notices` verifies its contents. A server/container deployment needs a separate inventory of the native dependencies it actually redistributes.

Hosted browser artifacts contain only synthetic test output and expire after seven days. Private diagnostic material is never a CI input. npm publication and public demo deployment remain separate actions from source preparation/publication.
