# Public distribution

Project source is licensed under GNU AGPL version 3 only (`AGPL-3.0-only`), explicitly selected for this project. Full text is in the root and library LICENSE; NOTICE explains third-party boundaries. Workspace and example manifests stay `private: true` to prevent accidental package publication; the library is prepared for public packaging. This does not mean an npm release has occurred.

Public documentation is English. The library defaults to English with built-in German; both reference applications default to English, detect German browser language and support explicit DE/EN selection. Hosts can override text. Contribution guidance, issue/PR templates, security policy, pinned CI actions, dependency updates and CLI secret scanning follow the established workspace workflow. Application code/infrastructure from other products are not copied.

Public project source: [kbudisantoso/ktb.scanner](https://github.com/kbudisantoso/ktb.scanner). Actual hosted check results are available in [Actions](https://github.com/kbudisantoso/ktb.scanner/actions); npm publication and demo deployment remain separate.

## Source publication

Before a public push, review the exact tracked snapshot and package archive. Exclude local working instructions/configuration, environments, credentials, original documents, diagnosis ZIPs, certificates, screenshots and scratchpad files. Root instructions remain local. Preserve private development history locally; use a reviewed clean root for the first public branch rather than pushing old branches or tags. Never use an all-branches push from the private development repository.

Run the [contribution checks](../CONTRIBUTING.md#verification), build both integrations, inspect package entry points/assets/notices, verify a clean exported source build and scan the candidate snapshot for secrets. A secret scan supplements, rather than replaces, content review.

Create the public repository only after these checks. Enable private vulnerability reporting and require `CI Success` and the secret-scan status where the account supports branch protection. Keep workflow permissions read-only. Verify the first hosted workflow run; local success does not establish hosted Linux success.

## Registry release

GitHub source publication and npm publication are separate. Confirm access to the chosen namespace before publishing `@ktb/scanner`; the name in this workspace is not a claim of ownership. Settle the namespace/version/release policy before a registry release. Do not put registry credentials in the repository or demos. No current workflow publishes a package or deploys an application.

The package includes built entry points, declarations, source/build scripts, styles, worker/media assets, project license and third-party notices. The public repository provides the complete workspace build inputs and lockfile. Retain a source link appropriate to the distributed version when integrating or modifying the scanner. Run `pnpm check:package` to build from a clean output directory and inspect an actual archive, not only `files` metadata. The gate verifies entry points, source files, two CC0 cues and every collected dependency notice, while rejecting local configuration.

## Media and artifacts

The two bundled capture recordings retain their CC0-1.0 designation. Preserve each creator/source/checksum notice, the complete CC0 dedication, and Scanic/jsPDF/PDF.js notices. The former Pixabay downloads are local-only experiments under ignored `local-assets/`; only source-page suggestions remain in the [custom sound guide](SOUNDS.md). This removes them from the current source tree and future artifacts, without rewriting pre-existing Git history.

The [third-party audit](testing/LICENSE-AUDIT.md) records the media replacement and the accepted jsPDF upstream-MIT policy. Include supplemental WASM notices and the full project license in controlled assets. Both reference builds generate a linked notice collection; `pnpm check:notices` verifies its contents. A server/container deployment needs a separate inventory of the native dependencies it actually redistributes.

Hosted browser artifacts contain only synthetic test output and expire after seven days. Private diagnostic material is never a CI input. npm publication and public demo deployment remain separate actions from source preparation/publication.
