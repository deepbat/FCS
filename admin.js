const SUPABASE_URL='https://raesuqidwkcpylvqiftf.supabase.co';
const SUPABASE_KEY='sb_publishable_IDPqntwDZCE5O5qsakvfTA_dGcex6zF';
const db=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const root=document.getElementById('root');
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
let employees=[],rules=[],holidays=[],records=[],attendance=[];
let drafts=new Map(), activeEmployee=0, currentTab='attendance', currentMode='register', month=new Date().toISOString().slice(0,7);

const fmtDate=s=>{const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?m[3]+'/'+m[2]+'/'+m[1]:s};
const fmtMin=n=>{n=Math.max(0,Math.round(Number(n)||0));return Math.floor(n/60)+'h '+String(n%60).padStart(2,'0')+'m'};
const mins=t=>{if(!t)return null;const p=String(t).slice(0,5).split(':').map(Number);return p[0]*60+p[1]};
const time=t=>t?String(t).slice(0,5):'';
const normalize=t=>{t=String(t||'').trim().toLowerCase().replace(/\s+/g,'').replace(/\./g,':');let m=t.match(/^(\d{1,2}):(\d{1,2})(am|pm)?$/);if(m){let h=+m[1],n=+m[2];if(n>59)return '';if(m[3]){if(h<1||h>12)return '';if(m[3]==='am'&&h===12)h=0;if(m[3]==='pm'&&h!==12)h+=12}else if(h>23)return '';return String(h).padStart(2,'0')+':'+String(n).padStart(2,'0')}m=t.match(/^(\d{1,2})(\d{2})$/);return m&&+m[1]<=23&&+m[2]<=59?String(+m[1]).padStart(2,'0')+':'+m[2]:/^\d{1,2}$/.test(t)&&+t<=23?String(+t).padStart(2,'0')+':00':''};
const range=m=>{const [y,mo]=m.split('-').map(Number),nmo=mo===12?1:mo+1,ny=mo===12?y+1:y;return [m+'-01',ny+'-'+String(nmo).padStart(2,'0')+'-01']};
function emp(id){return employees.find(e=>e.id===id)}
function hol(date){return holidays.find(h=>h.holiday_date===date)}
function isSunday(date){return new Date(date+'T12:00:00').getDay()===0}
function ruleFor(e){return rules.find(r=>r.category===e.category)||{}}
function calc(e,rec,date){
  if(!rec?.in_time||!rec?.out_time)return {ut:0,sl:0,ot:0,worked:0,elapsed:0};
  const r=ruleFor(e), a=mins(rec.in_time), b=mins(rec.out_time);
  let elapsed;
  if(e.split_shift){const c=mins(rec.in_time_2),d=mins(rec.out_time_2);elapsed=(b-a)+(c!=null&&d!=null?d-c:0);if(rec.round_minutes)elapsed=Math.round(elapsed/rec.round_minutes)*rec.round_minutes}
  else elapsed=b>=a?b-a:b+1440-a;
  const special=e.name==='Gautam'&&e.category==='Gateman';
  let ut=0,sl=0;
  if(!isSunday(date)&&!hol(date)){
    if((e.category==='Driver'||e.category==='Gateman')&&a<520)ut=Math.floor((540-a)/30)*30;
    if(special){ut=a<450?Math.floor((540-a)/30)*30:Math.max(0,540-a);sl=Math.max(0,a-450)}
    else sl=Math.max(0,a-(mins(r.normal_start)||540));
  }
  const otEligible=e.category==='Driver'||e.category==='Gateman';
  let ot=0;
  if(otEligible){
    if(isSunday(date)||hol(date))ot=elapsed;
    else if(elapsed>((e.normal_work_minutes||0)+(r.ot_threshold_minutes||15)))ot=elapsed-(e.normal_work_minutes||0);
  }
  const worked=e.split_shift?elapsed:Math.max(0,elapsed-(e.break_minutes||0));
  return {ut,sl,ot,worked,elapsed};
}
function statusFor(e,date,rec,existing){
  if(existing)return existing.status;
  if(isSunday(date))return 'Sunday';
  if(hol(date))return 'Holiday';
  if(!rec?.in_time||!rec?.out_time)return '';
  if(e.category==='Staff'){
    const a=mins(rec.in_time),b=mins(rec.out_time);
    if(a<=570&&b<=795)return 'Second Half Leave';
    if(a>=825&&b>=1035)return 'First Half Leave';
  }
  return 'Present';
}
function rowKey(date,id){return date+'|'+id}
function getDraft(date,id){
  const key=rowKey(date,id);if(drafts.has(key))return drafts.get(key);
  const r=records.find(x=>x.work_date===date&&x.employee_id===id),a=attendance.find(x=>x.work_date===date&&x.employee_id===id),e=emp(id);
  const c=calc(e,r,date);const d={date,id,in_time:time(r?.in_time),out_time:time(r?.out_time),in_time_2:time(r?.in_time_2),out_time_2:time(r?.out_time_2),ut:c.ut,sl:c.sl,ot:c.ot,status:statusFor(e,date,r,a),ut_override:r?.ut_override_minutes,sl_override:r?.sl_override_minutes,ot_override:r?.ot_override_minutes,record:r,attendance:a};
  drafts.set(key,d);return d;
}
function parseAdj(v){v=String(v||'').trim().toLowerCase();if(!v)return null;const m=v.match(/^(\d+)h\s*(\d{1,2})m$/);if(m)return +m[1]*60+(+m[2]||0);if(/^\d+$/.test(v))return +v;return null}
function markUnsaved(){const s=$('saveState');if(s){s.textContent='Unsaved changes';s.className='saveState error'}}
async function loadData(){
  const [er,rr,hr,dr,ar]=await Promise.all([
    db.from('employees').select('*').order('employee_code'),
    db.from('category_rules').select('*').order('category'),
    db.from('holidays').select('*').order('holiday_date'),
    db.from('daily_records').select('*').order('work_date,employee_id'),
    db.from('attendance').select('*').order('work_date,employee_id')
  ]);
  if(er.error||rr.error||hr.error||dr.error||ar.error)throw new Error([er.error,rr.error,hr.error,dr.error,ar.error].filter(Boolean).map(x=>x.message).join('; '));
  employees=er.data||[];rules=rr.data||[];holidays=hr.data||[];records=dr.data||[];attendance=ar.data||[];
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
return '<div class="toolbar noPrint"><label style="margin:0">Month <input id="month" type="month" value="'+month+'"></label><div class="personTabs">'+employees.filter(e=>e.active).map((e,i)=>'<button class="btn personTab '+(i===activeEmployee?'active':'')+'" data-person="'+i+'">'+esc(e.name)+'</button>').join('')+'</div><button id="print" class="btn">Print</button><button id="excel" class="btn">Excel - All People</button></div>'
}
function datesForMonth(){
 const [start,end]=range(month);let cutoff=month===new Date().toISOString().slice(0,7)?new Date().toISOString().slice(0,10):end;
 const entered=records.map(r=>r.work_date).concat(attendance.map(a=>a.work_date)).filter(d=>d>=start&&d<end).sort();
 if(month===new Date().toISOString().slice(0,7)&&entered.length)cutoff=entered[entered.length-1];
 if(month!==new Date().toISOString().slice(0,7))cutoff=end;
 const out=[];let d=new Date(start+'T12:00:00'),z=new Date(cutoff+'T12:00:00');while(d<z){out.push(d.toISOString().slice(0,10));d.setDate(d.getDate()+1)}return out;
}
function renderRegister(){
 const active=employees.filter(e=>e.active);if(activeEmployee>=active.length)activeEmployee=0;const e=active[activeEmployee];
 $('register').innerHTML=monthToolbar()+'<div id="printTitle" class="summary">'+esc(e?.name||'')+' - Attendance Register - '+month+'</div><div id="regSummary" class="summary"></div><div class="tablewrap"><table id="regTable"></table></div>';
 $('month').onchange=e=>{month=e.target.value;activeEmployee=0;renderRegister()};
 document.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>{activeEmployee=+b.dataset.person;renderRegister()});
 $('print').onclick=()=>window.print();
 $('excel').onclick=exportEmployee;
 if(!e){$('regTable').innerHTML='<tbody><tr><td>No active employees.</td></tr></tbody>';return}
 const rows=datesForMonth(),isSplit=e.split_shift;
 let h='<thead><tr><th>Date</th><th>IN</th>'+(isSplit?'<th>IN 2</th>':'')+'<th>UT</th><th>OUT</th>'+(isSplit?'<th>OUT 2</th>':'')+'<th>SL</th><th>OT</th><th>Attendance</th></tr></thead><tbody>';
 rows.forEach(date=>{const d=getDraft(date,e.id);const rowClass=d.status==='Sunday'?'sundayRow':d.status==='Holiday'?'holidayRow':['Leave','Full Day Leave','First Half Leave','Second Half Leave','Half Day'].includes(d.status)?'leaveRow':d.status==='Absent'?'absentRow':d.status==='Present'?'presentRow':'';h+='<tr class="'+rowClass+'" data-date="'+date+'"><td>'+fmtDate(date)+'</td><td><input data-f="in_time" value="'+esc(d.in_time)+'"></td>'+(isSplit?'<td><input data-f="in_time_2" value="'+esc(d.in_time_2)+'"></td>':'')+'<td><input data-f="ut" value="'+esc(fmtMin(d.ut))+'"></td><td><input data-f="out_time" value="'+esc(d.out_time)+'"></td>'+(isSplit?'<td><input data-f="out_time_2" value="'+esc(d.out_time_2)+'"></td>':'')+'<td><input data-f="sl" value="'+esc(fmtMin(d.sl))+'"></td><td><input data-f="ot" value="'+esc(fmtMin(d.ot))+'"></td><td><select data-f="status">'+['','Present','Absent','Leave','Half Day','First Half Leave','Second Half Leave','Full Day Leave','Holiday','Sunday'].map(x=>'<option '+(x===d.status?'selected':'')+'>'+x+'</option>').join('')+'</select></td></tr>'});
 h+='</tbody>';$('regTable').innerHTML=h;
 document.querySelectorAll('#regTable tr[data-date]').forEach(tr=>tr.querySelectorAll('[data-f]').forEach(el=>el.addEventListener('change',()=>editCell(tr,e))));
 updateRegSummary(e,rows);
}
function editCell(tr,e){
 const date=tr.dataset.date,d=getDraft(date,e.id);
 tr.querySelectorAll('[data-f]').forEach(el=>{
   const f=el.dataset.f,v=el.value;
   if(['in_time','out_time','in_time_2','out_time_2'].includes(f))d[f]=normalize(v);
   else if(['ut','sl','ot'].includes(f)){const n=parseAdj(v);if(n!=null){d[f]=n;d[f+'_override']=n}}
   else d[f]=v;
 });
 const c=calc({...e},{...d},date);
 if(d.ut_override==null)d.ut=c.ut;
 if(d.sl_override==null)d.sl=c.sl;
 if(d.ot_override==null)d.ot=c.ot;
 markUnsaved();renderRowValues(tr,d);updateRegSummary(e,datesForMonth());
}
function renderRowValues(tr,d){['ut','sl','ot'].forEach(f=>{const x=tr.querySelector('[data-f="'+f+'"]');if(x)x.value=fmtMin(d[f])})}
function updateRegSummary(e,rows){let ot=0,ut=0,sl=0;rows.forEach(d=>{const x=getDraft(d,e.id);ot+=+x.ot||0;ut+=+x.ut||0;sl+=+x.sl||0});$('regSummary').textContent='OT: '+fmtMin(ot)+'   UT: '+fmtMin(ut)+'   SL: '+fmtMin(sl)}
function renderSummary(){
 const active=employees.filter(e=>e.active),dates=datesForMonth();
 let h='<div class="toolbar noPrint"><label style="margin:0">Month <input id="summaryMonth" type="month" value="'+month+'"></label><button id="summaryPrint" class="btn">Print</button></div><div class="tablewrap"><table><thead><tr><th>Employee</th><th>Present Days</th><th>Half Day</th><th>Leave</th><th>Absent</th><th>Sunday</th><th>Holiday</th></tr></thead><tbody>';
 active.forEach(e=>{const counts={Present:0,'Half Day':0,Leave:0,Absent:0,Sunday:0,Holiday:0};dates.forEach(d=>{const a=attendance.find(x=>x.work_date===d&&x.employee_id===e.id),r=records.find(x=>x.work_date===d&&x.employee_id===e.id),s=statusFor(e,d,r,a);if(s==='First Half Leave'||s==='Second Half Leave'||s==='Half Day'){counts['Half Day']++;counts.Present+=0.5}else if(s==='Full Day Leave'||s==='Leave')counts.Leave++;else if(counts[s]!=null){counts[s]++;if(s==='Present')counts.Present+=0}});h+='<tr><td>'+esc(e.name)+'</td><td>'+counts.Present+'</td><td>'+counts['Half Day']+'</td><td>'+counts.Leave+'</td><td>'+counts.Absent+'</td><td>'+counts.Sunday+'</td><td>'+counts.Holiday+'</td></tr>'});
 h+='</tbody></table></div>';$('summary').innerHTML=h;$('summaryMonth').onchange=e=>{month=e.target.value;renderSummary()};$('summaryPrint').onclick=()=>window.print();
}
function renderEmployees(){
 $('employeesSection').innerHTML='<div class="card"><h3>Add Employee</h3><div class="grid"><input id="newCode" placeholder="Employee code"><input id="newName" placeholder="Employee name"><select id="newCat"><option>Staff</option><option>Driver</option><option>Gardener</option><option>Gateman</option></select><button id="addEmp" class="btn primary">Add</button></div><p id="empMsg" class="message"></p></div><div class="tablewrap"><table><thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Active</th><th>Normal Minutes</th><th>Break</th></tr></thead><tbody>'+employees.map(e=>'<tr><td>'+esc(e.employee_code)+'</td><td>'+esc(e.name)+'</td><td>'+esc(e.category)+'</td><td><input type="checkbox" data-active="'+e.id+'" '+(e.active?'checked':'')+'></td><td><input data-normal="'+e.id+'" value="'+(e.normal_work_minutes||0)+'"></td><td><input data-break="'+e.id+'" value="'+(e.break_minutes||0)+'"></td></tr>').join('')+'</tbody></table></div>';
 $('addEmp').onclick=async()=>{const code=$('newCode').value.trim(),name=$('newName').value.trim(),category=$('newCat').value;if(!code||!name)return;$('addEmp').disabled=true;const r=ruleFor({category});const {error}=await db.from('employees').insert({employee_code:code,name,category,normal_work_minutes:r.normal_work_minutes||525,break_minutes:r.break_minutes||0,active:true});if(error){$('empMsg').textContent=error.message;$('empMsg').className='message error'}else{await loadData();renderEmployees();renderRegister()}};
 document.querySelectorAll('[data-active]').forEach(x=>x.onchange=()=>{const e=emp(x.dataset.active);e.active=x.checked;markUnsaved()});
 document.querySelectorAll('[data-normal]').forEach(x=>x.onchange=()=>{const e=emp(x.dataset.normal);e.normal_work_minutes=+x.value||0;markUnsaved()});
 document.querySelectorAll('[data-break]').forEach(x=>x.onchange=()=>{const e=emp(x.dataset.break);e.break_minutes=+x.value||0;markUnsaved()});
}
function renderHolidays(){
 $('holidaysSection').innerHTML='<div class="card"><h3>Add Holiday</h3><div class="grid"><input id="hd" type="date"><input id="hn" placeholder="Holiday name"><span></span><button id="addHol" class="btn primary">Add</button></div></div><div class="tablewrap"><table><thead><tr><th>Date</th><th>Name</th><th>Action</th></tr></thead><tbody>'+holidays.map(h=>'<tr><td>'+fmtDate(h.holiday_date)+'</td><td>'+esc(h.name)+'</td><td><button class="btn" data-delhol="'+h.id+'">Delete</button></td></tr>').join('')+'</tbody></table></div>';
 $('addHol').onclick=async()=>{if(!$('hd').value||!$('hn').value.trim())return;const {error}=await db.from('holidays').insert({holiday_date:$('hd').value,name:$('hn').value.trim()});if(!error){await loadData();renderHolidays()}};
 document.querySelectorAll('[data-delhol]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this holiday?'))return;await db.from('holidays').delete().eq('id',b.dataset.delhol);await loadData();renderHolidays()});
}
function renderSettings(){
 $('settingsSection').innerHTML='<div class="card"><h3>Category Rules</h3><div class="tablewrap"><table><thead><tr><th>Category</th><th>Start</th><th>End</th><th>Normal Minutes</th><th>Break</th><th>OT</th><th>Threshold</th></tr></thead><tbody>'+rules.map(r=>'<tr><td>'+esc(r.category)+'</td><td><input data-r="start" data-cat="'+esc(r.category)+'" value="'+time(r.normal_start)+'"></td><td><input data-r="end" data-cat="'+esc(r.category)+'" value="'+time(r.normal_end)+'"></td><td><input data-r="normal" data-cat="'+esc(r.category)+'" value="'+(r.normal_work_minutes||0)+'"></td><td><input data-r="break" data-cat="'+esc(r.category)+'" value="'+(r.break_minutes||0)+'"></td><td><input type="checkbox" data-r="ot" data-cat="'+esc(r.category)+'" '+(r.ot_eligible?'checked':'')+'></td><td><input data-r="threshold" data-cat="'+esc(r.category)+'" value="'+(r.ot_threshold_minutes||15)+'"></td></tr>').join('')+'</tbody></table></div></div>';
 document.querySelectorAll('[data-r]').forEach(x=>x.onchange=()=>{const r=ruleFor({category:x.dataset.cat}),f=x.dataset.r;r[f==='start'?'normal_start':f==='end'?'normal_end':f==='normal'?'normal_work_minutes':f==='break'?'break_minutes':f==='ot'?'ot_eligible':'ot_threshold_minutes']=x.type==='checkbox'?x.checked:x.value;markUnsaved()});
}
async function saveAll(){
 const s=$('saveState');s.textContent='Saving...';s.className='saveState';
 try{
  for(const e of employees)await db.from('employees').update({active:e.active,normal_work_minutes:e.normal_work_minutes,break_minutes:e.break_minutes}).eq('id',e.id);
  for(const r of rules)await db.from('category_rules').update({normal_start:r.normal_start,normal_end:r.normal_end,normal_work_minutes:+r.normal_work_minutes||0,break_minutes:+r.break_minutes||0,ot_eligible:!!r.ot_eligible,ot_threshold_minutes:+r.ot_threshold_minutes||15}).eq('category',r.category);
  for(const d of drafts.values()){
    const e=emp(d.id);if(!e)continue;
    const it=normalize(d.in_time),ot=normalize(d.out_time),it2=normalize(d.in_time_2),ot2=normalize(d.out_time_2);
    const existing=d.record;
    if(!it&&!ot){
      if(existing)await db.from('daily_records').delete().eq('id',existing.id);
      await db.from('attendance').delete().eq('work_date',d.date).eq('employee_id',d.id);
      continue;
    }
    const c=calc(e,{...d,in_time:it,out_time:ot,in_time_2:it2,out_time_2:ot2},d.date);
    const p={work_date:d.date,employee_id:d.id,in_time:it,out_time:ot,in_time_2:e.split_shift?it2:null,out_time_2:e.split_shift?ot2:null,break_minutes:e.break_minutes||0,normal_work_minutes:e.normal_work_minutes||0,ot_eligible:e.category==='Driver'||e.category==='Gateman',ot_threshold_minutes:15,round_minutes:e.round_minutes||0,full_day_ot:isSunday(d.date)||!!hol(d.date),total_elapsed_minutes:c.elapsed,worked_minutes:c.worked,ut_minutes:d.ut_override!=null?d.ut_override:c.ut,sl_minutes:d.sl_override!=null?d.sl_override:c.sl,ot_minutes:d.ot_override!=null?d.ot_override:c.ot,ut_override_minutes:d.ut_override,sl_override_minutes:d.sl_override,ot_override_minutes:d.ot_override,updated_at:new Date().toISOString()};
    if(existing)await db.from('daily_records').update(p).eq('id',existing.id);else await db.from('daily_records').insert({...p,client_id:crypto.randomUUID()});
    await db.from('attendance').upsert({work_date:d.date,employee_id:d.id,status:d.status||statusFor(e,d.date,d,null),updated_at:new Date().toISOString()},{onConflict:'work_date,employee_id'});
  }
  drafts.clear();await loadData();s.textContent='All changes saved';s.className='saveState ok';renderRegister();
 }catch(err){s.textContent='Save error: '+err.message;s.className='saveState error'}
}
function exportEmployee(){
 const wb=XLSX.utils.book_new(),used=new Set();
 employees.filter(e=>e.active).forEach(e=>{
   const rows=datesForMonth().map(date=>{const d=getDraft(date,e.id);return {Date:fmtDate(date),IN:d.in_time,UT:fmtMin(d.ut),OUT:d.out_time,SL:fmtMin(d.sl),OT:fmtMin(d.ot),Attendance:d.status}});
   const ws=XLSX.utils.json_to_sheet(rows,{header:['Date','IN','UT','OUT','SL','OT','Attendance']});
   ws['!cols']=[{wch:12},{wch:9},{wch:9},{wch:9},{wch:9},{wch:9},{wch:20}];
   let name=(e.name||'Employee').replace(/[\\/?*\[\]:]/g,' ').slice(0,31)||'Employee',base=name,n=2;
   while(used.has(name)){name=(base.slice(0,27)+' '+n++).slice(0,31)}used.add(name);
   XLSX.utils.book_append_sheet(wb,ws,name);
 });
 XLSX.writeFile(wb,'FCS_Attendance_'+month+'.xlsx');
}
(async()=>{
 const {data:{session}}=await db.auth.getSession();
 if(!session){root.innerHTML='<main class="app"><div class="card login"><h1>FCS Attendance</h1><p>Admin Login</p><label>Email</label><input id="email" type="email" autocomplete="username"><label>Password</label><input id="password" type="password" autocomplete="current-password"><button id="login" class="btn primary">Login</button><button id="back" class="btn">Back</button><p id="msg"></p></div></main>';$('back').onclick=()=>location.href='./';$('login').onclick=async()=>{const {error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error){$('msg').textContent=error.message;$('msg').className='error'}else location.reload()};return}
 try{await loadData();shell(session.user)}catch(e){root.innerHTML='<div class="app"><div class="card"><h2>Could not load Admin</h2><p class="error">'+esc(e.message)+'</p><button class="btn" onclick="location.href=\'./\'">Back</button></div></div>'}
})();