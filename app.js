const SUPABASE_URL='https://raesuqidwkcpylvqiftf.supabase.co';
const SUPABASE_KEY='sb_publishable_IDPqntwDZCE5O5qsakvfTA_dGcex6zF';
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);
let employees=[];\nconst QUEUE_KEY='fcs-attendance-pending-v2';\nconst getQueue=()=>{try{return JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]')}catch{return[]}};\nconst setQueue=q=>localStorage.setItem(QUEUE_KEY,JSON.stringify(q));\nfunction updatePending(){const n=getQueue().length;$('pendingCount').textContent=n?n+' pending':'';$('syncStatus').textContent=n?'Pending sync':'Ready'}\nasync function syncQueue(){const q=getQueue();if(!q.length)return;const left=[];for(const p of q){try{const r=await db.from('daily_records').upsert(p.record,{onConflict:'client_id'});if(r.error)throw r.error;const a=await db.from('attendance').upsert(p.attendance,{onConflict:'work_date,employee_id'});if(a.error)throw a.error}catch(e){left.push(p)}}setQueue(left);updatePending()}\nwindow.addEventListener('online',syncQueue);

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
  const e=employees.find(x=>x.id===$('employee').value);
  $('splitFields').classList.toggle('hidden',!e?.split_shift);
  if(e?.split_shift){$('inTime').placeholder='6:00pm';$('outTime').placeholder='1:00am'}else{$('inTime').placeholder='9:00';$('outTime').placeholder='5:45'}
}
function clearInputs(){
  $('inTime').value='';$('outTime').value='';$('inTime2').value='';$('outTime2').value='';
}
async function save(){
  setMessage('');
  const e=employees.find(x=>x.id===$('employee').value),date=$('workDate').value;
  if(!e||!date){setMessage('Select date and employee.',true);return}
  const it=normalizeTime($('inTime').value),ot=normalizeTime($('outTime').value);
  const it2=normalizeTime($('inTime2').value),ot2=normalizeTime($('outTime2').value);
  if(!it||!ot){setMessage('Enter valid IN and OUT times.',true);return}
  if(!e.split_shift&&minutes(ot)<minutes(it)){setMessage('OUT cannot be earlier than IN.',true);return}
  if(e.split_shift&&(!it2||!ot2)){setMessage('Enter both second-shift times.',true);return}
  const payload={
    client_id:crypto.randomUUID(),work_date:date,employee_id:e.id,
    in_time:it,out_time:ot,in_time_2:e.split_shift?it2:null,out_time_2:e.split_shift?ot2:null,
    break_minutes:e.break_minutes||0,normal_work_minutes:e.normal_work_minutes||0,
    ot_eligible:e.category==='Driver'||e.category==='Gateman',ot_threshold_minutes:15,
    round_minutes:e.round_minutes||0,full_day_ot:false,updated_at:new Date().toISOString()
  };
  const {error}=await db.from('daily_records').upsert(payload,{onConflict:'client_id'});
  if(error){setMessage(error.message,true);return}
  const sunday=new Date(date+'T12:00:00').getDay()===0;
  let status=sunday?'Sunday':'Present';
  const {data:hol}=await db.from('holidays').select('id').eq('holiday_date',date).maybeSingle();
  if(hol)status='Holiday';
  const {error:ae}=await db.from('attendance').upsert(
    {work_date:date,employee_id:e.id,status,updated_at:new Date().toISOString()},
    {onConflict:'work_date,employee_id'}
  );
  if(ae){setMessage(ae.message,true);return}
  clearInputs();setMessage('Saved successfully.');
}
$('workDate').value=today();
$('employee').addEventListener('change',updateSplit);
$('saveBtn').addEventListener('click',save);
$('inTime').addEventListener('blur',e=>{if(e.target.value)e.target.value=normalizeTime(e.target.value)||e.target.value});
$('outTime').addEventListener('blur',e=>{if(e.target.value)e.target.value=normalizeTime(e.target.value)||e.target.value});
$('inTime2').addEventListener('blur',e=>{if(e.target.value)e.target.value=normalizeTime(e.target.value)||e.target.value});
$('outTime2').addEventListener('blur',e=>{if(e.target.value)e.target.value=normalizeTime(e.target.value)||e.target.value});
(async()=>{await loadEmployees();updatePending();await syncQueue();})();