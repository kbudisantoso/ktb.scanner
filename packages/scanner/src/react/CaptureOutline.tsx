import { progressOutline } from '../outline.ts';
import type { Quad, Size } from '../types.ts';

export function CaptureOutline({
  corners,
  size,
  progress,
  opacity,
}: {
  corners: Quad;
  size: Size;
  progress: number;
  opacity: number;
}) {
  const points = (values: readonly { x: number; y: number }[]) =>
    values.map((point) => `${point.x * 1000},${point.y * 1000}`).join(' ');
  return (
    <svg
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ opacity }}
      data-progress={progress}
    >
      <polygon
        points={points(corners)}
        fill="var(--scanner-capture-fill, #24d58a0d)"
        stroke="var(--scanner-capture-outline, white)"
        strokeWidth="4"
        vectorEffect="non-scaling-stroke"
      />
      {progress > 0 && (
        <polyline
          points={points(progressOutline(corners, size, progress))}
          fill="none"
          stroke="var(--scanner-capture-progress, #24d58a)"
          strokeWidth="5"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
