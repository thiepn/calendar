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

## C3: Find time

The **Find time** action now searches 7/14 days of actual local recurrence-expanded, imported and personal commitments; time windows, 30–120 minute duration and all-day blocking can be adjusted. Search and visibility filters do not hide conflicts from the availability engine. Choosing a suggested slot opens the existing personal event editor prefilled with exact local start/end times; nothing is reserved before saving. No remote access, background polling or cloud calendar authority is implied.

## C4: graphical timeline and future-only recurrence

Day and week views now use a full 24-hour interactive positioned timeline, with accessible keyboard/mouse/touch-selectable half-hour slots, selectable 30–120-minute durations, all-day rows, collision-aware side-by-side overlapping events and imported-source indicators. Seven-day columns scroll horizontally on mobile; overnight events render on both dates. Slot selection opens the original prefilled event editor; source events retain their own edit/read-only rules.

Personal series additionally support **Edit this and future**, atomically splitting at an actual occurrence only after Save, and **End after this date**, preserving future detached replacements as standalone records. A split is blocked when future replacements make source authority ambiguous. Existing Folio ownership is unchanged.

## C5 — pointer-assisted scheduling and honest local confirmation

Mouse and opt-in touch-pointer gestures create variable-duration events, move personal timed blocks across week columns, and resize events using a dedicated lower handle. Visual previews are provisional; the create gesture opens the original editor, and moves/resizes require a separate confirmation dialog. Users can adjust the proposed start/duration before saving. All saved sources (including hidden ICS snapshots) contribute collision warnings and an explicit acknowledgement requirement; imported blocks cannot be moved or resized. The original personal record retains its identity, while adjusting one recurring occurrence creates an individually linked override. Keyboard users can use Alt+arrow shortcuts on focused events, or the event-details **Adjust time & duration** action.

Native touch scrolling remains enabled by default. Opting into "Touch drag mode" disables panning on event surfaces to permit gestures, without changing source data. DST gaps and duplicated clock times are rejected for graphical creation/adjustments rather than silently assigned to the wrong instant. Recurrence, backups and Folio source ownership remain separate.

## C6: complete local editing review and graphical multi-day planning

**New event or edit:** The source-owned editor validates both start and end times against the device's actual local timezone. Nonexistent spring-transition clock times and duplicated autumn clock times cannot be saved from the editor without choosing another time. The preview checks all saved personal and imported events, including hidden calendars and occurrences generated from repeat rules. Conflicts must be explicitly acknowledged before saving. The overlap window is limited to the first **90 days** of an edited recurring schedule; it does not certify infinite future availability. Recurring start times are separately checked against the next **365 days** for daylight-saving gaps and ambiguities, with source-grounded warnings that the existing recurrence renderer may skip or resolve ambiguously.

**Graphical all-day planning:** In Week or Day, use the **All day** button to start an all-day event. In Week, drag that button across adjacent date columns to create a multi-day range; drag a personal all-day chip to another date column to move the whole span. These edits are provisional until saved in the new or existing confirmation dialog. Event details also expose **Adjust all-day dates** with explicit first and inclusive last-day inputs, providing a reliable keyboard/touch alternative. Imported ICS items cannot be moved. Existing series dates remain intact when a single generated all-day occurrence is adjusted; the change becomes a linked personal override. Standalone all-day events retain their IDs.

**Pointer edge scrolling:** The week/day gesture handler scrolls horizontally near its edges and vertically for timed-event drags. Gesture distance incorporates scroll position to keep half-hour snapping meaningful. Mobile native scroll remains available outside opt-in touch drag mode.

**Limitations:** These are browser-local device-timezone events with no account synchronization, shared reservation locking, source calendar writeback, or live Folio mirroring. On recurring DST edge days, no artificial event or proficiency data is invented. Existing imported calendar snapshots remain read-only. Physical-device and Safari/Firefox results require independent execution rather than extrapolating from Chromium emulation.
