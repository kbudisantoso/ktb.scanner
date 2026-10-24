# ADR 0008: Perspective ratio and regional paper preference

Date: 2026-10-18. Status: accepted; later decisions supersede historical defaults as noted below.

## Context

Projected edge ratios 0.809 and 0.823 on two A4 samples led to Letter/original-ratio suggestions. Paper axes under perspective do not directly reveal physical ratio. A weak regional prior should resolve close cases without overriding clear geometry.

## Decision

Map the unit square to original corners and estimate effective focal length/ratio under square pixels, zero skew and centered principal point. This is a limited single-view estimate, not full calibration. Require determinant >=1e-8, projective-term product >=1e-5, focal length 0.35..2.5 long image sides and all sixteen +/-0.002 normalized corner perturbations valid with <=0.04 logarithmic ratio drift. Compare A4/Letter within 0.09 log distance; use the prior only when both fit and advantage <=0.035. Host paperRegion overrides an explicit primary-locale region, otherwise A4; no language maximization, lower-priority locale, GPS or IP lookup. CLDR 48 uses Letter for BZ/CA/CL/CO/CR/GT/MX/NI/PA/PH/PR/SV/US/VE. Manual choice remains authoritative. The worker returns its actual selected format; metadata retains independent raw geometry.

## Consequences and verification

A rejected point solution with converging edges must not promote raw lengths to certain evidence. If a projective term reaches 0.04, test focal assumptions 0.35/0.5/0.75/1/1.5/2/2.5 across nominal/sixteen perturbed corners. Require >=3 near-orthogonal hypotheses per contour (normalized dot <=0.04), log envelope width <=0.5 and standard plausibility within 0.025 margin. Use the prior if both standards remain plausible, one if unique, otherwise original ratio; receipts keep their default. Diagnostics expose fallbackReason, uncertainPerspective and ratioRange; ratio remains raw in this fallback. Unsupported original edges in the shared 0.64..0.85 paper range also favor the regional suggestion. No crop means no result/format under ADR 0009. Unknown principal point, lens distortion, folds and bad corners remain limitations; perturbation stability is not calibration proof.

See [decisions](../DECISIONS.md), [implementation contract](../SPECIFICATION.md) and [test status](../testing/STATUS.md).

## References

- [Projective ratio orthogonality derivation (Kim et al.)](https://icat.vrsj.org/papers/2004/Workshop_1/W1-5.pdf)
- [Unicode CLDR 48 paper-size data](https://raw.githubusercontent.com/unicode-org/cldr/release-48/common/supplemental/supplementalData.xml)
- [Intl.Locale region](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/region)
