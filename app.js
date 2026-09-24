const SUPABASE_URL='https://raesuqidwkcpylvqiftf.supabase.co';
const SUPABASE_KEY='sb_publishable_IDPqntwDZCE5O5qsakvfTA_dGcex6zF';
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmtMin=m=>{m=Math.max(0,Math.round(Number(m)||0));return Math.floor(m/60)+'h '+String(m%60).padStart(2,'0')+'m'};
const today=()=>{const d=new Date();return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const monthNow=()=>today().slice(0,7);
const monthRange=m=>{const d=new Date(m+'-01T00:00:00');return {start:m+'-01',end:new Date(d.getFullYear(),d.getMonth()+1,1).toISOString().slice(0,10)}};

let employees=[],rules=[];
const DB_NAME='fcs-attendance-local',STORE='pending',CACHE_KEY='fcs-attendance-cache';

function openLocal(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:'client_id'});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function localPut(x){const d=await openLocal();return new Promise((res,rej)=>{const t=d.transaction(STORE,'readwrite');t.objectStore(STORE).put(x);t.oncomplete=res;t.onerror=()=>rej(t.error)})}
async function localAll(){const d=await openLocal();return new Promise((res,rej)=>{const t=d.transaction(STORE,'readonly');const q=t.objectStore(STORE).getAll();q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
async function localDelete(id){const d=await openLocal();return new Promise((res,rej)=>{const t=d.transaction(STORE,'readwrite');t.objectStore(STORE).delete(id);t.oncomplete=res;t.onerror=()=>rej(t.error)})}
async function updatePending(){const q=await localAll();$('pendingCount').textContent=q.length?q.length+' pending sync':''}
function saveCache(){localStorage.setItem(CACHE_KEY,JSON.stringify({employees,rules}))}
function loadCache(){try{const x=JSON.parse(localStorage.getItem(CACHE_KEY)||'{}');employees=x.employees||[];rules=x.rules||[]}catch{}}

async function syncQueue(){
  if(!navigator.onLine)return;
  const q=await localAll();if(!q.length){await updatePending();$('syncStatus').textContent='Synced';return}
  $('syncStatus').textContent='Syncing...';
  for(const row of q){
    const {error}=await db.from('daily_records').insert(row);
    if(!error||error.code==='23505')await localDelete(row.client_id);
  }
  await updatePending();$('syncStatus').textContent='Synced';
}
window.addEventListener('online',syncQueue);
window.addEventListener('offline',()=>{$('syncStatus').textContent='Offline'});

async function loadEmployees(){
  const {data,error}=await db.from('employees').select('id,employee_code,name,category,active').eq('active',true).order('name');
  if(error){loadCache();renderGateEmployees();return}
  employees=data||[];saveCache();renderGateEmployees();
}
function renderGateEmployees(){
  $('employee').innerHTML=employees.length?employees.map(e=>'<option value="'+e.id+'">'+esc(e.name)+' ('+esc(e.category)+')</option>').join(''):'<option value="">No employees added yet</option>';
}
async function loadRules(){
  const {data,error}=await db.from('category_rules').select('*').order('category');
  if(error){loadCache();return}
  rules=data||[];saveCache();
}

async function saveGate(){
  const work_date=$('workDate').value,employee_id=$('employee').value,in_time=$('inTime').value,out_time=$('outTime').value;
  if(!work_date||!employee_id||!in_time||!out_time){$('message').textContent='Please enter date, employee, IN and OUT.';return}
  const emp=employees.find(e=>e.id===employee_id),rule=rules.find(r=>r.category===emp?.category);
  const row={client_id:crypto.randomUUID(),work_date,employee_id,in_time:in_time+':00',out_time:out_time+':00',break_minutes:rule?.break_minutes??0,normal_work_minutes:rule?.normal_work_minutes??525,ot_eligible:rule?.ot_eligible??false,ot_threshold_minutes:rule?.ot_threshold_minutes??15};
  $('saveBtn').disabled=true;$('message').textContent='Saving...';
  const {error}=await db.from('daily_records').insert(row);
  if(!error){
    $('message').textContent='Saved successfully';$('inTime').value='';$('outTime').value='';await updatePending();$('saveBtn').disabled=false;return;
  }
  if(error.code==='23505'){$('message').textContent='This employee already has a record for this date.';$('saveBtn').disabled=false;return}
  await localPut(row);await updatePending();$('message').textContent='Saved on phone. It will sync when internet is available.';$('saveBtn').disabled=false;
}

function show(id){['gateView','loginView','adminView'].forEach(x=>$(x).classList.toggle('hidden',x!==id))}
async function checkSession(){
  const {data}=await db.auth.getSession();
  if(data.session){$('adminUser').textContent=data.session.user.email||'';show('adminView');await loadAdmin()}
  else show('gateView');
}
async function login(){const {error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});$('loginMessage').textContent=error?error.message:'Logged in';if(!error)await checkSession()}
async function signup(){const {data,error}=await db.auth.signUp({email:$('email').value.trim(),password:$('password').value});$('loginMessage').textContent=error?error.message:(data.session?'Account created and logged in':'Account created. Check email if confirmation is required.')}
async function loadAdmin(){await Promise.all([loadEmployeesAdmin(),loadRulesAdmin(),loadHolidays(),loadRecords(),loadAttendance()])}

async function loadRecords(){
  const {start,end}=monthRange($('monthFilter').value||monthNow());
  const {data,error}=await db.from('daily_records').select('id,work_date,in_time,out_time,worked_minutes,ot_minutes,employees(name,category)').gte('work_date',start).lt('work_date',end).order('work_date');
  if(error){$('recordsTable').innerHTML='<tr><td>'+esc(error.message)+'</td></tr>';return}
  const rows=data||[],ot=rows.reduce((a,r)=>a+(r.ot_minutes||0),0);
  $('recordSummary').textContent=rows.length+' records | Total OT '+fmtMin(ot);
  $('recordsTable').innerHTML='<tr><th>Date</th><th>Employee</th><th>Category</th><th>IN</th><th>OUT</th><th>Worked</th><th>OT</th><th>Action</th></tr>'+
  rows.map(r=>'<tr><td>'+r.work_date+'</td><td>'+esc(r.employees?.name)+'</td><td>'+esc(r.employees?.category)+'</td><td>'+r.in_time.slice(0,5)+'</td><td>'+r.out_time.slice(0,5)+'</td><td>'+fmtMin(r.worked_minutes)+'</td><td>'+fmtMin(r.ot_minutes)+'</td><td><button class="secondary" onclick="editRecord(\\''+r.id+'\\',\\''+r.in_time.slice(0,5)+'\\',\\''+r.out_time.slice(0,5)+'\\')">Edit</button></td></tr>').join('');
  await loadMonthlySummary(start,end,rows);
}
async function loadMonthlySummary(start,end,rows){
  const [{data:emps},{data:att},{data:hols}]=await Promise.all([
    db.from('employees').select('id,name,category').order('name'),
    db.from('attendance').select('work_date,employee_id,status').gte('work_date',start).lt('work_date',end),
    db.from('holidays').select('holiday_date').gte('holiday_date',start).lt('holiday_date',end)
  ]);
  const attMap=new Map((att||[]).map(x=>[x.work_date+'|'+x.employee_id,x.status]));
  const holidays=new Set((hols||[]).map(x=>x.holiday_date));
  const byEmp=new Map();
  for(const r of rows){
    const id=r.employees?.name+'|'+r.employees?.category;
    const x=byEmp.get(id)||{name:r.employees?.name||'',category:r.employees?.category||'',records:0,worked:0,ot:0};
    x.records++;x.worked+=Number(r.worked_minutes)||0;x.ot+=Number(r.ot_minutes)||0;byEmp.set(id,x);
  }
  const d=new Date(start+'T00:00:00'),y=d.getFullYear(),mo=d.getMonth(),days=new Date(y,mo+1,0).getDate();
  for(const e of emps||[]){
    const id=e.name+'|'+e.category,x=byEmp.get(id)||{name:e.name,category:e.category,records:0,worked:0,ot:0};
    x.present=0;x.absent=0;x.leave=0;x.half=0;x.holiday=0;x.sunday=0;
    for(let day=1;day<=days;day++){
      const ds=y+'-'+String(mo+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');
      const status=attMap.get(ds+'|'+e.id)||(holidays.has(ds)?'Holiday':(new Date(ds+'T00:00:00').getDay()===0?'Sunday':''));
      if(status==='Present')x.present++;
      else if(status==='Absent')x.absent++;
      else if(status==='Leave')x.leave++;
      else if(status==='Half Day')x.half++;
      else if(status==='Holiday')x.holiday++;
      else if(status==='Sunday')x.sunday++;
    }
    byEmp.set(id,x);
  }
  const summary=[...byEmp.values()];
  $('monthlySummaryTable').innerHTML='<tr><th>Employee</th><th>Category</th><th>Records</th><th>Worked</th><th>OT</th><th>Present</th><th>Absent</th><th>Leave</th><th>Half Day</th><th>Holiday</th><th>Sunday</th></tr>'+
    summary.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+esc(x.category)+'</td><td>'+x.records+'</td><td>'+fmtMin(x.worked)+'</td><td>'+fmtMin(x.ot)+'</td><td>'+x.present+'</td><td>'+x.absent+'</td><td>'+x.leave+'</td><td>'+x.half+'</td><td>'+x.holiday+'</td><td>'+x.sunday+'</td></tr>').join('');
}
window.editRecord=async(id,inTime,outTime)=>{
  const ni=prompt('First IN time',inTime),no=prompt('Last OUT time',outTime);
  if(!ni||!no)return;
  const {error}=await db.from('daily_records').update({in_time:ni.length===5?ni+':00':ni,out_time:no.length===5?no+':00':no}).eq('id',id);
  if(error)alert(error.message);else await loadRecords();
};

function downloadCSV(name,rows){
  const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();URL.revokeObjectURL(a.href);
}
async function exportRecords(){
  const m=$('monthFilter').value||monthNow(),{start,end}=monthRange(m);
  const {data}=await db.from('daily_records').select('work_date,in_time,out_time,worked_minutes,ot_minutes,employees(name,category)').gte('work_date',start).lt('work_date',end).order('work_date');
  downloadCSV('FCS-Overtime-'+m+'.csv',[['Date','Employee','Category','IN','OUT','Worked','OT'],...(data||[]).map(r=>[r.work_date,r.employees?.name,r.employees?.category,r.in_time.slice(0,5),r.out_time.slice(0,5),fmtMin(r.worked_minutes),fmtMin(r.ot_minutes)])]);
}

async function loadEmployeesAdmin(){
  const {data}=await db.from('employees').select('*').order('active',{ascending:false}).order('name');
  $('employeesTable').innerHTML='<tr><th>Code</th><th>Name</th><th>Category</th><th>Active</th><th>Action</th></tr>'+
  (data||[]).map(e=>'<tr><td>'+esc(e.employee_code)+'</td><td>'+esc(e.name)+'</td><td>'+esc(e.category)+'</td><td>'+e.active+'</td><td><button class="secondary" onclick="toggleEmployee(\''+e.id+'\','+(!e.active)+')">'+(e.active?'Disable':'Enable')+'</button></td></tr>').join('');
}
window.toggleEmployee=async(id,active)=>{const {error}=await db.from('employees').update({active}).eq('id',id);if(error)alert(error.message);else{await loadEmployeesAdmin();await loadEmployees()}};
async function addEmployee(){
  const employee_code=$('newCode').value.trim(),name=$('newName').value.trim(),category=$('newCategory').value;
  if(!employee_code||!name)return alert('Enter employee code and name.');
  const {error}=await db.from('employees').insert({employee_code,name,category});
  if(error)alert(error.message);else{$('newCode').value='';$('newName').value='';await loadEmployeesAdmin();await loadEmployees()}
}

async function loadHolidays(){
  const {data}=await db.from('holidays').select('*').order('holiday_date');
  $('holidaysTable').innerHTML='<tr><th>Date</th><th>Holiday</th><th></th></tr>'+
  (data||[]).map(h=>'<tr><td>'+h.holiday_date+'</td><td>'+esc(h.name)+'</td><td><button class="secondary" onclick="deleteHoliday(\''+h.id+'\')">Delete</button></td></tr>').join('');
}
window.deleteHoliday=async id=>{const {error}=await db.from('holidays').delete().eq('id',id);if(error)alert(error.message);else await loadHolidays()};
async function addHoliday(){
  const holiday_date=$('holidayDate').value,name=$('holidayName').value.trim();
  if(!holiday_date||!name)return alert('Enter date and holiday name.');
  const {error}=await db.from('holidays').insert({holiday_date,name});
  if(error)alert(error.message);else{$('holidayDate').value='';$('holidayName').value='';await loadHolidays()}
}

async function loadRulesAdmin(){
  const {data}=await db.from('category_rules').select('*').order('category');rules=data||[];
  $('rulesForm').innerHTML=rules.map(r=>'<div class="rule"><div class="cat">'+esc(r.category)+'</div><input data-cat="'+r.category+'" data-k="normal_start" value="'+(r.normal_start||'')+'" type="time"><input data-cat="'+r.category+'" data-k="normal_end" value="'+(r.normal_end||'')+'" type="time"><input data-cat="'+r.category+'" data-k="break_minutes" value="'+r.break_minutes+'" type="number" min="0" placeholder="Break min"><input data-cat="'+r.category+'" data-k="normal_work_minutes" value="'+(r.normal_work_minutes??'')+'" type="number" min="0" placeholder="Daily work min"></div>').join('');
  saveCache();
}
async function saveRules(){
  const inputs=[...document.querySelectorAll('#rulesForm input')],by={};
  inputs.forEach(i=>(by[i.dataset.cat]??=[]).push(i));
  for(const cat of Object.keys(by)){
    const v={};by[cat].forEach(i=>v[i.dataset.k]=i.value);
    const {error}=await db.from('category_rules').update({normal_start:v.normal_start||null,normal_end:v.normal_end||null,break_minutes:Number(v.break_minutes||0),normal_work_minutes:Number(v.normal_work_minutes||0)}).eq('category',cat);
    if(error){$('rulesMessage').textContent=error.message;return}
  }
  $('rulesMessage').textContent='Rules saved. New entries will use updated rules.';await loadRules();
}

async function loadAttendance(){
  const m=$('attendanceMonth').value||monthNow(),{start,end}=monthRange(m);
  const [{data:emps},{data:att},{data:hols}]=await Promise.all([
    db.from('employees').select('id,name,category').eq('active',true).order('name'),
    db.from('attendance').select('*').gte('work_date',start).lt('work_date',end),
    db.from('holidays').select('*').gte('holiday_date',start).lt('holiday_date',end)
  ]);
  const map=new Map((att||[]).map(x=>[x.work_date+'|'+x.employee_id,x])),holidayMap=new Map((hols||[]).map(x=>[x.holiday_date,x.name]));
  let html='<tr><th>Date</th><th>Employee</th><th>Status</th><th>Save</th></tr>';
  const d=new Date(start+'T00:00:00'),y=d.getFullYear(),mo=d.getMonth(),days=new Date(y,mo+1,0).getDate();
  for(let day=1;day<=days;day++){
    const ds=y+'-'+String(mo+1).padStart(2,'0')+'-'+String(day).padStart(2,'0'),dow=new Date(ds+'T00:00:00').getDay();
    for(const e of emps||[]){
      const existing=map.get(ds+'|'+e.id),defaultStatus=holidayMap.has(ds)?'Holiday':(dow===0?'Sunday':'');
      html+='<tr><td>'+ds+'</td><td>'+esc(e.name)+'</td><td><select id="a-'+ds+'-'+e.id+'"><option></option>'+['Present','Absent','Leave','Half Day','Holiday','Sunday'].map(s=>'<option '+((existing?.status||defaultStatus)===s?'selected':'')+'>'+s+'</option>').join('')+'</select></td><td><button class="secondary" onclick="saveAttendance(\''+ds+'\',\''+e.id+'\')">Save</button></td></tr>';
    }
  }
  $('attendanceTable').innerHTML=html;
}
window.saveAttendance=async(date,eid)=>{
  const status=$('a-'+date+'-'+eid).value;if(!status)return;
  const {error}=await db.from('attendance').upsert({work_date:date,employee_id:eid,status},{onConflict:'work_date,employee_id'});
  if(error)alert(error.message);
};
async function exportAttendance(){
  const m=$('attendanceMonth').value||monthNow(),{start,end}=monthRange(m);
  const {data}=await db.from('attendance').select('work_date,status,employees(name,category)').gte('work_date',start).lt('work_date',end).order('work_date');
  downloadCSV('FCS-Attendance-'+m+'.csv',[['Date','Employee','Category','Status'],...(data||[]).map(r=>[r.work_date,r.employees?.name,r.employees?.category,r.status])]);
}

function setupTabs(){
  document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.tabpane').forEach(x=>x.classList.add('hidden'));$(b.dataset.tab+'Tab').classList.remove('hidden')});
}

$('workDate').value=today();$('monthFilter').value=monthNow();$('attendanceMonth').value=monthNow();
$('saveBtn').onclick=saveGate;$('adminBtn').onclick=()=>show('loginView');$('backBtn').onclick=()=>show('gateView');$('loginBtn').onclick=login;$('signupBtn').onclick=signup;
$('logoutBtn').onclick=async()=>{await db.auth.signOut();show('gateView')};
$('refreshRecords').onclick=loadRecords;$('exportRecords').onclick=exportRecords;$('loadAttendance').onclick=loadAttendance;$('exportAttendance').onclick=exportAttendance;
$('addEmployee').onclick=addEmployee;$('addHoliday').onclick=addHoliday;$('saveRules').onclick=saveRules;setupTabs();

(async()=>{
  loadCache();await loadRules();await loadEmployees();await updatePending();await syncQueue();await checkSession();
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();