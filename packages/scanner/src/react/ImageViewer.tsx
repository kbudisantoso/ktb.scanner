import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createTranslator, type ScanLocale } from '../i18n.ts';
import { useBlobUrl } from './hooks.ts';
import { ToolIcon } from './ToolIcon.tsx';

export interface ImageViewerProps {
  image: Blob;
  before?: Blob;
  alt: string;
  resetKey: string;
  texts?: Record<string, string>;
  locale?: ScanLocale;
  className?: string;
  /** Optional page gesture, only at fit with one pointer and without held Before. */
  onPageSwipe?: (direction: 'previous' | 'next') => void;
}
type Point = { x: number; y: number };
type View = { scale: number; x: number; y: number; fit: boolean };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** A bounded image workspace shared by review tools and host result views. */
export function ImageViewer({
  image,
  before,
  alt,
  resetKey,
  texts,
  locale,
  className = '',
  onPageSwipe,
}: ImageViewerProps) {
  const t = createTranslator(locale, texts);
  const url = useBlobUrl(image),
    beforeUrl = useBlobUrl(before);
  const surface = useRef<HTMLDivElement>(null);
  const swipeHandler = useRef(onPageSwipe);
  swipeHandler.current = onPageSwipe;
  const swipe = useRef<Point | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [loaded, setLoaded] = useState('');
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0, fit: true });
  const [held, setHeld] = useState(false);
  const current = useRef(view);
  current.current = view;
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ point: Point; distance: number; view: View; moved: boolean } | null>(
    null,
  );
  const ignore = useRef(0),
    lastTap = useRef(-Infinity);
  const fit = Math.min(
    1,
    Math.max(1, size.width - 24) / (natural.width || 1),
    Math.max(1, size.height - 24) / (natural.height || 1),
  );
  const bound = (value: View): View => {
    const scale = value.fit ? fit : clamp(value.scale, fit, 4);
    const w = natural.width * scale,
      h = natural.height * scale;
    return {
      ...value,
      scale,
      x: w <= size.width - 24 ? (size.width - w) / 2 : clamp(value.x, size.width - 12 - w, 12),
      y: h <= size.height - 24 ? (size.height - h) / 2 : clamp(value.y, size.height - 12 - h, 12),
    };
  };
  const displayed = bound(view);
  const geometry = () => {
    const values = [...pointers.current.values()];
    return values.length > 1
      ? {
          point: { x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2 },
          distance: Math.max(1, Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y)),
        }
      : { point: values[0], distance: 0 };
  };
  const start = () => {
    const { point, distance } = geometry();
    gesture.current = point
      ? { point, distance, view: bound(current.current), moved: false }
      : null;
  };
  const scaleTo = (scale: number, anchor = { x: size.width / 2, y: size.height / 2 }) => {
    const previous = bound(current.current),
      next = clamp(scale, fit, 4);
    setView(
      bound({
        scale: next,
        fit: next <= fit + 0.0001,
        x: anchor.x - ((anchor.x - previous.x) * next) / previous.scale,
        y: anchor.y - ((anchor.y - previous.y) * next) / previous.scale,
      }),
    );
  };
  const toggle = (anchor?: Point) => {
    if (current.current.fit) scaleTo(1, anchor);
    else setView({ ...current.current, fit: true });
  };
  const step = (direction: number) => {
    const steps = [fit, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4].filter((n) => n >= fit);
    const scale = bound(current.current).scale;
    const next =
      direction > 0
        ? steps.find((n) => n > scale + 0.0001)
        : steps.filter((n) => n < scale - 0.0001).at(-1);
    if (next !== undefined) scaleTo(next);
  };
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(surface.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setView({ scale: 1, x: 0, y: 0, fit: true });
    setHeld(false);
    pointers.current.clear();
    swipe.current = null;
    gesture.current = null;
    // Keep the swipe/pan click guard across a synchronous page change.
    lastTap.current = -Infinity;
  }, [resetKey]);
  useEffect(() => {
    const release = () => setHeld(false);
    const cancel = () => {
      release();
      pointers.current.clear();
      swipe.current = null;
      gesture.current = null;
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') release();
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('keyup', key);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', cancel);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('keyup', key);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', cancel);
    };
  }, []);
  const finishPointer = (id: number, cancelled = false) => {
    if (!pointers.current.has(id)) return;
    const moved = gesture.current?.moved || !!gesture.current?.distance;
    let pageDirection: 'previous' | 'next' | undefined;
    const startPoint = swipe.current,
      endPoint = pointers.current.get(id);
    if (
      !cancelled &&
      pointers.current.size === 1 &&
      startPoint &&
      endPoint &&
      current.current.fit &&
      !held
    ) {
      const dx = endPoint.x - startPoint.x,
        dy = endPoint.y - startPoint.y;
      if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        ignore.current = performance.now() + 500;
        pageDirection = dx < 0 ? 'next' : 'previous';
      }
    }
    swipe.current = null;
    pointers.current.delete(id);
    if (moved || cancelled) ignore.current = performance.now() + 500;
    start();
    if (pageDirection) swipeHandler.current?.(pageDirection);
  };
  return (
    <div className={`scanner-image-viewer ${className}`} lang={locale ?? 'en'}>
      <div
        ref={surface}
        className="scanner-image-surface"
        tabIndex={0}
        role="button"
        aria-label={t(
          displayed.fit
            ? 'Bild auf 100 Prozent vergrößern'
            : 'Vergrößerte Ansicht - zum Einpassen tippen',
        )}
        data-zoom={displayed.fit ? 'fit' : Math.round(displayed.scale * 100)}
        onContextMenu={(e) => e.preventDefault()}
        onDoubleClick={(e) => e.preventDefault()}
        onClick={(e) => {
          const now = performance.now();
          if (now < ignore.current || now - lastTap.current < 500) return;
          lastTap.current = now;
          const rect = e.currentTarget.getBoundingClientRect();
          toggle(e.detail ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : undefined);
        }}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            if (!e.repeat) toggle();
          }
          if (e.key === '+' || e.key === '=') {
            e.preventDefault();
            step(1);
          }
          if (e.key === '-') {
            e.preventDefault();
            step(-1);
          }
          const moves: Record<string, Point> = {
            ArrowLeft: { x: 48, y: 0 },
            ArrowRight: { x: -48, y: 0 },
            ArrowUp: { x: 0, y: 48 },
            ArrowDown: { x: 0, y: -48 },
          };
          if (moves[e.key] && !view.fit) {
            e.preventDefault();
            const d = moves[e.key];
            setView(bound({ ...displayed, x: displayed.x + d.x, y: displayed.y + d.y }));
          }
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const r = e.currentTarget.getBoundingClientRect();
          const point = { x: e.clientX - r.left, y: e.clientY - r.top };
          swipe.current =
            !pointers.current.size && current.current.fit && !held && swipeHandler.current
              ? point
              : null;
          pointers.current.set(e.pointerId, point);
          start();
        }}
        onPointerMove={(e) => {
          if (!pointers.current.has(e.pointerId)) return;
          const r = e.currentTarget.getBoundingClientRect();
          pointers.current.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
          const g = gesture.current;
          if (!g) return;
          const now = geometry();
          if (now.distance && g.distance) {
            const scale = clamp((g.view.scale * now.distance) / g.distance, fit, 4);
            setView(
              bound({
                scale,
                fit: scale <= fit + 0.0001,
                x: now.point.x - ((g.point.x - g.view.x) * scale) / g.view.scale,
                y: now.point.y - ((g.point.y - g.view.y) * scale) / g.view.scale,
              }),
            );
            g.moved = true;
          } else {
            const dx = now.point.x - g.point.x,
              dy = now.point.y - g.point.y;
            if (Math.hypot(dx, dy) > 6) g.moved = true;
            if (g.moved) setView(bound({ ...g.view, x: g.view.x + dx, y: g.view.y + dy }));
          }
        }}
        onPointerUp={(e) => finishPointer(e.pointerId)}
        onPointerCancel={(e) => finishPointer(e.pointerId, true)}
        onLostPointerCapture={(e) => finishPointer(e.pointerId, true)}
      >
        {url && (
          <img
            src={url}
            alt={alt}
            draggable={false}
            onLoad={(e) => {
              setNatural({
                width: e.currentTarget.naturalWidth,
                height: e.currentTarget.naturalHeight,
              });
              setLoaded(url);
            }}
            style={{
              width: natural.width,
              height: natural.height,
              transform: `translate(${displayed.x}px, ${displayed.y}px) scale(${displayed.scale})`,
              visibility: loaded === url ? 'visible' : 'hidden',
            }}
          />
        )}
        {held && beforeUrl && (
          <img
            className="scanner-before-image"
            src={beforeUrl}
            alt={t('Unoptimierter Zuschnitt')}
            draggable={false}
            style={{
              width: natural.width,
              height: natural.height,
              transform: `translate(${displayed.x}px, ${displayed.y}px) scale(${displayed.scale})`,
            }}
          />
        )}
        {loaded !== url && (
          <span className="scanner-image-loading" role="status">
            {t('Vorschau wird geladen')}
          </span>
        )}
      </div>
      <div className="scanner-viewer-controls">
        {before && (
          <button
            className="scanner-before-control"
            aria-label={t('Vorher anzeigen - gedrückt halten')}
            aria-pressed={held}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              setHeld(true);
            }}
            onPointerUp={() => setHeld(false)}
            onPointerCancel={() => setHeld(false)}
            onLostPointerCapture={() => setHeld(false)}
            onBlur={() => setHeld(false)}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                setHeld(true);
              }
            }}
            onKeyUp={() => setHeld(false)}
          >
            <ToolIcon name="before" />
            <span className="scanner-sr-only">{t('Vorher')}</span>
          </button>
        )}
        <div className="scanner-zoom-controls" role="group" aria-label={t('Bildzoom')}>
          <button
            aria-label={t('Verkleinern')}
            disabled={displayed.scale <= fit + 0.0001}
            onClick={() => step(-1)}
          >
            <ToolIcon name="zoom-out" />
          </button>
          <button
            aria-label={t(displayed.fit ? '100 Prozent' : 'Bild einpassen')}
            onClick={() => toggle()}
          >
            {displayed.fit ? 'Fit' : `${Math.round(displayed.scale * 100)} %`}
          </button>
          <button
            aria-label={t('Vergrößern')}
            disabled={displayed.scale >= 4}
            onClick={() => step(1)}
          >
            <ToolIcon name="zoom-in" />
          </button>
        </div>
      </div>
    </div>
  );
}
