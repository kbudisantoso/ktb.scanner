/** Synthetic documents only; no personal, account or payment data. */
export async function exampleFiles(): Promise<File[]> {
  const files: File[] = [];
  for (const kind of ['invoice', 'receipt']) {
    const canvas = document.createElement('canvas');
    canvas.width = kind === 'receipt' ? 660 : 1100;
    canvas.height = kind === 'receipt' ? 1800 : 1400;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#677568';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fffef7';
    ctx.fillRect(80, 70, canvas.width - 160, canvas.height - 140);
    ctx.fillStyle = '#244b3b';
    ctx.font = 'bold 38px sans-serif';
    ctx.fillText(kind === 'receipt' ? 'MUSTERBON' : 'MUSTERRECHNUNG', 115, 150);
    ctx.font = '20px sans-serif';
    ctx.fillText('Synthetisches Testdokument', 115, 195);
    ctx.font = '18px monospace';
    for (let y = 280, line = 1; y < canvas.height - 250; y += 48, line++) {
      ctx.fillStyle = line % 5 === 0 ? '#99958a' : '#383d34';
      ctx.fillText(`${String(line).padStart(2, '0')}  Beispielposition       12,34`, 115, y);
    }
    ctx.strokeStyle = '#c74c34';
    ctx.lineWidth = 4;
    ctx.strokeRect(115, canvas.height - 210, 220, 85);
    ctx.fillStyle = '#c74c34';
    ctx.fillText('NUR TESTDATEN', 130, canvas.height - 160);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Beispielbild konnte nicht erstellt werden.'))),
        'image/png',
      ),
    );
    files.push(new File([blob], `${kind}.png`, { type: 'image/png' }));
    canvas.width = canvas.height = 1;
  }
  return files;
}
