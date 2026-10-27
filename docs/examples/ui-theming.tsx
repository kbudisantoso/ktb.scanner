'use client';
import { lazy, Suspense, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ScanLocale, ScanResult, ScannerOptions } from '@ktb-tools/scanner';
import { ImageViewer } from '@ktb-tools/scanner/react';
import '@ktb-tools/scanner/styles.css';
import './ui-theming.css';

type ConfirmedScan = Extract<ScanResult, { status: 'confirmed' }>;
type Theme = NonNullable<ScannerOptions['theme']>;

export const lightTheme = {
  '--scanner-background': '#f7f8fb',
  '--scanner-surface': '#ffffff',
  '--scanner-text': '#1f2937',
  '--scanner-muted': '#4b5563',
  '--scanner-accent': '#1d4ed8',
  '--scanner-primary-text': '#ffffff',
  '--scanner-warning': '#fef3c7',
  '--scanner-warning-text': '#422006',
  '--scanner-warning-border': '#a16207',
  '--scanner-border': '#64748b',
  '--scanner-focus': '#7c3aed',
  '--scanner-backdrop': '#11182799',
  '--scanner-panel-shadow': '0 8px 24px #11182724',
  '--scanner-control-shadow': 'none',
  '--scanner-camera-text-shadow': 'none',
  '--scanner-camera-flash': '#dbeafe',
  '--scanner-select-arrow': '#4b5563',
  '--scanner-viewer-background': '#e5e7eb',
  '--scanner-camera-background': '#f7f8fb',
  '--scanner-camera-preview': '#e5e7eb',
  '--scanner-camera-text': '#1f2937',
  '--scanner-camera-muted': '#374151',
  '--scanner-camera-focus': '#7c3aed',
  '--scanner-camera-control': '#ffffffed',
  '--scanner-camera-control-border': '#64748b',
  '--scanner-camera-hint': '#ffffffed',
  '--scanner-camera-hint-border': '#64748b',
  '--scanner-camera-mode-surface': '#ffffffed',
  '--scanner-camera-mode-border': '#64748b',
  '--scanner-camera-options': '#f7f8fbf5',
  '--scanner-camera-options-control': '#ffffff',
  '--scanner-camera-selected': '#dbeafe',
  '--scanner-camera-selected-text': '#1e40af',
  '--scanner-camera-shutter': '#1d4ed8',
  '--scanner-camera-top-overlay': 'linear-gradient(#f7f8fbee, #f7f8fb00)',
  '--scanner-camera-bottom-overlay': 'linear-gradient(#f7f8fb00, #f7f8fbee 45%, #f7f8fb)',
  '--scanner-camera-side-overlay': 'linear-gradient(90deg, #f7f8fb00, #f7f8fbee)',
  '--scanner-capture-outline': '#ffffff',
  '--scanner-capture-progress': '#1d4ed8',
  '--scanner-capture-fill': '#1d4ed814',
  '--scanner-loupe-background': '#f7f8fb',
  '--scanner-loupe-crosshair': '#1d4ed8',
  '--scanner-radius': '10px',
  '--scanner-control-radius': '8px',
  '--scanner-panel-radius': '12px',
  '--scanner-viewer-radius': '12px',
  '--scanner-mobile-radius': '0px',
  '--scanner-spacing': '1',
  '--scanner-font': 'system-ui, sans-serif',
  '--scanner-z-index': '10000',
} satisfies Theme;

export const darkTheme = {
  '--scanner-background': '#111827',
  '--scanner-surface': '#1f2937',
  '--scanner-text': '#f9fafb',
  '--scanner-muted': '#d1d5db',
  '--scanner-accent': '#93c5fd',
  '--scanner-primary-text': '#111827',
  '--scanner-warning': '#713f12',
  '--scanner-warning-text': '#fef3c7',
  '--scanner-warning-border': '#fbbf24',
  '--scanner-border': '#64748b',
  '--scanner-focus': '#facc15',
  '--scanner-backdrop': '#030712d9',
  '--scanner-panel-shadow': '0 8px 24px #0006',
  '--scanner-control-shadow': 'none',
  '--scanner-camera-text-shadow': 'none',
  '--scanner-camera-flash': '#f8fafc',
  '--scanner-select-arrow': '#d1d5db',
  '--scanner-viewer-background': '#0b1220',
  '--scanner-camera-background': '#111827',
  '--scanner-camera-preview': '#0b1220',
  '--scanner-camera-text': '#f9fafb',
  '--scanner-camera-muted': '#d1d5db',
  '--scanner-camera-focus': '#facc15',
  '--scanner-camera-control': '#111827ed',
  '--scanner-camera-control-border': '#94a3b8',
  '--scanner-camera-hint': '#111827ed',
  '--scanner-camera-hint-border': '#94a3b8',
  '--scanner-camera-mode-surface': '#1f2937ed',
  '--scanner-camera-mode-border': '#94a3b8',
  '--scanner-camera-options': '#111827f5',
  '--scanner-camera-options-control': '#1f2937',
  '--scanner-camera-selected': '#1e3a8a',
  '--scanner-camera-selected-text': '#dbeafe',
  '--scanner-camera-shutter': '#f9fafb',
  '--scanner-camera-top-overlay': 'linear-gradient(#111827ee, #11182700)',
  '--scanner-camera-bottom-overlay': 'linear-gradient(#11182700, #111827ee 45%, #111827)',
  '--scanner-camera-side-overlay': 'linear-gradient(90deg, #11182700, #111827ee)',
  '--scanner-capture-outline': '#ffffff',
  '--scanner-capture-progress': '#93c5fd',
  '--scanner-capture-fill': '#93c5fd14',
  '--scanner-loupe-background': '#111827',
  '--scanner-loupe-crosshair': '#93c5fd',
  '--scanner-radius': '10px',
  '--scanner-control-radius': '8px',
  '--scanner-panel-radius': '12px',
  '--scanner-viewer-radius': '12px',
  '--scanner-mobile-radius': '0px',
  '--scanner-spacing': '1',
  '--scanner-font': 'system-ui, sans-serif',
  '--scanner-z-index': '10000',
} satisfies Theme;

export async function scanForPreview(
  mount: HTMLElement,
  onConfirmed: (result: ConfirmedScan) => void,
  signal?: AbortSignal,
) {
  const { createScanner } = await import('@ktb-tools/scanner/react');
  const scanner = createScanner({
    mount,
    assetBaseUrl: '/scanner-assets/',
    theme: lightTheme,
    locale: 'en',
    texts: { Abschließen: 'Show results' },
    shutterSound: 'off',
  });
  try {
    const result = await scanner.open({ signal });
    if (result.status === 'confirmed') onConfirmed(result);
  } finally {
    await scanner.destroy();
  }
}

const Scanner = lazy(() =>
  import('@ktb-tools/scanner/react').then((module) => ({ default: module.Scanner })),
);

export function ThemedScanButton({
  onConfirmed,
  dark = false,
  locale = 'en',
}: {
  onConfirmed: (result: ConfirmedScan) => void;
  dark?: boolean;
  locale?: ScanLocale;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>
        {locale === 'de' ? 'Dokument scannen' : 'Scan document'}
      </button>
      {open && (
        <Suspense fallback={<p role="status">{locale === 'de' ? 'Öffnen...' : 'Opening...'}</p>}>
          <Scanner
            open
            options={{
              assetBaseUrl: '/scanner-assets/',
              theme: dark ? darkTheme : lightTheme,
              locale,
              texts: { Abschließen: locale === 'de' ? 'Ergebnisse anzeigen' : 'Show results' },
              shutterSound: 'off',
            }}
            onResult={(result) => {
              setOpen(false);
              if (result.status === 'confirmed') onConfirmed(result);
            }}
            onError={() => setOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}

export function ThemedResult({
  image,
  resetKey,
  dark = false,
}: {
  image: Blob;
  resetKey: string;
  dark?: boolean;
}) {
  const theme = dark ? darkTheme : lightTheme;
  return (
    <div className="host-result-viewer" style={theme as CSSProperties}>
      <ImageViewer image={image} alt="Scanned document" resetKey={resetKey} locale="en" />
    </div>
  );
}
