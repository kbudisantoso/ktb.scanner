'use client';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
export default function PdfPreview({
  blob,
  activeIndex = 0,
}: {
  blob: Blob;
  activeIndex?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const cache = useRef(new Map<number, HTMLCanvasElement>());
  const [document, setDocument] = useState<{ blob: Blob; pdf: PDFDocumentProxy }>();
  const [error, setError] = useState(''),
    [ready, setReady] = useState(-1),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let disposed = false,
      loading: PDFDocumentLoadingTask | undefined;
    setDocument(undefined);
    setReady(-1);
    setError('');
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const bytes = await blob.arrayBuffer();
        if (disposed) return;
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        loading = pdfjs.getDocument({ data: new Uint8Array(bytes) });
        const pdf = await loading.promise;
        if (!disposed) setDocument({ blob, pdf });
      } catch {
        if (!disposed)
          setError('PDF-Vorschau konnte nicht geladen werden. Der Download bleibt verfügbar.');
      }
    })();
    return () => {
      disposed = true;
      void loading?.destroy();
    };
  }, [blob, retry]);
  useEffect(() => {
    const canvases = cache.current;
    for (const canvas of canvases.values()) canvas.width = canvas.height = 1;
    canvases.clear();
    container.current?.replaceChildren();
  }, [document]);
  useEffect(() => {
    if (!document || document.blob !== blob) return;
    let disposed = false,
      rendering: RenderTask | undefined;
    const canvases = cache.current;
    for (const [index, canvas] of canvases) canvas.hidden = index !== activeIndex;
    const cached = canvases.get(activeIndex);
    if (cached) {
      canvases.delete(activeIndex);
      canvases.set(activeIndex, cached);
      setReady(activeIndex);
      return;
    }
    setReady(-1);
    setError('');
    void (async () => {
      let canvas: HTMLCanvasElement | undefined;
      let page: Awaited<ReturnType<PDFDocumentProxy['getPage']>> | undefined;
      try {
        page = await document.pdf.getPage(activeIndex + 1);
        if (disposed) return;
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: Math.min(1.5, 900 / base.width, 2000 / base.height),
        });
        canvas = window.document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `PDF-Seite ${activeIndex + 1}`);
        rendering = page.render({ canvas, viewport });
        await rendering.promise;
        if (disposed) return;
        canvases.set(activeIndex, canvas);
        container.current?.append(canvas);
        canvas = undefined;
        while (canvases.size > 3) {
          const oldest = canvases.keys().next().value!;
          const obsolete = canvases.get(oldest)!;
          obsolete.remove();
          obsolete.width = obsolete.height = 1;
          canvases.delete(oldest);
        }
        setReady(activeIndex);
      } catch {
        if (!disposed)
          setError('PDF-Seite konnte nicht angezeigt werden. Der Download bleibt verfügbar.');
      } finally {
        page?.cleanup();
        if (canvas) canvas.width = canvas.height = 1;
      }
    })();
    return () => {
      disposed = true;
      rendering?.cancel();
    };
  }, [document, blob, activeIndex]);
  useEffect(
    () => () => {
      for (const canvas of cache.current.values()) canvas.width = canvas.height = 1;
      cache.current.clear();
    },
    [],
  );
  return (
    <div>
      {!error && ready !== activeIndex && (
        <p className="pdf-loading" role="status">
          PDF-Seite wird geladen...
        </p>
      )}
      <div ref={container} className="pdf-pages" />
      {error && (
        <div>
          <p role="alert">{error}</p>
          <button onClick={() => setRetry((n) => n + 1)}>Erneut versuchen</button>
        </div>
      )}
    </div>
  );
}
