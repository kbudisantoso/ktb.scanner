import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import {
  readImageSource,
  decodeImageSource,
  type ImageSourceInfo,
} from '../../packages/scanner/src/image-source.ts';

const encoder = new TextEncoder();
function tiff(orientation: number, little = true, prefix = false): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(26);
  bytes.set(encoder.encode(little ? 'II' : 'MM'));
  const view = new DataView(bytes.buffer);
  view.setUint16(2, 42, little);
  view.setUint32(4, 8, little);
  view.setUint16(8, 1, little);
  view.setUint16(10, 274, little);
  view.setUint16(12, 3, little);
  view.setUint32(14, 1, little);
  view.setUint16(18, orientation, little);
  if (!prefix) return bytes;
  const result = new Uint8Array(bytes.length + 6);
  result.set(encoder.encode('Exif\0\0'));
  result.set(bytes, 6);
  return result;
}
function jpegSegment(marker: number, payload: Uint8Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(payload.length + 4);
  bytes.set([255, marker]);
  new DataView(bytes.buffer).setUint16(2, payload.length + 2);
  bytes.set(payload, 4);
  return bytes;
}
function jpeg(exif = tiff(1, true, true), extra: BlobPart[] = []): Blob {
  return new Blob([
    new Uint8Array([255, 216]),
    ...extra,
    jpegSegment(225, exif),
    jpegSegment(192, new Uint8Array([8, 0, 200, 1, 44, 1])),
    new Uint8Array([255, 217]),
  ]);
}
function pngChunk(tag: string, payload: Uint8Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(payload.length + 12);
  new DataView(bytes.buffer).setUint32(0, payload.length);
  bytes.set(encoder.encode(tag), 4);
  bytes.set(payload, 8);
  return bytes;
}
function png(exif?: Uint8Array, dataBytes = 0): Blob {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, 300);
  view.setUint32(4, 200);
  ihdr.set([8, 2], 8);
  return new Blob(
    [
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      pngChunk('IHDR', ihdr),
      pngChunk('IDAT', new Uint8Array(dataBytes)),
      ...(exif ? [pngChunk('eXIf', exif)] : []),
      pngChunk('IEND', new Uint8Array()),
    ],
    { type: 'image/jpeg' },
  );
}
function webpChunk(tag: string, payload: Uint8Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(payload.length + 8 + (payload.length % 2));
  bytes.set(encoder.encode(tag));
  new DataView(bytes.buffer).setUint32(4, payload.length, true);
  bytes.set(payload, 8);
  return bytes;
}
function webp(exif: Uint8Array, dataBytes = 0): Blob {
  const vp8x = new Uint8Array(10);
  vp8x.set([43, 1, 0, 199, 0, 0], 4);
  const chunks = [
    webpChunk('VP8X', vp8x),
    webpChunk('JUNK', new Uint8Array(dataBytes)),
    webpChunk('EXIF', exif),
  ];
  const prefix = new Uint8Array(12);
  prefix.set(encoder.encode('RIFF'));
  prefix.set(encoder.encode('WEBP'), 8);
  new DataView(prefix.buffer).setUint32(4, 4 + chunks.reduce((n, c) => n + c.length, 0), true);
  return new Blob([prefix, ...chunks]);
}
function observeReads(blob: Blob) {
  const reads: [number, number][] = [];
  const slice = blob.slice.bind(blob);
  blob.arrayBuffer = async () => assert.fail('The complete source must never be read');
  blob.slice = (start = 0, end = blob.size, type?: string) => {
    reads.push([start, end]);
    return slice(start, end, type);
  };
  return reads;
}

test('image sources use signatures and both TIFF byte orders, retaining all eight orientations', async () => {
  for (let orientation = 1; orientation <= 8; orientation++) {
    const info = await readImageSource(jpeg(tiff(orientation, orientation % 2 === 0, true)));
    assert.deepEqual(info, {
      mime: 'image/jpeg',
      encodedSize: { width: 300, height: 200 },
      size: orientation >= 5 ? { width: 200, height: 300 } : { width: 300, height: 200 },
      orientation,
    });
  }
  for (const source of [png(tiff(6, false)), webp(tiff(8)), webp(tiff(8, false, true))]) {
    const before = await source.arrayBuffer();
    const info = await readImageSource(source);
    assert.equal(info.mime, source.type === 'image/jpeg' ? 'image/png' : 'image/webp');
    assert.deepEqual(info.size, { width: 200, height: 300 });
    assert.deepEqual(await source.arrayBuffer(), before);
  }
  for (const invalid of [tiff(0), tiff(9)]) {
    const info = await readImageSource(png(invalid));
    assert.equal(info.orientation, 1);
    assert.deepEqual(info.size, { width: 300, height: 200 });
  }
});

test('large image payloads are skipped and EXIF plus all header slices stay within 1 MiB', async () => {
  for (const source of [png(tiff(6), 4 * 1024 * 1024), webp(tiff(6), 4 * 1024 * 1024)]) {
    const reads = observeReads(source);
    const info = await readImageSource(source);
    assert.equal(info.orientation, 6);
    assert(reads.every(([start, end]) => end - start <= 32));
    assert(reads.reduce((n, [start, end]) => n + end - start, 0) < 256);
  }
  const sparseExif = new Uint8Array(2 * 1024 * 1024);
  const ifd = 1_100_000;
  sparseExif.set(tiff(6).subarray(0, 8));
  new DataView(sparseExif.buffer).setUint32(4, ifd, true);
  sparseExif.set(tiff(6).subarray(8), ifd);
  for (const source of [png(sparseExif), webp(sparseExif)]) {
    const reads = observeReads(source);
    const info = await readImageSource(source);
    assert.equal(info.orientation, 6);
    assert.deepEqual(info.size, { width: 200, height: 300 });
    assert(reads.some(([start]) => start >= ifd));
    assert(reads.every(([start, end]) => end - start <= 32));
    assert(reads.reduce((n, [start, end]) => n + end - start, 0) < 256);
  }
  const jpegSource = jpeg(tiff(6, true, true), [
    jpegSegment(226, new Uint8Array(60_000)),
    jpegSegment(225, encoder.encode('http://ns.adobe.com/xap/1.0/')),
  ]);
  const jpegReads = observeReads(jpegSource);
  assert.equal((await readImageSource(jpegSource)).orientation, 6);
  assert(jpegReads.every(([start, end]) => end - start <= 32));
});

test('truncated chunks, oversized length fields and invalid source geometry fail before decoding', async () => {
  const brokenPng = new Uint8Array(await png().arrayBuffer());
  new DataView(brokenPng.buffer).setUint32(33, 0xffffffff);
  const brokenWebp = new Uint8Array(await webp(tiff(6)).arrayBuffer());
  new DataView(brokenWebp.buffer).setUint32(16, 0xffffffff, true);
  const brokenJpeg = new Uint8Array(await jpeg().arrayBuffer());
  new DataView(brokenJpeg.buffer).setUint16(4, 0xffff);
  const zeroPng = new Uint8Array(await png().arrayBuffer());
  new DataView(zeroPng.buffer).setUint32(16, 0);
  const hugePng = new Uint8Array(await png().arrayBuffer());
  new DataView(hugePng.buffer).setUint32(16, 0xffffffff);
  new DataView(hugePng.buffer).setUint32(20, 0xffffffff);
  for (const bytes of [brokenPng, brokenWebp, brokenJpeg, zeroPng, hugePng, new Uint8Array(32)]) {
    await assert.rejects(readImageSource(new Blob([bytes], { type: 'image/png' })), {
      code: 'FILE_UNSUPPORTED',
    });
  }
  for (const source of [
    png(new Uint8Array([73, 73, 42, 0, 255, 255, 255, 255])),
    webp(tiff(6).subarray(0, 20)),
  ]) {
    await assert.rejects(readImageSource(source), { code: 'FILE_UNSUPPORTED' });
  }
  const afterFrameExif = (padding: Uint8Array<ArrayBuffer>) =>
    new Blob([
      new Uint8Array([255, 216]),
      jpegSegment(192, new Uint8Array([8, 0, 200, 1, 44, 1])),
      padding,
      jpegSegment(225, tiff(6, true, true)),
      new Uint8Array([255, 218]),
    ]);
  assert.equal((await readImageSource(afterFrameExif(new Uint8Array(4).fill(255)))).orientation, 6);
  const standaloneMarkers = new Uint8Array(8192);
  for (let i = 0; i < standaloneMarkers.length; i += 2) standaloneMarkers.set([255, 1], i);
  for (const padding of [new Uint8Array(4096).fill(255), standaloneMarkers]) {
    await assert.rejects(readImageSource(afterFrameExif(padding)), { code: 'FILE_UNSUPPORTED' });
  }
});

test('header reads honor pre-abort and abort promptly while a slice read is still pending', async () => {
  const source = png();
  const reads = observeReads(source);
  await assert.rejects(readImageSource(source, AbortSignal.abort()), { name: 'AbortError' });
  assert.equal(reads.length, 0);
  let release!: (bytes: ArrayBuffer) => void;
  source.slice = () =>
    ({
      arrayBuffer: () =>
        new Promise<ArrayBuffer>((resolve) => {
          release = resolve;
        }),
    }) as Blob;
  const abort = new AbortController();
  const rejected = assert.rejects(readImageSource(source, abort.signal), { name: 'AbortError' });
  abort.abort();
  await rejected;
  release(new ArrayBuffer(32));
  await tick();
});

const originalDecode = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
afterEach(() => {
  if (originalDecode) Object.defineProperty(globalThis, 'createImageBitmap', originalDecode);
  else Reflect.deleteProperty(globalThis, 'createImageBitmap');
});
class Bitmap {
  width: number;
  height: number;
  closed = 0;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  close() {
    this.closed++;
  }
}
function decoder(decode: (blob: Blob, options: ImageBitmapOptions) => Promise<Bitmap>) {
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: decode });
}
const orientedInfo: ImageSourceInfo = {
  mime: 'image/jpeg',
  encodedSize: { width: 300, height: 200 },
  size: { width: 200, height: 300 },
  orientation: 6,
};

test('decoding preserves full-size behavior or requests oriented high-quality bounds and correct MIME', async () => {
  const source = new Blob(['original encoded bytes'], { type: 'application/octet-stream' });
  const calls: ImageBitmapOptions[] = [];
  decoder(async (blob, options) => {
    assert.equal(blob.type, 'image/jpeg');
    assert.equal(await blob.text(), await source.text());
    calls.push(options);
    return new Bitmap(options.resizeWidth ?? 200, options.resizeHeight ?? 300);
  });
  const full = await decodeImageSource(source, orientedInfo, orientedInfo.size);
  const bounded = await decodeImageSource(source, orientedInfo, { width: 100, height: 150 });
  assert.deepEqual(calls, [
    { imageOrientation: 'from-image' },
    { imageOrientation: 'from-image', resizeWidth: 100, resizeHeight: 150, resizeQuality: 'high' },
  ]);
  assert.deepEqual({ width: bounded.width, height: bounded.height }, { width: 100, height: 150 });
  for (const size of [
    { width: 0, height: 150 },
    { width: NaN, height: 150 },
    { width: 201, height: 300 },
  ]) {
    await assert.rejects(decodeImageSource(source, orientedInfo, size), { code: 'LIMIT_EXCEEDED' });
  }
  await assert.rejects(
    decodeImageSource(source, orientedInfo, orientedInfo.size, AbortSignal.abort()),
    {
      name: 'AbortError',
    },
  );
  assert.equal(calls.length, 2);
  full.close();
  bounded.close();
});

test('cancelled native decodes close late bitmaps exactly once; wrong dimensions are never returned', async () => {
  let release!: (bitmap: Bitmap) => void;
  decoder(
    () =>
      new Promise<Bitmap>((resolve) => {
        release = resolve;
      }),
  );
  const abort = new AbortController();
  const source = new Blob(['synthetic']);
  const rejected = assert.rejects(
    decodeImageSource(source, orientedInfo, orientedInfo.size, abort.signal),
    {
      name: 'AbortError',
    },
  );
  abort.abort();
  await rejected;
  const late = new Bitmap(200, 300);
  release(late);
  await tick();
  assert.equal(late.closed, 1);
  abort.abort();
  assert.equal(late.closed, 1);
  const delivered = new Bitmap(200, 300);
  const justAborted = new AbortController();
  decoder(async () => delivered);
  const deliveredThenAborted = assert.rejects(
    decodeImageSource(source, orientedInfo, orientedInfo.size, justAborted.signal),
    { name: 'AbortError' },
  );
  queueMicrotask(() => justAborted.abort());
  await deliveredThenAborted;
  assert.equal(delivered.closed, 1);
  const wrong = new Bitmap(300, 200);
  decoder(async () => wrong);
  await assert.rejects(decodeImageSource(source, orientedInfo, orientedInfo.size), {
    code: 'PROCESSING_FAILED',
  });
  assert.equal(wrong.closed, 1);
  decoder(async () => {
    throw new Error('Native decoder failed');
  });
  await assert.rejects(
    decodeImageSource(source, orientedInfo, orientedInfo.size),
    /Native decoder failed/,
  );
});
