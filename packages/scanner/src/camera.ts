import { aborted, ScannerError } from './errors.ts';
import { imageHeader, type ImageHeader } from './image-header.ts';
import type { Limits } from './types.ts';
export interface CaptureDetails {
  method: 'photo' | 'video-frame';
  size: { width: number; height: number };
  /** Photo dimensions come from its encoded header, before EXIF normalization in processing. */
  sizeCoordinateSpace: 'encoded-photo' | 'video-frame';
  /** The synchronous backup/claim time, not a native sensor exposure timestamp. */
  capturedAtMs: number;
  photoAttempted?: boolean;
  nativeRequestedAtMs?: number;
  nativeCompletedAtMs?: number;
}

type CaptureJob = {
  token: number;
  generation: number;
  track: MediaStreamTrack;
  abort: AbortController;
};
type NativePhoto = { takePhoto(): Promise<Blob> };
type NativePhotoConstructor = new (track: MediaStreamTrack) => NativePhoto;
type PhotoAttempt = Pick<
  CaptureDetails,
  'photoAttempted' | 'nativeRequestedAtMs' | 'nativeCompletedAtMs'
> & {
  source?: { blob: Blob; header: ImageHeader };
};
// A slow/unsupported still pipeline must not hold the already secured backup indefinitely.
const PHOTO_WAIT_MS = 2000;
const PHOTO_HEADER_BYTES = 1024 * 1024;

function waitFor<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener('abort', cancel);
    const cancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    pending.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      },
    );
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
  });
}

export class Camera {
  private stream: MediaStream | null = null;
  private generation = 0;
  private captureSequence = 0;
  private captureJob: CaptureJob | null = null;
  private readonly nativePhotos = new WeakSet<MediaStreamTrack>();
  get photoPending(): boolean {
    const track = this.stream?.getVideoTracks()[0];
    return !!track && this.nativePhotos.has(track);
  }
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
    this.captureJob?.abort.abort();
    this.captureJob = null;
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
  private activeCapture(job: CaptureJob): void {
    aborted(job.abort.signal);
    if (
      this.captureJob?.token !== job.token ||
      this.generation !== job.generation ||
      this.stream?.getVideoTracks()[0] !== job.track ||
      job.track.readyState !== 'live'
    )
      throw new DOMException('Aborted', 'AbortError');
  }

  private async photo(job: CaptureJob, limits: Limits, framePixels: number): Promise<PhotoAttempt> {
    const outcome: PhotoAttempt = { photoAttempted: false };
    const Factory = (globalThis as typeof globalThis & { ImageCapture?: NativePhotoConstructor })
      .ImageCapture;
    if (typeof Factory !== 'function' || this.nativePhotos.has(job.track)) return outcome;
    let native: NativePhoto;
    try {
      native = new Factory(job.track);
    } catch {
      this.activeCapture(job);
      return outcome;
    }
    this.activeCapture(job);
    if (typeof native.takePhoto !== 'function') return outcome;
    outcome.photoAttempted = true;
    outcome.nativeRequestedAtMs = performance.now();
    this.nativePhotos.add(job.track);
    let hardware: Promise<{ blob: Blob; completedAtMs: number }>;
    try {
      hardware = Promise.resolve(native.takePhoto()).then(
        (blob) => {
          this.nativePhotos.delete(job.track);
          return { blob, completedAtMs: performance.now() };
        },
        (error: unknown) => {
          this.nativePhotos.delete(job.track);
          throw error;
        },
      );
    } catch {
      this.nativePhotos.delete(job.track);
      this.activeCapture(job);
      return outcome;
    }
    const attempt = new AbortController();
    const cancel = () => attempt.abort();
    const timer = setTimeout(cancel, PHOTO_WAIT_MS);
    job.abort.signal.addEventListener('abort', cancel, { once: true });
    if (job.abort.signal.aborted) cancel();
    try {
      const { blob, completedAtMs } = await waitFor(hardware, attempt.signal);
      this.activeCapture(job);
      aborted(attempt.signal);
      outcome.nativeCompletedAtMs = completedAtMs;
      if (
        !(blob instanceof Blob) ||
        !blob.size ||
        blob.size > limits.fileBytes ||
        blob.size > limits.originalBytes ||
        Math.max(8 * framePixels, 4 * framePixels + 2 * blob.size) > limits.workingBytes
      )
        return outcome;
      const bytes = await waitFor(
        blob.slice(0, Math.min(blob.size, PHOTO_HEADER_BYTES)).arrayBuffer(),
        attempt.signal,
      );
      this.activeCapture(job);
      aborted(attempt.signal);
      const header = imageHeader(new Uint8Array(bytes));
      const pixels = header.width * header.height;
      if (
        !Number.isSafeInteger(pixels) ||
        header.width < 2 ||
        header.height < 2 ||
        pixels > limits.inputPixels
      )
        return outcome;
      outcome.source = { blob: new Blob([blob], { type: header.mime }), header };
      return outcome;
    } catch {
      this.activeCapture(job);
      return outcome;
    } finally {
      clearTimeout(timer);
      job.abort.signal.removeEventListener('abort', cancel);
    }
  }
  async capture(
    video: HTMLVideoElement,
    limits: Limits,
    signal: AbortSignal,
    onDetails?: (details: CaptureDetails) => void,
    onFrameSecured?: (details: CaptureDetails, image: HTMLCanvasElement) => void,
  ): Promise<Blob> {
    aborted(signal);
    if (this.captureJob) throw new ScannerError('SCANNER_BUSY', 'Verarbeitung läuft bereits.');
    const track = this.stream?.getVideoTracks()[0];
    if (!track || track.readyState !== 'live')
      throw new ScannerError('CAMERA_UNAVAILABLE', 'Bitte Kamera erneut starten.');
    // Keep the claimed frame even when the optional native photo exposes later.
    aborted(signal);
    const width = video.videoWidth,
      height = video.videoHeight;
    const pixels = width * height;
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < 2 ||
      height < 2 ||
      !Number.isSafeInteger(pixels) ||
      pixels > limits.inputPixels ||
      8 * pixels > limits.workingBytes
    )
      throw new ScannerError(
        'LIMIT_EXCEEDED',
        'Die Kameraauflösung liegt außerhalb der erlaubten Grenzen.',
      );
    const canvas = document.createElement('canvas');
    const job: CaptureJob = {
      token: ++this.captureSequence,
      generation: this.generation,
      track,
      abort: new AbortController(),
    };
    this.captureJob = job;
    const cancel = () => job.abort.abort();
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    try {
      this.activeCapture(job);
      canvas.width = width;
      canvas.height = height;
      const capturedAtMs = performance.now();
      canvas.getContext('2d')!.drawImage(video, 0, 0);
      const details: CaptureDetails = {
        method: 'video-frame',
        size: { width, height },
        sizeCoordinateSpace: 'video-frame',
        capturedAtMs,
      };
      this.activeCapture(job);
      // Start the hardware request before preview work can delay it. The source is
      // still undecided here, so this callback must not signal capture completion.
      const photo = this.photo(job, limits, pixels);
      // A reentrant stop in the frame observer can exit before the await below.
      void photo.catch(() => {});
      this.activeCapture(job);
      try {
        onFrameSecured?.({ ...details, size: { ...details.size } }, canvas);
      } catch {
        /* Feedback cannot invalidate the secured pixels. */
      }
      this.activeCapture(job);
      const { source, ...attempt } = await photo;
      this.activeCapture(job);
      Object.assign(details, attempt);
      if (source) {
        details.method = 'photo';
        details.size = { width: source.header.width, height: source.header.height };
        details.sizeCoordinateSpace = 'encoded-photo';
      }
      const blob =
        source?.blob ??
        (await waitFor(
          new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (result) =>
                result
                  ? resolve(result)
                  : reject(new ScannerError('PROCESSING_FAILED', 'Aufnahme fehlgeschlagen.')),
              'image/jpeg',
              0.98,
            ),
          ),
          job.abort.signal,
        ));
      this.activeCapture(job);
      if (blob.size > limits.fileBytes || blob.size > limits.originalBytes)
        throw new ScannerError('LIMIT_EXCEEDED', 'Die Bilddatei ist zu groß.');
      try {
        onDetails?.({ ...details, size: { ...details.size } });
      } catch {
        /* Source observers cannot invalidate secured pixels. */
      }
      this.activeCapture(job);
      return blob;
    } finally {
      signal.removeEventListener('abort', cancel);
      if (this.captureJob === job) this.captureJob = null;
      canvas.width = canvas.height = 1;
    }
  }
}
