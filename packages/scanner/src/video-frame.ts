import type { Size } from './types.ts';

type Presentation = Size & { mediaTime: number; frames?: number };
export type FrameObservation = { timestamp: number; frameSize: Size; generation: number };

/** Media identity is not the monotonic observation clock used for evidence age. */
export class VideoFrameIdentity {
  private previous: Presentation | undefined;
  private clock = -Infinity;
  private revision = 0;
  get generation(): number {
    return this.revision;
  }
  reset(): void {
    this.previous = undefined;
    this.revision++;
  }
  observe(presentation: Presentation, now: number): FrameObservation | null {
    if (
      !Number.isFinite(now) ||
      now <= this.clock ||
      !Number.isFinite(presentation.mediaTime) ||
      presentation.mediaTime < 0 ||
      !Number.isSafeInteger(presentation.width) ||
      !Number.isSafeInteger(presentation.height) ||
      presentation.width <= 0 ||
      presentation.height <= 0
    )
      return null;
    const previous = this.previous;
    const frames =
      Number.isSafeInteger(presentation.frames) &&
      presentation.frames! >= 0 &&
      (presentation.frames! > 0 || previous?.frames !== undefined)
        ? presentation.frames
        : undefined;
    const changed =
      previous &&
      (presentation.width !== previous.width ||
        presentation.height !== previous.height ||
        presentation.mediaTime < previous.mediaTime ||
        (frames !== undefined && previous.frames === undefined) ||
        (frames !== undefined && previous.frames !== undefined && frames < previous.frames));
    if (changed) this.reset();
    else if (
      previous &&
      // Live streams may keep mediaTime at zero; their presented-frame counter identifies progress.
      (frames !== undefined && previous.frames !== undefined
        ? frames <= previous.frames
        : presentation.mediaTime <= previous.mediaTime)
    )
      return null;
    this.previous = { ...presentation, frames };
    this.clock = now;
    return {
      timestamp: now,
      frameSize: { width: presentation.width, height: presentation.height },
      generation: this.revision,
    };
  }
}

type CapturedFrame = FrameObservation & { image: ImageBitmap };
type BitmapFactory = (video: HTMLVideoElement, options: ImageBitmapOptions) => Promise<ImageBitmap>;

/** Capture inside the presentation callback; a missing callback never becomes timer evidence. */
export function capturePresentedFrame(
  video: HTMLVideoElement,
  identity: VideoFrameIdentity,
  signal: AbortSignal,
  bitmap: BitmapFactory = (video, options) => createImageBitmap(video, options),
  clock: () => number = () => performance.now(),
): Promise<CapturedFrame | null> {
  return new Promise((resolve, reject) => {
    let done = false;
    let callback: number | undefined;
    const cleanup = () => {
      signal.removeEventListener('abort', cancel);
      if (callback !== undefined) {
        try {
          video.cancelVideoFrameCallback?.(callback);
        } catch {
          // The done guard still rejects callbacks from an interrupted presentation source.
        }
      }
      callback = undefined;
    };
    const finish = (frame: CapturedFrame | null) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(frame);
    };
    const fail = (error: unknown) => {
      if (done) return;
      done = true;
      cleanup();
      reject(error);
    };
    const cancel = () => fail(new DOMException('Abgebrochen', 'AbortError'));
    const acquire = (metadata?: VideoFrameCallbackMetadata) => {
      callback = undefined;
      if (done || signal.aborted) return cancel();
      if (video.readyState < 2) return finish(null);
      let frames = metadata?.presentedFrames;
      if (!metadata) {
        try {
          frames = video.getVideoPlaybackQuality?.().totalVideoFrames;
        } catch {
          // Older cameras can still expose their advancing media clock.
        }
      }
      const observation = identity.observe(
        {
          width: video.videoWidth,
          height: video.videoHeight,
          mediaTime: metadata?.mediaTime ?? video.currentTime,
          frames,
        },
        clock(),
      );
      if (!observation) return finish(null);
      const size = observation.frameSize;
      const scale = 800 / Math.max(size.width, size.height);
      let pending: Promise<ImageBitmap>;
      try {
        pending = bitmap(video, {
          resizeWidth: Math.max(1, Math.round(size.width * scale)),
          resizeHeight: Math.max(1, Math.round(size.height * scale)),
        });
      } catch (error) {
        fail(error);
        return;
      }
      void pending.then((image) => {
        if (
          done ||
          signal.aborted ||
          identity.generation !== observation.generation ||
          video.videoWidth !== size.width ||
          video.videoHeight !== size.height
        ) {
          image.close();
          if (!done) finish(null);
          return;
        }
        finish({ ...observation, image });
      }, fail);
    };
    if (signal.aborted) return cancel();
    signal.addEventListener('abort', cancel, { once: true });
    if (typeof video.requestVideoFrameCallback === 'function') {
      try {
        callback = video.requestVideoFrameCallback((_now, metadata) => acquire(metadata));
      } catch {
        acquire();
      }
    } else acquire();
  });
}
