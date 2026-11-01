import type { LiveDetection, Quad } from './types.ts';
import { area, quadDrift, smoothQuad, validQuad } from './geometry.ts';
import { RESULT_FRESHNESS_MS, SOURCE_CONTINUITY_MS } from './live-evidence.ts';

const DISPLAY_FADE_MS = 200;
const DISPLAY_LIFETIME_MS = SOURCE_CONTINUITY_MS + DISPLAY_FADE_MS;

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
      now - detection.timestamp > RESULT_FRESHNESS_MS
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
    if (now - this.last > DISPLAY_LIFETIME_MS) this.measured = this.displayed = null;
    const jump = this.measured && quadDrift(this.measured, q) > 0.035;
    if (
      jump &&
      (!this.challenger ||
        detection.timestamp - this.challengerAt > SOURCE_CONTINUITY_MS ||
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
    this.displayed = jump ? structuredClone(q) : smoothQuad(this.displayed, q, now - this.last);
    this.last = now;
    return detection;
  }
  view(now: number): { corners: Quad | null; opacity: number; animate: boolean } {
    const age = now - this.last;
    const opacity = Math.max(0, Math.min(1, (DISPLAY_LIFETIME_MS - age) / DISPLAY_FADE_MS));
    return {
      corners: opacity ? this.displayed : null,
      opacity,
      animate: this.reason === 'associated' && age >= 0 && age <= RESULT_FRESHNESS_MS,
    };
  }
}
