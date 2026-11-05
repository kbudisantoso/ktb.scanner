import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { OcrClient } from '../../packages/scanner/src/ocr-client.ts';
import { createSearchablePdf } from '../../packages/scanner/src/ocr.ts';
import { prepareOcrImage } from '../../packages/scanner/src/ocr-image.ts';
import { metadataFor } from '../../packages/scanner/src/session.ts';
import type { PageDraft, ScanPage } from '../../packages/scanner/src/types.ts';

type Message = {
  workerId: string;
  jobId: string;
  action: string;
  payload: Record<string, any>;
  id?: number;
  requestId?: number;
  pageId?: string;
  revision?: number;
  image?: Blob;
  workingBytes?: number;
};
class FakeWorker {
  static instances: FakeWorker[] = [];
  static onPost: ((worker: FakeWorker, message: Message) => void) | undefined;
  static events: string[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  messages: Message[] = [];
  transfers: Transferable[][] = [];
  terminated = 0;
  readonly url: URL;
  constructor(url: URL) {
    this.url = url;
    FakeWorker.instances.push(this);
    FakeWorker.events.push(`create:${url.pathname}`);
  }
  postMessage(message: Message, transfer: Transferable[] = []) {
    const snapshot = structuredClone(message, { transfer });
    this.messages.push(snapshot);
    this.transfers.push([...transfer]);
    FakeWorker.onPost?.(this, snapshot);
  }
  reply(status = 'resolve', data: unknown = {}, message = this.messages.at(-1)!) {
    this.onmessage?.({ data: structuredClone({ ...message, status, data }) });
  }
  terminate() {
    this.terminated++;
    FakeWorker.events.push(`terminate:${this.url.pathname}`);
  }
}
function png(width: number, height: number, length = 24) {
  const bytes = new Uint8Array(length);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return new Blob([bytes], { type: 'image/png' });
}
class FakeBitmap {
  width = 2;
  height = 2;
  closed = 0;
  close() {
    this.closed++;
  }
}
const raster = {
  decodeCalls: 0,
  canvases: [] as FakeCanvas[],
  decode: async (): Promise<FakeBitmap> => new FakeBitmap(),
  encode: async (canvas: FakeCanvas): Promise<Blob> => png(canvas.width, canvas.height),
};
class FakeCanvas {
  width: number;
  height: number;
  encodings = 0;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    raster.canvases.push(this);
  }
  getContext() {
    return { fillStyle: '', fillRect() {}, drawImage() {} };
  }
  convertToBlob() {
    this.encodings++;
    return raster.encode(this);
  }
}
const network = { fontFetches: 0 };
const globals = [
  'Worker',
  'document',
  'location',
  'createImageBitmap',
  'OffscreenCanvas',
  'fetch',
] as const;
const originals = globals.map(
  (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
);
beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.onPost = undefined;
  FakeWorker.events = [];
  raster.decodeCalls = 0;
  raster.canvases = [];
  raster.decode = async () => new FakeBitmap();
  raster.encode = async (canvas) => png(canvas.width, canvas.height);
  network.fontFetches = 0;
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: () => {
      raster.decodeCalls++;
      return raster.decode();
    },
  });
  Object.defineProperty(globalThis, 'OffscreenCanvas', { configurable: true, value: FakeCanvas });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { baseURI: 'http://localhost/' },
  });
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { origin: 'http://localhost' },
  });
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async () => {
      network.fontFetches++;
      const font = new Uint8Array(572);
      font[1] = 1;
      return new Response(font);
    },
  });
});
afterEach(() => {
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete (globalThis as any)[key];
  }
});
const options = () => ({
  assetBaseUrl: new URL('http://localhost/scanner-assets/ocr/'),
  languages: ['deu', 'eng'] as const,
});
async function initialize(client: OcrClient) {
  const pending = client.initialize();
  const worker = FakeWorker.instances.at(-1)!;
  for (const action of ['load', 'loadLanguage', 'initialize', 'setParameters']) {
    assert.equal(worker.messages.at(-1)?.action, action);
    worker.reply();
    await tick();
  }
  await pending;
  return worker;
}
const recognized = () => ({
  text: 'Grüße aus Köln',
  confidence: 94,
  pdf: new TextEncoder().encode('%PDF-1.7\n%%EOF'),
});
const recognizedPaddle = () => ({
  text: 'Grüße aus Köln',
  confidence: 92,
  width: 2,
  height: 2,
  lines: [
    {
      text: 'Grüße aus Köln',
      poly: [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ],
    },
  ],
});

function confirmedPage(id = 'confirmed', revision = 5, image = png(2, 2)): ScanPage {
  // Header validation is tested here; the browser case exercises real PNG decoding.
  const draft = {
    id,
    revision,
    source: 'file',
    original: image,
    size: { width: 2, height: 2 },
    corners: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    rotation: 0,
    format: { kind: 'standard', preset: 'A4', orientation: 'portrait', origin: 'user' },
    recipe: { version: 1, enhancement: 'none', dewarp: 'off' },
    quality: {
      state: 'completed',
      method: 'image-metrics',
      revision,
      assessment: 'no-warning',
      sharpness: 'sharp',
      reasons: [],
      regions: [],
    },
    preview: image,
    thumbnail: image,
    outputSize: { width: 2, height: 2 },
    edgesUncertain: false,
  } as PageDraft;
  return {
    id: draft.id,
    revision: draft.revision,
    image,
    metadata: metadataFor(draft, 'image/png'),
  };
}

function answerWorkers(result = recognized(), paddle = recognizedPaddle()) {
  FakeWorker.onPost = (worker, message) =>
    queueMicrotask(() => {
      if (worker.terminated) return;
      if (worker.url.pathname.endsWith('/ocr-pdf.worker.js'))
        worker.onmessage?.({
          data: {
            id: message.id,
            result: new Blob(['%PDF-1.7\n%%EOF'], { type: 'application/pdf' }),
          },
        });
      else if (worker.url.pathname.endsWith('/paddle.worker.js'))
        worker.onmessage?.({
          data: {
            requestId: message.requestId,
            action: message.action,
            pageId: message.pageId,
            revision: message.revision,
            type: 'result',
            result: message.action === 'initialize' ? { ready: true } : paddle,
          },
        });
      else worker.reply('resolve', message.action === 'recognize' ? result : {}, message);
    });
}

test('OCR is lazy, pre-abort allocates nothing and initialization uses only local uncached assets', async () => {
  const client = new OcrClient(options());
  assert.equal(FakeWorker.instances.length, 0);
  await assert.rejects(client.initialize(AbortSignal.abort()), { name: 'AbortError' });
  assert.equal(FakeWorker.instances.length, 0);
  const worker = await initialize(client);
  assert.equal(worker.url.href, 'http://localhost/scanner-assets/ocr/worker.min.js');
  assert.equal(
    worker.messages[0].payload.options.corePath,
    'http://localhost/scanner-assets/ocr/core/',
  );
  assert.deepEqual(worker.messages[1].payload, {
    langs: 'deu+eng',
    options: {
      langPath: 'http://localhost/scanner-assets/ocr/models/',
      gzip: false,
      cacheMethod: 'none',
      lstmOnly: true,
    },
  });
  await client.initialize();
  assert.deepEqual(worker.messages[3].payload, { params: { tessedit_pageseg_mode: '3' } });
  assert.equal(worker.messages.length, 4);
  client.destroy();
  client.destroy();
  assert.equal(worker.terminated, 1);
  await assert.rejects(client.initialize(), { code: 'SCANNER_DISPOSED' });
});

test('startup abort and language rejection terminate immediately and discard late progress', async () => {
  for (const stop of ['abort', 'language-reject'] as const) {
    let progress = 0;
    const client = new OcrClient({ ...options(), onProgress: () => progress++ });
    const abort = new AbortController();
    const pending = client.initialize(abort.signal);
    const rejected = assert.rejects(
      pending,
      stop === 'abort' ? { name: 'AbortError' } : { code: 'ENGINE_LOAD_FAILED' },
    );
    const worker = FakeWorker.instances.at(-1)!;
    if (stop === 'language-reject') {
      worker.reply();
      await tick();
      assert.equal(worker.messages.at(-1)?.action, 'loadLanguage');
    }
    const late = worker.onmessage!;
    const message = worker.messages.at(-1)!;
    if (stop === 'abort') abort.abort();
    else worker.reply('reject', 'missing local language model');
    await rejected;
    late({ data: { ...message, status: 'progress', data: { status: 'late', progress: 1 } } });
    assert.equal(progress, 0);
    assert.equal(worker.terminated, 1);
    assert.equal(worker.onmessage, null);
    assert.equal(worker.onerror, null);
    assert.equal(worker.onmessageerror, null);
    client.destroy();
  }
});

test('OCR matches every job identity, isolates callback failures and transfers the current encoded image', async () => {
  let progress = 0;
  const client = new OcrClient({
    ...options(),
    onProgress: () => {
      progress++;
      throw new Error('host progress callback');
    },
  });
  const worker = await initialize(client);
  const image = new Blob(['current confirmed revision'], { type: 'image/png' });
  const pending = client.recognize(image);
  await tick();
  const message = worker.messages.at(-1)!;
  assert.equal(message.action, 'recognize');
  assert.equal(new TextDecoder().decode(message.payload.image), 'current confirmed revision');
  assert.deepEqual(message.payload.options, {
    pdfTextOnly: true,
    rotateAuto: false,
    rotateRadians: 0,
  });
  assert.deepEqual(message.payload.output, { text: true, pdf: true });
  assert.equal(worker.transfers.at(-1)!.length, 1);
  assert.equal((worker.transfers.at(-1)![0] as ArrayBuffer).byteLength, 0);
  assert.notEqual(worker.transfers.at(-1)![0], message.payload.image.buffer);
  await assert.rejects(client.recognize(image), { code: 'SCANNER_BUSY' });
  for (const wrong of [{ jobId: 'old' }, { action: 'initialize' }, { workerId: 'foreign' }])
    worker.reply(
      'progress',
      { status: 'recognizing text', progress: 0.5 },
      { ...message, ...wrong },
    );
  for (const invalid of [NaN, -1, 1.1])
    worker.reply('progress', { status: 'recognizing text', progress: invalid });
  assert.equal(progress, 0);
  worker.reply('progress', { status: 'recognizing text', progress: 0.5 });
  assert.equal(progress, 1);
  worker.reply('resolve', recognized());
  assert.deepEqual(await pending, recognized());
  client.destroy();
  assert.equal(worker.terminated, 1);
});

test('aborting image preparation cannot post a late image or revive a destroyed OCR worker', async () => {
  const client = new OcrClient(options());
  const worker = await initialize(client);
  let release!: (bytes: ArrayBuffer) => void;
  const image = new Blob(['late']);
  image.arrayBuffer = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const abort = new AbortController();
  const pending = client.recognize(image, abort.signal);
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  abort.abort();
  await rejected;
  release(new ArrayBuffer(4));
  await tick();
  assert.equal(worker.messages.length, 4);
  assert.equal(worker.terminated, 1);
  client.destroy();
});

test('worker errors, malformed OCR output and timeouts settle jobs and release compute', async (context) => {
  for (const failure of ['error', 'messageerror', 'malformed'] as const) {
    const client = new OcrClient(options());
    const worker = await initialize(client);
    const pending = client.recognize(new Blob(['synthetic']));
    const rejected = assert.rejects(pending, { code: 'PROCESSING_FAILED' });
    await tick();
    if (failure === 'malformed') worker.reply('resolve', { ...recognized(), confidence: NaN });
    else if (failure === 'error') worker.onerror!();
    else worker.onmessageerror!();
    await rejected;
    assert.equal(worker.terminated, 1);
    client.destroy();
  }
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const client = new OcrClient(options());
  const pending = client.initialize();
  const rejected = assert.rejects(pending, { code: 'PROCESSING_TIMEOUT' });
  context.mock.timers.tick(180_000);
  await rejected;
  assert.equal(FakeWorker.instances.at(-1)!.terminated, 1);
  client.destroy();
});

test('public OCR validates options, identity, metadata and budgets before opening any worker', async () => {
  const base = { pages: [confirmedPage()], assetBaseUrl: '/scanner-assets/' };
  await assert.rejects(createSearchablePdf({ ...base, signal: AbortSignal.abort() }), {
    name: 'AbortError',
  });
  await assert.rejects(createSearchablePdf({ ...base, pages: [] }), { code: 'CONFIG_INVALID' });
  for (const languages of [[], ['fra']] as const)
    for (const engine of ['tesseract', 'paddle'] as const)
      await assert.rejects(createSearchablePdf({ ...base, engine, languages: languages as any }), {
        code: 'CONFIG_INVALID',
      });
  for (const engine of [null, '', 'PADDLE', 1])
    await assert.rejects(createSearchablePdf({ ...base, engine: engine as any }), {
      code: 'CONFIG_INVALID',
    });
  for (const previousPages of [null, {}, 'previous'])
    await assert.rejects(createSearchablePdf({ ...base, previousPages: previousPages as any }), {
      code: 'CONFIG_INVALID',
    });
  await assert.rejects(createSearchablePdf({ ...base, pages: [base.pages[0], base.pages[0]] }), {
    code: 'METADATA_INVALID',
  });
  const mismatched = confirmedPage();
  mismatched.metadata.outputSizePx.width = 3;
  await assert.rejects(createSearchablePdf({ ...base, pages: [mismatched] }), {
    code: 'METADATA_INVALID',
  });
  await assert.rejects(createSearchablePdf({ ...base, limits: { workingBytes: 1 } }), {
    code: 'LIMIT_EXCEEDED',
  });
  await assert.rejects(
    createSearchablePdf({ ...base, assetBaseUrl: 'https://other.test/assets/' }),
    { code: 'CONFIG_INVALID' },
  );
  assert.equal(FakeWorker.instances.length, 0);
});

test('public OCR snapshots confirmed order and revisions and terminates recognition before PDF assembly', async () => {
  answerWorkers();
  const page = confirmedPage();
  const pages = [page];
  const languages: ('deu' | 'eng')[] = ['deu', 'eng', 'deu'];
  const pending = createSearchablePdf({
    pages,
    assetBaseUrl: '/scanner-assets/',
    languages,
    onProgress: async () => {
      throw new Error('Rejected host observer');
    },
  });
  page.id = 'newer-host-page';
  page.revision = 6;
  page.metadata.outputLayoutMm.width = 100;
  pages.splice(0);
  languages.splice(0);
  const result = await pending;
  assert.deepEqual(result.pages, [
    { id: 'confirmed', revision: 5, text: 'Grüße aus Köln', confidence: 94 },
  ]);
  assert.equal(result.pdf.type, 'application/pdf');
  const [ocr, pdf] = FakeWorker.instances;
  assert.equal(ocr.messages[1].payload.langs, 'deu+eng');
  assert.equal((pdf.messages[0] as any).pages[0].metadata.outputLayoutMm.width, 210);
  assert(
    FakeWorker.events.indexOf('terminate:/scanner-assets/ocr/worker.min.js') <
      FakeWorker.events.indexOf('create:/scanner-assets/ocr-pdf.worker.js'),
  );
  assert(FakeWorker.instances.every((worker) => worker.terminated === 1));
});

test('OCR output budget failure discards partial layers and a subsequent invocation can succeed', async () => {
  answerWorkers({ ...recognized(), text: 'x'.repeat(200) });
  const options = {
    pages: [confirmedPage()],
    assetBaseUrl: '/scanner-assets/',
    limits: { resultBytes: 100 },
  };
  await assert.rejects(createSearchablePdf(options), { code: 'LIMIT_EXCEEDED' });
  assert.equal(FakeWorker.instances.length, 1);
  assert.equal(FakeWorker.instances[0].terminated, 1);
  answerWorkers();
  const result = await createSearchablePdf(options);
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0].revision, 5);
  assert(FakeWorker.instances.every((worker) => worker.terminated === 1));
});

test('OCR padding aborts decode and encoding promptly, closes late bitmaps and terminates recognition', async (context) => {
  for (const phase of ['decode', 'encode'] as const) {
    answerWorkers();
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const bitmap = new FakeBitmap();
    let releaseDecode!: (bitmap: FakeBitmap) => void;
    let releaseEncode!: (blob: Blob) => void;
    raster.decode =
      phase === 'decode'
        ? () =>
            new Promise((resolve) => {
              releaseDecode = resolve;
              started();
            })
        : async () => bitmap;
    raster.encode = () =>
      new Promise((resolve) => {
        releaseEncode = resolve;
        started();
      });
    const abort = new AbortController();
    const pending = createSearchablePdf({
      pages: [confirmedPage()],
      assetBaseUrl: '/scanner-assets/',
      signal: abort.signal,
    });
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    await entered;
    abort.abort();
    await rejected;
    assert(FakeWorker.instances.every((worker) => worker.terminated === 1));
    assert(
      FakeWorker.instances.every((worker) => worker.url.pathname.endsWith('/ocr/worker.min.js')),
    );
    if (phase === 'decode') releaseDecode(bitmap);
    else releaseEncode(png(22, 22));
    await tick();
    assert(bitmap.closed > 0);
    assert(raster.canvases.every((canvas) => canvas.width === 1 && canvas.height === 1));
    assert(
      FakeWorker.instances.every((worker) =>
        worker.messages.every((message) => message.action !== 'recognize'),
      ),
    );
  }
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let release!: (bitmap: FakeBitmap) => void;
  raster.decode = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const pending = prepareOcrImage(png(2, 2), { width: 2, height: 2 });
  const rejected = assert.rejects(pending, { code: 'PROCESSING_TIMEOUT' });
  context.mock.timers.tick(300_000);
  await rejected;
  const late = new FakeBitmap();
  release(late);
  await tick();
  assert(late.closed > 0);
});

test('OCR working limits include the border before decode and actual PNG bytes before recognition', async () => {
  const options = { pages: [confirmedPage()], assetBaseUrl: '/scanner-assets/' };
  const reserve = 64 * 1024 ** 2;
  await assert.rejects(
    createSearchablePdf({ ...options, limits: { workingBytes: reserve + 1000 } }),
    { code: 'LIMIT_EXCEEDED' },
  );
  assert.equal(raster.decodeCalls, 0);
  assert.equal(FakeWorker.instances.length, 0);
  answerWorkers();
  raster.encode = async (canvas) => png(canvas.width, canvas.height, 4096);
  await assert.rejects(
    createSearchablePdf({ ...options, limits: { workingBytes: reserve + 20_000 } }),
    { code: 'LIMIT_EXCEEDED' },
  );
  assert.equal(raster.decodeCalls, 1);
  assert.equal(raster.canvases[0].encodings, 1);
  assert.equal(raster.canvases[0].width, 1);
  assert.equal(raster.canvases[0].height, 1);
  assert.equal(FakeWorker.instances.length, 1);
  assert.equal(FakeWorker.instances[0].terminated, 1);
  assert(FakeWorker.instances[0].messages.every((message) => message.action !== 'recognize'));
});

test('Paddle keeps one warm worker for ordered final blobs and releases it before font/PDF assembly', async () => {
  answerWorkers();
  const pages = [confirmedPage('first', 3), confirmedPage('second', 7)];
  const result = await createSearchablePdf({
    pages,
    engine: 'paddle',
    languages: ['eng'],
    assetBaseUrl: '/scanner-assets/',
    onProgress: async () => {
      throw new Error('Rejected Paddle observer');
    },
  });
  assert.deepEqual(
    result.pages,
    pages.map((page) => ({
      id: page.id,
      revision: page.revision,
      text: 'Grüße aus Köln',
      confidence: 92,
    })),
  );
  const [ocr, pdf] = FakeWorker.instances;
  assert.equal(ocr.url.pathname, '/scanner-assets/paddle.worker.js');
  assert.deepEqual(
    ocr.messages.map((message) => message.action),
    ['initialize', 'recognize', 'recognize'],
  );
  assert.deepEqual(
    ocr.messages.slice(1).map((message) => [message.pageId, message.revision]),
    [
      ['first', 3],
      ['second', 7],
    ],
  );
  for (const message of ocr.messages.slice(1)) {
    assert.deepEqual(
      new Uint8Array(await message.image!.arrayBuffer()),
      new Uint8Array(await pages[0].image.arrayBuffer()),
    );
    assert(message.workingBytes! > 0);
  }
  assert.equal(raster.decodeCalls, 0, 'Paddle does not create a Tesseract-padded copy');
  assert.equal(network.fontFetches, 1);
  const packet = pdf.messages[0] as any;
  assert.deepEqual(
    packet.pages.map((page: any) => page.paddleText.imageSize),
    [
      { width: 2, height: 2 },
      { width: 2, height: 2 },
    ],
  );
  assert(packet.pages.every((page: any) => !('textPdf' in page)));
  assert.equal(packet.paddleFont.byteLength, 572);
  assert(
    FakeWorker.events.indexOf('terminate:/scanner-assets/paddle.worker.js') <
      FakeWorker.events.indexOf('create:/scanner-assets/ocr-pdf.worker.js'),
  );
  assert(FakeWorker.instances.every((worker) => worker.terminated === 1));
});

test('opt-in RAM reuse protects original results, reorders all pages and only recognizes new blobs', async () => {
  for (const engine of ['tesseract', 'paddle'] as const) {
    answerWorkers();
    const pages = [confirmedPage('first', 1), confirmedPage('second', 2)];
    const options = { pages, engine, assetBaseUrl: '/scanner-assets/' };
    const first = await createSearchablePdf({ ...options, previousPages: [] });
    first.pages[0].id = 'forged';
    first.pages[0].revision = 999;
    first.pages[0].text = 'forged host text';
    first.pages[0].confidence = NaN;
    const before = FakeWorker.instances.length,
      decodes = raster.decodeCalls;
    const reordered = await createSearchablePdf({
      ...options,
      pages: [pages[1], pages[0]],
      previousPages: first.pages,
      ...(engine === 'paddle' ? { languages: ['eng'] as const } : {}),
      // A cached PDF fits this budget; recognition's engine/raster estimate does not.
      limits: { workingBytes: 64 * 1024 ** 2 + (engine === 'paddle' ? 64_000 : 8000) },
    });
    assert.equal(FakeWorker.instances.length, before + 1, 'all hits create only the PDF worker');
    assert.equal(FakeWorker.instances.at(-1)!.url.pathname, '/scanner-assets/ocr-pdf.worker.js');
    assert.equal(raster.decodeCalls, decodes);
    assert.deepEqual(
      reordered.pages.map((page) => [page.id, page.revision, page.text, page.confidence]),
      [
        ['second', 2, 'Grüße aus Köln', engine === 'paddle' ? 92 : 94],
        ['first', 1, 'Grüße aus Köln', engine === 'paddle' ? 92 : 94],
      ],
    );
    const pdf = FakeWorker.instances.at(-1)!.messages[0] as any;
    assert.deepEqual(
      pdf.pages.map((page: any) => page.id),
      ['second', 'first'],
    );
    if (engine === 'tesseract') assert(pdf.pages.every((page: any) => page.textPdf.byteLength > 0));
    const replacement = { ...pages[0], image: new Blob([pages[0].image], { type: 'image/png' }) };
    const start = FakeWorker.instances.length;
    await createSearchablePdf({
      ...options,
      pages: [pages[1], replacement],
      previousPages: reordered.pages,
    });
    const fresh = FakeWorker.instances.slice(start);
    assert.equal(fresh.length, 2);
    assert.equal(fresh[0].messages.filter((message) => message.action === 'recognize').length, 1);
    const assembled = fresh[1].messages[0] as any;
    assert.equal(assembled.pages.length, 2);
    if (engine === 'tesseract')
      assert(assembled.pages.every((page: any) => page.textPdf.byteLength > 0));
    assert(fresh.every((worker) => worker.terminated === 1));
  }
});

test('reuse requires initial opt-in and original candidate/configuration identity', async () => {
  answerWorkers();
  const page = confirmedPage(),
    options = { pages: [page], assetBaseUrl: '/scanner-assets/' };
  const uncached = await createSearchablePdf(options);
  const start = FakeWorker.instances.length;
  const cached = await createSearchablePdf({ ...options, previousPages: uncached.pages });
  assert.equal(FakeWorker.instances.length, start + 2, 'default results retain no reusable layer');
  for (const changed of [
    { previousPages: cached.pages.map((entry) => ({ ...entry })) },
    { languages: ['eng', 'deu'] as const },
    { assetBaseUrl: '/other-assets/' },
    { engine: 'paddle' as const },
    { pages: [confirmedPage('different-id', page.revision, page.image)] },
    { pages: [confirmedPage(page.id, page.revision + 1, page.image)] },
  ]) {
    const before = FakeWorker.instances.length;
    await createSearchablePdf({ ...options, previousPages: cached.pages, ...changed });
    assert.equal(
      FakeWorker.instances.length,
      before + 2,
      'a mismatching cache candidate is a miss',
    );
  }
});

test('explicit previous owners count cached layers and unselected image blobs before compute', async () => {
  for (const large of ['image', 'layer'] as const) {
    const pdf = recognized().pdf;
    const largePdf = new Uint8Array(1_000_000);
    largePdf.set(pdf);
    answerWorkers(large === 'layer' ? { ...recognized(), pdf: largePdf } : recognized());
    const old = confirmedPage('old', 1, large === 'image' ? png(2, 2, 1_000_000) : png(2, 2));
    const cached = await createSearchablePdf({
      pages: [old],
      assetBaseUrl: '/scanner-assets/',
      previousPages: [],
    });
    const before = FakeWorker.instances.length;
    await assert.rejects(
      createSearchablePdf({
        pages: [confirmedPage('current')],
        assetBaseUrl: '/scanner-assets/',
        previousPages: cached.pages,
        limits: { workingBytes: 64 * 1024 ** 2 + 100_000 },
      }),
      { code: 'LIMIT_EXCEEDED' },
    );
    assert.equal(FakeWorker.instances.length, before);
  }
});

test('Paddle abort/failure after one page discards the batch and permits an explicit retry', async () => {
  for (const failure of ['abort', 'second-page-error'] as const) {
    answerWorkers();
    const answer = FakeWorker.onPost!;
    FakeWorker.onPost = (worker, message) => {
      if (failure === 'second-page-error' && message.pageId === 'second')
        queueMicrotask(() =>
          worker.onmessage?.({ data: { ...message, type: 'error', code: 'LIMIT_EXCEEDED' } }),
        );
      else answer(worker, message);
    };
    const abort = new AbortController(),
      start = FakeWorker.instances.length,
      fonts = network.fontFetches;
    await assert.rejects(
      createSearchablePdf({
        pages: [confirmedPage('first'), confirmedPage('second')],
        engine: 'paddle',
        assetBaseUrl: '/scanner-assets/',
        previousPages: [],
        signal: abort.signal,
        onProgress: (progress) => {
          if (
            failure === 'abort' &&
            progress.stage === 'recognizing' &&
            progress.page === 1 &&
            progress.progress === 1
          )
            abort.abort();
        },
      }),
      failure === 'abort' ? { name: 'AbortError' } : { code: 'LIMIT_EXCEEDED' },
    );
    const workers = FakeWorker.instances.slice(start);
    assert.equal(workers.length, 1);
    assert.equal(workers[0].url.pathname, '/scanner-assets/paddle.worker.js');
    assert.equal(workers[0].terminated, 1);
    assert.equal(network.fontFetches, fonts);
  }
  answerWorkers();
  assert.equal(
    (
      await createSearchablePdf({
        pages: [confirmedPage()],
        engine: 'paddle',
        assetBaseUrl: '/scanner-assets/',
      })
    ).pages.length,
    1,
  );
});
