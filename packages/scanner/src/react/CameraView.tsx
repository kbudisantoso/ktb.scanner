import { useEffect, useId, useRef, useState } from 'react';
import { diagnose } from '../diagnostics.ts';
import type { DiagnosticOptions } from '../diagnostics.ts';
import type { CaptureDetails } from '../camera.ts';
import { Camera } from '../camera.ts';
import { CaptureRearm, sampleFingerprintFromPixels } from '../capture-rearm.ts';
import type { CaptureOutcome } from './capture-queue.ts';
import { AutoCapture } from '../capture.ts';
import { LiveTracker } from '../tracking.ts';
import { CaptureOutline } from './CaptureOutline.tsx';
import { CameraIcon } from './CameraIcon.tsx';
import { createScanicAdapter } from '../scanic.ts';
import { errorMessage } from '../errors.ts';
import type { CaptureMode, Limits, Quad, CaptureHint, LiveDetection, Size } from '../types.ts';
import type { Translate } from './hooks.ts';
export function CameraView({
  signal,
  assetBaseUrl,
  diagnostics,
  limits,
  mode,
  stabilityMs,
  setMode,
  onShutter,
  onPrepareSound,
  onCapture,
  continuous = false,
  canCapture = true,
  onReview,
  beforeCapture,
  onCancel,
  onClose,
  onImport,
  pageCount,
  t,
}: {
  signal: AbortSignal;
  assetBaseUrl: string;
  diagnostics?: DiagnosticOptions;
  limits: Limits;
  mode: CaptureMode;
  stabilityMs: number;
  setMode: (mode: CaptureMode) => void;
  onShutter: () => boolean;
  onPrepareSound: () => void;
  onCapture: (blob: Blob, hint?: CaptureHint) => Promise<CaptureOutcome>;
  continuous?: boolean;
  canCapture?: boolean;
  onReview: () => void;
  beforeCapture: (size: Size) => void;
  onCancel: () => void;
  onClose: () => void;
  onImport: () => void;
  pageCount: number;
  t: Translate;
}) {
  const callbacks = useRef({
    onCapture,
    onShutter,
    onPrepareSound,
    onReview,
    onCancel,
    onClose,
    onImport,
    canCapture,
    continuous,
    beforeCapture,
  });
  callbacks.current = {
    onCapture,
    onShutter,
    onPrepareSound,
    onReview,
    onCancel,
    onClose,
    onImport,
    canCapture,
    continuous,
    beforeCapture,
  };
  const feedbackImage = useRef<HTMLImageElement>(null),
    reviewButton = useRef<HTMLButtonElement>(null);
  const feedbackReady = useRef<(() => void) | undefined>(undefined);
  const [feedback, setFeedback] = useState<{ url?: string; needsCrop?: boolean } | null>(null);
  const video = useRef<HTMLVideoElement>(null),
    snapshot = useRef<HTMLCanvasElement>(null),
    camera = useRef(new Camera()),
    gate = useRef(new AutoCapture(mode, stabilityMs));
  const [quad, setQuad] = useState<Quad | null>(null),
    [opacity, setOpacity] = useState(1),
    [waiting, setWaiting] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState('');
  const [running, setRunning] = useState(false),
    [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [device, setDevice] = useState(''),
    [restart, setRestart] = useState(0);
  const [taking, setTaking] = useState(false);
  const [phase, setPhase] = useState<'live' | 'encoding' | 'processing' | 'feedback'>('live');
  const [autoBlock, setAutoBlock] = useState('');
  const [previewSize, setPreviewSize] = useState<Size>({ width: 4, height: 3 });
  const shot = useRef<() => void>(() => {});
  const optionsId = useId();
  const lighting = useRef(false),
    lightRevision = useRef(0);
  const [showOptions, setShowOptions] = useState(false);
  const [hasTorch, setHasTorch] = useState(false),
    [torch, setTorch] = useState(false),
    [torchPending, setTorchPending] = useState(false);
  useEffect(() => {
    if (signal.aborted) return;
    const abort = new AbortController();
    let engine: ReturnType<typeof createScanicAdapter> | undefined = createScanicAdapter(
      assetBaseUrl,
      diagnostics,
    );
    const rearm = new CaptureRearm();
    const fingerprintCanvas = document.createElement('canvas');
    fingerprintCanvas.width = fingerprintCanvas.height = 32;
    const fingerprintContext = fingerprintCanvas.getContext('2d', { willReadFrequently: true })!;
    const fingerprint = (source: CanvasImageSource) => {
      fingerprintContext.drawImage(source, 0, 0, 32, 32);
      return sampleFingerprintFromPixels(fingerprintContext.getImageData(0, 0, 32, 32));
    };
    const waits = new Set<{ timer: ReturnType<typeof setTimeout>; resolve: () => void }>();
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const item = {
          timer: setTimeout(() => {
            waits.delete(item);
            resolve();
          }, ms),
          resolve,
        };
        waits.add(item);
      });
    let feedbackUrl: string | undefined, animation: Animation | undefined;
    let observedLightRevision = lightRevision.current;
    let timer: ReturnType<typeof setTimeout>,
      active = true,
      pendingShot = false;
    let detectionAbort = new AbortController(),
      detectionEpoch = 0;
    let latest: { detection: LiveDetection; frameSize: Size } | undefined;
    let tracker = new LiveTracker(),
      lastEvidence = performance.now(),
      frameAspect = 0,
      watchdogState = '';
    const showTracking = (now: number) => {
      const view = tracker.view(now);
      setQuad(view.corners);
      setOpacity(view.opacity);
      return view;
    };
    gate.current.rearm();
    setTaking(false);
    setFeedback(null);
    setPhase('live');
    setRunning(false);
    setProgress(0);
    setWaiting(false);
    setAutoBlock('');
    setQuad(null);
    setError('');
    setHasTorch(false);
    setTorch(false);
    setTorchPending(false);
    lighting.current = false;
    lightRevision.current++;
    const watchdog = setInterval(() => {
      if (active && !pendingShot) {
        const now = performance.now();
        const view = showTracking(now);
        const status = gate.current.poll(now);
        const state =
          now - lastEvidence > 1200 ? 'expired' : now - lastEvidence > 400 ? 'waiting' : 'fresh';
        if (state !== watchdogState && state !== 'fresh')
          diagnose(diagnostics, 'live-watchdog', {
            state,
            now,
            lastEvidence,
            ...view,
            ...status,
            generation: gate.current.generation,
          });
        if (!active || abort.signal.aborted) return;
        watchdogState = state;
        setProgress(status.progress);
        if (state === 'expired') setAutoBlock('');
        if (now - lastEvidence > 400) setWaiting(status.progress > 0);
      }
    }, 100);
    const capture = async (automatic = false) => {
      if (pendingShot || !active || !video.current || !callbacks.current.canCapture) return;
      pendingShot = true;
      const captureEpoch = ++detectionEpoch;
      clearTimeout(timer);
      detectionAbort.abort();
      const evidence = latest;
      setProgress((value) => (value > 0 ? 1 : 0));
      setTaking(true);
      let handedOff = false;
      try {
        callbacks.current.beforeCapture({
          width: video.current.videoWidth,
          height: video.current.videoHeight,
        });
        diagnose(diagnostics, 'capture-start', { generation: gate.current.generation });
        if (!active || abort.signal.aborted || captureEpoch !== detectionEpoch) return;
        let details: CaptureDetails | undefined;
        const blob = await camera.current.capture(
          video.current,
          limits,
          abort.signal,
          (value) => {
            details = value;
          },
          (value, image) => {
            const canvas = snapshot.current!;
            const scale = Math.min(1, 1000 / Math.max(image.width, image.height));
            canvas.width = Math.round(image.width * scale);
            canvas.height = Math.round(image.height * scale);
            canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
            setPreviewSize({ width: image.width, height: image.height });
            if (callbacks.current.continuous)
              rearm.lock(fingerprint(image), evidence?.detection.corners ?? null);
            else video.current?.pause();
            setPhase('encoding');
            const soundPlayed = callbacks.current.onShutter();
            if (!active || abort.signal.aborted || captureEpoch !== detectionEpoch) return;
            diagnose(diagnostics, 'capture-shutter', { ...value, soundPlayed });
          },
        );
        if (!active) return;
        if (!callbacks.current.continuous) camera.current.stop();
        engine?.destroy();
        engine = undefined;
        const hint: CaptureHint | undefined =
          evidence?.detection.corners && details
            ? {
                corners: structuredClone(evidence.detection.corners),
                stable: automatic,
                frameSize: evidence.frameSize,
                ageMs: details.capturedAtMs - evidence.detection.timestamp,
                mapping:
                  details.method === 'video-frame' ? 'same-frame-area' : 'unverified-photo-area',
              }
            : undefined;
        diagnose(diagnostics, 'capture-complete', {
          bytes: blob.size,
          mime: blob.type,
          details,
          hint,
          encodingMs: details ? performance.now() - details.capturedAtMs : undefined,
        });
        if (!active || abort.signal.aborted || captureEpoch !== detectionEpoch) return;
        handedOff = true;
        setPhase('processing');
        const outcome = await callbacks.current.onCapture(blob, hint);
        if (!active || abort.signal.aborted || !callbacks.current.continuous) return;
        if (outcome) {
          setPhase('feedback');
          if (outcome.preview) {
            feedbackUrl = URL.createObjectURL(outcome.preview);
            const ready = new Promise<void>((resolve) => {
              feedbackReady.current = resolve;
            });
            setFeedback({ url: feedbackUrl });
            await ready;
            feedbackReady.current = undefined;
            if (!active) return;
            await wait(350);
            const image = feedbackImage.current,
              button = reviewButton.current;
            if (
              active &&
              image &&
              button &&
              !matchMedia('(prefers-reduced-motion: reduce)').matches
            ) {
              const from = image.getBoundingClientRect(),
                to = button.getBoundingClientRect();
              const scale = Math.min(to.width / from.width, to.height / from.height);
              animation = image.animate(
                [
                  { transform: 'translate(0,0) scale(1)', opacity: 1 },
                  {
                    transform: `translate(${to.x + to.width / 2 - from.x - from.width / 2}px,${to.y + to.height / 2 - from.y - from.height / 2}px) scale(${scale})`,
                    opacity: 0.2,
                  },
                ],
                { duration: 320, easing: 'ease-in', fill: 'forwards' },
              );
              await animation.finished.catch(() => {});
              animation.cancel();
              animation = undefined;
            }
          } else {
            setFeedback({ needsCrop: outcome.needsCrop });
            await wait(500);
          }
        }
        if (!active || abort.signal.aborted) return;
        if (feedbackUrl) URL.revokeObjectURL(feedbackUrl);
        feedbackUrl = undefined;
        setFeedback(null);
        latest = undefined;
        tracker = new LiveTracker();
        detectionAbort = new AbortController();
        engine = createScanicAdapter(assetBaseUrl, diagnostics);
        pendingShot = false;
        setTaking(false);
        setQuad(null);
        setProgress(0);
        setPhase('live');
        timer = setTimeout(() => void tick(), 0);
      } catch (err) {
        if (active) {
          handedOff = false;
          if (callbacks.current.continuous && !rearm.blocked && video.current)
            rearm.lock(fingerprint(video.current), evidence?.detection.corners ?? null);
          if (callbacks.current.continuous && !engine)
            engine = createScanicAdapter(assetBaseUrl, diagnostics);
          diagnose(diagnostics, 'camera-error', { message: errorMessage(err) });
          if (!active || abort.signal.aborted) return;
          setError(errorMessage(err));
          if (!callbacks.current.continuous || !rearm.blocked) gate.current.rearm();
          detectionAbort = new AbortController();
          latest = undefined;
          tracker = new LiveTracker();
          setPhase('live');
          await video.current?.play().catch(() => {});
          if (!active || abort.signal.aborted) return;
          timer = setTimeout(() => void tick(), 125);
        }
      } finally {
        if (!handedOff) {
          pendingShot = false;
          if (active) setTaking(false);
        }
      }
    };
    shot.current = () => {
      diagnose(diagnostics, 'manual-trigger', { generation: gate.current.generation });
      if (!callbacks.current.canCapture || pendingShot || !active) return;
      if (callbacks.current.continuous && rearm.blocked) {
        rearm.reset();
        gate.current.rearm();
      }
      if (gate.current.claimManual()) void capture();
    };
    const tick = async () => {
      const started = performance.now(),
        epoch = detectionEpoch;
      if (!active || pendingShot || !video.current) return;
      if (video.current.readyState < 2) {
        timer = setTimeout(() => void tick(), 125);
        return;
      }
      try {
        const frameSize = { width: video.current.videoWidth, height: video.current.videoHeight };
        const aspect = frameSize.width / frameSize.height;
        if (frameAspect && Math.abs(Math.log(aspect / frameAspect)) > 0.01) {
          tracker = new LiveTracker();
          gate.current.reset();
        }
        frameAspect = aspect;
        const generation = gate.current.generation;
        const frameFingerprint = callbacks.current.continuous ? fingerprint(video.current) : null;
        const frameLighting = lighting.current,
          frameLightRevision = lightRevision.current;
        const image = await createImageBitmap(video.current, {
          resizeWidth: Math.max(
            1,
            Math.round(
              (800 * video.current.videoWidth) /
                Math.max(video.current.videoWidth, video.current.videoHeight),
            ),
          ),
          resizeHeight: Math.max(
            1,
            Math.round(
              (800 * video.current.videoHeight) /
                Math.max(video.current.videoWidth, video.current.videoHeight),
            ),
          ),
        });
        if (!active || pendingShot || epoch !== detectionEpoch) {
          image.close();
          return;
        }
        const detection = await engine!.detect(image, started, detectionAbort.signal);
        if (!active || pendingShot || epoch !== detectionEpoch) return;
        latest = {
          detection,
          frameSize,
        };
        const now = performance.now();
        lastEvidence = detection.timestamp;
        const evidence = tracker.update(detection, now);
        const view = showTracking(now);
        if (callbacks.current.continuous) {
          if (frameLighting || lighting.current || frameLightRevision !== lightRevision.current)
            rearm.interrupt();
          else if (now >= detection.timestamp && now - detection.timestamp <= 400) {
            if (observedLightRevision !== frameLightRevision) {
              if (rearm.blocked) rearm.lock(frameFingerprint, detection.corners);
              observedLightRevision = frameLightRevision;
            } else if (rearm.observe(frameFingerprint, detection.corners, detection.timestamp, now))
              gate.current.rearm();
          } else rearm.interrupt();
        }
        const status = !callbacks.current.canCapture
          ? { progress: 0, capture: false }
          : gate.current.update(
              lighting.current ? { ...evidence, sharpness: 'unknown' } : evidence,
              now,
              generation,
            );
        diagnose(diagnostics, 'live-decision', {
          ...detection,
          receivedAtMs: now,
          latencyMs: now - started,
          displayedCorners: view.corners,
          displayOpacity: view.opacity,
          trackingReason: tracker.reason,
          captureEvidence: evidence,
          generation,
          currentGeneration: gate.current.generation,
          ...status,
          reason: gate.current.decisionReason,
        });
        if (!active || abort.signal.aborted || pendingShot || epoch !== detectionEpoch) return;
        setProgress(status.progress);
        setAutoBlock(evidence.corners ? gate.current.decisionReason : '');
        setWaiting(status.progress > 0 && (!evidence.corners || evidence.sharpness !== 'sharp'));
        if (status.capture) {
          await capture(true);
          return;
        }
      } catch (err) {
        if (active && !pendingShot && epoch === detectionEpoch) {
          gate.current.reset();
          tracker = new LiveTracker();
          setQuad(null);
          setProgress(0);
          diagnose(diagnostics, 'camera-error', { message: errorMessage(err) });
          if (!active || abort.signal.aborted) return;
          setError(errorMessage(err));
        }
      }
      if (active && !pendingShot && epoch === detectionEpoch)
        timer = setTimeout(() => void tick(), Math.max(0, 125 - (performance.now() - started)));
    };
    const start = async () => {
      try {
        await camera.current.start(video.current!, abort.signal, device || undefined);
        if (!active) return;
        const stream = video.current!.srcObject as MediaStream;
        const settings = stream.getVideoTracks()[0]?.getSettings() as
          | (MediaTrackSettings & { focusMode?: string; exposureTime?: number; iso?: number })
          | undefined;
        diagnose(diagnostics, 'camera-start', {
          autoCaptureStabilityMs: gate.current.stabilityMs,
          width: settings?.width,
          height: settings?.height,
          frameRate: settings?.frameRate,
          facingMode: settings?.facingMode,
          focusMode: settings?.focusMode,
          exposureTime: settings?.exposureTime,
          iso: settings?.iso,
          videoWidth: video.current!.videoWidth,
          videoHeight: video.current!.videoHeight,
        });
        if (!active || abort.signal.aborted) return;
        setPreviewSize({ width: video.current!.videoWidth, height: video.current!.videoHeight });
        setRunning(true);
        setHasTorch(camera.current.supportsTorch);
        void tick();
        const available = await navigator.mediaDevices.enumerateDevices();
        if (!active) return;
        setDevices(available.filter((d) => d.kind === 'videoinput'));
      } catch (err) {
        if (active) setError(errorMessage(err));
      }
    };
    const pause = () => {
      if (document.hidden) {
        release();
        setRunning(false);
        setTaking(false);
        setFeedback(null);
        setQuad(null);
        setProgress(0);
        setError(t('Kamera pausiert. Bitte erneut starten.'));
      }
    };
    const release = () => {
      lightRevision.current++;
      lighting.current = false;
      active = false;
      abort.abort();
      detectionAbort.abort();
      clearTimeout(timer);
      clearInterval(watchdog);
      for (const item of waits) {
        clearTimeout(item.timer);
        item.resolve();
      }
      waits.clear();
      feedbackReady.current?.();
      feedbackReady.current = undefined;
      animation?.cancel();
      if (feedbackUrl) URL.revokeObjectURL(feedbackUrl);
      feedbackUrl = undefined;
      fingerprintCanvas.width = fingerprintCanvas.height = 1;
      camera.current.stop();
      engine?.destroy();
      engine = undefined;
    };
    signal.addEventListener('abort', release, { once: true });
    document.addEventListener('visibilitychange', pause);
    void start();
    return () => {
      diagnose(diagnostics, 'camera-stop', {});
      release();
      signal.removeEventListener('abort', release);
      document.removeEventListener('visibilitychange', pause);
    };
  }, [device, restart]);
  const selectedMode = useRef(mode);
  const changeMode = (next: CaptureMode) => {
    if (!['auto', 'manual'].includes(next) || next === selectedMode.current) return;
    selectedMode.current = next;
    diagnose(diagnostics, 'capture-mode', { mode: next });
    gate.current.setMode(next);
    setProgress(0);
    setWaiting(false);
    setMode(next);
  };
  return (
    <section className="scanner-capture" data-phase={phase}>
      <div className="scanner-camera-topbar">
        <button
          className="scanner-camera-icon scanner-camera-close"
          aria-label={t('Schließen')}
          onClick={onClose}
        >
          <CameraIcon name="close" />
        </button>
        <span className="scanner-camera-title">{t('Dokument scannen')}</span>
        {hasTorch && (
          <button
            className="scanner-camera-icon"
            aria-label={t(torch ? 'Licht ausschalten' : 'Licht einschalten')}
            aria-pressed={torch}
            disabled={!running || taking || torchPending}
            onClick={async () => {
              const revision = ++lightRevision.current;
              lighting.current = true;
              setTorchPending(true);
              gate.current.reset();
              setProgress(0);
              try {
                if ((await camera.current.setTorch(!torch)) && revision === lightRevision.current)
                  setTorch(!torch);
              } catch {
                if (revision === lightRevision.current)
                  setError(t('Kameralicht konnte nicht umgeschaltet werden.'));
              } finally {
                if (revision === lightRevision.current) {
                  lighting.current = false;
                  gate.current.reset();
                  setProgress(0);
                  setTorchPending(false);
                }
              }
            }}
          >
            <CameraIcon name="light" />
          </button>
        )}
        <button
          className="scanner-camera-icon"
          aria-label={t('Kameraoptionen')}
          aria-expanded={showOptions}
          aria-controls={optionsId}
          disabled={taking}
          onClick={() => setShowOptions((value) => !value)}
        >
          <CameraIcon name="more" />
        </button>
      </div>
      <div
        className={`scanner-camera ${phase !== 'live' && phase !== 'feedback' ? 'scanner-camera-captured' : ''}`}
        style={{
          aspectRatio: `${previewSize.width}/${previewSize.height}`,
          width: `min(100%, calc(var(--scanner-camera-height, 52dvh) * ${previewSize.width / previewSize.height}))`,
        }}
      >
        <video ref={video} muted playsInline aria-label={t('Kameravorschau')} />
        <canvas
          ref={snapshot}
          className="scanner-captured-photo"
          role="img"
          aria-label={t('Aufgenommenes Foto')}
          hidden={phase === 'live'}
        />
        {quad && phase === 'live' && (
          <CaptureOutline corners={quad} size={previewSize} progress={progress} opacity={opacity} />
        )}
        {phase !== 'live' && phase !== 'feedback' && (
          <>
            <div className="scanner-shutter-flash" aria-hidden="true" />
            <div className="scanner-photo-processing" role="status">
              <span className="scanner-processing-mark" aria-hidden="true">
                <span />
              </span>
              <div>
                <strong>{t('Foto aufgenommen')}</strong>
                <p>
                  {phase === 'encoding'
                    ? t('Bild wird gesichert...')
                    : t('Zuschnitt und Bildoptimierung laufen...')}
                </p>
                <div className="scanner-processing-track" aria-hidden="true">
                  <span />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      {feedback && (
        <div className="scanner-capture-feedback" role="status">
          {feedback.url ? (
            <img
              ref={feedbackImage}
              src={feedback.url}
              alt={t('Aufgenommene Seite')}
              draggable={false}
              onLoad={() => feedbackReady.current?.()}
              onError={() => feedbackReady.current?.()}
            />
          ) : (
            <p>{t('Ecken später bestätigen')}</p>
          )}
        </div>
      )}
      {phase === 'live' && (
        <p role="status" className="scanner-camera-hint">
          {!canCapture
            ? t('Seitenlimit erreicht - bitte Seiten prüfen.')
            : !running
              ? t(error ? 'Kamera nicht bereit' : 'Kamera wird gestartet...')
              : mode === 'auto' && autoBlock === 'sharpness-unknown'
                ? t('Schärfe nicht beurteilbar - bitte manuell auslösen.')
                : mode === 'auto' && autoBlock === 'sharpness-blur'
                  ? t('Bild wirkt unscharf - ruhig halten oder manuell auslösen.')
                  : waiting
                    ? t('Erkennung kurz unsicher - ruhig halten')
                    : progress > 0
                      ? t('Ruhig halten - automatische Aufnahme')
                      : mode === 'manual'
                        ? t('Dokument ausrichten und auslösen')
                        : t('Dokument vollständig ins Bild halten')}
        </p>
      )}
      <div className="scanner-camera-options" id={optionsId} hidden={!showOptions}>
        <h3>{t('Kameraoptionen')}</h3>
        {devices.length > 1 && (
          <label>
            {t('Kamera')}
            <select
              disabled={taking}
              value={device}
              onChange={(event) => setDevice(event.target.value)}
            >
              <option value="">{t('Rückkamera bevorzugen')}</option>
              {devices.map((item, index) => (
                <option key={item.deviceId} value={item.deviceId}>
                  {item.label || `${t('Kamera')} ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          onClick={() => {
            onPrepareSound();
            setRestart((value) => value + 1);
            setShowOptions(false);
          }}
          disabled={taking}
        >
          {t('Kamera neu starten')}
        </button>
        <button disabled={taking} onClick={() => setShowOptions(false)}>
          {t('Optionen schließen')}
        </button>
      </div>
      <div className="scanner-camera-dock">
        <label className="scanner-camera-mode-select">
          <span className="scanner-camera-mode-label">{t('Aufnahmemodus')}</span>
          <select
            disabled={taking}
            value={mode}
            onChange={(e) => changeMode(e.target.value as CaptureMode)}
          >
            <option value="auto">{t('Auto')}</option>
            <option value="manual">{t('Manuell')}</option>
          </select>
        </label>
        <div className="scanner-camera-controls">
          <button
            className="scanner-camera-icon scanner-camera-back"
            disabled={taking}
            onClick={continuous ? onImport : onCancel}
            aria-label={t(continuous ? 'Bilder importieren' : 'Zurück zum Import')}
          >
            <CameraIcon name={continuous ? 'gallery' : 'back'} />
            {!continuous && pageCount > 0 && (
              <span className="scanner-camera-page-count">{pageCount}</span>
            )}
          </button>
          <button
            disabled={!running || taking || torchPending || !canCapture}
            className="scanner-shutter-button"
            aria-label={taking ? t('Aufnahme läuft...') : t('Jetzt aufnehmen')}
            onClick={() => {
              onPrepareSound();
              shot.current();
            }}
          >
            <span>{taking ? t('Aufnahme läuft...') : t('Jetzt aufnehmen')}</span>
          </button>
          <button
            className={`scanner-camera-icon${continuous ? ' scanner-camera-review' : ''}`}
            ref={reviewButton}
            aria-label={
              continuous ? `${t('Seiten prüfen')} (${pageCount})` : t('Bilder importieren')
            }
            disabled={taking || (continuous && !pageCount)}
            onClick={continuous ? onReview : onImport}
          >
            <CameraIcon name={continuous ? 'forward' : 'gallery'} />
            {continuous && (
              <span className="scanner-camera-review-label">
                {t('Seiten prüfen')} ({pageCount})
              </span>
            )}
          </button>
        </div>
        <span className="scanner-camera-caption">
          {pageCount
            ? `${pageCount} ${t(pageCount === 1 ? 'Seite aufgenommen' : 'Seiten aufgenommen')}`
            : t('Dokument')}
        </span>
      </div>
      {error && (
        <div className="scanner-camera-error" role="alert">
          <p>{t(error)}</p>
          {!running && (
            <button disabled={taking} onClick={() => setRestart((value) => value + 1)}>
              {t('Kamera fortsetzen')}
            </button>
          )}
          {continuous && pageCount === 0 && (
            <button disabled={taking} onClick={onCancel}>
              {t('Zurück zum Import')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
