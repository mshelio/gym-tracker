# openGym-inspired interface

Reference: [DuarteSantos8/openGym](https://github.com/DuarteSantos8/openGym), reviewed at `e348fc17c42c7e9a211c5972e573ad3698190ee2`.

This change independently implements its weekly overview, prominent workout action, quiet neutral surfaces with green accents, and session-completion emphasis inside Gym Tracker. It retains the existing Today / Plan / Progress navigation, IndexedDB data, backup format, and explicit timer start/pause/stop behavior.

- Today: Monday–Sunday week strip with actual completed sessions and scheduled/rest days from the existing calendar model. Cycle schedules remain sequences, not invented calendar dates. Previous/next week navigation never starts a session.
- Start or resume comes before the collapsible exercise preview. A body-weight card opens the existing measurement form, and real session totals summarize the current week.
- Training: a completion bar counts explicitly completed sets, not merely filled fields. Full-size exercise photos, optional demonstration searches, and the persistent timer remain available.
- Progress: an 84-day activity grid reflects saved sessions. Existing charts, muscle maps, and history remain available.
- Light, dark, and system themes use opaque neutral surfaces and green actions. Mobile inputs retain their 16px minimum to avoid focus zoom.

No openGym code, branding, or media is copied. Its code is AGPL-3.0; its Gym Visual media is separately licensed, with reuse restricted to openGym and qualifying forks. Those animations are not included. Existing Free Exercise DB photos and YouTube demonstration searches remain the media sources.

This is an adaptation of the interface, not full openGym feature parity: it does not add its backend, accounts/passkeys, cross-device sync, coaching, or restricted animation catalog.
