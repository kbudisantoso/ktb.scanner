import type { DiagnosticEvent, DiagnosticOptions } from '@ktb-tools/scanner';

export class DiagnosticRecording {
  readonly startedAt = new Date().toISOString();
  readonly startedAtMs = performance.now();
  private events: Record<string, unknown>[] = [];
  private files: { path: string; blob: Blob }[] = [];
  private blobs = new WeakMap<Blob, string>();
  private bytes = 0;
  private detailBytes = 0;
  private detailEvents = 0;
  private detailOmitted = 0;
  private detailStopped = '';
  private liveFrames = 0;
  private liveOmitted = 0;
  private stopped = '';
  private closed = false;
  private disposed = false;
  private sessionStartedAtMs = this.startedAtMs;
  private sessionLiveFrames = 0;
  private sessions: {
    id: number;
    startedAt: string;
    endedAt?: string;
    mode: string;
    environment: Record<string, unknown>;
  }[] = [];
  private downloaded = false;
  expiresAt = Date.now() + 60 * 60_000;
  readonly options: DiagnosticOptions;
  readonly engineBuffers: boolean;
  readonly environment: Record<string, unknown>;
  readonly maxBytes: number;
  readonly maxEvents: number;
  readonly maxLiveFrames: number;
  constructor(
    engineBuffers: boolean,
    environment: Record<string, unknown> = {},
    maxBytes = 512 * 1024 ** 2,
    maxEvents = 10_000,
    maxLiveFrames = 240,
  ) {
    this.engineBuffers = engineBuffers;
    this.environment = structuredClone(environment);
    this.maxBytes = maxBytes;
    this.maxEvents = maxEvents;
    this.maxLiveFrames = maxLiveFrames;
    this.options = this.sessionOptions(engineBuffers, environment);
  }
  private sessionOptions(
    engineBuffers: boolean,
    environment: Record<string, unknown>,
  ): DiagnosticOptions {
    const id = this.sessions.length + 1;
    this.sessions.push({
      id,
      startedAt: new Date().toISOString(),
      mode: engineBuffers ? 'engine-buffers' : 'pipeline',
      environment: structuredClone(environment),
    });
    return {
      engineBuffers,
      isActive: (kind?: string) =>
        !this.disposed &&
        id === this.sessions.length &&
        !this.closed &&
        !this.stopped &&
        (kind !== 'detect' || this.liveAvailable()) &&
        (kind !== 'buffers' || !this.detailStopped),
      onEvent: (event) => {
        if (id === this.sessions.length) this.record(event);
      },
    };
  }
  beginSession(
    engineBuffers: boolean,
    environment: Record<string, unknown> = {},
  ): DiagnosticOptions {
    if (!this.closed) throw new Error('Diagnosesitzung ist noch aktiv.');
    if (this.disposed || this.sessions.length >= 100) {
      if (!this.disposed) this.stopped ||= 'session-limit';
      return { engineBuffers, isActive: () => false, onEvent: () => {} };
    }
    this.closed = false;
    this.sessionStartedAtMs = performance.now();
    this.sessionLiveFrames = 0;
    this.downloaded = false;
    this.expiresAt = Date.now() + 60 * 60_000;
    return this.sessionOptions(engineBuffers, environment);
  }
  private liveAvailable(): boolean {
    return (
      !this.detailStopped &&
      this.sessionLiveFrames < this.maxLiveFrames &&
      performance.now() - this.sessionStartedAtMs < 60_000
    );
  }
  record(event: DiagnosticEvent): void {
    if (this.disposed || this.closed || this.stopped) return;
    if (event.data.kind === 'detect' && !this.liveAvailable()) {
      this.liveOmitted++;
      return;
    }
    const detail =
      event.data.kind === 'detect' ||
      event.type === 'engine-buffers' ||
      event.type === 'engine-details' ||
      String(event.data.stage ?? '').startsWith('scanic.');
    if (detail && this.detailStopped) {
      this.detailOmitted++;
      return;
    }
    const sequence = this.events.length + 1;
    const pending: { path: string; blob: Blob }[] = [];
    const artifacts = event.artifacts?.map((artifact, index) => {
      const { blob, ...metadata } = artifact;
      const extension =
        (
          {
            'image/png': 'png',
            'image/jpeg': 'jpg',
            'image/webp': 'webp',
            'application/pdf': 'pdf',
          } as Record<string, string>
        )[blob.type] ?? 'bin';
      const path =
        this.blobs.get(blob) ??
        pending.find((file) => file.blob === blob)?.path ??
        `files/${String(sequence).padStart(5, '0')}-${index}-${artifact.stage.replace(/[^a-zA-Z0-9._-]/g, '_')}.${extension}`;
      if (!this.blobs.has(blob) && !pending.some((file) => file.blob === blob))
        pending.push({ path, blob });
      return { ...metadata, path, bytes: blob.size, mime: blob.type };
    });
    // Snapshot metadata now; later mutations cannot rewrite recorded evidence.
    const entry = JSON.parse(
      JSON.stringify({
        sequence,
        sessionId: this.sessions.length,
        type: event.type,
        atMs: event.atMs,
        elapsedMs: event.atMs - this.startedAtMs,
        data: event.data,
        artifacts,
      }),
    );
    const metadataBytes = new TextEncoder().encode(JSON.stringify(entry)).byteLength;
    const nextBytes = metadataBytes + pending.reduce((sum, file) => sum + file.blob.size, 0);
    // Keep three quarters of the budget for actual photos, processing and final artifacts.
    if (
      detail &&
      (this.detailBytes + nextBytes > this.maxBytes / 4 ||
        this.detailEvents >= Math.max(1, Math.floor(this.maxEvents / 4)))
    ) {
      this.detailStopped = 'detail-limit';
      this.detailOmitted++;
      return;
    }
    if (this.events.length >= this.maxEvents || this.bytes + nextBytes > this.maxBytes) {
      this.stopped = this.events.length >= this.maxEvents ? 'event-limit' : 'byte-limit';
      return;
    }
    this.events.push(entry);
    for (const file of pending) {
      this.files.push(file);
      this.blobs.set(file.blob, file.path);
    }
    this.bytes += nextBytes;
    if (detail) {
      this.detailBytes += nextBytes;
      this.detailEvents++;
    }
    if (event.type === 'image-stage' && event.data.stage === 'live-input') {
      this.liveFrames++;
      this.sessionLiveFrames++;
    }
  }
  close(): void {
    if (this.closed || this.disposed) return;
    this.closed = true;
    this.sessions.at(-1)!.endedAt = new Date().toISOString();
    this.expiresAt = Date.now() + (this.downloaded ? 10 : 60) * 60_000;
  }
  markDownloaded(now = Date.now()): void {
    this.downloaded = true;
    this.expiresAt = now + 10 * 60_000;
  }
  expired(now = Date.now()): boolean {
    return this.closed && now >= this.expiresAt;
  }
  clear(): void {
    this.disposed = true;
    this.closed = true;
    this.events = [];
    this.files = [];
    this.blobs = new WeakMap();
    this.sessions = [];
    this.bytes = this.detailBytes = this.detailEvents = 0;
  }
  get summary() {
    return {
      events: this.events.length,
      sessions: this.sessions.length,
      files: this.files.length,
      bytes: this.bytes,
      stopped: this.stopped,
      liveFrames: this.liveFrames,
      liveOmitted: this.liveOmitted,
      detailBytes: this.detailBytes,
      detailOmitted: this.detailOmitted,
      detailStopped: this.detailStopped,
    };
  }
  snapshot() {
    return {
      manifest: {
        schemaVersion: 2,
        application: 'ktb.scanner/demo-next',
        versions: { scanner: '0.1.0', scanic: '1.7.1' },
        binaryByteOrder:
          new Uint8Array(new Uint16Array([0x1234]).buffer)[0] === 0x34
            ? 'little-endian'
            : 'big-endian',
        startedAt: this.startedAt,
        environment: { ...this.environment },
        mode: this.sessions.every((session) => session.mode === this.sessions[0]?.mode)
          ? this.sessions[0]?.mode
          : 'mixed',
        retention: { withoutDownloadMs: 60 * 60_000, afterDownloadMs: 10 * 60_000 },
        timingCaveat:
          'Recording and PNG encoding add overhead; engine-buffers also changes the Scanic Canny execution path.',
        limits: {
          bytes: this.maxBytes,
          detailBytes: this.maxBytes / 4,
          events: this.maxEvents,
          sessions: 100,
          liveFrames: this.maxLiveFrames,
          liveDurationMs: 60_000,
          intermediateMaxDimension: 1000,
        },
        ...this.summary,
        sessions: structuredClone(this.sessions),
        truncated: !!this.stopped || !!this.detailStopped,
        events: structuredClone(this.events),
      },
      files: this.files.slice(),
    };
  }
}
