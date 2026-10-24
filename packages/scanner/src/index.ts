export type * from './types.ts';
export { SCAN_PROFILES } from './profiles.ts';
export { SHUTTER_SOUNDS } from './sounds.ts';
export type { ShutterSoundId } from './sounds.ts';
export { ScannerError } from './errors.ts';
export { ScanSession, DEFAULT_LIMITS, resolveLimits, metadataFor } from './session.ts';
export { AutoCapture } from './capture.ts';
export {
  validQuad,
  suggestFormat,
  estimatePaperRatio,
  layoutMm,
  fitImage,
  smoothQuad,
  cropSize,
} from './geometry.ts';
export { resolvePaperPreference } from './paper-region.ts';

export { validateMetadata } from './validation.ts';

export type { DiagnosticOptions, DiagnosticEvent, DiagnosticArtifact } from './diagnostics.ts';
