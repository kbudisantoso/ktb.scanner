import { initialProfile } from '../profiles.ts';
import { resolveAutoCaptureStabilityMs } from '../capture.ts';
import { resolveLocale } from '../i18n.ts';
import { diagnose } from '../diagnostics.ts';
import { createRoot } from 'react-dom/client';
import type { ScannerController, ScannerOptions, ScanResult } from '../types.ts';
import { ScannerError } from '../errors.ts';
import { resolveLimits } from '../session.ts';
import { assetUrl } from '../worker-client.ts';
import { ScannerView } from './ScannerView.tsx';
import { resolveShutterSoundUrl } from '../sounds.ts';
import { resolvePaperPreference } from '../paper-region.ts';
export type { ScannerOptions, ScannerController } from '../types.ts';
export function createScanner(options: ScannerOptions): ScannerController {
  resolveLimits(options.limits);
  initialProfile(options.defaultProfile);
  resolveLocale(options.locale);
  resolveAutoCaptureStabilityMs(options.autoCaptureStabilityMs);
  if (
    !options.mount ||
    !options.assetBaseUrl ||
    (options.imageType && !['image/jpeg', 'image/png'].includes(options.imageType)) ||
    (options.initialMode && !['auto', 'manual'].includes(options.initialMode)) ||
    (options.paperRegion !== undefined && !/^[a-z]{2}$/i.test(options.paperRegion))
  )
    throw new ScannerError(
      'CONFIG_INVALID',
      'Bitte Mount, Assetpfad, Bildformat, Aufnahmemodus und Papierregion prüfen.',
    );
  resolveShutterSoundUrl(options);
  assetUrl(options.assetBaseUrl, 'processing.worker.js');
  let disposed = false,
    opening = false;
  let active: { finish: (result: ScanResult) => void } | undefined;
  return {
    open(initial = {}) {
      if (disposed)
        return Promise.reject(new ScannerError('SCANNER_DISPOSED', 'Scanner wurde geschlossen.'));
      if (active || opening)
        return Promise.reject(
          new ScannerError('SCANNER_BUSY', 'Eine Sitzung ist bereits geöffnet.'),
        );
      try {
        if (initial.entry !== undefined && !['workspace', 'camera'].includes(initial.entry))
          throw new ScannerError('CONFIG_INVALID', 'Ungültiger Scanner-Einstieg.');
        initialProfile(options.defaultProfile, initial.defaultProfile);
        resolveAutoCaptureStabilityMs(
          options.autoCaptureStabilityMs,
          initial.autoCaptureStabilityMs,
        );
      } catch (error) {
        return Promise.reject(error);
      }
      if (initial.signal?.aborted) return Promise.resolve({ status: 'cancelled' });
      const paperPreference = resolvePaperPreference(
        options.paperRegion,
        navigator.languages?.length ? navigator.languages : [navigator.language],
      );
      opening = true;
      diagnose(options.diagnostics, 'session-open', {
        paperPreference,
        context: options.context,
        defaultProfile: initialProfile(options.defaultProfile, initial.defaultProfile),
        mode: options.initialMode ?? 'auto',
        locale: resolveLocale(options.locale),
        autoCaptureStabilityMs: resolveAutoCaptureStabilityMs(
          options.autoCaptureStabilityMs,
          initial.autoCaptureStabilityMs,
        ),
        imageType: options.imageType ?? 'image/jpeg',
        engineBuffers: options.diagnostics?.engineBuffers === true,
        shutterSound: options.shutterSound ?? 'camera',
      });
      opening = false;
      // Diagnostic receivers can synchronously abort, destroy or try to open again.
      if (disposed || initial.signal?.aborted) {
        diagnose(options.diagnostics, 'session-close', { status: 'cancelled' });
        return Promise.resolve({ status: 'cancelled' });
      }
      const restoreFocus = document.activeElement as HTMLElement | null;
      const host = document.createElement('div');
      host.className = 'scanner-backdrop';
      options.mount.append(host);
      const root = createRoot(host),
        abort = new AbortController();
      return new Promise<ScanResult>((resolve) => {
        let done = false;
        const cancel = () => finish({ status: 'cancelled' });
        const finish = (result: ScanResult) => {
          if (done) return;
          done = true;
          abort.abort();
          diagnose(options.diagnostics, 'session-close', { status: result.status });
          initial.signal?.removeEventListener('abort', cancel);
          // Unmount after React's current event/effect finishes, then release all owned resources.
          queueMicrotask(() => {
            root.unmount();
            host.remove();
            active = undefined;
            if (restoreFocus?.isConnected) restoreFocus.focus();
            resolve(result);
          });
        };
        active = { finish };
        initial.signal?.addEventListener('abort', cancel, { once: true });
        root.render(
          <ScannerView
            options={options}
            paperPreference={paperPreference.preferredPaper}
            initial={initial}
            signal={abort.signal}
            finish={finish}
          />,
        );
      });
    },
    async destroy() {
      disposed = true;
      active?.finish({ status: 'cancelled' });
      await Promise.resolve();
    },
  };
}
