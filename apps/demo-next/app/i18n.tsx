'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createTranslator, type ScanLocale } from '@ktb-tools/scanner';
import { demoTitle } from './locale';

const HOST_ENGLISH_TEXTS: Record<string, string> = {
  Texterkennung: 'Text recognition',
  Texterkennungssprachen: 'Text languages',
  'Deutsch und Englisch': 'German and English',
  Deutsch: 'German',
  Englisch: 'English',
  'Text erkennen': 'Recognize text',
  'Text erneut erkennen': 'Recognize text again',
  'Texterkennung abbrechen': 'Cancel text recognition',
  'Texterkennung erneut versuchen': 'Retry text recognition',
  'Text erkannt. Bitte vor der Verwendung prüfen.': 'Text recognized. Check it before use.',
  'Texterkennung fehlgeschlagen. Vorhandene Ergebnisse bleiben erhalten.':
    'Text recognition failed. Existing results are preserved.',
  'Texterkennung abgebrochen. Vorhandene Ergebnisse bleiben erhalten.':
    'Text recognition cancelled. Existing results are preserved.',
  'Seite {number} von {count} erkennen: {percent} %':
    'Recognizing page {number} of {count}: {percent}%',
  'Durchsuchbares PDF erstellen: {percent} %': 'Creating searchable PDF: {percent}%',
  'Texterkennung laden: {percent} %': 'Loading text recognition: {percent}%',
  'Erkannter Text: Seite {number}': 'Recognized text: page {number}',
  'Kein Text auf dieser Seite erkannt.': 'No text recognized on this page.',
};

const Context = createContext({ locale: 'en' as ScanLocale, setLocale: (_: ScanLocale) => {} });
export function DemoLocaleProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale: ScanLocale;
}) {
  const [locale, setLocale] = useState(initialLocale);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = demoTitle(locale);
  }, [locale]);
  const changeLocale = (next: ScanLocale) => {
    setLocale(next);
    const url = new URL(location.href);
    url.searchParams.set('lang', next);
    history.replaceState(null, '', url);
  };
  return (
    <Context.Provider value={{ locale, setLocale: changeLocale }}>{children}</Context.Provider>
  );
}
export function useDemoLocale() {
  const { locale, setLocale } = useContext(Context);
  return {
    locale,
    setLocale,
    t: createTranslator(locale, locale === 'en' ? HOST_ENGLISH_TEXTS : {}),
  };
}
