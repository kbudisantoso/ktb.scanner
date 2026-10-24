import type { LiveDetection, Quad } from './types.ts';
import { area, quadDrift, smoothQuad, validQuad } from './geometry.ts';

/** Tracking never supplies held/interpolated corners as fresh capture evidence. */
export class LiveTracker {
  private measured: Quad | null = null;
  private displayed: Quad | null = null;
  private challenger: Quad | null = null;
  private challengerAt = -Infinity;
  private last = -Infinity;
  private seen = -Infinity;
  reason = 'acquiring';

  update(detection: LiveDetection, now: number): LiveDetection {
    const q = detection.corners;
    if (
      detection.timestamp <= this.seen ||
      now < detection.timestamp ||
      now - detection.timestamp > 400
    ) {
      this.reason = 'stale-or-duplicate';
      return { ...detection, corners: null, sharpness: 'unknown' };
    }
    this.seen = detection.timestamp;
    if (!q || !validQuad(q) || area(q) < 0.08) {
      this.reason = 'contour-missing';
      this.challenger = null;
      return { ...detection, corners: null, sharpness: 'unknown' };
    }
    if (now - this.last > 600) this.measured = this.displayed = null;
    const jump = this.measured && quadDrift(this.measured, q) > 0.035;
    if (
      jump &&
      (!this.challenger ||
        detection.timestamp - this.challengerAt > 400 ||
        quadDrift(this.challenger, q) > 0.025)
    ) {
      this.challenger = structuredClone(q);
      this.challengerAt = detection.timestamp;
      this.reason = 'unconfirmed-jump';
      return { ...detection, corners: null, sharpness: 'unknown' };
    }
    this.reason = jump ? 'confirmed-change' : this.measured ? 'associated' : 'acquired';
    this.challenger = null;
    this.measured = structuredClone(q);
    this.displayed = smoothQuad(this.displayed, q, now - this.last);
    this.last = now;
    return detection;
  }
  view(now: number): { corners: Quad | null; opacity: number } {
    const age = now - this.last;
    const opacity = Math.max(0, Math.min(1, (600 - age) / 200));
    return { corners: opacity ? this.displayed : null, opacity };
  }
}
