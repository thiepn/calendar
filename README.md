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


## C12 — source-safe monthly interoperability, personal copy and recovery

- **Bounded monthly recurrence:** Original finite read-only ICS import accepts monthly \`BYMONTHDAY\` selectors with positive day numbers (1–31), negative month-end offsets (-1 to -31) and up to twelve unique values. It verifies that the source DTSTART matches its selector, skips impossible dates correctly, counts actual instances, and preserves real \`TZID\` instants over DST. Unsupported rules remain rejected with a warning rather than approximated. Original UID, EXDATE, RDATE, exception authority and guarded replacement remain intact.
- **Create your own editable event from an imported copy:** The imported event detail panel offers **Make personal copy**. It creates a fresh-ID standalone personal draft, removes imported source keys and recurrence ownership, opens the existing conflict-aware editor and requires an explicit save. Optionally apply a local reminder. The original ICS record remains read-only and future source refreshes do not overwrite the personal event.
- **Recover only absent personal events:** Original JSON backup / validated recovery checkpoint previews now provide **Recover missing personal records** as an alternative to full replacement. It shows the missing personal IDs, previews their titles and linked recurrence edits, and requires a distinct confirmation checkbox. It never imports backed-up ICS records, never overwrites existing personal or imported records, and refuses changed parents or invalid detached links. Standard backup schema version 1, guarded current-write ownership, rolling previous-version checkpoint and corrupt-source rescue are preserved; no migration, second store or unattended merge.
- **Historical event search:** The same source-filtered occurrence search can look 365 days backward or forward from the selected date. It stays capped to 30 navigable results, and no remote indexing is introduced.
- **Safer notification previews:** Foreground OS notification text defaults to a generic Calendar reminder without the title or start time, including for users with pre-C12 reminder settings. Users can explicitly opt in to title/time previews and revert immediately. The in-app reminder center remains unchanged. This is not background alert delivery or a notification service.
- **Browser acceptance:** Source-backed desktop Chromium import of a monthly source over DST, historical lookup, real personal-copy editor/save and unchanged UID refresh, OS-preview preference persistence; touch/mobile Chromium JSON backup preview and selective additive recovery with exact current-source and rolling-checkpoint preservation. All C1–C11 regressions remain in the same automation.

**Outstanding scope:** Full RFC recurrence combinations (\`BYSETPOS\`, ordinal \`BYDAY\`, provider-specific \`VTIMEZONE\` definitions, recurring custom RDATE PERIOD), multi-device and external provider sync with appropriate user authorization, collaborative scheduling, guaranteed background notifications, and physical Android/iPad plus WebKit/Firefox qualification.

## C13 — Source-safe monthly weekdays, explicit durations and seven-day planning

The local-first calendar now supports finite source-owned monthly iCalendar BYDAY selectors: every named weekday, a selected ordinal such as second Tuesday, or a month-end ordinal such as last Friday. The original DTSTART must belong to the selector; a finite COUNT/UNTIL and 730-day/150-instance cap remain mandatory. Unsupported mixed BYMONTHDAY+BYDAY, yearly/complex RFC selectors and unbounded masters remain blocked rather than silently materialized.

An imported all-day VEVENT may use an explicit positive PnD or PnW DURATION (up to 31 civil days), while a timed VEVENT may use positive elapsed PT hours/minutes/seconds (up to seven days). The same bounded duration handling applies to finite recurring masters and valid detached occurrence overrides. DTEND plus DURATION is rejected; timed nominal day/week durations are deliberately unsupported because their source-zone daylight-saving semantics cannot safely be inferred here. RDATE and EXDATE remain bounded and source-owned. Orphan RECURRENCE-ID instances, unsupported RANGE=THISANDFUTURE updates and duplicate all-day recurrence IDs are refused so an incomplete source cannot replace valid earlier imported snapshots.

Week and Agenda now show a compact seven-day workload strip. It draws solely from the existing filtered original records; its timed occupied minutes union overlapping intervals rather than double-counting them, clip at device-local midnight, and respect real 23/25-hour DST days. All-day entries have separate counts. A keyboard/mobile touch target opens the actual Day view for planning. This is a read-only workload summary, not another calendar authority and not a guarantee of a free booking slot.

An individual snooze/dismiss now re-reads both the saved canonical calendar and reminder-action state immediately before updating the user's local preferences; stale event/alert changes are refused. Foreground notifications remain optional, private by default and active only while Calendar is visible. The existing first-party offline shell does not cache original data.

C13 regression coverage includes recurrence/UID and duration guards, multi-day and DST-minute aggregation, import refresh, mobile source-scoped planning and cross-tab stale reminder rejection. Connected-provider sync, background alarms, collaborative invitations and full advanced-RFC recurrence remain out of scope. No deployment, migration or production write is performed.

## C14 — bounded yearly ICS and source-complete, freshness-checked Find Time

- Finite source-owned YEARLY RRULE imports now accept a unique BYMONTH list and positive/negative BYMONTHDAY selectors. MONTHLY sources also support BYMONTH. DTSTART must satisfy every selector. Existing 730-day/150-instance bounds, original UTC/TZID clock, RDATE/EXDATE, RECURRENCE-ID and source-wide incomplete-replace protection are retained. Complex YEARLY BYDAY and unbounded subscriptions remain unsupported rather than guessed.
- Find Time now supports all days, weekdays or weekends and 0/15/30-minute clearance before and after any saved timed commitment. All imported snapshots count even when excluded by view filters. DST repeated and nonexistent local suggestions are excluded. Its suggestions are revalidated from the original local storage when selected, with explicit refusal if another tab changed the source or the suggestion expired.
- Graphical calendar click/touch slot creation remains independent of finder-only eligibility and retains its existing safeguards. Narrow mobile screens display two-column responsive scheduling preferences with explicit accessible labels.
- Bulk reminder dismissal also rechecks the originally reviewed due timestamp, not only the recurrence key, preventing a stale snoozed item from being dismissed after another tab changed its due time. No background delivery promise, remote provider write, Folio mutation, new canonical store or cloud sync is introduced.
- C14 Vitest and real Chromium desktop/mobile acceptance cover yearly source import identity, source-aware buffered/weekday suggestions, DST fold exclusion, out-of-date finder refusal and no-write-before-save mobile scheduling.

## C15 — yearly ordinal interoperability and independently visible imported calendars

- **Finite yearly ordinal BYDAY:** In source-owned RFC 5545 snapshots, YEARLY with explicit BYMONTH and BYDAY (including fourth-Thursday or last-Monday ordinal positions and multiple selected months) materializes bounded individual instances. DTSTART must match the selected month and weekday position. Supported source TZID, UTC clocks, recurrence exceptions, original UID keys, 730-day horizon and 150-instance cap remain intact. Year-wide ordinal BYDAY without an explicit BYMONTH, as well as combined yearly BYDAY/BYMONTHDAY, are deliberately rejected and cannot silently delete a previous source snapshot.
- **Independent imported snapshot visibility:** Every named ICS snapshot can be shown or hidden from the sidebar and Sources & data panel, including on mobile. This affects **calendar views, agenda, search and workload summaries**, but never changes any canonical original record, ID, personal recurrence or read-only imported authority. Find Time and overlap checking still use **all saved events**, including hidden source snapshots. Hiding does not delete an import or connect to a provider.
- **Recoverable display settings:** Per-source visibility uses an optional validated extension to the existing local view preferences v1, compatible with older saved payloads. It persists across reloads, receives same-origin cross-tab storage updates, and resets with other display preferences. Visibility choices are not included in the event-only JSON backup; restoring a backup does not rename, delete, or alter unrelated original source records.
- **Browser acceptance:** C15 automated Chromium desktop and touch-mobile checks cover actual finite yearly ordinal ICS imports and source UID stability, two independent imported calendars, cross-view and search suppression, persistent visibility after reload, hidden commitments still blocking scheduling, mobile source controls and unchanged original local event bytes.

Still not implemented: provider sync, background OS alarms, unbounded RFC recurrence, server or cross-device state, and collaborative scheduling. No production writes, migrations or credentials.

## C16 — source-faithful monthly BYSETPOS and original-clock exception safety

- **Monthly weekday position recurrence:** Finite imported `RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=...` now expands the **last workday** of each original source-calendar month. It also supports unique bounded positive/negative BYSETPOS combinations (e.g. first and last workday), compatible MONTHLY BYMONTH constraints, and single-weekday nth-position rules, while preserving exact source UID keys, TZID/UTC instants and immutable imported event ownership. Only bounded MONTHLY unnumbered BYDAY selectors qualify; ordinal BYDAY plus BYSETPOS, year-wide and weekly BYSETPOS, combined BYMONTHDAY and invalid/nonmatching DTSTART remain explicitly unsupported rather than guessed. All previously established 730-day/150-instance/2 MB safeguards remain.
- **Mixed-source-clock guard:** EXDATE and detached RECURRENCE-ID identifying original timed instances must use the recurring master's TZID, UTC marker and DATE-TIME type; all-day EXDATE and RECURRENCE-ID must use DATE without TZID. A mismatched exclusion or exception makes the original source master incomplete in the preview, and the established source-wide **Replace** guard prevents accidental deletion of saved imports. Existing imported source IDs and personal records are never silently rewritten; explicitly accepting a supported source refresh still preserves them.
- **Device-first acceptance:** Domain tests exercise last weekdays across short months, sorted first/last positions, source TZID recurrence, rejected unsupported selectors, UTC/floating and cross-zone exclusion mismatches, valid exceptions and source-key-preserving import refresh. Automated Chromium desktop/touch-mobile tests operate the actual ICS preview/apply/reimport workflows, refuse destructive incomplete replacement and check responsive agenda and unchanged original source records.
- No provider credentials, OAuth, account sync, Folio writes, production writes or background push service are introduced. Physical-device and cross-browser qualification remain separate release gates.


## C17 — exact source-change review and safe complete ICS snapshot envelopes

- **Real change review before import:** Both add/update and replace modes now compare **original imported source UID/occurrence identities** and classify each event as added, updated, unchanged or removed. Source changes include event title and exact old/new start times, with field names for edits. Removed entries are shown first, followed by updates and additions. The existing four import counts must match the guarded merge result or the preview is refused.
- **Explicit destructive consent:** Choosing Replace no longer implies deleting every old import; a confirmation is requested only when earlier imported entries are demonstrably absent from the replacement file. Declining leaves the original local snapshot untouched. Review honors the current saved state and canonical CAS commit; no new event store or provider authority is introduced.
- **Full downloadable local report:** The import dialog shows the first 35 changes on desktop and mobile, with a button to download a complete CSV change report. The report includes **imported source events only** and no private personal calendar records or source UID keys. Formula-style spreadsheet payloads are escaped. No upload or external network request occurs.
- **Structural completeness gate:** Imported files must have one correctly closed VCALENDAR with balanced VEVENT/VTIMEZONE/VALARM components. Missing END:VCALENDAR, unclosed VEVENT, nested/duplicate root documents and empty deletion-only snapshots are rejected before source-wide replacement. Nested timezone and alert properties cannot overwrite calendar names or event fields. iTIP METHOD:CANCEL/REQUEST messages are not complete calendar snapshots and are refused; plain snapshot and METHOD:PUBLISH remain supported. A UTF-8 BOM is tolerated.
- **Acceptance:** C17 domain checks cover source-safe add/update/remove, stable original IDs, no private event leakage, formula-safe full report, incomplete source refusal, complete-structure handling and nested component behavior. Automated Chromium desktop and touch-mobile acceptance covers actual file-driven preview, download, cancellation, destructive confirmation and original storage integrity.

Boundaries remain unchanged: imported calendars are read-only local snapshots, not provider subscriptions; no credentials, Folio writes, cloud sync, migrations, deployments or paid services. Physical-device and Firefox/WebKit verification remain separate release gates.


## C18 — reviewed personal ICS handoff, explicit privacy and real mobile export

The previous one-click hard-coded 395-day ICS export was a risk for users sharing their own appointments: it silently included personal event titles, descriptions, locations, reminder alarms and a fixed date window. The topbar export action and **Sources & data → Review personal ICS export** now open an explicit, responsive review instead.

- Choose a **date window of 1–366 inclusive days**, anywhere in the past or future. The source-backed preview counts actual standalone, recurring, detached and all-day personal occurrences, and explicitly counts how many imported source records are excluded. It shows up to six representative items and does not write anything until the user requests a file download.
- **Busy only (default)** exports occupied time/dates without titles, descriptions, locations or alarms. It mints fresh opaque UUIDs for each shared VEVENT rather than leaking original local canonical event IDs. Repeated Busy-only downloads have new UIDs and **may create duplicate entries when imported repeatedly** into another app; this is a shareable snapshot, not a synchronized feed.
- **Event titles** exports titles and stable per-occurrence UIDs but no private descriptions, locations or alarms. **Full details** explicitly includes title, description and location. Reminder VALARM is a **separate opt-in only in Full details**; enabling it can expose personal titles on recipient notifications.
- Personal ICS export remains a finite **snapshot of original personal events only**; visually hidden imported providers are never re-exported. It is never a substitute for **Save full JSON backup**, which is still the only lossless native storage recovery format. Recurring personal series materialize as independent ICS occurrences rather than silently promising editable provider sync or original recurrence-rule preservation.
- A download revalidates the latest original local calendar bytes, re-runs the finite export preview and verifies emitted VEVENT count. If another tab changes the saved data while review is open, no stale file downloads. Browsers themselves own the resulting file destination; no cloud upload or external write is performed.
- Personal ICS TEXT now normalizes CRLF and bare CR to escaped newlines and removes control bytes such as NUL before ICS line folding, closing a malformed local text/property injection gap. The prior programmatic export behavior is preserved for existing callers; new UI uses the explicitly reviewed privacy profile.
- Focused tests cover the three privacy profiles, true reminder opt-in, opaque busy UIDs and original ID secrecy, recurring detached overrides, all-day calendar dates, rejected invalid/empty/oversized ranges, safe TEXT quoting and untouched canonical/provider data. Chromium desktop/mobile acceptance verifies real exported file contents, source exclusion, privacy controls, responsive sizing, no automatic export and stale-data refusal.

**Still unqualified:** physical-device Android/iPad and OS file picker behavior, Safari/Firefox, provider-specific ICS consumers, guaranteed background notifications and connected provider or cross-device synchronization. This change requires no account, credentials, backend, migrations, deployment or costs.


## C19 — chosen-time snoozing and original-source reminder continuity

- **Exact local snooze time:** Every personal reminder now offers an **Until…** action beside the existing 5-minute, 15-minute and 1-hour options. A responsive, keyboard-accessible inline date/time picker lets the user select a unique **device-local** instant, after the item's currently active due time and within seven days from now. Invalid dates, local DST spring gaps and repeated autumn-fold times are refused rather than silently shifted. Choosing a later time modifies only the independent local reminder action, not the source event or any recurring instance.
- **Original-date boundary repair:** Previously, a snooze could silently disappear from Local reminders once its **original** event fell out of the 24-hour or 7-day overdue query, even though the snooze was still pending. The planner now resolves *only* pending snooze actions back to their exact saved source record and original occurrence (source date, start instant and configured lead time). This works even when the original event is much older than the selected triage window, without expanding all recurring series indefinitely. Stale snoozes for removed, rescheduled or no-longer-valid occurrences are not synthesized; imported snapshots never acquire personal reminders.
- **Action-time freshness:** Custom snooze shares the pre-existing guarded preference write path: re-read the original local calendar and latest snooze/dismiss preferences, match the original reminder key and active due instant, validate the chosen device-local wall time, then persist. A stale cross-tab edit or changed active due time refuses the action. Users can cancel a custom entry, undo a saved snooze and retain old events' original IDs/notes and source/calendar authority. The original read-only provider import, visible-source controls, Find Time and Folio boundaries remain unchanged.
- **Qualified implementation tests:** Focused source cases cover chosen instant/expiry, control of upcoming due times, DST gap/fold rejection, overdue-window continuity, unique original keys containing pipes, source removal/change invalidation and imported-source exclusion. Automated desktop and mobile Chromium acceptance exercises real inline picker interactions, snooze persistence, undo, older original records, 390px mobile layout and a stale-tab edit without saving incorrect preferences.
- **Scope:** In-app reminders and optional foreground notifications only, while Calendar is open. This does not add background push alarms, service-worker delivery, provider sync, new storage schemas, migrations or external writes. Physical Android/iPad and Firefox/Safari remain separate qualification gates.


## C20 — one-occurrence source-safe conflict-free rescheduling alternatives

The previous timed Move/Resize review disclosed collisions against imported and personal commitments but offered no actionable source-aware repair. Users had to guess another date/time or explicitly accept a known overlap.

- **Find conflict-free alternatives** is now part of the existing personal timed adjustment dialog. Choosing it offers independently calculated original-source-backed candidate dates/times before confirming a change. Search is bounded to 1/3/7 civil days, 07:00–23:00 device-local, a 15-minute grid, 15–240-minute durations and up to eight proposed alternatives. The controls can require 0, 15 or 30 minutes' spacing around other saved commitments; a long or non-grid appointment remains manually editable rather than guessed.
- **Original occurrence versus original series:** For the availability calculation, only the **selected single personal occurrence** is temporarily excluded. Every other recurrence in the same original personal series remains busy. Detached occurrence edits retain their identity; original read-only imported snapshots, including hidden sources, all-day events, other personal events and cross-midnight commitments remain authoritative. No provider or calendar record is ever changed by a suggestion.
- **Actual domain validation:** Every suggested slot is checked again against the original timed reschedule domain and kept only if it has **zero** collisions. The chosen source/calendar state is re-read and the whole candidate search repeated before transferring a choice to the pending adjustment. The separate guarded final save still requires user confirmation and rejects stale cross-tab writes. Selecting a suggestion does not save, notify, or alter a recurring series. DST fold/gap times are refused by the underlying local-time resolver.
- **Mobile usability:** The existing responsive adjustment dialog presents a scrollable list of touch-sized alternative buttons, clear proposed dates/times and accessible 1/3/7-day and spacing controls. If nothing is possible, users can change their search constraints or continue with the original manual adjustment and existing explicit collision acknowledgement.
- **Tests:** Source tests verify candidate eligibility against hidden imported events, only-one-instance recurrence exclusion, all-day blocks, busy buffers, unknown/changed original events, invalid or long time windows, fresh-source changes and unchanged saved record identities. Actual automated Chromium desktop/mobile workflows cover the dialog, alternative selection and explicit save, mobile series coexistence, touch/layout and a simulated stale-tab refusal.

This remains **a local standalone calendar**: no remote attendee booking, Folio changes, provider authority transfer, notification changes, new storage schema, credentials, migrations or background scheduling are introduced. Physical devices, Safari/Firefox and live provider interoperability remain separate release gates.

## C21 — source-accurate ICS free/busy transparency

Finite read-only imported VEVENT entries with RFC 5545 `TRANSP:TRANSPARENT`
remain visible and searchable but do not block Find time, adjusted-event
alternatives, busy-day jumps, overlap reviews or busy-minute workload totals.
Missing `TRANSP` and `TRANSP:OPAQUE` continue to block time. Bounded
recurring masters and detached original-UID overrides inherit or override
transparency without changing event IDs or RECURRENCE-ID identity.

Unsupported and duplicate transparency values cause a guarded incomplete import:
existing snapshots cannot be destructively replaced. Original imported free/busy
flips appear in the per-event review; on confirmation the original source ID is
retained. Only imported records can have a transparent field, optional in the
existing schemaVersion 1 for backward-compatible device-only backups; personal
copies become normal busy appointments. Every saved imported snapshot counts
towards source-complete free/busy even if visually hidden. No Folio authority,
external provider write, sync service or migration is introduced.

## C22 — mobile week focus

Week retains the default horizontal seven-column timeline. Mobile **Focus day**
reveals a full-width selected-day timeline while keeping all seven dates one
tap away, displaying original filtered event counts, plus **First event** and
**07:00** hour jumps. Desktop and Full week remain unchanged. The jump uses
actual local-midnight elapsed minutes and handles overnight spans and DST
23/25-hour days without changing records or inferring free time. The original
ICS/read-only/TRANSP, Folio, recurrence, guarded editing and privacy boundaries
remain authoritative; no new storage or migration is introduced.

## C23 — mobile draft-first scheduling and persistent save controls

Mobile New event, Edit event, Duplicate and per-occurrence/future-only editors
share optional **Quick schedule** controls. Timed drafts can move to the previous/
next calendar day, shift +/-30 real minutes while preserving exact duration,
or set a 30/60/90/120-minute duration. All-day drafts can shift their inclusive
multi-day range one calendar date without changing its length.

A pure local-clock helper preserves explicit DST folds on real-instant shifts;
moving to a date with missing or ambiguous wall times fails visibly without
changing either field or silently selecting a fold. Users may still edit both
native date/time fields and explicitly resolve repeated hours. These shortcuts
**only change unsaved editor state**, invalidate earlier conflict acknowledgements
and keep the source-complete calendar review, original record writer and CAS
boundary fully responsible for saves. On narrow viewports, the editor stops
auto-opening the software keyboard, provides 43px controls, and keeps Cancel/
Save visible while scrolling through the long form. Desktop editor is unchanged.

## C24 — source-preserving paginated local event discovery

Search used to silently truncate a year of occurrence matches to 30; dense
recurring series made later matching instances unreachable. The existing
forward/backward 365-day source-filtered search now reports its actual total
and exposes **Previous results / Next results** paging across all materialized
original occurrences, with 30 per page. Pages are chronological within the
selected direction, with stable canonical occurrence IDs and dates. Changes
to date, filter, visibility, direction or query reset the ephemeral cursor.
An explicit mobile search trigger focuses the existing accessible search input;
phone result cards and page controls have larger touch targets.

`src/core/search-pages.ts` is a pure, bounded projection, never a second
store or a source of free/busy truth. Search still respects visible source/
hidden snapshot filters; independently, original complete-source availability
and conflict review include hidden busy imports and exclude transparent ones.
No record IDs, recurring exclusions, original source data, storage, security
authority, recovery or Folio boundaries are modified. Searching/paging opens
existing event details via original occurrence keys, without writing records.

## C25 — nearby visible-event browsing in original details

Event details no longer force repeated close-and-find navigation on phones.
**Previous / Next visible event** traverses canonical materialized personal,
detached recurring and read-only imported occurrences across dates, ordered by
physical start instant and original occurrence key. The view is intentionally
bounded to 30 calendar days before/after the active date. The label reports
position within that displayed window; unavailable directions are disabled,
not misreported as no events existing elsewhere. An adjacent **Show this day**
action closes details and opens the existing Day view at the exact active
occurrence date. Mobile has a large accessible navigation strip, a sticky
details header and a readable wrapped action area; desktop navigation remains
available without changing existing editor semantics.

The pure `src/core/detail-navigation.ts` receives the original existing
visibility/query filtered records and uses canonical `occurrencesBetween`,
not a shadow index/store or an alternative event writer. Read-only ICS
`TRANSP:TRANSPARENT` remains visible; hidden snapshots stay excluded from
visual browsing but still participate in independently source-complete
availability/conflicts. Recurrence exclusions and detached original IDs are
unchanged, as are guarded CAS, recovery/checkpoints, privacy and Folio.

## C26 — contextual single-day availability handoff from seven-day workload

The original week/list workload strip previously offered only "Open daily plan".
The existing Find time modal always searched 7–14 days and capped proposals at
18; early days could exhaust the proposals before a learner's chosen date.
Each future day now has a distinct **Find time** action which opens the existing
canonical finder in **This day only** scope, preserving the current view and
unmodified calendar until a suggested original free slot is selected.
The modal now exposes its exact **Search starts** date, previous/next day
navigation, and an explicit **1 / 7 / 14 day** horizon, so users can inspect
another date without closing the finder. Past day actions are disabled and
a selected search date that becomes past is explicitly rejected, never silently
shifted into a different day's booking. Mobile tap targets are at least 44 px.

`src/core/finder-day.ts` only validates the local date/window. The original
`findFreeSlots(calendar.records,...)` still computes against **all** source
records including hidden busy imports and excluding ICS TRANSP:TRANSPARENT;
slot selection re-reads local storage and revalidates original full-source
availability before pre-filling the **existing** EventEditor, which conducts
its conflict/acknowledgement checks and guarded CAS save. No new event
writer, calendar/availability store, external provider action, or Folio sync.

## C27 — month day preview and complete original-event access

The original Month grid showed only three event chips per day, then an inert
"+N more" span. Clicking a date merely changed selected-day state, but the
separate selected-day inspector is hidden below 1000px; later events on busy
mobile dates were effectively inaccessible without switching views by hand.

C27 makes both the **day number** and **+N more · View all** open a dedicated
source-filtered, read-only day preview. It displays original all-day, recurring
(parent exclusions and detached overrides), personal and read-only ICS
occurrences, with full event details available by tapping a canonical instance.
Busy days use the existing `searchOccurrencePage` bounded 20-at-a-time
pagination, not a shadow store or second search/recurrence engine. The sheet
provides explicit **Open Day view** and **New personal event** handoffs using
the original renderer and guarded EventEditor. Desktop gains the same
accessible entry; mobile gains a touch-sized bottom sheet.

The preview never books, edits, copies, or persists any event on its own.
It respects source visibility and query filters, yet hidden imported busy
events still count in the independent source-complete availability and
conflict checks; ICS `TRANSP:TRANSPARENT` remains visible and nonblocking.
Original record IDs, recurrence dates and exclusions, backups/recovery,
privacy, Folio separation, and original CAS writer remain unchanged.

## C28 — previous/next visible agenda commitments across empty windows

In List/Agenda mode, **Only days with commitments** could show no rows for
14/30 days. The period arrows then required multiple repeated taps across
weeks with no events. The older global **Next busy day** jumps into Day mode
and intentionally ignores imported `TRANSP:TRANSPARENT` entries that should
still be shown as read-only visible calendar events.

C28 introduces explicit **Previous events / Next events** within the
original Agenda controls, retaining List mode, range (14/30), the exact
visible source/search filter, and the busy-only choice. A new pure
`adjacentAgendaRange` projection of `occurrencesBetween` scans no
more than 365 calendar days **outside** the currently displayed window,
including multi-day ongoing all-day and timed events and read-only
transparent ICS. Forward hops put the first encountered event at the start
of the new visible range; backward hops place it at the end, so it is
visible without losing the ability to inspect preceding days. Explicit
no-result notice distinguishes an empty bounded search from a globally
empty calendar; it never changes the date on failure.

This is navigation-only: the original personal records, source/UIDs,
recurrence exceptions/detached IDs, view persistence, guarded CAS
writer, backup/recovery, original all-source availability/conflicts,
local privacy and Folio boundary are unchanged. No second store,
external provider action, or implicit event booking.

## C29 — exact-event navigation within the original Day timeline

The graphical Day view has an hours-long scroll. Below 1000px the selected
day inspector is hidden, leaving no direct way to locate a specific late,
overlapping, or recurring appointment in that day's original timeline.
C25 navigates between **details** and C27 previews **month cells**, but
neither jumps the user's Day timeline to a particular saved event.

Day view now includes a compact, source-filtered **Jump to an event** panel
above the original graphical timeline. It uses canonical `dayOccurrences`,
all-day-first and UTC-instance ordering, deterministic original keys, 8-per-page
bounded browsing for busy days, and separate **Locate** (scroll/focus original
timeline event) and **Details** (open original event) actions. All-day entries
offer Details without inventing a timeline hour. Continuations clip their
scroll targets to the current day's real local midnight; autumn DST repeated
hours receive distinct UTC-offset labels and genuinely distinct scroll
positions based on `dayAxis`. Mobile buttons are 46px and the navigator has
its own bounded scroll region so it does not obscure all 24 hours.

`src/core/day-navigator.ts` is a read-only projection, not a shadow store
or alternative occurrence/free-time engine. Visible personal, recurring,
detached, imported read-only and free (TRANSP:TRANSPARENT) events are shown
under existing filters. Hidden imported busy events still count separately
for source-complete availability, reviewed conflicts and guarded CAS.
Event record IDs, original recurrence exceptions, imports, backup/recovery,
local privacy and Folio authority remain untouched.

## C30 — complete day-specific agenda browsing, without the thirty-event cliff

Before C30, List/Agenda's original `Events` renderer silently stopped at
30 occurrences per day and displayed an **inert** `+N more` span. Even
with a 14-/30-day agenda range, users could not open any later instance
from that date without changing views manually. This is distinct from
C27's Month-cell overflow and C29's graphical Day timeline locator.

Every visible date row now offers an **in-place, 12-per-page original-event
list**, accurate per-day counts and Previous/Next page controls. The day
heading and explicit **Open graphical Day view** hand off directly to the
original Day timeline without moving the Agenda window unexpectedly.
Each occurrence remains independently clickable, including personal,
recurring/exception, overnight, multiday and read-only ICS events, with
honest imported/TRANSP/free labels and original overlapping-event alerts.
Days without visible events retain their no-commitments message and
existing new personal event action.

The new `AgendaDay` only calls the existing canonical `dayJumpPage`
(C29) and original `conflictsOnDay`. No shadow store, duplicate
recurrence generator, secondary persistence or event modification exists.
Filters and hidden-source choices affect only this visible projection;
complete-source availability, guarded CAS, source UIDs, recurring parent
exclusions, backups/recovery and Folio boundaries are unchanged.

## C31 — explicit unsaved editor review, cancel safety and reset

The original `EventEditor` immediately discarded in-progress inputs on
**Cancel**, the close X, backdrop taps, and a global Escape shortcut in
`App`. This was easy to trigger on a phone when entering long notes,
moving event times or editing recurring occurrences, with no review.

C31 keeps the original editor state **in memory only** and compares the
editable fields from initial open. Name, date/time (including DST fold),
reminder, recurrence and weekdays, location and notes display a concise
**Unsaved changes** summary. **Reset edits** restores the opened form
without touching any calendar source. Any dirty close via Cancel, X,
backdrop or Escape opens a confirmation with **Keep editing** and
**Discard changes**; unchanged forms close directly. Pure review horizon
and acknowledgement toggles are not considered saved event changes.
An active dirty form also requests a browser leave warning, where supported.

The global Escape handler no longer bypasses the original editor.
No autosave, new schema/storage, shadow writer or automatic changes
were introduced. Save still executes original all-source review and CAS;
record IDs, detached parent exclusions, ICS transparency/source UID,
backups/recovery, privacy and Folio ownership remain unchanged.
Protection lasts until explicit save/discard or browser-confirmed unload,
not across crashes.

## C32 — live Now & next event strip, grounded in original occurrences

Calendar previously offered a selected-date timeline, periodic reminders,
Next busy **day**, C29's selected-Day event navigation and search; it had
no direct live answer for **what is happening now or starting next**, especially
on a phone opening a Month/Week page far from its current hour.

A compact, always-visible **Now & next** strip derives three distinct
groups from the existing source-filtered `occurrencesBetween` projection
against the app's already-running, 30-second-refresh device clock:

- **Happening now:** timed original instances whose real UTC start has
  passed and whose end is strictly in the future, ordered by nearest end.
- **Coming up:** timed original events starting after now plus future
  all-day instances, chronologically across the next 14 local dates.
- **All day today:** active all-day instances, listed separately so they
  never imply a blocking timed appointment or a real-time alarm.

Each group has truthful counts, a bounded three-event preview, and exact
original **Details** and **Day** handoffs. Continuing overnight events,
recurring parent EXDATE/detached identity, imported read-only sources,
`TRANSP:TRANSPARENT` non-blocking labels and search/source visibility
are preserved. Hidden busy imports remain authoritative only for the
independent all-source free/busy and conflict checks. Empty/filtered
states are explicit. It is neither a notification engine nor an account,
task or Folio integration.

The pure `src/core/now-next.ts` adds no source copies, secondary store,
writer, reminder scheduler, navigation persistence, schema or production
network actions. All original save CAS, recoverability and privacy remain
unchanged.

## C33 — searchable and batch-editable imported calendar visibility

Previously the desktop/mobile sidebar displayed only the **first five**
imported source names (`sources.slice(0,5)`). "Manage sources" listed
every import as an unfiltered stack with one-by-one checkboxes; learners
with many source-owned ICS calendars had to scroll through dozens of
records just to find or temporarily isolate a relevant source.

The original **Sources & data** dialog now includes a responsive
**Imported calendar visibility** picker: source-name search, truthful
shown/hidden and match counts, eight sources per page, preserved original
per-source checkboxes/removal controls, plus explicit **Show matching**,
**Hide matching** and (for a nonempty query) **Only matching imports**
actions. These operate on all name matches, not just the visible page.
The sidebar explicitly discloses how many imports are beyond the first
five. Personal event visibility is unaffected by matching/only filters.
The old 80-hidden-name preference schema limit is enforced with an honest
error rather than silently truncating a batch.

`src/core/source-picker.ts` is a pure, validated transformation of the
**existing display preference list**. It preserves dormant source names
in preferences so reimporting the same source retains user choices;
source names are compared exactly and safe with `__proto__` keys.
The existing `visibleCalendarRecords` controls display/search/planning.
The complete original ICS/event array still controls availability and
overlap review, guarded CAS, portable backups/recovery and source identity.
No new store, schema, source write, provider sync, or Folio delegation.


## C34 — durable original event drafts, explicit recovery

The existing C31 unsaved-change review now has a bounded device-only unfinished
event draft. Changes to an original personal event editor are stored in one
separate localStorage sidecar (never in the canonical CalendarState records or
a second calendar writer) when editable fields differ from the initial form.
Notes, names, timezone-fold selections, repeat settings, reminders, and dates
remain recoverable through a reload or interrupted browser session.

On startup, an unfinished draft blocks normal editing until the owner chooses
Review recovered draft, Download draft, or Discard unfinished draft. Reviewing
reopens the original editor with its creation/edit/copy/recurrence-instance/
future-series context. The original source event, recurrence parent and
generated new-ID ownership are checked against live canonical records. A
changed or deleted source prevents unsafe restoration. Unrelated valid source
changes cannot be silently overwritten, and all current calendar records are
rechecked by the original editor when explicitly saving.

There is no automatic commit, backend upload, sync, or second recurring writer.
The same conflict/clock acknowledgement, parent/exception writer, guarded CAS,
previous-version checkpoint, rescue and imported ICS read-only authority apply.
Discard/reset/successful Save conditionally clear only the editor's own saved
draft revision. Another tab's newer draft cannot be silently replaced.
Unreadable draft bytes are preserved until explicit download or discard.
Draft storage is local plaintext, not part of portable saved-event backups.
The browser can delete local storage; export the full saved calendar separately.

Node and desktop/mobile Chromium acceptance cover interrupted mobile creation,
explicit recovery, real detached occurrence recovery, read-only imported source
preservation and stale original edit rejection. Physical devices, native process
death, Safari/Firefox/WebKit and real external provider sync remain unqualified.


## C35 — event-specific IANA time zones and travel-safe timed editing

New timed personal events can explicitly preserve an IANA event time zone
(e.g., Europe/Berlin, Asia/Seoul), while existing v1 records without that
optional field retain their original device-local behavior. The existing
event editor offers a native IANA zone selector and a deliberate policy:
**Keep the same instant** transforms the displayed wall-clock fields while
preserving their UTC instants, or **Keep local clock hours** retains the
entered hour while resolving new physical UTC instants in the destination
zone. Nonexistent hours are rejected, and repeated autumn hours still
require choosing the first or second occurrence. Resolved UTC instants
remain authoritative for collision review, reminders, ICS export and CAS
saving. All-day date-based events do not acquire a false timezone authority.

New explicitly zoned repeating events expand daily/weekly/monthly
occurrences against the authored IANA wall clock instead of silently
adopting a travel device's timezone. Recurrence IDs remain the immutable
original source-local date, even where the event falls on a different
viewer date across the international date line. Source-linked per-instance
editing and future series splits use the original source recurrence dates,
preserving canonical parent, exclusion and detached identity. DST gaps
remain absent and recurring duplicated hours are warned on bounded review.
The existing original-event preview still includes hidden busy ICS
sources and excludes transparent imports from busy/overlap evidence.

Mobile quick scheduling uses the same IANA wall-clock resolver for dated
steps and preserves true instants for physical-minute shifts. A C34
recovered draft retains its chosen timezone and is explicitly reviewed in
the original editor; malformed or stale source revisions cannot be
restored or auto-written. Earlier C34 drafts lacking source-zone metadata
remain backward compatible but cannot be certified as travel-safe.
No additional storage engine, schema version, remote provider authority,
account, migration, or production writes were introduced.

Release limitations: legacy unzoned recurring personal records remain
device-local until deliberately edited/converted; all-day records remain
floating dates; personal/ICS synchronized TZID round-trip, full RFC5545
VTIMEZONE handling, multi-device clock normalization and physical-device
Safari/WebKit/Firefox testing require separate work.


C35 travel-view navigation: Now & next and event-details "Show this day"
use the viewer's actual device-local calendar date for a timed event;
canonical source-local recurrence dates are deliberately unchanged for
splitting, detached overrides, recovery and original ICS identities.


## C36 — IANA VTIMEZONE provenance and guarded ICS refresh

The original ICS importer now examines the enclosing VTIMEZONE declarations,
including STANDARD/DAYLIGHT offsets. Safely recognized IANA TZID sources have
their UTC offsets checked against the browser's IANA rules for each referenced
source event. Contradictory or malformed embedded timezone data cannot produce
a trustworthy complete source replacement; invalid events are skipped and
the existing incomplete-source protection prevents destructive replacement.

The browser's IANA rules still resolve real instants; embedded recurring
VTIMEZONE RRULE transitions are NOT independently executed. The import
review explicitly warns about that limitation rather than claiming arbitrary
historical VTIMEZONE interoperability. Unsupported vendor/Windows timezone
aliases are not guessed or silently remapped.

Imported timed events preserve an optional original IANA sourceTimeZone
field. The user sees that immutable source timezone in event details and
the import review, while canonical UTC starts/ends, imported UID identities,
recurrence overrides, read-only authority, free/busy, original CAS, checkpoints,
and saved-event backups remain unchanged. Meaningful source TZID changes
appear in the existing original-source change review, not a separate index.

Focused original-source tests cover realistic STANDARD/DAYLIGHT ICS,
detached RECURRENCE-ID source preservation through refresh, unsupported
vendor zones, missing embedded definitions, inconsistent offsets and
incomplete source replacement. Genuine Chromium desktop/mobile flows also
exercise source-zone display, read-only source authority, stable source IDs,
and incomplete refresh safety.

Next C37 (proposed): explicitly consented ICS subscription and refresh
provenance, stale-feed safety and user-reviewed updates. C36 adds no remote
polling, providers, accounts, credentials, migrations or background writes.


## C37 — consented read-only ICS subscriptions and deliberate source refresh

Sources & data now supports original read-only HTTPS ICS subscriptions with
explicit consent. The subscription sidecar is a bounded set of up to 12 URL,
source-name, ETag/Last-Modified, last-checked/applied timestamps and up to 8
status-history entries per feed. It is not a second calendar writer or database,
and never contains ICS event bodies. The URL may contain a private access token:
it is saved as local plaintext and is **not included in the event JSON backup**.
A device owner must guard tokenized subscription URLs, especially on shared
devices. Unsubscribe deletes only the device-local subscription metadata;
previously imported read-only snapshots remain unchanged.

Network requests occur only after a separate user-triggered **Check feed**.
They use public HTTPS, no URL credentials, no browser cookie credentials, no
referrer, no HTTP redirects, and browser-enforced CORS. Private IP, loopback,
intranet-style domains and non-HTTPS URLs are refused. Servers must explicitly
allow cross-origin browser GET requests, and exposed ETag/Last-Modified headers
are needed for conditional refresh. No proxy, scheduling or automatic polling
is represented. A request may be cancelled; offline/network/CORS errors do not
edit the original calendar.

A successful 200 reply is read with a 2 MB response limit, parsed using the
original ICS engine (including C36 timezone authority), and staged in the
existing event-level review. Original calendar records change only after
**Apply reviewed changes** through the same existing guarded commit,
checkpoint and imported source merge. A supported 304 from an already applied
feed updates only subscription metadata. Missing local records force a full
new snapshot rather than trusting a stale conditional 304. Source-name changes,
source ownership collisions, unsupported events in destructive replacement,
and stale cross-tab subscription revisions are rejected. Manual update is
non-destructive by default; a complete source replacement still requires
original explicit review/confirmation.

After reload, a subscription remains available for a new manual check without
contacting the URL automatically. A previously downloaded but unapplied
response is not silently restored as a trusted event snapshot; the user must
check again. The canonical event JSON export deliberately excludes tokenized
feed URLs; metadata is separately device-local, so backups remain original
schema v1. Browser CORS restrictions, conditional response headers and
provider compatibility vary; no external provider authenticated sync or
background reliability is implied.

Next C38 (proposed): native read-only integration handoff between original
Calendar, Hub and StudyOS/Folio owners, preserving single-source authority,
reviewable return links, date continuity and opt-in privacy, rather than
duplicating schedulers or grading engines.

## C38 — consented Calendar → Hub read-only file handoff

C38 uses only verified existing owner-app contracts. On inspected Hub main,
/home/calendar/ includes the H10 session-only External calendar read-only
viewer, accepting a user-selected .ics file; there is no certified cross-origin
Calendar connection. Hub clears the session import on privacy masking,
navigation and page reload, treating it as stale after six hours and expired
after 24 hours.

Event details can share the precise original selected occurrence; Sources &
data offers a separate 31-day range. Privacy modes are Busy-only (randomized
UIDs, no names/IDs), Titles plus source identity, and Full details. Imported
ICS source events require explicit opt-in. Review shows actual occurrence
counts, names/dates and original sources before a confirmation checkbox
allows download. The original ICS serialization helpers, recurrence,
UTF-8 line-folding and exclusive all-day DTEND are reused. Titles and details
exports retain original record/occurrence ID and source zone as read-only
X-THIEPN provenance, while event times remain canonical UTC. All files
are rechecked against the current original calendar before download via
the existing CAS-read discipline. Nothing is automatically uploaded or
written to Hub, StudyOS, Folio, providers or a second local store.

After download the user may open Hub's verified native calendar screen and
select the file there. Calendar offers verified owner root links:
https://thiepn.dev/home/calendar/ for Hub,
https://study.thiepn.dev/ for StudyOS,
https://thiepn.dev/folio/ for Folio.

StudyOS currently uses its authenticated Google Calendar workflow and no
verified arbitrary Calendar-file intake. Folio's ICS import writes newly
confirmed Folio-owned time blocks; it is NOT a read-only preview connector.
C38 does not route this file into Folio or StudyOS or claim live sync.
No owner offers a verified per-event Calendar return deep-link contract.
Hub's event viewer is read-only and temporary. No account permission,
cross-origin session or calendar-owner write is implied.

No extra event database, schema migration, OAuth, provider writes, telemetry,
new writer, scheduler or background transport is introduced. All C1–C37,
C34 recovery, C35/C36 zones, C37 subscriptions, original CAS and backups
and owner-app rights remain unchanged.


## C39 — original-source return continuity and actual Hub snapshot limits

C39 extends the existing C38 handoff, not the calendar schema or a second
writer. After an explicit reviewed file download, Calendar retains a bounded
in-memory receipt in the current tab only. It contains the selected original
occurrence keys, source record IDs, original instant/date, chosen privacy tier,
filename and download action time, but does not persist an additional calendar,
ICS content, tokens, URLs or exported private bodies to localStorage,
IndexedDB, backups, service workers or a cross-origin app. The receipt is
cleared on page reload/closing the tab, or through **Clear history**.

The original Sources & data panel can reopen the last handoff and locate an
actual original occurrence. Each source is validated against the current
canonical Calendar v1 record and occurrence engine before navigation; moved
or edited originals are explicitly marked as changed, and removed or
reassigned imported UIDs cannot silently resolve to unrelated content.
Navigating uses Calendar's existing day view and event-details modal, not
an invented remote Hub/StudyOS/Folio per-event deep link. Date/time context
comes from the current viewer's date; source-local instance identity remains
the original reference. Hidden imported calendars do not have their source
rights or source filter preferences silently changed.

C39 inspects Hub H10's real existing session-only parser. It parses up to
120 source events after processing, and its current agenda renders at most
60 events in a seven-day window using Hub's selected timezone. The handoff
review now estimates this device's seven-day visibility explicitly, warns
that Hub's selected timezone and filters may differ, and prevents files
above Hub's 120 parsed-event ceiling or source UIDs exceeding Hub's
240-codepoint normalization limit instead of silently claiming all events
will survive. Busy-only privacy remains intentionally unlinkable in the
downloaded file, with random UIDs and no titles/provenance in the bytes;
Calendar's local ephemeral receipt can still locate the original event.
UTC instants, imported named IANA zones, daylight-saving detached instances
and all-day exclusive ends remain handled by the existing canonical
occurrence and ICS writer.

Imported source status now differentiates a manual ICS snapshot with unknown
upstream freshness from a locally applied C37 subscription. Only actual
lastAppliedAt can be presented as a local provenance timestamp, with clear
stale (>7 days) or failed-check warnings. A successful HTTP 304 does not
prove that upstream event data is current. C39 adds no background scheduler,
owner credential transfer, direct provider access, extra authenticated
source, telemetry or API.

Hub's H10 imported read-only file viewer requires the user to select their
downloaded file in Hub, is stale after six hours and expires after 24 hours
in that tab; a Calendar download does not confirm import to Hub. There is
still no verified cross-origin per-event return URL or StudyOS/Folio direct
read-only receiver. Physical devices, Firefox/WebKit/Safari, a deployed Hub
end-to-end file upload, and real provider account journeys remain separately
unqualified.

C40 proposal: source-backed intra-Calendar review of large recurring
source calendars and genuine Hub handoff edge cases without duplicating any
calendar store or engine; prioritize actual UX improvements over an audit-
only phase.


## C40 — original Series & Source Trail (implementation-first)

Open **Browse source trail** from an original recurring personal event, an
edited detached occurrence or an imported ICS event, or open **Browse events**
for a named imported calendar in Sources & data. The new bounded, paged trail
shows original events for 30 or 90 days, offers next/previous date-window
navigation, and opens any shown occurrence in the original Calendar event
details with no copying. Every selection re-reads canonical local state and
rechecks original record ID, UTC start/end, source calendar, original imported
UID/sourceKey and occurrence title before opening; a stale or renamed import
fails closed instead of navigating by coincidental title. The source picker
remains the only owner of display visibility; intentionally opening a hidden
source for explicit inspection does not unhide it or remove its busy time.

Personal series trails reuse original C1–C39 occurrence expansion, preserving
IANA-zone and DST day ownership. The series includes detached edited instances
linked by recurrenceParentId, reveals their original recurrenceDate, and
represents genuinely excluded dates without treating them as scheduled events.
Excluded dates with a replacement are not misreported as deletions; no new
recurrence engine or new detached record is created. Imported source trails
preserve exact sourceCalendar/UID identity, imported sourceTimeZone and
TRANSP:TRANSPARENT context. Up to 1,000 timeline entries are displayed using
pagination of at most 30 original entries per page, with safe clamping when
the current range changes. Dates and intervals are bounded and verified by
the original calendar and storage validators.

This is deliberately different from the global agenda, existing C30
pagination, C32 ±30-day nearest-event browsing and C33 visibility-only
source picker. It is a dedicated owner-specific, navigable recurrence and
import-provenance trail, not a calendar clone, external deep link, provider
write, new database, scheduler, index or grading engine. The standalone
localStorage calendar remains canonical, with unchanged JSON backup/CAS,
C34 recovered drafts, C35/C36 IANA/TZID behavior, C37 subscriptions,
C38/C39 Hub handoff and Folio/StudyOS/Hub authority. Imported records remain
read-only, even when inspected from a hidden source. The new trail keeps
desktop/mobile readable text and no ornamental helper microcopy.


## C41 — Source-authentic Compare Days

C41 adds an explicit **Compare days** action to the existing List/Agenda
toolbar, and **Compare this day** in the native event-details view. Choose
two device-local calendar dates, swap them or advance the second day one week.
The comparison renders two independent, paged original occurrence columns
using the existing C19/C30 day-navigator, original dayOccurrences, conflict
detection and sevenDayWorkload UTC timed-union authority. The comparison
shows each day's real event count, imported/all-day counts, timed occupied
minutes, overlap warnings and per-source counts. For high-density dates,
paging is independent (12 original events per column).

**Also on other day** uses only actual canonical owner identity. Personal
recurring detached replacements inherit their original recurrenceParentId;
spanning all-day items retain the same source record; unrelated imported
events with similar titles are never matched as if they were the same
provider event. Imported ICS remains read-only and TRANSP:TRANSPARENT
entries stay visible but do not count as busy minutes. Existing device-local
DST/day boundaries, canonical UTC times, all-day endDateExclusive,
C35/C36 IANA/TZID and all original source IDs remain authoritative.

The compare dialog uses the *existing currently visible* Calendar filter,
search and hidden imported-source preferences. This display comparison
does not relax hidden-source rules or reinterpret free/busy: Find time and
actual guarded saves continue to check all saved original sources. Press
an event to open native Calendar event details; the handler re-reads the
actual original source, current filter and canonical UTC occurrence at
interaction time, failing closed if another tab changed the calendar or
if the original UID/source ownership differs. **Return to day comparison**
restores the previous dates, without a new datastore, writes, tasks,
provider sync, remote deep-link or calendar engine.

Unlike C30 daily paging, C32 neighboring event navigation, C40 single
series/source trail and earlier seven-day workload summaries, C41 compares
the content of **two independently selected calendar days**, with
source-authentic cross-day identity, overlap context and direct original
record navigation for dense schedules. Original C1–C40 behavior, CAS,
backups/checkpoints, recovered drafts, C37 consented subscriptions and
C38/C39 Hub read-only handoff remain unchanged.


## C42 — Original saved-calendar Overlap Inbox

C42 adds **Review overlaps** to the main List/Agenda and event-details
views. This is not the existing event editor's draft collision preview,
another free-slot scheduler or a copied calendar. The inbox looks at the
actual original saved calendar source over an explicitly chosen 7-, 14-
or 30-day window. It materializes the canonical personal/ICS recurrences,
then identifies real pairwise intersections of UTC timed intervals without
double-counting a pair that crosses a midnight boundary. Events marked
TRANSP:TRANSPARENT are visible in Calendar but are not treated as busy
timed conflicts. All-day occurrences are separately counted, not
mistaken for a finite timed collision.

Unlike visible-source-only List and C41 day comparison, the Overlap Inbox
always includes **every original stored commitment** in its collision
authority, including imported sources that the user has hidden from
normal calendar views. Hidden imported event titles and source names
are not rendered until a deliberate **Reveal hidden imported source
details** toggle is selected inside the review. Navigation to a hidden
imported event is disabled until those details are revealed. Revealing
does not modify the source-visibility preference or saved event data.

The review displays original event/series, imported provenance and
IANA source timezone where applicable, with an explicit pairwise UTC
overlap window and bounded paging (up to 12 pairs at once and 1,000
pairs per window). For each appointment, **Inspect original** returns
to the existing native details view, or **Adjust personal time** opens
the original C19+ guarded single-occurrence time-adjustment workflow;
imported ICS appointments remain read-only. Every action re-reads the
canonical local store and verifies the exact original provider UID,
record ID, occurrence key, title and UTC start/end, rejecting stale
cross-tab states. No proposal is saved automatically, and original
C34 drafts, C35/C36 UTC/IANA/DST, C37 subscription rights, C38–C39
read-only Hub handoff, C40 trail, C41 comparison and guarded CAS/backups
remain untouched.

C43 priority: evaluate executable C42 acceptance results first; then
implement a genuinely distinct calendar usability workflow, not a
duplicated overlap inbox or a release-qualification-only phase.
