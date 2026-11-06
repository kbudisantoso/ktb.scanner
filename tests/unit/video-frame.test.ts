import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  capturePresentedFrame,
  VideoFrameIdentity,
} from '../../packages/scanner/src/video-frame.ts';

const presentation = (mediaTime = 10, frames = 1, width = 1280, height = 960) => ({
  mediaTime,
  frames,
  width,
  height,
});
function fakeVideo() {
  let callback: VideoFrameRequestCallback | undefined;
  let cancels = 0;
  const source = {
    readyState: 2,
    videoWidth: 1280,
    videoHeight: 960,
    currentTime: 10,
    requestVideoFrameCallback(value: VideoFrameRequestCallback) {
      callback = value;
      return 7;
    },
    cancelVideoFrameCallback(id: number) {
      assert.equal(id, 7);
      cancels++;
    },
  };
  return {
    source,
    video: source as unknown as HTMLVideoElement,
    fire(mediaTime = 10, presentedFrames = 1) {
      callback?.(12345, { mediaTime, presentedFrames } as VideoFrameCallbackMetadata);
    },
    get cancels() {
      return cancels;
    },
  };
}
function bitmap() {
  let closes = 0;
  return {
    image: {
      width: 800,
      height: 600,
      close: () => {
        closes++;
      },
    } as ImageBitmap,
    get closes() {
      return closes;
    },
  };
}

test('presentation identity rejects repeats and separates media seconds from the monotonic age clock', () => {
  const identity = new VideoFrameIdentity();
  assert.equal(identity.observe(presentation(10000), 500)?.timestamp, 500);
  assert.equal(identity.observe(presentation(10000), 1000), null);
  assert.equal(identity.observe(presentation(10000, 2), 1100)?.timestamp, 1100);
  assert.equal(identity.observe(presentation(10000, 2), 1150), null);
  assert.equal(identity.observe(presentation(10001, 3), 1200)?.timestamp, 1200);
  assert.equal(identity.observe(presentation(10002, 4), 1200), null);
  assert.equal(identity.observe(presentation(10002, 4), 1199), null);
  assert.equal(identity.observe(presentation(NaN, 4), 1300), null);
  assert.equal(identity.observe(presentation(10003, 4, 0), 1300), null);
});

test('media/counter rollback and intrinsic dimension changes create new frame generations', () => {
  const identity = new VideoFrameIdentity();
  const first = identity.observe(presentation(10, 100), 500)!;
  const rewind = identity.observe(presentation(1, 1), 600)!;
  assert.equal(rewind.generation, first.generation + 1);
  const format = identity.observe(presentation(2, 2, 960, 1280), 700)!;
  assert.equal(format.generation, rewind.generation + 1);
  assert.deepEqual(format.frameSize, { width: 960, height: 1280 });
  const counter = identity.observe(presentation(3, 1, 960, 1280), 800)!;
  assert.equal(counter.generation, format.generation + 1);
});

test('live zero media time accepts distinct presented frames and rejects a repeated counter', async () => {
  const video = fakeVideo(),
    identity = new VideoFrameIdentity();
  const accepted: boolean[] = [];
  const timestamps: number[] = [];
  let copies = 0,
    now = 500;
  for (const frames of [1, 2, 2, 3, 4]) {
    const pending = capturePresentedFrame(
      video.video,
      identity,
      new AbortController().signal,
      async () => {
        copies++;
        return bitmap().image;
      },
      () => now,
    );
    video.fire(0, frames);
    const frame = await pending;
    accepted.push(!!frame);
    if (frame) {
      timestamps.push(frame.timestamp);
      assert.equal(frame.generation, 0);
      frame.image.close();
    }
    now += 150;
  }
  assert.deepEqual(accepted, [true, true, false, true, true]);
  assert.deepEqual(timestamps, [500, 650, 950, 1100]);
  assert.equal(copies, 4);
});

test('unusable counters fall back to media time; acquiring a usable counter resets the generation', () => {
  const identity = new VideoFrameIdentity();
  const first = identity.observe(presentation(0, 0), 500)!;
  assert.equal(identity.observe(presentation(0, 0), 600), null);
  const counted = identity.observe(presentation(0, 1), 700)!;
  assert(counted);
  assert.equal(counted.generation, first.generation + 1);
  assert.equal(identity.observe(presentation(0, 2), 800)?.generation, counted.generation);
  assert.equal(identity.observe(presentation(1, 2), 900), null);
  const fallback = new VideoFrameIdentity();
  for (const [index, frames] of [NaN, -1, 1.5, Infinity, undefined].entries()) {
    const input = { ...presentation(index, 0), frames };
    assert(fallback.observe(input, 1000 + index));
    assert.equal(fallback.observe(input, 1100 + index), null);
  }
});

test('callback acquisition waits for an actual presentation and creates only one bounded bitmap', async () => {
  const video = fakeVideo(),
    image = bitmap();
  let copies = 0;
  const pending = capturePresentedFrame(
    video.video,
    new VideoFrameIdentity(),
    new AbortController().signal,
    async (source, options) => {
      assert.equal(source, video.video);
      assert.deepEqual(options, { resizeWidth: 800, resizeHeight: 600 });
      copies++;
      return image.image;
    },
    () => 500,
  );
  assert.equal(copies, 0);
  video.fire();
  const frame = await pending;
  assert.equal(copies, 1);
  assert.equal(frame?.timestamp, 500);
  assert.equal(frame?.image, image.image);
  assert.equal(image.closes, 0);
  frame?.image.close();
  assert.equal(image.closes, 1);
});

test('fallback uses advancing media evidence and never invents new frames from polling', async () => {
  const source = { readyState: 2, videoWidth: 640, videoHeight: 480, currentTime: 0 };
  const video = source as HTMLVideoElement,
    identity = new VideoFrameIdentity();
  let copies = 0,
    time = 500;
  const create = async (_video: HTMLVideoElement, options: ImageBitmapOptions) => {
    assert.deepEqual(options, { resizeWidth: 800, resizeHeight: 600 });
    copies++;
    return bitmap().image;
  };
  const capture = () =>
    capturePresentedFrame(video, identity, new AbortController().signal, create, () => time++);
  (await capture())?.image.close();
  for (let index = 0; index < 10; index++) assert.equal(await capture(), null);
  assert.equal(copies, 1);
  source.currentTime = 1 / 30;
  (await capture())?.image.close();
  assert.equal(copies, 2);
  Object.assign(source, { getVideoPlaybackQuality: () => ({ totalVideoFrames: 5 }) });
  source.currentTime = 2 / 30;
  (await capture())?.image.close();
  source.currentTime = 3 / 30;
  assert.equal(
    await capture(),
    null,
    'an unchanged known presentation count is not fresh evidence',
  );
});

test('abort cancels a pending callback and ignores even a late callback delivery', async () => {
  const video = fakeVideo(),
    abort = new AbortController();
  let copies = 0;
  const pending = capturePresentedFrame(
    video.video,
    new VideoFrameIdentity(),
    abort.signal,
    async () => {
      copies++;
      return bitmap().image;
    },
  );
  abort.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  video.fire();
  assert.equal(video.cancels, 1);
  assert.equal(copies, 0);
});

test('abort during asynchronous bitmap creation closes the late owned bitmap exactly once', async () => {
  const video = fakeVideo(),
    abort = new AbortController(),
    image = bitmap();
  let finish!: (image: ImageBitmap) => void;
  const pending = capturePresentedFrame(
    video.video,
    new VideoFrameIdentity(),
    abort.signal,
    () => new Promise((resolve) => (finish = resolve)),
  );
  video.fire();
  abort.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  finish(image.image);
  await Promise.resolve();
  assert.equal(image.closes, 1);
});

test('format invalidation releases a delayed bitmap instead of returning obsolete geometry', async () => {
  const video = fakeVideo(),
    identity = new VideoFrameIdentity(),
    image = bitmap();
  let finish!: (image: ImageBitmap) => void;
  const pending = capturePresentedFrame(
    video.video,
    identity,
    new AbortController().signal,
    () => new Promise((resolve) => (finish = resolve)),
  );
  video.fire();
  Object.assign(video.source, { videoWidth: 960, videoHeight: 1280 });
  identity.reset();
  finish(image.image);
  assert.equal(await pending, null);
  assert.equal(image.closes, 1);
});
