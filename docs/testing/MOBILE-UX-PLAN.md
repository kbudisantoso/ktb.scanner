# Focused mobile review implementation

Updated 29 October 2026. The approved A2 workflow is implemented in the library and reference host. This supersedes the earlier stacked forms and single-page manager. [ADR 0020](../adr/0020-focused-review-and-shared-viewer.md) records the architecture; [test status](STATUS.md) separates verification from remaining device work.

## Review and navigation

1. Keep the image as the main workspace. Place the grid icon in the review header. Keep Previous, Next and Finish in the fixed footer. Next is primary with a following page; Finish is primary on the last page.
2. Finish directly from review. Never skip queued initial images or accept an unconfirmed crop. Processing failures preserve accepted pages and pending files; explicitly discarding remaining imports is a separate action.
3. Use a bounded scrolling tile grid for page management, without a second large preview. Give thumbnail buttons a minimum 120 by 156 pixel area. Cover from the top left so a long receipt retains readable detail; never apply this display crop to output files.
4. Retain editing, replacement, deletion and keyboard-accessible movement. Keep the previous page until a replacement is confirmed. Put replacement, direct discard and Add page below the document as equal-width mobile actions, with Add page on the right.

## Focused tools

Filter, Adjust, Format and Quality each use the available image workspace and relevant controls. Hide page navigation and unrelated tools. Editing tools provide Cancel and Apply; cancellation restores the pre-tool edit settings and history. Labelled Undo shares the existing Cancel/Apply footer and is limited to the current tool opening and twelve steps. Quality is read-only and closes with OK or Escape. Remove the main Undo/Original utility row and separate Original view; keep the full source in the corner editor and held Before for the current unoptimized crop. In the existing viewer control strip, center zoom between Before on the left and an information icon with a count on the right. Render the information icon only when hints exist, and restore focus after closing their view. These refinements are unreleased source (D-056); they add no public option.

- Filter: Auto, Photo, Color, Grayscale and Black-and-white. Auto chooses and applies a profile immediately. The actual Auto result appears with its selected button. There is no additional optimization-reset action.
- Adjust: one active group for brightness, contrast, sharpness or lens correction. Lens Off/Auto/Manual buttons show the actual automatic result within Auto, without a separate status row. Neutral-reset icons sit beside the selected slider and are enabled only when its value differs from the neutral default; preserve other settings.
- Format: eight presets, matching portrait/landscape sheet icons and receipt widths. The postcard is 100 by 150 mm; the German compact label is "Post-" / "karte".
- Corners: direct 48 pixel handles and keyboard nudging, no keypad. Place the magnifier away from a right-handed dragging finger: TL/BR to bottom-left, TR/BL to top-left. Edge grips and left-handed mode remain future work.

## Shared viewer and results

Use the public React `ImageViewer` for review tools and result inspection. Tap/double tap switches fit/100 percent; magnifier controls use useful steps, pinch zooms continuously and panning is available when enlarged. Preserve position across filter/tone changes. Reset fit on page changes and rotation. Hold the floating split-image button for the unoptimized crop; release, cancellation and blur restore the current result. No rotation toast.

Results retain their blobs on return to the start screen and expose an explicit discard action. Load PDF.js only on demand, render the selected page first, bound its canvas cache to three pages and keep downloads available after preview errors. Diagnostics remain off by default in both library and reference host.

## Verification

Check 320 x 568, 390 x 664 and 844 x 390 in both themes across Chromium, Firefox and WebKit, including mobile WebKit. Measure target sizes, clipping and reachable fixed actions. Tiles, enlarged images and technical details intentionally allow internal movement/scrolling.

Exercise cancellation/undo against actual image bytes, native pinch, hold release outside the button, corner-loupe placement, twenty-page scrolling, queued-limit failures, direct finish, original-byte preservation, output ordering, independently rendered PDF and real downloads. Keep all sound tests physically muted. Run library and both host builds, core/SSR/browser checks, typecheck, formatting, document links and diff checks. Record physical camera and VoiceOver work separately.

## Design references

The interaction principles were informed by official [Scanner Pro editing](https://support.readdle.com/scannerpro/enhance-and-edit-your-scans/edit-options-in-scanner-pro), [Scanner Pro filters](https://support.readdle.com/scannerpro/enhance-and-edit-your-scans/choose-a-filter), [Adobe Scan editing](https://www.adobe.com/devnet-docs/adobescan/ios/en/modify.html) and [Genius Scan crop/rotate](https://help.geniusscan.com/document-management/viewing-and-editing-documents/edit-crop-and-rotate-a-scan) documentation. No vendor screenshots or implementation code are distributed.
