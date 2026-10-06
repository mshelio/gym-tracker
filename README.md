# Gym Tracker

A modern, mobile-friendly workout journal for GitHub Pages. PPL is the starter schedule; you can train with any split.

## Files and setup

Keep `index.html` and `ppl-default-workouts.json` together in your GitHub Pages source. No build step, server or database is required.

- `ppl-default-workouts.json`: starter workout definitions, units, exercises, rep ranges, alternatives and notes.
- `ppl-tracker-data.json`: empty version 3 app-data template with the starter schedule.
- `ppl-tracker-data.schema.json`: JSON Schema for version 3 app-data backups.
- `tests/schedules.test.cjs`: dependency-free functional checks; run `node tests/schedules.test.cjs`.

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

App data saves in browser localStorage. Drafts save automatically. Existing `ppl-tracker-v1` and `ppl-tracker-drafts-v1` storage keys and the `ppl-tracker` backup identifier remain for compatibility on the same website origin.

**Data → Export app data (.json)** exports sessions, body entries, custom workouts, schedules, schedule progress, drafts and preferences. A copyable text area is also provided.

**Data → Import backup** validates the file before saving. Merge keeps unmatched entries and replaces matching IDs with incoming records. Replace restores only the incoming data. Version 1 and 2 backups are migrated automatically: merging keeps current schedules, while replacing creates a starter schedule based on the imported history. Version 3 backups restore their schedules and active-schedule preference. Workout-program JSON and app-data backups are separate formats.

Schedule `days` contain workout IDs or `null` for rest. Repeating plans use a zero-based `cursor`; weekly plans contain seven entries, starting Monday, and use cursor 0. The app additionally validates unique IDs, workout references and schedule rules described in the schema.

GitHub Pages never receives your personal workout log. Browser data cannot be accessed from another device, browser or website origin; export a backup to transfer it. Clearing site data removes the local log. Download backups regularly.

## Verification

Run `node tests/schedules.test.cjs`. Checks cover custom and default workouts, repeating and weekly schedules, reordering, rest days, independent schedule progress, legacy migration, version 3 backup round trips, malformed-import rejection, persistence, and storage-failure rollback, plus existing sessions, units, charts and missing-program recovery. Browser visual QA was unavailable in the execution environment.
