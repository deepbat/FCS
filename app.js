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
function parseAdjustmentMinutes(v){const s=String(v??'').trim().toLowerCase();if(!s)return null;if(/^\d+(?:\.\d+)?$/.test(s))return Math.max(0,Math.round(Number(s)));const hm=s.match(/^(\d+)\s*[:.]\s*(\d{1,2})$/);if(hm){const m=Number(hm[2]);return m<60?Number(hm[1])*60+m:null}const h=s.match(/^(\d+)\s*h(?:ours?)?\s*(?:(\d{1,2})\s*m(?:in(?:ute)?s?)?)?$/);if(h)return Number(h[1])*60+Number(h[2]||0);const m=s.match(/^(\d+)\s*m(?:in(?:ute)?s?)?$/);return m?Number(m[1]):null}
function adjustmentInputValue(v){return v==null?'':fmtMin(v)}
function effectiveAdjustment(rec,field,calculated){return rec&&rec[field]!=null?Number(rec[field]):Math.max(0,Math.round(Number(calculated)||0));}
const today=()=>{const d=new Date();return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const monthNow=()=>today().slice(0,7);
const monthRange=m=>{const d=new Date(m+'-01T00:00:00');return {start:m+'-01',end:new Date(d.getFullYear(),d.getMonth()+1,1).toISOString().slice(0,10)}};
const fmtDate=d=>{const s=String(d||'');const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?m[3]+'/'+m[2]+'/'+m[1]:s};

let employees=[],rules=[];
const recordDrafts=new Map();
let personEmployees=[];
let personEmployeeIndex=0;

function capturePersonRowDraft(row){
  const date=row?.dataset?.date,employeeId=row?.dataset?.employeeId;
  if(!date||!employeeId)return;
  const emp=personEmployees.find(e=>e.id===employeeId);if(!emp)return;
  const inTime=normalizeTime(row.querySelector('.personIn')?.value||''),outTime=normalizeTime(row.querySelector('.personOut')?.value||'');
  const status=row.querySelector('.personAttendance')?.value||'';
  const bg=window.__personSecondShift?.get(employeeId+'|'+date)||{};
  const oldIn=row.dataset.origIn||'',oldOut=row.dataset.origOut||'',oldStatus=row.dataset.origStatus||'',oldFirst=row.dataset.origFirstOut||'',oldIn2=row.dataset.origIn2||'';
  const readOverride=(selector,field,origDisplay,origOverride)=>{
    const raw=String(row.querySelector(selector)?.value??'').trim();
    if(row.dataset[field+'OverrideDirty']!=='1')return origOverride===''?null:Number(origOverride);
    return raw===''?null:parseAdjustmentMinutes(raw);
  };
  const utOverride=readOverride('.personUT','ut',row.dataset.origUtDisplay||'',row.dataset.origUtOverride||'');
  const slOverride=readOverride('.personSL','sl',row.dataset.origSlDisplay||'',row.dataset.origSlOverride||'');
  const otOverride=readOverride('.personOT','ot',row.dataset.origOtDisplay||'',row.dataset.origOtOverride||'');
  const adjChanged=String(row.querySelector('.personUT')?.value??'').trim()!==(row.dataset.origUtDisplay||'')||
    String(row.querySelector('.personSL')?.value??'').trim()!==(row.dataset.origSlDisplay||'')||
    String(row.querySelector('.personOT')?.value??'').trim()!==(row.dataset.origOtDisplay||'');
  const changed=inTime!==oldIn||outTime!==oldOut||status!==oldStatus||adjChanged||
    (emp.split_shift&&((bg.out_time||'')!==oldFirst||(bg.in_time_2||'')!==oldIn2));
  const key=date+'|'+employeeId;
  if(changed){
    recordDrafts.set(key,{date,employee_id:employeeId,in_time:inTime,out_time:outTime,status,split:!!emp.split_shift,
      first_out:emp.split_shift?(bg.out_time||'').slice(0,5):'',in_time_2:emp.split_shift?(bg.in_time_2||'').slice(0,5):'',
      ut_override:utOverride,sl_override:slOverride,ot_override:otOverride,dirty:true});
  }else{
    const d=recordDrafts.get(key);if(d?.dirty)recordDrafts.delete(key);
  }
}

function captureCurrentPersonDraft(){
  document.querySelectorAll('#personRegisterTable tr[data-person-row]').forEach(capturePersonRowDraft);
}

function draftFor(date,employeeId){return recordDrafts.get(date+'|'+employeeId)||null;}
function legacySplitFor(emp,rec){
  if(!emp?.split_shift||!rec||rec.in_time_2||rec.out_time_2)return null;
  return {first_out:'01:00',in_time_2:'06:00',out_time_2:(rec.out_time||'').slice(0,5)};
}

function personMonthRange(month){
  const [y,m]=String(month||monthNow()).split('-').map(Number);
  const start=y+'-'+String(m).padStart(2,'0')+'-01';
  const last=new Date(Date.UTC(y,m,0)).getUTCDate();
  return {start,end:y+'-'+String(m).padStart(2,'0')+'-'+String(last).padStart(2,'0'),days:last};
}

function personStatusOptions(emp,status){
  const list=emp.category==='Staff'?['Present','First Half Leave','Second Half Leave','Full Day Leave','Holiday','Sunday']:['Present','Absent','Leave','Half Day','Holiday','Sunday'];
  return '<option></option>'+list.map(s=>'<option '+(status===s?'selected':'')+'>'+s+'</option>').join('');
}

function attendanceStatusForRecord(emp,rec,date,explicit,holiday){
  const dow=new Date(date+'T00:00:00').getDay();
  if(holiday)return 'Holiday';
  if(dow===0)return 'Sunday';
  if(explicit)return explicit;
  if(!rec)return '';
  const ni=rec.in_time?.slice(0,5)||'';
  const no=(emp.split_shift&&rec.out_time_2?rec.out_time_2:rec.out_time)?.slice(0,5)||'';
  const im=timeMinutes(ni),om=timeMinutes(no);
  if(im===null||om===null)return '';
  if(emp.category==='Staff'){
    if(im<=570&&om<=795)return 'Second Half Leave';
    if(im>=825&&om>=1035)return 'First Half Leave';
    if(im<=570&&om>=1035)return 'Present';
    return '';
  }
  return 'Present';
}
async function loadPersonRegister(){
  const month=$('personMonth')?.value||monthNow();
  const {start,end,days}=personMonthRange(month);
  const [{data:emps,error:empError},{data:records,error:recError},{data:att,error:attError},{data:hols,error:holError}]=await Promise.all([
    db.from('employees').select('id,employee_code,name,category,normal_work_minutes,break_minutes,round_minutes,split_shift').eq('active',true).order('employee_code').order('name'),
    db.from('daily_records').select('id,work_date,employee_id,in_time,out_time,in_time_2,out_time_2,worked_minutes,ot_minutes,ut_minutes,sl_minutes,ut_override_minutes,sl_override_minutes,ot_override_minutes').gte('work_date',start).lte('work_date',end),
    db.from('attendance').select('work_date,employee_id,status').gte('work_date',start).lte('work_date',end),
    db.from('holidays').select('holiday_date,name').gte('holiday_date',start).lte('holiday_date',end)
  ]);
  const err=empError||recError||attError||holError;
  if(err){$('personRegisterTable').innerHTML='<tr><td>'+esc(err.message)+'</td></tr>';return;}
  personEmployees=emps||[];
  if(!personEmployees.length){$('personRegisterTable').innerHTML='<tr><td>No active employees.</td></tr>';return;}
  if(personEmployeeIndex>=personEmployees.length)personEmployeeIndex=0;
  const selected=personEmployees[personEmployeeIndex];
  const recordMap=new Map((records||[]).map(r=>[r.work_date+'|'+r.employee_id,r]));
  const attMap=new Map((att||[]).map(r=>[r.work_date+'|'+r.employee_id,r.status]));
  const holidaySet=new Set((hols||[]).map(h=>h.holiday_date));
  const personKeys=new Set(personEmployees.map(e=>e.id));
  document.querySelectorAll('#personTabs .personTab').forEach(x=>x.classList.toggle('active',x.dataset.id===selected.id));
  let totalUT=0,totalSL=0,totalOT=0,totalWorkingDays=0,totalPresent=0,totalHalfDay=0,totalLeave=0,totalAbsent=0,totalSunday=0,totalHoliday=0;
  window.__personSecondShift=new Map();
  window.__personHolidaySet=holidaySet;
  const countThrough=month===monthNow()?today():end.slice(0,10);
  let html='<tr><th>Date</th><th>In Time</th><th>UT</th><th>Out Time</th><th>SL</th><th>OT</th><th>Attendance</th></tr>';
  for(let day=1;day<=days;day++){
    const date=start.slice(0,8)+String(day).padStart(2,'0');
    const emp=selected;
    const rec=recordMap.get(date+'|'+emp.id);
    const draft=draftFor(date,emp.id);
    const explicitStatus=attMap.get(date+'|'+emp.id);
    const autoStatus=attendanceStatusForRecord(emp,rec,date,explicitStatus,holidaySet.has(date));
    const status=draft?(draft.status||autoStatus):autoStatus;
    const dow=new Date(date+'T00:00:00').getDay(),isHoliday=holidaySet.has(date);
    if(date<=countThrough){
      if(isHoliday)totalHoliday++; else if(dow===0)totalSunday++; else totalWorkingDays++;
      if(status==='Present')totalPresent++;
      else if(['First Half Leave','Second Half Leave','Half Day'].includes(status))totalHalfDay++;
      else if(['Full Day Leave','Leave'].includes(status))totalLeave++;
      else if(status==='Absent')totalAbsent++;
    }
    const inTime=draft?draft.in_time:(rec?.in_time?.slice(0,5)||'');
    const outTime=draft?draft.out_time:(emp.split_shift?(rec?.out_time_2?.slice(0,5)||''):(rec?.out_time?.slice(0,5)||''));
    const firstOut=draft?.first_out||(emp.split_shift?rec?.out_time?.slice(0,5)||'':'');
    const in2=draft?.in_time_2||(emp.split_shift?rec?.in_time_2?.slice(0,5)||'':'');
    if(emp.split_shift)window.__personSecondShift.set(emp.id+'|'+date,{out_time:firstOut,in_time_2:in2,out_time_2:outTime});
    const live=rec||draft?calcLiveMinutes(emp,inTime,emp.split_shift?firstOut:outTime,emp.split_shift?in2:'',emp.split_shift?outTime:'',date,holidaySet.has(date)):null;
    const calcAdj=dailyTimeAdjustments(emp,inTime,date,holidaySet.has(date)),calcOt=live?.ot??(rec?Number(rec.ot_minutes)||0:0);
    const ut=draft?(draft.ut_override!=null?draft.ut_override:calcAdj.ut):effectiveAdjustment(rec,'ut_override_minutes',calcAdj.ut);
    const sl=draft?(draft.sl_override!=null?draft.sl_override:calcAdj.sl):effectiveAdjustment(rec,'sl_override_minutes',calcAdj.sl);
    const ot=draft?(draft.ot_override!=null?draft.ot_override:calcOt):effectiveAdjustment(rec,'ot_override_minutes',calcOt);
    totalUT+=ut;totalSL+=sl;totalOT+=ot;
    const timeInput=(cls,val)=>'<input class="timeEdit '+cls+'" type="text" inputmode="numeric" maxlength="5" autocomplete="off" value="'+esc(val||'')+'">';
    const adjustInput=(cls,val)=>'<input class="adjustEdit '+cls+'" type="text" inputmode="numeric" autocomplete="off" value="'+esc(adjustmentInputValue(val))+'">';
    const rowClass=isHoliday?'holidayRow':(dow===0?'sundayRow':(['First Half Leave','Second Half Leave','Full Day Leave','Leave','Half Day'].includes(status)?'leaveRow':'')); 
    html+='<tr class="'+rowClass+'" data-person-row data-date="'+date+'" data-employee-id="'+emp.id+'" data-orig-in="'+esc(rec?.in_time?.slice(0,5)||'')+'" data-orig-out="'+esc(emp.split_shift?(rec?.out_time_2?.slice(0,5)||''):(rec?.out_time?.slice(0,5)||''))+'" data-orig-status="'+esc(explicitStatus||attendanceStatusForRecord(emp,rec,date,explicitStatus,holidaySet.has(date)))+'" data-orig-first-out="'+esc(firstOut||'')+'" data-orig-in2="'+esc(in2||'')+'" data-orig-ut-display="'+esc(adjustmentInputValue(ut))+'" data-orig-sl-display="'+esc(adjustmentInputValue(sl))+'" data-orig-ot-display="'+esc(adjustmentInputValue(ot))+'" data-orig-ut-override="'+(draft?(draft.ut_override==null?'':draft.ut_override):(rec?.ut_override_minutes==null?'':rec.ut_override_minutes))+'" data-orig-sl-override="'+(draft?(draft.sl_override==null?'':draft.sl_override):(rec?.sl_override_minutes==null?'':rec.sl_override_minutes))+'" data-orig-ot-override="'+(draft?(draft.ot_override==null?'':draft.ot_override):(rec?.ot_override_minutes==null?'':rec.ot_override_minutes))+'"><td>'+fmtDate(date)+'</td><td>'+timeInput('personIn',inTime)+'</td><td>'+adjustInput('personUT',ut)+'</td><td>'+timeInput('personOut',outTime)+'</td><td>'+adjustInput('personSL',sl)+'</td><td>'+adjustInput('personOT',ot)+'</td><td><select class="personAttendance">'+personStatusOptions(emp,status)+'</select></td></tr>';
  }
  $('personTabs').innerHTML=personEmployees.map((e,i)=>'<button type="button" class="secondary personTab '+(i===personEmployeeIndex?'active':'')+'" data-index="'+i+'" data-id="'+e.id+'">'+esc(e.name)+'</button>').join('');
  $('personTitle').textContent=esc(selected.name)+' | '+month;
  html+='<tr class="personTotal"><td colspan="7"><strong>Total Working Days:</strong> '+totalWorkingDays+' &nbsp; <strong>Present:</strong> '+totalPresent+' &nbsp; <strong>Half Day:</strong> '+totalHalfDay+' &nbsp; <strong>Leave:</strong> '+totalLeave+' &nbsp; <strong>Absent:</strong> '+totalAbsent+' &nbsp; <strong>Sunday:</strong> '+totalSunday+' &nbsp; <strong>Holiday:</strong> '+totalHoliday+' &nbsp; <strong>UT:</strong> '+fmtMin(totalUT)+' &nbsp; <strong>SL:</strong> '+fmtMin(totalSL)+' &nbsp; <strong>OT:</strong> '+fmtMin(totalOT)+'</td></tr>';
  $('personSummary').textContent=esc(selected.name)+' | '+esc(selected.category);
  $('personRegisterTable').innerHTML=html;
  normalizeTimeFields();
  document.querySelectorAll('#personRegisterTable .personIn,#personRegisterTable .personOut,.personAttendance,.adjustEdit').forEach(el=>{
    el.addEventListener('input',()=>{
      const row=el.closest('tr[data-person-row]');
      if(el.classList.contains('adjustEdit')){setSaveStatus('unsaved');return}
      capturePersonRowDraft(row);setSaveStatus('unsaved');refreshPersonLiveTotals();
    });
    el.addEventListener('change',()=>{
      const row=el.closest('tr[data-person-row]');capturePersonRowDraft(row);setSaveStatus('unsaved');refreshPersonLiveTotals();
    });
    if(el.classList.contains('adjustEdit')){
      const markOverrideDirty=()=>{
        const row=el.closest('tr[data-person-row]');
        if(row){
          if(el.classList.contains('personUT'))row.dataset.utOverrideDirty='1';
          if(el.classList.contains('personSL'))row.dataset.slOverrideDirty='1';
          if(el.classList.contains('personOT'))row.dataset.otOverrideDirty='1';
        }
      };
      el.addEventListener('input',markOverrideDirty);
      el.addEventListener('change',markOverrideDirty);
      el.addEventListener('blur',()=>{
        markOverrideDirty();
        const v=String(el.value||'').trim();
        if(v&&parseAdjustmentMinutes(v)!=null)el.value=fmtMin(parseAdjustmentMinutes(v));
        capturePersonRowDraft(el.closest('tr[data-person-row]'));setSaveStatus('unsaved');refreshPersonLiveTotals();
      });
    }
  });
}

function refreshPersonLiveTotals(){
  const emp=personEmployees[personEmployeeIndex];if(!emp)return;
  let ut=0,sl=0,ot=0;
  document.querySelectorAll('#personRegisterTable tr[data-person-row]').forEach(row=>{
    const date=row.dataset.date,inTime=normalizeTime(row.querySelector('.personIn')?.value||''),outTime=normalizeTime(row.querySelector('.personOut')?.value||''),bg=window.__personSecondShift?.get(emp.id+'|'+date)||{};
    const live=calcLiveMinutes(emp,inTime,emp.split_shift?bg.out_time:outTime,emp.split_shift?bg.in_time_2:'',emp.split_shift?outTime:'',date,window.__personHolidaySet?.has(date)||false);
    const adj=dailyTimeAdjustments(emp,inTime,date,window.__personHolidaySet?.has(date)||false),d=recordDrafts.get(date+'|'+emp.id);
    const u=parseAdjustmentMinutes(row.querySelector('.personUT')?.value),s=parseAdjustmentMinutes(row.querySelector('.personSL')?.value),o=parseAdjustmentMinutes(row.querySelector('.personOT')?.value);
    const ru=row.dataset.utOverrideDirty==='1'&&u!=null?u:(d?.ut_override!=null?d.ut_override:adj.ut);
    const rs=row.dataset.slOverrideDirty==='1'&&s!=null?s:(d?.sl_override!=null?d.sl_override:adj.sl);
    const ro=row.dataset.otOverrideDirty==='1'&&o!=null?o:(d?.ot_override!=null?d.ot_override:(live?.ot??0));
    const ui=row.querySelector('.personUT'),si=row.querySelector('.personSL'),oi=row.querySelector('.personOT');
    if(document.activeElement!==ui)ui.value=fmtMin(ru);
    if(document.activeElement!==si)si.value=fmtMin(rs);
    if(document.activeElement!==oi)oi.value=fmtMin(ro);
    ut+=ru;sl+=rs;ot+=ro;
  });
  $('personSummary').textContent=esc(emp.name)+' | '+esc(emp.category)+' | Total UT '+fmtMin(ut)+' | Total SL '+fmtMin(sl)+' | Total OT '+fmtMin(ot);
}

function setupPersonRegister(){
  $('personMonth').value=monthNow();
  $('attendanceMonth').value=monthNow();
  $('personPrev').onclick=()=>personMoveEmployee(-1);
  $('personNext').onclick=()=>personMoveEmployee(1);
  $('personMonth').onchange=()=>{captureCurrentPersonDraft();loadPersonRegister()};
  $('personTabs').onclick=e=>{
    const b=e.target.closest('.personTab');if(!b)return;
    captureCurrentPersonDraft();
    personEmployeeIndex=Number(b.dataset.index)||0;
    loadPersonRegister();
  };
  $('printPersonRegister').onclick=()=>{document.body.dataset.printTab='personRegister';window.print();setTimeout(()=>delete document.body.dataset.printTab,500)};
  $('exportPersonRegister').onclick=exportPersonRegister;
  $('personModeBtn').onclick=()=>{
    captureCurrentPersonDraft();
    $('personRegisterPane').classList.remove('hidden');
    $('monthlySummaryPane').classList.add('hidden');
    $('personModeBtn').classList.add('activeMode');
    $('monthlyModeBtn').classList.remove('activeMode');
    loadPersonRegister();
  };
  $('monthlyModeBtn').onclick=()=>{
    captureCurrentPersonDraft();
    $('personRegisterPane').classList.add('hidden');
    $('monthlySummaryPane').classList.remove('hidden');
    $('monthlyModeBtn').classList.add('activeMode');
    $('personModeBtn').classList.remove('activeMode');
    generateAttendanceReport();
  };
}
function personMoveEmployee(delta){
  captureCurrentPersonDraft();
  personEmployeeIndex=Math.max(0,Math.min(personEmployees.length-1,personEmployeeIndex+delta));
  loadPersonRegister();
}

function exportPersonRegister(){
  const emp=personEmployees[personEmployeeIndex];if(!emp)return;
  const month=$('personMonth').value||monthNow();
  const rows=[['Date','In Time','UT','Out Time','SL','OT','Attendance']];
  document.querySelectorAll('#personRegisterTable tr[data-person-row]').forEach(row=>{
    rows.push([fmtDate(row.dataset.date),row.querySelector('.personIn')?.value||'',row.querySelector('.personUT')?.textContent||'',row.querySelector('.personOut')?.value||'',row.querySelector('.personSL')?.textContent||'',row.querySelector('.personOT')?.textContent||'',row.querySelector('.personAttendance')?.value||'']);
  });
  if(window.XLSX){
    const ws=XLSX.utils.aoa_to_sheet(rows),wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,(emp.name||'Employee').slice(0,31));
    XLSX.writeFile(wb,(emp.name||'Employee')+'_'+month+'.xlsx');
  }else{
    const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');
    const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);a.download=(emp.name||'Employee')+'_'+month+'.csv';a.click();
  }
}

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
          if(!error){
            await localDelete(row.client_id);
            return true;
          }
          if(error.code==='23505' && /client_id/i.test(error.message||'')){
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
  const {data,error}=await db.from('employees').select('id,employee_code,name,category,active,normal_work_minutes,break_minutes,round_minutes,split_shift').eq('active',true).order('name');
  if(error){loadCache();renderGateEmployees();return}
  employees=data||[];saveCache();renderGateEmployees();
}
function updateGateSplitFields(){
  const emp=employees.find(e=>e.id===$('employee')?.value);
  const split=!!emp?.split_shift;
  $('gateSplitFields')?.classList.toggle('hidden',!split);
  if($('inTimeLabel'))$('inTimeLabel').textContent=split?'First IN':'IN';
  if($('outTimeLabel'))$('outTimeLabel').textContent=split?'First OUT':'OUT';
}
function renderGateEmployees(){
  $('employee').innerHTML=employees.length?employees.map(e=>'<option value="'+e.id+'">'+esc(e.name)+' ('+esc(e.category)+')</option>').join(''):'<option value="">No employees added yet</option>';
  updateGateSplitFields();
}
async function loadRules(){
  const {data,error}=await db.from('category_rules').select('*').order('category');
  if(error){loadCache();return}
  rules=data||[];saveCache();
}
function effectiveRule(emp){
  const cat=rules.find(r=>r.category===emp?.category)||{};
  const split=!!emp?.split_shift;
  return {
    break_minutes: split ? Number(emp.break_minutes??0) : (emp.category==='Gateman' ? Number(emp.break_minutes??cat.break_minutes??0) : Number(cat.break_minutes??0)),
    normal_work_minutes: split ? Number(emp.normal_work_minutes??cat.normal_work_minutes??525) : (emp.category==='Gateman' ? Number(emp.normal_work_minutes??cat.normal_work_minutes??525) : Number(cat.normal_work_minutes??525)),
    round_minutes: split ? Number(emp.round_minutes??cat.round_minutes??0) : Number(cat.round_minutes??0),
    ot_eligible: !!cat.ot_eligible,
    ot_threshold_minutes: Number(cat.ot_threshold_minutes??15)
  };
}

async function saveGate(){
  const work_date=$('workDate').value,employee_id=$('employee').value;
  const in_time=normalizeTime($('inTime').value),out_time=normalizeTime($('outTime').value);
  const in_time_2=normalizeTime($('inTime2')?.value),out_time_2=normalizeTime($('outTime2')?.value);
  const emp=employees.find(e=>e.id===employee_id);
  const split=!!emp?.split_shift;
  if(!work_date||!employee_id||!in_time||!out_time){$('message').textContent='Please enter date, employee, IN and OUT.';return}
  if(!split&&timeMinutes(out_time)<timeMinutes(in_time)){$('message').textContent='OUT time cannot be earlier than IN time.';return}
  if(split&&((in_time_2&&!out_time_2)||(!in_time_2&&out_time_2))){$('message').textContent='Please enter both IN 2 and OUT 2.';return}
  if(!split&&(in_time_2||out_time_2)){$('message').textContent='Second-shift times are only for split-shift employees.';return}
  const er=effectiveRule(emp);
  const row={client_id:crypto.randomUUID(),work_date,employee_id,in_time:in_time+':00',out_time:out_time+':00',in_time_2:split?(in_time_2?in_time_2+':00':null):null,out_time_2:split?(out_time_2?out_time_2+':00':null):null,break_minutes:er.break_minutes,normal_work_minutes:er.normal_work_minutes,ot_eligible:er.ot_eligible,ot_threshold_minutes:er.ot_threshold_minutes,round_minutes:er.round_minutes};
  $('saveBtn').disabled=true;$('message').textContent='Saving...';
  const {error}=await db.from('daily_records').insert(row);
  if(!error){
    $('message').textContent='Saved successfully';$('inTime').value='09:00';$('outTime').value='';if($('inTime2'))$('inTime2').value='';if($('outTime2'))$('outTime2').value='';await updatePending();$('saveBtn').disabled=false;return;
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
async function loadAdmin(){await Promise.all([loadEmployeesAdmin(),loadRulesAdmin(),loadHolidays(),loadPersonRegister()])}

function timeMinutes(v){
  const t=normalizeTime(v);if(!t)return null;
  const [h,m]=t.split(':').map(Number);return h*60+m;
}
function calcLiveMinutes(emp,ni,no,ni2,no2,date,isHoliday){
  const a=timeMinutes(ni),b=timeMinutes(no);
  if(a===null||b===null)return {worked:null,ot:null};
  if(!emp.split_shift&&b<a&&!(emp.category==='Driver'||emp.category==='Gateman'))return {worked:null,ot:null};
  let total;
  if(emp.split_shift){
    const firstOut=timeMinutes(no2?'01:00':(no2||'01:00'));
    const secondIn=timeMinutes(ni2||'06:00');
    const secondOut=timeMinutes(no2||no);
    if(firstOut===null||secondIn===null||secondOut===null)return {worked:null,ot:null};
    const first=a<=firstOut?firstOut-a:firstOut+1440-a;
    const second=secondOut>=secondIn?secondOut-secondIn:secondOut+1440-secondIn;
    total=first+second;
  }else{
    total=b-a+(b<a?1440:0);
  }
  const er=effectiveRule(emp);
  const special=(emp.category==='Driver'||emp.category==='Gateman')&&(new Date(date+'T00:00:00').getDay()===0||isHoliday);
  const rounded=er.round_minutes>0?Math.floor(total/er.round_minutes)*er.round_minutes:(special?Math.floor(total/30)*30:total);
  const worked=Math.max(0,rounded-(special?0:er.break_minutes));
  let ot=0;
  if(er.ot_eligible){
    if(special)ot=rounded;
    else if(emp.split_shift){
      const extra=rounded-er.normal_work_minutes;
      ot=extra>er.ot_threshold_minutes?extra:0;
    }else{
      const outForOT=(b<a?b+1440:b);
      const extra=Math.max(0,outForOT-(17*60+45));
      ot=extra>er.ot_threshold_minutes?extra:0;
    }
  }
  return {worked,ot};
}
function setSaveStatus(state){
  const el=$('saveStatus');if(!el)return;
  el.className='saveStatus '+state;
  el.textContent=state==='unsaved'?'Unsaved changes':state==='saving'?'Saving...':'All changes saved';
}
function downloadCSV(name,rows){
  const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();URL.revokeObjectURL(a.href);
}
async function getMonthlyAttendanceData(){
  const month=$('attendanceMonth').value||monthNow();
  const {start,end}=monthRange(month);
  const [{data:emps,error:empError},{data:records,error:recError},{data:att,error:attError},{data:hols,error:holError}]=await Promise.all([
    db.from('employees').select('id,name,category').eq('active',true).order('name'),
    db.from('daily_records').select('work_date,employee_id,in_time,out_time,in_time_2,out_time_2').gte('work_date',start).lt('work_date',end),
    db.from('attendance').select('work_date,employee_id,status').gte('work_date',start).lt('work_date',end),
    db.from('holidays').select('holiday_date,name').gte('holiday_date',start).lt('holiday_date',end)
  ]);
  const err=empError||recError||attError||holError;
  if(err)throw new Error(err.message);

  const dates=[...(records||[]).map(r=>r.work_date),...(att||[]).map(r=>r.work_date)].filter(Boolean).sort();
  const currentMonth=monthNow();
  const isCompletedMonth=month<currentMonth;
  const cutoff=isCompletedMonth
    ?new Date(new Date(end+'T00:00:00').getTime()-86400000).toISOString().slice(0,10)
    :(dates.length?dates[dates.length-1]:null);
  const days=[];
  if(cutoff){
    const d=new Date(start+'T00:00:00'),last=new Date(cutoff+'T00:00:00');
    while(d<=last){days.push(d.toISOString().slice(0,10));d.setDate(d.getDate()+1)}
  }

  const recordMap=new Map((records||[]).map(r=>[r.work_date+'|'+r.employee_id,r]));
  const attMap=new Map((att||[]).map(r=>[r.work_date+'|'+r.employee_id,r.status]));
  const holidayMap=new Map((hols||[]).map(h=>[h.holiday_date,h.name]));

  const rows=(emps||[]).map((e,i)=>{
    const c={present:0,halfDay:0,leave:0,absent:0,sunday:0,holiday:0};
    for(const date of days){
      const rec=recordMap.get(date+'|'+e.id);
      const hasRecord=!!rec;
      const explicit=attMap.get(date+'|'+e.id);
      const dow=new Date(date+'T00:00:00').getDay();
      let status;
      if(holidayMap.has(date))status='Holiday';
      else if(dow===0)status='Sunday';
      else if(explicit)status=explicit;
      else if(hasRecord)status=attendanceStatusForRecord(e,rec,date,'',false)||'Present';
      else status='Absent';
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
  data.rows.forEach(r=>{
    out+='<tr><td>'+r.no+'.</td><td>'+esc(r.employee.name)+'</td><td>'+esc(r.employee.category)+'</td><td>'+r.present+'</td><td>'+r.halfDay+'</td><td>'+r.leave+'</td><td>'+r.absent+'</td><td class="sundayCell">'+r.sunday+'</td><td class="holidayCell">'+r.holiday+'</td></tr>';
  });
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
  if(!record)return 0;
  if(new Date(record.work_date+'T00:00:00').getDay()===0||holidaySet.has(record.work_date))return 0;
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
function normalStartMinutesForEmployee(emp){
  if(emp?.name==='Gautam')return 7*60+30;
  if(emp?.split_shift)return 18*60;
  const rule=rules.find(r=>r.category===emp?.category);
  if(rule?.normal_start){
    const m=String(rule.normal_start).match(/^(\d{2}):(\d{2})/);
    if(m)return Number(m[1])*60+Number(m[2]);
  }
  if(emp?.category==='Gardener')return 8*60+30;
  return 9*60;
}
function slMinutesForRecord(record,emp,holidaySet){
  if(!record||!emp)return 0;
  if(new Date(record.work_date+'T00:00:00').getDay()===0||holidaySet.has(record.work_date))return 0;
  const inMin=minutesFromHHMM(record.in_time);
  const start=normalStartMinutesForEmployee(emp);
  return inMin!=null&&inMin>start?inMin-start:0;
}
function signedMinutesText(mins){
  const n=Number(mins)||0;
  if(n===0)return '0h 00m';
  const sign=n<0?'-':'';
  const a=Math.abs(n);
  return sign+Math.floor(a/60)+'h '+String(a%60).padStart(2,'0')+'m';
}
function dailyTimeAdjustments(emp,inTime,date,isHoliday){
  if(!emp||!inTime||isHoliday||new Date(date+'T00:00:00').getDay()===0)return {ut:0,sl:0};
  const inMin=minutesFromHHMM(inTime);
  if(inMin==null)return {ut:0,sl:0};
  const normalStart=normalStartMinutesForEmployee(emp);
  const sl=inMin>normalStart?inMin-normalStart:0;
  const ut=emp.name==='Gautam'&&inMin>=7*60+30&&inMin<9*60?9*60-inMin:emp.category==='Gateman'&&inMin<(8*60+40)?Math.floor((9*60-inMin)/30)*30:emp.category==='Driver'&&inMin<(8*60+40)?9*60-inMin:0;
  return {ut,sl};
}
function dailyAdjustments(emp,record,date,isHoliday){
  const holidayOrSunday=isHoliday||new Date(date+'T00:00:00').getDay()===0;
  if(!record||holidayOrSunday)return {ut:0,sl:0};
  const ut=emp?.name==='Gautam'?0:utMinutesForRecord(record,new Set());
  const sl=slMinutesForRecord(record,emp,new Set());
  return {ut,sl};
}
async function getOTReportBase(){
  const month=$('reportMonth').value||monthNow();
  const {start,end}=monthRange(month);
  const [{data:emps,error:empError},{data:records,error:recError},{data:hols,error:holError},{data:atts,error:attError}]=await Promise.all([
    db.from('employees').select('id,name,category,normal_work_minutes,break_minutes,round_minutes,split_shift').eq('active',true).in('category',['Driver','Gateman']).order('name'),
    db.from('daily_records').select('work_date,employee_id,in_time,out_time,in_time_2,out_time_2,ot_minutes,ut_minutes,sl_minutes,ut_override_minutes,sl_override_minutes,ot_override_minutes').gte('work_date',start).lt('work_date',end),
    db.from('holidays').select('holiday_date').gte('holiday_date',start).lt('holiday_date',end),
    db.from('attendance').select('work_date,employee_id,status').gte('work_date',start).lt('work_date',end)
  ]);
  const err=empError||recError||holError||attError;
  if(err)throw new Error(err.message);
  const holidaySet=new Set((hols||[]).map(h=>h.holiday_date));
  const byKey=new Map((records||[]).map(r=>[r.work_date+'|'+r.employee_id,r]));
  const attendanceByKey=new Map((atts||[]).map(a=>[a.work_date+'|'+a.employee_id,a.status]));
  const totals=new Map();
  for(const e of emps||[]){
    let ot=0,ut=0,sl=0;
    for(const r of records||[]){
      if(r.employee_id!==e.id)continue;
      const calc=dailyTimeAdjustments(e,r.in_time?.slice(0,5)||'',r.work_date,holidaySet.has(r.work_date));
      ot+=effectiveAdjustment(r,'ot_override_minutes',Number(r.ot_minutes)||0);
      ut+=effectiveAdjustment(r,'ut_override_minutes',calc.ut);
      sl+=effectiveAdjustment(r,'sl_override_minutes',calc.sl);
    }
    totals.set(e.id,{ot,ut,sl,net:ut+ot-sl});
  }
  return {month,emps:emps||[],records:records||[],holidaySet,byKey,attendanceByKey,totals};
}
async function loadReportOptions(){
  try{
    const base=await getOTReportBase();
    $('reportMonth').value=base.month;
    $('reportPeople').innerHTML=base.emps.map(e=>{
      const t=base.totals.get(e.id)||{ot:0,ut:0,sl:0,net:0};
      const any=t.ot+t.ut+t.sl>0;
      return '<label class="reportPerson"><input type="checkbox" class="reportEmployeeCheck" value="'+e.id+'" '+(any?'checked':'')+'><span>'+esc(e.name)+' ('+esc(e.category)+')</span><small>OT '+fmtHHMM(t.ot)+' / UT '+fmtHHMM(t.ut)+' / SL '+fmtHHMM(t.sl)+'</small></label>';
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
    let otTotal=0,utTotal=0,slTotal=0;
    for(let day=1;day<=daysInMonth;day++){
      const date=base.month+'-'+String(day).padStart(2,'0');
      const r=base.byKey.get(date+'|'+e.id);
      const calc=r?dailyTimeAdjustments(e,r.in_time?.slice(0,5)||'',date,base.holidaySet.has(date)):{ut:0,sl:0};
      const ot=r?effectiveAdjustment(r,'ot_override_minutes',Number(r.ot_minutes)||0):0;
      const ut=r?effectiveAdjustment(r,'ut_override_minutes',calc.ut):0;
      const sl=r?effectiveAdjustment(r,'sl_override_minutes',calc.sl):0;
      otTotal+=ot;utTotal+=ut;slTotal+=sl;
      days.push({date,in1:r?.in_time||'',out1:r?.out_time||'',in2:r?.in_time_2||'',out2:r?.out_time_2||'',ot,ut,sl,attendance:base.attendanceByKey.get(date+'|'+e.id)||''});
    }
    return {no:i+1,employee:e,days,otTotal,utTotal,slTotal,total:otTotal+utTotal-slTotal};
  }).filter(r=>!$('otOnly').checked||(r.otTotal+r.utTotal+r.slTotal)>0);
  return {month:base.month,rows};
}
function otReportHtml(data){
  let out='';
  let grandOT=0,grandUT=0,grandSL=0;
  data.rows.forEach(r=>{
    grandOT+=r.otTotal;grandUT+=r.utTotal;grandSL+=r.slTotal;
    out+='<div class="otPersonReport">';
    out+='<table class="otPersonTable"><tr><th colspan="7" class="employeeHeading">'+esc(r.employee.name)+'</th></tr>';
    out+='<tr><th>Date</th><th>In Time</th><th>UT</th><th>Out Time</th><th>SL</th><th>OT</th><th>Attendance</th></tr>';
    r.days.forEach(d=>{
      const cls=d.attendance==='Sunday'?'sundayRow':(d.attendance==='Holiday'?'holidayRow':(['Leave','Half Day','First Half Leave','Second Half Leave','Full Day Leave'].includes(d.attendance)?'leaveRow':''));
      out+='<tr class="'+cls+'"><td>'+fmtDate(d.date)+'</td><td>'+esc(d.in1)+'</td><td>'+fmtHHMM(d.ut)+'</td><td>'+esc(d.out2||d.out1)+'</td><td>'+fmtHHMM(d.sl)+'</td><td>'+fmtHHMM(d.ot)+'</td><td>'+esc(d.attendance)+'</td></tr>';
    });
    out+='<tr class="reportSubtotal"><td>Sub total</td><td></td><td>'+fmtHHMM(r.utTotal)+'</td><td></td><td>'+fmtHHMM(r.slTotal)+'</td><td>'+fmtHHMM(r.otTotal)+'</td><td></td></tr>';
    out+='</table></div>';
  });
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
    $('reportTitle').textContent='OVERTIME, UNDER TIME AND SHORT LEAVE REPORT';
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
        ['OVERTIME, UNDER TIME AND SHORT LEAVE REPORT'],
        ['Employee',r.employee.name],
        ['Category',r.employee.category],
        ['Period','01/'+data.month.slice(5,7)+'/'+data.month.slice(0,4)+' to '+new Date(new Date(data.month+'-01T00:00:00').getFullYear(),new Date(data.month+'-01T00:00:00').getMonth()+1,0).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'})],
        [],
        ['Date','In Time','UT','Out Time','SL','OT','Attendance']
      ];
      r.days.forEach(d=>aoa.push([fmtDate(d.date),d.in1,fmtHHMM(d.ut),d.out2||d.out1,fmtHHMM(d.sl),fmtHHMM(d.ot),d.attendance]));
      aoa.push(['Sub total','',fmtHHMM(r.utTotal),'',fmtHHMM(r.slTotal),fmtHHMM(r.otTotal),'']);
      const ws=XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols']=[{wch:14},{wch:12},{wch:10},{wch:12},{wch:10},{wch:10},{wch:16}];
      XLSX.utils.book_append_sheet(wb,ws,safeSheetName(r.employee.name,used));
    }
    if(!wb.SheetNames.length)throw new Error('No employees selected.');
    XLSX.writeFile(wb,'FCS-OT-UT-Report-'+data.month+'.xlsx');
  }catch(e){alert(e.message||'Unable to export report.')}
}
async function saveAllChanges(){
  captureCurrentPersonDraft();
  const dirty=[...recordDrafts.entries()].filter(([,d])=>d.dirty);
  const btn=$('saveAllBtn');btn.disabled=true;btn.textContent='Saving...';setSaveStatus('saving');
  try{
    await saveRules();
    await loadRules();
    const {data:emps,error:empError}=await db.from('employees').select('id,name,category,normal_work_minutes,break_minutes,round_minutes,split_shift').eq('active',true).order('name');
    if(empError)throw new Error(empError.message);
    const groups=new Map();
    for(const [key,d] of dirty){if(!groups.has(d.date))groups.set(d.date,[]);groups.get(d.date).push([key,d]);}
    for(const [date,items] of groups){
      const {data:existing,error:existingError}=await db.from('daily_records').select('id,employee_id,in_time,out_time,in_time_2,out_time_2,ut_override_minutes,sl_override_minutes,ot_override_minutes').eq('work_date',date);
      if(existingError)throw new Error(existingError.message);
      const idMap=new Map((existing||[]).map(r=>[r.employee_id,r]));
      for(const [key,d] of items){
        const emp=(emps||[]).find(e=>e.id===d.employee_id);if(!emp)continue;
        const split=!!emp.split_shift;
        const ni=normalizeTime(d.in_time||'');
        const no=normalizeTime(d.out_time||'');
        const old=idMap.get(emp.id);
        const legacy=split?legacySplitFor(emp,old):null;
        const ni2=split?normalizeTime(d.in_time_2||legacy?.in_time_2||''):'';
        const no2=split?no:'';
        const firstOut=split?normalizeTime(d.first_out||legacy?.first_out||old?.out_time||'01:00'):'';
        if((ni||no||ni2||no2)&&(!ni||!no))throw new Error('Please enter both IN and OUT for '+emp.name+' on '+fmtDate(date)+'.');
        if(!split&&ni&&no&&timeMinutes(no)<timeMinutes(ni)&&!['Driver','Gateman'].includes(emp.category))throw new Error('OUT time cannot be earlier than IN time for '+emp.name+' on '+fmtDate(date)+'.');
        if(split&&(!firstOut||(!ni2&&!no2)||(!ni2&&no2)))throw new Error('Unable to determine split-shift times for '+emp.name+' on '+fmtDate(date)+'.');
        const er=effectiveRule(emp);
        if(ni&&no){
          const payload={
            in_time:ni+':00',
            out_time:split?(firstOut.slice(0,5)+':00'):no+':00',
            in_time_2:split?(ni2?ni2+':00':null):null,
            out_time_2:split?(no2?no2+':00':null):null,
            break_minutes:er.break_minutes,
            normal_work_minutes:er.normal_work_minutes,
            ot_eligible:er.ot_eligible,
            ot_threshold_minutes:er.ot_threshold_minutes,
            round_minutes:er.round_minutes,
            ut_override_minutes:d.ut_override==null?null:d.ut_override,
            sl_override_minutes:d.sl_override==null?null:d.sl_override,
            ot_override_minutes:d.ot_override==null?null:d.ot_override
          };
          const result=old
            ?await db.from('daily_records').update(payload).eq('id',old.id)
            :await db.from('daily_records').insert({client_id:crypto.randomUUID(),work_date:date,employee_id:emp.id,...payload});
          if(result.error)throw new Error(result.error.message);
        }else if(old){
          const result=await db.from('daily_records').delete().eq('id',old.id);
          if(result.error)throw new Error(result.error.message);
        }
        if(d.status){
          const result=await db.from('attendance').upsert({work_date:date,employee_id:emp.id,status:d.status},{onConflict:'work_date,employee_id'});
          if(result.error)throw new Error(result.error.message);
        }else{
          const result=await db.from('attendance').delete().eq('work_date',date).eq('employee_id',emp.id);
          if(result.error)throw new Error(result.error.message);
        }
        recordDrafts.delete(key);
      }
    }
    await Promise.all([loadPersonRegister(),loadReportOptions()]);
    btn.textContent='Saved';setSaveStatus('saved');setTimeout(()=>btn.textContent='Save Changes',900);
  }catch(e){
    alert(e.message||'Unable to save changes.');
    btn.textContent='Save Changes';
    setSaveStatus('unsaved');
  }finally{btn.disabled=false;}
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
    if(error){$('rulesMessage').textContent=error.message;throw new Error(error.message)}
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

$('workDate').value=today();setupTimeInput('inTime','09:00');setupTimeInput('outTime','');setupTimeInput('inTime2','');setupTimeInput('outTime2','');
$('employee').onchange=()=>{updateGateSplitFields();$('inTime').value='09:00';$('outTime').value='';if($('inTime2'))$('inTime2').value='';if($('outTime2'))$('outTime2').value=''};
$('saveBtn').onclick=saveGate;$('adminBtn').onclick=()=>show('loginView');$('backBtn').onclick=()=>show('gateView');$('loginBtn').onclick=login;$('signupBtn').onclick=signup;
$('logoutBtn').onclick=async()=>{await db.auth.signOut();show('gateView')};
$('readmeBtn').onclick=()=>{$('readmePanel').classList.toggle('hidden')};$('closeReadmeBtn').onclick=()=>{$('readmePanel').classList.add('hidden')};
$('addEmployee').onclick=addEmployee;$('addHoliday').onclick=addHoliday;$('saveAllBtn').onclick=saveAllChanges;$('generateAttendanceReport').onclick=generateAttendanceReport;$('printAttendanceReport').onclick=()=>printReportTab('attendanceReport');$('exportAttendanceReport').onclick=exportAttendanceReport;setupTabs();setupPersonRegister();

(async()=>{
  loadCache();await loadRules();await loadEmployees();await updatePending();await syncQueue();await checkSession();
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();