'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createTranslator, type ScanLocale } from '@ktb-tools/scanner';
import { demoTitle } from './locale';

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
  return { locale, setLocale, t: createTranslator(locale) };
}
