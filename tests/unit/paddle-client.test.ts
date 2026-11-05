import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import {
  PaddleClient,
  type PaddleClientOptions,
  type PaddlePageInput,
  type PaddleRequest,
  type PaddleResult,
} from '../../packages/scanner/src/paddle-client.ts';

class FakeWorker {
  static instances: FakeWorker[] = [];
  static onPost: ((worker: FakeWorker, request: PaddleRequest) => void) | undefined;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  messages: PaddleRequest[] = [];
  terminated = 0;
  readonly url: URL;
  readonly options: WorkerOptions;
  constructor(url: URL, options: WorkerOptions) {
    this.url = url;
    this.options = options;
    FakeWorker.instances.push(this);
  }
  postMessage(request: PaddleRequest) {
    const snapshot = structuredClone(request);
    this.messages.push(snapshot);
    FakeWorker.onPost?.(this, snapshot);
  }
  send(message: Record<string, unknown>, request = this.messages.at(-1)!) {
    this.onmessage?.({ data: structuredClone({ ...request, ...message }) });
  }
  terminate() {
    this.terminated++;
  }
}

const globals = ['Worker', 'location', 'document', 'fetch', 'localStorage', 'indexedDB'] as const;
const originals = globals.map(
  (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
);
const clients: PaddleClient[] = [];
function setGlobal(key: (typeof globals)[number], value: unknown) {
  Object.defineProperty(globalThis, key, { configurable: true, value });
}
beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.onPost = undefined;
  setGlobal('Worker', FakeWorker);
  setGlobal('location', { origin: 'http://localhost' });
});
afterEach(() => {
  for (const client of clients.splice(0)) client.destroy();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

function client(options: Partial<PaddleClientOptions> = {}) {
  const instance = new PaddleClient({
    assetBaseUrl: new URL('http://localhost/scanner-assets/'),
    ...options,
  });
  clients.push(instance);
  return instance;
}
function page(id = 'first-page', revision = 3): PaddlePageInput {
  return {
    id,
    revision,
    image: new Blob(['synthetic confirmed image'], { type: 'image/png' }),
    workingBytes: 128 * 1024 * 1024,
  };
}
function recognized(): PaddleResult {
  return {
    text: 'Artikel Preis',
    confidence: 94,
    lines: [
      {
        text: 'Artikel',
        poly: [
          [10, 10],
          [40, 10],
          [40, 20],
          [10, 20],
        ],
      },
      {
        text: 'Preis',
        poly: [
          [60, 10],
          [90, 10],
          [90, 20],
          [60, 20],
        ],
      },
    ],
    width: 100,
    height: 100,
  };
}
async function initialize(instance: PaddleClient) {
  const pending = instance.initialize();
  const worker = FakeWorker.instances.at(-1)!;
  assert.equal(worker.messages.at(-1)?.action, 'initialize');
  worker.send({ type: 'result', result: { ready: true } });
  await pending;
  return worker;
}
function released(worker: FakeWorker) {
  assert.equal(worker.terminated, 1);
  assert.equal(worker.onmessage, null);
  assert.equal(worker.onerror, null);
  assert.equal(worker.onmessageerror, null);
}

test('Paddle import and construction need no browser resources; initialization is local and lazy', async () => {
  for (const key of globals) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      get() {
        assert.fail(`Unexpected browser resource access: ${key}`);
      },
    });
  }
  const moduleUrl = new URL('../../packages/scanner/src/paddle-client.ts', import.meta.url);
  moduleUrl.search = '?ssr-without-browser-resources';
  const imported = (await import(
    moduleUrl.href
  )) as typeof import('../../packages/scanner/src/paddle-client.ts');
  const instance = new imported.PaddleClient({
    assetBaseUrl: new URL('http://localhost/scanner-assets/'),
  });
  clients.push(instance);
  await assert.rejects(instance.initialize(AbortSignal.abort()), { name: 'AbortError' });
  assert.equal(FakeWorker.instances.length, 0);
  setGlobal('Worker', FakeWorker);
  setGlobal('location', { origin: 'http://localhost' });

  for (const assets of ['https://other.test/assets/', 'http://localhost/assets']) {
    await assert.rejects(client({ assetBaseUrl: new URL(assets) }).initialize(), {
      code: 'CONFIG_INVALID',
    });
  }
  assert.equal(FakeWorker.instances.length, 0);
  const worker = await initialize(instance);
  assert.equal(worker.url.href, 'http://localhost/scanner-assets/paddle.worker.js');
  assert.deepEqual(worker.options, { type: 'module' });
  assert.deepEqual(worker.messages, [
    {
      action: 'initialize',
      requestId: 1,
      assets: 'http://localhost/scanner-assets/ocr/paddle/',
    },
  ]);
  await instance.initialize();
  assert.equal(worker.messages.length, 1);
  instance.destroy();
  instance.destroy();
  released(worker);
  await assert.rejects(instance.initialize(), { code: 'SCANNER_DISPOSED' });
});

test('held Paddle startup aborts, times out or fails without retaining workers or late callbacks', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  for (const stop of [
    'abort',
    'timeout',
    'error',
    'onerror',
    'messageerror',
    'post',
    'ready',
  ] as const) {
    let progress = 0;
    const instance = client({ onProgress: () => progress++ });
    const abort = new AbortController();
    FakeWorker.onPost =
      stop === 'post'
        ? () => {
            throw new Error('Cannot post');
          }
        : undefined;
    const pending = instance.initialize(abort.signal);
    const rejected = assert.rejects(
      pending,
      stop === 'abort'
        ? { name: 'AbortError' }
        : { code: stop === 'timeout' ? 'PROCESSING_TIMEOUT' : 'ENGINE_LOAD_FAILED' },
    );
    const worker = FakeWorker.instances.at(-1)!;
    const request = worker.messages[0];
    const late = worker.onmessage;
    if (stop === 'abort') abort.abort();
    else if (stop === 'timeout') context.mock.timers.tick(180_000);
    else if (stop === 'error') worker.send({ type: 'error', code: 'untrusted-error' });
    else if (stop === 'onerror') worker.onerror!();
    else if (stop === 'messageerror') worker.onmessageerror!();
    else if (stop === 'ready') worker.send({ type: 'result', result: { ready: false } });
    await rejected;
    late?.({ data: { ...request, type: 'progress', status: 'loading', progress: 1 } });
    late?.({ data: { ...request, type: 'result', result: { ready: true } } });
    assert.equal(progress, 0);
    instance.destroy();
    released(worker);
  }
});

test('one warm Paddle worker handles two revisions, ignores stale replies and isolates busy calls and observers', async () => {
  const progress: unknown[] = [];
  const instance = client({
    onProgress: (event) => {
      progress.push(event);
      throw new Error('Host observer failed');
    },
  });
  const loading = instance.initialize();
  const worker = FakeWorker.instances[0];
  worker.send({ type: 'progress', status: 'loading', progress: 0 });
  worker.send({ type: 'result', result: { ready: true } });
  await loading;
  let previous = worker.messages[0];

  for (const input of [page(), page('second-page', 7)]) {
    const pending = instance.recognize(input);
    const request = worker.messages.at(-1)!;
    assert.equal(request.action, 'recognize');
    assert(request.requestId > previous.requestId);
    if (request.action !== 'recognize') assert.fail('Expected recognition request');
    assert.equal(request.pageId, input.id);
    assert.equal(request.revision, input.revision);
    assert.equal(request.workingBytes, input.workingBytes);
    assert.equal(await request.image.text(), await input.image.text());
    await assert.rejects(instance.initialize(), { code: 'SCANNER_BUSY' });
    await assert.rejects(instance.recognize(page(), AbortSignal.abort()), { code: 'SCANNER_BUSY' });
    const before = progress.length;
    worker.send({ type: 'result', result: recognized() }, previous);
    worker.send({ type: 'progress', status: 'recognizing', progress: 1 }, previous);
    await tick();
    assert.equal(progress.length, before);
    assert.equal(worker.terminated, 0);
    worker.send({ type: 'progress', status: 'recognizing', progress: 0 });
    worker.send({ type: 'progress', status: 'recognizing', progress: 1 });
    worker.send({ type: 'result', result: recognized() });
    const output = await pending;
    assert.equal(output.text, 'Artikel Preis');
    assert.deepEqual(
      output.lines.map((line) => line.text),
      ['Artikel', 'Preis'],
    );
    assert.deepEqual(
      output.lines.map((line) => line.poly[0]),
      [
        [10, 10],
        [60, 10],
      ],
    );
    previous = request;
    worker.send({ type: 'progress', status: 'recognizing', progress: 1 });
  }
  assert.deepEqual(progress, [
    { status: 'loading', progress: 0 },
    { status: 'recognizing', progress: 0 },
    { status: 'recognizing', progress: 1 },
    { status: 'recognizing', progress: 0 },
    { status: 'recognizing', progress: 1 },
  ]);
  assert.equal(FakeWorker.instances.length, 1);
  assert.equal(worker.messages.length, 3);
  instance.destroy();
  released(worker);
});

test('current Paddle responses reject wrong page identities, malformed geometry and unsupported progress', async () => {
  for (const fault of ['action', 'page', 'revision', 'geometry', 'progress', 'limit'] as const) {
    const instance = client();
    const worker = await initialize(instance);
    const pending = instance.recognize(page());
    const rejected = assert.rejects(pending, {
      code: fault === 'limit' ? 'LIMIT_EXCEEDED' : 'PROCESSING_FAILED',
    });
    const message: Record<string, unknown> = { type: 'result', result: recognized() };
    if (fault === 'action') message.action = 'initialize';
    else if (fault === 'page') message.pageId = 'other-page';
    else if (fault === 'revision') message.revision = 4;
    else if (fault === 'geometry') {
      const invalid = recognized();
      invalid.lines[0].poly = [
        [-1, 10],
        [40, 10],
        [40, 20],
        [10, 20],
      ];
      message.result = invalid;
    } else if (fault === 'progress') {
      Object.assign(message, { type: 'progress', status: 'recognizing', progress: 0.5 });
    } else Object.assign(message, { type: 'error', code: 'LIMIT_EXCEEDED' });
    worker.send(message);
    await rejected;
    instance.destroy();
    released(worker);
  }
});

test('Paddle page abort, between-page pre-abort, invalid input and timeout terminate the warm engine', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  for (const stop of ['abort', 'between-pages', 'invalid', 'timeout'] as const) {
    let progress = 0;
    const instance = client({ onProgress: () => progress++ });
    const worker = await initialize(instance);
    const first = instance.recognize(page());
    worker.send({ type: 'result', result: recognized() });
    await first;
    const abort = new AbortController();
    if (stop === 'between-pages') abort.abort();
    const before = worker.messages.length;
    const pending = instance.recognize(
      page('second-page', stop === 'invalid' ? 0 : 5),
      abort.signal,
    );
    const rejected = assert.rejects(
      pending,
      stop === 'timeout'
        ? { code: 'PROCESSING_TIMEOUT' }
        : stop === 'invalid'
          ? { code: 'CONFIG_INVALID' }
          : { name: 'AbortError' },
    );
    const request = worker.messages.at(-1)!;
    const late = worker.onmessage;
    if (stop === 'abort') abort.abort();
    else if (stop === 'timeout') context.mock.timers.tick(300_000);
    await rejected;
    late?.({ data: { ...request, type: 'progress', status: 'recognizing', progress: 1 } });
    late?.({ data: { ...request, type: 'result', result: recognized() } });
    assert.equal(progress, 0);
    assert.equal(worker.messages.length, before + (stop === 'abort' || stop === 'timeout' ? 1 : 0));
    instance.destroy();
    released(worker);
  }
});

test('reentrant Paddle observers and abort-listener registration cannot post or settle after destruction', async () => {
  for (const stop of ['observer-abort', 'observer-destroy', 'listener-destroy'] as const) {
    const abort = new AbortController();
    let callbacks = 0;
    let removals = 0;
    const instance = client({
      onProgress: () => {
        callbacks++;
        if (stop === 'observer-abort') abort.abort();
        else instance.destroy();
      },
    });
    const signal =
      stop === 'listener-destroy'
        ? ({
            aborted: false,
            addEventListener() {
              instance.destroy();
            },
            removeEventListener() {
              removals++;
            },
          } as unknown as AbortSignal)
        : abort.signal;
    const pending = instance.initialize(signal);
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    const worker = FakeWorker.instances.at(-1)!;
    const late = worker.onmessage;
    const request = worker.messages.at(-1);
    if (stop !== 'listener-destroy')
      worker.send({ type: 'progress', status: 'loading', progress: 0 });
    await rejected;
    late?.({ data: { ...request, type: 'progress', status: 'loading', progress: 1 } });
    late?.({ data: { ...request, type: 'result', result: { ready: true } } });
    assert.equal(callbacks, stop === 'listener-destroy' ? 0 : 1);
    assert.equal(worker.messages.length, stop === 'listener-destroy' ? 0 : 1);
    if (stop === 'listener-destroy') assert.equal(removals, 1);
    instance.destroy();
    instance.destroy();
    released(worker);
  }
});
