export interface Fixture {
  name: string;
  split: 'calibration' | 'acceptance';
  width: number;
  height: number;
  paper: [number, number, number, number];
  blur: number;
  background: string;
  shadow?: boolean;
  destination?: [number, number][];
}
export const fixtures: Fixture[] = [
  {
    name: 'acceptance-perspective',
    split: 'acceptance',
    width: 1200,
    height: 1500,
    paper: [90, 120, 1000, 1260],
    blur: 0,
    background: '#435a52',
    destination: [
      [170, 180],
      [1030, 85],
      [1100, 1320],
      [95, 1400],
    ],
  },
  {
    name: 'calibration-flat',
    split: 'calibration',
    width: 1000,
    height: 1300,
    paper: [100, 80, 800, 1140],
    blur: 0,
    background: '#59694e',
  },
  {
    name: 'calibration-blur',
    split: 'calibration',
    width: 1000,
    height: 1300,
    paper: [100, 80, 800, 1140],
    blur: 4,
    background: '#59694e',
  },
  {
    name: 'acceptance-grid',
    split: 'acceptance',
    width: 1200,
    height: 1500,
    paper: [90, 120, 1000, 1260],
    blur: 0,
    background: '#554a40',
  },
  {
    name: 'acceptance-long-receipt',
    split: 'acceptance',
    width: 650,
    height: 2400,
    paper: [100, 70, 450, 2260],
    blur: 0,
    background: '#3f535a',
  },
  {
    name: 'acceptance-low-contrast',
    split: 'acceptance',
    width: 1000,
    height: 1400,
    paper: [90, 80, 820, 1240],
    blur: 0,
    background: '#dad7cc',
    shadow: true,
  },
  {
    name: 'acceptance-blurred',
    split: 'acceptance',
    width: 1200,
    height: 1500,
    paper: [90, 120, 1000, 1260],
    blur: 5,
    background: '#554a40',
  },
];
/** Runs in a browser. Deterministic image and known edges, separate from engine output. */
export function fixtureInBrowser(fixture: Fixture): string {
  const canvas = document.createElement('canvas');
  canvas.width = fixture.width;
  canvas.height = fixture.height;
  const ctx = canvas.getContext('2d')!,
    [x, y, width, height] = fixture.paper;
  ctx.fillStyle = fixture.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fffdf5';
  ctx.fillRect(x, y, width, height);
  ctx.font = `bold ${Math.min(32, width / 15)}px monospace`;
  ctx.fillStyle = '#30352c';
  ctx.fillText('SYNTHETISCHER TEST', x + 25, y + 60);
  for (let row = 0; row < (height - 150) / 37; row++) {
    ctx.font = `${row % 5 === 0 ? 12 : 17}px monospace`;
    ctx.fillStyle = row % 4 === 0 ? '#a9a69d' : '#33382f';
    ctx.fillText(
      `${String(row + 1).padStart(2, '0')}  Artikel  0123456789  12,34`,
      x + 25,
      y + 120 + row * 37,
    );
  }
  ctx.strokeStyle = '#798875';
  ctx.lineWidth = 1;
  for (let n = 0; n < 5; n++) {
    ctx.beginPath();
    ctx.moveTo(x + 18 + ((width - 36) * n) / 4, y + 15);
    ctx.lineTo(x + 18 + ((width - 36) * n) / 4, y + height - 15);
    ctx.stroke();
  }
  ctx.strokeStyle = '#b33239';
  ctx.lineWidth = 4;
  ctx.strokeRect(x + 30, y + height - 90, Math.min(180, width - 60), 60);
  if (fixture.shadow) {
    const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
    gradient.addColorStop(0, '#00000000');
    gradient.addColorStop(1, '#00000055');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);
  }
  if (fixture.destination) {
    const pixels = ctx.getImageData(x, y, width, height);
    const source = [
      [0, 0],
      [width - 1, 0],
      [width - 1, height - 1],
      [0, height - 1],
    ];
    const matrix: number[][] = [];
    fixture.destination.forEach(([dx, dy], i) => {
      const [u, v] = source[i];
      matrix.push([dx, dy, 1, 0, 0, 0, -u * dx, -u * dy, u]);
      matrix.push([0, 0, 0, dx, dy, 1, -v * dx, -v * dy, v]);
    });
    for (let pivot = 0; pivot < 8; pivot++) {
      let best = pivot;
      for (let row = pivot + 1; row < 8; row++)
        if (Math.abs(matrix[row][pivot]) > Math.abs(matrix[best][pivot])) best = row;
      [matrix[pivot], matrix[best]] = [matrix[best], matrix[pivot]];
      const divisor = matrix[pivot][pivot];
      for (let col = pivot; col < 9; col++) matrix[pivot][col] /= divisor;
      for (let row = 0; row < 8; row++)
        if (row !== pivot) {
          const factor = matrix[row][pivot];
          for (let col = pivot; col < 9; col++) matrix[row][col] -= factor * matrix[pivot][col];
        }
    }
    const h = matrix.map((row) => row[8]);
    ctx.fillStyle = fixture.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const projected = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let py = 0; py < canvas.height; py++)
      for (let px = 0; px < canvas.width; px++) {
        const denominator = h[6] * px + h[7] * py + 1;
        const u = (h[0] * px + h[1] * py + h[2]) / denominator,
          v = (h[3] * px + h[4] * py + h[5]) / denominator;
        if (u < 0 || v < 0 || u >= width - 1 || v >= height - 1) continue;
        const sx = Math.floor(u),
          sy = Math.floor(v),
          fx = u - sx,
          fy = v - sy;
        for (let channel = 0; channel < 3; channel++) {
          const at = (dx: number, dy: number) =>
            pixels.data[((sy + dy) * width + sx + dx) * 4 + channel];
          projected.data[(py * canvas.width + px) * 4 + channel] =
            at(0, 0) * (1 - fx) * (1 - fy) +
            at(1, 0) * fx * (1 - fy) +
            at(0, 1) * (1 - fx) * fy +
            at(1, 1) * fx * fy;
        }
      }
    ctx.putImageData(projected, 0, 0);
  }
  if (fixture.blur) {
    // WebKit does not expose CanvasRenderingContext2D.filter. Use identical pixel blur everywhere.
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = image.data,
      temporary = new Uint8ClampedArray(pixels.length);
    const radius = Math.max(1, Math.round(fixture.blur)),
      diameter = radius * 2 + 1;
    const w = canvas.width,
      h = canvas.height;
    for (let pass = 0; pass < 3; pass++) {
      for (let py = 0; py < h; py++)
        for (let channel = 0; channel < 3; channel++) {
          let sum = 0;
          for (let dx = -radius; dx <= radius; dx++)
            sum += pixels[(py * w + Math.max(0, Math.min(w - 1, dx))) * 4 + channel];
          for (let px = 0; px < w; px++) {
            temporary[(py * w + px) * 4 + channel] = sum / diameter;
            sum +=
              pixels[(py * w + Math.min(w - 1, px + radius + 1)) * 4 + channel] -
              pixels[(py * w + Math.max(0, px - radius)) * 4 + channel];
          }
        }
      for (let px = 0; px < w; px++)
        for (let channel = 0; channel < 3; channel++) {
          let sum = 0;
          for (let dy = -radius; dy <= radius; dy++)
            sum += temporary[(Math.max(0, Math.min(h - 1, dy)) * w + px) * 4 + channel];
          for (let py = 0; py < h; py++) {
            pixels[(py * w + px) * 4 + channel] = sum / diameter;
            sum +=
              temporary[(Math.min(h - 1, py + radius + 1) * w + px) * 4 + channel] -
              temporary[(Math.max(0, py - radius) * w + px) * 4 + channel];
          }
        }
    }
    ctx.putImageData(image, 0, 0);
  }
  return canvas.toDataURL('image/png');
}
