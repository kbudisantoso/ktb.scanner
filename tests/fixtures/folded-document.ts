export interface FoldedDocumentFixture {
  background: number;
  foldShadow: number;
  foldHalfWidth: number;
}

export const foldedPaper = {
  width: 800,
  height: 1000,
  x: 140,
  y: 80,
  paperWidth: 520,
  paperHeight: 735,
};

/** Font-free A4 geometry with two independently specified DIN-long fold shadows. */
export function foldedDocumentInBrowser(fixture: FoldedDocumentFixture): string {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 1000;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = `rgb(${fixture.background},${fixture.background},${fixture.background})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgb(238,238,238)';
  ctx.fillRect(140, 80, 520, 735);
  for (const y of [325, 570]) {
    const gradient = ctx.createLinearGradient(
      0,
      y - fixture.foldHalfWidth,
      0,
      y + fixture.foldHalfWidth,
    );
    gradient.addColorStop(0, 'rgb(238,238,238)');
    gradient.addColorStop(
      0.48,
      `rgb(${fixture.foldShadow},${fixture.foldShadow},${fixture.foldShadow})`,
    );
    gradient.addColorStop(0.52, 'rgb(248,248,248)');
    gradient.addColorStop(1, 'rgb(238,238,238)');
    ctx.fillStyle = gradient;
    ctx.fillRect(140, y - fixture.foldHalfWidth, 520, fixture.foldHalfWidth * 2);
  }
  return canvas.toDataURL('image/png');
}

export const perspectiveFoldedCorners = [
  [340, 80],
  [460, 100],
  [700, 880],
  [100, 830],
];

/** Unequal creases yield competing full-sheet and two-panel Scanic contours. */
export function perspectiveFoldedDocumentInBrowser(firstShadow: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 1000;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgb(130,130,130)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const corners = [
    { x: 340, y: 80 },
    { x: 460, y: 100 },
    { x: 700, y: 880 },
    { x: 100, y: 830 },
  ];
  const polygon = (points: { x: number; y: number }[], value: number) => {
    ctx.beginPath();
    points.forEach((point, index) =>
      index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y),
    );
    ctx.closePath();
    ctx.fillStyle = `rgb(${value},${value},${value})`;
    ctx.fill();
  };
  polygon(corners, 238);
  const at = (fraction: number) =>
    [0, 1].map((index) => ({
      x: corners[index].x + (corners[3 - index].x - corners[index].x) * fraction,
      y: corners[index].y + (corners[3 - index].y - corners[index].y) * fraction,
    }));
  for (const [index, fraction] of [1 / 3, 2 / 3].entries())
    for (let band = -5; band < 5; band++) {
      const upper = at(fraction + band / 750),
        lower = at(fraction + (band + 1) / 750),
        shadow = index === 0 ? firstShadow : 190;
      const value = band < 0 ? 238 + ((shadow - 238) * (band + 5)) / 5 : 248 - (10 * band) / 5;
      polygon([upper[0], upper[1], lower[1], lower[0]], value);
    }
  return canvas.toDataURL('image/png');
}
