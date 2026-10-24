/** One gesture-unlocked context; the local sample is decoded before capture. */
export class ShutterSound {
  private context: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private loading: Promise<void> | null = null;
  private readonly abort = new AbortController();
  private disposed = false;
  constructor(private readonly url: string) {}
  preload(): void {
    if (this.disposed) return;
    try {
      this.context ??= new AudioContext();
      const context = this.context;
      this.loading ??= fetch(this.url, { signal: this.abort.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error('Shutter asset unavailable');
          const buffer = await context.decodeAudioData(await response.arrayBuffer());
          if (!this.disposed) this.buffer = buffer;
        })
        .catch(() => {});
    } catch {
      /* Audio is optional. */
    }
  }
  prepare(): void {
    if (this.disposed) return;
    try {
      this.preload();
      if (!this.context) return;
      void this.context.resume().catch(() => {});
      const silence = this.context.createBufferSource();
      silence.buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
      silence.connect(this.context.destination);
      silence.start();
      silence.onended = () => silence.disconnect();
    } catch {
      /* The visual shutter remains available if audio is blocked. */
    }
  }
  play(): boolean {
    const ctx = this.context;
    if (this.disposed || !ctx || !this.buffer || ctx.state !== 'running') return false;
    try {
      const sound = ctx.createBufferSource();
      sound.buffer = this.buffer;
      sound.connect(ctx.destination);
      sound.onended = () => sound.disconnect();
      sound.start();
      return true;
    } catch {
      return false;
    }
  }
  destroy(): void {
    this.disposed = true;
    this.abort.abort();
    this.buffer = null;
    const ctx = this.context;
    this.context = null;
    if (ctx) void ctx.close().catch(() => {});
  }
}
