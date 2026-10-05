# PPL Tracker

A modern, mobile-friendly Push/Pull/Legs training journal for GitHub Pages.

## Files

- `index.html`: the complete app, including styles and JavaScript.
- `ppl-default-workouts.json`: the default program, including rotation, units, exercises, sets, rep ranges, alternatives and training notes.

Keep both files in the same folder in your GitHub Pages source. No build step, server or database is required. Extract this archive first; upload its contents rather than the ZIP file.

## Your workout program

The app loads `./ppl-default-workouts.json` on startup. Change that JSON to update the program. Each workout ID must be unique and the rotation must contain every workout ID exactly once. The Data tab has a Reload program button.

Your supplied rotation is Pull A → Push A → Legs A → Pull B → Push B → Legs B, with lb as the default unit. Every exercise, set count, rep range, alternative and note is preserved from the supplied JSON.

If the program file cannot be fetched, the app uses its last successfully loaded program and reports that in Data. With no cached program, it shows a file picker and retry button. Opening index.html directly may require selecting the JSON file manually.

## Saving and backups

Sessions, body entries and custom workouts save in browser localStorage. Session drafts also save automatically. The existing `ppl-tracker-v1` and `ppl-tracker-drafts-v1` keys are retained for compatibility on the same website origin. The app cannot access data from another browser, device or website origin.

Use Data → Download JSON backup to keep a copy or transfer your progress. Data → Import backup merges entries by ID. Default workout definitions and personal workout backups are separate files with different purposes. GitHub Pages never receives your personal workout log.

Clearing browser/site data removes the local log. Private browsing may remove saved data when the session ends. Download backups regularly.

## Design and checks

The redesigned app uses a light neutral canvas, teal and lime accents, desktop side navigation and mobile bottom navigation. Exercise cards show alternatives, previous performance, independent lb/kg controls and rep targets. Session overview updates the number of logged sets as you type.

Functional checks cover exact JSON defaults, repository-relative program loading, complete rotation, sessions and drafts, units, custom workouts, body measurements, strength charts, data persistence, backup download/import, deduplication, malformed backup rejection, missing-file recovery and save failure rollback. Browser visual QA was unavailable in the execution environment.
