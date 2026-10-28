import type { CropRequired, FormatSelection, Limits, PageDraft, Recipe } from '../types.ts';
import { ScannerError } from '../errors.ts';

export type PendingCrop = CropRequired & {
  original: Blob;
  source: 'camera' | 'file';
  id: string;
  revision: number;
  recipe: Recipe;
  format?: FormatSelection;
};
export type CaptureCandidate = PageDraft | PendingCrop;
export type UnreviewedPage =
  { kind: 'file'; file: File } | { kind: 'capture'; candidate: CaptureCandidate };
export type CaptureOutcome = { preview?: Blob; needsCrop?: boolean } | undefined;

/** Pending captures own blobs, never accepted/exportable session pages. */
export function retainedCaptureLimits(
  limits: Limits,
  candidates: readonly CaptureCandidate[],
  files: readonly Blob[],
  incoming: Blob,
  pageCount: number,
  extraPreviews: readonly Blob[] = [],
  cameraSnapshotBytes = 0,
): Limits {
  const originals = new Set<Blob>([incoming, ...files]),
    previews = new Set<Blob>(extraPreviews);
  for (const page of candidates) {
    originals.add(page.original);
    if ('preview' in page)
      for (const blob of [page.preview, page.thumbnail, page.unoptimizedPreview])
        if (blob) previews.add(blob);
  }
  const originalBytes = [...originals].reduce((n, blob) => n + blob.size, 0);
  const previewBytes = [...previews].reduce((n, blob) => n + blob.size, 0);
  const remaining = {
    ...limits,
    resultBytes: limits.resultBytes - previewBytes,
    workingBytes: limits.workingBytes - originalBytes - previewBytes - cameraSnapshotBytes,
  };
  if (
    pageCount > limits.pages ||
    incoming.size > limits.fileBytes ||
    originalBytes > limits.originalBytes ||
    remaining.resultBytes <= 0 ||
    remaining.workingBytes <= 0
  )
    throw new ScannerError(
      'LIMIT_EXCEEDED',
      'Datei- oder Sitzungslimit erreicht. Vorhandene Seiten bleiben erhalten.',
    );
  return remaining;
}
