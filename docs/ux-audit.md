# Screen and flow redesign

The app is organized around three questions, each owned by one tab. Anything that keeps you on the same screen opens as a bottom sheet rather than navigating to another tab, and each object lives in exactly one place.

| Destination | Answers | Sections | Sheets |
| --- | --- | --- | --- |
| Today | What do I do now? | This week (the only week view), next or in-progress workout, body weight and last session tiles, backup reminder; first-run starter choices when no plan is active | Swap workout, log body weight |
| Plan | How do I train? | Schedule (active plan, sequence, skip/edit, manage schedules), Workouts (templates and starters), Exercises (searchable library) | — |
| Progress | How am I doing? | Overview (totals, weekly volume, consistency, recent strength, muscle balance and body map), Lifts (trend and records), History (list or month/week calendar with day details), Body (measurements) | — |
| Settings button | — | Appearance, default unit, default rest, progression suggestions, Data & Backups | — |

Progress views share one filter bar: 4W, 12W, 1Y and All presets plus exact date, workout and exercise filters.

## Active workout

Start opens a full-screen session; the tab bar and Settings are hidden. The top bar holds Minimize, the workout name and clock (tap to pause or resume), Session options and one Finish button, above a single progress bar that counts sets marked done. The first unfinished exercise is open; others are compact rows with their done count. Each open card shows the photo, target, last performance and one weight suggestion (with Fill for empty sets). Set rows contain only weight, reps, Done and a ⋯ button.

- Set sheet: set type, reps in reserve, rest after the set, weight steps and Use last, to failure, drop and reverse-drop sets, remove set.
- Exercise sheet: substitution, weight unit, superset with the next exercise, rest and load-increment defaults, muscles worked.
- Session sheet: workout timer start/pause/stop/reset, rest duration and Start rest, rest between exercises and supersets, session date and notes.

Finish opens a review of the sets that will be saved, including a count of omitted sets, the date and optional notes. The clock pauses during review. Keep training resumes it; Save session performs the existing atomic session/draft/schedule transaction and shows a summary with duration and any new personal records. A failed storage write retains the draft. Navigating away from review invalidates it, so a stale review cannot save another workout.

Templates are separate from sessions. Built-in templates can be customized as copies. Editing a custom template with an active draft creates a copy so its session stays intact. Starting another workout pauses the previous one and preserves both drafts.

## Timers

Completing a set starts its rest countdown in a bar pinned to the bottom of the session (−15s, +15s, Skip). Tapping the bar opens the full-screen rest timer, which adds pause/resume and traps keyboard focus; Escape returns focus to the bar. Minimizing keeps the workout running: Today shows an in-progress card with the live clock and a Resume button, and every other screen shows a Resume bar above the tabs.

Browsing, opening the app and entering sets do not start the workout clock. Starting or resuming a workout does. Stopping retains elapsed time and the draft; restarting after Stop starts a fresh clock. Completing a set starts its rest countdown without restarting a stopped workout clock. Running and paused clocks recover across reloads; legacy automatic clocks reopen paused when they contain data.

## Consistency fixes

- "This week" always means Monday–Sunday.
- One progress measure (sets marked done) replaces the previous done-count bar and filled-reps meter.
- One weight suggestion per exercise replaces the separate last-session hint and progression hint.
- One Finish button, one place for default rest (Settings) and one month calendar (Progress → History).
- Repeating sequences never imply calendar dates, so Today's week strip only marks completed sessions and weekly-plan days.

## Compatibility

Sessions, schedule progression, history editing, offline storage, optimistic concurrency and analytics calculations are unchanged. Backups remain version 4 with no new fields. The visual design uses one stylesheet (`css/styles.css`) with light and dark tokens plus `css/muscle-map.css`; any change to app-shell files requires `node tests/version-sw.cjs`.
