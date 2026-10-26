import type { DiagnosticOptions } from './diagnostics.ts';
import type { ShutterSoundId } from './sounds.ts';
import type { ScanLocale } from './i18n.ts';
export interface Point {
  x: number;
  y: number;
}
/** Clockwise TL, TR, BR, BL, normalized against the orientation-normalized original. */
export type Quad = [Point, Point, Point, Point];
export interface Size {
  width: number;
  height: number;
}
export type CaptureMode = 'auto' | 'manual';
export type ImageMime = 'image/jpeg' | 'image/png';
export type Rotation = 0 | 90 | 180 | 270;
export type ScanProfile = 'auto' | 'photo' | 'color' | 'grayscale' | 'bw';
export type Preset = 'A3' | 'A4' | 'A5' | 'A6' | 'letter' | 'postcard-100x150';
export type PaperPreference = 'A4' | 'letter';
export type PaperOrientation = 'portrait' | 'landscape';
export type FormatSelection =
  | {
      kind: 'standard';
      preset: Preset;
      /** Paper axes before the separate image rotation; omission infers from the crop. */
      orientation?: PaperOrientation;
      origin: 'default' | 'heuristic' | 'user';
    }
  | { kind: 'receipt'; widthMm: number; origin: 'default' | 'heuristic' | 'user' }
  | { kind: 'original-ratio'; origin: 'default' | 'user' };
export interface Recipe {
  version: 1;
  /** Auto remains the requested mode; resolved filter is recorded in AutoOptimization. */
  enhancement: 'auto' | 'none' | 'document' | 'paper' | 'grayscale' | 'bw';
  dewarp: 'off' | 'auto' | 'manual';
  /** Division-model radial strength; only used in manual mode. */
  lensStrength?: number;
  /** Explicit overrides; omission uses Auto's proposed settings, otherwise neutral values. */
  adjustments?: { brightness: number; contrast: number; sharpness: number };
}
/** Decision from the current processing pass, not a semantic content classification. */
export interface AutoOptimization {
  profile: 'photo' | 'color';
  reason: 'paper-background' | 'preserve-photo';
  neutralFraction: number;
  flatFraction: number;
  contrastGain: number;
  /** Automatic proposal. Explicit recipe.adjustments take precedence. */
  adjustments: { brightness: number; contrast: number; sharpness: number };
}
export interface LensCorrection {
  status: 'off' | 'applied' | 'already-straight' | 'insufficient-evidence';
  strength: number;
  supportedEdges: number;
  beforePx?: number;
  afterPx?: number;
}
export interface Quality {
  state: 'completed';
  method: 'image-metrics';
  revision: number;
  assessment: 'no-warning' | 'review-advised' | 'unknown';
  sharpness: 'sharp' | 'blur' | 'unknown';
  reasons: ('blur' | 'exposure' | 'edges' | 'insufficient-structure')[];
  regions: {
    variance: number;
    contrast: number;
    mean: number;
    edgeRatio?: number;
    edgeSamples?: number;
    edgeRatioX?: number;
    edgeRatioY?: number;
  }[];
}
export interface PageMetadata {
  schemaVersion: 1;
  source: 'camera' | 'file';
  normalizedSourceSizePx: Size;
  corners: Quad;
  rotationDegrees: Rotation;
  outputSizePx: Size;
  outputMimeType: ImageMime;
  geometry: { shortToLongRatio: number; evidence: 'estimated'; reliability: 'uncertain' };
  format: FormatSelection;
  outputLayoutMm: Size;
  physicalSizeMm: null;
  recipe: Recipe;
  autoOptimization?: AutoOptimization;
  lensCorrection?: LensCorrection;
  quality: Quality;
  engine: { id: 'scanic'; version: string; adapterVersion: string };
}
export interface ScanPage {
  id: string;
  revision: number;
  image: Blob;
  original?: Blob;
  metadata: PageMetadata;
}
export type ScanResult =
  | { status: 'confirmed'; schemaVersion: 1; sessionId: string; pages: ScanPage[]; pdf?: Blob }
  | { status: 'cancelled' };
export interface OpenOptions {
  signal?: AbortSignal;
  initialFiles?: File[];
  defaultProfile?: ScanProfile;
  /** Per-session override of measured stable time before automatic capture, in ms. */
  autoCaptureStabilityMs?: number;
}
export interface ScannerController {
  open(options?: OpenOptions): Promise<ScanResult>;
  destroy(): Promise<void>;
}
export interface Limits {
  pages: number;
  fileBytes: number;
  inputPixels: number;
  originalBytes: number;
  outputPixels: number;
  outputDimension: number;
  resultBytes: number;
  workingBytes: number;
}
export interface ScannerOptions {
  mount: HTMLElement;
  assetBaseUrl: string;
  theme?: Record<`--scanner-${string}`, string>;
  texts?: Record<string, string>;
  /** UI language. English by default; German is built in. */
  locale?: ScanLocale;
  context?: 'invoice' | 'expense' | 'generic';
  /** ISO region used only as a weak A4/Letter prior; otherwise the primary browser locale. */
  paperRegion?: string;
  initialMode?: CaptureMode;
  /** Measured stable time before automatic capture. Integer 100..5000 ms; default 1000. */
  autoCaptureStabilityMs?: number;
  defaultProfile?: ScanProfile;
  imageType?: ImageMime;
  shutterSound?: ShutterSoundId;
  /** Host-owned audio URL overriding the selected cue. 'off' always stays silent. */
  shutterSoundUrl?: string;
  createPdf?: boolean;
  includeOriginals?: boolean;
  diagnostics?: DiagnosticOptions;
  limits?: Partial<Limits>;
}
export interface PageDraft {
  id: string;
  revision: number;
  original: Blob;
  source: 'camera' | 'file';
  size: Size;
  corners: Quad;
  rotation: Rotation;
  format: FormatSelection;
  recipe: Recipe;
  preview: Blob;
  unoptimizedPreview?: Blob;
  paperCleanup?: { applied: boolean; neutralFraction: number };
  autoOptimization?: AutoOptimization;
  lensCorrection?: LensCorrection;
  thumbnail: Blob;
  quality: Quality;
  outputSize: Size;
  edgesUncertain: boolean;
}
export interface Processed {
  format?: FormatSelection;
  size: Size;
  corners: Quad;
  preview: Blob;
  unoptimizedPreview?: Blob;
  paperCleanup?: { applied: boolean; neutralFraction: number };
  autoOptimization?: AutoOptimization;
  lensCorrection?: LensCorrection;
  thumbnail: Blob;
  outputSize: Size;
  quality: Quality;
  edgesUncertain: boolean;
}
/** No result image exists until the host obtains an explicitly confirmed crop. */
export interface CropRequired {
  status: 'crop-required';
  size: Size;
  corners: Quad;
  reason: 'not-detected' | 'capture-conflict';
}
export type ProcessingResult = Processed | CropRequired;
export interface CaptureHint {
  /** True only after the automatic stability gate completed; manual hints are not authoritative. */
  stable?: boolean;
  corners: Quad;
  frameSize: Size;
  ageMs: number;
  mapping: 'same-frame-area' | 'unverified-photo-area';
}
export interface ProcessRequest {
  /** Omit the extra comparison blob during final export. */
  previewComparison?: boolean;
  preferredPaper?: PaperPreference;
  /** Comparison only. Never used as confirmed crop corners. */
  captureHint?: CaptureHint;
  /** Correlation only; has no effect on processing. */
  diagnosticContext?: {
    pageId: string;
    source: 'camera' | 'file';
    operation: 'initial' | 'edit' | 'export';
  };
  /** Paper ratio for rectification. Omission uses the unconstrained geometry suggestion. */
  format?: FormatSelection;
  original: Blob;
  limits: Limits;
  corners?: Quad;
  rotation: Rotation;
  recipe: Recipe;
  revision: number;
  mime: ImageMime;
}
export interface LiveDetection {
  corners: Quad | null;
  sharpness: Quality['sharpness'];
  timestamp: number;
}
export interface EngineAdapter {
  process(request: ProcessRequest, signal?: AbortSignal): Promise<ProcessingResult>;
  detect(image: ImageBitmap, timestamp: number, signal?: AbortSignal): Promise<LiveDetection>;
  destroy(): void;
}
