import { useLayoutEffect, useRef } from 'react';
import { progressOutline } from '../outline.ts';
import type { Quad, Size } from '../types.ts';
import { canAnimateOutline, outlineAt, OUTLINE_MOTION_MS } from './outline-motion.ts';

const points = (values: readonly { x: number; y: number }[]) =>
  values.map((point) => `${point.x * 1000},${point.y * 1000}`).join(' ');
const copy = (corners: Quad) => corners.map((point) => ({ ...point })) as Quad;

export function CaptureOutline({
  corners,
  size,
  progress,
  opacity,
  animate = true,
  generation = 0,
}: {
  corners: Quad;
  size: Size;
  progress: number;
  opacity: number;
  /** Internal display permission; held geometry is never a new measurement. */
  animate?: boolean;
  generation?: number;
}) {
  const polygon = useRef<SVGPolygonElement>(null),
    perimeter = useRef<SVGPolylineElement>(null);
  const latest = useRef({ corners, size, progress, animate, generation });
  latest.current = { corners, size, progress, animate, generation };
  const displayed = useRef(copy(corners));
  const previous = useRef({ corners, size, animate, generation });
  const alive = useRef(false),
    hidden = useRef(false),
    reduced = useRef(false),
    token = useRef(0),
    frame = useRef<number | undefined>(undefined);
  const transition = useRef<{ from: Quad; to: Quad; started: number } | null>(null);
  const paint = () => {
    if (!alive.current) return;
    polygon.current?.setAttribute('points', points(displayed.current));
    perimeter.current?.setAttribute(
      'points',
      points(progressOutline(displayed.current, latest.current.size, latest.current.progress)),
    );
  };
  const cancel = () => {
    token.current++;
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
    transition.current = null;
  };
  const snap = () => {
    cancel();
    displayed.current = copy(latest.current.corners);
    paint();
  };
  const step = (now: number, epoch: number) => {
    if (!alive.current || token.current !== epoch || !transition.current) return;
    frame.current = undefined;
    if (hidden.current || reduced.current || !latest.current.animate) {
      snap();
      return;
    }
    const { from, to, started } = transition.current;
    displayed.current = outlineAt(from, to, now - started);
    paint();
    if (now - started < OUTLINE_MOTION_MS)
      frame.current = requestAnimationFrame((time) => step(time, epoch));
    else transition.current = null;
  };
  useLayoutEffect(() => {
    alive.current = true;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    reduced.current = media.matches;
    hidden.current = document.hidden;
    const preference = () => {
      reduced.current = media.matches;
      snap();
    };
    const visibility = () => {
      hidden.current = document.hidden;
      snap();
    };
    media.addEventListener('change', preference);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      alive.current = false;
      cancel();
      media.removeEventListener('change', preference);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = { corners, size, animate, generation };
    const changed = corners.some(
      (point, index) => point.x !== before.corners[index].x || point.y !== before.corners[index].y,
    );
    const reset =
      generation !== before.generation ||
      size.width !== before.size.width ||
      size.height !== before.size.height;
    if (!changed && !reset && animate === before.animate) return;
    if (
      reset ||
      !animate ||
      reduced.current ||
      hidden.current ||
      !canAnimateOutline(displayed.current, corners)
    ) {
      snap();
      return;
    }
    if (!changed) return;
    cancel();
    transition.current = {
      from: copy(displayed.current),
      to: copy(corners),
      started: performance.now(),
    };
    paint();
    const epoch = token.current;
    frame.current = requestAnimationFrame((time) => step(time, epoch));
  }, [corners, size.width, size.height, generation, animate]);
  useLayoutEffect(paint, [progress]);
  return (
    <svg
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ opacity }}
      data-progress={progress}
    >
      <polygon
        ref={polygon}
        points={points(displayed.current)}
        fill="var(--scanner-capture-fill, #24d58a0d)"
        stroke="var(--scanner-capture-outline, white)"
        strokeWidth="4"
        vectorEffect="non-scaling-stroke"
      />
      {progress > 0 && (
        <polyline
          ref={perimeter}
          points={points(progressOutline(displayed.current, size, progress))}
          fill="none"
          stroke="var(--scanner-capture-progress, #24d58a)"
          strokeWidth="5"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
