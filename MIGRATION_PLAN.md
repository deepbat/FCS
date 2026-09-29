# Migration plan

## Audit completed 29/09/2026

Current repository: `deepBat/FCS`
Current Supabase project: `raesuqidwkcpylvqiftf`

### Current database snapshot

- Employees: 12
- Daily records: 269
- Attendance records: 243
- Holidays: 1
- Category rules: 4
- Duplicate daily-record keys: 0
- Duplicate attendance keys: 0
- Daily records without a matching attendance row: 45
- Attendance rows without a matching daily record: 19
- Unified migration rows expected: 288
- Split-shift rows: 28
- UT overrides: 1
- SL overrides: 9
- OT overrides: 43

There are also historical backup tables containing earlier snapshots. They are retained and are not used by the new system.

## Important current-rule findings

The current database trigger confirms these existing special rules:

- Gautam: IN from 7:30am up to 9:00am gets minute-for-minute UT from 9:00am.
- Other Gatemen: IN before 8:40am gets UT rounded down to 30-minute blocks.
- Drivers: IN before 8:40am gets minute-for-minute UT.
- Sunday/holiday eligible duty is full elapsed OT with no break deduction.
- Varinder Pal is split-shift with 30-minute rounding.
- Explicit UT/SL/OT overrides are stored separately.

Ajay Kumar already has an employee-specific normal start of 8:20am and 40-minute break in current employee data. New browser calculations use 8:20am start and 5:00pm finish for Ajay.

## Migration design

1. Create one Google Sheet as permanent store.
2. Migration copies current Supabase source tables into read-only legacy tabs.
3. Build one unified `Attendance` tab keyed by `date|employee_code`.
4. Merge timing data from `daily_records` and status data from `attendance`.
5. Keep all legacy IDs, overrides and existing OT/UT/SL values.
6. Do not create Absent for blank normal dates.
7. New edits calculate immediately in browser.
8. Save sends only changed rows to Google Sheets.
9. A server lock prevents simultaneous writes from producing duplicate rows.
10. Supabase remains unchanged throughout migration.
11. Verification compares employee count, row counts, dates, statuses, times, OT/UT/SL totals and special records before any cutover.

## Cutover

Do not replace current `main` branch or stop Supabase until:

- September 2026 register visually matches current records.
- Person-wise OT/UT/SL totals match.
- Leave/status records match.
- Satpal, Rajan, Pemba Tamang, Ajay Kumar and Varinder Pal have been manually checked.
- Editing a time immediately changes calculated values.
- Save/reload preserves values.
- Excel export creates one worksheet per employee.
- Phone offline entry survives refresh and later syncs.
- Print output is correct.

Only after these checks should the new branch replace the current deployed application.
