import type { ReactNode } from 'react';
import './globals.css';
import '@ktb/scanner/styles.css';
export const metadata = {
  title: 'Scanner Werkstatt',
  description: 'Dokumente lokal aufnehmen, prüfen und exportieren.',
  manifest: '/manifest.webmanifest',
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
