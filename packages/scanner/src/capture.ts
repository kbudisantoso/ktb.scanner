import type { CaptureMode, LiveDetection, Quad } from './types.ts';
import { area, quadDrift, validQuad } from './geometry.ts';
import { ScannerError } from './errors.ts';
import {
  INTERVAL_CREDIT_MS,
  RESULT_FRESHNESS_MS,
  SOURCE_CONTINUITY_MS,
  UNCERTAINTY_EXPIRY_MS,
} from './live-evidence.ts';

export const DEFAULT_AUTO_CAPTURE_STABILITY_MS = 1000;
export const AUTO_CAPTURE_STABILITY_PRESETS_MS = [400, 600, 800, 1000, 1200, 1500, 2000] as const;

export function resolveAutoCaptureStabilityMs(configured?: number, requested?: number): number {
  for (const value of [configured, requested])
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 100 || value > 5000))
      throw new ScannerError(
        'CONFIG_INVALID',
        'Die Stabilisierungsdauer muss eine ganze Zahl zwischen 100 und 5000 ms sein.',
      );
  return requested ?? configured ?? DEFAULT_AUTO_CAPTURE_STABILITY_MS;
}

/** Measurement time, never UI interpolation, determines capture eligibility. */
export class AutoCapture {
  readonly stabilityMs: number;
  private anchor: Quad | null = null;
  private previous: Quad | null = null;
  private stableMs = 0;
  private inliers = 0;
  private sparse = false;
  private last = -Infinity;
  private seen = -Infinity;
  private interrupted = true;
  private armed = true;
  private mode: CaptureMode;
  private epoch = 0;
  decisionReason = 'reset';
  constructor(mode: CaptureMode = 'auto', stabilityMs?: number) {
    this.mode = mode;
    this.stabilityMs = resolveAutoCaptureStabilityMs(stabilityMs);
  }
  get generation(): number {
    return this.epoch;
  }
  reset(): void {
    this.clearWindow();
    this.seen = -Infinity;
    this.epoch++;
    this.decisionReason = 'reset';
  }
  private clearWindow(): void {
    this.anchor = this.previous = null;
    this.stableMs = 0;
    this.inliers = 0;
    this.sparse = false;
    this.last = -Infinity;
    this.interrupted = true;
  }
  /** Absence may pause/reset evidence, but never invalidate a job or trigger capture. */
  poll(now: number): { progress: number; capture: boolean } {
    if (now - this.last > UNCERTAINTY_EXPIRY_MS) return this.pause(now, 'waiting-for-evidence');
    // A pending job can still return a fresh sample. Polling must not invalidate that interval.
    if (now - this.last > RESULT_FRESHNESS_MS) this.decisionReason = 'waiting-for-evidence';
    return {
      progress: this.armed && this.mode === 'auto' ? this.progress() : 0,
      capture: false,
    };
  }
  private pause(now: number, reason: string): { progress: number; capture: boolean } {
    this.interrupted = true;
    if (now - this.last > UNCERTAINTY_EXPIRY_MS) this.clearWindow();
    this.decisionReason = reason;
    return {
      progress: this.armed && this.mode === 'auto' ? this.progress() : 0,
      capture: false,
    };
  }
  private progress(): number {
    // Sparse short windows need more than a single widely separated pair. Keep green open until claim.
    return Math.min(this.sparse && this.inliers < 4 ? 0.985 : 1, this.stableMs / this.stabilityMs);
  }
  setMode(mode: CaptureMode): void {
    this.mode = mode;
    this.reset();
  }
  rearm(): void {
    this.armed = true;
    this.reset();
  }
  claimManual(): boolean {
    if (!this.armed) return false;
    this.armed = false;
    this.reset();
    return true;
  }
  update(
    detection: LiveDetection,
    now: number,
    generation = this.epoch,
  ): { progress: number; capture: boolean } {
    const empty = { progress: 0, capture: false };
    if (!this.armed || this.mode !== 'auto' || generation !== this.epoch) {
      this.decisionReason = !this.armed
        ? 'disarmed'
        : this.mode !== 'auto'
          ? 'manual'
          : 'generation-mismatch';
      return empty;
    }
    if (
      now < detection.timestamp ||
      now - detection.timestamp > RESULT_FRESHNESS_MS ||
      detection.timestamp <= this.seen
    )
      return this.pause(
        now,
        now < detection.timestamp
          ? 'future-measurement'
          : detection.timestamp <= this.seen
            ? 'duplicate-measurement'
            : 'stale-measurement',
      );
    this.seen = detection.timestamp;
    const q = detection.corners;
    const invalid = !q
      ? 'contour-lost'
      : !validQuad(q)
        ? 'invalid-contour'
        : area(q) < 0.08
          ? 'contour-too-small'
          : detection.sharpness !== 'sharp'
            ? `sharpness-${detection.sharpness}`
            : '';
    if (invalid || !q) return this.pause(now, invalid);
    const restart =
      !this.anchor || !this.previous
        ? 'acquiring'
        : now - this.last > UNCERTAINTY_EXPIRY_MS ||
            detection.timestamp - this.last >
              (this.interrupted ? UNCERTAINTY_EXPIRY_MS : SOURCE_CONTINUITY_MS)
          ? 'measurement-gap'
          : quadDrift(q, this.anchor) > 0.05
            ? 'anchor-drift'
            : quadDrift(q, this.previous) > 0.035
              ? 'frame-motion'
              : Math.abs(area(q) / area(this.anchor) - 1) > 0.15
                ? 'area-change'
                : '';
    this.decisionReason = restart || 'stable';
    if (restart) {
      this.anchor = structuredClone(q);
      this.stableMs = 0;
      this.inliers = 1;
      this.sparse = false;
    } else {
      this.inliers++;
      if (!this.interrupted) {
        const interval = detection.timestamp - this.last;
        this.sparse ||= interval > INTERVAL_CREDIT_MS;
        this.stableMs += Math.min(INTERVAL_CREDIT_MS, interval);
      }
    }
    this.previous = structuredClone(q);
    this.last = detection.timestamp;
    this.interrupted = false;
    const progress = this.progress();
    if (progress >= 1) {
      this.armed = false;
      this.decisionReason = 'captured';
      return { progress: 1, capture: true };
    }
    return { progress, capture: false };
  }
}
