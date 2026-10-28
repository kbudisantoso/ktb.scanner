import { area, quadDrift, validQuad } from './geometry.ts';
import type { Quad, Size } from './types.ts';

/** Internal 8 x 8 descriptor, never a retained source frame or public event payload. */
export type CaptureFingerprint = readonly number[];

export function sampleFingerprintFromPixels(
  image: Size & { data: Uint8ClampedArray },
): CaptureFingerprint | null {
  const { width, height, data } = image;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 8 ||
    height < 8 ||
    width > 128 ||
    height > 128 ||
    data.length < width * height * 4
  )
    return null;
  const cells = Array<number>(64).fill(0),
    counts = Array<number>(64).fill(0);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      if (data[index + 3] < 240) return null;
      const cell = Math.floor((y * 8) / height) * 8 + Math.floor((x * 8) / width);
      cells[cell] += data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
      counts[cell]++;
    }
  for (let i = 0; i < cells.length; i++) cells[i] /= counts[i];
  const mean = cells.reduce((sum, value) => sum + value, 0) / cells.length,
    deviation = Math.sqrt(
      cells.reduce((sum, value) => sum + (value - mean) ** 2, 0) / cells.length,
    );
  if (deviation < 6) return null;
  return cells.map((value) => Math.max(-3, Math.min(3, (value - mean) / deviation)));
}

const fingerprintOf = (value: CaptureFingerprint | null) =>
  value?.length === 64 && value.every(Number.isFinite) ? value : null;
const quadOf = (value: Quad | null) => (value && validQuad(value) ? value : null);
const copyQuad = (quad: Quad | null): Quad | null =>
  quad ? (quad.map((point) => ({ ...point })) as Quad) : null;
function difference(a: CaptureFingerprint | null, b: CaptureFingerprint | null): number | null {
  return a && b ? a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length : null;
}
type Change = {
  reason: 'content' | 'geometry' | 'lost';
  since: number;
  fingerprint: CaptureFingerprint | null;
  quad: Quad | null;
};

/** A scene-change latch; it never provides sharpness, capture eligibility or document identity. */
export class CaptureRearm {
  private locked = false;
  private captured: CaptureFingerprint | null = null;
  private capturedQuad: Quad | null = null;
  private pending: Change | null = null;
  private seen = -Infinity;
  private received = -Infinity;

  get blocked(): boolean {
    return this.locked;
  }

  lock(fingerprint: CaptureFingerprint | null, quad: Quad | null): void {
    this.locked = true;
    this.captured = fingerprintOf(fingerprint)?.slice() ?? null;
    this.capturedQuad = copyQuad(quadOf(quad));
    this.pending = null;
    this.seen = -Infinity;
    this.received = -Infinity;
  }

  /** Known camera transitions discard pending evidence without releasing the captured scene. */
  interrupt(): void {
    this.pending = null;
  }

  reset(): void {
    this.locked = false;
    this.captured = this.capturedQuad = this.pending = null;
    this.seen = -Infinity;
    this.received = -Infinity;
  }

  /** True only once when a measured scene change releases a locked capture. */
  observe(
    fingerprint: CaptureFingerprint | null,
    quad: Quad | null,
    timestamp: number,
    receivedNow: number,
  ): boolean {
    if (!this.locked) return false;
    if (
      !Number.isFinite(timestamp) ||
      !Number.isFinite(receivedNow) ||
      timestamp < 0 ||
      receivedNow < timestamp ||
      receivedNow - timestamp > 400 ||
      timestamp <= this.seen ||
      receivedNow < this.received
    ) {
      this.interrupt();
      return false;
    }
    if (timestamp - this.seen > 400 || receivedNow - this.received > 400) this.interrupt();
    this.seen = timestamp;
    this.received = receivedNow;
    const current = fingerprintOf(fingerprint),
      currentQuad = quadOf(quad),
      change = difference(this.captured, current);
    let reason: Change['reason'] | null = null;
    // Unchanged material also rejects detector-only jumps or losses on the same scene.
    if (change === null || change > 0.18) {
      if (!currentQuad) {
        if (this.captured && (!current || (change !== null && change >= 0.55))) reason = 'lost';
      } else if (
        this.capturedQuad &&
        (quadDrift(currentQuad, this.capturedQuad) >= 0.12 ||
          Math.abs(area(currentQuad) / area(this.capturedQuad) - 1) >= 0.35)
      )
        reason = 'geometry';
      else if (change !== null && change >= 0.55) reason = 'content';
    }
    if (!reason) {
      this.pending = null;
      return false;
    }
    const pending = this.pending,
      pendingDifference = pending ? difference(pending.fingerprint, current) : null;
    if (
      !pending ||
      pending.reason !== reason ||
      !!pending.fingerprint !== !!current ||
      (pendingDifference !== null && pendingDifference > 0.18) ||
      !!pending.quad !== !!currentQuad ||
      (pending.quad && currentQuad && quadDrift(pending.quad, currentQuad) > 0.04)
    ) {
      this.pending = {
        reason,
        since: timestamp,
        fingerprint: current?.slice() ?? null,
        quad: copyQuad(currentQuad),
      };
      return false;
    }
    if (timestamp - pending.since < (reason === 'lost' ? 1000 : 600)) return false;
    this.reset();
    return true;
  }
}
