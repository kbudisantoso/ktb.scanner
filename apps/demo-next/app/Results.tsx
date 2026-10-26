'use client';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { ScanPage, ScanResult } from '@ktb-tools/scanner';
import { useUrl } from './blob-url';
import { useDemoLocale } from './i18n';
const PdfPreview = lazy(() => import('./PdfPreview'));
const ImageViewer = lazy(() =>
  import('@ktb-tools/scanner/react').then((module) => ({ default: module.ImageViewer })),
);
type Result = Extract<ScanResult, { status: 'confirmed' }>;
function ResultViewer({
  page,
  index,
  count,
  close,
  move,
  restoreFocus,
}: {
  page: ScanPage;
  index: number;
  count: number;
  close: () => void;
  move: (index: number) => void;
  restoreFocus: () => void;
}) {
  const { locale, t } = useDemoLocale();
  const dialog = useRef<HTMLDialogElement>(null),
    url = useUrl(page.image);
  useEffect(() => {
    const node = dialog.current!;
    const previous = document.activeElement;
    node.showModal();
    return () => {
      node.close();
      if (
        previous instanceof HTMLElement &&
        previous.isConnected &&
        previous.getClientRects().length
      )
        previous.focus();
      else restoreFocus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="result-viewer"
      aria-labelledby="result-viewer-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <header>
        <h2 id="result-viewer-title">
          {t('Seite')} {index + 1}{' '}
          <span>
            {t('von')} {count}
          </span>
        </h2>
        <button onClick={close}>{t('Schließen')}</button>
      </header>
      <Suspense fallback={<p role="status">{t('Bild wird geladen...')}</p>}>
        <ImageViewer
          image={page.image}
          resetKey={page.id}
          locale={locale}
          alt={t('Vergrößerte Seite {number}', { number: index + 1 })}
        />
      </Suspense>
      <div className="viewer-actions">
        <button
          disabled={index === 0}
          onClick={() => move(index - 1)}
          aria-label={t('Vorherige Seite')}
        >
          {t('Zurück')}
        </button>
        <button
          disabled={index === count - 1}
          onClick={() => move(index + 1)}
          aria-label={t('Nächste Seite')}
        >
          {t('Weiter')}
        </button>
        <a
          className="primary"
          href={url}
          download={`scan-${index + 1}.${page.image.type === 'image/png' ? 'png' : 'jpg'}`}
        >
          {t('Herunterladen')}
        </a>
      </div>
    </dialog>
  );
}

function ImageResult({
  page,
  index,
  active,
  inspect,
}: {
  page: ScanPage;
  index: number;
  active: boolean;
  inspect: () => void;
}) {
  const { t } = useDemoLocale();
  const url = useUrl(page.image);
  return (
    <article className="result-page" hidden={!active}>
      <button
        className="result-image-button"
        aria-label={t('Seite {number} vergrößern', { number: index + 1 })}
        onClick={(event) => {
          event.currentTarget.focus();
          inspect();
        }}
      >
        {url ? (
          <img src={url} alt={t('Exportierte Seite {number}', { number: index + 1 })} />
        ) : (
          <span className="image-placeholder">{t('Bild wird geladen...')}</span>
        )}
        <span className="image-inspect">100 %</span>
      </button>
      <p className="result-dimensions">
        {page.metadata.outputSizePx.width} × {page.metadata.outputSizePx.height} px ·{' '}
        {(page.image.size / 1024).toFixed(0)} KiB
      </p>
    </article>
  );
}
export default function Results({
  result,
  reset,
  scan,
  hidden,
  back,
}: {
  result: Result;
  reset: () => void;
  scan: () => void;
  hidden: boolean;
  back: () => void;
}) {
  const { t } = useDemoLocale();
  const [index, setIndex] = useState(0),
    [view, setView] = useState<'image' | 'pdf'>('image'),
    [inspecting, setInspecting] = useState(false),
    [details, setDetails] = useState(false),
    [discard, setDiscard] = useState(false);
  const container = useRef<HTMLElement>(null);
  const infoTrigger = useRef<HTMLButtonElement>(null);
  const closeDetails = () => {
    setDetails(false);
    infoTrigger.current?.focus();
  };
  const pdfUrl = useUrl(result.pdf),
    imageUrl = useUrl(result.pages[index].image);
  return (
    <section
      ref={container}
      className="results"
      hidden={hidden}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && details) {
          event.preventDefault();
          closeDetails();
        }
      }}
    >
      <div className="result-heading">
        <h2>
          {t(result.pages.length === 1 ? '{count} Seite fertig' : '{count} Seiten fertig', {
            count: result.pages.length,
          })}
        </h2>
        <div className="actions">
          <button
            ref={infoTrigger}
            onClick={() => setDetails((v) => !v)}
            aria-label={t('Integrationsdetails')}
            aria-expanded={details}
          >
            {t('Info')}
          </button>
          <button onClick={scan} aria-label={t('Neues Dokument')}>
            {t('Neu')}
          </button>
          <button onClick={back}>{t('Zurück')}</button>
        </div>
      </div>
      {discard && (
        <div
          className="result-discard"
          role="alertdialog"
          aria-label={t('Ergebnisse verwerfen?')}
          aria-modal="false"
        >
          <p>{t('Ergebnisse aus diesem Browser entfernen?')}</p>
          <button autoFocus onClick={() => setDiscard(false)}>
            {t('Behalten')}
          </button>
          <button onClick={reset}>{t('Jetzt verwerfen')}</button>
        </div>
      )}
      <div className="result-switch" role="group" aria-label={t('Ergebnisansicht')}>
        <button aria-pressed={view === 'image'} onClick={() => setView('image')}>
          {t('Bilder')}
        </button>
        <button disabled={!result.pdf} aria-pressed={view === 'pdf'} onClick={() => setView('pdf')}>
          PDF
        </button>
      </div>
      <div className="result-pager">
        <button
          aria-label={t('Vorherige Seite')}
          disabled={index === 0}
          onClick={() => setIndex((i) => i - 1)}
        >
          ‹
        </button>
        <span>
          {t('Seite')} {index + 1} / {result.pages.length}
        </span>
        <button
          aria-label={t('Nächste Seite')}
          disabled={index === result.pages.length - 1}
          onClick={() => setIndex((i) => i + 1)}
        >
          ›
        </button>
      </div>
      <div className="result-grid" hidden={view !== 'image' || details}>
        {result.pages.map((page, i) => (
          <ImageResult
            key={page.id}
            page={page}
            index={i}
            active={i === index}
            inspect={() => setInspecting(true)}
          />
        ))}
      </div>
      {result.pdf && view === 'pdf' && !details && !hidden && (
        <section
          className="pdf-result"
          hidden={view !== 'pdf' || details}
          aria-label={t('PDF-Vorschau')}
        >
          <Suspense fallback={<p role="status">{t('PDF wird geladen...')}</p>}>
            <PdfPreview blob={result.pdf} activeIndex={index} />
          </Suspense>
        </section>
      )}
      <div className="result-downloads">
        <a
          className="primary"
          aria-label={t('Bild herunterladen')}
          href={imageUrl}
          download={`scan-${index + 1}.${result.pages[index].image.type === 'image/png' ? 'png' : 'jpg'}`}
        >
          {t('Bild laden')}
        </a>
        {result.pdf && (
          <a
            className="primary"
            aria-label={t('PDF herunterladen')}
            href={pdfUrl}
            download="scan.pdf"
          >
            {t('PDF laden')}
          </a>
        )}
      </div>
      <aside
        className="integration-details"
        hidden={!details}
        aria-label={t('Integrationsdetails')}
      >
        <header>
          <h3>{t('Integrationsdetails')}</h3>
          <button onClick={closeDetails} aria-label={t('Integrationsdetails schließen')}>
            {t('Schließen')}
          </button>
        </header>
        <button onClick={() => setDiscard(true)} aria-label={t('Ergebnisse verwerfen')}>
          {t('Ergebnisse verwerfen')}
        </button>
        <p>
          {t('Schema')} {result.schemaVersion} · PDF{' '}
          {result.pdf ? `${(result.pdf.size / 1024).toFixed(0)} KiB` : t('deaktiviert')}
        </p>
        <pre>
          {JSON.stringify(
            {
              sessionId: result.sessionId,
              pages: result.pages.map(({ image, original, ...page }) => page),
            },
            null,
            2,
          )}
        </pre>
      </aside>
      {inspecting && (
        <ResultViewer
          page={result.pages[index]}
          index={index}
          count={result.pages.length}
          close={() => setInspecting(false)}
          move={setIndex}
          restoreFocus={() =>
            container.current
              ?.querySelector<HTMLButtonElement>('.result-page:not([hidden]) button')
              ?.focus()
          }
        />
      )}
    </section>
  );
}
