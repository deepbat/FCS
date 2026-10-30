# FCS Attendance

Mobile-first attendance and overtime PWA for FCS.

## 1. System of record

- **Frontend:** GitHub Pages PWA (`deepbat/FCS`)
- **Database/auth:** Supabase Postgres + RLS + Supabase Auth for Admin
- **Gate:** publishable Supabase key with restricted anonymous access; no gate login
- **Offline:** raw gate entries are queued in browser localStorage and retried automatically
- **Calculation authority:** `public.calculate_attendance()`
- **Save authority:** `save_gate_attendance()` and `save_admin_attendance()`; timing + attendance are saved atomically
- Browser calculations are display helpers only. **Supabase is the source of truth for OT/UT/SL/status.**

## 2. Employees and normal schedules

| Code | Employee | Category | Normal schedule / rule |
|---|---|---|---|
| 001 | Deepak Batra | Staff | 9:00am–5:45pm, 45m break, no OT |
| 002 | Anita Pal | Staff | 9:00am–5:45pm, 45m break, no OT |
| 003 | Harjit Singh | Staff | 9:00am–5:45pm, 45m break, no OT |
| 004 | Gautam | Gateman | 9:00am reference; OT eligible; special UT rule |
| 005 | Sabi | Driver | 9:00am–5:45pm, 45m break; OT eligible |
| 006 | Umesh | Gardener | 8:30am–5:10pm, 40m break; no OT |
| 007 | Varinder Pal | Gateman | Split shift; 480m duty; 30m rounding; no break |
| 008 | Barkha | Gateman | 495m elapsed full day = 480m duty + 15m break |
| 009 | Rajan | Gateman | 8:00am normal reference; night-duty/source OT is manual where required |
| 010 | Pemba Tamang | Gateman | 8:00pm–4:00am normal night duty (8h, no break); 4:00am–9:00am scheduled OT window when applicable |
| 011 | Ajay Kumar | Driver | 8:20am–5:00pm, 520m duty, 40m break; OT eligible |
| 012 | Satpal Singh | Driver | 9:00am–5:45pm, 45m break; OT eligible |

Employee-specific settings override category defaults. Category rules are maintained by Admin in Supabase.

## 3. UT, late arrival, SL and Half Day

**UT (early arrival)** is based on the applicable employee/category start rule:

- Gautam: 9:00am is the normal reference, but early-call duty starts at 7:30am. Arrival before 7:30am still gets the applicable 90m UT, not extra UT. Example 8:20am = 40m UT.
- Gateman: before 8:40am, established 30-minute UT rule applies.
- Driver: before 8:40am, UT is calculated to the 9:00am reference.
- Gardener: normal start is 8:30am.

**SL (Short Leave):**

- Maximum SL is **2 hours**.
- Normal late-arrival start is the employee's configured start; normally 9:00am, Gardener 8:30am, Rajan 8:00am, and Vakil Mehto 9:30am where that special rule applies.
- If late by **more than 2 hours**, **SL = 0 and attendance = Half Day**. Half Day is the deduction; it must never be combined with 2h SL.
- For a normal 9:00am start, Half Day cutoff is **1:00pm**.
- For an OT-eligible employee arriving more than 2h late but before the cutoff, time from actual IN to the cutoff is OT, subject to the normal 15m OT threshold.
- Example: Satpal IN 12:23pm → Half Day, SL 0, 12:23pm–1:00pm = **37m OT**. 1:00pm–1:45pm is his break; his second working period starts at **1:45pm**.
- At exactly 2h late: SL can be 2h. At 2h 1m late: Half Day applies.
- Evening/night-duty IN does not become morning SL.
- Manual SL overrides take precedence.

## 4. OT

- **OT eligible:** Gatemen and Drivers.
- **No automatic OT:** Staff and Gardener.
- Normal-day extra time: **15m or less = 0 OT; 16m+ = actual extra minutes.**
- Normal OT end is the configured employee/category end time: normally 5:45pm; Ajay Kumar 5:00pm.
- Sunday/holiday: eligible Gatemen/Drivers receive the full elapsed duty time as OT, with no normal break deduction. Varinder's own 30m rounding remains separate.
- Manual OT overrides are preserved until a timing edit clears them; after a timing edit, explicitly re-enter any required manual exception.

## 5. Special employees

### Gautam
- Normal late reference: 9:00am.
- Early UT: before 7:30am → 90m; 7:30am–9:00am → UT up to 9:00am.
- Late arrival after 9:00am produces SL until the 2h limit; beyond 2h → Half Day.

### Varinder Pal — split shift
- First shift: recorded evening IN → **1:00am**.
- Second shift: **6:00am** → recorded final OUT.
- No break deduction; normal duty 480m; round down to 30m blocks.
- Generic split-shift employees use their recorded second IN/OUT fields.

### Barkha
- Full day = **480m duty + 15m break = 495m elapsed**.

### Ajay Kumar
- Normal start 8:20am, end 5:00pm, 520m duty, 40m break.
- Late arrival is measured from 8:20am; OT reference end is 5:00pm.

### Rajan / Pemba Tamang night duty
- Overnight physical-register values may be source/manual values.
- Evening IN (18:00 or later) is not treated as morning late arrival.
- Pemba's normal night shift is 8:00pm–4:00am (8 hours, no break). The scheduled OT window is 4:00am–9:00am when applicable. More than 8 hours of elapsed duty marks the attendance Present; early arrival before 8:00pm does not create extra OT and time after 9:00am is not automatic OT.
- Where the physical register is authoritative, use explicit OT override rather than inventing OT from an overnight clock difference.
- An OUT earlier than IN is allowed for overnight duty and is calculated across midnight.

## 6. Attendance statuses

Supported: **Present, Absent, Leave, Half Day, First Half Leave, Second Half Leave, Full Day Leave, Holiday, Sunday.**

Half Day from >2h lateness is automatic unless an explicit Admin status/override is intentionally applied. Staff half-day/leave rules remain based on configured Staff timings.

## 7. Gate and Admin workflow

**Gate:** select date → employee → IN/OUT (and second shift when required) → Save. The raw entry is retained locally before network sync. Offline/failed entries stay queued and retry automatically.

If Admin has already corrected the same employee/date, the older queued gate entry is **stale**: the server record wins, the queued entry is acknowledged/removed, and the gate user is not asked to resolve a conflict. Identical retries are idempotent. A gate entry never overwrites an existing server record.

**Admin:** authenticated users can view/edit the register, timings, UT/SL/OT, remarks, employee/category rules and holidays; save/delete entries; print; and export Excel.

## 8. Manual overrides

Stored fields:

- `ut_override_minutes`
- `sl_override_minutes`
- `ot_override_minutes`

An override replaces the calculated value. Editing IN/OUT clears UT/SL/OT overrides for that row and recalculates, preventing stale payroll values. Re-enter a manual override afterward when an exception is intended.

## 9. Calculation and data integrity

`calculate_attendance()` is the single calculation engine for UT, SL, OT, elapsed/worked minutes, break, normal work, OT eligibility/threshold, rounding, split shifts, midnight crossing and Sunday/holiday OT. The `daily_records` trigger uses the same calculator; explicit overrides are applied afterward.

Database protections include employee/date uniqueness, foreign keys, RLS, restricted anonymous writes, no anonymous OT/UT/SL override injection, fixed-search-path server functions, atomic gate/Admin saves, and offline retry. Never weaken RLS to solve a UI problem.

## 10. Holidays and reports

Holidays are stored in `public.holidays`; Admin manages them. Current known holiday: **02/10/2026 — Gandhi Jayanti**.

Attendance Register shows Date, IN, UT, OUT, SL, OT, Attendance and Remarks, with person totals and synchronized grand totals. Excel has one worksheet per active employee with person TOTAL rows. Export is blocked while changes are unsaved. Print is A4-oriented.

## 11. Historical data policy

Do **not** automatically rewrite historical payroll data because a newer formula differs. September contains source-register/manual values, especially night-duty OT and some Sunday values, that must be preserved unless explicitly corrected.

Known incomplete records:

- Sabi — 11/09/2026 — IN 8:58am, OUT missing
- Rajan — 22/09/2026 — IN 7:48am, OUT missing

Incomplete records are not complete working days.

## 12. Security, backups and development

- Never expose a Supabase secret/service-role key in the browser.
- Admin operations require Supabase Auth; gate uses restricted publishable-key access.
- Preserve existing backups.
- Before structural or historical changes: verify backup → inspect affected rows → test expected results independently → migrate → verify.
- Never truncate/reset production or change historical payroll merely to make a test pass.
- Production migration history exists in Supabase; do not recreate missing historical SQL by guessing.

## 13. Minimum calculation tests

Any calculation change must independently test: normal day, early/late arrival, early departure, 15m and 16m OT boundaries, Sunday, holiday, Gateman, Driver, Staff, Gardener, Gautam, Barkha, Varinder split shift, Ajay Kumar, overnight OUT, evening/night IN, missing OUT, manual overrides, rapid edits, Excel totals and print totals.

**Safe rule: Inspect → test → migrate → verify → commit.**


## Admin interface improvements (30/10/2026)

- Expected shift information appears beneath employee name in register view.
- All Staff Day View displays active employees and attendance metrics for a selected date.
- Missing / Incomplete finder checks past dates for missing records, missing OUT, blank status, and timings without status.
- Monthly Summary includes OT, UT, SL, Net OT, and a grand total.
- Save Changes asks for review of changed attendance rows and old/new UT, SL, and OT values.
- Admin register time inputs display in 12-hour style while normalizing values to existing stored 24-hour format.
- Mobile cards and future dates have improved visual handling.
- Admin theme color now matches app styling and manifest.

These are interface-level changes. Existing Supabase tables, data, calculations, and attendance rules remain unchanged.
