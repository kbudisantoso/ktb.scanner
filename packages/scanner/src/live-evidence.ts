// Result age and source continuity are distinct: sparse endpoints never prove intervening motion.
export const RESULT_FRESHNESS_MS = 400;
export const SOURCE_CONTINUITY_MS = RESULT_FRESHNESS_MS * 2;
export const INTERVAL_CREDIT_MS = RESULT_FRESHNESS_MS;
export const UNCERTAINTY_EXPIRY_MS = SOURCE_CONTINUITY_MS + RESULT_FRESHNESS_MS;
