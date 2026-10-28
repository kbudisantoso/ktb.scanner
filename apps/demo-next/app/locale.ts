import type { ScanLocale } from '@ktb-tools/scanner';

export const DEMO_LOCALE_HEADER = 'x-ktb-demo-locale';

export function resolveDemoLocale(
  requested: string | null,
  acceptLanguage: string | null,
): ScanLocale {
  if (requested === 'en' || requested === 'de') return requested;
  const primary = acceptLanguage?.split(',')[0]?.split(';')[0]?.trim() ?? '';
  return /^de(?:-|$)/i.test(primary) ? 'de' : 'en';
}

export function demoTitle(locale: ScanLocale) {
  return locale === 'de' ? 'Scanner Werkstatt' : 'Scanner workshop';
}
