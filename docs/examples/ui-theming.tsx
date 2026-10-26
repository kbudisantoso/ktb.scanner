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
  '--scanner-warning': '#fef3c7',
  '--scanner-border': '#64748b',
  '--scanner-focus': '#7c3aed',
  '--scanner-radius': '10px',
  '--scanner-font': 'system-ui, sans-serif',
} satisfies Theme;

export const darkTheme = {
  '--scanner-background': '#000000',
  '--scanner-surface': '#000000',
  '--scanner-text': '#f9fafb',
  '--scanner-muted': '#d1d5db',
  '--scanner-accent': '#3871df',
  '--scanner-warning': '#713f12',
  '--scanner-border': '#64748b',
  '--scanner-focus': '#facc15',
  '--scanner-radius': '10px',
  '--scanner-font': 'system-ui, sans-serif',
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
    <div
      className="host-result-viewer"
      style={{ ...theme, fontFamily: theme['--scanner-font'] } as CSSProperties}
    >
      <ImageViewer image={image} alt="Scanned document" resetKey={resetKey} locale="en" />
    </div>
  );
}
