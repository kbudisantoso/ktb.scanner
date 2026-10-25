'use client';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { DiagnosticRecording } from './diagnostics/recorder';
import { SCAN_PROFILES, SHUTTER_SOUNDS } from '@ktb/scanner';
import type { ScanResult, ScannerOptions, OpenOptions, ScanProfile } from '@ktb/scanner';
import { useUrl } from './blob-url';
import Results from './Results';
const Scanner = lazy(() =>
  import('@ktb/scanner/react').then((module) => ({ default: module.Scanner })),
);
type Result = Extract<ScanResult, { status: 'confirmed' }>;
type Request = {
  options: Omit<ScannerOptions, 'mount'>;
  initial: OpenOptions;
  trace?: DiagnosticRecording;
};
export default function Page() {
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
    [profile, setProfile] = useState<ScanProfile>('auto');
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
        theme: tokens,
        context,
        imageType: mime,
        shutterSound,
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
            Optionen
          </button>
          <button
            aria-label="Diagnosedaten für Erkennung und Export"
            aria-expanded={panel === 'diagnostics'}
            onClick={(e) => {
              panelTrigger.current = e.currentTarget;
              setPanel((p) => (p === 'diagnostics' ? null : 'diagnostics'));
            }}
          >
            Diagnose {diagnosticEnabled ? 'an' : 'aus'}
          </button>
        </div>
      </nav>
      {error && (
        <p className="app-error" role="alert">
          {error}
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
          <h1>Dokumente erfassen.</h1>
          <p className="intro">
            Aufnehmen oder importieren, Seiten prüfen und als Bild oder PDF mitnehmen.
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
              Dokument scannen <span aria-hidden="true">↗</span>
            </button>
            <button onClick={() => input.current?.click()} disabled={busy}>
              Bilder importieren
            </button>
          </div>
          <button className="text-button" onClick={() => void examples()} disabled={busy}>
            Mit zwei Beispielbelegen ausprobieren
          </button>
          {result && (
            <button onClick={() => setResultVisible(true)}>Letztes Ergebnis öffnen</button>
          )}
          <p className="privacy">Lokal im Browser · kein Upload.</p>
        </div>
      </section>
      <aside className="setup app-panel" hidden={panel !== 'options'} aria-label="Scanoptionen">
        <header>
          <h2>Scanoptionen</h2>
          <button onClick={closePanel} aria-label="Optionen schließen">
            Schließen
          </button>
        </header>
        <div className="setup-fields">
          <label>
            Startprofil
            <select
              aria-label="Startprofil"
              value={profile}
              disabled={busy}
              onChange={(e) => setProfile(e.target.value as ScanProfile)}
            >
              {SCAN_PROFILES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Dokumentkontext
            <select
              value={context}
              onChange={(e) => setContext(e.target.value as typeof context)}
              disabled={busy}
            >
              <option value="invoice">Rechnung</option>
              <option value="expense">Auslage</option>
              <option value="generic">Allgemein</option>
            </select>
          </label>
          <label>
            Gestaltung
            <select value={theme} onChange={(e) => setTheme(e.target.value)} disabled={busy}>
              <option value="forest">Wald</option>
              <option value="ink">Tinte</option>
            </select>
          </label>
          <label>
            Bildformat
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
            Aufnahmeton
            <select
              value={shutterSound}
              onChange={(e) => setShutterSound(e.target.value as typeof shutterSound)}
              disabled={busy}
            >
              {SHUTTER_SOUNDS.map((sound) => (
                <option key={sound.id} value={sound.id}>
                  {sound.label}
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
          Ton anhören
        </button>
        <audio ref={soundPreview} preload="none" />
      </aside>
      <section
        className="diagnostics app-panel"
        hidden={panel !== 'diagnostics'}
        aria-label="Diagnosedaten"
      >
        <header>
          <h2>Diagnose</h2>
          <button onClick={closePanel} aria-label="Diagnose schließen">
            Schließen
          </button>
        </header>
        <p className="diagnostic-summary">
          Aktueller Entwicklungsstand: standardmäßig an. Nur lokal im RAM.
        </p>
        <label className="diagnostic-toggle">
          <input
            type="checkbox"
            checked={diagnosticEnabled}
            disabled={busy || archiving}
            onChange={(event) => setDiagnosticEnabled(event.target.checked)}
          />
          Diagnose aufzeichnen
        </label>
        <label className="diagnostic-toggle">
          <input
            type="checkbox"
            checked={engineBuffers}
            disabled={busy || archiving || !diagnosticEnabled}
            onChange={(event) => setEngineBuffers(event.target.checked)}
          />
          Interne Scanic-Puffer einschließen
        </label>
        {recording && (
          <>
            <p role="status">
              {recording.summary.sessions} Sitzungen, {recording.summary.events} Ereignisse,{' '}
              {recording.summary.files} Dateien, {(recording.summary.bytes / 1024 ** 2).toFixed(1)}{' '}
              MiB.{' '}
              {recording.summary.stopped
                ? 'Aufzeichnungsgrenze erreicht; vorhandene Daten sind exportierbar.'
                : recording.summary.detailStopped
                  ? 'Detailgrenze erreicht; Fotos und Exporte werden weiter aufgezeichnet.'
                  : ''}
            </p>
            <div className="actions">
              <button
                disabled={busy || archiving || !recording.summary.events}
                onClick={() => void makeArchive()}
              >
                {archiving ? 'ZIP wird erstellt...' : 'Diagnose-ZIP erstellen'}
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
                  Diagnose-ZIP herunterladen
                </a>
              )}
              <button disabled={busy || archiving} onClick={clearDiagnostics}>
                Diagnosedaten löschen
              </button>
            </div>
          </>
        )}
        <details className="diagnostic-info">
          <summary>Umfang und Löschung</summary>
          <p>
            Originale, Zwischenbilder und Exporte bleiben lokal. Neuladen verwirft die Sammlung.
            Löschung nach einer Stunde ohne Download oder zehn Minuten nach Download.
          </p>{' '}
          <p>
            Die Aufzeichnung kostet zusätzliche Zeit. Interne Puffer ändern zusätzlich den
            Scanic-Verarbeitungspfad. Zwischenbilder maximal 1.000 px, verarbeitete Liveframes
            maximal 800 px; kein lückenloses Kameravideo. Livebilder: bis 240 Frames / 60 Sekunden.
            Gesamtbudget: 512 MiB, davon höchstens 128 MiB für Livebilder und interne Puffer. Der
            Rest bleibt für Fotos, Bildaufbereitung und Exporte reserviert. Das Budget gilt für alle
            gesammelten Sitzungen zusammen; vorhandene Daten werden nicht überschrieben.
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
              Scanner wird geöffnet...
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
