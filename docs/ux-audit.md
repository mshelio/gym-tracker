# Screen and flow redesign

The app is organized around doing today's workout, planning the next sessions, and reviewing results. The former Home/Train split and five-tab navigation have been replaced with three destinations.

| Destination | Default screen | Secondary actions |
| --- | --- | --- |
| Today | Next workout or saved session, exercise preview, estimated duration, Start/Resume, last completed session | Choose another workout, view plan |
| Plan | Active routine and upcoming sequence | Manage schedules, expandable calendar, workout templates, searchable exercise library |
| Progress | Recent sessions, seven-day consistency, lift trends when data exists | History, detailed analytics and filters, muscle map, body measurements |
| Settings button | Appearance, default weight unit, rest duration, progression preference | Data & Backups |

## Active workout

Start opens a dedicated session with expandable exercise cards. The first unfinished exercise opens by default; users can jump freely between exercises. Each card shows targets, previous performance, weight/reps/completion controls, and a Next exercise action. Substitutions, RIR, set types and defaults are inside Exercise options. Session notes and date are optional.

Finish opens a review of the actual sets that will be saved, including a count of omitted sets. The clock pauses during review. Keep training resumes it; Save session performs the existing atomic session/draft/schedule transaction and displays a saved summary. A failed storage write retains the draft. Navigation away from review invalidates that transient review, preventing a stale review from saving another workout.

Templates are separate from sessions. Built-in templates can be customized as copies. Editing a custom template with an active draft also creates a copy so its existing session stays intact. Starting another workout pauses the previous workout and preserves both drafts.

## Timer and layout

The bottom-right floating button appears for an active session, remains available across destinations, and displays elapsed workout and remaining rest time. It reserves no horizontal content space and sits above mobile navigation. The control panel opens upward; offline/update messages occupy a separate area beside it. Rest is also shown beside the open exercise.

Browsing, opening the app and entering sets do not start the workout clock. Starting or explicitly resuming a session does. Pause, Resume, Stop and Reset remain available. Stopping retains elapsed time and the draft; restarting after Stop starts a fresh clock. Completing a set starts its configured rest countdown without restarting a stopped workout clock. Saving clears the saved draft's timer after storage succeeds. Running and paused clocks recover across reloads; legacy automatic clocks reopen paused when they contain data.

## Compatibility and verification

Sessions, schedule progression, history editing, offline storage, optimistic concurrency and existing analytics calculations are preserved. Backups remain version 4. The optional `preferences.defaultUnit` field joins the existing optional workout-clock metadata; older v1–v4 backups continue to import. Older application builds may reject backups with new optional fields. Default-unit changes apply to new sessions; existing sets retain their units.

Browser checks cover the new Start → Log → Review → Save → Summary flow, three-tab navigation, template editing, Settings persistence, timer controls, keyboard/modal focus, draft recovery, backups, offline operation and storage conflicts. Responsive checks cover 320, 390, 768 and 1440 pixels in light and dark themes. Existing analytics accuracy and 1,000/10,000-session performance checks are retained.

### Local verification

- Desktop/mobile Chromium: 88 checks passed with two existing profile skips; final workout-flow follow-ups passed all 16 checks, and the subsequent history/clock safeguard selection passed all eight checks.
- Mobile WebKit: 18 checks passed. The repeated-reload clock check aborts in the native WebKit process (`std::optional` assertion). A real-time reproduction without clock mocking also fails on current main after Home/Train navigation, so it is not specific to the redesigned screens. The failing assertion remains enabled in CI; no forced clicks, disabled assertions, or increased timeouts were introduced.
- Node regression/timer, backup-schema parity, service-worker revision/upgrade and release-readiness checks passed. The Pages startup/offline smoke script passed against a dedicated local server.
- Firefox was not run locally; its CI project remains enabled.
