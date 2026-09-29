# FCS Attendance - Google Sheets rebuild

This branch is a clean replacement for the current Supabase day-to-day architecture.

## Architecture

Gateman phone -> Google Apps Script web app -> Google Sheet

Admin uses same web app in Admin mode. Calculations run in browser immediately. Google Sheet is permanent cloud storage.

Supabase is used only once for migration and remains untouched until verification is complete.

## Setup

1. Create a dedicated Google Sheet.
2. Create a standalone Apps Script project.
3. Copy `google-apps-script/Code.gs`, `Index.html`, `Styles.html`, `JavaScript.html` and `appsscript.json` into it.
4. Set Script Properties:
   - `SPREADSHEET_ID` = Google Sheet ID
   - `ADMIN_PIN` = admin PIN
   - `GATE_PIN` = gateman PIN
   - `SUPABASE_URL` = https://raesuqidwkcpylvqiftf.supabase.co
   - `SUPABASE_SECRET_KEY` = new Supabase secret key, server-side only
5. Run `setupSheets` once.
6. Run `migrateFromSupabase` once. This creates legacy raw tabs plus a unified Attendance tab. It does not modify Supabase.
7. Deploy as Web app, Execute as: Me. For a gateman without a Google account, access must allow anonymous users. Keep PIN protection enabled.
8. Open deployed URL. Use `?mode=admin` for admin and `?mode=gate` for gateman.

Google Apps Script is intentionally used instead of a separate server. It runs in Google's cloud, so your computer does not need to remain switched on.

## Migration safety

Migration is one-way into Google Sheets and creates:
- Employees
- Rules
- Holidays
- Attendance
- Legacy_Employees
- Legacy_Rules
- Legacy_Holidays
- Legacy_DailyRecords
- Legacy_Attendance
- Migration_Audit

Existing Supabase data is never deleted or updated by migration.

Existing OT/UT/SL values are preserved in migrated Attendance rows. A migrated row is not recalculated merely because it was imported. When IN/OUT is subsequently edited, browser calculation becomes authoritative for that row.

## Current rule exceptions retained

- Gautam early-call UT rule
- Gateman 30-minute UT rule
- Driver minute-for-minute UT rule
- Ajay Kumar 8:20am start
- Barkha 8h15m elapsed day
- Varinder Pal split/night duty and 30-minute rounding
- Sunday/holiday full elapsed OT for eligible employees
- Explicit leave/status values
- Explicit OT/UT/SL overrides

No future normal date is automatically marked Absent.
