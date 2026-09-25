const SUPABASE_URL='https://raesuqidwkcpylvqiftf.supabase.co';
const SUPABASE_KEY='sb_publishable_IDPqntwDZCE5O5qsakvfTA_dGcex6zF';
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function normalizeTime(v){
  v=String(v||'').trim().toLowerCase().replace(/\s+/g,'').replace(/\./g,':');
  const m=v.match(/^(\d{1,2}):(\d{1,2})(am|pm)?$/);
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
async function autoSaveEmployee(sourceEl){
  setSaveStatus('saving');
  const row=sourceEl.closest('tr[data-employee-id]');if(!row)return;
  const emp=window.__recordEmployees?.find(e=>e.id===row.dataset.employeeId);if(!emp)return;
  const date=$('recordDate')?.value;if(!date)return;
  const split=!!emp.split_shift;
  const ni=normalizeTime(split?$('in1-'+emp.id)?.value:$('in-'+emp.id)?.value);
  const no=normalizeTime(split?$('out2-'+emp.id)?.value:$('out-'+emp.id)?.value);
  const status=$('a-'+emp.id)?.value||'';
  if(!ni||!no){
    if(status){
      const r=await db.from('attendance').upsert({work_date:date,employee_id:emp.id,status},{onConflict:'work_date,employee_id'});
      if(r.error)alert(r.error.message);
    }
    return;
  }
  const existingId=row.dataset.recordId||null;
  const payload={in_time:ni+':00',out_time:no+':00'};
  if(split){payload.in_time_2='06:00:00';payload.out_time_2=no+':00';}
  const result=existingId
    ?await db.from('daily_records').update(payload).eq('id',existingId)
    :await db.from('daily_records').insert({client_id:crypto.randomUUID(),work_date:date,employee_id:emp.id,...payload,break_minutes:emp.break_minutes??0,normal_work_minutes:emp.normal_work_minutes??525,ot_eligible:emp.category==='Driver'||emp.category==='Gateman',ot_threshold_minutes:15,round_minutes:emp.round_minutes??0}).select('id').single();
  if(result.error){alert(result.error.message);return}
  if(result.data?.id)row.dataset.recordId=result.data.id;
  if(status){
    const a=await db.from('attendance').upsert({work_date:date,employee_id:emp.id,status},{onConflict:'work_date,employee_id'});
    if(a.error)alert(a.error.message);
  }
  await loadRecords();
  setSaveStatus('saved');
}
function normalizeTimeFields(){
  document.querySelectorAll('.timeEdit').forEach(el=>{
    if(el.dataset.timeReady)return;
    el.dataset.timeReady='1';
    const format=()=>{if(el.value)el.value=normalizeTime(el.value)||el.value};
    el.addEventListener('blur',format);
    el.addEventListener('change',format);
  });
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
const fmtDate=d=>{const s=String(d||'');const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?m[3]+'/'+m[2]+'/'+m[1]:s};

let employees=[],rules=[];
const DB_NAME='fcs-attendance-local',STORE='pending',CACHE_KEY='fcs-attendance-cache';

function openLocal(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:'client_id'});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function localPut(x){const d=await openLocal();return new Promise((res,rej)=>{const t=d.transaction(STORE,'readwrite');t.objectStore(STORE).put(x);t.oncomplete=res;t.onerror=()=>rej(t.error)})}
async function localAll(){const d=await openLocal();return new Promise((res,rej)=>{const t=d.transaction(STORE,'readonly');const q=t.objectStore(STORE).getAll();q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
async function localDelete(id){const d=await openLocal();return new Promise((res,rej)=>{const t=d.transaction(STORE,'readwrite');t.objectStore(STORE).delete(id);t.oncomplete=res;t.onerror=()=>rej(t.error)})}
async function updatePending(){const q=await localAll();$('pendingCount').textContent=q.length?q.length+' pending sync':''}
function saveCache(){localStorage.setItem(CACHE_KEY,JSON.stringify({employees,rules}))}
function loadCache(){try{const x=JSON.parse(localStorage.getItem(CACHE_KEY)||'{}');employees=x.employees||[];rules=x.rules||[]}catch{}}

let syncingQueue=false;
async function syncQueue(){
  if(syncingQueue||!navigator.onLine)return;
  const q=await localAll();
  if(!q.length){await updatePending();$('syncStatus').textContent='Synced';return}
  syncingQueue=true;
  $('syncStatus').textContent='Syncing...';
  let failed=0,firstError='';
  try{
    for(let i=0;i<q.length;i+=10){
      const batch=q.slice(i,i+10);
      const results=await Promise.all(batch.map(async row=>{
        try{
          const {error}=await db.from('daily_records').insert(row);
          if(!error||error.code==='23505'){
            await localDelete(row.client_id);
            return true;
          }
          if(!firstError)firstError=(error.code?error.code+': ':'')+(error.message||'Upload failed');
        }catch(e){
          if(!firstError)firstError=e?.message||'Network error';
        }
        return false;
      }));
      failed+=results.filter(x=>!x).length;
    }
  }finally{
    syncingQueue=false;
  }
  await updatePending();
  const pending=await localAll();
  if(pending.length){
    $('syncStatus').textContent=firstError?'Sync pending: '+firstError:'Sync pending';
  }else{
    $('syncStatus').textContent='Synced';
  }
}
window.addEventListener('online',syncQueue);
window.addEventListener('offline',()=>{$('syncStatus').textContent='Offline'});
window.addEventListener('focus',syncQueue);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncQueue()});
setInterval(syncQueue,30000);

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
    db.from('daily_records').select('id,work_date,in_time,out_time,in_time_2,out_time_2,total_elapsed_minutes,worked_minutes,ot_minutes,employee_id').eq('work_date',date),
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
    if(rec&&!status){
      const inMin=timeMinutes(rec.in_time);
      const outMin=timeMinutes(rec.out_time);
      const elapsed=Number(rec.total_elapsed_minutes);
      if(emp.category==='Staff'){
        if(inMin!==null&&outMin!==null){
          if(inMin<=9*60+30&&outMin<=13*60+15) status='Second Half Leave';
          else if(inMin>=13*60+45&&outMin>=17*60+15) status='First Half Leave';
          else if(inMin<=9*60+30&&outMin>=17*60+15) status='Present';
        }
      }else{
        const rule=rules.find(r=>r.category===emp.category);
        const normalElapsed=Number(rule?.normal_work_minutes||emp.normal_work_minutes||525);
        if(elapsed>=normalElapsed)status='Present';
      }
    }
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
  $('printTitle').textContent='Daily Register - '+fmtDate(date);
  $('recordSummary').textContent=fmtDate(date)+holidayLabel+' | Total Worked '+fmtMin(totalWorked)+' | Total OT '+fmtMin(totalOt);
  $('recordsTable').innerHTML=html;
  normalizeTimeFields();
  document.querySelectorAll('#recordsTable .timeEdit').forEach(el=>{
    el.addEventListener('input',()=>{refreshLiveTotals();setSaveStatus('unsaved')});
    el.addEventListener('blur',async()=>{refreshLiveTotals();await autoSaveEmployee(el)});
    el.addEventListener('change',async()=>{refreshLiveTotals();await autoSaveEmployee(el)});
  });
  document.querySelectorAll('#recordsTable .attendanceEdit').forEach(el=>{
    el.addEventListener('change',async()=>{setSaveStatus('unsaved');await autoSaveEmployee(el)});
  });
  refreshLiveTotals();
}

function timeMinutes(v){
  const t=normalizeTime(v);if(!t)return null;
  const [h,m]=t.split(':').map(Number);return h*60+m;
}
function calcLiveMinutes(emp,ni,no,ni2,no2,date,isHoliday){
  const a=timeMinutes(ni),b=timeMinutes(no);
  if(a===null||b===null)return {worked:null,ot:null};
  let total=b-a+(b<a?1440:0);
  if(emp.split_shift){
    const c=timeMinutes(ni2||'06:00'),d=timeMinutes(no2);
    if(c!==null&&d!==null)total+=d-c+(d<c?1440:0);
  }
  const rounded=emp.round_minutes>0?Math.round(total/emp.round_minutes)*emp.round_minutes:total;
  const special=(emp.category==='Driver'||emp.category==='Gateman')&&(new Date(date+'T00:00:00').getDay()===0||isHoliday);
  const worked=Math.max(0,rounded-(special?0:(emp.break_minutes||0)));
  const ot=emp.category==='Driver'||emp.category==='Gateman'
    ?(special?rounded:(rounded-(emp.normal_work_minutes||525)>15?rounded-(emp.normal_work_minutes||525):0))
    :0;
  return {worked,ot};
}
function setSaveStatus(state){
  const el=$('saveStatus');if(!el)return;
  el.className='saveStatus '+state;
  el.textContent=state==='unsaved'?'Unsaved changes':state==='saving'?'Saving...':'All changes saved';
}
function refreshLiveTotals(){
  const date=$('recordDate')?.value||today(),isHoliday=!!window.__recordHoliday;
  let worked=0,ot=0;
  document.querySelectorAll('#recordsTable tr[data-employee-id]').forEach(row=>{
    const emp=window.__recordEmployees?.find(e=>e.id===row.dataset.employeeId);if(!emp)return;
    const split=!!emp.split_shift;
    const ni=split?$('in1-'+emp.id)?.value:$('in-'+emp.id)?.value;
    const no=split?$('out2-'+emp.id)?.value:$('out-'+emp.id)?.value;
    const live=calcLiveMinutes(emp,ni,no,split?'06:00':'',split?no:'',date,isHoliday);
    const workedCell=row.children[4],otCell=row.children[5];
    workedCell.textContent=live.worked==null?'':fmtMin(live.worked);
    otCell.textContent=live.ot==null?'':fmtMin(live.ot);
    if(live.worked!=null)worked+=live.worked;
    if(live.ot!=null)ot+=live.ot;
  });
  $('recordSummary').textContent=fmtDate(date)+' | Total Worked '+fmtMin(worked)+' | Total OT '+fmtMin(ot);
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
    rowsOut.push([fmtDate(date),e.name,e.category,inValue,outValue,r?fmtMin(r.worked_minutes):'',r?fmtMin(r.ot_minutes):'',attMap.get(e.id)||'']);
  }
  downloadCSV('FCS-Daily-Register-'+date+'.csv',rowsOut);
}

async function getMonthlyAttendanceData(){
  const month=$('attendanceMonth').value||monthNow();
  const {start,end}=monthRange(month);
  const [{data:emps,error:empError},{data:records,error:recError},{data:att,error:attError},{data:hols,error:holError}]=await Promise.all([
    db.from('employees').select('id,name,category').eq('active',true).order('name'),
    db.from('daily_records').select('work_date,employee_id').gte('work_date',start).lt('work_date',end),
    db.from('attendance').select('work_date,employee_id,status').gte('work_date',start).lt('work_date',end),
    db.from('holidays').select('holiday_date,name').gte('holiday_date',start).lt('holiday_date',end)
  ]);
  const err=empError||recError||attError||holError;
  if(err)throw new Error(err.message);

  const dates=[...(records||[]).map(r=>r.work_date),...(att||[]).map(r=>r.work_date)].filter(Boolean).sort();
  const cutoff=dates.length?dates[dates.length-1]:null;
  const days=[];
  if(cutoff){
    const d=new Date(start+'T00:00:00'),last=new Date(cutoff+'T00:00:00');
    while(d<=last){days.push(d.toISOString().slice(0,10));d.setDate(d.getDate()+1)}
  }

  const recordSet=new Set((records||[]).map(r=>r.work_date+'|'+r.employee_id));
  const attMap=new Map((att||[]).map(r=>[r.work_date+'|'+r.employee_id,r.status]));
  const holidayMap=new Map((hols||[]).map(h=>[h.holiday_date,h.name]));

  const rows=(emps||[]).map((e,i)=>{
    const c={present:0,halfDay:0,leave:0,absent:0,sunday:0,holiday:0};
    for(const date of days){
      const hasRecord=recordSet.has(date+'|'+e.id);
      const explicit=attMap.get(date+'|'+e.id);
      const dow=new Date(date+'T00:00:00').getDay();
      const status=explicit||(hasRecord?'Present':holidayMap.has(date)?'Holiday':dow===0?'Sunday':'Absent');
      if(status==='Present')c.present++;
      else if(status==='First Half Leave'||status==='Second Half Leave'||status==='Half Day')c.halfDay++;
      else if(status==='Full Day Leave'||status==='Leave')c.leave++;
      else if(status==='Absent')c.absent++;
      else if(status==='Sunday')c.sunday++;
      else if(status==='Holiday')c.holiday++;
    }
    return {no:i+1,employee:e,...c};
  });
  return {month,cutoff,rows};
}
function monthlyAttendanceHtml(data){
  let out='<tr><th>S. No.</th><th>Name</th><th>Category</th><th>Present</th><th>Half Day</th><th>Leave</th><th>Absent</th><th>Sunday</th><th>Holiday</th></tr>';
  const totals={present:0,halfDay:0,leave:0,absent:0,sunday:0,holiday:0};
  data.rows.forEach(r=>{
    for(const k of Object.keys(totals))totals[k]+=r[k];
    out+='<tr><td>'+r.no+'.</td><td>'+esc(r.employee.name)+'</td><td>'+esc(r.employee.category)+'</td><td>'+r.present+'</td><td>'+r.halfDay+'</td><td>'+r.leave+'</td><td>'+r.absent+'</td><td>'+r.sunday+'</td><td>'+r.holiday+'</td></tr>';
  });
  out+='<tr class="reportTotal"><td></td><td>Total</td><td></td><td>'+totals.present+'</td><td>'+totals.halfDay+'</td><td>'+totals.leave+'</td><td>'+totals.absent+'</td><td>'+totals.sunday+'</td><td>'+totals.holiday+'</td></tr>';
  return out;
}
async function generateAttendanceReport(){
  const btn=$('generateAttendanceReport');btn.disabled=true;btn.textContent='Loading...';
  try{
    const data=await getMonthlyAttendanceData();
    $('attendanceReportTitle').textContent='MONTHLY ATTENDANCE REPORT';
    const first='01/'+data.month.slice(5,7)+'/'+data.month.slice(0,4);
    const cutoff=data.cutoff?fmtDate(data.cutoff):'No attendance data';
    $('attendanceReportSummary').textContent=data.cutoff?'PERIOD '+first+' to '+cutoff:'No attendance data available for selected month';
    $('attendanceReportTable').innerHTML=monthlyAttendanceHtml(data);
  }catch(e){$('attendanceReportTable').innerHTML='<tr><td>'+esc(e.message||'Unable to generate report.')+'</td></tr>'}
  finally{btn.disabled=false;btn.textContent='Generate'}
}
async function exportAttendanceReport(){
  try{
    const data=await getMonthlyAttendanceData();
    const rows=[['S. No.','Name','Category','Present','Half Day','Leave','Absent','Sunday','Holiday']];
    data.rows.forEach(r=>rows.push([r.no,r.employee.name,r.employee.category,r.present,r.halfDay,r.leave,r.absent,r.sunday,r.holiday]));
    downloadCSV('FCS-Monthly-Attendance-'+data.month+'.csv',rows);
  }catch(e){alert(e.message||'Unable to export attendance report.')}
}

function minutesFromHHMM(v){
  const m=String(v||'').match(/^(\d{2}):(\d{2})/);
  return m?Number(m[1])*60+Number(m[2]):null;
}
function fmtHHMM(mins){
  if(mins==null||mins<=0)return '';
  return String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0');
}
function utMinutesForRecord(record,holidaySet){
  if(!record||holidaySet.has(record.work_date))return 0;
  const inMin=minutesFromHHMM(record.in_time);
  const earlyCutoff=8*60+40;
  const normalStart=9*60;
  return inMin!=null&&inMin<earlyCutoff?normalStart-inMin:0;
}
function minutesFromHHMM(v){
  const m=String(v||'').match(/^(\d{2}):(\d{2})/);
  return m?Number(m[1])*60+Number(m[2]):null;
}
function fmtHHMM(mins){
  if(mins==null||mins<=0)return '';
  return String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0');
}
function utMinutesForRecord(record,holidaySet){
  if(!record||holidaySet.has(record.work_date))return 0;
  const inMin=minutesFromHHMM(record.in_time);
  const earlyCutoff=8*60+40;
  const normalStart=9*60;
  return inMin!=null&&inMin<earlyCutoff?normalStart-inMin:0;
}
async function getOTReportBase(){
  const month=$('reportMonth').value||monthNow();
  const {start,end}=monthRange(month);
  const [{data:emps,error:empError},{data:records,error:recError},{data:hols,error:holError}]=await Promise.all([
    db.from('employees').select('id,name,category').eq('active',true).in('category',['Driver','Gateman']).order('name'),
    db.from('daily_records').select('work_date,employee_id,in_time,out_time,in_time_2,out_time_2,ot_minutes').gte('work_date',start).lt('work_date',end),
    db.from('holidays').select('holiday_date').gte('holiday_date',start).lt('holiday_date',end)
  ]);
  const err=empError||recError||holError;
  if(err)throw new Error(err.message);
  const holidaySet=new Set((hols||[]).map(h=>h.holiday_date));
  const byKey=new Map((records||[]).map(r=>[r.work_date+'|'+r.employee_id,r]));
  const totals=new Map();
  for(const e of emps||[]){
    let ot=0,ut=0;
    for(const r of records||[]){
      if(r.employee_id!==e.id)continue;
      ot+=Number(r.ot_minutes)||0;
      ut+=utMinutesForRecord(r,holidaySet);
    }
    totals.set(e.id,{ot,ut});
  }
  return {month,emps:emps||[],records:records||[],holidaySet,byKey,totals};
}
async function loadReportOptions(){
  try{
    const base=await getOTReportBase();
    $('reportMonth').value=base.month;
    $('reportPeople').innerHTML=base.emps.map(e=>{
      const t=base.totals.get(e.id)||{ot:0,ut:0};
      const any=t.ot+t.ut>0;
      return '<label class="reportPerson"><input type="checkbox" class="reportEmployeeCheck" value="'+e.id+'" '+(any?'checked':'')+'><span>'+esc(e.name)+' ('+esc(e.category)+')</span><small>OT '+fmtHHMM(t.ot)+' / UT '+fmtHHMM(t.ut)+'</small></label>';
    }).join('');
  }catch(e){$('reportPeople').innerHTML='<span class="muted">'+esc(e.message||'Unable to load employees.')+'</span>'}
}
async function getOTReportData(){
  const base=await getOTReportBase();
  const selected=[...document.querySelectorAll('.reportEmployeeCheck:checked')].map(x=>x.value);
  if(!selected.length)throw new Error('Please select at least one employee.');
  const employees=base.emps.filter(e=>selected.includes(e.id));
  const d=new Date(base.month+'-01T00:00:00');
  const daysInMonth=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
  const rows=employees.map((e,i)=>{
    const days=[];
    let otTotal=0,utTotal=0;
    for(let day=1;day<=daysInMonth;day++){
      const date=base.month+'-'+String(day).padStart(2,'0');
      const r=base.byKey.get(date+'|'+e.id);
      const ot=r?Number(r.ot_minutes)||0:0;
      const ut=utMinutesForRecord(r,base.holidaySet);
      otTotal+=ot;utTotal+=ut;
      days.push({date,in1:r?.in_time||'',out1:r?.out_time||'',in2:r?.in_time_2||'',out2:r?.out_time_2||'',ot,ut});
    }
    return {no:i+1,employee:e,days,otTotal,utTotal,total:otTotal+utTotal};
  }).filter(r=>!$('otOnly').checked||r.total>0);
  return {month:base.month,rows};
}
function otReportHtml(data){
  let out='';
  let grandOT=0,grandUT=0;
  data.rows.forEach(r=>{
    grandOT+=r.otTotal;grandUT+=r.utTotal;
    out+='<div class="otPersonReport">';
    out+='<table class="otPersonTable"><tr><th colspan="7" class="employeeHeading">'+esc(r.employee.name)+'</th></tr>';
    out+='<tr><th>Date</th><th>IN</th><th>OUT</th><th>IN 2</th><th>OUT 2</th><th>OT</th><th>UT</th></tr>';
    r.days.forEach(d=>{
      out+='<tr><td>'+fmtDate(d.date)+'</td><td>'+esc(d.in1)+'</td><td>'+esc(d.out1)+'</td><td>'+esc(d.in2)+'</td><td>'+esc(d.out2)+'</td><td>'+fmtHHMM(d.ot)+'</td><td>'+fmtHHMM(d.ut)+'</td></tr>';
    });
    out+='<tr class="reportSubtotal"><td>Sub total</td><td></td><td></td><td></td><td></td><td>'+fmtHHMM(r.otTotal)+'</td><td>'+fmtHHMM(r.utTotal)+'</td></tr>';
    out+='<tr class="reportTotal"><td>Total</td><td colspan="4"></td><td>'+fmtHHMM(r.total)+'</td><td></td></tr>';
    out+='</table></div>';
  });
  if(data.rows.length>1)out+='<div class="reportGrandTotal">Grand Total: OT '+fmtHHMM(grandOT)+' + UT '+fmtHHMM(grandUT)+' = '+fmtHHMM(grandOT+grandUT)+'</div>';
  return out||'<div class="muted">No OT or UT for selected employees.</div>';
}
function safeSheetName(name,used){
  let n=String(name||'Employee').replace(/[\\\/\?\*\[\]:]/g,' ').trim().slice(0,31)||'Employee';
  let base=n,i=2;
  while(used.has(n)){const suffix=' ('+i++ +')';n=base.slice(0,31-suffix.length)+suffix}
  used.add(n);return n;
}
async function generateReport(){
  const btn=$('generateReport');btn.disabled=true;btn.textContent='Loading...';
  try{
    const data=await getOTReportData();
    $('reportTitle').textContent='OVERTIME AND UNDER TIME REPORT';
    const last=new Date(new Date(data.month+'-01T00:00:00').getFullYear(),new Date(data.month+'-01T00:00:00').getMonth()+1,0).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'});
    $('reportSummary').textContent='PERIOD 01/'+data.month.slice(5,7)+'/'+data.month.slice(0,4)+' to '+last;
    $('reportTable').innerHTML=otReportHtml(data);
  }catch(e){$('reportTable').innerHTML='<div>'+esc(e.message||'Unable to generate report.')+'</div>'}
  finally{btn.disabled=false;btn.textContent='Generate'}
}
async function exportReport(){
  try{
    const data=await getOTReportData();
    if(typeof XLSX==='undefined')throw new Error('Excel export library is not available. Please check internet connection and try again.');
    const wb=XLSX.utils.book_new(),used=new Set();
    for(const r of data.rows){
      const aoa=[
        ['OVERTIME AND UNDER TIME REPORT'],
        ['Employee',r.employee.name],
        ['Category',r.employee.category],
        ['Period','01/'+data.month.slice(5,7)+'/'+data.month.slice(0,4)+' to '+new Date(new Date(data.month+'-01T00:00:00').getFullYear(),new Date(data.month+'-01T00:00:00').getMonth()+1,0).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'})],
        [],
        ['Date','IN','OUT','IN 2','OUT 2','OT','UT']
      ];
      r.days.forEach(d=>aoa.push([fmtDate(d.date),d.in1,d.out1,d.in2,d.out2,fmtHHMM(d.ot),fmtHHMM(d.ut)]));
      aoa.push(['Sub total','','','','',fmtHHMM(r.otTotal),fmtHHMM(r.utTotal)]);
      aoa.push(['Total','','','','',fmtHHMM(r.total),'']);
      const ws=XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols']=[{wch:14},{wch:9},{wch:9},{wch:9},{wch:9},{wch:10},{wch:10}];
      XLSX.utils.book_append_sheet(wb,ws,safeSheetName(r.employee.name,used));
    }
    if(!wb.SheetNames.length)throw new Error('No employees selected.');
    XLSX.writeFile(wb,'FCS-OT-UT-Report-'+data.month+'.xlsx');
  }catch(e){alert(e.message||'Unable to export report.')}
}
async function saveAllChanges(){
  const btn=$('saveAllBtn');btn.disabled=true;btn.textContent='Saving...';
  try{
    const date=$('recordDate').value||today();
    normalizeTimeFields();
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
    btn.textContent='Saved';setSaveStatus('saved');setTimeout(()=>btn.textContent='Save Changes',900);
  }catch(e){alert(e.message||'Unable to save changes.');btn.textContent='Save Changes';setSaveStatus('unsaved');}
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
  (data||[]).map(h=>'<tr><td>'+fmtDate(h.holiday_date)+'</td><td>'+esc(h.name)+'</td><td><button class="secondary" onclick="deleteHoliday(\''+h.id+'\')">Delete</button></td></tr>').join('');
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


function printReportTab(tab){
  document.body.dataset.printTab=tab;
  window.print();
  setTimeout(()=>{delete document.body.dataset.printTab},500);
}

function setupTabs(){
  document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.tabpane').forEach(x=>x.classList.add('hidden'));$(b.dataset.tab+'Tab').classList.remove('hidden')});
}

$('workDate').value=today();$('recordDate').value=today();setupTimeInput('inTime','09:00');setupTimeInput('outTime','');
$('saveBtn').onclick=saveGate;$('adminBtn').onclick=()=>show('loginView');$('backBtn').onclick=()=>show('gateView');$('loginBtn').onclick=login;$('signupBtn').onclick=signup;
$('logoutBtn').onclick=async()=>{await db.auth.signOut();show('gateView')};
$('refreshRecords').onclick=loadRecords;$('recordDate').onchange=loadRecords;$('printRecord').onclick=()=>window.print();$('exportRecords').onclick=exportRecords;
$('addEmployee').onclick=addEmployee;$('addHoliday').onclick=addHoliday;$('saveAllBtn').onclick=saveAllChanges;$('generateReport').onclick=generateReport;$('printReport').onclick=()=>printReportTab('reports');$('exportReport').onclick=exportReport;$('reportMonth').onchange=loadReportOptions;$('attendanceMonth').value=monthNow();$('generateAttendanceReport').onclick=generateAttendanceReport;$('printAttendanceReport').onclick=()=>printReportTab('attendanceReport');$('exportAttendanceReport').onclick=exportAttendanceReport;setupTabs();

(async()=>{
  loadCache();await loadRules();await loadEmployees();await updatePending();await syncQueue();await checkSession();
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();