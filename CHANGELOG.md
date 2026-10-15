# Changelog

## [Unreleased] — v1.2.0 release candidate

This section documents merged changes; **v1.2.0 has not been tagged or published**.

### Added
- Month and week training calendar, schedule projections, completed/rest/skipped status and adherence that never invents missed historical days (#16, #17; PRs #76, #77).
- Stable semantic exercise IDs and a conservative muscle/equipment catalog. Unknown custom movements stay unclassified (#18; PR #78).
- Weekly muscle-group hard-set and volume analytics with exclusive primary attribution, separately labeled half-credit secondary muscles and an Unknown category (#19; PR #79).

### Improved
- Large-history analytics optimizations and test coverage for 1,000 and 10,000-session data sets; results stay exact even as chart points are bounded (#46; PRs #74, #75).
- Editing existing sessions recomputes trends; warm-ups are excluded, valid drop sets count toward volume but not hard sets.

### Compatibility
- Data remains local-first. IndexedDB snapshot transactions are atomic with revision-based conflict detection.
- Export format remains **JSON backup v4**, retaining imports from older backup versions. Calendar event data is optional; historical no-session dates are not backfilled.
- Service worker precaches all current application modules and is regenerated from the Git object hashes of its assets.

### Verification before publishing
- Confirm release-candidate regression, cross-browser Playwright, GitHub Pages deployment and production PWA smoke checks all pass at the intended release SHA.
- Export a recent v4 backup, test restore/merge and replace, verify offline update behavior and inspect Settings → Pages deployment SHA.
- Merge the release-readiness PR first; then publish v1.2.0 only through a separately authorized release action. Do not reuse the v1.1.0 tag.
