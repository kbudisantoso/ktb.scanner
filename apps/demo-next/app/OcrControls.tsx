'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScanResult } from '@ktb-tools/scanner';
import type {
  OcrEngine,
  OcrLanguage,
  OcrProgress,
  SearchablePdfResult,
} from '@ktb-tools/scanner/ocr';
import { useDemoLocale } from './i18n';

type Result = Extract<ScanResult, { status: 'confirmed' }>;
type Phase = 'running' | 'complete' | 'cancelled' | 'failed';
type Job = { source: Result; controller: AbortController };
type State = { source: Result; phase: Phase; progress?: OcrProgress };
export type OcrLanguageChoice = 'deu+eng' | 'deu' | 'eng';
export type HostOcrOptions = { engine: OcrEngine; language: OcrLanguageChoice };
const LANGUAGE_CHOICES: Record<OcrLanguageChoice, readonly OcrLanguage[]> = {
  'deu+eng': ['deu', 'eng'],
  deu: ['deu'],
  eng: ['eng'],
};

export function useResultOcr(
  result: Result,
  hidden: boolean,
  options?: HostOcrOptions,
  onLanguageChange?: (language: OcrLanguageChoice) => void,
  onEngineChange?: (engine: OcrEngine) => void,
) {
  const [localEngine, setLocalEngine] = useState<OcrEngine>('paddle');
  const [localLanguage, setLocalLanguage] = useState<OcrLanguageChoice>('deu+eng');
  const engine = options?.engine ?? localEngine;
  const language = options?.language ?? localLanguage;
  const setEngine = (next: OcrEngine) => {
    setLocalEngine(next);
    onEngineChange?.(next);
  };
  const setLanguage = (next: OcrLanguageChoice) => {
    setLocalLanguage(next);
    onLanguageChange?.(next);
  };
  const [state, setState] = useState<State>();
  const [recognized, setRecognized] = useState<{
    source: Result;
    value: SearchablePdfResult;
  }>();
  const job = useRef<Job | null>(null);
  const alive = useRef(false);
  const current = useRef({ result, hidden, engine, language, recognized });
  current.current = { result, hidden, engine, language, recognized };
  const cancel = useCallback(() => {
    const pending = job.current;
    if (!pending) return;
    job.current = null;
    pending.controller.abort();
    if (alive.current && current.current.result === pending.source)
      setState({ source: pending.source, phase: 'cancelled' });
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const pending = job.current;
      job.current = null;
      pending?.controller.abort();
    };
  }, []);
  useEffect(() => {
    const pending = job.current;
    if (pending && (pending.source !== result || hidden)) cancel();
    setRecognized((previous) => (previous?.source === result ? previous : undefined));
    setState((previous) => (previous?.source === result ? previous : undefined));
  }, [result, hidden, cancel]);
  const start = useCallback(async () => {
    const { result, hidden, engine, language, recognized } = current.current;
    if (job.current || !alive.current || hidden) return;
    const pending = { source: result, controller: new AbortController() };
    job.current = pending;
    const languages = engine === 'tesseract' ? [...LANGUAGE_CHOICES[language]] : undefined;
    const previousPages = recognized?.source === result ? recognized.value.pages.slice() : [];
    const valid = () =>
      alive.current &&
      job.current === pending &&
      current.current.result === pending.source &&
      !current.current.hidden &&
      !pending.controller.signal.aborted;
    setState({
      source: result,
      phase: 'running',
      progress: { stage: 'loading', page: 0, pages: result.pages.length, progress: 0 },
    });
    try {
      const { createSearchablePdf } = await import('@ktb-tools/scanner/ocr');
      if (!valid()) return;
      const value = await createSearchablePdf({
        pages: pending.source.pages.slice(),
        assetBaseUrl: '/scanner-assets/',
        engine,
        languages,
        previousPages,
        signal: pending.controller.signal,
        onProgress: (progress) => {
          if (valid())
            setState({ source: pending.source, phase: 'running', progress: { ...progress } });
        },
      });
      if (!valid()) return;
      setRecognized({ source: pending.source, value });
      setState({ source: pending.source, phase: 'complete' });
    } catch (error) {
      if (!valid()) return;
      setState({
        source: pending.source,
        phase: error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'failed',
      });
    } finally {
      if (job.current === pending) job.current = null;
    }
  }, []);
  return {
    engine,
    setEngine,
    language,
    setLanguage,
    state: state?.source === result ? state : undefined,
    output: recognized?.source === result ? recognized.value : undefined,
    start,
    cancel,
  };
}

export function OcrEngineSelect({
  value,
  onChange,
  disabled,
}: {
  value: OcrEngine;
  onChange: (engine: OcrEngine) => void;
  disabled?: boolean;
}) {
  const { t } = useDemoLocale();
  return (
    <select
      aria-label={t('Texterkennungs-Engine')}
      value={value}
      disabled={disabled}
      onChange={(event) => {
        const next = event.target.value;
        if (next === 'paddle' || next === 'tesseract') onChange(next);
      }}
    >
      <option value="paddle">PaddleOCR</option>
      <option value="tesseract">Tesseract</option>
    </select>
  );
}

export function OcrLanguageSelect({
  value,
  onChange,
  disabled,
}: {
  value: OcrLanguageChoice;
  onChange: (language: OcrLanguageChoice) => void;
  disabled?: boolean;
}) {
  const { t } = useDemoLocale();
  return (
    <select
      aria-label={t('Texterkennungssprachen')}
      value={value}
      disabled={disabled}
      onChange={(event) => {
        const next = event.target.value;
        if (next === 'deu+eng' || next === 'deu' || next === 'eng') onChange(next);
      }}
    >
      <option value="deu+eng" aria-label={t('Deutsch und Englisch')}>
        DE + EN
      </option>
      <option value="deu" aria-label={t('Deutsch')}>
        Deutsch
      </option>
      <option value="eng" aria-label={t('Englisch')}>
        English
      </option>
    </select>
  );
}

export default function OcrControls({ ocr }: { ocr: ReturnType<typeof useResultOcr> }) {
  const { t } = useDemoLocale();
  const startButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const running = ocr.state?.phase === 'running';
  useEffect(() => {
    if (!running && returnFocus.current) {
      if (startButton.current?.getClientRects().length) startButton.current.focus();
      returnFocus.current = false;
    }
  }, [running]);
  const progress = ocr.state?.progress;
  const percent = Math.round(Math.max(0, Math.min(1, progress?.progress ?? 0)) * 100);
  const message =
    ocr.state?.phase === 'complete'
      ? t('Text erkannt. Bitte vor der Verwendung prüfen.')
      : ocr.state?.phase === 'failed'
        ? t('Texterkennung fehlgeschlagen. Vorhandene Ergebnisse bleiben erhalten.')
        : ocr.state?.phase === 'cancelled'
          ? t('Texterkennung abgebrochen. Vorhandene Ergebnisse bleiben erhalten.')
          : progress?.stage === 'recognizing'
            ? t('Seite {number} von {count} erkennen: {percent} %', {
                number: progress.page,
                count: progress.pages,
                percent,
              })
            : progress?.stage === 'assembling'
              ? t('Durchsuchbares PDF erstellen: {percent} %', { percent })
              : t('Texterkennung laden: {percent} %', { percent });
  return (
    <section className="result-ocr" aria-label={t('Texterkennung')}>
      <div className="result-ocr-options">
        <OcrEngineSelect value={ocr.engine} disabled={running} onChange={ocr.setEngine} />
        {running ? (
          <button
            onClick={() => {
              returnFocus.current = true;
              ocr.cancel();
            }}
          >
            {t('Texterkennung abbrechen')}
          </button>
        ) : (
          <button ref={startButton} onClick={() => void ocr.start()}>
            {t(
              ocr.state?.phase === 'failed' || ocr.state?.phase === 'cancelled'
                ? 'Texterkennung erneut versuchen'
                : ocr.output
                  ? 'Text erneut erkennen'
                  : 'Text erkennen',
            )}
          </button>
        )}
        {ocr.engine === 'tesseract' && (
          <OcrLanguageSelect value={ocr.language} disabled={running} onChange={ocr.setLanguage} />
        )}
      </div>
      {ocr.engine === 'paddle' && (
        <div className="result-ocr-status">
          <p>{t('Latin-Modell (u. a. DE + EN)')}</p>
        </div>
      )}
      {ocr.state && (
        <div className="result-ocr-status">
          {running && <progress value={percent} max={100} aria-label={message} />}
          <p role={ocr.state.phase === 'failed' ? 'alert' : 'status'}>{message}</p>
        </div>
      )}
    </section>
  );
}
