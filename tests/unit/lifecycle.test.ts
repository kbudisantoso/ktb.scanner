import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkerClient } from '../../packages/scanner/src/worker-client.ts';
import { Camera } from '../../packages/scanner/src/camera.ts';
import { createScanicAdapter } from '../../packages/scanner/src/scanic.ts';
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;
  message: any;
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(message: unknown) {
    this.message = message;
  }
  terminate() {
    this.terminated = true;
  }
  respond(result: unknown) {
    this.onmessage?.({ data: { id: this.message.id, result } });
  }
}
(globalThis as any).Worker = FakeWorker;
test('worker refuses parallel jobs and cleans listeners after reply', async () => {
  const client = new WorkerClient(new URL('http://localhost/worker.js'));
  const first = client.run({ kind: 'test' });
  await assert.rejects(client.run({ kind: 'test' }), { code: 'SCANNER_BUSY' });
  const worker = FakeWorker.instances.at(-1)!;
  worker.respond('ok');
  assert.equal(await first, 'ok');
  assert.equal(worker.onmessage, null);
  client.destroy();
  assert.equal(worker.terminated, true);
});
test('abort terminates compute and permits a fresh worker', async () => {
  const client = new WorkerClient(new URL('http://localhost/worker.js'));
  const abort = new AbortController();
  const promise = client.run({}, [], abort.signal);
  const first = FakeWorker.instances.at(-1)!;
  abort.abort();
  await assert.rejects(promise, { name: 'AbortError' });
  assert.equal(first.terminated, true);
  const next = client.run({});
  FakeWorker.instances.at(-1)!.respond(2);
  assert.equal(await next, 2);
  client.destroy();
});
test('destroy is idempotent and rejects pending and future operations', async () => {
  const client = new WorkerClient(new URL('http://localhost/worker.js'));
  const pending = client.run({});
  client.destroy();
  client.destroy();
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(client.run({}), { code: 'SCANNER_DISPOSED' });
});
test('timeout actually terminates the worker', async () => {
  const client = new WorkerClient(new URL('http://localhost/worker.js'));
  await assert.rejects(client.run({}, [], undefined, 5), { code: 'PROCESSING_TIMEOUT' });
  assert.equal(FakeWorker.instances.at(-1)!.terminated, true);
  client.destroy();
});
test('late camera permission stops every track after cancellation', async () => {
  let resolve!: (stream: unknown) => void,
    stopped = 0;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: () =>
          new Promise((r) => {
            resolve = r;
          }),
      },
    },
  });
  const camera = new Camera(),
    abort = new AbortController();
  const pending = camera.start({ play: async () => {} } as HTMLVideoElement, abort.signal);
  abort.abort();
  resolve({ getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }] });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(stopped, 2);
});
test('camera request never includes microphone and requests rear camera', async () => {
  let constraints: any,
    stopped = 0;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async (value: unknown) => {
          constraints = value;
          return { getTracks: () => [{ stop: () => stopped++ }] };
        },
      },
    },
  });
  const camera = new Camera();
  await camera.start({ play: async () => {} } as HTMLVideoElement, new AbortController().signal);
  assert.equal(constraints.audio, false);
  assert.equal(constraints.video.facingMode.ideal, 'environment');
  camera.stop();
  assert.equal(stopped, 1);
});

test('a superseded permission response cannot stop the newer camera stream', async () => {
  const requests: ((stream: unknown) => void)[] = [];
  let firstStops = 0,
    secondStops = 0;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: { getUserMedia: () => new Promise((resolve) => requests.push(resolve)) },
    },
  });
  const camera = new Camera(),
    video = { play: async () => {} } as HTMLVideoElement;
  const first = camera.start(video, new AbortController().signal);
  const second = camera.start(video, new AbortController().signal, 'second');
  requests[1]({ getTracks: () => [{ stop: () => secondStops++ }] });
  await second;
  requests[0]({ getTracks: () => [{ stop: () => firstStops++ }] });
  await assert.rejects(first, { name: 'AbortError' });
  assert.equal(firstStops, 1);
  assert.equal(secondStops, 0);
  camera.stop();
  assert.equal(secondStops, 1);
});

test('continuous focus is optional and a failed focus request keeps the camera usable', async () => {
  for (const fails of [false, true]) {
    let applied: unknown,
      played = false;
    const track = {
      stop: () => {},
      getCapabilities: () => ({ focusMode: ['manual', 'continuous'] }),
      applyConstraints: async (value: unknown) => {
        applied = value;
        if (fails) throw new Error('unsupported by device');
      },
    };
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia: async () => ({ getVideoTracks: () => [track], getTracks: () => [track] }),
        },
      },
    });
    const camera = new Camera();
    await camera.start(
      {
        play: async () => {
          played = true;
        },
      } as HTMLVideoElement,
      new AbortController().signal,
    );
    assert.deepEqual(applied, { advanced: [{ focusMode: 'continuous' }] });
    assert(played);
    camera.stop();
  }
});
test('torch controls require advertised support and late changes cannot apply to a restarted camera', async () => {
  let supported = false,
    finish: () => void = () => {};
  const applied: unknown[] = [];
  const track = {
    stop: () => {},
    getCapabilities: () => ({ torch: supported }),
    applyConstraints: (constraints: unknown) => {
      applied.push(constraints);
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    },
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async () => ({ getVideoTracks: () => [track], getTracks: () => [track] }),
      },
    },
  });
  const camera = new Camera();
  await camera.start({ play: async () => {} } as HTMLVideoElement, new AbortController().signal);
  assert.equal(camera.supportsTorch, false);
  await assert.rejects(camera.setTorch(true), { code: 'CAMERA_UNAVAILABLE' });
  supported = true;
  const first = camera.setTorch(true);
  finish();
  assert.equal(await first, true);
  assert.deepEqual(applied[0], { advanced: [{ torch: true }] });
  const late = camera.setTorch(false);
  camera.stop();
  finish();
  assert.equal(await late, false);
  assert.equal(camera.supportsTorch, false);
});

test('worker diagnostic stages neither finish the job nor detach abort handling', async () => {
  const client = new WorkerClient(new URL('http://localhost/worker.js'));
  const abort = new AbortController();
  let stages = 0;
  const pending = client.run({}, [], abort.signal, 60_000, () => {
    stages++;
    throw new Error('host callback');
  });
  const worker = FakeWorker.instances.at(-1)!;
  worker.onmessage?.({ data: { id: worker.message.id, diagnostic: { type: 'stage', data: {} } } });
  assert.equal(stages, 1);
  assert.notEqual(worker.onmessage, null);
  await assert.rejects(client.run({}), { code: 'SCANNER_BUSY' });
  abort.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(worker.terminated, true);
  client.destroy();
});
test('stopping diagnostic detail recording never changes the selected detector path', async () => {
  Object.assign(globalThis, {
    document: { baseURI: 'http://localhost/' },
    location: { origin: 'http://localhost' },
  });
  const adapter = createScanicAdapter('/assets', {
    engineBuffers: true,
    isActive: (kind) => !['detect', 'buffers'].includes(kind ?? ''),
    onEvent: () => {},
  });
  const image = { close: () => {} } as ImageBitmap;
  const pending = adapter.detect(image, 1);
  const worker = FakeWorker.instances.at(-1)!;
  assert.equal(worker.message.engineBuffers, true);
  assert.equal(worker.message.includeEngineBuffers, false);
  assert.equal(worker.message.trace, false);
  worker.respond({ timestamp: 1, corners: null, sharpness: 'unknown' });
  await pending;
  adapter.destroy();
});

test('capture callback cancellation rejects the secured frame and always releases its canvas', async (context) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  context.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete (globalThis as any).document;
  });
  for (const cancelAt of ['shutter', 'details'] as const) {
    const abort = new AbortController();
    let encodings = 0,
      details = 0;
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => {} }),
      toBlob: (done: (blob: Blob) => void) => {
        encodings++;
        done(new Blob(['encoded-frame']));
      },
    };
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { createElement: () => canvas },
    });
    const track = { readyState: 'live', stop: () => {} };
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia: async () => ({ getVideoTracks: () => [track], getTracks: () => [track] }),
        },
      },
    });
    const camera = new Camera(),
      video = { videoWidth: 600, videoHeight: 800, play: async () => {} } as HTMLVideoElement;
    await camera.start(video, abort.signal);
    await assert.rejects(
      camera.capture(
        video,
        { inputPixels: 1_000_000 } as any,
        abort.signal,
        () => {
          details++;
          if (cancelAt === 'details') abort.abort();
        },
        () => {
          if (cancelAt === 'shutter') abort.abort();
        },
      ),
      { name: 'AbortError' },
    );
    assert.equal(encodings, cancelAt === 'shutter' ? 0 : 1);
    assert.equal(details, cancelAt === 'shutter' ? 0 : 1);
    assert.equal(canvas.width, 1);
    assert.equal(canvas.height, 1);
    camera.stop();
  }
});
