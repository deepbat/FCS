const SUPABASE_URL='https://raesuqidwkcpylvqiftf.supabase.co';
const SUPABASE_KEY='sb_publishable_IDPqntwDZCE5O5qsakvfTA_dGcex6zF';
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);
let employees=[];
const QUEUE_KEY='fcs-attendance-pending-v2';
const getQueue=()=>{try{return JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]')}catch{return[]}};
const setQueue=q=>localStorage.setItem(QUEUE_KEY,JSON.stringify(q));
let syncing=false,lastSyncError='';
function updatePending(){const n=getQueue().length;$('pendingCount').textContent=n?n+' pending':'';$('syncStatus').textContent=n?(syncing?'Syncing...':(lastSyncError?'Sync failed':'Pending sync')):'Ready'}
async function syncOne(p){
  const record={...p.record};
  for(const k of ['normal_work_minutes','break_minutes','ot_threshold_minutes','round_minutes','total_elapsed_minutes','worked_minutes','ot_minutes','ut_minutes','sl_minutes']){
    if(typeof record[k]==='boolean')record[k]=record[k]?1:0;
  }
  if(typeof record.ot_eligible==='number')record.ot_eligible=!!record.ot_eligible;
  if(typeof record.full_day_ot==='number')record.full_day_ot=!!record.full_day_ot;
  const {data:existing,error:findError}=await db.from('daily_records').select('id').eq('work_date',record.work_date).eq('employee_id',record.employee_id).maybeSingle();
  if(findError)throw findError;
  let rr;
  if(existing){const {client_id,...changes}=record;rr=await db.from('daily_records').update(changes).eq('id',existing.id)}
  else rr=await db.from('daily_records').insert(record);
  if(rr.error)throw rr.error;
  const ar=await db.from('attendance').upsert(p.attendance,{onConflict:'work_date,employee_id'});
  if(ar.error)throw ar.error;
}
async function syncQueue(){
  if(syncing)return;
  const raw=getQueue();if(!raw.length){updatePending();return}
  syncing=true;updatePending();
  const latest=new Map();
  for(const p of raw){const k=p?.record?.work_date+'|'+p?.record?.employee_id;if(p?.record&&p?.attendance&&k!=='undefined|undefined')latest.set(k,p)}
  const q=[...latest.values()];
  const left=[];lastSyncError='';
  for(const p of q){
    try{await syncOne(p)}catch(e){lastSyncError=e?.message||String(e);left.push(p)}
  }
  setQueue(left);syncing=false;updatePending();if(left.length&&lastSyncError)setMessage('Sync failed: '+lastSyncError,true);
}
window.addEventListener('online',()=>syncQueue());
window.addEventListener('focus',()=>syncQueue());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncQueue()});
setInterval(()=>{if(getQueue().length)syncQueue()},10000);

function today(){
  const d=new Date(); return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
}
function normalizeTime(v){
  v=String(v||'').trim().toLowerCase().replace(/\s+/g,'').replace(/\./g,':');
  let m=v.match(/^(\d{1,2}):(\d{1,2})(am|pm)?$/);
  if(m){
    let h=+m[1],n=+m[2]; if(n>59)return '';
    if(m[3]){if(h<1||h>12)return '';if(m[3]==='am'&&h===12)h=0;if(m[3]==='pm'&&h!==12)h+=12}
    else if(h>23)return '';
    return String(h).padStart(2,'0')+':'+String(n).padStart(2,'0');
  }
  m=v.match(/^(\d{1,2})(\d{2})$/);
  if(m&&+m[1]<=23&&+m[2]<=59)return String(+m[1]).padStart(2,'0')+':'+m[2];
  if(/^\d{1,2}$/.test(v)&&+v<=23)return String(+v).padStart(2,'0')+':00';
  return '';
}
function minutes(v){const [h,m]=String(v).split(':').map(Number);return h*60+m}
function fmtTime(v){if(!v)return '';const [h,m]=String(v).slice(0,5).split(':').map(Number);const ap=h>=12?'pm':'am';const hh=h%12||12;return hh+':'+String(m).padStart(2,'0')+ap}
function setMessage(t,error=false){$('message').textContent=t||'';$('message').style.color=error?'#b42318':'#166534'}
async function loadEmployees(){
  const {data,error}=await db.from('employees').select('*').eq('active',true).order('employee_code');
  if(error){setMessage(error.message,true);return}
  employees=data||[];
  $('employee').innerHTML=employees.map(e=>'<option value="'+e.id+'">'+e.name+'</option>').join('');
  updateSplit();
}
function updateSplit(){
  const e=employees.find(x=>x.id===$('employee').value),v=e?.name==='Varinder Pal'&&e?.split_shift;
  $('splitFields').classList.toggle('hidden',true);
  if(v){$('inTime').placeholder='6:00pm';$('outTime').placeholder='8:00am'}
  else{$('inTime').placeholder='9:00';$('outTime').placeholder='5:45'}
}
function clearInputs(){
  $('inTime').value='';$('outTime').value='';$('inTime2').value='';$('outTime2').value='';
}
async function save(){
  setMessage('');
  const e=employees.find(x=>x.id===$('employee').value),date=$('workDate').value;
  if(!e||!date){setMessage('Select date and employee.',true);return}
  const it=normalizeTime($('inTime').value),visibleOut=normalizeTime($('outTime').value);
  if(!it||!visibleOut){setMessage('Enter valid IN and OUT times.',true);return}
  const varinder=e.name==='Varinder Pal'&&e.split_shift;
  const firstOut=varinder?'01:00':visibleOut;
  const secondIn=varinder?'06:00':normalizeTime($('inTime2').value);
  const secondOut=varinder?visibleOut:normalizeTime($('outTime2').value);
  if(!e.split_shift&&minutes(visibleOut)<minutes(it)){setMessage('OUT cannot be earlier than IN.',true);return}
  if(e.split_shift&&!varinder&&(!secondIn||!secondOut)){setMessage('Enter both second-shift times.',true);return}
  let elapsed=0;
  if(e.split_shift){
    elapsed=minutes(firstOut)-minutes(it);if(elapsed<0)elapsed+=1440;
    elapsed+=minutes(secondOut)-minutes(secondIn);
    if(e.round_minutes)elapsed=Math.round(elapsed/e.round_minutes)*e.round_minutes;
  }else{
    elapsed=minutes(visibleOut)-minutes(it);if(elapsed<0)elapsed+=1440;
    elapsed=Math.max(0,elapsed-(e.break_minutes||0));
  }
  const sunday=new Date(date+'T12:00:00').getDay()===0;
  let status=sunday?'Sunday':'Present';
  const {data:hol}=await db.from('holidays').select('id').eq('holiday_date',date).maybeSingle();
  if(hol)status='Holiday';
  const rule=(await db.from('category_rules').select('ot_eligible,ot_threshold_minutes,normal_work_minutes').eq('category',e.category).maybeSingle()).data;
  const normal=e.normal_work_minutes||rule?.normal_work_minutes||0;
  const start=e.normal_start_minutes!=null?Number(e.normal_start_minutes):(rule?.normal_start?minutes(rule.normal_start):540);
  const sl=!e.split_shift&&!sunday&&!hol?Math.max(0,minutes(it)-start):0;
  const ot=rule?.ot_eligible?((sunday||hol)?elapsed:elapsed>(normal+(rule?.ot_threshold_minutes||0))?elapsed-normal:0):0;
  const record={
    client_id:crypto.randomUUID(),work_date:date,employee_id:e.id,
    in_time:it,out_time:firstOut,in_time_2:e.split_shift?secondIn:null,out_time_2:e.split_shift?secondOut:null,
    break_minutes:e.split_shift?0:(e.break_minutes||0),normal_work_minutes:normal,
    ot_eligible:!!rule?.ot_eligible,ot_threshold_minutes:rule?.ot_threshold_minutes||15,
    round_minutes:e.round_minutes||0,full_day_ot:!!(sunday||hol),total_elapsed_minutes:elapsed,
    worked_minutes:elapsed,sl_minutes:sl,ot_minutes:ot,updated_at:new Date().toISOString()
  };
  const attendancePayload={work_date:date,employee_id:e.id,status,updated_at:new Date().toISOString()};
  try{await syncOne({record,attendance:attendancePayload})}
  catch(e){
    const q=getQueue();q.push({record,attendance:attendancePayload});setQueue(q);updatePending();
    clearInputs();setMessage('Saved on this device. It will sync when internet is available.',false);return
  }
  updatePending();clearInputs();setMessage('Saved successfully.');syncQueue();
}
$('workDate').value=today();
$('employee').addEventListener('change',updateSplit);
$('saveBtn').addEventListener('click',save);
$('inTime').addEventListener('blur',e=>{if(e.target.value)e.target.value=normalizeTime(e.target.value)||e.target.value});
$('outTime').addEventListener('blur',e=>{if(e.target.value)e.target.value=normalizeTime(e.target.value)||e.target.value});
$('inTime2').addEventListener('blur',e=>{if(e.target.value)e.target.value=normalizeTime(e.target.value)||e.target.value});
$('outTime2').addEventListener('blur',e=>{if(e.target.value)e.target.value=normalizeTime(e.target.value)||e.target.value});
(async()=>{if('serviceWorker'in navigator){const rs=await navigator.serviceWorker.getRegistrations();for(const r of rs)await r.unregister();if(window.caches){for(const k of await caches.keys())if(k.startsWith('fcs-attendance-'))await caches.delete(k)}}await loadEmployees();updatePending();await syncQueue();})();