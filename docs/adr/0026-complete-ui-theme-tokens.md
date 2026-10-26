# 0026: Complete reusable UI theme tokens

Status: accepted, 27 October 2026.

## Context

The existing theme option leaves mobile camera colors/focus, primary foreground, backdrop, several chrome radii/spacing and standalone viewer font outside its working scope. In particular, a dark warning surface can conflict with fixed mobile error text. The requested resolution is to close these SDK gaps rather than require private host selectors or document-only workarounds.

## Decision

Keep the existing ten variables and their declared root defaults unchanged. Add real CSS/SVG/canvas consumers for the following tokens. Values are CSS strings; omitted additions use consumer fallbacks, retaining existing visuals. Both controller and React continue to use `ScannerOptions.theme`; no parallel settings/layout API is added.

| Token | Default / fallback | Scope |
| --- | --- | --- |
| `--scanner-backdrop` | `#14281fcc` | Owned modal backdrop background |
| `--scanner-z-index` | `10000` | Owned modal backdrop stacking |
| `--scanner-primary-text` | `#fff` | Primary buttons, filled orientation controls and camera page-count badge |
| `--scanner-warning-text` | General warning: root text; camera: inherited text on desktop, `#292518` on mobile | Warning/error foreground pair with existing `--scanner-warning` |
| `--scanner-warning-border` | `#a37318` | General warning edge |
| `--scanner-control-radius` | General controls `6px`, viewer buttons `8px`, camera pills `24px`, page label `5px` | Control chrome; zero/circular semantic shapes remain intentional |
| `--scanner-panel-radius` | Per panel `8px`, `10px`, `12px` or `16px` | Review/card/options/processing/loupe panels and grouped zoom controls |
| `--scanner-viewer-radius` | `10px` | Shared image viewer frame |
| `--scanner-mobile-radius` | `0px` | Main dialog at the mobile/short-screen breakpoint |
| `--scanner-spacing` | `1` | Unitless multiplier for chrome gap/padding/margins, not font or hit-target dimensions |
| `--scanner-viewer-background` | Shared viewer: existing border token, or standalone `#e3e9df`; legacy preview `#dce2db` | Image workspace |
| `--scanner-select-arrow` | Existing muted token or `#52675c` | Workspace select caret color |
| `--scanner-panel-shadow` | Per panel: existing dialog, preview, processing, options, loupe and status shadows | Shared panel shadow override |
| `--scanner-control-shadow` | `none`; mobile shutter `0 2px 18px #0003` | Buttons and standalone viewer controls |
| `--scanner-camera-text-shadow` | `0 1px 8px #0008` | Mobile camera title |
| `--scanner-camera-flash` | `#fff` | Secured-frame flash |
| `--scanner-camera-background` | `#101813` | Mobile camera workspace |
| `--scanner-camera-preview` | `#16241d` | Video canvas background |
| `--scanner-camera-text` | `white` | Mobile camera text and controls |
| `--scanner-camera-muted` | `#ffffffb3` | Mobile camera caption |
| `--scanner-camera-focus` | Explicit `theme['--scanner-focus']`, otherwise `#a2ebc6` | Mobile camera focus; explicit camera value wins |
| `--scanner-camera-control` | `#16221c99` | Mobile icon control surface |
| `--scanner-camera-control-border` | `#ffffff35` | Icon and camera-options control borders |
| `--scanner-camera-hint` | `#16221cb3` | Mobile hint surface |
| `--scanner-camera-hint-border` | `#ffffff24` | Mobile hint edge |
| `--scanner-camera-mode-surface` | `#24382cd9` | Mobile Auto/Manual select |
| `--scanner-camera-mode-border` | `#ffffff40` | Mobile Auto/Manual select edge |
| `--scanner-camera-options` | `#18251ff5` | Mobile options panel |
| `--scanner-camera-options-control` | `#2a3c32` | Mobile options buttons/selects |
| `--scanner-camera-selected` | `#204c3ed9` | Mobile selected light state surface |
| `--scanner-camera-selected-text` | `#93efba` | Mobile selected light state foreground |
| `--scanner-camera-shutter` | `white` | Mobile shutter border/fill |
| `--scanner-camera-top-overlay` | `linear-gradient(#101813a8, #10181300)` | Top control scrim |
| `--scanner-camera-bottom-overlay` | `linear-gradient(#10181300, #101813d9 45%, #101813f2)` | Portrait control scrim |
| `--scanner-camera-side-overlay` | `linear-gradient(90deg, #10181300, #101813d9)` | Short landscape control scrim |
| `--scanner-capture-outline` | `white` | Live contour base stroke |
| `--scanner-capture-progress` | `#24d58a` | Live measured-capture progress stroke |
| `--scanner-capture-fill` | `#24d58a0d` | Live contour fill |
| `--scanner-loupe-background` | `#f4f6f2` | Corner magnifier canvas padding |
| `--scanner-loupe-crosshair` | `#137458` | Corner magnifier crosshair |

Apply supplied theme variables to the owned backdrop before mounting React because the backdrop cannot inherit from its child dialog. The dialog still declares the original ten defaults and writes supplied theme values inline. Mobile camera focus mirrors an explicitly supplied global focus unless the host provides a more specific camera focus. Warning text is a direct shared consumer, with local default fallbacks. The standalone viewer consumes inherited `--scanner-font` with `inherit` fallback and needs no additional `theme` prop or font declaration.

Select carets consume `--scanner-select-arrow`, defaulting to the existing muted color. Document-profile illustration colors continue to represent Photo/Color/Grayscale/S/W content; document bytes are never recolored by a UI theme. Scaling spacing retains safe-area terms, fixed touch-target dimensions and the corner editor's minimum reserved handle space. Circular shutter/corner handles remain circular. Fixed modal positioning and source-image proportions are behavior rather than theming controls.

## Consequences

Hosts can supply full light/dark palettes and contrast pairs through one existing typed option. Existing integrations retain defaults. Options remain captured at opening; callback/session/camera ownership and SSR behavior are unchanged. Every new token has an actual consumer; arbitrary names allowed by the template-literal type still have no effect. This source extension is unreleased, does not overwrite npm 0.1.0, and introduces no release, host storage, download, PWA or private website code. T-38 records rendered regression coverage; physical-device/assistive-technology acceptance remains separate.
