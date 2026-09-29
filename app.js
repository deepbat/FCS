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
 const current=$('employee').value;
 $('employee').innerHTML=employees.map(x=>'<option value="'+x.id+'">'+x.name+'</option>').join('');
 if(current&&employees.some(x=>String(x.id)===current))$('employee').value=current;
 else if(employees[0])$('employee').value=employees[0].id;
 const e=selected();
 $('saveBtn').disabled=!e||saving;
 $('inTime').placeholder=isVarinder(e)?'6:00pm':'9:00';
 $('outTime').placeholder=isVarinder(e)?'8:00am':'5:45';
 const splitBox=$('secondShift');
 if(splitBox)splitBox.classList.toggle('hidden',!e?.split_shift||isVarinder(e));
}
async function loadEmployees(){
 $('employeeList').innerHTML='<div class="loading">Loading employees...</div>';$('saveBtn').disabled=true;
 const {data,error}=await db.from('employees').select('*').eq('active',true).order('employee_code');
 if(error){employees=[];setMessage('Could not load employees: '+error.message,true);return}
 employees=data||[];renderEmployees();setSync();
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
function clearInputs(){
 $('inTime').value='';
 $('outTime').value='';
 if($('inTime2'))$('inTime2').value='';
 if($('outTime2'))$('outTime2').value='';
}
async function save(){
 if(saving)return;
 const e=selected(),date=$('workDate').value,it=normalize($('inTime').value),out=normalize($('outTime').value);
 const splitGeneric=!!e?.split_shift&&!isVarinder(e),it2=splitGeneric?normalize($('inTime2')?.value):null,out2=splitGeneric?normalize($('outTime2')?.value):null;
 if(!e||!date)return setMessage('Select employee and date.',true);
 if(!it||!out)return setMessage('Enter valid IN and OUT times.',true);
 if(splitGeneric&&(!it2||!out2))return setMessage('Enter both second-shift IN and OUT times.',true);
 const varinder=isVarinder(e);
 if(!e.split_shift&&minutes(out)<minutes(it))return setMessage('OUT cannot be earlier than IN.',true);
 saving=true;$('saveBtn').disabled=true;setMessage('Saving...');
 try{
  const holiday=await getHoliday(date),sunday=new Date(date+'T12:00:00').getDay()===0;
  const firstOut=varinder?'01:00':out,secondIn=varinder?'06:00':(splitGeneric?it2:null),secondOut=varinder?out:(splitGeneric?out2:null);
  const c=await calculate(e,date,it,firstOut,secondIn,secondOut);
  const record={
   client_id:crypto.randomUUID(),work_date:date,employee_id:e.id,
   in_time:it,out_time:firstOut,
   in_time_2:e.split_shift?secondIn:null,out_time_2:e.split_shift?secondOut:null,
   break_minutes:c.break_minutes,normal_work_minutes:c.normal_work_minutes,
   ot_eligible:c.ot_eligible,ot_threshold_minutes:c.ot_threshold_minutes,
   round_minutes:c.round_minutes,full_day_ot:c.full_day_ot,
   total_elapsed_minutes:c.total_elapsed_minutes,worked_minutes:c.worked_minutes,
   ut_minutes:c.ut_minutes,sl_minutes:c.sl_minutes,ot_minutes:c.ot_minutes,
   updated_at:new Date().toISOString()
  };
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
$('inTime2')?.addEventListener('blur',e=>{if(e.target.value)e.target.value=normalize(e.target.value)||e.target.value});
$('outTime2')?.addEventListener('blur',e=>{if(e.target.value)e.target.value=normalize(e.target.value)||e.target.value});
window.addEventListener('online',syncPending);
(async()=>{setSync();await loadEmployees();await syncPending()})();
setInterval(()=>{if(queue().length)syncPending()},30000);