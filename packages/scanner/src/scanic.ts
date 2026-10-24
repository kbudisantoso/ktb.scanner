import type { EngineAdapter, ProcessRequest, ProcessingResult, LiveDetection } from './types.ts';
import type { DiagnosticOptions } from './diagnostics.ts';
import { diagnose, diagnosticsActive } from './diagnostics.ts';
import { WorkerClient, assetUrl } from './worker-client.ts';
export function createScanicAdapter(
  assetBaseUrl: string,
  diagnostics?: DiagnosticOptions,
): EngineAdapter {
  const worker = new WorkerClient(assetUrl(assetBaseUrl, 'processing.worker.js'));
  const adapterId = diagnostics ? crypto.randomUUID() : '';
  let sequence = 0;
  const run = async <T>(
    kind: string,
    message: Record<string, unknown>,
    transfer: Transferable[],
    signal?: AbortSignal,
    timeout = 60_000,
  ): Promise<T> => {
    const job = `${adapterId}:${++sequence}`;
    const enabled = diagnosticsActive(diagnostics, kind);
    const started = performance.now();
    diagnose(diagnostics, 'job-start', {
      job,
      kind,
      engineBuffers: diagnostics?.engineBuffers === true,
    });
    try {
      const result = await worker.run<T>(
        {
          ...message,
          kind,
          trace: enabled,
          // Keep the detector path stable even after the host stops recording heavy details.
          engineBuffers: diagnostics?.engineBuffers === true,
          includeEngineBuffers:
            enabled &&
            diagnostics?.engineBuffers === true &&
            diagnosticsActive(diagnostics, 'buffers'),
        },
        transfer,
        signal,
        timeout,
        (event) => diagnose(diagnostics, event.type, { ...event.data, job, kind }, event.artifacts),
      );
      diagnose(diagnostics, 'job-complete', { job, kind, durationMs: performance.now() - started });
      return result;
    } catch (error) {
      diagnose(diagnostics, 'job-error', {
        job,
        kind,
        durationMs: performance.now() - started,
        name: error instanceof Error ? error.name : 'unknown',
        message: error instanceof Error ? error.message : '',
      });
      throw error;
    }
  };
  return {
    process: (request: ProcessRequest, signal?: AbortSignal) =>
      run<ProcessingResult>('process', { request }, [], signal),
    detect: async (image: ImageBitmap, timestamp: number, signal?: AbortSignal) => {
      try {
        return await run<LiveDetection>('detect', { image, timestamp }, [image], signal, 5000);
      } finally {
        image.close();
      }
    },
    destroy: () => worker.destroy(),
  };
}
