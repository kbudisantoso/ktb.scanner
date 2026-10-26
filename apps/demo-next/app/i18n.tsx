'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createTranslator, type ScanLocale } from '@ktb-tools/scanner';

const Context = createContext({ locale: 'en' as ScanLocale, setLocale: (_: ScanLocale) => {} });
export function DemoLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<ScanLocale>('en');
  useEffect(() => {
    const requested = new URL(location.href).searchParams.get('lang');
    const preferred = navigator.languages?.[0] || navigator.language;
    setLocale(
      requested === 'en' || requested === 'de'
        ? requested
        : /^de(?:-|$)/i.test(preferred)
          ? 'de'
          : 'en',
    );
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = locale === 'de' ? 'Scanner Werkstatt' : 'Scanner workshop';
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
  return { locale, setLocale, t: createTranslator(locale) };
}
