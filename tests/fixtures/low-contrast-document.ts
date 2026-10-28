export interface ContrastFixture {
  name: string;
  background: number;
  paper: number | null;
  text?: boolean;
  table?: boolean;
  folds?: boolean;
  grain?: number;
  shade?: number;
  color?: boolean;
  coloredPaper?: boolean;
  shadowOnly?: boolean;
  photo?: boolean;
  corners?: [number, number][];
  sheets?: { x: number; y: number; w: number; h: number; value: number; table?: boolean }[];
  expected?: [number, number, number, number];
}

export const contrastPaperCases: ContrastFixture[] = [
  { name: 'strong control', background: 65, paper: 235 },
  { name: '75-level contrast with print', background: 160, paper: 235, text: true },
  { name: '45-level contrast', background: 190, paper: 235 },
  { name: '45-level contrast with print', background: 190, paper: 235, text: true },
  { name: '30-level contrast', background: 205, paper: 235 },
  { name: '30-level contrast with print', background: 205, paper: 235, text: true },
  { name: 'interior table', background: 205, paper: 235, table: true },
  { name: 'seeded grain', background: 205, paper: 235, text: true, grain: 3 },
  { name: 'sloping illumination', background: 205, paper: 235, text: true, shade: 30 },
  { name: 'two creases', background: 205, paper: 235, text: true, folds: true },
  { name: '20-level contrast', background: 215, paper: 235, text: true },
  { name: 'dimmer exposure', background: 125, paper: 150, text: true },
  { name: 'matching warm colors', background: 210, paper: 232, text: true, color: true },
  { name: 'colored paper', background: 205, paper: 235, text: true, coloredPaper: true },
  { name: 'dark paper', background: 150, paper: 110, text: true },
];

export const contrastContextCases: ContrastFixture[] = [
  { name: 'shadow-only border', background: 235, paper: 235, text: true, shadowOnly: true },
  { name: 'photograph', background: 65, paper: 150, photo: true },
  {
    name: 'two moderate sheets',
    background: 205,
    paper: 235,
    sheets: [
      { x: 20, y: 230, w: 310, h: 438, value: 235 },
      { x: 470, y: 230, w: 310, h: 438, value: 235 },
    ],
    expected: [20, 230, 310, 438],
  },
  {
    name: 'selected right sheet remains selected',
    background: 205,
    paper: 235,
    sheets: [
      { x: 20, y: 230, w: 310, h: 438, value: 235 },
      { x: 470, y: 230, w: 310, h: 438, value: 95 },
    ],
    expected: [470, 230, 310, 438],
  },
  {
    name: 'left table expands to its own sheet',
    background: 205,
    paper: 235,
    sheets: [
      { x: 20, y: 230, w: 310, h: 438, value: 235, table: true },
      { x: 470, y: 230, w: 310, h: 438, value: 95 },
    ],
    expected: [20, 230, 310, 438],
  },
  {
    name: 'perspective paper',
    background: 205,
    paper: 235,
    text: true,
    corners: [
      [150, 130],
      [650, 95],
      [685, 820],
      [125, 855],
    ],
  },
  {
    name: 'tilted warm paper',
    background: 210,
    paper: 232,
    text: true,
    color: true,
    corners: [
      [230, 70],
      [720, 220],
      [590, 900],
      [80, 735],
    ],
  },
  {
    name: 'landscape paper',
    background: 205,
    paper: 235,
    text: true,
    corners: [
      [85, 220],
      [715, 220],
      [715, 665],
      [85, 665],
    ],
  },
];

export const contrastMissingCases: ContrastFixture[] = [
  { name: 'uniform', background: 205, paper: null },
  { name: 'uniform grain', background: 205, paper: null, grain: 3 },
  { name: 'print without a sheet', background: 235, paper: null, text: true },
  { name: 'creases without a sheet', background: 235, paper: null, folds: true },
];

/** Font-free, seeded RGBA pixels with independently known paper boundaries. */
export function contrastDocumentInBrowser(fixture: ContrastFixture): string {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 1000;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(800, 1000);
  let state = 7319;
  for (let y = 0; y < 1000; y++)
    for (let x = 0; x < 800; x++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const sheet = fixture.sheets
        ?.filter((item) => x >= item.x && x < item.x + item.w && y >= item.y && y < item.y + item.h)
        .at(-1);
      const inside = fixture.sheets
        ? !!sheet
        : fixture.corners
          ? fixture.corners.every(([ax, ay], index) => {
              const [bx, by] = fixture.corners![(index + 1) % 4];
              return (bx - ax) * (y - ay) - (by - ay) * (x - ax) >= 0;
            })
          : fixture.paper !== null && x >= 140 && x < 660 && y >= 80 && y < 815;
      let value = inside ? (sheet?.value ?? fixture.paper!) : fixture.background;
      if (fixture.shadowOnly && !inside) {
        const distance = Math.max(140 - x, x - 659, 80 - y, y - 814);
        if (distance > 0 && distance <= 12 && x >= 128 && x < 672 && y >= 68 && y < 827)
          value -= 140 * (1 - distance / 13);
      }
      if (fixture.photo && inside) value = 135 + 35 * Math.sin(x / 23) * Math.sin(y / 31);
      if (fixture.shade) value -= (fixture.shade * x) / 800;
      if (fixture.grain) value += (state % (2 * fixture.grain + 1)) - fixture.grain;
      if (fixture.folds && x >= 140 && x < 660)
        for (const fold of [325, 570]) {
          if (Math.abs(y - fold) < 10) value -= 65 * (1 - Math.abs(y - fold) / 10);
        }
      if (
        fixture.text &&
        (inside || fixture.paper === null) &&
        x >= 185 &&
        x < 615 &&
        y >= 140 &&
        y < 755 &&
        y % 37 < 7 &&
        (x - 185) % 59 < 43
      )
        value = 32;
      if (
        fixture.table &&
        (inside || fixture.paper === null) &&
        x >= 185 &&
        x <= 615 &&
        y >= 140 &&
        y <= 755 &&
        ((x - 185) % 86 < 2 || (y - 140) % 41 < 2)
      )
        value = 32;
      if (
        sheet?.table &&
        x >= sheet.x + 25 &&
        x <= sheet.x + sheet.w - 25 &&
        y >= sheet.y + 25 &&
        y <= sheet.y + sheet.h - 25 &&
        ((x - sheet.x - 25) % 52 < 2 || (y - sheet.y - 25) % 40 < 2)
      )
        value = 32;
      const red = fixture.coloredPaper && inside ? value - 60 : fixture.color ? value + 4 : value;
      const blue = fixture.coloredPaper && inside ? value + 25 : fixture.color ? value - 8 : value;
      image.data.set([red, value, blue, 255], (y * 800 + x) * 4);
    }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}
