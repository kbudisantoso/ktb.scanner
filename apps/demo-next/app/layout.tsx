import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import '@ktb-tools/scanner/styles.css';
import { DemoLocaleProvider } from './i18n';
import { DEMO_LOCALE_HEADER, demoTitle } from './locale';

async function initialLocale() {
  return (await headers()).get(DEMO_LOCALE_HEADER) === 'de' ? 'de' : 'en';
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await initialLocale();
  return {
    title: demoTitle(locale),
    description:
      locale === 'de'
        ? 'Dokumente lokal aufnehmen, prüfen und exportieren.'
        : 'Capture, review and export documents locally.',
    manifest: '/manifest.webmanifest',
  };
}

export default async function Layout({ children }: { children: ReactNode }) {
  const locale = await initialLocale();
  return (
    <html lang={locale}>
      <body>
        <DemoLocaleProvider initialLocale={locale}>{children}</DemoLocaleProvider>
      </body>
    </html>
  );
}
