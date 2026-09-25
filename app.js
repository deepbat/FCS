const SUPABASE_URL='https://raesuqidwkcpylvqiftf.supabase.co';
const SUPABASE_KEY='sb_publishable_IDPqntwDZCE5O5qsakvfTA_dGcex6zF';
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function normalizeTime(v){
  v=String(v||'').trim().toLowerCase().replace(/\s+/g,'');
  const m=v.match(/^(\d{1,2}):(\d{2})(am|pm)?$/);
  if(m){
    let h=Number(m[1]),min=Number(m[2]);
    if(min>59)return '';
    if(m[3]){if(h<1||h>12)return '';if(m[3]==='am'&&h===12)h=0;if(m[3]==='pm'&&h!==12)h+=12;}
    else if(h>23)return '';
    return String(h).padStart(2,'0')+':'+String(min).padStart(2,'0');
  }
  const d=v.match(/^(\d{1,2})(\d{2})$/);
  if(d){const h=Number(d[1]),min=Number(d[2]);if(h<=23&&min<=59)return String(h).padStart(2,'0')+':'+String(min).padStart(2,'0');}
  if(/^\d{1,2}$/.test(v)){const h=Number(v);if(h<=23)return String(h).padStart(2,'0')+':00';}
  return '';
}
function setupTimeInput(id,defaultValue){
  const el=$(id);if(!el)return;
  el.value=defaultValue||'';
  el.inputMode='numeric';
  el.autocomplete='off';
  el.addEventListener('blur',()=>{if(el.value)el.value=normalizeTime(el.value)||el.value;});
}
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
  const work_date=$('workDate').value,employee_id=$('employee').value,in_time=normalizeTime($('inTime').value),out_time=normalizeTime($('outTime').value);
  if(!work_date||!employee_id||!in_time||!out_time){$('message').textContent='Please enter date, employee, IN and OUT.';return}
  const emp=employees.find(e=>e.id===employee_id),rule=rules.find(r=>r.category===emp?.category);
  const row={client_id:crypto.randomUUID(),work_date,employee_id,in_time:in_time+':00',out_time:out_time+':00',break_minutes:rule?.break_minutes??0,normal_work_minutes:rule?.normal_work_minutes??525,ot_eligible:rule?.ot_eligible??false,ot_threshold_minutes:rule?.ot_threshold_minutes??15};
  $('saveBtn').disabled=true;$('message').textContent='Saving...';
  const {error}=await db.from('daily_records').insert(row);
  if(!error){
    $('message').textContent='Saved successfully';$('inTime').value='09:00';$('outTime').value='';await updatePending();$('saveBtn').disabled=false;return;
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
  const m=$('monthFilter').value||monthNow(),{start:dateStart,end}=monthRange(m);
  const employeeId=$('recordEmployee').value;
  const [{data:emps},{data:rows,error},{data:att},{data:hols}]=await Promise.all([
    db.from('employees').select('id,name,category,normal_work_minutes,break_minutes,round_minutes,split_shift').eq('active',true).order('name'),
    db.from('daily_records').select('id,work_date,in_time,out_time,in_time_2,out_time_2,worked_minutes,ot_minutes,employee_id').gte('work_date',dateStart).lt('holiday_date',end).order('work_date'),
    db.from('attendance').select('work_date,employee_id,status').gte('work_date',dateStart).lt('work_date',end),
    db.from('holidays').select('holiday_date,name').gte('holiday_date',dateStart).lt('work_date',end)
  ]);
  if(error){$('recordsTable').innerHTML='<tr><td>'+esc(error.message)+'</td></tr>';return}
  const list=emps||[];
  const current=employeeId&&list.some(e=>e.id===employeeId)?employeeId:(list[0]?.id||'');
  $('recordEmployee').innerHTML=list.map(e=>'<option value="'+e.id+'" '+(e.id===current?'selected':'')+'>'+esc(e.name)+' ('+esc(e.category)+')</option>').join('');
  if(!current){$('recordSummary').textContent='No active employees';$('recordsTable').innerHTML='';return}
  const emp=list.find(e=>e.id===current);
  const records=(rows||[]).filter(r=>r.employee_id===current);
  const recordMap=new Map(records.map(r=>[r.work_date,r]));
  const attMap=new Map((att||[]).filter(x=>x.employee_id===current).map(x=>[x.work_date,x.status]));
  const holidayMap=new Map((hols||[]).map(x=>[x.holiday_date,x.name]));
  const d=new Date(dateStart+'T00:00:00'),y=d.getFullYear(),mo=d.getMonth(),days=new Date(y,mo+1,0).getDate();
  const split=!!emp.split_shift;
  const staffStatuses=['Present','First Half Leave','Second Half Leave','Full Day Leave'];
  const otherStatuses=['Present','Absent','Leave','Half Day','Holiday','Sunday'];
  let totalOt=0,totalWorked=0;
  let html='<tr><th>Date</th><th>Day</th><th>IN</th><th>OUT</th><th>Worked</th><th>OT</th><th>Attendance</th></tr>';
  for(let day=1;day<=days;day++){
    const ds=y+'-'+String(mo+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');
    const rec=recordMap.get(ds);
    let status=attMap.get(ds)||(holidayMap.has(ds)?'Holiday':(new Date(ds+'T00:00:00').getDay()===0?'Sunday':''));
    if(rec){totalOt+=Number(rec.ot_minutes)||0;totalWorked+=Number(rec.worked_minutes)||0}
    const dow=new Date(ds+'T00:00:00').toLocaleDateString('en-IN',{weekday:'short'});
    const input=(id,value,placeholder='')=>'<input class="timeEdit" type="text" inputmode="numeric" maxlength="5" autocomplete="off" id="'+id+'" value="'+(value||'')+'" placeholder="'+placeholder+'">';
    const statuses=emp.category==='Staff'?staffStatuses:otherStatuses;
    const statusSelect='<select class="attendanceEdit" data-date="'+ds+'" id="a-'+ds+'"><option></option>'+statuses.map(s=>'<option '+(status===s?'selected':'')+'>'+s+'</option>').join('')+'</select>';
    if(split){
      html+='<tr data-record-id="'+(rec?esc(rec.id):'')+'" data-record-date="'+ds+'"><td>'+ds+'</td><td>'+dow+'</td><td>'+input('in1-'+ds,rec?.in_time?.slice(0,5),'18:00')+'</td><td>'+input('out2-'+ds,rec?.out_time_2?.slice(0,5),'07:00')+'</td><td>'+(rec?fmtMin(rec.worked_minutes):'')+'</td><td>'+(rec?fmtMin(rec.ot_minutes):'')+'</td><td>'+statusSelect+'</td></tr>';
    }else{
      html+='<tr data-record-id="'+(rec?esc(rec.id):'')+'" data-record-date="'+ds+'"><td>'+ds+'</td><td>'+dow+'</td><td>'+input('in-'+ds,rec?.in_time?.slice(0,5))+'</td><td>'+input('out-'+ds,rec?.out_time?.slice(0,5))+'</td><td>'+(rec?fmtMin(rec.worked_minutes):'')+'</td><td>'+(rec?fmtMin(rec.ot_minutes):'')+'</td><td>'+statusSelect+'</td></tr>';
    }
  }
  $('printTitle').textContent=emp.name+' - '+emp.category+' - '+new Date(dateStart+'T00:00:00').toLocaleDateString('en-IN',{month:'long',year:'numeric'})+' OT Register';
  $('recordSummary').textContent=emp.name+' | '+emp.category+' | Total Worked '+fmtMin(totalWorked)+' | Total OT '+fmtMin(totalOt);
  $('recordsTable').innerHTML=html;
}
window.saveRecordRow=async(id,date,employee,emp)=>{
  const split=!!emp.split_shift;
  const ni=split?normalizeTime($('in1-'+date).value):normalizeTime($('in-'+date).value);
  const no=split?'01:00':normalizeTime($('out-'+date).value);
  const ni2=split?'06:00':'';
  const no2=split?normalizeTime($('out2-'+date).value):'';
  if(!ni||!no){alert('Please enter IN and OUT time.');return}
  if(split && ((ni2&&!no2)||(!ni2&&no2))){alert('Please enter both IN 2 and OUT 2, or leave both blank.');return}
  const payload={in_time:ni+':00',out_time:no+':00'};
  if(split){payload.in_time_2=ni2?ni2+':00':null;payload.out_time_2=no2?no2+':00':null}
  let result;
  if(id){
    result=await db.from('daily_records').update(payload).eq('id',id);
  }else{
    const rule=rules.find(r=>r.category===employee.category);
    result=await db.from('daily_records').insert({
      client_id:crypto.randomUUID(),work_date:date,employee_id:employee.id,...payload,
      break_minutes:employee.break_minutes??rule?.break_minutes??0,
      normal_work_minutes:employee.normal_work_minutes??rule?.normal_work_minutes??525,
      ot_eligible:rule?.ot_eligible??false,
      ot_threshold_minutes:rule?.ot_threshold_minutes??15,
      round_minutes:employee.round_minutes??0
    });
  }
  if(result.error)alert(result.error.message);else await loadRecords();
};

function downloadCSV(name,rows){
  const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();URL.revokeObjectURL(a.href);
}
async function exportRecords(){
  const m=$('monthFilter').value||monthNow(),{start,end}=monthRange(m),employeeId=$('recordEmployee').value;
  const [{data:emp},{data}]=await Promise.all([
    db.from('employees').select('name,category').eq('id',employeeId).single(),
    db.from('daily_records').select('work_date,in_time,out_time,worked_minutes,ot_minutes').eq('employee_id',employeeId).gte('work_date',start).lt('work_date',end).order('work_date')
  ]);
  const map=new Map((data||[]).map(r=>[r.work_date,r])),d=new Date(start+'T00:00:00'),y=d.getFullYear(),mo=d.getMonth(),days=new Date(y,mo+1,0).getDate();
  const rows=[['Employee',emp?.name||''],['Category',emp?.category||''],['Month',m],[],['Date','Day','IN','OUT','Worked','OT']];
  for(let day=1;day<=days;day++){
    const ds=y+'-'+String(mo+1).padStart(2,'0')+'-'+String(day).padStart(2,'0'),r=map.get(ds);
    rows.push([ds,new Date(ds+'T00:00:00').toLocaleDateString('en-IN',{weekday:'short'}),r?.in_time?.slice(0,5)||'',r?.out_time?.slice(0,5)||'',r?fmtMin(r.worked_minutes):'',r?fmtMin(r.ot_minutes):'']);
  }
  rows.push([],['Total OT',fmtMin((data||[]).reduce((n,r)=>n+(Number(r.ot_minutes)||0),0))]);
  downloadCSV('FCS-OT-Register-'+(emp?.name||'Employee')+'-'+m+'.csv',rows);
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
  const date=$('attendanceDate').value||today();
  const [{data:emps},{data:att},{data:hols},{data:records}]=await Promise.all([
    db.from('employees').select('id,name,category').eq('active',true).order('name'),
    db.from('attendance').select('*').eq('work_date',date),
    db.from('holidays').select('*').eq('holiday_date',date),
    db.from('daily_records').select('work_date,employee_id,in_time,out_time').eq('work_date',date)
  ]);
  const map=new Map((att||[]).map(x=>[x.employee_id,x]));
  const recordMap=new Map((records||[]).map(x=>[x.employee_id,x]));
  const holiday=(hols||[]).length>0;
  const dow=new Date(date+'T00:00:00').getDay();
  const staffStatuses=['Present','First Half Leave','Second Half Leave','Full Day Leave'];
  const otherStatuses=['Present','Absent','Leave','Half Day','Holiday','Sunday'];
  let html='<tr><th>Employee</th><th>Category</th><th>Status</th></tr>';
  for(const e of emps||[]){
    const existing=map.get(e.id),rec=recordMap.get(e.id);
    let defaultStatus=holiday?'Holiday':(dow===0?'Sunday':'');
    if(e.category==='Staff' && rec?.in_time && rec?.out_time){
      const inMin=Number(rec.in_time.slice(0,2))*60+Number(rec.in_time.slice(3,5));
      const outMin=Number(rec.out_time.slice(0,2))*60+Number(rec.out_time.slice(3,5));
      if(inMin>=13*60+45 && outMin>=17*60+15) defaultStatus='First Half Leave';
      else if(inMin<=9*60+30 && outMin<=13*60+15) defaultStatus='Second Half Leave';
      else if(inMin<=9*60+30 && outMin>=17*60+15) defaultStatus='Present';
    }
    const statuses=e.category==='Staff'?staffStatuses:otherStatuses;
    const selected=existing?.status||defaultStatus;
    html+='<tr data-attendance-eid="'+e.id+'"><td>'+esc(e.name)+'</td><td>'+esc(e.category)+'</td><td><select id="a-'+e.id+'">'+
      '<option></option>'+statuses.map(s=>'<option '+(selected===s?'selected':'')+'>'+s+'</option>').join('')+
      '</select></td></tr>';
  }
  $('attendanceTable').innerHTML=html;
}
window.saveAttendance=async(date,eid)=>{
  const status=$('a-'+eid).value;if(!status)return;
  const {data:emp}=await db.from('employees').select('category').eq('id',eid).single();
  if(emp?.category==='Staff' && !['Present','First Half Leave','Second Half Leave','Full Day Leave'].includes(status))return;
  const {error}=await db.from('attendance').upsert({work_date:date,employee_id:eid,status},{onConflict:'work_date,employee_id'});
  if(error)alert(error.message);
};

async function exportAttendance(){
  const date=$('attendanceDate').value||today();
  const {data}=await db.from('attendance').select('work_date,status,employees(name,category)').eq('work_date',date).order('employees(name)');
  downloadCSV('FCS-Attendance-'+date+'.csv',[['Date','Employee','Category','Status'],...(data||[]).map(r=>[r.work_date,r.employees?.name,r.employees?.category,r.status])]);
}

async function saveAllChanges(){
  const btn=$('saveAllBtn');
  btn.disabled=true;
  btn.textContent='Saving...';
  try{
    const employeeId=$('recordEmployee').value;
    const employee=(await db.from('employees').select('id,name,category,normal_work_minutes,break_minutes,round_minutes,split_shift').eq('id',employeeId).single()).data;
    const rows=[...document.querySelectorAll('#recordsTable tr[data-record-date]')];
    for(const row of rows){
      const date=row.dataset.recordDate,id=row.dataset.recordId||null,split=!!employee?.split_shift;
      const ni=split?normalizeTime($('in1-'+date).value):normalizeTime($('in-'+date).value);
      const no=split?'01:00':normalizeTime($('out-'+date).value);
      const ni2=split?'06:00':'';
      const no2=split?normalizeTime($('out2-'+date).value):'';
      const status=$('a-'+date).value;
      if((ni||no||ni2||no2)&&(!ni||!no))throw new Error('Please enter both IN and OUT for '+date+'.');
      if(split && ((ni2&&!no2)||(!ni2&&no2)))throw new Error('Please enter both IN 2 and OUT 2, or leave both blank, for '+date+'.');
      if(ni&&no){
        const payload={in_time:ni+':00',out_time:no+':00'};
        if(split){payload.in_time_2=ni2?ni2+':00':null;payload.out_time_2=no2?no2+':00':null}
        let result;
        if(id) result=await db.from('daily_records').update(payload).eq('id',id);
        else result=await db.from('daily_records').insert({client_id:crypto.randomUUID(),work_date:date,employee_id:employee.id,...payload,break_minutes:employee.break_minutes??0,normal_work_minutes:employee.normal_work_minutes??525,ot_eligible:employee.category==='Driver'||employee.category==='Gateman',ot_threshold_minutes:15,round_minutes:employee.round_minutes??0});
        if(result.error)throw new Error(result.error.message);
      }
      if(status){
        const {error}=await db.from('attendance').upsert({work_date:date,employee_id:employee.id,status},{onConflict:'work_date,employee_id'});
        if(error)throw new Error(error.message);
      }
    }
    await loadRecords();
    btn.textContent='Saved';
    setTimeout(()=>{btn.textContent='Save Changes'},900);
  }catch(e){
    alert(e.message||'Unable to save changes.');
    btn.textContent='Save Changes';
  }finally{
    btn.disabled=false;
  }
}


function setupTabs(){
  document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.tabpane').forEach(x=>x.classList.add('hidden'));$(b.dataset.tab+'Tab').classList.remove('hidden')});
}

$('workDate').value=today();$('monthFilter').value=monthNow();$('attendanceDate').value=today();setupTimeInput('inTime','09:00');setupTimeInput('outTime','');
$('saveBtn').onclick=saveGate;$('adminBtn').onclick=()=>show('loginView');$('backBtn').onclick=()=>show('gateView');$('loginBtn').onclick=login;$('signupBtn').onclick=signup;
$('logoutBtn').onclick=async()=>{await db.auth.signOut();show('gateView')};
$('refreshRecords').onclick=loadRecords;$('recordEmployee').onchange=loadRecords;$('monthFilter').onchange=loadRecords;$('printRecord').onclick=()=>window.print();$('exportRecords').onclick=exportRecords;$('loadAttendance').onclick=loadAttendance;$('exportAttendance').onclick=exportAttendance;
$('addEmployee').onclick=addEmployee;$('addHoliday').onclick=addHoliday;$('saveAllBtn').onclick=saveAllChanges;setupTabs();

(async()=>{
  loadCache();await loadRules();await loadEmployees();await updatePending();await syncQueue();await checkSession();
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();