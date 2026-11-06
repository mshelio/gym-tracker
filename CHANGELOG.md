# Changelog

## [Unreleased] — v1.3.0 release candidate

### Changed
- Consolidated Home and Train into Today with explicit Start/Resume and a dedicated workout session.
- Reduced primary navigation to Today, Plan and Progress; moved appearance, units, rest and backups into Settings.
- Added a workout review before saving and a completed-session summary. Template editing is separate from session logging.
- Made detailed analytics and the calendar optional disclosures; kept the floating timer contextual to active sessions and clear of offline notifications.
- Added optional v4 `preferences.defaultUnit` while preserving older backup imports.

### Fixed
- Only sets ticked ✓ are saved. Editing a ticked set's weight or reps keeps it ticked. If some sets have reps but no tick, the review before saving says how many and offers an **Include them** checkbox (off by default); if nothing is ticked, the review includes them so the workout can still be saved.
- **Copy last sets** no longer overwrites anything: it fills only empty, unticked sets, adds rows only when last time had more sets, and keeps warm-ups as warm-ups.
- Weights typed with a decimal comma, such as "72,5", are saved as 72.5. Weights that are not numbers, such as "7a", are rejected instead of being read as 7.
- Exporting a backup is never blocked by an in-progress workout. An invalid draft date, RIR or completion time is repaired or dropped in the export, and a draft that still can't be validated is left out with a note ("1 in-progress workout couldn't be included"). The recovery export benefits too.
- Separate lifts no longer share an exercise ID. Dumbbell bench, machine chest press, straight-arm and close-grip pulldowns, seated leg curl and the other variants that were catalog aliases now have their own IDs, so their history and load suggestions stay apart. Only true synonyms (such as "Bench press" or "Neutral-grip pulldown") remain aliases. Older sessions, drafts and custom workouts that stored a shared ID are re-read by name; no data is migrated.
- Saved exercise defaults are not migrated: a default saved under a shared ID stays with the main lift, and a newly separated lift falls back to its name-keyed default, then to the global default.
- Regression and browser CI now run what they claim: all six Node suites and a syntax check of every module, tag-based WebKit/Firefox subsets that cover the redesigned session, and a guard that fails when a tag selects too few tests. The Node harness also passes on Windows checkouts, and `node_modules/` is no longer tracked.

### Added
- The app asks the browser to keep its storage, at startup and after the first saved workout. Settings and Data & Backups show whether the log is protected from automatic clearing; when it isn't, the backup reminder appears after 14 days instead of 30. No new stored fields.
- Interactive detailed front/back anatomical SVG muscle maps and relative heatmaps, selectable with mouse, touch or keyboard (#81, PRs #83–#90).
- Exercise-specific primary/secondary anatomical previews, selected-muscle contributing-exercise drilldowns, and exact muscle-value table fallback; unknown exercises remain explicitly unclassified.
- Anatomical path geometry adapted from `vulovix/body-muscles` under Apache-2.0 with bundled license and attribution.

- Five-tab mobile-first navigation: Home, Train, Progress, Plan and More, with History under Progress and Data & Backups under More (PR #112).
- Focused training layout, redesigned Home/Progress summaries, and clearer schedule/data entry points (PRs #113, #117–#119).
- More robust mobile Chromium and WebKit CI, pinned Playwright dependencies, and Safari coverage for recent UX and accessibility flows (PRs #114, #116 and #125).

### Accessibility
- Improved keyboard focus retention, mobile touch/table selection, screen-reader instructions, and forced-colors styling (PRs #89–#90).
- Skip navigation, accessible mobile touch targets, rest-dialog focus and Escape behavior, accessible validation alerts, and contextual destructive-action confirmations (PRs #120–#124).

### Preserved
- Read-only visualizations continue using existing accurate muscle hard-set and volume aggregation, with warm-up exclusions, volume-only drop sets, and separate 0.5-credit secondary reporting.
- Local IndexedDB atomic saves, version 4 JSON backup import/export, and offline service-worker operation without account or cloud sync.

### Release gate
- v1.3.0 has not been tagged or published. Complete regression, cross-browser, keyboard/touch, responsive, Pages deployment, and installed/offline PWA verification at the final commit before authorization.

## [v1.2.0] — released

This section records the v1.2.0 release.

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

### Historical v1.2.0 release checklist
- Confirm release-candidate regression, cross-browser Playwright, GitHub Pages deployment and production PWA smoke checks all pass at the intended release SHA.
- Export a recent v4 backup, test restore/merge and replace, verify offline update behavior and inspect Settings → Pages deployment SHA.
- v1.2.0 release actions were completed separately; this historical checklist is retained for provenance.
