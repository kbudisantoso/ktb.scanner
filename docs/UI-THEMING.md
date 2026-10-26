# Styling the reusable scanner UI

Both `createScanner()` and React `Scanner` render the same reusable UI from `packages/scanner`. Import `@ktb-tools/scanner/styles.css` once in your global/client entry, then pass `theme` in the scanner options. This guide also covers the standalone `ImageViewer`.

The original ten root variables already exist in published **0.1.0**. The additional tokens and complete palettes below describe **unreleased source changes**; npm 0.1.0 does not support them. Until a separate version is released, use a locally built archive from this source. See [installation and complete asset copying](../README.md#use-the-library-in-your-own-project). Never overwrite npm 0.1.0.

The published archive was inspected separately. Its original stylesheet has SHA-256 `db3e3e7a2ccc021887880cfaf38ab7c219fade050647f5a9d5d5afa769b9a8bd`; that is a release baseline, not the extended source stylesheet.

## Supported variables

The original ten defaults are declared directly on `.scanner`, the dialog root. Additional tokens use fallbacks at the element that consumes them, preserving the previous appearance when omitted. `theme` values are CSS strings: colors accept CSS colors, radius tokens accept lengths, font accepts a font-family list, overlays accept complete CSS background images, shadow tokens accept complete CSS shadow values or `none`, and spacing is a unitless factor. There is no runtime validation of individual CSS values.

### Original root variables (available in 0.1.0)

| Variable | Default | Meaning and scope |
| --- | --- | --- |
| `--scanner-background` | `#f4f6f2` | Main scanner and loading backgrounds. The mobile camera has its own background token. |
| `--scanner-surface` | `#fff` | General controls, footer, tools and page labels; standalone viewer controls also use it with a white fallback. |
| `--scanner-text` | `#172a22` | General scanner text, controls and viewer control labels. Camera, primary and warning text can be set independently in the extended source. |
| `--scanner-muted` | `#52675c` | Secondary labels, helper text and diagnostic badge. |
| `--scanner-accent` | `#176449` | Primary backgrounds/borders, selected controls, ranges, processing marks, corner-editor chrome and loupe border. Document pixels and profile sample art stay unchanged. |
| `--scanner-warning` | `#fff2d4` | Warning and camera-error backgrounds. Pair with `--scanner-warning-text` in a complete theme. |
| `--scanner-border` | `#ccd9cf` | General separators/borders; viewer control borders use the same fallback. Also the viewer's background fallback unless its own background is set. |
| `--scanner-focus` | `#995515` | Three-pixel keyboard-focus outlines. In the extended source, an explicit theme value also reaches the mobile camera unless `--scanner-camera-focus` is supplied. |
| `--scanner-radius` | `12px` | Main dialog corners on larger screens; mobile dialog and other UI groups have separate extended tokens. |
| `--scanner-font` | `system-ui, sans-serif` | Scanner font family. The extended source also lets the standalone viewer consume an inherited variable directly; 0.1.0 needs the host's actual `font-family` set. |

### Shared UI tokens (unreleased)

| Variable | Default / fallback | Meaning and scope |
| --- | --- | --- |
| `--scanner-backdrop` | `#14281fcc` | Viewport backdrop background. Theme values are forwarded to the backdrop as well as the dialog. |
| `--scanner-z-index` | `10000` | Backdrop stacking order. It remains a viewport overlay. |
| `--scanner-primary-text` | `#fff` | Foreground on accent-filled primary controls and capture page badge. Allows a light accent with a dark foreground. |
| `--scanner-warning-text` | General warning: `var(--scanner-text)`; camera: inherited text, or `#292518` in the mobile error panel | Foreground on warnings and camera errors. Set this explicitly with a custom warning background to keep every state consistent. |
| `--scanner-warning-border` | `#a37318` | Warning panel's leading edge. |
| `--scanner-control-radius` | `6px` general controls; `8px` viewer controls; `24px` mobile pills; `5px` page label | Radius of ordinary controls and small labels. Circular camera buttons/handles retain their shapes. |
| `--scanner-panel-shadow` | Existing per-consumer shadows: dialog `0 20px 90px #0003`; preview `0 3px 16px #0002`; processing `0 8px 28px #14281f26, inset 0 0 0 1px #ffffff60`; camera options `0 16px 48px #0005`; loupe `0 3px 16px #0004`; status `0 4px 16px #14281f20` | Complete CSS box-shadow for panels. One supplied shadow replaces the contextual fallbacks; use `none` to remove them. |
| `--scanner-control-shadow` | `none` for ordinary/viewer controls; mobile shutter `0 2px 18px #0003` | Complete CSS box-shadow for controls; selected-state rings remain state feedback. |
| `--scanner-panel-radius` | Existing per-panel `8px`, `10px`, `12px` or `16px` | Shared panel, menu, loupe and grouped-control corners. One supplied value replaces those per-consumer fallbacks. |
| `--scanner-viewer-radius` | `10px` | ImageViewer workspace corners. |
| `--scanner-mobile-radius` | `0px` | Dialog corners at `max-width: 700px` or `max-height: 500px`. |
| `--scanner-spacing` | `1` | Multiplier for UI padding, gaps and margins. Use a positive unitless number; it does not scale typography, document geometry, minimum hit areas, safe-area insets or the whole layout. |
| `--scanner-select-arrow` | `var(--scanner-muted, #52675c)` | Color of the workspace select caret, drawn by CSS gradients. |
| `--scanner-viewer-background` | Viewer: `var(--scanner-border, #e3e9df)`; other preview area: `#dce2db` | Background behind an image. Separate from the document's own pixels. |

### Camera tokens (unreleased)

The mobile camera presentation applies at `max-width: 700px` or `max-height: 500px`. Its image-preview background is also used on larger screens. Camera errors use the shared warning background/text pair rather than a second competing error palette.

| Variable | Default / fallback | Meaning and scope |
| --- | --- | --- |
| `--scanner-camera-background` | `#101813` | Mobile camera workspace background. |
| `--scanner-camera-preview` | `#16241d` | Space behind the proportional video/photo preview. |
| `--scanner-camera-text` | `#fff` | Mobile camera labels, icons, mode selector and options. |
| `--scanner-camera-text-shadow` | `0 1px 8px #0008` | Mobile camera title text-shadow; use `none` for flat text. |
| `--scanner-camera-flash` | `#fff` | Camera capture-flash overlay, without changing capture pixels. |
| `--scanner-camera-muted` | `#ffffffb3` | Mobile camera caption. |
| `--scanner-camera-focus` | Explicit `theme['--scanner-focus']`, otherwise `#a2ebc6` | Mobile camera focus. An explicit camera-focus wins over an explicit general focus. |
| `--scanner-camera-control` | `#16221c99` | Mobile camera icon-button surface. |
| `--scanner-camera-control-border` | `#ffffff35` | Mobile icon/options borders. |
| `--scanner-camera-hint` | `#16221cb3` | Mobile camera hint background. |
| `--scanner-camera-hint-border` | `#ffffff24` | Mobile camera hint border. |
| `--scanner-camera-mode-surface` | `#24382cd9` | Mobile mode-selector background. |
| `--scanner-camera-mode-border` | `#ffffff40` | Mobile mode-selector border. |
| `--scanner-camera-options` | `#18251ff5` | Mobile options-panel background. |
| `--scanner-camera-options-control` | `#2a3c32` | Controls inside the mobile options panel. |
| `--scanner-camera-selected` | `#204c3ed9` | Selected mobile camera control background. |
| `--scanner-camera-selected-text` | `#93efba` | Selected mobile camera control foreground. |
| `--scanner-camera-shutter` | `#fff` | Mobile shutter ring and center; its circular shape remains fixed. |
| `--scanner-camera-top-overlay` | `linear-gradient(#101813a8, #10181300)` | Complete background image behind mobile top controls. |
| `--scanner-camera-bottom-overlay` | `linear-gradient(#10181300, #101813d9 45%, #101813f2)` | Complete background image behind portrait camera controls. |
| `--scanner-camera-side-overlay` | `linear-gradient(90deg, #10181300, #101813d9)` | Complete background image behind compact landscape camera controls. |

### Capture feedback and corner loupe (unreleased)

| Variable | Default / fallback | Meaning and scope |
| --- | --- | --- |
| `--scanner-capture-outline` | `#fff` | Uncompleted live document outline. |
| `--scanner-capture-progress` | `#24d58a` | Live capture-progress contour. It does not change capture timing/evidence. |
| `--scanner-capture-fill` | `#24d58a0d` | Translucent live contour fill. |
| `--scanner-loupe-background` | `#f4f6f2` | Canvas background behind magnified corner pixels. |
| `--scanner-loupe-crosshair` | `#137458` | Canvas crosshair used to align corners. Document pixels remain untouched. |

`theme` is typed as ``Record<`--scanner-${string}`, string>``. The prefix permits names at the type level; it does not make arbitrary names functional. For example, `--scanner-button-text` has no consumer and changes nothing. The tables inventory actual CSS/component consumers. The internal camera-height calculation is not a supported theme control.

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

The complete example defines all 50 supported variables for each palette, including camera surfaces/overlays. The dark palette uses a light accent with an explicit dark `--scanner-primary-text`, and a dark warning surface with explicit light `--scanner-warning-text`. That warning pair applies in review and camera errors. No internal-selector overrides are needed. These complete palettes require the unreleased extension; validate the actual states and host combination you ship.

## CSS inheritance and priority

A custom property on an ancestor is inherited only when the descendant does not specify its own value. The stylesheet declares defaults on `.scanner`, so this alone does **not** replace those defaults:

```css
.host-shell {
  --scanner-accent: #1d4ed8;
}
```

`theme` writes inline custom properties on that same `.scanner` root. Normal inline values take precedence over normal stylesheet declarations there, so this is the supported per-instance route. In the extended source, the controller also forwards theme values to the backdrop, since CSS cannot inherit upward from the dialog to its parent. Camera focus uses the explicit camera-focus token first, then an explicit general focus, then its existing fallback. Values on a host ancestor alone still do not replace the original root defaults.

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

`ImageViewer` has no `theme` prop. It shares the stylesheet and inherits custom properties from its own host container because it is not a `.scanner` dialog. The complete example's `ThemedResult` sets theme variables on a bounded flex container. The extended viewer directly consumes `--scanner-font`:

```tsx
<div
  className="host-result-viewer"
  style={theme as CSSProperties}
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
}
```

The viewer consumes inherited `--scanner-font`, `--scanner-viewer-background`, `--scanner-viewer-radius`, `--scanner-control-radius`, `--scanner-panel-radius` and `--scanner-spacing`, as well as the original border/surface/text/focus variables. Other variables in the shared object do not acquire new viewer effects. With npm 0.1.0 only, set the host container's actual `font-family` and use the original four color/focus variables; the complete example targets the extended source. Pass an image `Blob`, a changed `resetKey` for a new page/rotation and optionally a geometrically matching `before` blob. The parent owns blobs; the viewer creates and revokes its preview URLs. See [viewer interaction and ownership](INTEGRATION.md#shared-react-image-viewer).

## Contrast, focus and scope

Check ordinary and muted text against their backgrounds, warning text against warning surfaces, accent-colored selected controls against their surfaces, and primary text against the accent. `--scanner-primary-text` separates primary foreground from selected accent-colored labels. Always set `--scanner-warning-text` when changing the warning surface: the explicit pair covers both review warnings and mobile camera errors. The complete dark example uses this supported pair rather than relying on a camera-specific fixed foreground.

Keep borders and disabled/selected states distinguishable; do not rely on color alone. Preserve visible keyboard focus and inspect rings against both light and dark neighbors, including viewer and mobile camera controls. Camera surfaces and overlays can be translucent over document/video pixels: test them against both bright and dark scenes. Check both locales, portrait/landscape, errors, corner editing, zoomed content and the actual host font. This guide does not establish assistive-technology or physical iPhone/Android acceptance.

The extended tokens cover theme colors, feedback, fonts, grouped radii and spacing without internal-selector overrides. Responsive layout, modal viewport positioning, fixed minimum control/handle sizes, typography sizes and circular shutter/handle geometry stay library-owned. Profile preview samples intentionally depict document/image processing and are not recolored as UI surfaces. Theme values never recolor exported document bytes. There is no headless, slot, externally controlled layout or storage API.

Use [existing public reference hosts](INTEGRATION.md) for full result galleries and download flows. Host-owned filename/download/storage/PWA/website behavior remains separate from the scanner UI.

## Verification scope

The original published 0.1.0 stylesheet is the release baseline. Extended-source tokens, public declarations, examples and rendered behavior are checked independently. The complete example is typechecked against the built public package. Rendered verification and the exact automated checks for this documentation are recorded in [verification status](testing/STATUS.md); source inspection alone is not a visual check.
