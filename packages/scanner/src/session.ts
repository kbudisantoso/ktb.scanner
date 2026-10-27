import type { Limits, PageDraft, ScanPage, PageMetadata } from './types.ts';
import { ScannerError } from './errors.ts';
import { validQuad, cropSize, layoutMm } from './geometry.ts';
export const DEFAULT_LIMITS: Readonly<Limits> = Object.freeze({
  pages: 20,
  fileBytes: 20 * 1024 ** 2,
  inputPixels: 24_000_000,
  originalBytes: 100 * 1024 ** 2,
  outputPixels: 8_000_000,
  outputDimension: 4096,
  resultBytes: 128 * 1024 ** 2,
  workingBytes: 384 * 1024 ** 2,
});
export function resolveLimits(overrides: Partial<Limits> = {}): Limits {
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  if (!Object.values(limits).every((n) => Number.isSafeInteger(n) && n > 0))
    throw new ScannerError('CONFIG_INVALID', 'Limits müssen positive ganze Zahlen sein.');
  return limits;
}
export function metadataFor(
  page: PageDraft,
  mime: ScanPage['metadata']['outputMimeType'],
  outputSize = page.outputSize,
): PageMetadata {
  const size = cropSize(page.corners, page.size);
  return {
    schemaVersion: 1,
    source: page.source,
    normalizedSourceSizePx: { ...page.size },
    corners: structuredClone(page.corners),
    rotationDegrees: page.rotation,
    outputSizePx: { ...outputSize },
    outputMimeType: mime,
    geometry: {
      shortToLongRatio: Math.min(size.width, size.height) / Math.max(size.width, size.height),
      evidence: 'estimated',
      reliability: 'uncertain',
    },
    format: structuredClone(page.format),
    outputLayoutMm: layoutMm(
      page.format,
      page.rotation === 90 || page.rotation === 270
        ? { width: outputSize.height, height: outputSize.width }
        : outputSize,
      page.rotation,
    ),
    physicalSizeMm: null,
    recipe: structuredClone(page.recipe),
    ...(page.autoOptimization ? { autoOptimization: structuredClone(page.autoOptimization) } : {}),
    ...(page.lensCorrection ? { lensCorrection: structuredClone(page.lensCorrection) } : {}),
    quality: structuredClone(page.quality),
    engine: { id: 'scanic', version: '1.7.1', adapterVersion: '0.2.0' },
  };
}
export class ScanSession {
  readonly id = crypto.randomUUID();
  private items: PageDraft[] = [];
  private locked = false;
  readonly limits: Limits;
  constructor(limits = resolveLimits()) {
    this.limits = limits;
  }
  get pages(): readonly PageDraft[] {
    return this.items.map((p) => structuredClone(p));
  }
  private writable(): void {
    if (this.locked) throw new ScannerError('SCANNER_BUSY', 'Der Export läuft.');
  }
  checkImport(blob: Blob, replaceId?: string): void {
    this.checkCapacity(blob, replaceId, true);
  }
  private checkCapacity(blob: Blob, replaceId: string | undefined, keepPrevious: boolean): void {
    this.writable();
    if (replaceId && !this.items.some((page) => page.id === replaceId))
      throw new ScannerError('PAGE_MISSING', 'Die Seite ist nicht mehr vorhanden.');
    // The previous original remains owned until a replacement is accepted.
    const retained = keepPrevious ? this.items : this.items.filter((p) => p.id !== replaceId);
    if (
      blob.size > this.limits.fileBytes ||
      retained.reduce((s, p) => s + p.original.size, blob.size) > this.limits.originalBytes ||
      (!replaceId && this.items.length >= this.limits.pages)
    )
      throw new ScannerError(
        'LIMIT_EXCEEDED',
        'Datei- oder Sitzungslimit erreicht. Vorhandene Seiten bleiben erhalten.',
      );
  }
  accept(draft: PageDraft, replaceId?: string): void {
    this.checkCapacity(draft.original, replaceId, false);
    if (!validQuad(draft.corners))
      throw new ScannerError(
        'CORNERS_INVALID',
        'Die vier Ecken müssen ein gültiges Viereck bilden.',
      );
    const index = replaceId ? this.items.findIndex((p) => p.id === replaceId) : -1;
    if (replaceId && index < 0)
      throw new ScannerError('PAGE_MISSING', 'Die Seite ist nicht mehr vorhanden.');
    const page = structuredClone(draft);
    if (index >= 0) {
      page.id = this.items[index].id;
      page.revision = this.items[index].revision + 1;
    } else {
      page.id = crypto.randomUUID();
      page.revision = 1;
    }
    page.quality.revision = page.revision;
    const previews = this.items.reduce(
      (n, p, i) =>
        n +
        (i === index ? 0 : p.preview.size + p.thumbnail.size + (p.unoptimizedPreview?.size ?? 0)),
      page.preview.size + page.thumbnail.size + (page.unoptimizedPreview?.size ?? 0),
    );
    if (previews > this.limits.resultBytes)
      throw new ScannerError('LIMIT_EXCEEDED', 'Zu viele Vorschaudaten. Bitte Seiten entfernen.');
    if (index < 0) this.items.push(page);
    else this.items[index] = page;
  }
  remove(id: string): void {
    this.writable();
    this.items = this.items.filter((p) => p.id !== id);
  }
  move(id: string, delta: number): void {
    this.writable();
    const from = this.items.findIndex((p) => p.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= this.items.length) return;
    const [item] = this.items.splice(from, 1);
    this.items.splice(to, 0, item);
  }
  async export<T>(operation: (snapshot: readonly PageDraft[]) => Promise<T>): Promise<T> {
    this.writable();
    if (!this.items.length)
      throw new ScannerError('EMPTY_SESSION', 'Bitte mindestens eine Seite hinzufügen.');
    this.locked = true;
    try {
      return await operation(this.pages);
    } finally {
      this.locked = false;
    }
  }
  clear(): void {
    this.items = [];
  }
}
