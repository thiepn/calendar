# THIEPN Calendar

Independent, device-local calendar workspace under development on the draft feature branch.

## Local operation

```sh
npm install
npm run dev
npm run test
npm run build
```

### Working scope
- Desktop and mobile month, week, day and agenda views; creation, editing, searching and deleting private local events.
- Personal repeating events (daily, weekly, monthly) with occurrence skips; schedule conflicts and daily workload summaries.
- Explicit user-selected ICS imports, immutable source snapshots with provenance and duplicate detection; export of personal occurrences as a finite ICS snapshot.
- Device-local state and JSON backup/restore (no server or account involved).

### Authority and rights
[thiepn/folio](https://github.com/thiepn/folio) owns Folio tasks, habits, time blocks, recurrence and progress. The preexisting same-origin `FolioCalendarPortV1` is **not** a cross-origin service. Calendar has its own **personal event** namespace; importing Folio's ICS export is an *optional, read-only snapshot*, never two-way sync.

No Google OAuth grants, remote provider CRUD, KLIPS login, Account access or server data access are implemented. Imported external RRULE masters are deliberately rejected rather than silently expanded incorrectly. Exporting recurring personal events yields materialized occurrences for the chosen finite date window. JSON backup preserves complete rules.

Calendar data are saved only in this browser's localStorage; clearing storage deletes them unless backed up. Do not use as an authoritative synced calendar. No deployment has been authorized.

## C2: recurring changes & local source refresh

For personal repeated events, opening an instance now offers **Edit this occurrence** (a durable detached event linked to the original skipped date), **Edit whole series**, **Skip this date**, and for detached events **Restore original date**. Move-to-date supports both a single event and one recurring occurrence without shifting the entire recurrence pattern. Removing a series removes its overrides; converting a series to a one-time event retains former overrides as standalone personal events. Changes and skipped dates are backed up in the versioned JSON file.

ICS re-import explicitly supports **Update matching UIDs** (preserves unmatched entries) or **Replace named snapshot** (drops only prior imported entries with the same calendar name). Imported sources remain read-only snapshots; unsupported RRULE masters are still skipped and shown as warnings. Device-local storage is not cloud synchronization.
