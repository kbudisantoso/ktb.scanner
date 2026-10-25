import { aborted, ScannerError } from './errors.ts';
import type { Limits } from './types.ts';
export interface CaptureDetails {
  method: 'photo' | 'video-frame';
  size: { width: number; height: number };
  capturedAtMs: number;
}
export class Camera {
  private stream: MediaStream | null = null;
  private generation = 0;
  get supportsTorch(): boolean {
    try {
      const track = this.stream?.getVideoTracks()[0];
      return (
        (track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean })?.torch === true
      );
    } catch {
      return false;
    }
  }
  async setTorch(enabled: boolean): Promise<boolean> {
    const track = this.stream?.getVideoTracks()[0],
      generation = this.generation;
    if (!track || !this.supportsTorch)
      throw new ScannerError('CAMERA_UNAVAILABLE', 'Kameralicht ist nicht verfügbar.');
    await track.applyConstraints({ advanced: [{ torch: enabled } as MediaTrackConstraintSet] });
    return generation === this.generation && this.stream?.getVideoTracks()[0] === track;
  }
  stop(): void {
    this.generation++;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
  async start(video: HTMLVideoElement, signal: AbortSignal, deviceId?: string): Promise<void> {
    this.stop();
    aborted(signal);
    if (!navigator.mediaDevices?.getUserMedia)
      throw new ScannerError(
        'CAMERA_UNSUPPORTED',
        'Kamera nicht verfügbar. Bitte HTTPS oder Bildimport verwenden.',
      );
    const generation = this.generation;
    const pending = navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        ...(deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: { ideal: 'environment' } }),
        width: { ideal: 4096 },
        height: { ideal: 3072 },
      },
    });
    const cancel = () => {
      if (generation === this.generation) this.stop();
    };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const stream = await pending;
      if (signal.aborted || generation !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        throw new DOMException('Abgebrochen', 'AbortError');
      }
      this.stream = stream;
      const track = stream.getVideoTracks?.()[0];
      try {
        const capabilities = track?.getCapabilities?.() as
          (MediaTrackCapabilities & { focusMode?: string[] }) | undefined;
        if (capabilities?.focusMode?.includes('continuous'))
          await track.applyConstraints({
            advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
          });
      } catch {
        // Optional focus controls must not prevent camera access.
      }
      aborted(signal);
      if (generation !== this.generation) throw new DOMException('Abgebrochen', 'AbortError');
      video.srcObject = stream;
      await video.play();
      aborted(signal);
      if (generation !== this.generation) throw new DOMException('Abgebrochen', 'AbortError');
    } catch (error) {
      if (generation === this.generation) this.stop();
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new ScannerError(
        'CAMERA_UNAVAILABLE',
        'Die Kamera konnte nicht gestartet werden. Bitte Berechtigung prüfen oder Bilder importieren.',
      );
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  }
  async capture(
    video: HTMLVideoElement,
    limits: Limits,
    signal: AbortSignal,
    onDetails?: (details: CaptureDetails) => void,
    onShutter?: (details: CaptureDetails, image: HTMLCanvasElement) => void,
  ): Promise<Blob> {
    aborted(signal);
    const track = this.stream?.getVideoTracks()[0];
    if (!track || track.readyState !== 'live')
      throw new ScannerError('CAMERA_UNAVAILABLE', 'Bitte Kamera erneut starten.');
    // Secure the full stream frame synchronously; native takePhoto may expose a later frame.
    aborted(signal);
    const width = video.videoWidth,
      height = video.videoHeight;
    if (!width || !height || width * height > limits.inputPixels)
      throw new ScannerError(
        'LIMIT_EXCEEDED',
        'Die Kameraauflösung liegt außerhalb der erlaubten Grenzen.',
      );
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const capturedAtMs = performance.now();
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    const details: CaptureDetails = {
      method: 'video-frame',
      size: { width, height },
      capturedAtMs,
    };
    try {
      onShutter?.(details, canvas);
    } catch {
      /* Feedback cannot invalidate the secured pixels. */
    }
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new ScannerError('PROCESSING_FAILED', 'Aufnahme fehlgeschlagen.')),
        'image/jpeg',
        0.98,
      ),
    );
    canvas.width = canvas.height = 1;
    aborted(signal);
    onDetails?.(details);
    return blob;
  }
}
