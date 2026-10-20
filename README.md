# Gym Tracker

Release history: [CHANGELOG.md](CHANGELOG.md). The latest released version is v1.2.0. The v1.3.0 muscle-visualization work is merged on main, but v1.3.0 remains unreleased. Draft notes: [docs/releases/v1.3.0-draft.md](docs/releases/v1.3.0-draft.md).

A modern, mobile-friendly workout journal for GitHub Pages. PPL is the starter schedule; you can train with any split.

## v1.3.0 muscle visualizations

**Progress → Muscle-group volume** displays detailed interactive front/back anatomy, using credited primary hard sets or primary volume as a relative heatmap. Choose a muscle by pointer, touch or keyboard (Tab then Enter/Space) to inspect precise primary and separately credited secondary sets and volumes. The exact-values table is an accessible fallback; unknown exercises remain unclassified. In **Train**, expand **Muscles worked** for primary and secondary exercise targets. These diagrams illustrate training attribution, not actual measured muscle activation, growth or recovery. The SVG geometry is adapted from `vulovix/body-muscles`, Apache-2.0; see `assets/vendor/body-muscles/LICENSE` and `NOTICE`. All assets are bundled locally for offline use.

## Files and setup

Keep `index.html`, `ppl-default-workouts.json`, `css/` and `js/` together in your GitHub Pages source. No build step, server or database is required. Serve the app over HTTP(S) (for local testing: `python -m http.server 8000`); ES modules do not load reliably from `file://`.

- `ppl-default-workouts.json`: starter workout definitions, units, exercises, rep ranges, alternatives and notes.
- `ppl-tracker-data.json`: empty version 4 app-data template with the starter schedule.
- `ppl-tracker-data.schema.json`: JSON Schema for version 4 app-data backups.
- `tests/schedules.test.cjs`: dependency-free functional checks; run `node tests/schedules.test.cjs`.

## Code layout

- `index.html`: markup and entry-point references.
- `css/styles.css`: existing application styles.
- `js/app.js`: original application behavior, extracted without a functional rewrite.
- `js/config.js`: existing persistent storage key constants.
- `tests/schedules.test.cjs`: dependency-free regression tests, now loading the extracted module source.

The application is local-first. IndexedDB is authoritative after first-run migration; see the backup and recovery sections before downgrading, clearing site data or switching devices.

## Flexible workout schedules

In **Train → Manage schedules**, edit the PPL starter or create your own schedule:

- **Repeating sequence:** select any workouts, reorder them with the arrow buttons, repeat workouts and insert rest days. Choose the next step when saving. Saving the currently scheduled workout advances the sequence. Logging another workout leaves its progress unchanged. Use **Mark rest complete** or **Skip scheduled day** to advance without adding a session.
- **Weekly plan:** assign workouts or rest to Monday–Sunday. The highlighted day follows your device's local calendar; logging sessions does not move the plan forward.

Create workouts using **+ Custom** in Train, then select them in your schedule. Upper/lower, full-body and other splits can use the Other workout category. Switch schedules using the active-schedule dropdown; each repeating schedule keeps its own progress. The workout library remains available regardless of the active schedule.

A custom workout used by a schedule must be removed from that schedule before deletion. Deleting historical sessions does not rewind schedule progress. At least one schedule and one training day per schedule are required.

Existing users receive a PPL starter sequence positioned after their latest logged default workout. Their sessions, custom workouts, body measurements and drafts remain available.

## Starter workout file

The app loads `./ppl-default-workouts.json` on startup. Change that JSON to edit the starter workout library, then use **Data → Reload program**. Its rotation contains every default workout ID once and defines the initial starter order; user schedules can reorder, repeat or omit workouts.

The supplied starter order is Pull A → Push A → Legs A → Pull B → Push B → Legs B, with lb as the default unit. If the file cannot be fetched, the app uses its last successfully loaded program. With no cached program, it shows a file picker and retry button. Opening the HTML directly may require selecting the JSON manually. Changing workout IDs can invalidate saved schedules; the app then falls back to the starter schedule while retaining history.

## Saving and JSON backups

App data, including drafts, saves atomically in the browser's IndexedDB `gym-tracker` database (`snapshots/primary`). Existing legacy localStorage records are retained as historical recovery copies, not synchronized mirrors. Drafts save automatically. Existing `ppl-tracker-v1` and `ppl-tracker-drafts-v1` storage keys and the `ppl-tracker` backup identifier remain for compatibility on the same website origin.

**Data → Export app data (.json)** exports sessions, body entries, custom workouts, schedules, schedule progress, drafts and preferences. A copyable text area is also provided.

**Data → Import backup** validates the file before saving. Merge keeps unmatched entries and replaces matching IDs with incoming records. Replace restores only the incoming data. Version 1 and 2 backups are migrated automatically: merging keeps current schedules, while replacing creates a starter schedule based on the imported history. Version 3 backups restore their schedules and active-schedule preference. Workout-program JSON and app-data backups are separate formats.

Schedule `days` contain workout IDs or `null` for rest. Repeating plans use a zero-based `cursor`; weekly plans contain seven entries, starting Monday, and use cursor 0. The app additionally validates unique IDs, workout references and schedule rules described in the schema.

GitHub Pages never receives your personal workout log. Browser data cannot be accessed from another device, browser or website origin; export a backup to transfer it. Clearing site data removes the local log. Download backups regularly.

## Verification

Run `node tests/schedules.test.cjs`. Checks cover custom and default workouts, repeating and weekly schedules, reordering, rest days, independent schedule progress, legacy migration, version 4 backup round trips, malformed-import rejection, persistence, and storage-failure rollback, plus existing sessions, units, charts and missing-program recovery. Cross-browser Playwright tests run in Chromium, Firefox and WebKit through GitHub Actions.

## Modular architecture and browser tests

`js/app.js` composes independent modules: `state.js` (initial state), `storage.js` (legacy localStorage adapter), `workouts.js` (workout calculations and utilities), `schedules.js` (schedule index), and `render.js` (presentation primitives). Core controller/view routines remain in `app.js` and can be migrated in follow-up refactors without changing the persistence contract.

Run `node tests/schedules.test.cjs` for regression checks. Run `npm ci`, `npx playwright install chromium`, then `npm run test:browser` for browser smoke testing using the built-in `/gym-tracker/` fixture server. No production build is required. Playwright and its browser revisions are pinned in `package-lock.json`; use `npm ci` locally and in CI. Upgrade the dependency and lockfile together only after checking mobile WebKit: newer WebKit versions can change interaction and rendering behavior. Existing localStorage recovery keys and v1–v4 backup imports remain supported. Before rolling back to older code, export the latest v4 backup: older builds may not read the new backup version.

## IndexedDB persistence (GT-02)

On supported browsers, the app copies the existing `ppl-tracker-v1` snapshot (including drafts and schedule cursors) to the `gym-tracker` IndexedDB database in one atomic first-run transaction. Subsequent reads/writes use the IndexedDB `snapshots/primary` record; legacy localStorage is retained untouched for rollback and recovery. If IndexedDB is unavailable, the app falls back to legacy localStorage and displays a warning. If migration encounters malformed source JSON, it fails instead of replacing historical data. Existing v1–v4 import and migration support is retained.

**Caution:** After migration, localStorage is a *historical recovery copy*, not a live mirror; reverting to a pre-migration build can show older data. Export an up-to-date JSON backup before any rollback. Browser storage and private browsing remain device-local; clearing site data can remove IndexedDB too. The migration suite runs in Playwright against a genuine browser IndexedDB implementation.

## Version 4 backup compatibility (GT-03)

Backups now export as `version: 4` while retaining `app: "ppl-tracker"`. Imports accept v1–v4: v1/v2 retain their historical normalization and schedule-merge behavior; v3 data is upgraded into v4; v4 is validated directly. The v4 schema adds optional stable exercise IDs and set-level fields (`id`, `type`, `completed`, `completedAt`, `rir`, `restSeconds`) without inventing unknown historical data. IndexedDB storage records and localStorage recovery keys remain unchanged. Keep a current JSON export before reverting to an older app, which may not recognize v4 backups.

## Set completion (GT-05)

Each training set has a Done toggle. Toggling it saves its completion timestamp in the workout draft and survives reload. Editing a completed set clears its completion state. Saved sets contain v4 completion metadata; legacy draft entries without explicit status remain compatible. Saving is guarded against duplicate clicks. A follow-up can enforce explicit completion for all newly created sets, which requires corresponding changes to the historical regression assumptions.

## Timers (GT-06)

Mark a set Done to start a timestamp-based rest countdown. Select a rest duration, then pause, resume or skip. Reset clears the rest countdown and restarts workout elapsed time. Timer state is part of the existing IndexedDB-backed draft, so page reload preserves elapsed time and paused countdowns. Backgrounded tabs calculate elapsed time from wall-clock timestamps on return; no new backup version or IndexedDB schema is needed.

## RIR and exercise settings (GT-07)

Each set has a type (working, warmup or drop) and optional RIR (integer 0–10; blank means unknown). An exercise rest interval (15–600 seconds) overrides the workout rest preset when a set is completed. These settings autosave with the workout draft, and set type/RIR are included in version 4 session exports. Existing history without these optional fields remains valid. Warm-up sets should be excluded by future hard-set analytics; current general workout metrics are unchanged.

## Exercise defaults and hard sets (#36)

Choose exercise rest and optional load increment, then Save default to reuse settings on future drafts. Defaults are stored alongside preferences in IndexedDB and v4 backups. Historical untyped completed sets count as working hard sets; warm-up and drop sets are excluded. This metric is separate from all-set volume totals. Existing sessions and schedule progress are unchanged.

The default editor now supports built-in and extra exercises, explicitly shows increment units and converted increments, and offers Reset default to return to the global fallback. Drop sets are excluded from the initial hard-set metric (along with warm-up sets); legacy sets lacking a type count when reps are positive and completion is not false.

Rest timer precedence is: explicit per-set rest (from a compatible saved draft), current exercise/draft override, persisted exercise default, workout rest preset, then 90 seconds. Invalid rest values are ignored by the timer resolver. The current UI configures exercise and workout rest; v4's optional per-set `restSeconds` remains supported without changing the backup schema. New custom exercise rows receive stable IDs; existing ID-less custom exercises retain legacy name-keyed defaults so updates do not silently orphan preferences. Distinct legacy exercises with the same normalized name may still share defaults until explicitly redefined with IDs. Invalid load increments are rejected rather than silently stored.

## Recovery and multiple tabs (GT-08)

Draft edits remain debounced and committed with the entire IndexedDB snapshot. Every write now checks the snapshot revision in the same read/write transaction. If another tab has saved since the current tab loaded, the stale tab refuses to overwrite newer data and shows a warning to export a backup and reload. Previous sets are only copied to a draft when the user explicitly selects Copy last sets; copied weight values convert into the active unit. Program changes no longer silently discard an incompatible draft; the app flags it for recovery. Existing v4 backups remain unchanged.

## Progressive overload suggestions (GT-09)

When enabled, each exercise displays a non-editing suggestion based on the most recent completed **working** sets. If all consistent-load working sets meet the top of the repetition range, and known RIR is at least 1, it suggests the configured increment; otherwise it recommends holding load. Warm-up and drop sets are excluded. The optional exercise load increment and its kg/lb unit are respected. Unknown effort is not treated as zero RIR. Missing history produces no numeric suggestion. Uncheck **Show progression recommendations** to disable this feature; existing sets and drafts are never modified by recommendations.

## Personal records (GT-10)

The Progress tab computes personal records directly from saved sessions, including historical data: heaviest weight, most repetitions, estimated 1RM (Epley), rep-at-load records, and best session volume. Units are converted into the chosen display unit; warm-up and incomplete sets are excluded. Ties use the earliest saved record and record a tie count. PRs are derived rather than stored, so deletions and imports automatically recalculate them. No IndexedDB migration or v4 backup change is needed.

## Training analytics (GT-11)

The Progress tab includes a read-only dashboard with inclusive date, workout and exercise filters, weekly volume, weekly hard sets and exercise progress. Workouts are grouped into Monday-starting ISO-style weeks. Warm-up sets and incomplete entries do not contribute to volume; drop sets contribute to volume but not hard sets. Weight is converted to the chosen kg/lb display unit. Filtered PRs recalculate from matching sessions, and no IndexedDB or v4 backup migration is required. Empty views display explanatory messages. Undo a filter selection to restore results; nothing is written to stored workouts.

### Version 4 draft backup recovery (#42)

Backups now preserve paused/rest timer deadlines, workout start time, exercise-specific rest and increment settings, and set completion/type/RIR metadata. Older v4 backups remain valid because fields are optional. v1–v3 backups still use the existing migration normalization. If a backup fails validation, the import is rejected without replacing saved data. Export an additional copy before testing restore on another device.

### JSON import preferences (#43)

Replace imports use the backup's exercise defaults and progression toggle; optional fields absent in older backups reset to empty defaults and enabled progression. Merge imports combine exercise settings by stable exercise key, with incoming settings overriding matching keys and current-only keys retained. The progression toggle changes on merge only when explicitly included. Failed storage writes restore all in-memory imported collections and preferences. These changes do not alter IndexedDB structure or v4 backup format.

### Analytics filter scope (#44)

Date (inclusive), workout and exercise filters apply together to the same set of sessions. With an exercise selected, the volume and personal-record session-volume values count **only that exercise** within matching sessions, not unrelated lifts. PR strength trends use the same selected exercise and kg/lb display unit; warm-up sets and explicitly incomplete sets are excluded. Drop sets are included in volume but not hard-set totals. Without an exercise filter, weekly volume and hard-set summaries cover all exercises in matching sessions. No stored sessions, IndexedDB metadata, or backup format changes are required.

### Autosave recovery (#45)

Workout drafts show pending, confirmed saved, storage error, or concurrent-tab conflict status. A conflict does not overwrite the newer tab's IndexedDB snapshot. If saving fails, keep the tab open and use **Export unsaved backup** before reloading, then restore from JSON if needed. Draft changes are flushed on tab visibility changes and on in-app navigation. The browser cannot guarantee completion of asynchronous IndexedDB transactions after a page is terminated; for important changes, confirm the Saved status before closing the tab. No IndexedDB version or v4 backup format changes.

### Large history performance (#46)

The progress dashboard caches filtered analytics by session-array identity and filter values, computes record ties with linear passes, and draws no more than 240 SVG markers per chart using bucketed extrema sampling. All unmodified sessions remain included in precise totals and personal-record calculations; the chart is only a bounded visual overview. Filters and data changes invalidate the cached calculation. Chart SVGs remain keyboard focusable, and data tables retain exact weekly values. No IndexedDB or backup migration is necessary.

### Atomic session completion (#52)

Finishing a session now persists its record, deletion of the finished draft, selected next workout and schedule cursor in one IndexedDB snapshot transaction. The app reports success only after the transaction completes; a write rejection restores all affected in-memory state so the workout draft can be retried or exported. No schema or backup version change is required.

## Browser and mobile release testing (#53)

The browser workflow runs desktop Chromium, Firefox and WebKit, plus touch-enabled mobile Chromium (Pixel 7) and mobile WebKit (iPhone 13) projects. The desktop suite covers IndexedDB migration and conflicts, workout logging, timers and JSON backups in each browser engine. Mobile smoke tests cover viewport overflow, touch navigation, input/draft persistence, export and completed-session IndexedDB cleanup. Run `npm run test:browser` after `npx playwright install --with-deps chromium firefox webkit`. These are emulated mobile browser profiles; real-device validation is still recommended before promising full hardware compatibility.

## Production Pages release verification (#54)

The **GitHub Pages production smoke** workflow exercises the published URL `https://mshelio.github.io/gym-tracker/` from an isolated Playwright browser context, not the fixture server. It verifies HTTP 200, HTML/CSS/JavaScript/JSON content types, starter workout JSON, native module startup, and navigation. It retries transient deployment propagation for up to six attempts and runs after main pushes, successful `github-pages` deployment status events, on a daily schedule, or manually. Its job summary includes the checked source SHA, deployment SHA when supplied by GitHub, and GitHub Pages configuration if accessible. Source SHA is **not** evidence the same revision is published; compare with the deployment SHA and Settings → Pages for release certification. This script does not use or modify a user's existing browser profile. Manually inspect repository **Settings → Pages** to confirm deployment source and branch if the Pages API is unavailable.

Run locally after `npm install` and `npx playwright install chromium` using `node tests/pages-smoke.cjs`. A failure may indicate an inaccessible public Pages site, invalid asset delivery, or a startup error; a passing fixture-only test is not a replacement for this production check.

## Installable web app metadata (GT-12 / #13)

The manifest at `./manifest.webmanifest` uses relative `./` start URL, scope, and identity so a GitHub Pages project deployment under `/gym-tracker/` resolves correctly. It includes native PNG 192×192, 512×512, and 512×512 maskable icons, plus an Apple touch icon and theme color. Supported browsers may offer **Install app** or **Add to Home Screen** from their browser menu over HTTPS. A versioned service worker now supports offline startup after a successful online visit. See the offline PWA and release-update sections below. Existing sessions, drafts, schedules and JSON backups remain unchanged. To roll back the installation metadata, revert this change; uninstalling the shortcut does not intentionally modify browser storage, but clearing site data will.

## Offline support (GT-13 / #14)

After a successful first online visit, a service worker caches the GitHub Pages project-scoped app shell, native modules, icons, manifest and default program. Offline reloads can reopen and edit workout drafts using the existing IndexedDB storage. A small offline notice indicates connectivity. New service workers install atomically and wait for an explicit **Update now** action; saving/exporting pending edits is required before activating an update. The app never clears IndexedDB or drafts during a cache update. A failed precache does not activate an incomplete worker. The caching version in `sw.js` must be incremented whenever shell assets change. To recover from a broken cached deployment, reconnect, use the browser's site-data/service-worker controls or unregister the worker; avoid clearing storage if you need your workout data, and export JSON first. This does not sync data across devices.

## PWA lifecycle verification (GT-14 / #15)

The automated suite checks PWA manifest and icon metadata, scoped shell-cache contents, cold offline reload after online installation, offline workout logging and completed-session persistence, IndexedDB draft recovery, and behavior when workout program requests fail. Tests also verify that an existing worker and its shell cache survive reloads. Chromium exercises service-worker scenarios; separate mobile projects cover touch and mobile navigation. An actual deployment version bump and waiting-worker activation must be confirmed before claiming full update-cycle coverage. Run the browser suite with `npm run test:browser`. Offline behavior requires one successful online visit to populate the cache, and clearing site data also clears workout history unless exported.

### Release-safe PWA updates (#61)

Any change to an app-shell asset requires regenerating `sw.js` with `node tests/version-sw.cjs`; the release cache name is derived from the Git blob hashes of all precached files. CI runs `node tests/version-sw.cjs --check` to reject a stale worker revision. Commit the regenerated `sw.js` **with** app changes so browsers discover a new service worker and offer a controlled update. An update cannot silently replace a pending workout draft. Failed installation keeps the previous active worker and its cache. Export a JSON backup before clearing website data during recovery.

## Deployed PWA verification

`node tests/pages-smoke.cjs` now tests the live Pages origin in a disposable Chromium browser context **with service workers enabled**. It validates the published worker's `gt-shell-*` revision, the manifest's project start URL/scope, activated registration, cached app modules, offline reload and durable IndexedDB workout drafts, followed by a normal update check. It never uses a user's browser profile or alters their data. `REQUIRE_RELEASE_MATCH=true` also compares the served cache revision with the checked-out release revision; GitHub Actions enables this only after a successful Pages `deployment_status` event to avoid falsely failing a pull request or pre-deploy push. The deployment summary reports the event's SHA where available. Approval of a *new waiting worker* is tested using the local simulated release fixture in `tests/browser/pwa.spec.cjs`; no test worker is registered against production. This is not proof of a physical installed-device upgrade. Existing v4 backups remain unchanged.

## Editing saved sessions (#64)

History → expand a session → **Edit session** allows corrections to its date, notes, weights, reps, and sets. All changes remain in a temporary editor until **Save changes**; **Cancel** discards them. Saving replaces the same session ID atomically through existing IndexedDB snapshot persistence, preserves creation metadata and schedule cursor, and recalculates analytics from the corrected history. If a cross-tab revision conflict or storage failure occurs, the original saved session remains intact. Backup format v4 is unchanged.

## Exercise search (#65)

The Train screen and custom workout editor have a local **Search exercises** field. It filters visible exercise cards or rows without changing the underlying workout, saved draft, schedule or exercise identity. **Clear search** restores every item; an empty-results message and live result count support keyboard and mobile use. When entering a custom workout exercise or extra exercise, browser suggestions come from the existing starter and custom exercise library, with no network dependency. Free-text custom names remain supported. Backup v4 format and IndexedDB storage are unchanged.


### v1.1.0 final exercise-default compatibility

New exercise defaults for ID-less workout rows are scoped to their workout and row rather than shared solely by exercise name. Old name-based defaults remain readable as a fallback without rewriting or deleting older v4 backups. Saving a new row-specific default isolates that row, and resetting a row default prevents an inherited name-based value from reappearing. A persistent **Global rest default** can be saved from the workout timer's rest picker and is stored as optional `preferences.globalRestSeconds` in v4 JSON and IndexedDB. When absent, the preference defaults to 90 seconds. Existing in-progress drafts retain their chosen rest intervals. No schema version change or destructive migration is required.


### Calendar event data model (v1.2 groundwork)

The optional `calendarEvents` array is saved atomically alongside sessions in IndexedDB and exported in the existing **version 4** JSON backup format. Older v1–v4 backups without this array remain accepted and import as an empty collection. Event entries have a unique `id`, local `YYYY-MM-DD` `date`, `type` (`planned`, `rest`, `skipped`, or `completed`), and ISO-8601 `updatedAt`; `workoutId` and `sessionId` are optional. Completed events require a session reference. Invalid imports are rejected before mutating stored data, and failed writes roll back changes.

Calendar projections are **not** written as events: weekly schedules can project weekdays and rest days from the schedule's fixed seven-day plan. Repeating cycle schedules have no inherently meaningful calendar dates, so no dates are inferred from their cursor. A day without a log is never automatically marked skipped or missed. The **Calendar** tab now provides month/week navigation and shows projected weekly workouts, explicit skipped/rest events, saved completed sessions, and an adherence summary. Historical unlogged days are not automatically counted as missed. Preserve a JSON backup before changing devices or clearing browser storage.


### Exercise identity and muscle classification (v1.2)

Recognized exercise names (including selected alternatives and synonyms) resolve to stable `catalog:...` IDs with primary muscle, secondary muscles and equipment metadata. Custom exercises with their own IDs preserve those IDs; unknown exercise names remain valid and **uncategorized**. Existing session names are retained, and old backups are not rewritten retroactively. This identity catalog now powers the muscle-group analytics in the Progress tab. Existing JSON v4 backups and v3 imports continue to use the optional `exerciseId` fields. Create and retain a JSON backup before clearing browser storage; the classification catalog contains no private workout data.


### Muscle-group analytics (v1.2)

In **Progress → Muscle-group volume**, completed working sets contribute exactly one primary-muscle hard set. Warm-up sets and incomplete sets are excluded. Drop sets contribute load × repetitions to volume but not hard sets. Recognized secondary muscles are **reported separately as 0.5-credit estimates**; secondary credits are never added to overall primary hard-set counts. Unrecognized exercise names appear in **Unknown**, not automatically assigned to a muscle. Weekly dates use ISO Monday boundaries and local YYYY-MM-DD log dates without local-time arithmetic. Historic session edits and deletions automatically recompute metrics from current saved sessions. Switching display units converts volume without changing set counts. This is calculated data only; no changes to IndexedDB or the version 4 backup schema are required.

### Workout flow and floating timer

Train keeps exercise logging in focus. Use **Workout options** to choose a different workout or adjust preferences, and **Plan** to manage schedules and calendar days. Search is available above the exercise cards; notes/date and advanced exercise settings expand when needed. Progress keeps filters, detailed calculations, and body measurements behind disclosures.

The floating timer stays at the bottom right on every screen, above the mobile navigation. It overlays the page without reserving content width, and its controls open upward. Opening the app or editing a draft does not start it. **Start Workout** (or completing the first set) starts the clock. Open the timer control to **Pause**, **Resume**, **Stop timer**, or **Reset timer**, and to start, pause, or skip rest. Stop keeps the elapsed time and workout draft; Restart begins a fresh timer. Only one workout clock runs at a time. Paused and running clocks survive reloads, and saving a completed session clears its timer. Legacy automatically started clocks reopen paused when a draft contains data; empty drafts reopen idle.

Backups remain version 4 with optional workout-clock metadata. Existing v1–v4 backups import as before; older application builds may reject newly exported timer fields. See [the screen and flow audit](docs/ux-audit.md) for the findings and changes.
