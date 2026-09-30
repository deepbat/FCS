# FCS Attendance

Mobile-first attendance and overtime PWA for FCS.

## Production architecture

- Front end: static PWA hosted from GitHub Pages
- Repository: `deepbat/FCS`
- Backend: Supabase Postgres + Row Level Security
- Admin authentication: Supabase Auth
- Gate device: publishable Supabase key + restricted anonymous database access
- Offline gate queue: browser localStorage
- Authoritative attendance calculation: Supabase `calculate_attendance()`
- Authoritative saves: server-side `save_gate_attendance()` and `save_admin_attendance()`

The browser must not be treated as the source of truth for calculated OT/UT/SL.

## Employees and working rules

| Code | Employee | Category | Normal rule |
|---|---|---|---|
| 001 | Deepak Batra | Staff | 9am–5:45pm, 45m break, no OT |
| 002 | Anita Pal | Staff | 9am–5:45pm, 45m break, no OT |
| 003 | Harjit Singh | Staff | 9am–5:45pm, 45m break, no OT |
| 004 | Gautam | Gateman | 9am normal reference, OT eligible; special early-arrival rule |
| 005 | Sabi | Driver | 9am–5:45pm, 45m break, OT eligible |
| 006 | Umesh | Gardener | 8:30am–5:10pm, 40m break, no OT |
| 007 | Varinder Pal | Gateman | Split shift, 480m duty, 30m rounding |
| 008 | Barkha | Gateman | 495m elapsed requirement including 15m break |
| 009 | Rajan | Gateman | 480m normal duty; night-duty OT is recorded manually |
| 010 | Pemba Tamang | Gateman | 480m normal duty; night-duty OT is recorded manually |
| 011 | Ajay Kumar | Driver | 8:20am–5:00pm, 520m duty, 40m break; OT eligible |
| 012 | Satpal Singh | Driver | 9am–5:45pm, 45m break, OT eligible |

Category rules are stored in Supabase and can be edited by Admin. Employee-specific values are stored on the employee record.

## OT

- OT eligible: Gatemen and Drivers.
- Staff and Gardener do not receive automatic OT.
- On a normal day, up to and including 15 extra minutes gives 0 OT.
- 16 or more extra minutes gives the actual extra minutes.
- Sundays and holidays: eligible Gatemen/Drivers receive the full elapsed duty time as OT, without normal break deduction.
- Sunday/holiday elapsed time is not globally rounded. Varinder's own 30-minute rounding rule remains separate.

### Night duty

Some employees have overnight duties recorded in the physical register.

For an evening/night start (18:00 or later):

- UT and SL are not calculated as ordinary morning late-arrival/leave.
- Ordinary 9am–5:45pm OT calculation is not applied.
- Where OT comes from the physical register, it is entered as an explicit OT override.
- Existing manual OT overrides are preserved when IN/OUT is edited.
- This prevents an evening IN such as 7:50pm from being interpreted as hundreds of minutes of short leave or phantom OT.

Rajan and Pemba's September source-register OT values are therefore treated as manual source values, not reconstructed from their overnight clock times.

Satpal and other employees whose shift starts in the morning can still have an OUT after midnight; their elapsed duration is calculated across midnight normally.

## UT

UT is calculated from the employee's applicable morning start rule.

Known rules:

- Gautam: official duty start is 7:30am. Voluntary arrival before 7:30am does not create additional UT. At 8:20am, UT is 40m.
- Gatemen: early arrival before 8:40am follows the established 30-minute UT rule.
- Drivers: early arrival before 8:40am follows the established UT rule.
- Gardener: normal start is 8:30am.

## SL

SL is calculated separately from UT.

- Gardener late arrival is measured against 8:30am.
- Other normal employees are measured against 9am.
- Gautam follows his specific 7:30am duty rule.
- Evening/night-duty entries do not receive morning SL merely because their IN time is after 6pm.
- Manual SL overrides are preserved.

## Barkha

Barkha's full-day requirement is:

- 8 hours duty
- 15 minutes break
- 495 minutes elapsed

## Varinder Pal split shift

Varinder is a split-shift Gateman.

- First shift starts from the recorded evening IN.
- First shift ends at 1:00am.
- Second shift starts at 6:00am.
- Final OUT is the recorded morning OUT.
- No break deduction.
- 480m normal duty.
- 30-minute rounding.
- Sunday/holiday rules still apply.

The database calculation engine handles midnight crossing and both shifts.

## Attendance statuses

Supported statuses include:

- Present
- Absent
- Leave
- Half Day
- First Half Leave
- Second Half Leave
- Full Day Leave
- Holiday
- Sunday

Staff automatic half-day detection follows the established Staff rule and remains aligned with configured Staff start/end times.

## Gate workflow

1. Select date.
2. Select employee.
3. Enter IN and OUT.
4. Enter second-shift timings when required.
5. Press Save.
6. The raw entry is immediately retained on the phone.
7. When online, the server-side save writes the timing and attendance together.
8. If the network is unavailable, the entry remains in the offline queue.
9. Failed entries remain pending and are retried.
10. A server conflict is not silently overwritten; it remains for Admin review.

The gate does not display previous attendance records.

## Admin workflow

Admin uses Supabase Auth.

Admin can:

- view the monthly register
- edit timings
- edit UT/SL/OT
- apply manual overrides
- edit employee settings
- edit category rules
- maintain holidays
- save changes
- delete an entry explicitly
- print
- export Excel
- view monthly summary

Unsaved changes are protected against accidental month changes and browser navigation.

## Manual overrides

UT, SL and OT overrides are explicit values stored in:

- `ut_override_minutes`
- `sl_override_minutes`
- `ot_override_minutes`

When an override exists, it takes precedence over the calculated value.

Changing IN/OUT clears the existing UT/SL/OT overrides for that row and recalculates them from the new timings. This prevents stale payroll values from surviving a timing change. If an exception is required, re-enter the manual UT/SL/OT override explicitly after changing the timing.

This is important for source-register values such as Rajan and Pemba night-duty OT.

## Calculation architecture

There is one authoritative calculation function:

`public.calculate_attendance()`

It calculates:

- UT
- SL
- OT
- elapsed time
- worked time
- break
- normal working minutes
- OT eligibility
- OT threshold
- rounding
- Sunday/holiday full-day OT

The `daily_records` trigger invokes the same calculator whenever a record is written.

Manual overrides are applied after calculation.

## Atomic saves

Gate and Admin now use server-side save functions:

- `save_gate_attendance()`
- `save_admin_attendance()`

Each save writes the timing record and attendance record within one database transaction.

This removes the previous client-side two-step write problem where one table could succeed while the second failed.

## Holiday handling

Holiday data is stored in `public.holidays`.

Current holiday:

- 02/10/2026 — Gandhi Jayanti

The gate can read the holiday calendar, while only authenticated Admin users can manage holidays.

Holiday detection is also performed server-side by the authoritative calculator/save functions.

## Reports

### Attendance Register

Shows:

- Date
- IN
- UT
- OUT
- SL
- OT
- Attendance

Person-wise totals are shown.

The register also maintains an overall Grand Total and keeps it synchronized with the actual displayed rows.

### Excel

Excel export contains:

- one worksheet per active employee
- person-wise TOTAL row
- no unnecessary overall Grand Total worksheet

Export is blocked while there are unsaved changes.

Grand totals are recalculated from the same draft rows used for the employee totals rather than maintained as a fragile incremental cache.

### Printing

The register has print-specific formatting for A4 output and hides editing controls.

## Data integrity

Important database protections include:

- unique employee/date records
- employee foreign keys
- RLS
- restricted anonymous writes
- anonymous gate writes cannot supply OT/UT/SL overrides
- server-side calculation
- server-side atomic saves
- offline retry instead of silent loss
- conflict detection for queued gate entries

Existing backup data is retained.

## Historical data policy

Historical attendance is not automatically rewritten merely because a newer formula produces a different result.

The September data contains some source-register/manual values that intentionally differ from a pure clock-time calculation, especially night-duty OT and some Sunday values.

These values must be treated as historical source data unless an explicit correction is made.

Known incomplete historical records requiring manual repair:

- Sabi — 11/09/2026 — IN 8:58am, OUT missing
- Rajan — 22/09/2026 — IN 7:48am, OUT missing

An incomplete record is not treated as a complete working day.

## Security

- Never place a Supabase secret/service-role key in the browser.
- The repository uses the Supabase publishable key.
- Admin operations require Supabase Auth.
- Gate database access is restricted by RLS and dedicated server-side functions.
- Anonymous clients cannot supply OT/UT/SL overrides.
- Server-side functions use a fixed search path.
- Do not weaken RLS to solve a UI problem.

## Offline behaviour

The gate stores raw timings locally before attempting network synchronization.

Pending entries:

- retain their client ID
- are retried automatically
- are not silently discarded
- are not allowed to overwrite a different server entry for the same employee/date

Do not clear browser storage while entries are pending.

## Database migrations

Production currently contains a migration history in Supabase.

The four hardening migrations applied during this reliability pass are recorded in the Supabase production migration history. The repository still does not contain the complete historical SQL for the earlier production migrations. It should not be reconstructed by guessing. A proper baseline can be captured from the live project with Supabase's migration/schema pull workflow before attempting a fresh-project rebuild.

## Backups and recovery

Before any future structural or historical-data change:

1. verify the latest database backup
2. inspect affected rows
3. test the change against the calculation function
4. use a migration for schema/function/policy changes
5. never truncate or reset the production database

## Testing requirements

Any change to attendance calculations must test at least:

- normal full day
- early arrival
- late arrival
- early departure
- 15m OT boundary
- 16m OT boundary
- Sunday
- holiday
- Gateman
- Driver
- Staff
- Gardener
- Barkha
- Gautam
- Varinder split shift
- overnight OUT after midnight
- evening/night IN
- missing OUT
- manual overrides
- rapid edits
- Excel totals
- print totals

The production calculator must not be tested only against itself. Expected results should be independently derived for important boundary cases.

## Known limitations

- The gate is intentionally simple and does not require a user login.
- Night-duty OT from the physical source register is represented through explicit manual OT overrides rather than inferred from the ordinary daytime OT formula.
- Employee-specific schedules are authoritative where configured. Ajay Kumar is 8:20am–5:00pm with 520m duty and 40m break; his late arrival is minute-for-minute SL from 8:20am and his OT reference end is 5:00pm.
- The repository's complete historical Supabase migration SQL has not yet been reconstructed; do not attempt to manufacture it from migration names alone.
- Historical source-register discrepancies are preserved rather than silently rewritten.

## Safe development rule

For future changes:

**Inspect → test → migrate → verify → commit.**

Do not patch production attendance data simply to make a test pass.
