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

## C7 — actual 23/25-hour DST timeline, longer-range review and resilient gestures

**Real device-local elapsed-time axis:** Day/week views derive each displayed day's physical midnight-to-midnight duration. The spring-forward day has 46 half-hour slots; the autumn fall-back day has 50. Both repeated 02:00 slots are represented separately, with real unique ISO timestamps and explicit UTC offset labels. Original events keep their canonical instant instead of being reconstructed into the first fold. Existing ICS records and personal records are rendered in their actual physical rows; distinct adjacent fold events do not create fictitious overlaps.

**Explicit repeated-hour choice:** The original event editor (new, edit and slot-prefilled) shows a first/second occurrence selection when the proposed local start/end time occurs twice. The choice corresponds to actual UTC offsets and must be explicit for ambiguous typed input. Pointer-selected repeated-hour slots carry their chosen fold. Personal timed move/resize confirmation also retains and validates the chosen fold, protecting the canonical source record and linked recurrence exceptions.

**Flexible, bounded planning review:** For recurring events, the source-complete preview offers 90/180/365-day overlap review against all saved sources, including hidden read-only imports, while explicitly identifying the checked horizon and requiring acknowledgement of conflicts. The 365-day DST recurrence warning stays separate; events beyond the selected horizon are **not** certified conflict-free. A source record's recurrence IDs remain authoritative.

**Multi-day editing:** Personal all-day events now expose a visible resize handle within their last displayed column, supporting drag across columns and typed all-day confirmation. Alt+Left/Right shifts the event, Alt+Shift+Left/Right adjusts the inclusive last day. Keyboard-driven adjustments can extend the event beyond the current week without losing its original ID; source-owned recurring instances still create linked detached overrides. Read-only ICS events cannot be adjusted.

**Continuous edge scrolling:** During held pointer drags, a short-lived timer auto-scrolls horizontally/vertically near the visible timeline edges even when the pointer stops moving. The timer is cleaned up on release, pointer cancellation, and component unmount; normal scrolling remains usable, and touch drag mode remains opt-in.

**Scope:** Original personal events, source-owned ICS snapshots, on-device data integrity, JSON backup/restore, and Folio ownership remain unchanged. The planner does not impersonate provider sync, reserve events remotely, or invent future availability. Native Safari/Firefox and physical Android/iPad testing remain separate from the automated Chromium checks.

## C8 — navigable, recoverable, source-protecting standalone calendar

**Product-wide audit and implemented gaps:** C1–C7 already cover the actual local-first event engine, recurrence with per-instance overrides, week/day graphical planning, time selection, DST-aware fold handling, all-day multi-day editing, ICS snapshots, JSON backup and automatic desktop/mobile Chromium acceptance. C8 concentrates on the next real missing workflows rather than opening another calendar engine or copying Folio-owned data.

**Event discovery and navigation:** The main search field now displays a date-scoped 365-day occurrence search panel across saved local personal events and imported ICS copies, respecting the selected source filter. Selecting a result opens its real event details and navigates directly to that date in Day view. A date picker jumps precisely to any calendar date. Agenda can now cover 14 or 30 days and hide empty days for a concentrated schedule, including on small screens. Discoverable keyboard shortcuts use n, t, g, /, j/k and 1–4, while leaving modifier shortcuts and focused text inputs untouched. Result lists are explicitly capped and do not claim to search unlimited future history.

**Recurrence authority protection:** Saving a new full-series rule checks every retained source-owned detached occurrence. If the new rule no longer generates an original date for a linked exception, it rejects the change and tells the user to restore or remove that exception first. No duplicate detached engine, invented override, or automatic reshuffling of original IDs is introduced. Unrelated ICS snapshots remain unchanged.

**Safe data recovery:** Before a change to an existing valid dataset, the app checkpoints exactly one *previous full validated version* in the same browser. **Sources & data → Review previous-version checkpoint** displays the saved-current and proposed data counts, linked exception counts and imported calendar sources, with explicit acknowledgement before restoration. Importing a JSON backup opens the same non-destructive preview instead of immediately replacing all records. Guarded read-before-write applies even to restoration, so changes made by another tab are not silently overwritten. A checkpoint is not a durable backup; save the downloadable full JSON regularly.

**Unreadable storage emergency:** The original raw bytes can be downloaded when the canonical local calendar fails validation. A user-provided, validated JSON backup may repair that unreadable state *only after explicit confirmation*; the app stores the exact unreadable original bytes in a separate local raw-rescue snapshot before writing the valid backup. The rescue bytes remain downloadable afterward. These emergency copies never become a second active event store. If browser storage capacity is insufficient to preserve the previous data, the original write fails rather than overwriting without recovery.

**ICS source review:** Before applying an imported .ics snapshot, the import dialog previews actual counts to add, update, leave unchanged or remove, depending on chosen source-specific update or replace mode. No provider or Folio data is modified. Unsupported recurrence masters remain visibly warned rather than being treated as genuine local series.

**Known feature gaps / readiness separation:** This branch is a self-contained browser-local planner, not a live Google/KLIPS connection, Account synchronization service or shared booking backend. Storage and backup retention depend on the browser and user exports; previous-version recovery is one rolling checkpoint, not an archive. No combined Folio task/habit source authority, live provider writeback, unlimited recurrence planning, event-specific IANA timezones, real-time push notifications, multiple-account conflict arbitration or cross-device sync is claimed. Physical Android/iPad, Safari/WebKit and Firefox have not been qualified by the Chromium emulation pipeline. Keep this PR draft until separately authorized release acceptance.


## C9 — honest on-device reminders, read-only finite ICS materialization and mobile planning

- **Personal reminders:** Event editor offers no reminder, at event start, 5/10/15/30/60/120 minutes, one day or one week before start. The value is optional on the original personal record; existing records and JSON backups remain schema-version 1 compatible. Recurring instances derive exact reminder due instants from the existing occurrence generator and UTC timestamps, including all-day events and DST transitions. Read-only imported ICS records do not receive personal reminder settings.
- **Reminder center:** A toolbar button opens an accessible reminder inbox with due/overdue reminders from the preceding 24 hours and upcoming reminders over 14 days. Users may snooze for 15 minutes, dismiss or open the real event. The original event/recurrence is unchanged by those actions. Dismissal/snooze state is held in a separate bounded local browser preference key, not another authoritative event store. Search is explicitly finite; no cloud provider, remote queue or background alert service is claimed.
- **Optional foreground desktop alerts:** Only a user action can request Notification permission; only when granted and explicitly opted in may the running, visible Calendar tab show system notifications. Due alerts use real timestamps with a 15-minute freshness bound and deduplication. Alerts will not reliably fire while Calendar is closed, the device sleeps, or the tab is backgrounded. The in-app reminder center remains available without notification permission.
- **ICS interoperability:** Personal finite ICS export embeds standards-based DISPLAY VALARM for configured reminders. Finite **all-day only** imported RRULEs supporting DAILY/WEEKLY/MONTHLY, INTERVAL, bounded COUNT or date-only UNTIL, weekly BYDAY and all-day EXDATE can be *fully expanded* to stable UID/date-keyed read-only snapshots under explicit 150-instance/730-day bounds. Matching all-day RECURRENCE-ID overrides (including cancellations) materialize without changing personal data. A malformed member prevents committing a misleading partial master expansion. Infinite, unsupported, complex and timed RRULE masters remain unimported with a visible source warning; RDATE and unsupported timezone qualifiers are not guessed.
- **Mobile planning:** Event details now offer **Duplicate to selected date** using the existing date input. The draft creates a fresh personal ID, carries the original reminder, strips recurrence links and waits for ordinary editor confirmation. For recurring events, **Next occurrence** navigates to the next generated date found in the finite next-year range without fabricating future events or modifying original series.
- **Preserved safeguards:** Canonical event IDs, detached recurrence links, source-owned ICS UIDs, Folio separation, localStorage recovery checkpoints, collision reviews, explicit confirmation and no external writes remain intact.

**Known limitations:** No Service Worker/push scheduling, no background reminders or guaranteed alarm delivery, no external calendar writeback/sync, and no collaborative authority. Physical Android/iPad, Safari/WebKit and Firefox still need independent qualification. ICS recurrence support deliberately excludes infinite and complex source recurrence rather than publishing wrong appointments.


## C10 — bounded timed ICS, reminder preferences and offline app shell

**Supported source import expanded:** In addition to existing finite all-day recurrence, the importer now handles finite **timed** iCalendar DAILY/WEEKLY/MONTHLY rules with optional INTERVAL, bounded COUNT or UTC date-time UNTIL, and weekly BYDAY. It resolves each occurrence's original UTC clock, supported named TZID wall clock or clearly floating device-local clock rather than reusing one constant UTC offset over DST. Within a maximum 730-day/150-occurrence horizon, timed EXDATE and RECURRENCE-ID modifications or cancellations are materialized into independent source-owned read-only snapshots keyed by the source UID and *original* occurrence instant. The full recurrence master is skipped with a warning if an instance has a nonexistent/ambiguous wall clock, an invalid timezone, unsupported field or inconsistent source clock system. Infinite rules, RDATE, unsupported complex BYxxx modifiers, arbitrary VTIMEZONE custom rules and provider account synchronization are **not** claimed. Exact duplicate source instance keys are rejected instead of creating duplicates.

**Stable reimport and replacement:** Updating an imported snapshot preserves each unchanged source UID/occurrence record ID; true added, updated, unchanged and source-removed counts are reported. Replace removes only imported copies belonging to the selected source and absent from the incoming file; unrelated imported sources and all personal records remain unchanged. No provider writeback occurs.

**Reminder lifecycle:** Reminders now support a user-owned local **default for newly created events**, optional foreground-only desktop alert quiet hours (off, 22:00–07:00 or 00:00–08:00), and a **Dismissed reminders** list with an Undo action. In-app due items are never hidden by quiet hours; this setting only suppresses *opt-in* foreground system notifications, without promising later catch-up. Existing events keep their own reminder configuration. These preferences are independent from authoritative calendar records, stored only on the device, and reflected across same-origin tabs when the browser delivers storage events.

**Offline/PWA readiness:** Production Vite builds generate a versioned same-origin service worker with a precached first-party HTML/JS/CSS/manifest/icon shell, and a web-app manifest suitable for install prompts on eligible browsers. The worker handles offline navigation with cached HTML and caches only build-owned static assets; it does not cache external requests, user event data, imported ICS files, provider responses or credentials. Personal events and preferences continue to live in the browser's own guarded localStorage. The app can open offline only after its shell was successfully installed on a previous connected visit in that browser; clearing site data removes both cached shell and local event data. Background notification delivery is **not** implemented by the worker. Installability and offline behavior on physical iOS/Android devices and non-Chromium engines still require device acceptance.

**Operation and safety:** Keep exporting the full JSON backup to a user-owned location. The built-in one-version recovery snapshot is not durable multi-device storage. On release, test actual network loss, local quota limits, app updates/cache invalidation, other browsers and physical device installs separately. No deployed site, remote provider credentials, user login or production migration is configured by this branch.


## C10 continuation — source-safe replacement, recovered views and foreground reminder controls

The pre-existing C10 code implements finite source-clock timed ICS recurrence, DST/TZID validation, reminder preferences, and a generated PWA offline shell. This continuation strengthens actual user-facing integrity without introducing new canonical sources.

- **Incomplete ICS import cannot erase old snapshots:** The preview tracks rejected/unsupported VEVENTs separately from informational expansion warnings. **Replace earlier imported snapshot** is prohibited when any VEVENT was rejected, even when other entries parse successfully. Existing source UID/occurrence records survive; **Update matching UIDs** remains available. Rejected counts and the blocked replacement are visible. Fully parsed sources retain exact add/update/unchanged/delete calculations, stable IDs, and read-only rights.
- **Saved display preferences:** Month/week/day/agenda view, all/personal/imported filter, 14/30-day agenda length, and hide-empty-days choice now survive browser refresh, with a reset control. The selected date still begins at today on a new visit. These are strictly validated local preferences, not a second calendar database.
- **Offline and storage inspection:** **Sources & data → Offline & storage** shows browser online indication, registered shell worker, actual Cache Storage presence, estimated storage quota/usage and persisted-storage permission. The user can refresh diagnostics and explicitly request persistence; success is never assumed. This panel is not remote syncing, a permanent data guarantee or background alarms.
- **Snooze lifecycle:** Due/upcoming reminders can be snoozed for 5, 15 or 60 minutes, with **Undo snooze**. Snoozing future reminders postpones their actual scheduled due time rather than moving them earlier; overdue reminders snooze from now. No personal calendar or imported record is mutated by snoozing.

Offline app access depends on a previously cached shell and retained site data. Foreground notifications are not guaranteed while the browser is closed. No production deployment or physical-device verification is implied by this batch.

## C11 — bounded explicit RDATE, portable agenda, overdue triage and recovery

- **More interoperable, still safe ICS.** Finite source-owned all-day and timed RDATE additions can now accompany supported finite RRULE/EXDATE masters, or provide an explicit finite RDATE-only series. Source-local TZID or UTC DATE-TIME, stable original recurrence UID keys and read-only authority are retained. Timed RDATE may have its own local wall hour; its real source instant is resolved before deduplication, including DST fold rejection. All-day RDATE supports only DATE without TZID. RDATE PERIOD, mixed clock systems, invalid/orphan original-date exceptions, out-of-range dates and unbounded expansions are refused as a whole, with warnings. Source-wide replace is prohibited for incomplete previews; original provider data is never written. Bounds remain 730 days and 150 instances per master. Advanced RFC recurrence qualifiers still require explicit external expansion instead of invented meetings.
- **Actual daily planning, not another store.** Next/Previous busy day buttons navigate up to one year based on *currently visible* original personal and read-only imported records, including multi-day all-day commitments. The Agenda view has a one-click local CSV download for the displayed 14/30-day window, using the same active source/search filter. CSV contains dates, times, titles, locations and source labels, but excludes private description/notes, internal IDs and hidden sources. Spreadsheet formula-like imported text is neutralized before quoting. Export is user-triggered; no sharing or upload is performed.
- **Reminders remain local and reversible.** An explicit reminder-center selector can reveal due personal reminders from either the past 24 hours or seven days, alongside next-14-day upcoming items. When more than one due reminder is displayed, an individually confirmed **dismiss reviewed reminders** action writes one bounded local preference update, never touching event/recurrence records, with individual restore still available. This is not guaranteed background notification history: absent source data, closed-browser alerts and periods older than seven days are not reconstructed.
- **Portable recovery checkpoint.** Sources & data can now export the last validated previous-version checkpoint as a regular original-schema JSON backup. It is read fresh at click-time to avoid exporting an outdated visible state. This prevents the sole rolling device-local undo checkpoint from being the only recovery copy; full backups remain encouraged.
- **Acceptance:** C11 Vitest for all-day/timed RDATE unions, EXDATE, source clock IDs, orphan exceptions, CSV injection safety, spanning all-day busy-day navigation and overdue review. Exact-head Chromium desktop/mobile tests cover source refresh and true user-triggered file downloads, cross-date busy navigation, checkpoint file content, reminder batch/undo and mobile overflow. Offline shell remains first-party static asset cache only; no calendar data is cached into the service worker, no credentials or provider synchronization.

The remaining important feature gaps are richer full-RFC recurrence/provider interoperability, durable multi-device user-approved sync, multi-person bookings, and reliable background alarm delivery. Physical devices and other browser engines require separate testing.
