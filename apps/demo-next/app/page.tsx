'use client';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { DiagnosticRecording } from './diagnostics/recorder';
import {
  SCAN_PROFILES,
  SHUTTER_SOUNDS,
  AUTO_CAPTURE_STABILITY_PRESETS_MS,
  DEFAULT_AUTO_CAPTURE_STABILITY_MS,
} from '@ktb-tools/scanner';
import type { ScanResult, ScannerOptions, OpenOptions, ScanProfile } from '@ktb-tools/scanner';
import { useUrl } from './blob-url';
import Results from './Results';
import { useDemoLocale } from './i18n';
const Scanner = lazy(() =>
  import('@ktb-tools/scanner/react').then((module) => ({ default: module.Scanner })),
);
type Result = Extract<ScanResult, { status: 'confirmed' }>;
type Request = {
  options: Omit<ScannerOptions, 'mount'>;
  initial: OpenOptions;
  trace?: DiagnosticRecording;
};
export default function Page() {
  const { locale, setLocale, t } = useDemoLocale();
  const active = useRef(false),
    input = useRef<HTMLInputElement>(null),
    soundPreview = useRef<HTMLAudioElement>(null);
  const [resultVisible, setResultVisible] = useState(true);
  const [result, setResult] = useState<Result | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [diagnosticEnabled, setDiagnosticEnabled] = useState(false),
    [engineBuffers, setEngineBuffers] = useState(false),
    [recording, setRecording] = useState<DiagnosticRecording | null>(null),
    [archive, setArchive] = useState<Blob>(),
    [retentionRevision, setRetentionRevision] = useState(0),
    [archiving, setArchiving] = useState(false);
  const [request, setRequest] = useState<Request | null>(null),
    [panel, setPanel] = useState<'options' | 'diagnostics' | null>(null),
    [profile, setProfile] = useState<ScanProfile>('auto'),
    [captureWorkflow, setCaptureWorkflow] =
      useState<NonNullable<ScannerOptions['captureWorkflow']>>('continuous'),
    [stabilityMs, setStabilityMs] = useState(DEFAULT_AUTO_CAPTURE_STABILITY_MS);
  const panelTrigger = useRef<HTMLButtonElement | null>(null);
  const closePanel = () => {
    setPanel(null);
    panelTrigger.current?.focus();
  };
  const archiveUrl = useUrl(archive);
  const clearDiagnostics = () => {
    recording?.clear();
    setRecording(null);
    setArchive(undefined);
  };
  useEffect(() => {
    if (!recording || busy || archiving) return;
    const expire = () => {
      if (!recording.expired()) return;
      recording.clear();
      setRecording(null);
      setArchive(undefined);
    };
    const timer = setTimeout(expire, Math.max(0, recording.expiresAt - Date.now()));
    // Background tabs can suspend timers. Recheck the deadline on return.
    window.addEventListener('focus', expire);
    document.addEventListener('visibilitychange', expire);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', expire);
      document.removeEventListener('visibilitychange', expire);
    };
  }, [recording, busy, archiving, retentionRevision]);
  const makeArchive = async () => {
    if (!recording || busy || archiving) return;
    if (recording.expired()) {
      clearDiagnostics();
      return;
    }
    setArchiving(true);
    try {
      const { diagnosticZip } = await import('./diagnostics/zip');
      const snapshot = recording.snapshot();
      const manifest = new Blob([JSON.stringify(snapshot.manifest, null, 2)], {
        type: 'application/json',
      });
      setArchive(
        await diagnosticZip([{ path: 'manifest.json', blob: manifest }, ...snapshot.files]),
      );
    } catch {
      setError('Diagnosearchiv konnte nicht erstellt werden. Vorhandene Daten bleiben erhalten.');
    } finally {
      setArchiving(false);
    }
  };
  const [theme, setTheme] = useState('forest'),
    [shutterSound, setShutterSound] =
      useState<NonNullable<ScannerOptions['shutterSound']>>('camera'),
    [context, setContext] = useState<'invoice' | 'expense' | 'generic'>('invoice'),
    [mime, setMime] = useState<'image/jpeg' | 'image/png'>('image/jpeg');
  const soundFile = SHUTTER_SOUNDS.find((sound) => sound.id === shutterSound)?.file;
  useEffect(() => {
    const preview = soundPreview.current;
    return () => {
      preview?.pause();
      preview?.removeAttribute('src');
      preview?.load();
    };
  }, [shutterSound]);
  const open = (files?: File[]) => {
    if (active.current || archiving) return;
    active.current = true;
    soundPreview.current?.pause();
    setBusy(true);
    setError('');
    const environment = {
      userAgent: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    };
    const previous = recording && !recording.expired() ? recording : null;
    if (recording && !previous) clearDiagnostics();
    const trace = diagnosticEnabled
      ? (previous ?? new DiagnosticRecording(engineBuffers, environment))
      : undefined;
    const diagnosticOptions = trace
      ? previous
        ? trace.beginSession(engineBuffers, environment)
        : trace.options
      : undefined;
    if (trace) {
      setRecording(trace);
      setArchive(undefined);
    }
    const tokens: ScannerOptions['theme'] =
      theme === 'ink'
        ? {
            '--scanner-background': '#eeedf7',
            '--scanner-surface': '#fff',
            '--scanner-text': '#27233c',
            '--scanner-muted': '#615a76',
            '--scanner-accent': '#594a93',
            '--scanner-border': '#d6cfe5',
          }
        : {};
    setPanel(null);
    setRequest({
      options: {
        assetBaseUrl: '/scanner-assets/',
        locale,
        theme: tokens,
        context,
        imageType: mime,
        shutterSound,
        autoCaptureStabilityMs: stabilityMs,
        captureWorkflow,
        createPdf: true,
        diagnostics: diagnosticOptions,
        ...(profile === 'auto' ? {} : { defaultProfile: profile }),
      },
      initial: { initialFiles: files },
      trace,
    });
  };
  const complete = (next: ScanResult) => {
    request?.trace?.close();
    setRequest(null);
    active.current = false;
    setBusy(false);
    if (next.status === 'confirmed') {
      setResult(next);
      setResultVisible(true);
    }
  };
  const examples = async () => {
    try {
      const { exampleFiles } = await import('./fixtures');
      await open(await exampleFiles());
    } catch {
      setError('Beispielbilder konnten nicht erstellt werden.');
    }
  };
  return (
    <main
      data-theme={theme}
      className={result && resultVisible ? 'has-result' : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && panel) {
          e.preventDefault();
          closePanel();
        }
      }}
    >
      <nav className="app-nav">
        <a className="wordmark" href="/">
          ktb.scanner
        </a>
        <div className="actions">
          <button
            aria-expanded={panel === 'options'}
            onClick={(e) => {
              panelTrigger.current = e.currentTarget;
              setPanel((p) => (p === 'options' ? null : 'options'));
            }}
          >
            {t('Optionen')}
          </button>
          <button
            aria-label={t('Diagnosedaten für Erkennung und Export')}
            aria-expanded={panel === 'diagnostics'}
            onClick={(e) => {
              panelTrigger.current = e.currentTarget;
              setPanel((p) => (p === 'diagnostics' ? null : 'diagnostics'));
            }}
          >
            {t(diagnosticEnabled ? 'Diagnose an' : 'Diagnose aus')}
          </button>
        </div>
      </nav>
      {error && (
        <p className="app-error" role="alert">
          {t(error)}
        </p>
      )}
      {result && (
        <Results
          key={result.sessionId}
          result={result}
          hidden={!!panel || !resultVisible}
          back={() => setResultVisible(false)}
          reset={() => setResult(null)}
          scan={() => open()}
        />
      )}
      <section className="hero" hidden={(!!result && resultVisible) || !!panel}>
        <div>
          <h1>{t('Dokumente erfassen.')}</h1>
          <p className="intro">
            {t('Aufnehmen oder importieren, Seiten prüfen und als Bild oder PDF mitnehmen.')}
          </p>
          <div className="actions">
            <button
              className="primary"
              onClick={(event) => {
                event.currentTarget.focus();
                void open();
              }}
              aria-disabled={busy}
            >
              {t('Dokument scannen')} <span aria-hidden="true">↗</span>
            </button>
            <button onClick={() => input.current?.click()} disabled={busy}>
              {t('Bilder importieren')}
            </button>
          </div>
          <button className="text-button" onClick={() => void examples()} disabled={busy}>
            {t('Mit zwei Beispielbelegen ausprobieren')}
          </button>
          {result && (
            <button onClick={() => setResultVisible(true)}>{t('Letztes Ergebnis öffnen')}</button>
          )}
          <p className="privacy">
            {t('Lokal im Browser · kein Upload.')}{' '}
            <a href="/third-party-notices.txt" target="_blank" rel="noreferrer">
              {t('Lizenzen')}
            </a>
            {' · '}
            <a href="https://github.com/kbudisantoso/ktb.scanner" target="_blank" rel="noreferrer">
              {t('Quellcode')}
            </a>
          </p>
        </div>
      </section>
      <aside
        className="setup app-panel"
        hidden={panel !== 'options'}
        aria-label={t('Scanoptionen')}
      >
        <header>
          <h2>{t('Scanoptionen')}</h2>
          <button onClick={closePanel} aria-label={t('Optionen schließen')}>
            {t('Schließen')}
          </button>
        </header>
        <div className="setup-fields">
          <label>
            {t('Sprache')}
            <select
              aria-label="Sprache / Language"
              value={locale}
              disabled={busy}
              onChange={(event) => setLocale(event.target.value as 'en' | 'de')}
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </label>
          <label>
            {t('Stabilisierungsdauer')}
            <select
              aria-label={t('Stabilisierungsdauer')}
              value={stabilityMs}
              disabled={busy}
              onChange={(e) => setStabilityMs(Number(e.target.value))}
            >
              {AUTO_CAPTURE_STABILITY_PRESETS_MS.map((duration) => (
                <option key={duration} value={duration}>
                  {duration} ms
                  {duration === DEFAULT_AUTO_CAPTURE_STABILITY_MS ? ` (${t('Standard')})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Aufnahmeablauf')}
            <select
              aria-label={t('Aufnahmeablauf')}
              value={captureWorkflow}
              disabled={busy}
              onChange={(event) =>
                setCaptureWorkflow(
                  event.target.value as NonNullable<ScannerOptions['captureWorkflow']>,
                )
              }
            >
              <option value="continuous">{t('Mehrere Seiten aufnehmen')}</option>
              <option value="review-each">{t('Nach jeder Aufnahme prüfen')}</option>
            </select>
          </label>
          <label>
            {t('Startprofil')}
            <select
              aria-label={t('Startprofil')}
              value={profile}
              disabled={busy}
              onChange={(e) => setProfile(e.target.value as ScanProfile)}
            >
              {SCAN_PROFILES.map((p) => (
                <option key={p.id} value={p.id}>
                  {t(p.label)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Dokumentkontext')}
            <select
              value={context}
              onChange={(e) => setContext(e.target.value as typeof context)}
              disabled={busy}
            >
              <option value="invoice">{t('Rechnung')}</option>
              <option value="expense">{t('Auslage')}</option>
              <option value="generic">{t('Allgemein')}</option>
            </select>
          </label>
          <label>
            {t('Gestaltung')}
            <select value={theme} onChange={(e) => setTheme(e.target.value)} disabled={busy}>
              <option value="forest">{t('Wald')}</option>
              <option value="ink">{t('Tinte')}</option>
            </select>
          </label>
          <label>
            {t('Bildformat')}
            <select
              value={mime}
              onChange={(e) => setMime(e.target.value as typeof mime)}
              disabled={busy}
            >
              <option value="image/jpeg">JPEG</option>
              <option value="image/png">PNG</option>
            </select>
          </label>
          <label>
            {t('Aufnahmeton')}
            <select
              value={shutterSound}
              onChange={(e) => setShutterSound(e.target.value as typeof shutterSound)}
              disabled={busy}
            >
              {SHUTTER_SOUNDS.map((sound) => (
                <option key={sound.id} value={sound.id}>
                  {t(sound.label)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          disabled={busy || !soundFile}
          onClick={() => {
            const audio = soundPreview.current;
            if (!audio || !soundFile) return;
            const source = `/scanner-assets/${soundFile}`;
            if (audio.getAttribute('src') !== source) audio.src = source;
            audio.currentTime = 0;
            void audio.play().catch(() => setError('Der Ton konnte nicht abgespielt werden.'));
          }}
        >
          {t('Ton anhören')}
        </button>
        <audio ref={soundPreview} preload="none" />
      </aside>
      <section
        className="diagnostics app-panel"
        hidden={panel !== 'diagnostics'}
        aria-label={t('Diagnosedaten')}
      >
        <header>
          <h2>{t('Diagnose')}</h2>
          <button onClick={closePanel} aria-label={t('Diagnose schließen')}>
            {t('Schließen')}
          </button>
        </header>
        <p className="diagnostic-summary">
          {t('Diagnose optional; standardmäßig aus. Nur lokal im RAM.')}
        </p>
        <label className="diagnostic-toggle">
          <input
            type="checkbox"
            checked={diagnosticEnabled}
            disabled={busy || archiving}
            onChange={(event) => setDiagnosticEnabled(event.target.checked)}
          />
          {t('Diagnose aufzeichnen')}
        </label>
        <label className="diagnostic-toggle">
          <input
            type="checkbox"
            checked={engineBuffers}
            disabled={busy || archiving || !diagnosticEnabled}
            onChange={(event) => setEngineBuffers(event.target.checked)}
          />
          {t('Interne Scanic-Puffer einschließen')}
        </label>
        {recording && (
          <>
            <p role="status">
              {recording.summary.sessions} {t('Sitzungen,')} {recording.summary.events}{' '}
              {t('Ereignisse,')} {recording.summary.files} {t('Dateien,')}{' '}
              {(recording.summary.bytes / 1024 ** 2).toFixed(1)} MiB.{' '}
              {t(
                recording.summary.stopped
                  ? 'Aufzeichnungsgrenze erreicht; vorhandene Daten sind exportierbar.'
                  : recording.summary.detailStopped
                    ? 'Detailgrenze erreicht; Fotos und Exporte werden weiter aufgezeichnet.'
                    : '',
              )}
            </p>
            <div className="actions">
              <button
                disabled={busy || archiving || !recording.summary.events}
                onClick={() => void makeArchive()}
              >
                {t(archiving ? 'ZIP wird erstellt...' : 'Diagnose-ZIP erstellen')}
              </button>
              {archiveUrl && (
                <a
                  href={archiveUrl}
                  download="scanner-diagnose.zip"
                  onClick={(event) => {
                    if (recording.expired()) {
                      event.preventDefault();
                      clearDiagnostics();
                      return;
                    }
                    recording.markDownloaded();
                    // Refresh the timer even when the same archive is downloaded again.
                    setRetentionRevision((value) => value + 1);
                  }}
                >
                  {t('Diagnose-ZIP herunterladen')}
                </a>
              )}
              <button disabled={busy || archiving} onClick={clearDiagnostics}>
                {t('Diagnosedaten löschen')}
              </button>
            </div>
          </>
        )}
        <details className="diagnostic-info">
          <summary>{t('Umfang und Löschung')}</summary>
          <p>
            {t(
              'Originale, Zwischenbilder und Exporte bleiben lokal. Neuladen verwirft die Sammlung. Löschung nach einer Stunde ohne Download oder zehn Minuten nach Download.',
            )}
          </p>{' '}
          <p>
            {t(
              'Die Aufzeichnung kostet zusätzliche Zeit. Interne Puffer ändern zusätzlich den Scanic-Verarbeitungspfad. Zwischenbilder maximal 1.000 px, verarbeitete Liveframes maximal 800 px; kein lückenloses Kameravideo. Livebilder: bis 240 Frames / 60 Sekunden. Gesamtbudget: 512 MiB, davon höchstens 128 MiB für Livebilder und interne Puffer. Der Rest bleibt für Fotos, Bildaufbereitung und Exporte reserviert. Das Budget gilt für alle gesammelten Sitzungen zusammen; vorhandene Daten werden nicht überschrieben.',
            )}
          </p>
        </details>
      </section>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) void open(files);
        }}
      />
      {request && (
        <Suspense
          fallback={
            <p className="app-loading" role="status">
              {t('Scanner wird geöffnet...')}
            </p>
          }
        >
          <Scanner
            open
            options={request.options}
            openOptions={request.initial}
            onResult={complete}
            onError={() => {
              setError('Scanner konnte nicht geöffnet werden. Bitte erneut versuchen.');
              complete({ status: 'cancelled' });
            }}
          />
        </Suspense>
      )}
    </main>
  );
}
