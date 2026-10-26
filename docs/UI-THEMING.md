# Styling the reusable scanner UI

Both `createScanner()` and React `Scanner` render the same reusable UI from `packages/scanner`. Import `@ktb-tools/scanner/styles.css` once in your global/client entry, then pass `theme` in the scanner options. This guide also covers the standalone `ImageViewer`.

The ten variables below are consumed by the current stylesheet and the published **0.1.0** stylesheet. The archive's `dist/styles.css` is byte-identical to the source stylesheet checked for this guide. These styling options already exist in 0.1.0; separately documented SDK extensions require their own release. See [installation and complete asset copying](../README.md#use-the-library-in-your-own-project) before running the examples.

## Supported variables

Defaults are declared directly on `.scanner`, the scanner dialog root. Color values accept CSS colors; radius accepts a CSS length; font accepts a CSS font-family list. Values are CSS strings, not validated theme objects.

| Variable | Default | Meaning and scope |
| --- | --- | --- |
| `--scanner-background` | `#f4f6f2` | Main scanner background and image-loading areas. The mobile camera has its own fixed background. |
| `--scanner-surface` | `#fff` | General controls, footer, tool surfaces and page labels. Also standalone viewer controls, with a white fallback. Does not replace every camera surface. |
| `--scanner-text` | `#172a22` | Root text color, inherited by general controls; standalone viewer control text has the same fallback. Primary button text and much of the mobile camera stay white. |
| `--scanner-muted` | `#52675c` | Secondary labels, helper text and diagnostic badge. Does not change fixed icon art or camera captions. |
| `--scanner-accent` | `#176449` | Primary backgrounds/borders, selected controls, range accents, some progress marks and the corner loupe border. Some capture/preview visuals keep fixed colors. |
| `--scanner-warning` | `#fff2d4` | Warning and camera-error panel backgrounds. Text generally inherits the surrounding color; the warning edge and mobile camera error text are fixed. |
| `--scanner-border` | `#ccd9cf` | General separators/borders and image viewer background. A standalone viewer background falls back to `#e3e9df`; viewer control borders fall back to `#ccd9cf`. |
| `--scanner-focus` | `#995515` | Three-pixel keyboard-focus outlines; standalone viewer fallback is the same. Mobile camera controls inherit a descendant override of `#a2ebc6`, which a theme on the root alone does not replace. |
| `--scanner-radius` | `12px` | Main dialog corners on larger screens. Smaller screens use square dialog corners; buttons, viewer and many panels use fixed radii. |
| `--scanner-font` | `system-ui, sans-serif` | Main scanner font family, inherited by ordinary scanner controls. Base size/line-height and many control sizes remain fixed. A standalone viewer needs the host to set its actual `font-family`; setting only this variable does not do that. |

`theme` is typed as ``Record<`--scanner-${string}`, string>``. The prefix permits names at the type level; it does not make arbitrary names functional. For example, `--scanner-button-text` has no consumer and changes nothing. Internal variables such as camera-height calculations, and unused names found in experiments, are not additional public theme tokens.

## Imperative integration

A complete browser function, with no camera request until the person selects the camera:

```ts
import type { ScanResult, ScannerOptions } from '@ktb-tools/scanner';
import '@ktb-tools/scanner/styles.css';

const theme = {
  '--scanner-background': '#f7f8fb',
  '--scanner-surface': '#ffffff',
  '--scanner-text': '#1f2937',
  '--scanner-accent': '#1d4ed8',
  '--scanner-font': 'system-ui, sans-serif',
} satisfies NonNullable<ScannerOptions['theme']>;

export async function scanForPreview(
  mount: HTMLElement,
  onConfirmed: (result: Extract<ScanResult, { status: 'confirmed' }>) => void,
  signal?: AbortSignal,
) {
  const { createScanner } = await import('@ktb-tools/scanner/react');
  const scanner = createScanner({
    mount,
    assetBaseUrl: '/scanner-assets/',
    theme,
    locale: 'en',
    texts: { Abschließen: 'Show results' },
    shutterSound: 'off',
  });
  try {
    const result = await scanner.open({ signal });
    if (result.status === 'confirmed') onConfirmed(result);
  } finally {
    await scanner.destroy();
  }
}
```

Call this from the host's Scan button with a dedicated mount. Forward host navigation/unmount cancellation through `signal`. The host knows its result handling before opening: here the existing Finish button is labeled **Show results**, and the existing `confirmed` branch supplies the blobs to `onConfirmed`. For German, use `locale: 'de'` and `texts: { Abschließen: 'Ergebnisse anzeigen' }`. Existing German message keys work in either locale; English text overrides such as `Finish` also work.

Completion exports the confirmed images and optional PDF; it starts no download. A host that prepares a download flow can choose a matching label and handle the same confirmed result itself. Filenames, download links, persistence, PWA/manifest, website UI and storage remain host responsibilities. There is no new completion intent or Save/Download callback. The [reference result host](../apps/demo-next/app/Results.tsx) already has download links.

## React integration, light and dark

The complete [TypeScript/React example](examples/ui-theming.tsx) exports `lightTheme`, `darkTheme`, `ThemedScanButton`, an imperative function and a standalone viewer. Copy it with its [host container CSS](examples/ui-theming.css) into a client module in your host and serve the scanner assets at `/scanner-assets/`.

```tsx
import { ThemedScanButton } from './ui-theming';

export function DocumentInput() {
  return (
    <ThemedScanButton
      dark
      locale="en"
      onConfirmed={(result) => {
        // Keep these blobs in host state and show your result view.
        console.log(result.pages.length);
      }}
    />
  );
}
```

Inside the complete component, `Scanner` receives the theme through `options`, not a separate `theme` prop:

```tsx
<Scanner
  open
  options={{
    assetBaseUrl: '/scanner-assets/',
    theme: dark ? darkTheme : lightTheme,
    locale,
    texts: { Abschließen: locale === 'de' ? 'Ergebnisse anzeigen' : 'Show results' },
    shutterSound: 'off',
  }}
  onResult={(result) => {
    setOpen(false);
    if (result.status === 'confirmed') onConfirmed(result);
  }}
  onError={() => setOpen(false)}
/>
```

The component's options are captured when opening. Changing the theme, locale or other options while open does not restyle/reinitialize that session; close and reopen with the desired options. Use a host color-scheme control or `prefers-color-scheme` in the host to select the next session's theme. Callback updates are handled separately and do not restart a session.

The complete example defines all ten variables for each palette. The dark palette keeps the accent dark enough for the fixed white primary-button text, and uses a dark warning surface for the inherited light text. The examples are starting points; validate the actual states and host combination you ship.

## CSS inheritance and priority

A custom property on an ancestor is inherited only when the descendant does not specify its own value. The stylesheet declares defaults on `.scanner`, so this alone does **not** replace those defaults:

```css
.host-shell {
  --scanner-accent: #1d4ed8;
}
```

`theme` writes inline custom properties on that same `.scanner` root. Normal inline values take precedence over normal stylesheet declarations there, so this is the supported per-instance route. Descendants then inherit them unless they declare their own value, as the mobile camera does for focus. The backdrop is a parent of the root, so variables placed on the scanner cannot flow upward into it.

A stylesheet rule that directly targets the root can also override its defaults through the normal cascade; that is different from inheritance. Avoid `!important` and selectors tied to internal nesting. React's `className` is placed on the host wrapper; `ImageViewer.className` is added to its root. Neither promises a stable selector contract for every internal child or DOM arrangement. Prefer the documented theme variables and CSS for your own host containers; recheck any direct internal-selector overrides after SDK updates.

## Locally served fonts

Place a font you are licensed to serve in the host's public directory, for example `public/fonts/host-sans.woff2`. Load it from the same origin; the library does not fetch a font for you:

```css
@font-face {
  font-family: 'Host Sans';
  src: url('/fonts/host-sans.woff2') format('woff2');
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
}
```

Declare a weight range only for an actual variable font; for static fonts provide the real weight/style for each file. Then set `theme['--scanner-font'] = '"Host Sans", system-ui, sans-serif'` before creating/opening the scanner. Keep a fallback for slow or failed loads. Host CSP `font-src` must allow the local URL. Different font metrics can change wrapping and controls, so check English and German, narrow views and keyboard focus with the actual font file.

## Standalone ImageViewer in a host container

`ImageViewer` has no `theme` prop. It shares the stylesheet and inherits custom properties from its own host container because it is not a `.scanner` dialog. The complete example's `ThemedResult` sets theme variables on a bounded flex container and applies `fontFamily` explicitly:

```tsx
<div
  className="host-result-viewer"
  style={{ ...theme, fontFamily: theme['--scanner-font'] } as CSSProperties}
>
  <ImageViewer image={image} alt="Scanned document" resetKey={resetKey} locale="en" />
</div>
```

Import `CSSProperties` from `react` and `ImageViewer` from `@ktb-tools/scanner/react`, as the complete example does. Its host CSS is:

```css
.host-result-viewer {
  display: flex;
  height: min(70dvh, 640px);
  min-height: 240px;
  min-width: 0;
  color: var(--scanner-text);
  font-family: var(--scanner-font, system-ui, sans-serif);
}
```

The viewer directly consumes `--scanner-border`, `--scanner-surface`, `--scanner-text` and `--scanner-focus`; other variables in the shared object do not acquire new viewer effects. Pass an image `Blob`, a changed `resetKey` for a new page/rotation and optionally a geometrically matching `before` blob. The parent owns blobs; the viewer creates and revokes its preview URLs. See [viewer interaction and ownership](INTEGRATION.md#shared-react-image-viewer).

## Contrast, focus and current limits

Check ordinary and muted text against their backgrounds, warning text against warning surfaces, accent-colored selected controls against their surfaces, and **white text against the accent** on primary buttons. A light accent can erase that white label even when other text looks correct. Keep borders and disabled/selected states distinguishable; do not rely on color alone. Preserve visible keyboard focus and inspect focus rings against both light and dark neighbors, including the viewer and mobile camera. Test the actual font, both locales, narrow portrait/landscape, warnings/errors and zoomed content. This guide does not establish assistive-technology or physical iPhone/Android acceptance.

The current theme API intentionally has a limited effect:

| Missing customization | Current consequence | Smallest possible follow-up, if required |
| --- | --- | --- |
| Backdrop color, positioning and stacking | Fixed `#14281fcc`, viewport overlay and `z-index: 10000`; root theme cannot change the parent backdrop. | Discuss one backdrop-color token for color-only needs. Different embedding/stacking needs a separate concrete design decision. |
| Mobile camera palette/focus | Camera background, gradients, white controls, caption colors and descendant focus override remain fixed at `max-width: 700px` or `max-height: 500px`. | Identify the exact failing state, then consider a token for that color/focus only. |
| Primary foreground | Primary labels stay white; one accent also colors selected text elsewhere. | If no suitable accent meets both uses, consider one primary-foreground token. |
| Uniform corners/spacing/dimensions | Only main dialog radius is tokenized; button/viewer/panel radii, gaps, control sizes and responsive layout largely use fixed values. | Request the specific dimension and affected control before adding a narrowly scoped token. |
| Full illustration/preview recoloring | Profile samples, some SVG/preview art, progress visuals, warning edge and select arrow contain fixed colors. | Keep semantic example art where needed; discuss a single problematic visual before changing it. |

These are documented gaps, not implemented proposals. This documentation adds no headless, slot, layout or expanded token API. No runtime stylesheet changes are required for the examples. Use the [existing public reference hosts](INTEGRATION.md) for a full result gallery and download flow; do not move private website code into the library.

## Verification scope

The source and published 0.1.0 stylesheet, public declarations and existing exports were checked. The complete example is typechecked against the built public package. Rendered verification and the exact automated checks for this documentation are recorded in [verification status](testing/STATUS.md); source inspection alone is not a visual check.
