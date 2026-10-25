import type { ReactNode } from 'react';
import './globals.css';
import '@ktb/scanner/styles.css';
import { DemoLocaleProvider } from './i18n';
export const metadata = {
  title: 'Scanner Werkstatt',
  description: 'Dokumente lokal aufnehmen, prüfen und exportieren.',
  manifest: '/manifest.webmanifest',
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body>
        <DemoLocaleProvider>{children}</DemoLocaleProvider>
      </body>
    </html>
  );
}
