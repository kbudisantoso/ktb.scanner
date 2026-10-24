import type { Quad } from '../../packages/scanner/src/types.ts';

export const size = { width: 1200, height: 1600 };
export function photograph(
  width: number,
  height: number,
  pitch: number,
  yaw: number,
  roll = 0,
): Quad {
  const [rx, ry, rz] = [pitch, yaw, roll].map((degrees) => (degrees * Math.PI) / 180);
  return [
    [-width / 2, -height / 2],
    [width / 2, -height / 2],
    [width / 2, height / 2],
    [-width / 2, height / 2],
  ].map(([x, y]) => {
    const yy = y * Math.cos(rx),
      zz = y * Math.sin(rx);
    const xx = x * Math.cos(ry) + zz * Math.sin(ry),
      z = -x * Math.sin(ry) + zz * Math.cos(ry);
    const u = xx * Math.cos(rz) - yy * Math.sin(rz),
      v = xx * Math.sin(rz) + yy * Math.cos(rz);
    return {
      x: (600 + (1600 * (u + 25)) / (700 + z)) / size.width,
      y: (800 + (1600 * (v - 15)) / (700 + z)) / size.height,
    };
  }) as Quad;
}
