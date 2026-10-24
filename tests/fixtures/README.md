# Synthetic image fixtures

`generate.ts` creates deterministic browser PNGs with known paper geometry, small digits, faint lines, colored marks, shadows, blur and long receipts. There is no random seed dependence, external font or personal data.

`calibration-*` is for tuning; `acceptance-*` must remain separate from threshold tuning. `paper` stores source-pixel x/y/width/height. Browser cases use the real engine. `exif.ts` adds synthetic JPEG orientation/mirror tags and tests unchanged original bytes/normalized dimensions. Projective fixtures have known destination corners. The clear perspective acceptance threshold is 16 source pixels maximum; a documented run measured at most 2.59 px. Real-camera content loss remains unmeasured. Separate unit fixtures measure local edge refinement.

Blur uses three fixed box-filter passes so WebKit's missing Canvas filter API does not affect that operation. Font rasterization still differs between browsers. Geometry/quality attachments and a separate 12 MP desktop run are documented in [measurements](../../docs/testing/MEASUREMENTS.md).

Synthetic images do not replace real phone cameras or faint thermal-print receipt inspection. Long-receipt viewer tests include 220 x 1,698 and 160 x 4,096 pixel images, with colored boundaries to verify proportional fit/pan/reset.
