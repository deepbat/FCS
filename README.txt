FCS ATTENDANCE
Rules and Operating Reference
Updated: 01/10/2026

1. PURPOSE
FCS Attendance records daily timings from the gate register and maintains attendance, UT, SL and OT records.

2. DAILY ENTRY
- Attendance is maintained date-wise for all active employees.
- Gateman records timings from the physical gate register.
- Admin can review and edit daily records.
- Date can be selected first, so previous-day timings can be entered later.
- Time is displayed in formats such as 9:05am and 7:20pm.
- A complete working-day timing normally marks Present unless another attendance status applies.
- One Save Changes button saves attendance, employee and category-rule changes.
- Existing attendance data must not be deleted, reset or migrated during normal maintenance.

3. NORMAL TIMINGS
Staff
- 9:00am to 5:45pm
- 45-minute break
- 8 hours 45 minutes duty span
- No OT

Driver
- 9:00am to 5:45pm
- 45-minute break
- OT eligible

Gardener
- 8:30am to 5:10pm
- 40-minute break
- 8 hours 40 minutes duty span
- No OT

Gateman
- OT eligible
- Current normal target: 525 minutes
- Normal timing and break are configurable in Settings

Barkha
- 8-hour duty
- 15-minute break
- Full-day duty span: 8 hours 15 minutes

4. OVERTIME (OT)
- OT applies only to OT-eligible employees, currently Driver and Gateman.
- Up to 15 minutes extra time does not count as OT.
- More than 15 minutes extra time gives actual extra time as OT.
- 9:00am to 6:00pm = 0 OT.
- 9:00am to 6:01pm = 16 minutes OT.
- 9:00am to 7:01pm = 1 hour 16 minutes OT.
- Staff and Gardener always have 0 OT.

5. UNDER TIME (UT)
- UT applies to OT-eligible employees when they are called early for office work.
- Normal start reference is 9:00am.
- Driver/Gateman IN before 8:40am is treated as an early-call situation.
- Example: 7:30am IN = 1 hour 30 minutes UT.
- IN at 8:40am or later gives no early-call UT.
- Sunday and holiday duty never receives UT.
- Gautam has a specific rule: UT is capped at 1 hour 30 minutes.
- Gautam arrival before 7:30am still receives 1 hour 30 minutes UT.
- Gautam arrivals at or after 9:00am can create SL according to current calculation.

6. SUNDAY AND HOLIDAY
- Sunday is automatically identified.
- Holidays are maintained under Admin > Holidays.
- Driver and Gateman working on Sunday or an entered holiday receive full elapsed duty time as OT.
- No break is deducted for Sunday/holiday OT.
- Future dates are not treated as Absent automatically.

7. SPLIT SHIFT / SPECIAL TIMING
Varinder Pal
- Evening: approximately 6:00pm to 1:00am.
- Morning: approximately 6:00am to 7:00am.
- Normal total duty: 8 hours.
- No break deduction.
- Time is rounded to 30-minute intervals.
- Both periods are recorded in daily record.

Pemba Tamang
- Sunday night duty has a special 8:00pm to 9:00am calculation.
- Early arrival before 8:00pm does not create extra OT.
- Time after 9:00am is voluntary.
- Sunday night duty does not receive UT.

Other split-shift employees
- Use IN 2 and OUT 2 where configured.

8. LEAVE AND ATTENDANCE
Available statuses:
- Present
- Absent
- Leave
- Half Day
- First Half Leave
- Second Half Leave
- Full Day Leave
- Sunday
- Holiday

Staff half-day suggestions:
- IN by 9:30am and OUT by 1:15pm -> Second Half Leave.
- IN from 1:45pm and OUT from 5:15pm -> First Half Leave.
- IN by 9:30am and OUT from 5:15pm -> Present.
- Other combinations require manual attendance selection.

Admin may mark attendance without timings, for example Present during official tour or Leave.

9. MOBILE / GATEMAN SYNC
- Gateman app can save entries locally when internet is unavailable.
- Pending entries retry automatically when internet becomes available.
- Do not clear browser data or app storage while entries are pending.
- Sync conflicts are not silently treated as successful.
- “Synced” means pending local entries have been uploaded successfully.

10. REPORTS
Monthly Attendance Summary
- Shows attendance counts.
- Shows active employees.
- Does not show Worked Hours or OT.
- Future dates are not treated as Absent.

OT / UT Report
- Restricted to OT-eligible employees.
- Shows date-wise IN, OUT, IN 2, OUT 2, OT and UT where applicable.
- Person-wise totals only. No grand total.
- Printed report is arranged one employee per page.
- Excel export creates one worksheet/tab per employee.
- Export must be done after saving changes.
- Dates use dd/mm/yyyy format.

11. DATA SAFETY
- Do not delete or reset existing attendance data.
- Do not migrate attendance data to another database.
- Do not replace Supabase or rebuild database as part of normal UI/rules changes.
- Calculation changes must be tested against existing records before release.

12. ADMIN AREAS
- Attendance: daily register and monthly summary.
- Employees: employee list and employee-specific timing settings.
- Holidays: holiday dates.
- Settings: category start, end, normal minutes, break, OT eligibility and OT threshold.
- Rules / README: this reference.

If any operating rule is changed, update this file and the Admin Rules / README page at the same time.
