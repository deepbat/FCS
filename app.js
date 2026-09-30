const SUPABASE_URL='https://raesuqidwkcpylvqiftf.supabase.co';
const SUPABASE_KEY='sb_publishable_IDPqntwDZCE5O5qsakvfTA_dGcex6zF';
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);
const QUEUE_KEY='fcs-attendance-pending-v3';
const EMPLOYEES_KEY='fcs-attendance-employees-v1';
let employees=[],saving=false;

const queue=()=>{try{return JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]')}catch{return[]}};
const saveQueue=q=>localStorage.setItem(QUEUE_KEY,JSON.stringify(q));
const today=()=>{const d=new Date();return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const minutes=v=>{if(!v)return null;const p=String(v).slice(0,5).split(':').map(Number);return p.length===2&&p.every(Number.isFinite)?p[0]*60+p[1]:null};
const normalize=v=>{
 v=String(v||'').trim().toLowerCase().replace(/\s+/g,'').replace(/\./g,':');
 let m=v.match(/^(\d{1,2}):(\d{1,2})(am|pm)?$/);
 if(m){let h=+m[1],n=+m[2];if(n>59)return '';if(m[3]){if(h<1||h>12)return '';if(m[3]==='am'&&h===12)h=0;if(m[3]==='pm'&&h!==12)h+=12}else if(h>23)return '';return String(h).padStart(2,'0')+':'+String(n).padStart(2,'0')}
 m=v.match(/^(\d{1,2})(\d{2})$/);return m&&+m[1]<=23&&+m[2]<=59?String(+m[1]).padStart(2,'0')+':'+m[2]:/^\d{1,2}$/.test(v)&&+v<=23?String(+v).padStart(2,'0')+':00':'';
};
const setMessage=(s,error=false)=>{$('message').textContent=s||'';$('message').className='message '+(error?'error':'ok')};
const setSync=()=>{const n=queue().length;$('syncStatus').textContent=n?n+' pending sync':'Ready'};

function selected(){return employees.find(e=>e.id===$('employee').value)}
function isVarinder(e){return e?.name==='Varinder Pal'&&e?.split_shift}
function renderEmployees(){
 const current=$('employee').value;
 $('employee').innerHTML=employees.map(x=>'<option value="'+x.id+'">'+x.name+'</option>').join('');
 if(current&&employees.some(x=>String(x.id)===current))$('employee').value=current;
 else if(employees[0])$('employee').value=employees[0].id;
 const e=selected();
 $('saveBtn').disabled=!e||saving;
 $('inTime').placeholder=isVarinder(e)?'6:00pm':'9:00';
 $('outTime').placeholder=isVarinder(e)?'8:00am':'5:45';
 const splitBox=$('secondShift');
 const showGenericSplit=!!e?.split_shift&&!isVarinder(e);
 if(splitBox)splitBox.classList.toggle('hidden',!showGenericSplit);
 if(showGenericSplit){
   if($('inTime2')&&!$('inTime2').value)$('inTime2').value='1:00am';
   if($('outTime2')&&!$('outTime2').value)$('outTime2').value='6:00am';
 }
}
async function loadEmployees(){
 $('saveBtn').disabled=true;
 const {data,error}=await db.from('employees').select('*').eq('active',true).order('employee_code');
 if(error){
  try{employees=JSON.parse(localStorage.getItem(EMPLOYEES_KEY)||'[]')}catch{employees=[]}
  if(!employees.length){setMessage('Could not load employees. Connect once before using this phone offline.',true);return}
  renderEmployees();setMessage('Offline employee list. Check names before saving.',true);setSync();return
 }
 employees=data||[];
 try{localStorage.setItem(EMPLOYEES_KEY,JSON.stringify(employees))}catch{}
 renderEmployees();setSync();
}
async function getHoliday(date){
 const {data,error}=await db.from('holidays').select('id').eq('holiday_date',date).maybeSingle();
 if(error)throw error;
 return !!data;
}
async function calculate(e,date,it,firstOut,secondIn=null,secondOut=null){
 const {data,error}=await db.rpc('calculate_attendance',{
   p_employee_id:e.id,
   p_work_date:date,
   p_in_time:it,
   p_out_time:firstOut,
   p_in_time_2:secondIn,
   p_out_time_2:secondOut
 });
 if(error)throw error;
 const c=Array.isArray(data)?data[0]:data;
 if(!c)throw new Error('No calculation returned.');
 return c;
}
// Entries are queued before any network request. The queue stores raw times, not
// calculations, because the authoritative calculator and holiday table live in Supabase.
let syncing=false;
const entryKey=p=>p.work_date+'|'+p.employee_id;
function enqueue(p){
 const q=queue().filter(x=>entryKey(x.entry||x.record)!==entryKey(p));
 q.push({entry:p});saveQueue(q);setSync();
}
async function prepare(entry){
 const e=employees.find(x=>x.id===entry.employee_id);
 if(!e)throw new Error('Employee is no longer active; review this pending entry.');
 const holiday=await getHoliday(entry.work_date),sunday=new Date(entry.work_date+'T12:00:00').getDay()===0;
 const varinder=isVarinder(e),splitGeneric=!!e.split_shift&&!varinder;
 const firstOut=varinder?'01:00':entry.out_time;
 const secondIn=varinder?'06:00':(splitGeneric?entry.in_time_2:null);
 const secondOut=varinder?entry.out_time:(splitGeneric?entry.out_time_2:null);
 const c=await calculate(e,entry.work_date,entry.in_time,firstOut,secondIn,secondOut);
 const record={
  client_id:entry.client_id,work_date:entry.work_date,employee_id:e.id,
  in_time:entry.in_time,out_time:firstOut,
  in_time_2:e.split_shift?secondIn:null,out_time_2:e.split_shift?secondOut:null,
  break_minutes:c.break_minutes,normal_work_minutes:c.normal_work_minutes,
  ot_eligible:c.ot_eligible,ot_threshold_minutes:c.ot_threshold_minutes,
  round_minutes:c.round_minutes,full_day_ot:c.full_day_ot,
  total_elapsed_minutes:c.total_elapsed_minutes,worked_minutes:c.worked_minutes,
  ut_minutes:c.ut_minutes,sl_minutes:c.sl_minutes,ot_minutes:c.ot_minutes,
  updated_at:new Date().toISOString()
 };
 const attendance={work_date:entry.work_date,employee_id:e.id,status:sunday?'Sunday':holiday?'Holiday':'Present',updated_at:new Date().toISOString()};
 return {record,attendance};
}
async function syncOne(p){
 const record=p.record;
 // One server-side transaction writes both tables. The same client_id is
 // retained across retries so duplicate queue delivery is idempotent.
 const {error}=await db.rpc('save_gate_attendance',{
   p_client_id:record.client_id,
   p_work_date:record.work_date,
   p_employee_id:record.employee_id,
   p_in_time:record.in_time,
   p_out_time:record.out_time,
   p_in_time_2:record.in_time_2,
   p_out_time_2:record.out_time_2
 });
 if(error)throw error;
}
async function syncPending(){
 if(syncing||!navigator.onLine)return;
 syncing=true;
 let failed=0,conflict=false;
 try{
  // Remove only the item we successfully sent; do not overwrite entries queued mid-sync.
  for(const item of queue()){
   const current=queue().find(x=>x.entry?.client_id===item.entry?.client_id || (x.record?.client_id&&x.record.client_id===item.record?.client_id));
   if(!current)continue;
   try{
    await syncOne(item.entry?await prepare(item.entry):item);
    saveQueue(queue().filter(x=>x!==current && (x.entry?.client_id||x.record?.client_id)!==(current.entry?.client_id||current.record?.client_id)));
   }catch(err){failed++;if(/already exists on the server/.test(err.message))conflict=true;console.warn('Pending entry was retained:',err)}
  }
 }finally{syncing=false;setSync();if(conflict)setMessage('An entry already exists on the server. Pending entry kept for admin review.',true);else if(failed)setMessage(failed+' pending entr'+(failed===1?'y':'ies')+' could not sync. Kept on this phone.',true)}
}
function clearInputs(){
 $('inTime').value='';
 $('outTime').value='';
 if($('inTime2'))$('inTime2').value='';
 if($('outTime2'))$('outTime2').value='';
 const e=selected();
 if(e?.split_shift&&!isVarinder(e)){
   if($('inTime2'))$('inTime2').value='1:00am';
   if($('outTime2'))$('outTime2').value='6:00am';
 }
}
async function save(){
 if(saving)return;
 const e=selected(),date=$('workDate').value,it=normalize($('inTime').value),out=normalize($('outTime').value);
 const splitGeneric=!!e?.split_shift&&!isVarinder(e),it2=splitGeneric?normalize($('inTime2')?.value):null,out2=splitGeneric?normalize($('outTime2')?.value):null;
 if(!e||!date)return setMessage('Select employee and date.',true);
 if(!it||!out)return setMessage('Enter valid IN and OUT times.',true);
 if(splitGeneric&&(!it2||!out2))return setMessage('Enter both second-shift IN and OUT times.',true);
 if(!e.split_shift&&minutes(out)<minutes(it))return setMessage('OUT cannot be earlier than IN.',true);
 saving=true;$('saveBtn').disabled=true;
 try{
  const entry={client_id:crypto.randomUUID(),work_date:date,employee_id:e.id,in_time:it,out_time:out,in_time_2:it2,out_time_2:out2};
  enqueue(entry);clearInputs();setMessage('Saved on this phone. Sync pending.');
  if(navigator.onLine)await syncPending();
  if(!queue().some(x=>x.entry?.client_id===entry.client_id))setMessage('Saved successfully.');
 }catch(err){setMessage('Could not save on this phone: '+err.message,true)}
 finally{saving=false;$('saveBtn').disabled=!selected()}
}
$('workDate').value=today();
$('employee').onchange=()=>{clearInputs();renderEmployees();setMessage('')};
$('saveBtn').onclick=save;
$('inTime').onblur=e=>{if(e.target.value)e.target.value=normalize(e.target.value)||e.target.value};
$('outTime').onblur=e=>{if(e.target.value)e.target.value=normalize(e.target.value)||e.target.value};
$('inTime2')?.addEventListener('blur',e=>{if(e.target.value)e.target.value=normalize(e.target.value)||e.target.value});
$('outTime2')?.addEventListener('blur',e=>{if(e.target.value)e.target.value=normalize(e.target.value)||e.target.value});
window.addEventListener('online',syncPending);
(async()=>{setSync();await loadEmployees();await syncPending()})();
setInterval(()=>{if(queue().length)syncPending()},30000);
