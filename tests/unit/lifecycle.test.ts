import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { WorkerClient } from '../../packages/scanner/src/worker-client.ts';
import { Camera, type CaptureDetails } from '../../packages/scanner/src/camera.ts';
import { DEFAULT_LIMITS } from '../../packages/scanner/src/session.ts';
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
        { ...DEFAULT_LIMITS, inputPixels: 1_000_000 },
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

function nativePng(width = 3000, height = 4000, length = 32) {
  const bytes = new Uint8Array(length);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return { blob: new Blob([bytes], { type: 'application/octet-stream' }), bytes };
}

function cameraFixture(context: TestContext) {
  const keys = ['document', 'navigator', 'ImageCapture'] as const;
  const previous = keys.map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  const track = () => ({
    readyState: 'live',
    stops: 0,
    stop() {
      this.stops++;
      this.readyState = 'ended';
    },
  });
  const state = {
    camera: new Camera(),
    video: { videoWidth: 600, videoHeight: 800, play: async () => {} } as HTMLVideoElement,
    track: track(),
    requests: 0,
    events: [] as string[],
    encodings: 0,
    holdEncoding: false,
    releaseEncoding: undefined as ((blob: Blob) => void) | undefined,
    canvases: [] as { width: number; height: number }[],
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => {
        const canvas = {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: () => state.events.push('draw') }),
          toBlob: (done: (blob: Blob) => void) => {
            state.events.push('encode');
            state.encodings++;
            if (state.holdEncoding) state.releaseEncoding = done;
            else done(new Blob(['encoded-frame']));
          },
        };
        state.canvases.push(canvas);
        return canvas;
      },
    },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async () => {
          state.requests++;
          const current = state.track;
          return { getVideoTracks: () => [current], getTracks: () => [current] };
        },
      },
    },
  });
  setNativePhoto(undefined);
  context.after(() => {
    state.camera.stop();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  return {
    restart: async () => {
      state.track = track();
      await state.camera.start(state.video, new AbortController().signal);
      return state.track;
    },
    state,
  };
}
function setNativePhoto(value: unknown) {
  Object.defineProperty(globalThis, 'ImageCapture', { configurable: true, value });
}

test('native photo preserves its bytes and encoded geometry after one synchronous shutter', async (context) => {
  const { state } = cameraFixture(context);
  await state.camera.start(state.video, new AbortController().signal);
  let finish!: (blob: Blob) => void;
  setNativePhoto(
    class {
      constructor(track: unknown) {
        assert.equal(track, state.track);
      }
      takePhoto() {
        state.events.push('native');
        return new Promise<Blob>((resolve) => {
          finish = resolve;
        });
      }
    },
  );
  const shutter: CaptureDetails[] = [],
    details: CaptureDetails[] = [];
  await assert.rejects(state.camera.capture(state.video, DEFAULT_LIMITS, AbortSignal.abort()), {
    name: 'AbortError',
  });
  assert.equal(state.canvases.length, 0);
  const pending = state.camera.capture(
    state.video,
    DEFAULT_LIMITS,
    new AbortController().signal,
    (value) => {
      details.push(value);
      throw new Error('Observer failed');
    },
    (value) => {
      state.events.push('shutter');
      shutter.push(value);
      throw new Error('Cue failed');
    },
  );
  assert.deepEqual(state.events, ['draw', 'shutter', 'native']);
  assert.equal(state.encodings, 0);
  await assert.rejects(
    state.camera.capture(state.video, DEFAULT_LIMITS, new AbortController().signal),
    {
      code: 'SCANNER_BUSY',
    },
  );
  const { blob, bytes } = nativePng(3000, 4000, 2 * 1024 * 1024);
  const reads: [number, number][] = [];
  const slice = blob.slice.bind(blob);
  blob.slice = (start = 0, end = blob.size) => {
    reads.push([start, end]);
    return slice(start, end);
  };
  blob.arrayBuffer = async () => assert.fail('Only bounded header slices may be read');
  finish(blob);
  const result = await pending;
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), bytes);
  assert.equal(result.type, 'image/png');
  assert.equal(details.length, 1);
  assert.equal(shutter.length, 1);
  assert.equal(shutter[0].method, 'video-frame');
  assert.equal(details[0].method, 'photo');
  assert.equal(details[0].photoAttempted, true);
  assert.equal(details[0].sizeCoordinateSpace, 'encoded-photo');
  assert.deepEqual(details[0].size, { width: 3000, height: 4000 });
  assert.equal(details[0].capturedAtMs, shutter[0].capturedAtMs);
  assert(details[0].nativeRequestedAtMs! >= details[0].capturedAtMs);
  assert(details[0].nativeCompletedAtMs! >= details[0].nativeRequestedAtMs!);
  assert.deepEqual(reads, [[0, 1024 * 1024]]);
  assert.equal(state.encodings, 0);
  assert.equal(state.requests, 1);
  assert(state.canvases.every((canvas) => canvas.width === 1 && canvas.height === 1));
});

test('unsupported or unsuitable native photos use the secured frame and honor every source budget', async (context) => {
  const { state } = cameraFixture(context);
  await state.camera.start(state.video, new AbortController().signal);
  for (const failure of [
    'unsupported',
    'constructor',
    'reject',
    'invalid',
    'pixels',
    'file',
    'original',
    'memory',
  ] as const) {
    let attempts = 0,
      headerReads = 0,
      shutters = 0;
    const photo =
      failure === 'invalid'
        ? new Blob(['not-an-image'])
        : nativePng(
            failure === 'pixels' ? 6000 : 3000,
            failure === 'pixels' ? 6000 : 4000,
            failure === 'memory' ? 2_000_000 : 32,
          ).blob;
    const slice = photo.slice.bind(photo);
    photo.slice = (...args) => {
      headerReads++;
      return slice(...args);
    };
    setNativePhoto(
      failure === 'unsupported'
        ? undefined
        : class {
            constructor() {
              if (failure === 'constructor') throw new Error('No photo support');
            }
            async takePhoto() {
              attempts++;
              if (failure === 'reject') throw new Error('Native photo failed');
              return photo;
            }
          },
    );
    const limits = {
      ...DEFAULT_LIMITS,
      ...(failure === 'file' ? { fileBytes: 20 } : {}),
      ...(failure === 'original' ? { originalBytes: 20 } : {}),
      ...(failure === 'memory' ? { workingBytes: 4_000_000 } : {}),
    };
    let details!: CaptureDetails;
    const before = state.encodings;
    const result = await state.camera.capture(
      state.video,
      limits,
      new AbortController().signal,
      (value) => {
        details = value;
      },
      () => {
        shutters++;
      },
    );
    assert.equal(await result.text(), 'encoded-frame');
    assert.equal(details.method, 'video-frame');
    assert.equal(details.photoAttempted, !['unsupported', 'constructor'].includes(failure));
    assert.equal(attempts, ['unsupported', 'constructor'].includes(failure) ? 0 : 1);
    assert.equal(shutters, 1);
    assert.equal(state.encodings, before + 1);
    if (['file', 'original', 'memory'].includes(failure)) assert.equal(headerReads, 0);
  }
  const allocated = state.canvases.length;
  await assert.rejects(
    state.camera.capture(
      state.video,
      { ...DEFAULT_LIMITS, workingBytes: 3_839_999 },
      new AbortController().signal,
    ),
    { code: 'LIMIT_EXCEEDED' },
  );
  assert.equal(state.canvases.length, allocated);
  assert(state.canvases.every((canvas) => canvas.width === 1 && canvas.height === 1));
});

test('native photo timeout, cancellation and restart cannot settle late or overlap native jobs on one track', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { state, restart } = cameraFixture(context);
  await state.camera.start(state.video, new AbortController().signal);
  const hardware: { resolve: (blob: Blob) => void; reject: (error: unknown) => void }[] = [];
  setNativePhoto(
    class {
      takePhoto() {
        return new Promise<Blob>((resolve, reject) => {
          hardware.push({ resolve, reject });
        });
      }
    },
  );
  const details: CaptureDetails[] = [];
  let shutters = 0;
  const capture = (signal = new AbortController().signal) =>
    state.camera.capture(
      state.video,
      DEFAULT_LIMITS,
      signal,
      (value) => {
        details.push(value);
      },
      () => {
        shutters++;
      },
    );
  const first = capture();
  context.mock.timers.tick(1999);
  assert.equal(state.encodings, 0);
  context.mock.timers.tick(1);
  assert.equal(await (await first).text(), 'encoded-frame');
  assert.equal(details[0].photoAttempted, true);
  assert.equal(state.camera.photoPending, true);
  assert.equal(await (await capture()).text(), 'encoded-frame');
  assert.equal(hardware.length, 1);
  assert.equal(state.camera.photoPending, true);
  hardware[0].reject(new Error('Late native rejection'));
  await tick();
  assert.equal(details.length, 2);
  assert.equal(state.camera.photoPending, false);
  for (const stop of ['abort', 'restart'] as const) {
    const abort = new AbortController();
    const pending = capture(abort.signal);
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    const current = hardware.at(-1)!;
    if (stop === 'abort') abort.abort();
    else {
      await restart();
      assert.equal(state.camera.photoPending, false);
    }
    await rejected;
    assert.equal(details.length, 2);
    assert(state.canvases.every((canvas) => canvas.width === 1 && canvas.height === 1));
    current.resolve(nativePng().blob);
    await tick();
    assert.equal(details.length, 2);
  }
  const fresh = capture();
  hardware.at(-1)!.resolve(nativePng().blob);
  assert.equal((await fresh).type, 'image/png');
  assert.equal(details.length, 3);
  assert.equal(shutters, 5);
  const heldHeader = nativePng();
  let releaseHeader!: (bytes: ArrayBuffer) => void;
  heldHeader.blob.slice = () =>
    ({
      arrayBuffer: () =>
        new Promise<ArrayBuffer>((resolve) => {
          releaseHeader = resolve;
        }),
    }) as Blob;
  const validating = capture();
  hardware.at(-1)!.resolve(heldHeader.blob);
  await tick();
  context.mock.timers.tick(2000);
  assert.equal(await (await validating).text(), 'encoded-frame');
  assert.equal(details.length, 4);
  releaseHeader(heldHeader.bytes.buffer);
  await tick();
  assert.equal(details.length, 4);
  setNativePhoto(undefined);
  state.holdEncoding = true;
  const encoding = capture();
  const rejected = assert.rejects(encoding, { name: 'AbortError' });
  await tick();
  const release = state.releaseEncoding!;
  state.camera.stop();
  await rejected;
  release(new Blob(['late encoding']));
  await tick();
  assert.equal(details.length, 4);
  assert(state.canvases.every((canvas) => canvas.width === 1 && canvas.height === 1));
});
