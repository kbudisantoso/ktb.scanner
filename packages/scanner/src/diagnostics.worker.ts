import type { DiagnosticArtifact } from './diagnostics.ts';
import { limitedSize } from './geometry.ts';

/** Partial stages are posted immediately so processing errors preserve earlier evidence. */
export class WorkerTrace {
  constructor(
    private send: (event: {
      type: string;
      data: Record<string, unknown>;
      artifacts?: DiagnosticArtifact[];
    }) => void,
  ) {}
  event(type: string, data: Record<string, unknown>, artifacts?: DiagnosticArtifact[]): void {
    try {
      this.send({ type, data, artifacts });
    } catch {
      /* Recording is optional. */
    }
  }
  async image(stage: string, source: OffscreenCanvas, coordinateSpace: string): Promise<void> {
    try {
      const size = limitedSize(source, Infinity, 1000);
      const canvas = new OffscreenCanvas(size.width, size.height);
      canvas.getContext('2d')!.drawImage(source, 0, 0, size.width, size.height);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      this.event('image-stage', { stage, sourceWidth: source.width, sourceHeight: source.height }, [
        { stage, blob, ...size, coordinateSpace },
      ]);
      canvas.width = canvas.height = 1;
    } catch {
      this.event('diagnostic-error', { stage });
    }
  }
  async buffers(debug: unknown, width: number, height: number): Promise<void> {
    const artifacts: DiagnosticArtifact[] = [];
    const seen = new WeakSet<object>();
    const previews: { path: string; values: Uint8Array | Uint8ClampedArray }[] = [];
    const visit = (value: unknown, path: string): unknown => {
      if (!value || typeof value !== 'object') return value;
      if (seen.has(value)) return '[shared reference]';
      seen.add(value);
      if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
        const bytes =
          value instanceof ArrayBuffer
            ? new Uint8Array(value)
            : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        const blob = new Blob([bytes.slice()], { type: 'application/octet-stream' });
        const encoding = value.constructor.name;
        const grayscale =
          (value instanceof Uint8Array || value instanceof Uint8ClampedArray) &&
          value.length === width * height;
        if (grayscale) previews.push({ path, values: value });
        artifacts.push({
          stage: path,
          blob,
          ...(grayscale ? { width, height } : {}),
          coordinateSpace: 'detector-working-image',
          encoding,
        });
        return { artifact: path, encoding, byteLength: bytes.byteLength };
      }
      if (Array.isArray(value)) return value.map((item, i) => visit(item, `${path}.${i}`));
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, visit(item, `${path}.${key}`)]),
      );
    };
    try {
      const metadata = visit(debug, 'scanic');
      this.event('engine-details', { inputSize: { width, height }, debug: metadata });
      for (const artifact of artifacts)
        this.event('engine-buffers', { inputSize: { width, height }, stage: artifact.stage }, [
          artifact,
        ]);
      for (const { path, values } of previews) {
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d')!;
        const pixels = context.createImageData(width, height);
        for (let i = 0; i < values.length; i++) {
          pixels.data[i * 4] = pixels.data[i * 4 + 1] = pixels.data[i * 4 + 2] = values[i];
          pixels.data[i * 4 + 3] = 255;
        }
        context.putImageData(pixels, 0, 0);
        await this.image(`${path}-view`, canvas, 'detector-working-image');
        canvas.width = canvas.height = 1;
      }
    } catch {
      this.event('diagnostic-error', { stage: 'engine-buffers' });
    }
  }
}
