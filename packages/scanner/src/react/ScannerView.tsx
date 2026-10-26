import { diagnose } from '../diagnostics.ts';
import { useEffect, useRef, useState } from 'react';
import { ReviewTools, REVIEW_TITLES, type ReviewPanel } from './ReviewTools.tsx';
import { ImageViewer } from './ImageViewer.tsx';
import { ToolIcon } from './ToolIcon.tsx';
import { initialProfile, profileRecipe } from '../profiles.ts';
import { resolveAutoCaptureStabilityMs } from '../capture.ts';
import { createTranslator, type Translate } from '../i18n.ts';
import type {
  CaptureMode,
  CaptureHint,
  EngineAdapter,
  ImageMime,
  OpenOptions,
  PageDraft,
  Quad,
  ScannerOptions,
  ScannerPreferenceChange,
  ScanResult,
  FormatSelection,
  PaperPreference,
  CropRequired,
  Recipe,
} from '../types.ts';
import { ScanSession, resolveLimits } from '../session.ts';
import { suggestFormat } from '../geometry.ts';
import { createScanicAdapter } from '../scanic.ts';
import { aborted, errorMessage } from '../errors.ts';
import { useBlobUrl } from './hooks.ts';
import { CornerEditor } from './CornerEditor.tsx';
import { CameraView } from './CameraView.tsx';
import { ShutterSound } from '../shutter-sound.ts';
import { resolveShutterSoundUrl } from '../sounds.ts';
type Edit = Pick<PageDraft, 'recipe' | 'format' | 'rotation' | 'corners' | 'edgesUncertain'>;
const editOf = ({ recipe, format, rotation, corners, edgesUncertain }: PageDraft): Edit =>
  structuredClone({ recipe, format, rotation, corners, edgesUncertain });
function PageImage({ blob, alt, t }: { blob: Blob; alt: string; t: Translate }) {
  const url = useBlobUrl(blob);
  return url ? (
    <img src={url} alt={alt} />
  ) : (
    <div className="scanner-image-loading" aria-label={t('Vorschau wird geladen')} />
  );
}
export function ScannerView({
  options,
  paperPreference,
  initial,
  signal,
  finish,
}: {
  options: ScannerOptions;
  paperPreference: PaperPreference;
  initial: OpenOptions;
  signal: AbortSignal;
  finish: (result: ScanResult) => void;
}) {
  const t = createTranslator(options.locale, options.texts);
  const [session] = useState(() => new ScanSession(resolveLimits(options.limits)));
  const [pages, setPages] = useState<readonly PageDraft[]>([]),
    [draft, setDraft] = useState<PageDraft | null>(null);
  const [pendingCrop, setPendingCrop] = useState<
    | (CropRequired & {
        original: Blob;
        source: 'camera' | 'file';
        id: string;
        revision: number;
        recipe: Recipe;
        format?: FormatSelection;
      })
    | null
  >(null);
  const [mode, setMode] = useState<CaptureMode>(options.initialMode ?? 'auto'),
    [mime, setMime] = useState<ImageMime>(options.imageType ?? 'image/jpeg');
  const [camera, setCamera] = useState(initial.entry === 'camera' && !initial.initialFiles?.length),
    [editingCorners, setEditingCorners] = useState(false);
  const repeatFocus = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [discard, setDiscard] = useState(false);
  const [activePageId, setActivePageId] = useState<string>();
  const [pageActions, setPageActions] = useState(false);
  const [reviewPanel, setReviewPanel] = useState<ReviewPanel | null>(null);
  const readOnlyPanel = reviewPanel === 'quality' || reviewPanel === 'original';
  const [pageGrid, setPageGrid] = useState(false);
  const [history, setHistory] = useState<Edit[]>([]);
  const panelSnapshot = useRef<Edit | null>(null);
  const panelHistory = useRef<Edit[]>([]);
  useEffect(() => {
    setReviewPanel(null);
    setHistory([]);
  }, [draft?.id]);
  const activePageIndex = Math.max(
    0,
    pages.findIndex((p) => p.id === activePageId),
  );
  const [status, setStatus] = useState('');
  const engine = useRef<EngineAdapter | null>(null),
    guard = useRef(false),
    replaceId = useRef<string | undefined>(undefined);
  const queue = useRef<File[]>([]),
    input = useRef<HTMLInputElement>(null),
    root = useRef<HTMLElement>(null);
  const alive = useRef(true);
  // Update synchronously: repeated input events can arrive before React renders again.
  const preferences = useRef({ initialMode: mode, imageType: mime });
  const notifyPreference = (change: ScannerPreferenceChange) => {
    try {
      // Host persistence may be asynchronous. Neither throws nor rejected promises own the scan.
      void Promise.resolve(options.onPreferenceChange?.(change)).catch(() => {});
    } catch {
      // The UI change is already applied; a host callback cannot roll it back.
    }
  };
  const changeMode = (value: CaptureMode) => {
    if (
      !alive.current ||
      signal.aborted ||
      !['auto', 'manual'].includes(value) ||
      value === preferences.current.initialMode
    )
      return;
    preferences.current.initialMode = value;
    setMode(value);
    notifyPreference({ preference: 'initialMode', value });
  };
  const changeImageType = (value: string) => {
    if (
      !alive.current ||
      signal.aborted ||
      (value !== 'image/jpeg' && value !== 'image/png') ||
      value === preferences.current.imageType
    )
      return;
    preferences.current.imageType = value;
    setMime(value);
    notifyPreference({ preference: 'imageType', value });
  };
  useEffect(() => {
    if (pageActions)
      root.current
        ?.querySelector<HTMLButtonElement>(
          '.scanner-pages article[data-selected="true"] button[aria-expanded]',
        )
        ?.focus();
  }, [activePageIndex, pageActions]);
  const shutter = useRef<ShutterSound | null>(null);
  const shutterUrl = resolveShutterSoundUrl(options);
  const prepareSound = () => {
    if (!shutterUrl) return;
    (shutter.current ??= new ShutterSound(shutterUrl)).prepare();
  };
  const startCamera = () => {
    prepareSound();
    setCamera(true);
  };
  const repeatCapture = () => {
    if (guard.current) return;
    repeatFocus.current = true;
    startCamera();
  };
  useEffect(() => {
    if (camera || busy || discard || !repeatFocus.current) return;
    const button = root.current?.querySelector<HTMLButtonElement>('.scanner-repeat');
    if (button) {
      repeatFocus.current = false;
      button.focus();
    }
  }, [camera, busy, discard, draft, pendingCrop]);
  const syncPages = () => setPages(session.pages);
  const getEngine = () =>
    (engine.current ??= createScanicAdapter(options.assetBaseUrl, options.diagnostics));
  const begin = (): boolean => {
    if (guard.current || signal.aborted) return false;
    guard.current = true;
    setBusy(true);
    setError('');
    return true;
  };
  const end = () => {
    guard.current = false;
    if (alive.current && !signal.aborted) {
      setBusy(false);
      setStatus('');
    }
  };
  const handleError = (err: unknown) => {
    diagnose(options.diagnostics, 'session-error', { message: errorMessage(err) });
    if (!signal.aborted && alive.current) setError(t(errorMessage(err)));
  };
  const processInput = async (
    original: Blob,
    source: 'camera' | 'file',
    captureHint?: CaptureHint,
    queued = false,
  ) => {
    if (!begin()) return;
    if (source !== 'camera') setCamera(false);
    setStatus(t('Dokument wird aufbereitet...'));
    try {
      diagnose(options.diagnostics, 'source', { source, replaceId: replaceId.current });
      session.checkImport(original, replaceId.current);
      const old = session.pages.find((p) => p.id === replaceId.current);
      const revision = old ? old.revision + 1 : 1;
      const id = old?.id ?? crypto.randomUUID();
      const recipe = profileRecipe(initialProfile(options.defaultProfile, initial.defaultProfile));
      const result = await getEngine().process(
        {
          original,
          captureHint,
          diagnosticContext: { pageId: id, source, operation: 'initial' },
          limits: session.limits,
          rotation: 0,
          recipe,
          revision,
          mime: 'image/jpeg',
          format: old?.format.origin === 'user' ? old.format : undefined,
          preferredPaper: paperPreference,
        },
        signal,
      );
      aborted(signal);
      if (queued && queue.current[0] === original) queue.current.shift();
      setPageGrid(false);
      if ('status' in result) {
        setDraft(null);
        setPendingCrop({
          ...result,
          original,
          source,
          id,
          revision,
          recipe,
          format: old?.format.origin === 'user' ? old.format : undefined,
        });
        return;
      }
      const format =
        old?.format.origin === 'user'
          ? old.format
          : (result.format ??
            suggestFormat(result.size, {
              corners: result.corners,
              preferredPaper: paperPreference,
              geometryUncertain: result.edgesUncertain,
            }));
      setPendingCrop(null);
      setDraft({
        ...result,
        id,
        revision,
        original,
        source,
        rotation: 0,
        recipe,
        format,
      });
    } catch (err) {
      handleError(err);
    } finally {
      if (source === 'camera' && alive.current && !signal.aborted) setCamera(false);
      end();
    }
  };
  const startFiles = (files: File[]) => {
    if (guard.current || !files.length) return;
    if (queue.current.length) {
      setError(t('Bitte verbleibende Importe zuerst prüfen oder verwerfen.'));
      return;
    }
    if (replaceId.current && files.length > 1) {
      setError(t('Zum Ersetzen bitte genau ein Bild auswählen.'));
      return;
    }
    queue.current = files;
    void processInput(files[0], 'file', undefined, true);
  };
  const reprocess = async (changes: Partial<PageDraft>, recordHistory = true) => {
    if (!draft || !begin()) return;
    const next = { ...draft, ...changes, revision: draft.revision + 1 };
    setStatus(t('Änderung wird berechnet...'));
    try {
      const result = await getEngine().process(
        {
          original: next.original,
          diagnosticContext: { pageId: next.id, source: next.source, operation: 'edit' },
          limits: session.limits,
          corners: next.corners,
          format:
            changes.corners && !changes.format && next.format.origin !== 'user'
              ? undefined
              : next.format,
          preferredPaper: paperPreference,
          rotation: next.rotation,
          recipe: next.recipe,
          revision: next.revision,
          mime: 'image/jpeg',
        },
        signal,
      );
      aborted(signal);
      if ('status' in result) throw new Error('Confirmed crop unexpectedly requires confirmation');
      diagnose(options.diagnostics, 'edit', {
        pageId: next.id,
        revision: next.revision,
        corners: next.corners,
        rotation: next.rotation,
        format: result.format ?? next.format,
        recipe: next.recipe,
      });
      if (recordHistory) setHistory((previous) => [...previous.slice(-11), editOf(draft)]);
      setDraft({
        ...next,
        ...result,
        format:
          next.format.origin === 'user'
            ? next.format
            : (result.format ??
              suggestFormat(result.size, {
                corners: result.corners,
                preferredPaper: paperPreference,
              })),
        edgesUncertain: next.edgesUncertain,
        quality: next.edgesUncertain
          ? {
              ...result.quality,
              assessment: result.quality.assessment === 'unknown' ? 'unknown' : 'review-advised',
              reasons: [...new Set([...result.quality.reasons, 'edges' as const])],
            }
          : result.quality,
      });
      return true;
    } catch (err) {
      handleError(err);
      return false;
    } finally {
      end();
    }
  };
  const applyPendingCrop = async (corners: Quad) => {
    if (!pendingCrop || !begin()) return;
    const pending = pendingCrop;
    setStatus(t('Dokument wird aufbereitet...'));
    try {
      const result = await getEngine().process(
        {
          original: pending.original,
          diagnosticContext: { pageId: pending.id, source: pending.source, operation: 'edit' },
          limits: session.limits,
          corners,
          format: pending.format,
          preferredPaper: paperPreference,
          rotation: 0,
          recipe: pending.recipe,
          revision: pending.revision,
          mime: 'image/jpeg',
        },
        signal,
      );
      aborted(signal);
      if ('status' in result) throw new Error('Confirmed crop unexpectedly requires confirmation');
      setDraft({
        ...result,
        original: pending.original,
        source: pending.source,
        id: pending.id,
        revision: pending.revision,
        recipe: pending.recipe,
        rotation: 0,
        format:
          result.format ?? suggestFormat(result.size, { corners, preferredPaper: paperPreference }),
      });
      setPendingCrop(null);
      diagnose(options.diagnostics, 'crop-confirmed', { pageId: pending.id, corners });
    } catch (err) {
      handleError(err);
    } finally {
      end();
    }
  };
  const saveDraft = (): PageDraft | undefined => {
    if (!draft || guard.current) return;
    try {
      const replacing = replaceId.current ?? session.pages.find((page) => page.id === draft.id)?.id;
      session.accept(draft, replacing);
      const saved = session.pages.find((p) => p.id === replacing) ?? session.pages.at(-1)!;
      diagnose(options.diagnostics, 'page-accepted', {
        draftId: draft.id,
        pageId: saved.id,
        pages: session.pages.map(
          ({ original, preview, unoptimizedPreview, thumbnail, ...page }) => page,
        ),
      });
      syncPages();
      setActivePageId(saved.id);
      replaceId.current = saved.id;
      setDraft(saved);
      return saved;
    } catch (err) {
      handleError(err);
    }
  };
  const editPage = (page: PageDraft) => {
    replaceId.current = page.id;
    setActivePageId(page.id);
    setPageActions(false);
    setPageGrid(false);
    setReviewPanel(null);
    setDraft(structuredClone(page));
  };
  const navigate = (delta: number) => {
    const saved = saveDraft();
    if (!saved) return;
    const items = session.pages,
      index = items.findIndex((p) => p.id === saved.id),
      next = items[index + delta];
    if (next) editPage(next);
    else if (delta > 0 && queue.current.length) {
      replaceId.current = undefined;
      setDraft(null);
      setPageGrid(true);
      void processInput(queue.current[0], 'file', undefined, true);
    }
  };
  const showPages = () => {
    if (draft && !saveDraft()) return;
    setPageGrid(true);
    setPageActions(false);
  };
  const openPanel = (panel: ReviewPanel | null) => {
    if (guard.current) return;
    if (panel && draft) {
      panelSnapshot.current = editOf(draft);
      panelHistory.current = history.slice();
    }
    setReviewPanel(panel);
  };
  const cancelPanel = () => {
    if (guard.current) return;
    const previous = panelSnapshot.current;
    const restore = () => {
      setReviewPanel(null);
      panelSnapshot.current = null;
      setHistory(panelHistory.current);
    };
    if (previous && draft && JSON.stringify(previous) !== JSON.stringify(editOf(draft))) {
      void reprocess(previous, false).then((success) => {
        if (success) restore();
      });
    } else restore();
  };
  const undo = () => {
    if (!history.length || guard.current) return;
    const previous = history.at(-1)!;
    void reprocess(previous, false).then((success) => {
      if (success && !guard.current) setHistory((items) => items.slice(0, -1));
    });
  };
  const discardDraft = () => {
    if (guard.current) return;
    setDraft(null);
    setPageGrid(false);
    setEditingCorners(false);
    replaceId.current = undefined;
    setError('');
    if (queue.current.length) void processInput(queue.current[0], 'file', undefined, true);
    else setPageGrid(true);
  };
  const exportAll = async () => {
    if (!begin()) return;
    setStatus(t('Bilder und PDF werden erstellt...'));
    try {
      const { exportDocument } = await import('../export.ts');
      const result = await session.export((snapshot) =>
        exportDocument({
          pages: snapshot,
          sessionId: session.id,
          engine: getEngine(),
          limits: session.limits,
          mime,
          pdf: options.createPdf !== false,
          originals: options.includeOriginals === true,
          assetBaseUrl: options.assetBaseUrl,
          diagnostics: options.diagnostics,
          signal,
        }),
      );
      aborted(signal);
      finish(result);
    } catch (err) {
      handleError(err);
    } finally {
      end();
    }
  };
  useEffect(() => {
    alive.current = true;
    if (signal.aborted) return;
    if (shutterUrl) (shutter.current ??= new ShutterSound(shutterUrl)).preload();
    root.current?.focus();
    if (initial.initialFiles?.length) startFiles(initial.initialFiles);
    return () => {
      alive.current = false;
      engine.current?.destroy();
      shutter.current?.destroy();
      session.clear();
      queue.current = [];
    };
  }, []);
  const close = () => {
    if (pages.length || draft || pendingCrop || busy) setDiscard(true);
    else finish({ status: 'cancelled' });
  };
  const keyboard = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && reviewPanel && draft && !editingCorners) {
      event.preventDefault();
      cancelPanel();
      return;
    }
    if (event.key === 'Escape' && pageActions) {
      event.preventDefault();
      setPageActions(false);
      root.current
        ?.querySelector<HTMLButtonElement>(
          '.scanner-pages article[data-selected="true"] button[aria-expanded]',
        )
        ?.focus();
      return;
    }
    if (event.key === 'Escape' && !editingCorners && !pendingCrop) {
      event.preventDefault();
      close();
    }
    if (event.key !== 'Tab') return;
    const items = [
      ...root.current!.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]',
      ),
    ].filter((el) => el.getClientRects().length > 0);
    const first = items[0],
      last = items.at(-1);
    if (!first) {
      event.preventDefault();
      return;
    }
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === root.current)
    ) {
      event.preventDefault();
      last?.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || document.activeElement === root.current)
    ) {
      event.preventDefault();
      first.focus();
    }
  };
  return (
    <section
      ref={root}
      className={`scanner${camera && !discard ? ' scanner-camera-mode' : ' scanner-workspace'}`}
      role="dialog"
      aria-modal="true"
      aria-busy={busy}
      aria-label={t('Dokument scannen')}
      lang={options.locale ?? 'en'}
      tabIndex={-1}
      onKeyDown={keyboard}
      style={options.theme as React.CSSProperties}
    >
      <header className="scanner-header">
        <div>
          <h2>
            {reviewPanel
              ? t(REVIEW_TITLES[reviewPanel])
              : editingCorners
                ? t('Ecken')
                : pageGrid
                  ? t('Deine Seiten')
                  : pendingCrop
                    ? t('Dokumentecken festlegen')
                    : draft
                      ? t('Seite prüfen')
                      : camera
                        ? t('Dokument aufnehmen')
                        : t('Deine Seiten')}
          </h2>
        </div>
        <div className="scanner-header-actions">
          {options.diagnostics && (
            <span
              className="scanner-diagnostic-badge"
              aria-label={t('Diagnoseaufzeichnung aktiviert')}
            >
              {t('Diagnose an')}
            </span>
          )}
          {draft && !reviewPanel && !editingCorners && !camera && !pageGrid && (
            <>
              <button
                disabled={busy}
                aria-label={t('Weitere Seite')}
                onClick={() => {
                  if (saveDraft()) {
                    replaceId.current = undefined;
                    setDraft(null);
                    setPageGrid(true);
                    startCamera();
                  }
                }}
              >
                <ToolIcon name="plus" />
              </button>
              <button
                disabled={busy}
                aria-label={`${t('Seitenübersicht')} (${pages.length + (replaceId.current ? 0 : 1)})`}
                onClick={showPages}
              >
                <ToolIcon name="grid" />
              </button>
            </>
          )}
          <button aria-label={t('Schließen')} title={t('Schließen')} onClick={close}>
            <ToolIcon name="close" />
          </button>
        </div>
      </header>
      <div className="scanner-body">
        {discard ? (
          <section className="scanner-confirm">
            <h3>{t('Scans verwerfen?')}</h3>
            <p>{t('Die aktuelle Sitzung ist nur im Arbeitsspeicher gespeichert.')}</p>
            <div className="scanner-actions">
              <button autoFocus onClick={() => setDiscard(false)}>
                {t('Weiter bearbeiten')}
              </button>
              <button onClick={() => finish({ status: 'cancelled' })}>
                {t('Scans verwerfen')}
              </button>
            </div>
          </section>
        ) : (
          <>
            {error && (
              <p className="scanner-warning" role="alert">
                {error}
              </p>
            )}
            {busy && !camera && (
              <p role="status" className="scanner-status">
                {status}
              </p>
            )}
            {camera && (
              <CameraView
                signal={signal}
                assetBaseUrl={options.assetBaseUrl}
                diagnostics={options.diagnostics}
                limits={session.limits}
                mode={mode}
                stabilityMs={resolveAutoCaptureStabilityMs(
                  options.autoCaptureStabilityMs,
                  initial.autoCaptureStabilityMs,
                )}
                setMode={changeMode}
                onShutter={() => shutter.current?.play() ?? false}
                onPrepareSound={prepareSound}
                onCapture={(blob, hint) => void processInput(blob, 'camera', hint)}
                onCancel={() => setCamera(false)}
                onClose={close}
                onImport={() => input.current?.click()}
                pageCount={pages.length}
                t={t}
              />
            )}
            {pendingCrop && !camera && (
              <>
                <div className="scanner-crop-guidance">
                  <p className="scanner-warning">{t('Bitte die vier Blattecken bestätigen.')}</p>
                  <button className="scanner-repeat" disabled={busy} onClick={repeatCapture}>
                    {t('Wiederholen')}
                  </button>
                </div>
                <CornerEditor
                  page={pendingCrop}
                  t={t}
                  disabled={busy}
                  onApply={(corners) => void applyPendingCrop(corners)}
                  onCancel={() => {
                    if (!guard.current) {
                      setPendingCrop(null);
                      setPageGrid(true);
                      replaceId.current = undefined;
                      if (queue.current.length)
                        void processInput(queue.current[0], 'file', undefined, true);
                    }
                  }}
                />
              </>
            )}
            {draft &&
              !camera &&
              !pageGrid &&
              (editingCorners ? (
                <CornerEditor
                  page={draft}
                  t={t}
                  onCancel={() => setEditingCorners(false)}
                  onApply={(corners: Quad) => {
                    setEditingCorners(false);
                    void reprocess({ corners, edgesUncertain: false });
                  }}
                />
              ) : (
                <div className={`scanner-review${reviewPanel ? ' scanner-detail' : ''}`}>
                  <ImageViewer
                    image={reviewPanel === 'original' ? draft.original : draft.preview}
                    before={reviewPanel === 'original' ? undefined : draft.unoptimizedPreview}
                    resetKey={`${draft.id}:${draft.rotation}:${reviewPanel === 'original' ? 'original' : 'crop'}`}
                    alt={
                      reviewPanel === 'original' ? t('Originalaufnahme') : t('Bearbeitete Seite')
                    }
                    texts={options.texts}
                    locale={options.locale}
                  />
                  <ReviewTools
                    key={draft.id}
                    draft={draft}
                    busy={busy}
                    panel={reviewPanel}
                    setPanel={openPanel}
                    t={t}
                    change={(patch) => void reprocess(patch)}
                    layout={(format) => setDraft((current) => current && { ...current, format })}
                    corners={() => {
                      setReviewPanel(null);
                      setEditingCorners(true);
                    }}
                    undo={undo}
                    canUndo={!!history.length}
                    discard={discardDraft}
                    repeat={repeatCapture}
                  />
                </div>
              ))}
            {(!draft || pageGrid) && !camera && !pendingCrop && (
              <div className="scanner-page-workspace">
                {!pages.length && (
                  <div className="scanner-empty">
                    <h3>{t('Ein Dokument. Ein klarer Scan.')}</h3>
                    <p>
                      {t(
                        'Fotografiere eine Seite oder importiere ein vorhandenes Bild. Danach kannst du Ränder und Darstellung prüfen.',
                      )}
                    </p>
                    <p className="scanner-muted">
                      {t('JPEG, PNG und WebP. Die Verarbeitung bleibt in diesem Browser.')}
                    </p>
                  </div>
                )}
                {replaceId.current && !draft && (
                  <p role="status">
                    {t(
                      'Ersatz aufnehmen oder importieren. Die bisherige Seite bleibt bis zur Übernahme erhalten.',
                    )}{' '}
                    <button
                      onClick={() => {
                        replaceId.current = undefined;
                        setDraft(null);
                        queue.current = [];
                        setError('');
                        syncPages();
                      }}
                    >
                      {t('Ersetzen abbrechen')}
                    </button>
                  </p>
                )}
                <div className="scanner-pages">
                  {pages.map((page, index) => (
                    <article key={page.id} data-selected={page.id === activePageId}>
                      <button
                        className="scanner-page-tile"
                        disabled={busy}
                        aria-label={`${t('Seite')} ${index + 1}: ${t('Bearbeiten')}`}
                        onClick={() => editPage(page)}
                      >
                        <PageImage blob={page.thumbnail} alt={`${t('Seite')} ${index + 1}`} t={t} />
                        <span>{index + 1}</span>
                      </button>
                      <div className="scanner-page-buttons">
                        <button
                          aria-expanded={pageActions && activePageId === page.id}
                          aria-controls={`scanner-page-${page.id}-actions`}
                          aria-label={`${t('Seite')} ${index + 1}: ${t('Seitenaktionen')}`}
                          disabled={busy}
                          onClick={() => {
                            setActivePageId(page.id);
                            setPageActions((v) => (activePageId === page.id ? !v : true));
                          }}
                        >
                          <ToolIcon name="more" />
                          {t('Mehr')}
                        </button>
                      </div>
                      <div
                        id={`scanner-page-${page.id}-actions`}
                        className="scanner-page-actions scanner-segments"
                        hidden={!pageActions || activePageId !== page.id}
                      >
                        <button
                          disabled={busy}
                          onClick={() => {
                            replaceId.current = page.id;
                            setDraft(null);
                            startCamera();
                          }}
                        >
                          {t('Ersetzen')}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => {
                            setActivePageId(pages[index + 1]?.id ?? pages[index - 1]?.id);
                            if (draft?.id === page.id) {
                              setDraft(null);
                              replaceId.current = undefined;
                            }
                            session.remove(page.id);
                            syncPages();
                            setPageActions(false);
                          }}
                        >
                          {t('Löschen')}
                        </button>
                        <button
                          aria-label={`${t('Seite')} ${index + 1}: ${t('Nach oben')}`}
                          disabled={busy || index === 0}
                          onClick={() => {
                            setActivePageId(page.id);
                            session.move(page.id, -1);
                            syncPages();
                          }}
                        >
                          {t('Nach oben')}
                        </button>
                        <button
                          aria-label={`${t('Seite')} ${index + 1}: ${t('Nach unten')}`}
                          disabled={busy || index === pages.length - 1}
                          onClick={() => {
                            setActivePageId(page.id);
                            session.move(page.id, 1);
                            syncPages();
                          }}
                        >
                          {t('Nach unten')}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                {!!queue.current.length && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      replaceId.current = undefined;
                      void processInput(queue.current[0], 'file', undefined, true);
                    }}
                  >
                    {t('Nächste Importseite prüfen')} ({queue.current.length})
                  </button>
                )}
                {!!queue.current.length && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      queue.current = [];
                      syncPages();
                      setError('');
                    }}
                  >
                    {t('Verbleibende Importe verwerfen')}
                  </button>
                )}
                <div className="scanner-actions">
                  <button
                    disabled={busy}
                    className="scanner-primary"
                    onClick={() => {
                      replaceId.current = undefined;
                      setDraft(null);
                      setPageGrid(false);
                      startCamera();
                    }}
                  >
                    {pages.length ? t('Weitere Seite') : t('Kamera starten')}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (draft) {
                        replaceId.current = undefined;
                        setDraft(null);
                      }
                      input.current?.click();
                    }}
                  >
                    {t('Bilder importieren')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {!discard &&
        draft &&
        !camera &&
        !editingCorners &&
        !pendingCrop &&
        !pageGrid &&
        (reviewPanel ? (
          <footer className="scanner-footer scanner-detail-footer">
            {!readOnlyPanel && (
              <button disabled={busy} onClick={cancelPanel}>
                {t('Abbrechen')}
              </button>
            )}
            <button
              disabled={busy}
              className="scanner-primary"
              onClick={() => {
                setReviewPanel(null);
                panelSnapshot.current = null;
              }}
            >
              {t(readOnlyPanel ? 'OK' : 'Übernehmen')}
            </button>
          </footer>
        ) : (
          <footer className="scanner-footer scanner-review-footer">
            <button
              disabled={busy || (replaceId.current ? activePageIndex === 0 : !pages.length)}
              onClick={() => navigate(-1)}
            >
              {t('Zurück')}
            </button>
            <button
              disabled={
                busy ||
                (!queue.current.length &&
                  (!replaceId.current || activePageIndex >= pages.length - 1))
              }
              className={
                queue.current.length || (replaceId.current && activePageIndex < pages.length - 1)
                  ? 'scanner-primary'
                  : ''
              }
              onClick={() => navigate(1)}
            >
              {t('Weiter')}
            </button>
            <button
              disabled={busy || !!queue.current.length}
              className={
                !queue.current.length &&
                (!replaceId.current || activePageIndex === pages.length - 1)
                  ? 'scanner-primary'
                  : ''
              }
              onClick={() => {
                if (saveDraft()) void exportAll();
              }}
            >
              {t('Abschließen')}
            </button>
          </footer>
        ))}
      {!discard && (!draft || pageGrid) && !camera && !pendingCrop && (
        <footer className="scanner-footer">
          <label>
            <span className="scanner-sr-only">{t('Bildexport')}</span>
            <select
              aria-label={t('Bildexport')}
              value={mime}
              disabled={busy}
              onChange={(e) => changeImageType(e.target.value)}
            >
              <option value="image/jpeg">{t('JPEG (0,92)')}</option>
              <option value="image/png">PNG</option>
            </select>
          </label>
          {draft && (
            <button disabled={busy} onClick={() => editPage(draft)}>
              {t('Zurück')}
            </button>
          )}
          <button
            className="scanner-primary"
            disabled={busy || !pages.length || !!queue.current.length}
            onClick={() => void exportAll()}
          >
            {t('Abschließen')}
          </button>
        </footer>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(event) => {
          startFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
    </section>
  );
}
