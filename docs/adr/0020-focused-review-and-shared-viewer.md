# ADR 0020: Focused review, page tiles and a shared image viewer

Date: 2026-10-24. Status: accepted and implemented. Verification is recorded separately in [test status](../testing/STATUS.md). Supersedes the post-capture layout in ADR 0015 and the viewer interaction in ADR 0019. Camera detection and image-processing algorithms are unchanged.

## Context

Post-capture tools compete with the image on a phone. A full-page preview in the page manager duplicates the editing workspace. Long receipts become unreadable thumbnail strips. Saving a final page before visiting another overview introduces an unnecessary step.

## Decision

- Review has Previous, Next and Finish actions. Next is primary when a following page is available; otherwise it is disabled and Finish is primary. Finish accepts the current confirmed draft and exports directly. Unreviewed imported files must be processed and reviewed or explicitly discarded before finishing.
- A grid icon opens a bounded, independently scrollable page manager. Tiles are at least 120 by 156 CSS pixels; their top-left cover crop is only a preview. Exported pages keep their complete confirmed geometry. Page actions support editing, atomic replacement, removal and movement in both directions.
- Filter, adjustment, format, original and quality views hide unrelated review navigation and tools. Apply retains the current recipe; Cancel restores the previous edit settings from the original. Undo stores at most twelve recipes and geometry settings, without retaining extra preview blobs.
- Export `ImageViewer` from the React entry point. Review and the reference result dialog use it. Fit uses decoded image dimensions and measured available space. Tap or double tap toggles fit/100 percent once, magnifiers step through useful scales, pinch zoom anchors at the gesture midpoint, and enlarged images can be panned. A drag must not trigger a zoom toggle. Filter and tone changes retain zoom; page changes and rotations reset it.
- A split-image button shows the unoptimized crop only while held. It keeps the current geometry and zoom. Pointer release outside the button, cancellation, lost capture, keyboard release, blur and visibility changes clear the comparison.
- The corner editor uses a detached loupe drawn from original pixels. Top-left and bottom-right handles show it bottom-left; the other handles show it top-left. Keyboard editing remains available. Left-handed mapping and parallel edge handles remain deferred.
- Lens Auto displays its actual result within the selected button. Portrait and landscape share the same sheet icon, rotated 90 degrees. The postcard label is split as "Post-" / "karte", with 10 by 15 cm in its accessible name and tooltip. Rotation needs no toast.
- Reference results remain available when returning to the start screen. Discarding them is explicit. PDF.js loads only when PDF is selected, renders the requested page first, keeps at most three canvases and supports retry after a preview error.

## Consequences

The viewer adds a reusable React API without moving session or processing logic into the host. Touch, keyboard, cancellation, queued errors, both themes, long receipts and the actual exported artifacts need browser regression tests. Emulated mobile views do not replace physical iPhone/Android and assistive-technology acceptance.
