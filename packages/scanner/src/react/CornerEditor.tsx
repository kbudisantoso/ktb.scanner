import { useEffect, useRef, useState } from 'react';
import type { CornerEditor as Editor, CornerPoints } from 'scanic';
import type { Quad, PageDraft } from '../types.ts';
import { validQuad } from '../geometry.ts';
import { useBlobUrl } from './hooks.ts';
import type { Translate } from './hooks.ts';
export function CornerEditor({
  page,
  onApply,
  onCancel,
  disabled = false,
  t,
}: {
  page: Pick<PageDraft, 'original' | 'corners'>;
  disabled?: boolean;
  onApply: (q: Quad) => void;
  onCancel: () => void;
  t: Translate;
}) {
  const container = useRef<HTMLDivElement>(null),
    editor = useRef<Editor | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
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
    if (!url || !container.current) return;
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
          context.fillStyle = '#f4f6f2';
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
          context.strokeStyle = '#137458';
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
            points = corners;
            draw.current?.();
          },
          onConfirm: (corners: CornerPoints) => {
            const q = keys.map((key) => ({
              x: Math.min(1, corners[key].x / width),
              y: Math.min(1, corners[key].y / height),
            })) as Quad;
            if (validQuad(q)) onApply(q);
            else setError(t('Bitte vier gültige Ecken setzen.'));
          },
          onCancel,
        });
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
    image.onerror = () => setError(t('Das Original konnte nicht angezeigt werden.'));
    image.src = url;
    return () => {
      disposed = true;
      image.onload = image.onerror = null;
      editor.current?.destroy();
      editor.current = null;
      draw.current = null;
      hideLoupe();
    };
  }, [url]);
  return (
    <section className="scanner-corners">
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
      <div className="scanner-actions">
        <button disabled={disabled} onClick={onCancel}>
          {t('Abbrechen')}
        </button>
        <button disabled={disabled || !ready} onClick={() => editor.current?.confirm()}>
          {t('Zuschnitt übernehmen')}
        </button>
      </div>
    </section>
  );
}
