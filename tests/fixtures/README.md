# Synthetic image fixtures

`generate.ts` creates deterministic browser PNGs with known paper geometry, small digits, faint lines, colored marks, shadows, blur and long receipts. There is no random seed dependence, external font or personal data.

`calibration-*` is for tuning; `acceptance-*` must remain separate from threshold tuning. `paper` stores source-pixel x/y/width/height. Browser cases use the real engine. `exif.ts` adds synthetic JPEG orientation/mirror tags and tests unchanged original bytes/normalized dimensions. Projective fixtures have known destination corners. The clear perspective acceptance threshold is 16 source pixels maximum; a documented run measured at most 2.59 px. Real-camera content loss remains unmeasured. Separate unit fixtures measure local edge refinement.

Blur uses three fixed box-filter passes so WebKit's missing Canvas filter API does not affect that operation. Font rasterization still differs between browsers. Geometry/quality attachments and a separate 12 MP desktop run are documented in [measurements](../../docs/testing/MEASUREMENTS.md).

Synthetic images do not replace real phone cameras or faint thermal-print receipt inspection. Long-receipt viewer tests include 220 x 1,698 and 160 x 4,096 pixel images, with colored boundaries to verify proportional fit/pan/reset.

`high-resolution-48mp.jpg` is an 8,000 x 6,000 pixel synthetic image made here, with a paper boundary, four colored orientation marks and fictitious test print. It contains no photograph, personal data or external font file. `high-resolution-import.spec.ts` inserts EXIF 6/8 into these same bytes and checks full source geometry, bounded working/editor rasters, normalized crop editing and unchanged originals. Regenerate with `python3 tests/fixtures/generate-high-resolution.py` after installing Pillow; Pillow and Python are not needed to run the browser tests. The generator uses Pillow's bundled default font. Decoder observations verify requested/result bitmap sizes, not native codec peak memory or browser RSS.
