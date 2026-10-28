import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Ref } from 'react';
import type { CornerEditor as Editor, CornerPoints } from 'scanic';
import type { Quad, PageDraft } from '../types.ts';
import { validQuad } from '../geometry.ts';
import { useBlobUrl } from './hooks.ts';
import type { Translate } from './hooks.ts';
export type CornerEditorHandle = { cancel: () => void };
export function CornerEditor({
  page,
  onApply,
  onCancel,
  findEdges,
  signal,
  cancelRef,
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
  t: Translate;
}) {
  const container = useRef<HTMLDivElement>(null),
    editor = useRef<Editor | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [finding, setFinding] = useState(false);
  const detection = useRef<AbortController | null>(null);
  const applySuggestion = useRef<((corners: Quad) => boolean) | null>(null);
  const callbacks = useRef({ onApply, onCancel, disabled });
  callbacks.current = { onApply, onCancel, disabled };
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
  useImperativeHandle(cancelRef, () => ({ cancel }), [signal]);
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
  const url = useBlobUrl(page.original);
  useEffect(() => {
    if (!url || !container.current || signal.aborted) return;
    setReady(false);
    setFinding(false);
    setError('');
    let disposed = false;
    const image = new Image();
    image.onload = async () => {
      try {
        const { createCornerEditor } = await import('scanic');
        if (disposed || !container.current) return;
        const width = image.naturalWidth - 1,
          height = image.naturalHeight - 1;
        const keys = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;
        const tokens = getComputedStyle(container.current);
        let points = Object.fromEntries(
          keys.map((key, i) => [
            key,
            { x: page.corners[i].x * width, y: page.corners[i].y * height },
          ]),
        ) as unknown as CornerPoints;
        draw.current = () => {
          const canvas = loupe.current,
            key = active.current as keyof CornerPoints | null;
          if (!canvas || !key) return;
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
            image,
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
        editor.current = createCornerEditor({
          container: container.current,
          image,
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
            cancelFinding();
            points = corners;
            draw.current?.();
          },
          onConfirm: (corners: CornerPoints) => {
            if (disposed || signal.aborted || callbacks.current.disabled || detection.current)
              return;
            const q = keys.map((key) => ({
              x: Math.min(1, corners[key].x / width),
              y: Math.min(1, corners[key].y / height),
            })) as Quad;
            if (validQuad(q)) callbacks.current.onApply(q);
            else setError(t('Bitte vier gültige Ecken setzen.'));
          },
          onCancel: cancel,
        });
        applySuggestion.current = (corners) => {
          const pixels = Object.fromEntries(
            keys.map((key, i) => [key, { x: corners[i].x * width, y: corners[i].y * height }]),
          ) as unknown as CornerPoints;
          // Programmatic suggestions must not cancel themselves through onChange.
          const pending = detection.current;
          detection.current = null;
          const applied = editor.current?.setCorners(pixels) ?? false;
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
        for (const handle of container.current.querySelectorAll<HTMLButtonElement>(
          '.scanner-corner-handle',
        )) {
          handle.setAttribute('aria-label', labels[handle.dataset.corner!] ?? t('Dokumentecke'));
        }
        setReady(true);
      } catch {
        if (!disposed) setError(t('Der Eckeneditor konnte nicht geladen werden.'));
      }
    };
    image.onerror = () => {
      if (!disposed && !signal.aborted) setError(t('Das Original konnte nicht angezeigt werden.'));
    };
    image.src = url;
    return () => {
      disposed = true;
      const pending = detection.current;
      detection.current = null;
      pending?.abort();
      image.onload = image.onerror = null;
      editor.current?.destroy();
      editor.current = null;
      applySuggestion.current = null;
      draw.current = null;
      hideLoupe();
    };
  }, [url, signal]);
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
