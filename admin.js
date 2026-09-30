const SUPABASE_URL='https://raesuqidwkcpylvqiftf.supabase.co';
const SUPABASE_KEY='sb_publishable_IDPqntwDZCE5O5qsakvfTA_dGcex6zF';
const db=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const root=document.getElementById('root');
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
let employees=[],rules=[],holidays=[],records=[],attendance=[];
let employeeMap=new Map(),ruleMap=new Map(),holidayMap=new Map(),recordMap=new Map(),attendanceMap=new Map();
let grandTotals={ot:0,ut:0,sl:0}, editSeq=new Map();
const localToday=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
let drafts=new Map(), dirtyDrafts=new Set(), dirtyEmployees=new Set(), dirtyRules=new Set(), activeEmployee=0, currentTab='attendance', currentMode='register', month=localToday().slice(0,7), hasUnsaved=false;

const fmtDate=s=>{const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?m[3]+'/'+m[2]+'/'+m[1]:s};
const fmtMin=n=>{n=Math.max(0,Math.round(Number(n)||0));return Math.floor(n/60)+'h '+String(n%60).padStart(2,'0')+'m'};
const mins=t=>{if(!t)return null;const p=String(t).slice(0,5).split(':').map(Number);return p[0]*60+p[1]};
const time=t=>t?String(t).slice(0,5):'';
const normalize=t=>{t=String(t||'').trim().toLowerCase().replace(/\s+/g,'').replace(/\./g,':');let m=t.match(/^(\d{1,2}):(\d{1,2})(am|pm)?$/);if(m){let h=+m[1],n=+m[2];if(n>59)return '';if(m[3]){if(h<1||h>12)return '';if(m[3]==='am'&&h===12)h=0;if(m[3]==='pm'&&h!==12)h+=12}else if(h>23)return '';return String(h).padStart(2,'0')+':'+String(n).padStart(2,'0')}m=t.match(/^(\d{1,2})(\d{2})$/);return m&&+m[1]<=23&&+m[2]<=59?String(+m[1]).padStart(2,'0')+':'+m[2]:/^\d{1,2}$/.test(t)&&+t<=23?String(+t).padStart(2,'0')+':00':''};
const range=m=>{const [y,mo]=m.split('-').map(Number),nmo=mo===12?1:mo+1,ny=mo===12?y+1:y;return [m+'-01',ny+'-'+String(nmo).padStart(2,'0')+'-01']};
function emp(id){return employeeMap.get(id)}
function hol(date){return holidayMap.get(date)}
function isSunday(date){return new Date(date+'T12:00:00').getDay()===0}
function ruleFor(e){return ruleMap.get(e.category)||{}}
function isVarinder(e){return e?.name==='Varinder Pal'&&!!e?.split_shift}
async function calculate(e,d,date){
  const firstOut=isVarinder(e)?(d.out_time||'01:00'):d.out_time;
  const secondIn=e.split_shift?(isVarinder(e)?'06:00':d.in_time_2):null;
  const secondOut=e.split_shift?(isVarinder(e)?d.final_out:d.out_time_2):null;
  const {data,error}=await db.rpc('calculate_attendance',{
    p_employee_id:e.id,
    p_work_date:date,
    p_in_time:d.in_time||null,
    p_out_time:firstOut||null,
    p_in_time_2:secondIn||null,
    p_out_time_2:secondOut||null
  });
  if(error)throw error;
  const c=Array.isArray(data)?data[0]:data;
  if(!c)throw new Error('No calculation returned.');
  return c;
}
function statusFor(e,date,rec,existing){
  if(existing)return existing.status;
  if(isSunday(date))return 'Sunday';
  if(hol(date))return 'Holiday';
  if(!rec?.in_time||!rec?.out_time)return '';
  if(e.category==='Staff'){
    const a=mins(rec.in_time),b=mins(rec.out_time);
    const r=ruleFor(e);
    const start=mins(r.normal_start)||540,end=mins(r.normal_end)||1065;
    // Preserve the established Staff half-day windows while keeping them
    // aligned if the configured Staff start/end times are changed.
    const startShift=start-540,endShift=end-1065;
    if(a<=570+startShift&&b<=795+endShift)return 'Second Half Leave';
    if(a>=825+startShift&&b>=1035+endShift)return 'First Half Leave';
  }
  return 'Present';
}
function rowKey(date,id){return date+'|'+id}
function getDraft(date,id){
  const key=rowKey(date,id);if(drafts.has(key))return drafts.get(key);
  const r=recordMap.get(key),a=attendanceMap.get(key),e=emp(id);
  const d={
    date,id,
    in_time:time(r?.in_time),
    out_time:time(r?.out_time)||(isVarinder(e)?'01:00':''),
    final_out:isVarinder(e)?(time(r?.out_time_2)||''):time(r?.out_time),
    in_time_2:time(r?.in_time_2),
    out_time_2:time(r?.out_time_2),
    ut:Number(r?.ut_minutes)||0,
    sl:Number(r?.sl_minutes)||0,
    ot:Number(r?.ot_minutes)||0,
    status:statusFor(e,date,r,a),
    ut_override:r?.ut_override_minutes,
    sl_override:r?.sl_override_minutes,
    ot_override:r?.ot_override_minutes,
    record:r,attendance:a
  };
  if(d.ut_override!=null)d.ut=Number(d.ut_override)||0;
  if(d.sl_override!=null)d.sl=Number(d.sl_override)||0;
  if(d.ot_override!=null)d.ot=Number(d.ot_override)||0;
  drafts.set(key,d);return d;
}
function parseAdj(v){v=String(v||'').trim().toLowerCase();if(!v)return null;const m=v.match(/^(\d+)h\s*(\d{1,2})m$/);if(m)return +m[1]*60+(+m[2]||0);if(/^\d+$/.test(v))return +v;return null}
function markUnsaved(){hasUnsaved=true;const s=$('saveState');if(s){s.textContent='Unsaved changes';s.className='saveState error'}}
function confirmDiscard(){return !hasUnsaved||confirm('Discard unsaved changes?')}
window.addEventListener('beforeunload',e=>{if(hasUnsaved){e.preventDefault();e.returnValue='';}});
async function loadData(){
  const [start,end]=range(month);
  const [er,rr,hr,dr,ar]=await Promise.all([
    db.from('employees').select('*').order('employee_code'),
    db.from('category_rules').select('*').order('category'),
    db.from('holidays').select('*').order('holiday_date'),
    db.from('daily_records').select('*').gte('work_date',start).lt('work_date',end).order('work_date,employee_id'),
    db.from('attendance').select('*').gte('work_date',start).lt('work_date',end).order('work_date,employee_id')
  ]);
  if(er.error||rr.error||hr.error||dr.error||ar.error)throw new Error([er.error,rr.error,hr.error,dr.error,ar.error].filter(Boolean).map(x=>x.message).join('; '));
  employees=er.data||[];rules=rr.data||[];holidays=hr.data||[];records=dr.data||[];attendance=ar.data||[];
  employeeMap=new Map(employees.map(e=>[e.id,e]));
  ruleMap=new Map(rules.map(r=>[r.category,r]));
  holidayMap=new Map(holidays.map(h=>[h.holiday_date,h]));
  recordMap=new Map(records.map(r=>[rowKey(r.work_date,r.employee_id),r]));
  attendanceMap=new Map(attendance.map(a=>[rowKey(a.work_date,a.employee_id),a]));
  drafts.clear();editSeq.clear();rebuildGrandTotals();
}
function shell(user){
root.innerHTML='<div class="app"><div class="top"><div><h1>FCS Attendance</h1><div class="muted">'+esc(user.email||'')+'</div></div><div><button id="logout" class="btn">Logout</button></div></div><div class="card savebar"><button id="saveAll" class="btn primary">Save Changes</button><span id="saveState" class="saveState">All changes saved</span></div><div class="tabs"><button class="btn active" data-tab="attendance">Attendance</button><button class="btn" data-tab="employees">Employees</button><button class="btn" data-tab="holidays">Holidays</button><button class="btn" data-tab="settings">Settings</button></div><section id="attendanceSection"></section><section id="employeesSection" class="hidden"></section><section id="holidaysSection" class="hidden"></section><section id="settingsSection" class="hidden"></section></div>';
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
$('logout').onclick=async()=>{await db.auth.signOut();location.href='./admin.html'};
$('saveAll').onclick=saveAll;
renderAttendance();renderEmployees();renderHolidays();renderSettings();
}
function switchTab(t){currentTab=t;document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));['attendance','employees','holidays','settings'].forEach(x=>document.getElementById(x+'Section').classList.toggle('hidden',x!==t));}
function renderAttendance(){
$('attendanceSection').innerHTML='<div class="modes"><button id="registerMode" class="btn active">Attendance Register</button><button id="summaryMode" class="btn">Monthly Summary</button></div><div id="register"></div><div id="summary" class="hidden"></div>';
$('registerMode').onclick=()=>{currentMode='register';$('registerMode').classList.add('active');$('summaryMode').classList.remove('active');$('register').classList.remove('hidden');$('summary').classList.add('hidden');renderRegister()};
$('summaryMode').onclick=()=>{currentMode='summary';$('summaryMode').classList.add('active');$('registerMode').classList.remove('active');$('register').classList.add('hidden');$('summary').classList.remove('hidden');renderSummary()};
renderRegister();
}
function monthToolbar(){
return '<div class="toolbar noPrint"><label style="margin:0">Month <input id="month" type="month" value="'+month+'"></label><button id="print" class="btn">Print</button><button id="excel" class="btn">Excel - All People</button></div>'
}
function datesForMonth(){
 const [start,end]=range(month);
 const out=[];let d=new Date(start+'T12:00:00'),z=new Date(end+'T12:00:00');while(d<z){out.push(d.toISOString().slice(0,10));d.setDate(d.getDate()+1)}return out;
}
function renderRegister(){
 const active=employees.filter(e=>e.active);if(activeEmployee>=active.length)activeEmployee=0;const e=active[activeEmployee];
 $('register').innerHTML=monthToolbar()+'<div class="registerLayout"><aside class="personTabs">'+employees.filter(x=>x.active).map((x,i)=>'<button class="btn personTab '+(i===activeEmployee?'active':'')+'" data-person="'+i+'">'+esc(x.name)+'</button>').join('')+'</aside><div class="registerMain"><div id="printTitle" class="summary">'+esc(e?.name||'')+' - Attendance Register - '+month+'</div><div id="regSummary" class="summary"></div><div class="tablewrap registerTableWrap"><table id="regTable"></table></div><div id="regCards" class="regCards"></div><div id="grandTotal" class="summary"></div></div></div>';
 $('month').onchange=async ev=>{if(!confirmDiscard()){ev.target.value=month;return}month=ev.target.value;activeEmployee=0;dirtyDrafts.clear();dirtyEmployees.clear();dirtyRules.clear();hasUnsaved=false;await loadData();renderRegister()};
 document.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>{activeEmployee=+b.dataset.person;renderRegister()});
 $('print').onclick=()=>window.print();$('excel').onclick=exportEmployee;
 if(!e){$('regTable').innerHTML='<tbody><tr><td>No active employees.</td></tr></tbody>';return}
 const rows=datesForMonth(),isSplit=e.split_shift&&!isVarinder(e);
 let h='<thead><tr><th>Date</th><th>IN</th>'+(isSplit?'<th>IN 2</th>':'')+'<th>UT</th><th>OUT</th>'+(isSplit?'<th>OUT 2</th>':'')+'<th>SL</th><th>OT</th><th>Attendance</th><th>Action</th></tr></thead><tbody>';
 rows.forEach(date=>{
   const d=getDraft(date,e.id),rowClass=d.status==='Sunday'?'sundayRow':d.status==='Holiday'?'holidayRow':['Leave','Full Day Leave','First Half Leave','Second Half Leave','Half Day'].includes(d.status)?'leaveRow':d.status==='Absent'?'absentRow':d.status==='Present'?'presentRow':'';
   h+='<tr class="'+rowClass+'" data-date="'+date+'"><td>'+fmtDate(date)+'</td><td><input data-f="in_time" value="'+esc(d.in_time)+'"></td>'+(isSplit?'<td><input data-f="in_time_2" value="'+esc(d.in_time_2)+'"></td>':'')+'<td><input data-f="ut" value="'+esc(fmtMin(d.ut))+'"></td><td><input data-f="'+(isVarinder(e)?'final_out':'out_time')+'" value="'+esc(isVarinder(e)?d.final_out:d.out_time)+'"></td>'+(isSplit?'<td><input data-f="out_time_2" value="'+esc(d.out_time_2)+'"></td>':'')+'<td><input data-f="sl" value="'+esc(fmtMin(d.sl))+'"></td><td><input data-f="ot" value="'+esc(fmtMin(d.ot))+'"></td><td><select data-f="status">'+['','Present','Absent','Leave','Half Day','First Half Leave','Second Half Leave','Full Day Leave','Holiday','Sunday'].map(x=>'<option '+(x===d.status?'selected':'')+'>'+x+'</option>').join('')+'</select></td><td><button type="button" class="btn" data-delete="'+date+'">Delete entry</button></td></tr>'
 });
 h+='</tbody>';$('regTable').innerHTML=h;
 $('regCards').innerHTML=rows.map(date=>{
   const d=getDraft(date,e.id),cardClass=d.status==='Sunday'?'sundayRow':d.status==='Holiday'?'holidayRow':['Leave','Full Day Leave','First Half Leave','Second Half Leave','Half Day'].includes(d.status)?'leaveRow':d.status==='Absent'?'absentRow':d.status==='Present'?'presentRow':'';
   return '<div class="regCard '+cardClass+'" data-date="'+date+'"><div class="regCardHead"><b>'+fmtDate(date)+'</b><select data-f="status">'+['','Present','Absent','Leave','Half Day','First Half Leave','Second Half Leave','Full Day Leave','Holiday','Sunday'].map(x=>'<option '+(x===d.status?'selected':'')+'>'+x+'</option>').join('')+'</select></div><div class="regFields"><label>IN<input data-f="in_time" value="'+esc(d.in_time)+'"></label><label>OUT<input data-f="'+(isVarinder(e)?'final_out':'out_time')+'" value="'+esc(isVarinder(e)?d.final_out:d.out_time)+'"></label><label>UT<input data-f="ut" value="'+esc(fmtMin(d.ut))+'"></label><label>SL<input data-f="sl" value="'+esc(fmtMin(d.sl))+'"></label><label>OT<input data-f="ot" value="'+esc(fmtMin(d.ot))+'"></label></div><button type="button" class="btn" data-delete="'+date+'">Delete entry</button></div>'
 }).join('');
 document.querySelectorAll('#regTable tr[data-date]').forEach(tr=>tr.querySelectorAll('[data-f]').forEach(el=>el.addEventListener('change',()=>editCell(tr,e,el))));
 document.querySelectorAll('#regCards .regCard').forEach(card=>card.querySelectorAll('[data-f]').forEach(el=>el.addEventListener('change',()=>editCard(card,e,el))));
 document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteEntry(b.dataset.delete,e.id));
 updateRegSummary(e,rows);updateGrandTotal();
}
async function editCell(tr,e,changed){
  const date=tr.dataset.date,d=getDraft(date,e.id),key=rowKey(date,e.id);
  const before={ut:d.ut,sl:d.sl,ot:d.ot};
  const seq=(editSeq.get(key)||0)+1;editSeq.set(key,seq);
  dirtyDrafts.add(key);
  const changedField=changed?.dataset?.f||'',timeFields=['in_time','out_time','in_time_2','out_time_2','final_out'],timeChanged=timeFields.includes(changedField);
  tr.querySelectorAll('[data-f]').forEach(el=>{
    const f=el.dataset.f,v=el.value;
    if(timeFields.includes(f)){const parsed=normalize(v);if(v.trim()&&!parsed){d.invalidTime=f;markUnsaved();$('saveState').textContent='Invalid time: '+v;return}if(d.invalidTime===f)d.invalidTime=null;d[f]=parsed;el.value=d[f]||''}
    else if(['ut','sl','ot'].includes(f)){
      if(timeChanged)return;
      const n=parseAdj(v);if(n!=null){d[f]=n;d[f+'_override']=n}
    } else d[f]=v;
  });
  if(timeChanged){
    // Explicit manual overrides are independent of IN/OUT and must survive
    // unrelated time edits. The user can edit UT/SL/OT directly to replace
    // an override.
    d.ut_override=null;d.sl_override=null;d.ot_override=null;
    try{
      const c=await calculate(e,d,date);
      if(editSeq.get(key)!==seq)return;
      d.ut=Number(c.ut_minutes)||0;
      d.sl=Number(c.sl_minutes)||0;
      d.ot=Number(c.ot_minutes)||0;
      adjustGrandTotals(before,d);
      markUnsaved();renderRowValues(tr,d);updateRegSummary(e,datesForMonth());updateGrandTotal();
    }catch(err){
      if(editSeq.get(key)!==seq)return;
      markUnsaved();const st=$('saveState');if(st){st.textContent='Calculation failed: '+err.message;st.className='saveState error'}
    }
    return;
  }
  adjustGrandTotals(before,d);
  markUnsaved();renderRowValues(tr,d);updateRegSummary(e,datesForMonth());updateGrandTotal();
}
function renderRowValues(tr,d){['ut','sl','ot'].forEach(f=>{const x=tr.querySelector('[data-f="'+f+'"]');if(x)x.value=fmtMin(d[f])})}
function updateRegSummary(e,rows){
  let ot=0,ut=0,sl=0;
  rows.forEach(date=>{const x=getDraft(date,e.id);ot+=+x.ot||0;ut+=+x.ut||0;sl+=+x.sl||0});
  $('regSummary').textContent='Person Total:  OT '+fmtMin(ot)+'   UT '+fmtMin(ut)+'   SL '+fmtMin(sl);
}
function recomputeGrandTotals(){
  const totals={ot:0,ut:0,sl:0};
  employees.filter(e=>e.active).forEach(e=>{
    datesForMonth().forEach(date=>{
      const d=getDraft(date,e.id);
      totals.ot+=Number(d.ot)||0;
      totals.ut+=Number(d.ut)||0;
      totals.sl+=Number(d.sl)||0;
    });
  });
  return totals;
}
function rebuildGrandTotals(){
  grandTotals=recomputeGrandTotals();
}
function adjustGrandTotals(){
  // Totals are recomputed from the same draft rows used by the register.
  // This avoids drift from incremental deltas and guarantees export/print agreement.
  grandTotals=recomputeGrandTotals();
}
function updateGrandTotal(){
  grandTotals=recomputeGrandTotals();
  const x=$('grandTotal');if(!x)return;
  x.textContent='Grand Total (All People):  OT '+fmtMin(grandTotals.ot)+'   UT '+fmtMin(grandTotals.ut)+'   SL '+fmtMin(grandTotals.sl);
}
function updateCardValues(card,e,d){
  const cls=d.status==='Sunday'?'sundayRow':d.status==='Holiday'?'holidayRow':['Leave','Full Day Leave','First Half Leave','Second Half Leave','Half Day'].includes(d.status)?'leaveRow':d.status==='Absent'?'absentRow':d.status==='Present'?'presentRow':'';
  card.className='regCard '+cls;
  card.querySelector('[data-f="status"]').value=d.status||'';
  ['in_time','out_time','in_time_2','out_time_2','final_out'].forEach(f=>{const x=card.querySelector('[data-f="'+f+'"]');if(x)x.value=normalize(d[f])||''});
  ['ut','sl','ot'].forEach(f=>{const x=card.querySelector('[data-f="'+f+'"]');if(x)x.value=fmtMin(d[f])});
}
async function editCard(card,e,changed){
  const date=card.dataset.date,d=getDraft(date,e.id),key=rowKey(date,e.id);
  const before={ut:d.ut,sl:d.sl,ot:d.ot};
  const seq=(editSeq.get(key)||0)+1;editSeq.set(key,seq);
  dirtyDrafts.add(key);
  const timeFields=['in_time','out_time','in_time_2','out_time_2','final_out'];
  const timeChanged=timeFields.includes(changed?.dataset?.f);
  card.querySelectorAll('[data-f]').forEach(el=>{
    const f=el.dataset.f,v=el.value;
    if(timeFields.includes(f)){const parsed=normalize(v);if(v.trim()&&!parsed){d.invalidTime=f;markUnsaved();$('saveState').textContent='Invalid time: '+v;return}if(d.invalidTime===f)d.invalidTime=null;d[f]=parsed;}
    else if(['ut','sl','ot'].includes(f)){
      if(timeChanged)return;
      const n=parseAdj(v);if(n!=null){d[f]=n;d[f+'_override']=n}
    } else d[f]=v;
  });
  if(timeChanged){
    d.ut_override=null;d.sl_override=null;d.ot_override=null;
    try{
      const c=await calculate(e,d,date);
      if(editSeq.get(key)!==seq)return;
      d.ut=Number(c.ut_minutes)||0;
      d.sl=Number(c.sl_minutes)||0;
      d.ot=Number(c.ot_minutes)||0;
    }catch(err){
      if(editSeq.get(key)!==seq)return;
      markUnsaved();const st=$('saveState');if(st){st.textContent='Calculation failed: '+err.message;st.className='saveState error'}
      return;
    }
  }
  adjustGrandTotals(before,d);
  markUnsaved();
  updateCardValues(card,e,d);
  updateRegSummary(e,datesForMonth());
  updateGrandTotal();
}
function renderSummary(){
 const active=employees.filter(e=>e.active),dates=datesForMonth();
 let h='<div class="toolbar noPrint"><label style="margin:0">Month <input id="summaryMonth" type="month" value="'+month+'"></label><button id="summaryPrint" class="btn">Print</button></div><div class="tablewrap"><table><thead><tr><th>Employee</th><th>Present Days</th><th>Half Day</th><th>Leave</th><th>Absent</th><th>Sunday</th><th>Holiday</th></tr></thead><tbody>';
 active.forEach(e=>{const counts={Present:0,'Half Day':0,Leave:0,Absent:0,Sunday:0,Holiday:0};dates.forEach(d=>{const x=getDraft(d,e.id),r=x.record,s=x.status||statusFor(e,d,r,x.attendance);if(s==='First Half Leave'||s==='Second Half Leave'||s==='Half Day'){counts['Half Day']++;counts.Present+=0.5}else if(s==='Full Day Leave'||s==='Leave')counts.Leave++;else if(counts[s]!=null){counts[s]++;if(s==='Present')counts.Present+=0}});h+='<tr><td>'+esc(e.name)+'</td><td>'+counts.Present+'</td><td>'+counts['Half Day']+'</td><td>'+counts.Leave+'</td><td>'+counts.Absent+'</td><td>'+counts.Sunday+'</td><td>'+counts.Holiday+'</td></tr>'});
 h+='</tbody></table></div>';$('summary').innerHTML=h;$('summaryMonth').onchange=async ev=>{if(!confirmDiscard()){ev.target.value=month;return}month=ev.target.value;dirtyDrafts.clear();dirtyEmployees.clear();dirtyRules.clear();hasUnsaved=false;await loadData();renderSummary()};$('summaryPrint').onclick=()=>window.print();
}
function renderEmployees(){
 $('employeesSection').innerHTML='<div class="card"><h3>Add Employee</h3><div class="grid"><input id="newCode" placeholder="Employee code"><input id="newName" placeholder="Employee name"><select id="newCat"><option>Staff</option><option>Driver</option><option>Gardener</option><option>Gateman</option></select><button id="addEmp" class="btn primary">Add</button></div><p id="empMsg" class="message"></p></div><div class="tablewrap"><table><thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Active</th><th>Normal Start</th><th>Normal End</th><th>Normal Minutes</th><th>Break</th></tr></thead><tbody>'+employees.map(e=>'<tr><td>'+esc(e.employee_code)+'</td><td>'+esc(e.name)+'</td><td>'+esc(e.category)+'</td><td><input type="checkbox" data-active="'+e.id+'" '+(e.active?'checked':'')+'></td><td><input data-start="'+e.id+'" value="'+(e.normal_start_minutes==null?'':String(Math.floor(e.normal_start_minutes/60)).padStart(2,'0')+':'+String(e.normal_start_minutes%60).padStart(2,'0'))+'"></td><td><input data-end="'+e.id+'" value="'+(e.normal_end_minutes==null?'':String(Math.floor(e.normal_end_minutes/60)).padStart(2,'0')+':'+String(e.normal_end_minutes%60).padStart(2,'0'))+'"></td><td><input data-normal="'+e.id+'" value="'+(e.normal_work_minutes||0)+'"></td><td><input data-break="'+e.id+'" value="'+(e.break_minutes||0)+'"></td></tr>').join('')+'</tbody></table></div>';
 $('addEmp').onclick=async()=>{const code=$('newCode').value.trim(),name=$('newName').value.trim(),category=$('newCat').value;if(!code||!name)return;$('addEmp').disabled=true;const r=ruleFor({category});const {error}=await db.from('employees').insert({employee_code:code,name,category,normal_work_minutes:r.normal_work_minutes||525,break_minutes:r.break_minutes||0,active:true});if(error){$('empMsg').textContent=error.message;$('empMsg').className='message error'}else{await loadData();renderEmployees();renderRegister()}};
 document.querySelectorAll('[data-active]').forEach(x=>x.onchange=()=>{const e=emp(x.dataset.active);e.active=x.checked;dirtyEmployees.add(e.id);markUnsaved()});
 document.querySelectorAll('[data-start]').forEach(x=>x.onchange=()=>{const e=emp(x.dataset.start),v=normalize(x.value);if(x.value.trim()&&!v){x.value=e.normal_start_minutes==null?'':String(Math.floor(e.normal_start_minutes/60)).padStart(2,'0')+':'+String(e.normal_start_minutes%60).padStart(2,'0');return}e.normal_start_minutes=v?mins(v):null;dirtyEmployees.add(e.id);markUnsaved()});
 document.querySelectorAll('[data-end]').forEach(x=>x.onchange=()=>{const e=emp(x.dataset.end),v=normalize(x.value);if(x.value.trim()&&!v){x.value=e.normal_end_minutes==null?'':String(Math.floor(e.normal_end_minutes/60)).padStart(2,'0')+':'+String(e.normal_end_minutes%60).padStart(2,'0');return}e.normal_end_minutes=v?mins(v):null;dirtyEmployees.add(e.id);markUnsaved()});
 document.querySelectorAll('[data-normal]').forEach(x=>x.onchange=()=>{const e=emp(x.dataset.normal);e.normal_work_minutes=+x.value||0;dirtyEmployees.add(e.id);markUnsaved()});
 document.querySelectorAll('[data-break]').forEach(x=>x.onchange=()=>{const e=emp(x.dataset.break);e.break_minutes=+x.value||0;dirtyEmployees.add(e.id);markUnsaved()});
}
function renderHolidays(){
 $('holidaysSection').innerHTML='<div class="card"><h3>Add Holiday</h3><div class="grid"><input id="hd" type="date"><input id="hn" placeholder="Holiday name"><span></span><button id="addHol" class="btn primary">Add</button></div></div><div class="tablewrap"><table><thead><tr><th>Date</th><th>Name</th><th>Action</th></tr></thead><tbody>'+holidays.map(h=>'<tr><td>'+fmtDate(h.holiday_date)+'</td><td>'+esc(h.name)+'</td><td><button class="btn" data-delhol="'+h.id+'">Delete</button></td></tr>').join('')+'</tbody></table></div>';
 $('addHol').onclick=async()=>{if(!$('hd').value||!$('hn').value.trim())return;const {error}=await db.from('holidays').insert({holiday_date:$('hd').value,name:$('hn').value.trim()});if(!error){await loadData();renderHolidays()}};
 document.querySelectorAll('[data-delhol]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this holiday?'))return;await db.from('holidays').delete().eq('id',b.dataset.delhol);await loadData();renderHolidays()});
}
function renderSettings(){
 $('settingsSection').innerHTML='<div class="card"><h3>Category Rules</h3><div class="tablewrap"><table><thead><tr><th>Category</th><th>Start</th><th>End</th><th>Normal Minutes</th><th>Break</th><th>OT</th><th>Threshold</th></tr></thead><tbody>'+rules.map(r=>'<tr><td>'+esc(r.category)+'</td><td><input data-r="start" data-cat="'+esc(r.category)+'" value="'+time(r.normal_start)+'"></td><td><input data-r="end" data-cat="'+esc(r.category)+'" value="'+time(r.normal_end)+'"></td><td><input data-r="normal" data-cat="'+esc(r.category)+'" value="'+(r.normal_work_minutes||0)+'"></td><td><input data-r="break" data-cat="'+esc(r.category)+'" value="'+(r.break_minutes||0)+'"></td><td><input type="checkbox" data-r="ot" data-cat="'+esc(r.category)+'" '+(r.ot_eligible?'checked':'')+'></td><td><input data-r="threshold" data-cat="'+esc(r.category)+'" value="'+(r.ot_threshold_minutes||15)+'"></td></tr>').join('')+'</tbody></table></div></div>';
 document.querySelectorAll('[data-r]').forEach(x=>x.onchange=()=>{const r=ruleFor({category:x.dataset.cat}),f=x.dataset.r;r[f==='start'?'normal_start':f==='end'?'normal_end':f==='normal'?'normal_work_minutes':f==='break'?'break_minutes':f==='ot'?'ot_eligible':'ot_threshold_minutes']=x.type==='checkbox'?x.checked:x.value;dirtyRules.add(r.category);markUnsaved()});
}
let savingAll=false;
async function saveAll(){
 if(savingAll)return;
 savingAll=true;$('saveAll').disabled=true;
 const state=$('saveState');state.textContent='Saving...';state.className='saveState';
 const errors=[];let saved=0;
 try{
  for(const id of [...dirtyEmployees]){
   const e=emp(id);if(!e)continue;
   try{const {error}=await db.from('employees').update({active:e.active,normal_start_minutes:e.normal_start_minutes,normal_end_minutes:e.normal_end_minutes,normal_work_minutes:e.normal_work_minutes,break_minutes:e.break_minutes}).eq('id',id);if(error)throw error;dirtyEmployees.delete(id);saved++}
   catch(err){errors.push('Employee '+e.name+': '+err.message)}
  }
  for(const category of [...dirtyRules]){
   const r=ruleFor({category});
   try{const {error}=await db.from('category_rules').update({normal_start:r.normal_start,normal_end:r.normal_end,normal_work_minutes:+r.normal_work_minutes||0,break_minutes:+r.break_minutes||0,ot_eligible:!!r.ot_eligible,ot_threshold_minutes:+r.ot_threshold_minutes||0}).eq('category',category);if(error)throw error;dirtyRules.delete(category);saved++}
   catch(err){errors.push('Rule '+category+': '+err.message)}
  }
  for(const key of [...dirtyDrafts]){
   const d=drafts.get(key),e=d&&emp(d.id);if(!e)continue;
   const label=e.name+' '+d.date;
   try{
    if(d.invalidTime)throw new Error('invalid '+d.invalidTime+' time');
    const fields=['in_time',isVarinder(e)?'final_out':'out_time',...(e.split_shift&&!isVarinder(e)?['in_time_2','out_time_2']:[])];
    for(const field of fields){
     const input=document.querySelector('#regCards [data-date="'+d.date+'"] [data-f="'+field+'"]')||document.querySelector('#regTable tr[data-date="'+d.date+'"] [data-f="'+field+'"]');
     if(input&&input.value.trim()&&!normalize(input.value))throw new Error('invalid '+field+' time');
    }
    const it=normalize(d.in_time),ot=normalize(d.out_time),it2=normalize(d.in_time_2),ot2=normalize(d.out_time_2),finalOut=normalize(d.final_out);
    const status=d.status||'';
    const statusOnly=['Present','Absent','Leave','Half Day','First Half Leave','Second Half Leave','Full Day Leave','Holiday','Sunday'].includes(status);
    // Admin may mark attendance status without timings, for example Present
    // during an official tour or Leave without entering IN/OUT.
    const hasAnyTime=!!it||!!ot||!!it2||!!ot2||!!finalOut;
    if(!hasAnyTime&&statusOnly){
      const {error}=await db.rpc('save_admin_attendance',{
        p_work_date:d.date,
        p_employee_id:d.id,
        p_in_time:null,
        p_out_time:null,
        p_in_time_2:null,
        p_out_time_2:null,
        p_ut_override_minutes:d.ut_override,
        p_sl_override_minutes:d.sl_override,
        p_ot_override_minutes:d.ot_override,
        p_status:status
      });
      if(error)throw error;
      dirtyDrafts.delete(key);saved++;continue;
    }
    if(!it||!(isVarinder(e)?finalOut:ot))throw new Error('Enter IN and OUT, or select an attendance status such as Present or Leave.');
    if(e.split_shift&&!isVarinder(e)&&(!it2||!ot2))throw new Error('both second-shift times are required');
    if(!e.split_shift&&mins(ot)<mins(it))throw new Error('OUT cannot be earlier than IN');
    const firstOut=e.split_shift&&isVarinder(e)?(ot||'01:00'):ot;
    const secondIn=e.split_shift&&isVarinder(e)?'06:00':it2;
    const secondOut=e.split_shift&&isVarinder(e)?finalOut:ot2;
    const {error}=await db.rpc('save_admin_attendance',{
      p_work_date:d.date,
      p_employee_id:d.id,
      p_in_time:it,
      p_out_time:firstOut,
      p_in_time_2:e.split_shift?secondIn:null,
      p_out_time_2:e.split_shift?secondOut:null,
      p_ut_override_minutes:d.ut_override,
      p_sl_override_minutes:d.sl_override,
      p_ot_override_minutes:d.ot_override,
      p_status:d.status||statusFor(e,d.date,d,null)
    });
    if(error)throw error;
    dirtyDrafts.delete(key);saved++;
   }catch(err){errors.push(label+': '+err.message)}
  }
  hasUnsaved=!!(dirtyDrafts.size||dirtyEmployees.size||dirtyRules.size);
  if(errors.length){state.textContent=saved+' saved; '+errors.length+' failed: '+errors.join('; ');state.className='saveState error'}
  else{await loadData();state.textContent=saved+' saved. All changes saved';state.className='saveState ok';renderRegister();if(currentMode==='summary')renderSummary()}
 }catch(err){hasUnsaved=true;state.textContent='Save error: '+err.message;state.className='saveState error'}
 finally{savingAll=false;$('saveAll').disabled=false}
}
async function deleteEntry(date,id){
 const e=emp(id),d=getDraft(date,id),key=rowKey(date,id);
 if(!confirm('Delete '+e.name+' attendance and timing entry for '+fmtDate(date)+'? This cannot be undone.'))return;
 const errors=[];
 if(d.record){const {error}=await db.from('daily_records').delete().eq('id',d.record.id);if(error)errors.push('timing: '+error.message)}
 if(!errors.length){const {error}=await db.from('attendance').delete().eq('work_date',date).eq('employee_id',id);if(error)errors.push('attendance: '+error.message)}
 if(errors.length){$('saveState').textContent='Delete incomplete for '+e.name+' '+date+': '+errors.join('; ');$('saveState').className='saveState error';return}
 dirtyDrafts.delete(key);drafts.delete(key);recordMap.delete(key);attendanceMap.delete(key);
 rebuildGrandTotals();renderRegister();$('saveState').textContent='Deleted '+e.name+' '+date;$('saveState').className='saveState ok';
}
function exportEmployee(){
 if(hasUnsaved){alert('Please save changes before exporting payroll data.');return}
 const wb=XLSX.utils.book_new(),used=new Set();
 employees.filter(e=>e.active).forEach(e=>{
   const rows=datesForMonth().map(date=>{const d=getDraft(date,e.id);return {Date:fmtDate(date),IN:d.in_time,UT:fmtMin(d.ut),OUT:isVarinder(e)?d.final_out:d.out_time,SL:fmtMin(d.sl),OT:fmtMin(d.ot),Attendance:d.status}});
   const ws=XLSX.utils.json_to_sheet(rows,{header:['Date','IN','UT','OUT','SL','OT','Attendance']});
   const personTotals={ot:0,ut:0,sl:0};
   rows.forEach(r=>{
     personTotals.ut+=parseAdj(r.UT)||0;
     personTotals.sl+=parseAdj(r.SL)||0;
     personTotals.ot+=parseAdj(r.OT)||0;
   });
   XLSX.utils.sheet_add_json(ws,[{
     Date:'TOTAL',
     IN:'',
     UT:fmtMin(personTotals.ut),
     OUT:'',
     SL:fmtMin(personTotals.sl),
     OT:fmtMin(personTotals.ot),
     Attendance:''
   }],{skipHeader:true,origin:-1});
   ws['!cols']=[{wch:12},{wch:9},{wch:9},{wch:9},{wch:9},{wch:20}];
   let name=(e.name||'Employee').replace(/[\\/?*\[\]:]/g,' ').slice(0,31)||'Employee',base=name,n=2;
   while(used.has(name)){name=(base.slice(0,27)+' '+n++).slice(0,31)}used.add(name);
   XLSX.utils.book_append_sheet(wb,ws,name);
 });
 const grandRows=employees.filter(e=>e.active).map(e=>{let ot=0,ut=0,sl=0;datesForMonth().forEach(date=>{const d=getDraft(date,e.id);ot+=+d.ot||0;ut+=+d.ut||0;sl+=+d.sl||0});return {Employee:e.name,OT:fmtMin(ot),UT:fmtMin(ut),SL:fmtMin(sl)}});
 const totals=grandRows.reduce((a,r)=>{a.ot+=(parseAdj(r.OT)||0);a.ut+=(parseAdj(r.UT)||0);a.sl+=(parseAdj(r.SL)||0);return a},{ot:0,ut:0,sl:0});
 grandRows.push({Employee:'GRAND TOTAL',OT:fmtMin(totals.ot),UT:fmtMin(totals.ut),SL:fmtMin(totals.sl)});
 const totalWs=XLSX.utils.json_to_sheet(grandRows,{header:['Employee','OT','UT','SL']});
 totalWs['!cols']=[{wch:24},{wch:12},{wch:12},{wch:12}];
 XLSX.utils.book_append_sheet(wb,totalWs,'Grand Total');
 XLSX.writeFile(wb,'FCS_Attendance_'+month+'.xlsx');
}
(async()=>{
 const {data:{session}}=await db.auth.getSession();
 if(!session){root.innerHTML='<main class="app"><div class="card login"><div class="loginBrand"><div class="brandMark">FCS</div><div><h1>FCS Attendance</h1><p>Admin Portal</p></div></div><div class="loginLine"></div><label>Email</label><input id="email" type="email" autocomplete="username"><label>Password</label><input id="password" type="password" autocomplete="current-password"><button id="login" class="btn primary">Login</button><button id="back" class="btn">Back</button><p id="msg"></p></div></main>';$('back').onclick=()=>location.href='./';$('login').onclick=async()=>{const {error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error){$('msg').textContent=error.message;$('msg').className='error'}else location.reload()};return}
 try{await loadData();shell(session.user)}catch(e){if(/JWT issued at future|issued at future|JWT/i.test(String(e.message||''))){await db.auth.signOut();location.reload();return}root.innerHTML='<div class="app"><div class="card"><h2>Could not load Admin</h2><p class="error">'+esc(e.message)+'</p><button class="btn" onclick="location.href=\'./\'">Back</button></div></div>'}
})();
