# Security

ktb.scanner processes documents in the browser. Camera access, imported files, diagnostic archives, worker assets and exported blobs are security-sensitive boundaries.

## Reporting

Use GitHub's private vulnerability reporting for this repository when available. If it is not enabled, contact the maintainer through their [GitHub profile](https://github.com/kbudisantoso) to agree on a private channel before sharing exploit details. Do not publish an exploitable vulnerability, credentials, private receipts or unredacted diagnostic archives in an issue.

A useful report includes the affected commit or version, browser, minimal reproduction using synthetic files, impact and any suggested mitigation. Keep real documents out of the reproduction.

## Supported versions

This project is pre-1.0. Fixes target the current main branch; there is no long-term support or response-time commitment. Do not interpret passing browser tests as a completed physical-device or security certification.

## Scope

The library has no built-in upload endpoint, authentication or persistent document storage. The host application owns access control, secure asset delivery, backend validation and any upload. Diagnostics are off by default and must be explicitly enabled; once enabled, they may include original documents and intermediate images. See [diagnostics](docs/testing/DIAGNOSTICS.md) and [integration](docs/INTEGRATION.md).
