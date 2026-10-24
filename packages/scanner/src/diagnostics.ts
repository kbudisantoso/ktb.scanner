/** Opt-in diagnostic data. Never persisted or uploaded by the scanner. */
export interface DiagnosticArtifact {
  stage: string;
  blob: Blob;
  width?: number;
  height?: number;
  coordinateSpace?: string;
  encoding?: string;
}
export interface DiagnosticEvent {
  type: string;
  atMs: number;
  data: Record<string, unknown>;
  artifacts?: DiagnosticArtifact[];
}
export interface DiagnosticOptions {
  onEvent: (event: DiagnosticEvent) => void;
  /** Adds Scanic's available intermediate buffers; changes the detector execution path. */
  engineBuffers?: boolean;
  /** Return false when the host's recording budget is exhausted. */
  isActive?: (kind?: string) => boolean;
}
export function diagnosticsActive(options?: DiagnosticOptions, kind?: string): boolean {
  try {
    return !!options && (options.isActive?.(kind) ?? true);
  } catch {
    return false;
  }
}
export function diagnose(
  options: DiagnosticOptions | undefined,
  type: string,
  data: Record<string, unknown> = {},
  artifacts?: DiagnosticArtifact[],
): void {
  if (!diagnosticsActive(options)) return;
  try {
    options!.onEvent({ type, atMs: performance.now(), data, ...(artifacts ? { artifacts } : {}) });
  } catch {
    // Diagnostics must never change the success or cancellation of a scan.
  }
}
