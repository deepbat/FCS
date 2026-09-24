# FCS Attendance PWA

Mobile-first attendance and overtime PWA for FCS.

## Stack
- Static PWA hosted from GitHub Pages
- Supabase Postgres + Row Level Security
- Supabase Auth for Admin
- IndexedDB for offline pending entries

## Employee rules
- Staff: 9am to 5:45pm, 45 minute break, no OT
- Driver: 9am to 5:45pm, 45 minute break, OT after more than 15 minutes
- Gardener: 8:30am to 5:10pm, 40 minute break, no OT
- Gateman: configurable flexible timing, OT eligible

OT is actual extra time. 15 minutes or less is zero OT.

## First setup
1. Open the site.
2. Tap Admin.
3. Create your Admin account.
4. Add employees.
5. Configure category rules if required.
6. Give gateman the normal site URL.

The publishable Supabase key is intentionally used in the browser. Database RLS protects data access. Never put a Supabase secret/service-role key in this repository.
