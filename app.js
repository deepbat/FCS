const SUPABASE_URL='https://raesuqidwkcpylvqiftf.supabase.co';
const SUPABASE_KEY='sb_publishable_IDPqntwDZCE5O5qsakvfTA_dGcex6zF';
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);
const QUEUE_KEY='fcs-attendance-pending-v3';
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
 const e=selected();
 $('employee').innerHTML=employees.map(x=>'<option value="'+x.id+'">'+x.name+'</option>').join('');
 if(e)$('employee').value=e.id;
 $('saveBtn').disabled=!e||saving;
 $('inTime').placeholder=isVarinder(e)?'6:00pm':'9:00';
 $('outTime').placeholder=isVarinder(e)?'8:00am':'5:45';
}
async function loadEmployees(){
 $('employeeList').innerHTML='<div class="loading">Loading employees...</div>';$('saveBtn').disabled=true;
 const {data,error}=await db.from('employees').select('*').eq('active',true).order('employee_code');
 if(error){employees=[];setMessage('Could not load employees: '+error.message,true);return}
 employees=data||[];renderEmployees();setSync();
}
async function getRule(e){
 const [h,r]=await Promise.all([
  db.from('holidays').select('id').eq('holiday_date',$('workDate').value).maybeSingle(),
  db.from('category_rules').select('ot_eligible,ot_threshold_minutes,normal_work_minutes,normal_start').eq('category',e.category).maybeSingle()
 ]);
 if(h.error)throw h.error;if(r.error)throw r.error;return {holiday:!!h.data,rule:r.data||{}};
}
async function syncOne(p){
 const record={...p.record};
 for(const k of ['normal_work_minutes','break_minutes','ot_threshold_minutes','round_minutes','total_elapsed_minutes','worked_minutes','ot_minutes','ut_minutes','sl_minutes'])if(typeof record[k]==='boolean')record[k]=record[k]?1:0;
 if(typeof record.ot_eligible==='number')record.ot_eligible=!!record.ot_eligible;
 if(typeof record.full_day_ot==='number')record.full_day_ot=!!record.full_day_ot;
 const [dr,ar]=await Promise.all([
  db.from('daily_records').upsert(record,{onConflict:'work_date,employee_id'}),
  db.from('attendance').upsert(p.attendance,{onConflict:'work_date,employee_id'})
 ]);
 if(dr.error)throw dr.error;if(ar.error)throw ar.error;
}
async function syncPending(){
 const raw=queue();if(!raw.length){setSync();return} 
 const latest=new Map();raw.forEach(p=>{if(p?.record)latest.set(p.record.work_date+'|'+p.record.employee_id,p)});
 const left=[];
 for(const p of latest.values()){try{await syncOne(p)}catch(e){left.push(p)}}
 saveQueue(left);setSync();
}
async function save(){
 if(saving)return;
 const e=selected(),date=$('workDate').value,it=normalize($('inTime').value),out=normalize($('outTime').value);
 if(!e||!date)return setMessage('Select employee and date.',true);
 if(!it||!out)return setMessage('Enter valid IN and OUT times.',true);
 const varinder=isVarinder(e);
 if(!e.split_shift&&minutes(out)<minutes(it))return setMessage('OUT cannot be earlier than IN.',true);
 saving=true;$('saveBtn').disabled=true;setMessage('Saving...');
 try{
  const {holiday,rule}=await getRule(e),sunday=new Date(date+'T12:00:00').getDay()===0;
  const firstOut=varinder?'01:00':out,secondIn=varinder?'06:00':null,secondOut=varinder?out:null;
  let elapsed;
  if(e.split_shift){elapsed=minutes(firstOut)-minutes(it);if(elapsed<0)elapsed+=1440;elapsed+=minutes(secondOut)-minutes(secondIn);if(e.round_minutes)elapsed=Math.round(elapsed/e.round_minutes)*e.round_minutes}
  else elapsed=minutes(out)-minutes(it);
  if(elapsed<0)elapsed+=1440;
  const normal=e.normal_work_minutes||rule.normal_work_minutes||0;
  const start=e.normal_start_minutes!=null?Number(e.normal_start_minutes):(rule.normal_start?minutes(rule.normal_start):540);
  const sl=!e.split_shift&&!sunday&&!holiday?Math.max(0,minutes(it)-start):0;
  let ot=0;
  if(rule.ot_eligible){
   if(sunday||holiday) ot=elapsed;
   else if(e.split_shift) ot=elapsed>normal+(rule.ot_threshold_minutes||0)?elapsed-normal:0;
   else {
    const normalEnd=rule.normal_end?minutes(rule.normal_end):(normal+(rule.normal_start?minutes(rule.normal_start):540));
    let finish=minutes(out);if(finish<540)finish+=1440;
    const extra=Math.max(0,finish-normalEnd);
    ot=extra>(rule.ot_threshold_minutes||0)?extra:0;
   }
  }
  const record={client_id:crypto.randomUUID(),work_date:date,employee_id:e.id,in_time:it,out_time:firstOut,in_time_2:e.split_shift?secondIn:null,out_time_2:e.split_shift?secondOut:null,break_minutes:e.split_shift?0:(e.break_minutes||0),normal_work_minutes:normal,ot_eligible:!!rule.ot_eligible,ot_threshold_minutes:rule.ot_threshold_minutes||15,round_minutes:e.round_minutes||0,full_day_ot:!!(sunday||holiday),total_elapsed_minutes:elapsed,worked_minutes:e.split_shift?elapsed:Math.max(0,elapsed-(e.break_minutes||0)),sl_minutes:sl,ot_minutes:ot,updated_at:new Date().toISOString()};
  const attendance={work_date:date,employee_id:e.id,status:sunday?'Sunday':holiday?'Holiday':'Present',updated_at:new Date().toISOString()};
  try{await syncOne({record,attendance});setMessage('Saved successfully.');clearInputs()}
  catch(err){const q=queue();q.push({record,attendance});saveQueue(q);setSync();clearInputs();setMessage('Saved on this phone. Sync pending.',true)}
 }catch(err){setMessage('Save failed: '+err.message,true)}
 finally{saving=false;$('saveBtn').disabled=!selected()}
}
$('workDate').value=today();
$('employee').onchange=()=>{clearInputs();renderEmployees();setMessage('')};
$('saveBtn').onclick=save;
$('inTime').onblur=e=>{if(e.target.value)e.target.value=normalize(e.target.value)||e.target.value};
$('outTime').onblur=e=>{if(e.target.value)e.target.value=normalize(e.target.value)||e.target.value};
window.addEventListener('online',syncPending);
(async()=>{setSync();await loadEmployees();await syncPending()})();
setInterval(()=>{if(queue().length)syncPending()},30000);