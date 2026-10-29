import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { OcrClient } from '../../packages/scanner/src/ocr-client.ts';
import { createSearchablePdf } from '../../packages/scanner/src/ocr.ts';
import { metadataFor } from '../../packages/scanner/src/session.ts';
import type { PageDraft, ScanPage } from '../../packages/scanner/src/types.ts';

type Message = {
  workerId: string;
  jobId: string;
  action: string;
  payload: Record<string, any>;
  id?: number;
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
const globals = ['Worker', 'document', 'location'] as const;
const originals = globals.map(
  (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
);
beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.onPost = undefined;
  FakeWorker.events = [];
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { baseURI: 'http://localhost/' },
  });
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { origin: 'http://localhost' },
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

function confirmedPage(): ScanPage {
  // Header validation is tested here; the browser case exercises real PNG decoding.
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 2);
  view.setUint32(20, 2);
  const image = new Blob([bytes], { type: 'image/png' });
  const draft = {
    id: 'confirmed',
    revision: 5,
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
      revision: 5,
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

function answerWorkers(result = recognized()) {
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
    await assert.rejects(createSearchablePdf({ ...base, languages: languages as any }), {
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
