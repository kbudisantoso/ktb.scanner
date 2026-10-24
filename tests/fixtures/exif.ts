/** Insert a minimal little-endian TIFF Orientation tag into a synthetic JPEG. */
export function jpegWithOrientation(jpeg: Uint8Array, orientation: number): Uint8Array {
  if (jpeg[0] !== 255 || jpeg[1] !== 216 || orientation < 1 || orientation > 8)
    throw new Error('Invalid synthetic JPEG/orientation');
  const app = new Uint8Array(36);
  app.set([
    255,
    225,
    0,
    34,
    69,
    120,
    105,
    102,
    0,
    0,
    73,
    73,
    42,
    0,
    8,
    0,
    0,
    0,
    1,
    0,
    18,
    1,
    3,
    0,
    1,
    0,
    0,
    0,
    orientation,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ]);
  const result = new Uint8Array(jpeg.length + app.length);
  result.set(jpeg.subarray(0, 2));
  result.set(app, 2);
  result.set(jpeg.subarray(2), app.length + 2);
  return result;
}
