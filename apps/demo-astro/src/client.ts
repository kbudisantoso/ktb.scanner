import type { ScannerController } from '@ktb/scanner';
const openButton = document.querySelector<HTMLButtonElement>('#open')!;
const importButton = document.querySelector<HTMLButtonElement>('#import')!;
const input = document.querySelector<HTMLInputElement>('#file')!;
const status = document.querySelector<HTMLElement>('#status')!;
const results = document.querySelector<HTMLElement>('#results')!;
const reset = document.querySelector<HTMLButtonElement>('#reset')!;
let scanner: ScannerController | undefined,
  busy = false,
  generation = 0;
let urls: string[] = [];
function clear() {
  urls.forEach((url) => URL.revokeObjectURL(url));
  urls = [];
  results.replaceChildren();
  reset.hidden = true;
}
async function open(files?: File[]) {
  if (busy) return;
  busy = true;
  openButton.setAttribute('aria-disabled', 'true');
  importButton.disabled = true;
  const current = generation;
  try {
    const { createScanner } = await import('@ktb/scanner/react');
    if (current !== generation) return;
    scanner = createScanner({
      mount: document.querySelector<HTMLElement>('#scanner-mount')!,
      assetBaseUrl: '/scanner-assets/',
      createPdf: true,
      theme: {
        '--scanner-background': '#f0eef5',
        '--scanner-accent': '#594a93',
        '--scanner-text': '#302d42',
        '--scanner-muted': '#625b71',
        '--scanner-border': '#d5cfe1',
      },
    });
    const result = await scanner.open({ initialFiles: files });
    if (result.status !== 'confirmed' || current !== generation) return;
    clear();
    result.pages.forEach((page, index) => {
      const url = URL.createObjectURL(page.image);
      urls.push(url);
      const article = document.createElement('article'),
        image = document.createElement('img'),
        link = document.createElement('a');
      image.src = url;
      image.alt = `Seite ${index + 1}`;
      link.href = url;
      link.download = `scan-${index + 1}.${page.image.type === 'image/png' ? 'png' : 'jpg'}`;
      link.textContent = `Seite ${index + 1} herunterladen`;
      article.append(image, link);
      results.append(article);
    });
    if (result.pdf) {
      const url = URL.createObjectURL(result.pdf);
      urls.push(url);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'scan.pdf';
      link.className = 'download';
      link.textContent = 'PDF herunterladen';
      results.append(link);
    }
    reset.hidden = false;
    status.textContent = `${result.pages.length} Seiten exportiert. Kein Upload ausgeführt.`;
  } catch {
    status.textContent =
      'Scanner konnte nicht geöffnet werden. Bitte Assets und Paketbuild prüfen.';
  } finally {
    await scanner?.destroy();
    scanner = undefined;
    busy = false;
    openButton.setAttribute('aria-disabled', 'false');
    importButton.disabled = false;
  }
}
openButton.addEventListener('click', () => {
  openButton.focus();
  void open();
});
importButton.addEventListener('click', () => input.click());
input.addEventListener('change', () => {
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (files.length) void open(files);
});
reset.addEventListener('click', clear);
window.addEventListener('pagehide', () => {
  generation++;
  void scanner?.destroy();
  clear();
});
