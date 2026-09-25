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
async function loadAdmin(){await Promise.all([loadEmployeesAdmin(),loadRulesAdmin(),loadHolidays(),loadRecords(),loadReportOptions()])}

async function loadRecords(){
  const date=$('recordDate').value||today();
  const [{data:emps,error:empError},{data:rows,error:rowError},{data:att},{data:hols}]=await Promise.all([
    db.from('employees').select('id,name,category,normal_work_minutes,break_minutes,round_minutes,split_shift').eq('active',true).order('name'),
    db.from('daily_records').select('id,work_date,in_time,out_time,in_time_2,out_time_2,worked_minutes,ot_minutes,employee_id').eq('work_date',date),
    db.from('attendance').select('work_date,employee_id,status').eq('work_date',date),
    db.from('holidays').select('holiday_date,name').eq('holiday_date',date)
  ]);
  if(empError||rowError){
    $('recordsTable').innerHTML='<tr><td>'+esc((empError||rowError)?.message||'Unable to load records.')+'</td></tr>';
    return;
  }
  const list=emps||[], recordMap=new Map((rows||[]).map(r=>[r.employee_id,r]));
  const attMap=new Map((att||[]).map(x=>[x.employee_id,x.status]));
  const holiday=(hols||[]).length>0, dow=new Date(date+'T00:00:00').getDay();
  let totalWorked=0,totalOt=0;
  const staffStatuses=['Present','First Half Leave','Second Half Leave','Full Day Leave'];
  const otherStatuses=['Present','Absent','Leave','Half Day','Holiday','Sunday'];
  let html='<tr><th>Employee</th><th>Category</th><th>IN</th><th>OUT</th><th>Worked</th><th>OT</th><th>Attendance</th></tr>';
  for(const emp of list){
    const rec=recordMap.get(emp.id);
    let status=attMap.get(emp.id)||(holiday?'Holiday':(dow===0?'Sunday':''));
    if(rec){totalWorked+=Number(rec.worked_minutes)||0;totalOt+=Number(rec.ot_minutes)||0;}
    const input=(id,value,placeholder='')=>'<input class="timeEdit" type="text" inputmode="numeric" maxlength="5" autocomplete="off" id="'+id+'" value="'+(value||'')+'" placeholder="'+placeholder+'">';
    const statuses=emp.category==='Staff'?staffStatuses:otherStatuses;
    const statusSelect='<select class="attendanceEdit" id="a-'+emp.id+'"><option></option>'+statuses.map(s=>'<option '+(status===s?'selected':'')+'>'+s+'</option>').join('')+'</select>';
    if(emp.split_shift){
      html+='<tr data-employee-id="'+emp.id+'" data-record-id="'+(rec?esc(rec.id):'')+'"><td>'+esc(emp.name)+'</td><td>'+esc(emp.category)+'</td><td>'+input('in1-'+emp.id,rec?.in_time?.slice(0,5),'18:00')+'</td><td>'+input('out2-'+emp.id,rec?.out_time_2?.slice(0,5),'07:00')+'</td><td>'+(rec?fmtMin(rec.worked_minutes):'')+'</td><td>'+(rec?fmtMin(rec.ot_minutes):'')+'</td><td>'+statusSelect+'</td></tr>';
    }else{
      html+='<tr data-employee-id="'+emp.id+'" data-record-id="'+(rec?esc(rec.id):'')+'"><td>'+esc(emp.name)+'</td><td>'+esc(emp.category)+'</td><td>'+input('in-'+emp.id,rec?.in_time?.slice(0,5))+'</td><td>'+input('out-'+emp.id,rec?.out_time?.slice(0,5))+'</td><td>'+(rec?fmtMin(rec.worked_minutes):'')+'</td><td>'+(rec?fmtMin(rec.ot_minutes):'')+'</td><td>'+statusSelect+'</td></tr>';
    }
  }
  const holidayLabel=holiday?' | Holiday'+((hols||[])[0]?.name?' ('+(hols[0].name)+')':''):(dow===0?' | Sunday':'');
  $('printTitle').textContent='Daily Register - '+date;
  $('recordSummary').textContent=date+holidayLabel+' | Total Worked '+fmtMin(totalWorked)+' | Total OT '+fmtMin(totalOt);
  $('recordsTable').innerHTML=html;
}

function downloadCSV(name,rows){
  const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();URL.revokeObjectURL(a.href);
}
async function exportRecords(){
  const date=$('recordDate').value||today();
  const [{data:emps},{data:rows},{data:att}]=await Promise.all([
    db.from('employees').select('name,category').eq('active',true).order('name'),
    db.from('daily_records').select('work_date,in_time,out_time,in_time_2,out_time_2,worked_minutes,ot_minutes,employee_id').eq('work_date',date),
    db.from('attendance').select('employee_id,status').eq('work_date',date)
  ]);
  const recordMap=new Map((rows||[]).map(r=>[r.employee_id,r]));
  const attMap=new Map((att||[]).map(r=>[r.employee_id,r.status]));
  const rowsOut=[['Date','Employee','Category','IN','OUT','Worked','OT','Attendance']];
  for(const e of emps||[]){
    const r=recordMap.get(e.id);
    const inValue=r?.in_time?.slice(0,5)||'';
    const outValue=e.category==='Gateman'&&e.name==='Varinder Pal'&&r?.out_time_2?r.out_time_2.slice(0,5):(r?.out_time?.slice(0,5)||'');
    rowsOut.push([date,e.name,e.category,inValue,outValue,r?fmtMin(r.worked_minutes):'',r?fmtMin(r.ot_minutes):'',attMap.get(e.id)||'']);
  }
  downloadCSV('FCS-Daily-Register-'+date+'.csv',rowsOut);
}

async function loadReportOptions(){
  const {data,error}=await db.from('employees').select('id,name,category,split_shift').eq('active',true).order('name');
  if(error){$('reportTable').innerHTML='<tr><td>'+esc(error.message)+'</td></tr>';return}
  const current=$('reportEmployee').value;
  $('reportEmployee').innerHTML=(data||[]).map(e=>'<option value="'+e.id+'">'+esc(e.name)+' ('+esc(e.category)+')</option>').join('');
  if(current && (data||[]).some(e=>e.id===current)) $('reportEmployee').value=current;
  else if((data||[]).length) $('reportEmployee').value=data[0].id;
  $('reportMonth').value=monthNow();
}

async function getMonthlyReportData(){
  const month=$('reportMonth').value||monthNow();
  const employeeId=$('reportEmployee').value;
  if(!employeeId) throw new Error('Please select an employee.');
  const {start,end}=monthRange(month);
  const [{data:emps,error:empError},{data:records,error:recError},{data:att,error:attError},{data:hols,error:holError}]=await Promise.all([
    db.from('employees').select('id,name,category,split_shift').eq('id',employeeId).single(),
    db.from('daily_records').select('work_date,in_time,out_time,in_time_2,out_time_2,worked_minutes,ot_minutes').eq('employee_id',employeeId).gte('work_date',start).lt('work_date',end),
    db.from('attendance').select('work_date,status').eq('employee_id',employeeId).gte('work_date',start).lt('work_date',end),
    db.from('holidays').select('holiday_date,name').gte('holiday_date',start).lt('holiday_date',end)
  ]);
  const err=empError||recError||attError||holError;
  if(err) throw new Error(err.message);
  const recMap=new Map((records||[]).map(r=>[r.work_date,r]));
  const attMap=new Map((att||[]).map(a=>[a.work_date,a.status]));
  const holidayMap=new Map((hols||[]).map(h=>[h.holiday_date,h.name]));
  const d=new Date(start+'T00:00:00');
  const days=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
  const rows=[];
  let totalWorked=0,totalOt=0;
  const counts={Present:0,'First Half Leave':0,'Second Half Leave':0,'Full Day Leave':0,Absent:0,Leave:0,Sunday:0,Holiday:0};
  for(let n=1;n<=days;n++){
    const date=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(n).padStart(2,'0');
    const day=new Date(date+'T00:00:00').toLocaleDateString('en-IN',{weekday:'short'});
    const rec=recMap.get(date);
    let status=attMap.get(date)||(holidayMap.has(date)?'Holiday':(new Date(date+'T00:00:00').getDay()===0?'Sunday':''));
    if(status in counts) counts[status]++;
    if(rec){totalWorked+=Number(rec.worked_minutes)||0;totalOt+=Number(rec.ot_minutes)||0;}
    rows.push({date,day,rec,status});
  }
  return {month,employee:emps,rows,totalWorked,totalOt,counts};
}

function reportHtml(data){
  const split=!!data.employee.split_shift;
  const headers=split
    ? ['Date','Day','IN 1','OUT 1','IN 2','OUT 2','Worked','OT','Attendance']
    : ['Date','Day','IN','OUT','Worked','OT','Attendance'];
  let out='<tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr>';
  for(const r of data.rows){
    const x=r.rec||{};
    const cells=split
      ? [r.date,r.day,x.in_time?.slice(0,5)||'',x.out_time?.slice(0,5)||'',x.in_time_2?.slice(0,5)||'',x.out_time_2?.slice(0,5)||'',x.worked_minutes!=null?fmtMin(x.worked_minutes):'',x.ot_minutes!=null?fmtMin(x.ot_minutes):'',r.status]
      : [r.date,r.day,x.in_time?.slice(0,5)||'',x.out_time?.slice(0,5)||'',x.worked_minutes!=null?fmtMin(x.worked_minutes):'',x.ot_minutes!=null?fmtMin(x.ot_minutes):'',r.status];
    out+='<tr>'+cells.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>';
  }
  const totalCells=split
    ? ['','','','','','Total',fmtMin(data.totalWorked),fmtMin(data.totalOt), '']
    : ['','','','Total',fmtMin(data.totalWorked),fmtMin(data.totalOt),''];
  out+='<tr class="reportTotal">'+totalCells.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>';
  return out;
}

async function generateReport(){
  const btn=$('generateReport');btn.disabled=true;btn.textContent='Loading...';
  try{
    const data=await getMonthlyReportData();
    const label=new Date(data.month+'-01T00:00:00').toLocaleDateString('en-IN',{month:'long',year:'numeric'});
    $('reportTitle').textContent=data.employee.name+' | '+data.employee.category+' | '+label;
    const c=data.counts;
    $('reportSummary').textContent='Present '+c.Present+' | 1st Half Leave '+c['First Half Leave']+' | 2nd Half Leave '+c['Second Half Leave']+' | Full Day Leave '+c['Full Day Leave']+' | Sundays '+c.Sunday+' | Holidays '+c.Holiday+' | Total Worked '+fmtMin(data.totalWorked)+' | Total OT '+fmtMin(data.totalOt);
    $('reportTable').innerHTML=reportHtml(data);
  }catch(e){
    $('reportTable').innerHTML='<tr><td>'+esc(e.message||'Unable to generate report.')+'</td></tr>';
  }finally{
    btn.disabled=false;btn.textContent='Generate';
  }
}

async function exportReport(){
  try{
    const data=await getMonthlyReportData();
    const split=!!data.employee.split_shift;
    const headers=split
      ? ['Date','Day','IN 1','OUT 1','IN 2','OUT 2','Worked','OT','Attendance']
      : ['Date','Day','IN','OUT','Worked','OT','Attendance'];
    const rows=[headers];
    for(const r of data.rows){
      const x=r.rec||{};
      rows.push(split
        ? [r.date,r.day,x.in_time?.slice(0,5)||'',x.out_time?.slice(0,5)||'',x.in_time_2?.slice(0,5)||'',x.out_time_2?.slice(0,5)||'',x.worked_minutes!=null?fmtMin(x.worked_minutes):'',x.ot_minutes!=null?fmtMin(x.ot_minutes):'',r.status]
        : [r.date,r.day,x.in_time?.slice(0,5)||'',x.out_time?.slice(0,5)||'',x.worked_minutes!=null?fmtMin(x.worked_minutes):'',x.ot_minutes!=null?fmtMin(x.ot_minutes):'',r.status]);
    }
    const total=split
      ? ['','','','','','Total',fmtMin(data.totalWorked),fmtMin(data.totalOt),'']
      : ['','','','Total',fmtMin(data.totalWorked),fmtMin(data.totalOt),''];
    rows.push(total);
    downloadCSV('FCS-Monthly-Report-'+data.employee.name.replace(/[^a-z0-9]+/gi,'-')+'-'+data.month+'.csv',rows);
  }catch(e){alert(e.message||'Unable to export report.')}
}

async function saveAllChanges(){
  const btn=$('saveAllBtn');btn.disabled=true;btn.textContent='Saving...';
  try{
    const date=$('recordDate').value||today();
    const [{data:emps,error:empError}]=await Promise.all([db.from('employees').select('id,name,category,normal_work_minutes,break_minutes,round_minutes,split_shift').eq('active',true).order('name')]);
    if(empError)throw new Error(empError.message);
    const existing=await db.from('daily_records').select('id,employee_id').eq('work_date',date);
    if(existing.error)throw new Error(existing.error.message);
    const idMap=new Map((existing.data||[]).map(r=>[r.employee_id,r.id]));
    for(const emp of emps||[]){
      const row=document.querySelector('#recordsTable tr[data-employee-id="'+emp.id+'"]');if(!row)continue;
      const split=!!emp.split_shift;
      const ni=split?normalizeTime($('in1-'+emp.id).value):normalizeTime($('in-'+emp.id).value);
      const no=split?'01:00':normalizeTime($('out-'+emp.id).value);
      const ni2=split?'06:00':'';
      const no2=split?normalizeTime($('out2-'+emp.id).value):'';
      const status=$('a-'+emp.id).value;
      if((ni||no||ni2||no2)&&(!ni||!no))throw new Error('Please enter both IN and OUT for '+emp.name+'.');
      if(split&&((ni2&&!no2)||(!ni2&&no2)))throw new Error('Please enter both second-shift times for '+emp.name+'.');
      if(ni&&no){
        const payload={in_time:ni+':00',out_time:no+':00'};
        if(split){payload.in_time_2=ni2?ni2+':00':null;payload.out_time_2=no2?no2+':00':null;}
        const id=idMap.get(emp.id);
        const result=id?await db.from('daily_records').update(payload).eq('id',id):await db.from('daily_records').insert({client_id:crypto.randomUUID(),work_date:date,employee_id:emp.id,...payload,break_minutes:emp.break_minutes??0,normal_work_minutes:emp.normal_work_minutes??525,ot_eligible:emp.category==='Driver'||emp.category==='Gateman',ot_threshold_minutes:15,round_minutes:emp.round_minutes??0});
        if(result.error)throw new Error(result.error.message);
      }
      if(status){
        const result=await db.from('attendance').upsert({work_date:date,employee_id:emp.id,status},{onConflict:'work_date,employee_id'});
        if(result.error)throw new Error(result.error.message);
      }
    }
    await saveRules();
    await Promise.all([loadRecords(),loadReportOptions()]);
    btn.textContent='Saved';setTimeout(()=>btn.textContent='Save Changes',900);
  }catch(e){alert(e.message||'Unable to save changes.');btn.textContent='Save Changes';}
  finally{btn.disabled=false;}
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

window.saveAttendance=async(date,eid)=>{
  const status=$('a-'+eid).value;if(!status)return;
  const {data:emp}=await db.from('employees').select('category').eq('id',eid).single();
  if(emp?.category==='Staff' && !['Present','First Half Leave','Second Half Leave','Full Day Leave'].includes(status))return;
  const {error}=await db.from('attendance').upsert({work_date:date,employee_id:eid,status},{onConflict:'work_date,employee_id'});
  if(error)alert(error.message);
};


function setupTabs(){
  document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.tabpane').forEach(x=>x.classList.add('hidden'));$(b.dataset.tab+'Tab').classList.remove('hidden')});
}

$('workDate').value=today();$('recordDate').value=today();setupTimeInput('inTime','09:00');setupTimeInput('outTime','');
$('saveBtn').onclick=saveGate;$('adminBtn').onclick=()=>show('loginView');$('backBtn').onclick=()=>show('gateView');$('loginBtn').onclick=login;$('signupBtn').onclick=signup;
$('logoutBtn').onclick=async()=>{await db.auth.signOut();show('gateView')};
$('refreshRecords').onclick=loadRecords;$('recordDate').onchange=loadRecords;$('printRecord').onclick=()=>window.print();$('exportRecords').onclick=exportRecords;
$('addEmployee').onclick=addEmployee;$('addHoliday').onclick=addHoliday;$('saveAllBtn').onclick=saveAllChanges;$('generateReport').onclick=generateReport;$('printReport').onclick=()=>window.print();$('exportReport').onclick=exportReport;$('reportMonth').onchange=generateReport;$('reportEmployee').onchange=generateReport;setupTabs();

(async()=>{
  loadCache();await loadRules();await loadEmployees();await updatePending();await syncQueue();await checkSession();
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();