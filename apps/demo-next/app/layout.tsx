import type { ReactNode } from 'react';
import './globals.css';
import '@ktb/scanner/styles.css';
import { DemoLocaleProvider } from './i18n';
export const metadata = {
  title: 'Scanner workshop',
  description: 'Capture, review and export documents locally.',
  manifest: '/manifest.webmanifest',
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <DemoLocaleProvider>{children}</DemoLocaleProvider>
      </body>
    </html>
  );
}
