'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createTranslator, type ScanLocale } from '@ktb/scanner';

const Context = createContext({ locale: 'de' as ScanLocale, setLocale: (_: ScanLocale) => {} });
export function DemoLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<ScanLocale>('de');
  useEffect(() => {
    const requested = new URL(location.href).searchParams.get('lang');
    if (requested === 'en' || requested === 'de') setLocale(requested);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = locale === 'de' ? 'Scanner Werkstatt' : 'Scanner workshop';
  }, [locale]);
  const changeLocale = (next: ScanLocale) => {
    setLocale(next);
    const url = new URL(location.href);
    if (next === 'en') url.searchParams.set('lang', 'en');
    else url.searchParams.delete('lang');
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
