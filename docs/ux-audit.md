# Screen and flow audit

The audit covered Home, Train, Plan, Progress/History, More/Data & Backups, and the workout/rest timer flow at mobile and desktop sizes.

| Finding | Effect | Change |
| --- | --- | --- |
| Rendering a draft assigned `startedAt` immediately. There were no workout pause/stop controls. | Simply opening the app accumulated training time. | An explicit persisted workout clock stays idle while browsing or editing; Start Workout or the first completed set starts it. Pause, Resume, Stop, and Reset are separate controls. |
| Workout/rest time lived after the exercise list; the mini rest control only appeared in Train. | Timing required scrolling and disappeared during navigation. | A persistent left-side dock shows elapsed workout time and remaining rest across all five destinations, History, and backups. Its panel controls the named active workout, even when a different workout is being browsed. |
| The timer competed with fields as an overlay. | Controls could obscure exercise entry on small screens. | A narrow reserved rail keeps the dock separate from input fields. The expanded panel is dismissible with Close or Escape; full-screen rest controls retain keyboard focus. |
| Train repeated the workout name and showed schedule management, preferences, and library before logging. | Too much setup before the first exercise. | One workout header and Start/Continue action; setup under Workout options. Exercise cards follow immediately, with compact search. Notes/date and advanced metadata are optional disclosures. |
| Home repeated destinations through quick shortcuts and mixed current and upcoming workout cues. | Competing actions and extra navigation. | One primary Start/Continue action, schedule preview leading to Plan, compact weekly/monthly metrics, and recent history. |
| Plan provided a calendar while schedule management was embedded in Train. | Planning tools did not live in their expected destination. | Active schedule, schedule editing, and calendar are available together in Plan. |
| Progress showed four filters, repeated empty charts, calculation notes, detailed tables, and body-entry forms together. | Dense first view and a long scroll before useful information. | Filters, calculation notes, detailed totals/trends, and body measurements are disclosures. Training overview and muscle map remain available; populated lift trends remain expanded. |
| More's Workout settings link only opened Train. | The label did not match the destination. | Workout preferences opens the relevant disclosure; Data & Backups stays under More. |

## Timer behavior and data compatibility

- Opening the app, changing tabs, searching, or entering reps does not start the workout clock.
- Starting a different workout pauses the previously running clock. Only one workout runs at a time.
- Workout pause also pauses its rest countdown. Stop retains elapsed time and all draft data, and clears the current rest countdown. Restart after Stop starts a fresh clock; Reset returns it to idle.
- Timestamp-based running clocks recover correctly after reload or tab suspension. Paused clocks do not accumulate background time.
- Completing the first set starts an idle workout clock and its configured rest countdown. Completing a set does not restart a deliberately paused or stopped workout clock.
- Finishing and saving a session removes that draft's clock after the atomic storage write succeeds. It does not leave a new workout running.
- Legacy auto-started drafts with entered data reopen paused. Empty legacy drafts reopen idle. The migration preserves draft contents and persists the frozen clock.
- Backup format remains version 4 with optional `draft.workoutTimer` metadata. Existing v1–v4 backups still import. Older builds may reject backups containing the new optional clock fields; retain a backup before downgrading.

## Validation

The change adds deterministic timer tests and browser coverage for idle browsing, pause/resume/stop/reset, reload recovery, one running clock, completion cleanup, legacy draft migration, and cross-screen left-dock access. Existing persistence, import/export, offline, navigation, and analytics suites remain in use.
