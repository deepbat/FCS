# FCS Attendance PWA

Mobile-first attendance and overtime PWA for FCS.

## Stack
- Static PWA hosted from GitHub Pages
- Supabase Postgres + Row Level Security
- Supabase Auth for Admin
- localStorage for offline pending entries and last-loaded employee list

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

## Save consistency limitation

The gate queues validated raw entries locally before any network request. A queued entry remains on this phone until the server accepts both the timing and attendance writes. If another server entry exists for the same employee/date, syncing stops for that entry and asks for admin review. Do not clear browser storage while entries are pending. The last-loaded employee list lets the gate work offline after it has loaded once online.

The two Supabase tables cannot be updated atomically from the static client. A failed second write leaves the item queued for retry, but a server-side transaction/RPC is still needed for strict all-or-nothing writes. Admin Save Changes reports failed rows and keeps them pending locally in the page; successful writes already committed are not rolled back. A production hardening follow-up should put both writes and conflict checks in a single server-side function, with appropriate RLS and access review.
