# ADR 0022: Built-in localization and an English library default

Date: 2026-10-25. Status: accepted and implemented; validation is recorded separately in [test status](../testing/STATUS.md). Updates D-007 without tying the library to a hosted product brand.

## Context

A reusable library needs a stable English default and a complete German option. The reference hosts demonstrate both languages. The updated demo decision uses English as the fallback and detects German primary browser language. Text overrides existed, but replacing a few labels did not localize errors, result viewers or PDF previews.

## Decision

- Add `ScannerOptions.locale: 'en' | 'de'`, defaulting to English. Reject unsupported values before opening a dialog or camera. Keep the existing options snapshot per session; changing a locale means closing and reopening.
- Export the DOM-free `createTranslator` helper, `ScanLocale` and `Translate`. The shared `ImageViewer` uses the same locale/override contract and English default. Set the language on owned scanner/viewer roots without changing the host document's language.
- Keep legacy German message keys compatible. English default text may also be overridden. Named placeholders support dynamic page labels without translating technical metadata keys or document contents.
- Keep stable `ScannerError.code` values; API messages default to English and the UI localizes them. Contract tests assert error codes rather than depending on a particular display language.
- Ship English profile/sound labels in public catalogs. Reference selectors translate them for display; IDs and processing recipes are unchanged.
- Both examples default to English and detect German primary browser language, including regional variants. A DE/EN selector and explicit `?lang=en` / `?lang=de` override detection and survive reload. Unsupported language parameters fall back to browser detection. Infer language without rewriting the URL; persist a choice only after explicit selection. Initial static HTML and the reference manifest use English. Update host language/title, result labels and PDF accessibility labels. A language change must not regenerate or discard image/PDF results. Language controls are disabled while a scan session is active.
- Locale does not alter camera settings, capture evidence, quality thresholds, paper-region inference, recipes, exports or metadata. The host still owns endpoint and persistence decisions.

## Consequences

Translation coverage must include errors and dynamic/accessibility labels, not only visible buttons. English-default controller tests and both host-language paths supplement existing German flows. Localized layout needs narrow/landscape checks; existing reference tests explicitly select German where that is their intended locale. The hosted KTB Scanner variant remains a separate host concern, not a new public library brand or a reason to copy scanner internals.
