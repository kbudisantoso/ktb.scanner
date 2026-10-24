import type { PaperPreference } from './types.ts';

// Unicode CLDR 48 supplementalData.xml, measurementData/paperSize.
const LETTER_REGIONS = new Set('BZ CA CL CO CR GT MX NI PA PH PR SV US VE'.split(' '));

export function resolvePaperPreference(
  region?: string,
  locales: readonly string[] = [],
): { preferredPaper: PaperPreference; source: 'host-region' | 'browser-region' | 'default' } {
  if (region && /^[a-z]{2}$/i.test(region))
    return {
      preferredPaper: LETTER_REGIONS.has(region.toUpperCase()) ? 'letter' : 'A4',
      source: 'host-region',
    };
  // A language without an explicit region is not evidence of a country. In
  // particular, do not maximize "en" to US or use a lower-priority fallback locale.
  try {
    const primaryRegion = locales[0] && new Intl.Locale(locales[0]).region;
    if (primaryRegion)
      return {
        preferredPaper: LETTER_REGIONS.has(primaryRegion) ? 'letter' : 'A4',
        source: 'browser-region',
      };
  } catch {
    // Invalid or unavailable locale information leaves the global default intact.
  }
  return { preferredPaper: 'A4', source: 'default' };
}
