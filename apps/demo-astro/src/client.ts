import { createTranslator, type ScanLocale, type ScanResult } from '@ktb-tools/scanner';
import type { ScannerController } from '@ktb-tools/scanner';
const openButton = document.querySelector<HTMLButtonElement>('#open')!;
const importButton = document.querySelector<HTMLButtonElement>('#import')!;
const input = document.querySelector<HTMLInputElement>('#file')!;
const status = document.querySelector<HTMLElement>('#status')!;
const results = document.querySelector<HTMLElement>('#results')!;
const language = document.querySelector<HTMLSelectElement>('#language')!;
const workflow = document.querySelector<HTMLSelectElement>('#capture-workflow')!;
const requested = new URL(location.href).searchParams.get('lang');
const preferred = navigator.languages?.[0] || navigator.language;
let locale: ScanLocale =
  requested === 'en' || requested === 'de'
    ? requested
    : /^de(?:-|$)/i.test(preferred)
      ? 'de'
      : 'en';
let t = createTranslator(locale);
let lastResult: Extract<ScanResult, { status: 'confirmed' }> | undefined;
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
  lastResult = undefined;
}
async function open(files?: File[]) {
  if (busy) return;
  busy = true;
  openButton.setAttribute('aria-disabled', 'true');
  importButton.disabled = true;
  language.disabled = true;
  workflow.disabled = true;
  const current = generation;
  try {
    const { createScanner } = await import('@ktb-tools/scanner/react');
    if (current !== generation) return;
    scanner = createScanner({
      mount: document.querySelector<HTMLElement>('#scanner-mount')!,
      assetBaseUrl: '/scanner-assets/',
      createPdf: true,
      captureWorkflow: workflow.value === 'review-each' ? 'review-each' : 'continuous',
      locale,
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
    render(result);
  } catch {
    status.textContent = t(
      'Scanner konnte nicht geöffnet werden. Bitte Assets und Paketbuild prüfen.',
    );
  } finally {
    await scanner?.destroy();
    scanner = undefined;
    busy = false;
    openButton.setAttribute('aria-disabled', 'false');
    importButton.disabled = false;
    language.disabled = false;
    workflow.disabled = false;
  }
}

function render(result: Extract<ScanResult, { status: 'confirmed' }>) {
  clear();
  lastResult = result;
  result.pages.forEach((page, index) => {
    const url = URL.createObjectURL(page.image);
    urls.push(url);
    const article = document.createElement('article'),
      image = document.createElement('img'),
      link = document.createElement('a');
    image.src = url;
    image.alt = t('Seite {number}', { number: index + 1 });
    link.href = url;
    link.download = `scan-${index + 1}.${page.image.type === 'image/png' ? 'png' : 'jpg'}`;
    link.textContent = t('Seite {number} herunterladen', { number: index + 1 });
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
    link.textContent = t('PDF herunterladen');
    results.append(link);
  }
  reset.hidden = false;
  status.textContent = t('{count} Seiten exportiert. Kein Upload ausgeführt.', {
    count: result.pages.length,
  });
}
function setLanguage(updateUrl = false) {
  locale = language.value === 'en' ? 'en' : 'de';
  t = createTranslator(locale);
  document.documentElement.lang = locale;
  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.set('lang', locale);
    history.replaceState(null, '', url);
  }
  document.title = locale === 'de' ? 'Scanner / Astro Beispiel' : 'Scanner / Astro example';
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n!);
  });
  results.setAttribute('aria-label', t('Scanergebnisse'));
  workflow.setAttribute('aria-label', t('Aufnahmeablauf'));
  if (lastResult) render(lastResult);
  else status.textContent = t('Bilder und PDF bleiben lokal in dieser Sitzung.');
}
language.value = locale;
language.addEventListener('change', () => setLanguage(true));
setLanguage();

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
