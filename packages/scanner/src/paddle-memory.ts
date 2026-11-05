import type { Size } from './types.ts';

const MIB = 1024 * 1024;
export const PADDLE_ENGINE_RESERVE_BYTES = 96 * MIB;
export const PADDLE_MAX_PIXELS = 8_000_000;
export const PADDLE_MAX_DIMENSION = 4096;
export const PADDLE_DETECTOR_SIDE = 960;

/** Estimated live buffers, not measured native/WASM memory or an allocation guarantee. */
export function paddleWorkingBytes(size: Size, encodedBytes = 0): number {
  // Eight RGBA-equivalent surfaces cover source/clone/crop/recognition staging.
  // The pinned runtime/model residency reserve remains across sequential pages.
  const pageBuffers = 32 * size.width * size.height;
  // Detection creates RGB float32 input and a separate batched CHW copy, even at batch1.
  const detectorTensors = 2 * 3 * Float32Array.BYTES_PER_ELEMENT * PADDLE_DETECTOR_SIDE ** 2;
  return Math.max(
    PADDLE_ENGINE_RESERVE_BYTES + pageBuffers + detectorTensors,
    PADDLE_ENGINE_RESERVE_BYTES + encodedBytes,
  );
}
