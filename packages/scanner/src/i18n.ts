import { ScannerError } from './errors.ts';
import { ENGLISH_TEXTS } from './locales/en.ts';

export type ScanLocale = 'en' | 'de';
export type Translate = (key: string, values?: Record<string, string | number>) => string;
const germanKeys = new Map(Object.entries(ENGLISH_TEXTS).map(([key, value]) => [value, key]));

export function resolveLocale(value: ScanLocale = 'en'): ScanLocale {
  if (value !== 'en' && value !== 'de')
    throw new ScannerError('CONFIG_INVALID', 'Ungültige Sprache. Unterstützt werden en und de.');
  return value;
}

/** Legacy German message keys remain valid for existing host overrides. */
export function createTranslator(
  locale: ScanLocale = 'en',
  overrides: Record<string, string> = {},
): Translate {
  resolveLocale(locale);
  return (key, values = {}) => {
    const source = germanKeys.get(key) ?? key;
    const localized = locale === 'en' ? (ENGLISH_TEXTS[source] ?? source) : source;
    const text = overrides[key] ?? overrides[source] ?? overrides[localized] ?? localized;
    return text.replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));
  };
}
