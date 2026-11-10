'use strict';
// Read only the actual send-target dialog observed 2026-11-09. Empty roster
// slots do not establish this fact; an unfiltered empty recipient table does.
function recipientDialogs(document){
 const all=Array.from(document.querySelectorAll('mat-dialog-container')).filter(d=>d.querySelector('app-select-letter-targets'));
 const visible=[],view=document.defaultView;let hiddenCount=0,unknownCount=0;
 for(const dialog of all){
  try{
   // Ignore only provably non-rendered remnants. Do not treat a covered second
   // dialog as hidden: two rendered dialogs remain ambiguous and must fail.
   const content=dialog.querySelector('app-select-letter-targets');let hidden=false;
   for(let e=content;e;e=e.parentElement){
    const style=view.getComputedStyle(e);
    if(e.hidden||e.inert||e.getAttribute('aria-hidden')==='true'||style.display==='none'||
       ['hidden','collapse'].includes(style.visibility)||Number(style.opacity)===0){hidden=true;break;}
   }
   const rect=dialog.getBoundingClientRect();
   if(hidden||!dialog.getClientRects().length||rect.width<=0||rect.height<=0){hiddenCount++;continue;}
   if(![rect.left,rect.top,rect.width,rect.height].every(Number.isFinite)){unknownCount++;continue;}
   visible.push(dialog);
  }catch{unknownCount++;}
 }
 let covered=false;
 if(visible.length===1){const d=visible[0],r=d.getBoundingClientRect();
  const x=Math.max(0,Math.min(view.innerWidth-1,r.left+r.width/2)),y=Math.max(0,Math.min(view.innerHeight-1,r.top+r.height/2));
  const hit=document.elementFromPoint(x,y);covered=!(hit===d||d.contains(hit));
 }
 return {dialogs:visible,counts:{totalCount:all.length,dialogCount:visible.length,hiddenCount,unknownCount,covered}};
}
function probeRecipients(document,_action,findDialogs=recipientDialogs){
 const {dialogs,counts}=findDialogs(document);
 if(counts.unknownCount||dialogs.length!==1)return {known:false,reason:'dialog-count',...counts};
 if(counts.covered)return {known:false,reason:'dialog-covered',...counts};
 const root=dialogs[0],tables=root.querySelectorAll('app-select-letter-targets table');
 const searches=root.querySelectorAll('app-table-search input[placeholder="학생명 또는 전화번호"]');
 if(tables.length!==1||searches.length!==1||searches[0].value!==''||root.querySelectorAll('select').length)return {known:false,reason:'table-or-filter'};
 const headers=Array.from(tables[0].querySelectorAll('thead th')).map(e=>e.textContent.trim());
 if(JSON.stringify(headers)!==JSON.stringify(['번호','이름','보호자 휴대폰1','보호자 휴대폰2','학생 휴대폰']))return {known:false,reason:'headers'};
 const checks=Array.from(root.querySelectorAll('input[type="checkbox"]'));
 const roles={};for(const c of checks){const label=c.closest('label')?.textContent.replace(/\s/g,'');
  const key=({'관리자':'administrator','보호자1':'guardian1','보호자2':'guardian2','학생':'student'})[label];
  if(!key||roles[key])return {known:false,reason:'roles',checkboxCount:checks.length};roles[key]={checked:c.checked,disabled:c.disabled};}
 if(checks.length!==4)return {known:false,reason:'role-count',checkboxCount:checks.length};
 const rows=tables[0].querySelectorAll('tbody tr'),cells=rows.length===1?rows[0].querySelectorAll('td'):[];
 if(!rows.length)return {known:false,reason:'rows-loading'};
 const empty=cells.length===1&&cells[0].getAttribute('colspan')==='5'&&cells[0].textContent.trim()==='구성원이 없습니다.';
 // A nonempty table has never been independently proven to show every member.
 // Report only the number of rendered rows; do NOT promote it to recipient count,
 // selection, authority, or permission evidence. No names/contact values leave.
 return {known:true,...counts,unfiltered:true,empty,visibleRows:empty?0:rows.length,
  students:empty?0:null,parents:empty?0:null,roles,
  mandatoryAdministrator:roles.administrator.checked&&roles.administrator.disabled};
}
function recipientControl(document,action,findDialogs=recipientDialogs){
 const roots=document.querySelectorAll('app-boards-write');if(roots.length!==1)return {composer:false};
 const labels=roots[0].querySelectorAll('app-letter-simplified-target-text');if(labels.length!==1)return {composer:false};
 const before=labels[0].textContent;
 const {dialogs,counts}=findDialogs(document);
 if(counts.unknownCount||dialogs.length>1)return {composer:true,ready:false,dialogOpen:dialogs.length>0,reason:'dialog-count',...counts};
 if(counts.covered)return {composer:true,ready:false,dialogOpen:true,reason:'dialog-covered',...counts};
 if(!before.trim())return {composer:true,ready:false,dialogOpen:dialogs.length>0};
 // The live ng-busy backdrop can still cover the newly created composer.
 // A successful .click() return did not mean that the target dialog opened.
 // Wait for the observed control to be hit-testable BEFORE the single click;
 // never click again after a missing dialog or replace unknown evidence.
 if(!dialogs.length&&action!=='close'){
  const buttons=roots[0].querySelectorAll('button:has(+ app-letter-simplified-target-text)'),button=buttons[0];
  if(buttons.length!==1||button.textContent.trim()!=='변경'||button.disabled||button.matches(':disabled'))
   return {composer:true,ready:false,dialogOpen:false,reason:'control-unavailable'};
  button.scrollIntoView({block:'center',inline:'nearest'});
  const r=button.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
  if(!r.width||!r.height||!(hit===button||button.contains(hit)))
   return {composer:true,ready:false,dialogOpen:false,reason:'control-occluded'};
 }
 if(action==='open'&&!dialogs.length){
  const buttons=roots[0].querySelectorAll('button:has(+ app-letter-simplified-target-text)');
  if(buttons.length!==1||buttons[0].textContent.trim()!=='변경'||buttons[0].disabled)throw Error('context-unverified');
  buttons[0].click();return {composer:true,ready:true,opened:true,label:before,...counts};
 }
 if(action==='close'&&dialogs.length===1){
  const close=Array.from(dialogs[0].querySelectorAll('button')).filter(b=>b.textContent.trim()==='닫기');
  if(close.length!==1||close[0].disabled)throw Error('context-unverified');close[0].click();
 }
 return {composer:true,ready:true,opened:false,dialogOpen:dialogs.length>0,label:before,...counts};
}
function safeCounts(value){return Object.fromEntries(['totalCount','dialogCount','hiddenCount','unknownCount','covered'].filter(k=>typeof value?.[k]==='boolean'||Number.isSafeInteger(value?.[k])).map(k=>[k,value[k]]));}
// A UI observation is not a membership/authority certificate. Only known role
// toggles and aggregate rendered state may cross IPC or enter diagnostic logs.
function safeRecipientObservation(value){
 const result={known:value?.known===true,...safeCounts(value),recipientsVerified:false};
 if(!result.known){
  const reasons=['dialog-count','dialog-covered','table-or-filter','headers','roles','role-count','rows-loading','control-unavailable','control-occluded','composer-loading','not-ready'];
  if(reasons.includes(value?.reason))result.reason=value.reason;
  return result;
 }
 result.empty=typeof value.empty==='boolean'?value.empty:null;
 result.observedSearchClear=value.unfiltered===true;
 result.visibleRows=Number.isSafeInteger(value.visibleRows)&&value.visibleRows>=0?value.visibleRows:null;
 result.totalStudents=null;result.totalParents=null;
 result.roles={};
 for(const key of ['administrator','guardian1','guardian2','student']){
  const role=value.roles?.[key];
  if(typeof role?.checked==='boolean'&&typeof role.disabled==='boolean')result.roles[key]={checked:role.checked,disabled:role.disabled};
 }
 result.roleSelectionKnown=Object.keys(result.roles).length===4;
 result.mandatoryAdministrator=result.roles.administrator?
  result.roles.administrator.checked&&result.roles.administrator.disabled:null;
 return result;
}
async function inspectRecipients(webContents,signal,{timeoutMs=5000,diagnostic=()=>{}}={}){
 let lastDiagnostic;
 const report=(stage,r)=>{const v={step:'recipient-dialog',stage,...safeCounts(r),...(r?.reason?{reason:r.reason}:{}),...(typeof r?.ready==='boolean'?{ready:r.ready}:{}),...(typeof r?.known==='boolean'?{known:r.known}:{})};const key=JSON.stringify(v);if(key!==lastDiagnostic){diagnostic(v);lastDiagnostic=key;}};
 const initial=webContents.getURL();let opened=false;
 const evaluate=async(fn,arg)=>{
  if(signal?.aborted||webContents.isDestroyed()||webContents.getURL()!==initial)throw Error('context-changed');
  const result=await webContents.executeJavaScriptInIsolatedWorld(17486,[{code:'('+fn.toString()+')(document,'+JSON.stringify(arg)+',('+recipientDialogs.toString()+'))'}]);
  if(signal?.aborted||webContents.isDestroyed()||webContents.getURL()!==initial)throw Error('context-changed');return result;
 };
 try{
  let before;const readyUntil=Date.now()+timeoutMs;
  while(Date.now()<readyUntil){
   before=await evaluate(recipientControl,'read');report('control',before);if(!before.composer)return {known:false};
   if(before.reason==='dialog-count')return {known:false,reason:before.reason,...safeCounts(before)};
   if(before.ready){before=await evaluate(recipientControl,'open');report('open',before);if(before.ready){opened=before.opened;break;}}
   await new Promise(r=>setTimeout(r,100));
  }
  if(!before?.ready)return {known:false,reason:before?.reason||'composer-loading',...safeCounts(before)};
  const until=Date.now()+timeoutMs;let result;
  while(Date.now()<until){result=await evaluate(probeRecipients,null);report('probe',result);if(result.known||result.dialogCount>1||result.unknownCount>0)break;await new Promise(r=>setTimeout(r,100));}
  const after=await evaluate(recipientControl,'read');if(after.label!==before.label)throw Error('context-changed');
  return result?.known?{...result,targetLabel:before.label}:{known:false,reason:result?.reason||'not-ready',...safeCounts(result)};
 }finally{
  if(opened&&!webContents.isDestroyed()&&webContents.getURL()===initial){
   // Close rather than confirm: inspecting must not change a saved audience.
   await webContents.executeJavaScriptInIsolatedWorld(17486,[{code:'('+recipientControl.toString()+')(document,"close",('+recipientDialogs.toString()+'))'}]);
   // Material dialog dismissal is asynchronous. Do not hand a supposedly
   // closed composer to the final guard while its recipient modal still exists.
   const until=Date.now()+timeoutMs;let closed=false;
   while(Date.now()<until){
    const state=await evaluate(recipientControl,'read');report('close',state);
    if(state.dialogOpen===false&&state.ready===true){closed=true;break;}
    await new Promise(r=>setTimeout(r,50));
   }
   if(!closed)throw Error('context-unverified');
  }
 }
}
module.exports={recipientDialogs,safeCounts,safeRecipientObservation,probeRecipients,recipientControl,inspectRecipients};
