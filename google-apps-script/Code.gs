const SHEETS = {
  employees: 'Employees',
  rules: 'Rules',
  holidays: 'Holidays',
  attendance: 'Attendance',
  legacyEmployees: 'Legacy_Employees',
  legacyRules: 'Legacy_Rules',
  legacyHolidays: 'Legacy_Holidays',
  legacyDaily: 'Legacy_DailyRecords',
  legacyAttendance: 'Legacy_Attendance',
  audit: 'Migration_Audit'
};

const HEADERS = {
  Employees: ['employee_code','name','category','active','normal_work_minutes','break_minutes','round_minutes','split_shift','normal_start_minutes'],
  Rules: ['category','normal_start','normal_end','break_minutes','ot_eligible','ot_threshold_minutes','normal_work_minutes','notes'],
  Holidays: ['holiday_date','name'],
  Attendance: [
    'key','employee_code','employee_name','date','in_time','out_time','in_time_2','out_time_2',
    'ut_minutes','sl_minutes','ot_minutes','attendance','note',
    'ut_override_minutes','sl_override_minutes','ot_override_minutes',
    'migrated','legacy_daily_id','legacy_attendance_id','updated_at'
  ],
  Migration_Audit: ['item','value','checked_at']
};

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('FCS Attendance')
    .addMetaTag('viewport','width=device-width, initial-scale=1');
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function setupSheets() {
  const ss = getSpreadsheet_();
  Object.keys(SHEETS).forEach(k => ensureSheet_(ss, SHEETS[k]));
  Object.keys(HEADERS).forEach(name => {
    const sh = ss.getSheetByName(name);
    const h = HEADERS[name];
    if (sh.getLastRow() === 0) sh.getRange(1,1,1,h.length).setValues([h]);
    else sh.getRange(1,1,1,h.length).setValues([h]);
    sh.setFrozenRows(1);
  });
  formatBaseSheets_(ss);
  return 'Sheets ready: ' + ss.getUrl();
}

function getBootstrap(role, pin) {
  authorize_(role, pin);
  const ss = getSpreadsheet_();
  setupSheets();
  return {
    employees: readObjects_(ss.getSheetByName(SHEETS.employees)),
    rules: readObjects_(ss.getSheetByName(SHEETS.rules)),
    holidays: readObjects_(ss.getSheetByName(SHEETS.holidays)),
    attendance: readObjects_(ss.getSheetByName(SHEETS.attendance))
  };
}

function saveAttendanceRows(rows, role, pin) {
  authorize_(role, pin);
  if (!Array.isArray(rows) || !rows.length) return {saved:0};
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = getSpreadsheet_().getSheetByName(SHEETS.attendance);
    const values = sh.getDataRange().getValues();
    const headers = values.shift() || [];
    const idx = Object.fromEntries(headers.map((h,i)=>[h,i]));
    const rowByKey = new Map();
    values.forEach((r,i)=>{ if (r[idx.key]) rowByKey.set(String(r[idx.key]), i+2); });

    const writes = [];
    rows.forEach(input => {
      const r = {};
      headers.forEach(h => r[h] = input[h] ?? '');
      if (!r.key) r.key = String(r.date)+'|'+String(r.employee_code);
      r.updated_at = new Date().toISOString();
      const row = headers.map(h => normalizeSheetValue_(h,r[h]));
      const existingRow = rowByKey.get(String(r.key));
      if (existingRow) {
        writes.push({row:existingRow, values:row});
      } else {
        sh.getRange(sh.getLastRow()+1,1,1,headers.length).setValues([row]);
        rowByKey.set(String(r.key), sh.getLastRow());
      }
      if (existingRow) sh.getRange(existingRow,1,1,headers.length).setValues([row]);
    });
    return {saved: rows.length};
  } finally {
    lock.releaseLock();
  }
}

function migrateFromSupabase() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('SUPABASE_URL');
  const key = props.getProperty('SUPABASE_SECRET_KEY');
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in Script Properties first.');

  const ss = getSpreadsheet_();
  setupSheets();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (props.getProperty('MIGRATION_COMPLETED') === 'YES') {
      throw new Error('Migration is already marked complete. Do not run it again unless you intentionally clear MIGRATION_COMPLETED.');
    }

    const employees = supabaseGetAll_(url,key,'employees');
    const rules = supabaseGetAll_(url,key,'category_rules');
    const holidays = supabaseGetAll_(url,key,'holidays');
    const daily = supabaseGetAll_(url,key,'daily_records');
    const attendance = supabaseGetAll_(url,key,'attendance');

    replaceSheet_(ss.getSheetByName(SHEETS.legacyEmployees), employees);
    replaceSheet_(ss.getSheetByName(SHEETS.legacyRules), rules);
    replaceSheet_(ss.getSheetByName(SHEETS.legacyHolidays), holidays);
    replaceSheet_(ss.getSheetByName(SHEETS.legacyDaily), daily);
    replaceSheet_(ss.getSheetByName(SHEETS.legacyAttendance), attendance);

    replaceSheet_(ss.getSheetByName(SHEETS.employees), employees.map(e => ({
      employee_code:e.employee_code,name:e.name,category:e.category,active:e.active,
      normal_work_minutes:e.normal_work_minutes,break_minutes:e.break_minutes,
      round_minutes:e.round_minutes,split_shift:e.split_shift,
      normal_start_minutes:e.normal_start_minutes
    })));

    replaceSheet_(ss.getSheetByName(SHEETS.rules), rules);
    replaceSheet_(ss.getSheetByName(SHEETS.holidays), holidays.map(h=>({holiday_date:h.holiday_date,name:h.name})));

    const empById = Object.fromEntries(employees.map(e=>[e.id,e]));
    const unified = new Map();

    daily.forEach(d => {
      const e = empById[d.employee_id];
      if (!e) return;
      const key2 = d.work_date+'|'+e.employee_code;
      unified.set(key2, {
        key:key2, employee_code:e.employee_code, employee_name:e.name, date:d.work_date,
        in_time: d.in_time || '', out_time:d.out_time || '',
        in_time_2:d.in_time_2 || '', out_time_2:d.out_time_2 || '',
        ut_minutes:d.ut_minutes ?? '', sl_minutes:d.sl_minutes ?? '', ot_minutes:d.ot_minutes ?? '',
        attendance:'', note:'',
        ut_override_minutes:d.ut_override_minutes ?? '',
        sl_override_minutes:d.sl_override_minutes ?? '',
        ot_override_minutes:d.ot_override_minutes ?? '',
        migrated:true, legacy_daily_id:d.id || '', legacy_attendance_id:'', updated_at:d.updated_at || d.created_at || ''
      });
    });

    attendance.forEach(a => {
      const e = empById[a.employee_id];
      if (!e) return;
      const key2 = a.work_date+'|'+e.employee_code;
      const row = unified.get(key2) || {
        key:key2, employee_code:e.employee_code, employee_name:e.name, date:a.work_date,
        in_time:'',out_time:'',in_time_2:'',out_time_2:'',
        ut_minutes:'',sl_minutes:'',ot_minutes:'',attendance:'',note:'',
        ut_override_minutes:'',sl_override_minutes:'',ot_override_minutes:'',
        migrated:true,legacy_daily_id:'',legacy_attendance_id:'',updated_at:''
      };
      row.attendance = a.status || '';
      row.note = a.note || '';
      row.legacy_attendance_id = a.id || '';
      row.updated_at = a.updated_at || a.created_at || row.updated_at;
      unified.set(key2,row);
    });

    replaceSheet_(ss.getSheetByName(SHEETS.attendance), Array.from(unified.values()));

    const audit = [
      {item:'Migration source',value:'Supabase FCS Attendance '+new Date().toISOString(),checked_at:new Date()},
      {item:'Employees',value:String(employees.length),checked_at:new Date()},
      {item:'Daily records',value:String(daily.length),checked_at:new Date()},
      {item:'Attendance records',value:String(attendance.length),checked_at:new Date()},
      {item:'Unified attendance rows',value:String(unified.size),checked_at:new Date()},
      {item:'Holidays',value:String(holidays.length),checked_at:new Date()},
      {item:'Rules',value:String(rules.length),checked_at:new Date()},
      {item:'Migration',value:'COMPLETED - Supabase was not modified',checked_at:new Date()}
    ];
    replaceSheet_(ss.getSheetByName(SHEETS.audit),audit);
    props.setProperty('MIGRATION_COMPLETED','YES');
    return {employees:employees.length,daily:daily.length,attendance:attendance.length,unified:unified.size};
  } finally {
    lock.releaseLock();
  }
}

function clearMigrationFlag() {
  PropertiesService.getScriptProperties().deleteProperty('MIGRATION_COMPLETED');
  return 'Migration flag cleared. Only use this if you intentionally want to rerun migration.';
}

function authorize_(role,pin) {
  const expected = role === 'admin'
    ? PropertiesService.getScriptProperties().getProperty('ADMIN_PIN')
    : PropertiesService.getScriptProperties().getProperty('GATE_PIN');
  if (!expected || String(pin || '') !== String(expected)) throw new Error('Invalid PIN.');
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Set SPREADSHEET_ID in Script Properties.');
  return SpreadsheetApp.openById(id);
}

function ensureSheet_(ss,name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function formatBaseSheets_(ss) {
  [SHEETS.employees,SHEETS.rules,SHEETS.holidays,SHEETS.attendance,SHEETS.audit].forEach(n=>{
    const sh=ss.getSheetByName(n); if(!sh)return;
    sh.getRange(1,1,1,sh.getLastColumn()||1).setFontWeight('bold');
    sh.autoResizeColumns(1,Math.min(sh.getLastColumn()||1,12));
  });
}

function readObjects_(sh) {
  const values=sh.getDataRange().getValues();
  if(values.length<2)return [];
  const headers=values[0];
  return values.slice(1).filter(r=>r.some(v=>v!=='' && v!==null)).map(r=>{
    const o={};headers.forEach((h,i)=>o[h]=serializeCell_(r[i]));return o;
  });
}

function serializeCell_(v) {
  if (v instanceof Date) return Utilities.formatDate(v,Session.getScriptTimeZone(),'yyyy-MM-dd HH:mm:ss');
  return v;
}

function replaceSheet_(sh,rows) {
  sh.clearContents();
  const headers = sh.getName() === SHEETS.employees ? HEADERS.Employees
    : sh.getName() === SHEETS.rules ? HEADERS.Rules
    : sh.getName() === SHEETS.holidays ? HEADERS.Holidays
    : sh.getName() === SHEETS.attendance ? HEADERS.Attendance
    : sh.getName() === SHEETS.audit ? HEADERS.Migration_Audit
    : rows.length ? Object.keys(rows[0]) : ['data'];
  if (!headers.length) return;
  sh.getRange(1,1,1,headers.length).setValues([headers]);
  if(!rows.length)return;
  const values=rows.map(o=>headers.map(h=>normalizeSheetValue_(h,o[h])));
  sh.getRange(2,1,values.length,headers.length).setValues(values);
  sh.setFrozenRows(1);
}

function normalizeSheetValue_(header,v) {
  if(v===undefined || v===null)return '';
  if(['active','split_shift','migrated','ot_eligible','full_day_ot'].includes(header)) {
    if(v === '') return '';
    return v===true || v==='true' || v===1 ? true : v===false || v==='false' || v===0 ? false : v;
  }
  return v;
}

function supabaseGetAll_(url,key,table) {
  const out=[]; let offset=0; const page=1000;
  while(true) {
    const endpoint=url.replace(/\/$/,'')+'/rest/v1/'+table+'?select=*&limit='+page+'&offset='+offset;
    const res=UrlFetchApp.fetch(endpoint,{method:'get',headers:{apikey:key},muteHttpExceptions:true});
    const code=res.getResponseCode();
    if(code<200||code>=300) throw new Error('Supabase '+table+' returned HTTP '+code+': '+res.getContentText());
    const data=JSON.parse(res.getContentText());
    out.push.apply(out,data);
    if(data.length<page)break;
    offset+=page;
  }
  return out;
}
