/** Independently known synthetic receipt boundary among background outlines; no external media. */
export const clutteredReceiptCorners: [number, number][] = [
  [195, 118],
  [372, 112],
  [372, 642],
  [170, 642],
];

export function clutteredReceiptInBrowser(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 750;
  canvas.height = 1000;
  const context = canvas.getContext('2d')!;
  const polygon = (points: number[][], color: string) => {
    context.fillStyle = color;
    context.beginPath();
    points.forEach(([x, y], index) => (index ? context.lineTo(x, y) : context.moveTo(x, y)));
    context.closePath();
    context.fill();
  };
  const background = context.createLinearGradient(0, 0, 750, 1000);
  background.addColorStop(0, '#27313e');
  background.addColorStop(0.56, '#1c273b');
  background.addColorStop(0.57, '#a78c66');
  background.addColorStop(1, '#746855');
  context.fillStyle = background;
  context.fillRect(0, 0, 750, 1000);
  polygon(
    [
      [414, 121],
      [663, 130],
      [713, 691],
      [408, 692],
    ],
    '#bfc0be',
  );
  context.fillStyle = '#969b9c';
  context.fillRect(455, 218, 100, 427);
  context.strokeStyle = '#555e65';
  context.lineWidth = 5;
  context.strokeRect(475, 246, 45, 355);
  context.fillStyle = '#3d4349';
  context.beginPath();
  context.roundRect(-25, -90, 445, 790, [0, 0, 45, 0]);
  context.fill();
  context.strokeStyle = '#20282d';
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(30, 180);
  context.quadraticCurveTo(110, 130, 270, 147);
  context.stroke();
  context.strokeRect(5, 150, 365, 480);
  polygon(
    [
      [195, 118],
      [372, 112],
      [372, 642],
      [170, 642],
    ],
    '#e9e7dd',
  );
  context.fillStyle = '#60605b';
  context.font = '12px sans-serif';
  context.fillText('SYNTHETIC RECEIPT', 204, 139);
  context.font = '8px sans-serif';
  for (let row = 0; row < 16; row++)
    context.fillText(
      row % 3 ? 'Vielen Dank fuer Ihren Einkauf' : 'Synthetic document - receipt',
      199 - row * 0.7,
      160 + row * 18,
    );
  context.font = 'bold 23px sans-serif';
  context.fillText('50 Cent', 226, 290);
  context.fillText('Rabatt', 227, 314);
  context.fillStyle = '#363638';
  for (let bar = 0; bar < 38; bar++)
    if (bar % 4 !== 1) context.fillRect(214 + bar * 3.1, 553, (bar % 3) + 1, 48);
  polygon(
    [
      [170, 870],
      [427, 865],
      [434, 1000],
      [165, 1000],
    ],
    '#8c959a',
  );
  context.fillStyle = '#31363c';
  context.beginPath();
  context.ellipse(644, 870, 130, 200, -0.15, 0, Math.PI * 2);
  context.fill();
  return canvas.toDataURL('image/png');
}
