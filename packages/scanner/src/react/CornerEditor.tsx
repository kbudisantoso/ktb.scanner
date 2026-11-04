import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Ref } from 'react';
import type { CornerEditor as Editor, CornerPoints } from 'scanic';
import type { Quad, PageDraft } from '../types.ts';
import { limitedSize, validQuad } from '../geometry.ts';
import { readImageSource, decodeImageSource } from '../image-source.ts';
import { ScannerError } from '../errors.ts';
import type { Translate } from './hooks.ts';
export type CornerEditorHandle = { cancel: () => void; getWorkingBytes: () => number };
// The shared reader bounds all header/EXIF reads to one MiB before any bitmap exists.
const HEADER_WORKING_BYTES = 1024 * 1024;
export function CornerEditor({
  page,
  onApply,
  onCancel,
  findEdges,
  signal,
  cancelRef,
  getWorkingLimit,
  disabled = false,
  t,
}: {
  page: Pick<PageDraft, 'original' | 'corners'>;
  disabled?: boolean;
  onApply: (q: Quad) => void;
  onCancel: () => void;
  findEdges: (signal: AbortSignal) => Promise<Quad | null>;
  signal: AbortSignal;
  cancelRef?: Ref<CornerEditorHandle>;
  getWorkingLimit?: () => number;
  t: Translate;
}) {
  const container = useRef<HTMLDivElement>(null),
    editor = useRef<Editor | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [finding, setFinding] = useState(false);
  const detection = useRef<AbortController | null>(null);
  const resources = useRef<{ bytes: number } | null>(null);
  const applySuggestion = useRef<((corners: Quad) => boolean) | null>(null);
  const callbacks = useRef({ onApply, onCancel, disabled, getWorkingLimit });
  callbacks.current = { onApply, onCancel, disabled, getWorkingLimit };
  const sourceIdentity = useRef({ original: page.original, corners: page.corners, signal });
  sourceIdentity.current = { original: page.original, corners: page.corners, signal };
  const cancelFinding = () => {
    const pending = detection.current;
    detection.current = null;
    pending?.abort();
    if (pending) setFinding(false);
  };
  const cancel = () => {
    if (callbacks.current.disabled || signal.aborted) return;
    cancelFinding();
    callbacks.current.onCancel();
  };
  const getWorkingBytes = () => {
    let bytes = resources.current?.bytes ?? 0;
    for (const canvas of container.current?.querySelectorAll('canvas') ?? [])
      bytes += canvas.width * canvas.height * 4;
    if (loupe.current) bytes += loupe.current.width * loupe.current.height * 4;
    return bytes;
  };
  useImperativeHandle(cancelRef, () => ({ cancel, getWorkingBytes }), [signal]);
  const find = async () => {
    if (disabled || !editor.current || detection.current || signal.aborted) return;
    const pending = new AbortController();
    detection.current = pending;
    const abort = () => {
      if (detection.current === pending) detection.current = null;
      pending.abort();
    };
    signal.addEventListener('abort', abort, { once: true });
    setFinding(true);
    setError('');
    try {
      const corners = await findEdges(pending.signal);
      if (detection.current !== pending || signal.aborted) return;
      if (!corners || !validQuad(corners) || !applySuggestion.current?.(corners))
        setError(t('Keine Dokumentkanten gefunden. Die bisherige Auswahl bleibt erhalten.'));
    } catch {
      if (detection.current === pending && !signal.aborted)
        setError(
          t(
            'Kanten konnten nicht gefunden werden. Bitte erneut versuchen oder Ecken manuell setzen.',
          ),
        );
    } finally {
      signal.removeEventListener('abort', abort);
      if (detection.current === pending) {
        detection.current = null;
        setFinding(false);
      }
    }
  };
  const loupe = useRef<HTMLCanvasElement>(null);
  const active = useRef<string | null>(null);
  const draw = useRef<(() => void) | null>(null);
  const selectCorner = (node: EventTarget | null) => {
    const handle = node instanceof Element ? node.closest<HTMLElement>('[data-corner]') : null;
    if (!handle) return;
    active.current = handle.dataset.corner ?? null;
    draw.current?.();
  };
  const hideLoupe = () => {
    active.current = null;
    if (loupe.current) loupe.current.hidden = true;
  };
  useEffect(() => {
    const host = container.current;
    if (!host || signal.aborted) return;
    setReady(false);
    setFinding(false);
    setError('');
    let disposed = false;
    const controller = new AbortController();
    const owned = { bytes: 0 };
    resources.current = owned;
    let image: HTMLCanvasElement | undefined;
    let instance: Editor | undefined;
    const current = () =>
      !disposed &&
      !controller.signal.aborted &&
      !signal.aborted &&
      sourceIdentity.current.original === page.original &&
      sourceIdentity.current.corners === page.corners &&
      sourceIdentity.current.signal === signal;
    const release = () => {
      if (disposed) return;
      disposed = true;
      controller.abort();
      signal.removeEventListener('abort', release);
      const pending = detection.current;
      detection.current = null;
      pending?.abort();
      const canvases = [...host.querySelectorAll('canvas')];
      const previous = instance;
      instance = undefined;
      try {
        previous?.destroy();
      } catch {
        // Release owned buffers even if the editor has already lost its DOM.
      } finally {
        if (editor.current === previous) editor.current = null;
        for (const canvas of canvases) canvas.width = canvas.height = 1;
        if (image) image.width = image.height = 1;
        image = undefined;
        if (resources.current === owned) {
          resources.current = null;
          applySuggestion.current = null;
          draw.current = null;
          hideLoupe();
        }
      }
    };
    signal.addEventListener('abort', release, { once: true });
    void (async () => {
      let bitmap: ImageBitmap | undefined;
      let sourceReady = false;
      try {
        // Worker limits omit the incoming Blob; the local decoder must charge its own input too.
        const workingLimit = () =>
          (callbacks.current.getWorkingLimit?.() ?? Infinity) - page.original.size;
        if (HEADER_WORKING_BYTES > workingLimit())
          throw new ScannerError(
            'LIMIT_EXCEEDED',
            'Das Bild überschreitet das Pixel- oder Arbeitsspeicherlimit.',
          );
        owned.bytes = HEADER_WORKING_BYTES;
        const info = await readImageSource(page.original, controller.signal);
        if (!current()) return;
        const target = limitedSize(info.size, 4_000_000, 2048);
        if (target.width < 2 || target.height < 2) throw new Error('Editor image is too narrow.');
        const density = window.devicePixelRatio || 1;
        const widthCss = Math.max(1, Math.round(host.clientWidth));
        const heightCss =
          host.clientHeight >= 80
            ? Math.round(host.clientHeight)
            : Math.max(
                240,
                Math.round(
                  Math.min((widthCss * target.height) / target.width, 0.7 * (innerHeight || 800)),
                ),
              );
        // During setup this covers bitmap+source canvas; afterwards own+vendor source canvases.
        const sourceBytes = target.width * target.height * 8;
        const viewportBytes = Math.round(widthCss * density) * Math.round(heightCss * density) * 4;
        const available = workingLimit() + owned.bytes;
        if (sourceBytes + viewportBytes > available)
          throw new ScannerError(
            'LIMIT_EXCEEDED',
            'Das Bild überschreitet das Pixel- oder Arbeitsspeicherlimit.',
          );
        owned.bytes = sourceBytes + viewportBytes;
        bitmap = await decodeImageSource(page.original, info, target, controller.signal);
        if (!current()) return;
        image = window.document.createElement('canvas');
        image.width = bitmap.width;
        image.height = bitmap.height;
        const sourceContext = image.getContext('2d');
        if (!sourceContext) throw new Error('Editor image canvas is unavailable.');
        sourceContext.drawImage(bitmap, 0, 0);
        bitmap.close();
        bitmap = undefined;
        sourceReady = true;
        const { createCornerEditor } = await import('scanic');
        if (!current() || !image) return;
        const source = image;
        const width = source.width - 1,
          height = source.height - 1;
        const keys = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;
        const tokens = getComputedStyle(host);
        let points = Object.fromEntries(
          keys.map((key, i) => [
            key,
            { x: page.corners[i].x * width, y: page.corners[i].y * height },
          ]),
        ) as unknown as CornerPoints;
        draw.current = () => {
          const canvas = loupe.current,
            key = active.current as keyof CornerPoints | null;
          if (!canvas || !key || !current()) return;
          const point = points[key],
            context = canvas.getContext('2d');
          if (!context) return;
          canvas.hidden = false;
          canvas.dataset.position = key === 'topLeft' || key === 'bottomRight' ? 'bottom' : 'top';
          const side = canvas.width,
            zoom = 3;
          context.fillStyle =
            tokens.getPropertyValue('--scanner-loupe-background').trim() || '#f4f6f2';
          context.fillRect(0, 0, side, side);
          context.drawImage(
            source,
            point.x - side / zoom / 2,
            point.y - side / zoom / 2,
            side / zoom,
            side / zoom,
            0,
            0,
            side,
            side,
          );
          context.strokeStyle =
            tokens.getPropertyValue('--scanner-loupe-crosshair').trim() || '#137458';
          context.lineWidth = 2;
          context.beginPath();
          context.moveTo(side / 2, 0);
          context.lineTo(side / 2, side);
          context.moveTo(0, side / 2);
          context.lineTo(side, side / 2);
          context.stroke();
        };
        instance = createCornerEditor({
          container: host,
          image: source,
          corners: Object.fromEntries(
            keys.map((key, i) => [
              key,
              { x: page.corners[i].x * width, y: page.corners[i].y * height },
            ]),
          ) as unknown as CornerPoints,
          keyboard: true,
          handleHitArea: 48,
          magnifier: { enabled: false },
          nudges: { enabled: false },
          toolbar: { enabled: false },
          classNames: { handle: 'scanner-corner-handle', nudges: 'scanner-corner-nudges' },
          theme: {
            accent: tokens.getPropertyValue('--scanner-accent').trim() || '#137458',
            surface: tokens.getPropertyValue('--scanner-surface').trim() || '#ffffff',
            surfaceColor: tokens.getPropertyValue('--scanner-text').trim() || '#182923',
          },
          onChange: (corners: CornerPoints) => {
            if (!current()) return;
            cancelFinding();
            points = corners;
            draw.current?.();
          },
          onConfirm: (corners: CornerPoints) => {
            if (!current() || callbacks.current.disabled || detection.current) return;
            const q = keys.map((key) => ({
              x: Math.min(1, corners[key].x / width),
              y: Math.min(1, corners[key].y / height),
            })) as Quad;
            if (validQuad(q)) callbacks.current.onApply(q);
            else setError(t('Bitte vier gültige Ecken setzen.'));
          },
          onCancel: () => {
            if (current()) cancel();
          },
        });
        editor.current = instance;
        owned.bytes = sourceBytes;
        applySuggestion.current = (corners) => {
          if (!current()) return false;
          const pixels = Object.fromEntries(
            keys.map((key, i) => [key, { x: corners[i].x * width, y: corners[i].y * height }]),
          ) as unknown as CornerPoints;
          // Programmatic suggestions must not cancel themselves through onChange.
          const pending = detection.current;
          detection.current = null;
          const applied = instance?.setCorners(pixels) ?? false;
          detection.current = pending;
          if (applied) {
            points = pixels;
            draw.current?.();
          }
          return applied;
        };
        const labels: Record<string, string> = {
          topLeft: t('Ecke oben links'),
          topRight: t('Ecke oben rechts'),
          bottomRight: t('Ecke unten rechts'),
          bottomLeft: t('Ecke unten links'),
        };
        for (const handle of host.querySelectorAll<HTMLButtonElement>('.scanner-corner-handle')) {
          handle.setAttribute('aria-label', labels[handle.dataset.corner!] ?? t('Dokumentecke'));
        }
        setReady(true);
      } catch (error) {
        if (current()) {
          setReady(false);
          setError(
            t(
              error instanceof ScannerError
                ? error.message
                : sourceReady
                  ? 'Der Eckeneditor konnte nicht geladen werden.'
                  : 'Das Original konnte nicht angezeigt werden.',
            ),
          );
        }
        release();
      } finally {
        bitmap?.close();
      }
    })();
    return release;
  }, [page.original, page.corners, signal]);
  return (
    <section
      className="scanner-corners"
      aria-busy={finding}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        // Scanic already handles Escape on a corner handle.
        if (!event.defaultPrevented) {
          event.preventDefault();
          cancel();
        }
      }}
    >
      <div
        className="scanner-corner-stage"
        onPointerDownCapture={(e) => selectCorner(e.target)}
        onPointerUp={hideLoupe}
        onPointerCancel={hideLoupe}
        onFocusCapture={(e) => selectCorner(e.target)}
        onBlurCapture={hideLoupe}
      >
        <div ref={container} className="scanner-corner-host" />
        <canvas
          ref={loupe}
          width={240}
          height={240}
          className="scanner-corner-loupe"
          aria-label={t('Vergrößerte Dokumentecke')}
          hidden
        />
      </div>
      {error && <p role="alert">{error}</p>}
      {finding && <p role="status">{t('Dokumentkanten werden gesucht...')}</p>}
      <button
        disabled={disabled || !ready}
        aria-disabled={finding}
        onClick={(event) => {
          // Keep a keyboard target while busy, including browsers that do not focus clicked buttons.
          event.currentTarget.focus();
          void find();
        }}
      >
        {t('Kanten finden')}
      </button>
      <div className="scanner-actions">
        <button disabled={disabled} onClick={cancel}>
          {t('Abbrechen')}
        </button>
        <button disabled={disabled || !ready || finding} onClick={() => editor.current?.confirm()}>
          {t('Zuschnitt übernehmen')}
        </button>
      </div>
    </section>
  );
}
