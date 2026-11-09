'use strict';
// Read only the actual send-target dialog observed 2026-11-09. Empty roster
// slots do not establish this fact; an unfiltered empty recipient table does.
function probeRecipients(document){
 const dialogs=Array.from(document.querySelectorAll('mat-dialog-container')).filter(d=>d.querySelector('app-select-letter-targets'));
 if(dialogs.length!==1)return {known:false,reason:'dialog-count'};
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
 return {known:true,unfiltered:true,empty,students:empty?0:null,parents:empty?0:null,roles,
  mandatoryAdministrator:roles.administrator.checked&&roles.administrator.disabled};
}
function recipientControl(document,action){
 const roots=document.querySelectorAll('app-boards-write');if(roots.length!==1)return {composer:false};
 const labels=roots[0].querySelectorAll('app-letter-simplified-target-text');if(labels.length!==1)return {composer:false};
 const before=labels[0].textContent;if(!before.trim())return {composer:true,ready:false};
 const dialogs=Array.from(document.querySelectorAll('mat-dialog-container')).filter(d=>d.querySelector('app-select-letter-targets'));
 if(action==='open'&&!dialogs.length){
  const buttons=roots[0].querySelectorAll('button:has(+ app-letter-simplified-target-text)');
  if(buttons.length!==1||buttons[0].textContent.trim()!=='변경'||buttons[0].disabled)throw Error('context-unverified');
  buttons[0].click();return {composer:true,ready:true,opened:true,label:before};
 }
 if(action==='close'&&dialogs.length===1){
  const close=Array.from(dialogs[0].querySelectorAll('button')).filter(b=>b.textContent.trim()==='닫기');
  if(close.length!==1||close[0].disabled)throw Error('context-unverified');close[0].click();
 }
 return {composer:true,ready:true,opened:false,dialogOpen:dialogs.length>0,label:before};
}
async function inspectRecipients(webContents,signal,{timeoutMs=5000}={}){
 const initial=webContents.getURL();let opened=false;
 const evaluate=async(fn,arg)=>{
  if(signal?.aborted||webContents.isDestroyed()||webContents.getURL()!==initial)throw Error('context-changed');
  const result=await webContents.executeJavaScriptInIsolatedWorld(17486,[{code:'('+fn.toString()+')(document,'+JSON.stringify(arg)+')'}]);
  if(signal?.aborted||webContents.isDestroyed()||webContents.getURL()!==initial)throw Error('context-changed');return result;
 };
 try{
  let before;const readyUntil=Date.now()+timeoutMs;
  while(Date.now()<readyUntil){before=await evaluate(recipientControl,'read');if(!before.composer)return {known:false};if(before.ready)break;await new Promise(r=>setTimeout(r,100));}
  if(!before?.ready)return {known:false,reason:'composer-loading'};
  before=await evaluate(recipientControl,'open');opened=before.opened;
  const until=Date.now()+timeoutMs;let result;
  while(Date.now()<until){result=await evaluate(probeRecipients,null);if(result.known)break;await new Promise(r=>setTimeout(r,100));}
  const after=await evaluate(recipientControl,'read');if(after.label!==before.label)throw Error('context-changed');
  return result?.known?{...result,targetLabel:before.label}:{known:false,reason:result?.reason||'not-ready'};
 }finally{
  if(opened&&!webContents.isDestroyed()&&webContents.getURL()===initial){
   // Close rather than confirm: inspecting must not change a saved audience.
   await webContents.executeJavaScriptInIsolatedWorld(17486,[{code:'('+recipientControl.toString()+')(document,"close")'}]);
   // Material dialog dismissal is asynchronous. Do not hand a supposedly
   // closed composer to the final guard while its recipient modal still exists.
   const until=Date.now()+timeoutMs;let closed=false;
   while(Date.now()<until){
    const state=await evaluate(recipientControl,'read');
    if(state.dialogOpen===false){closed=true;break;}
    await new Promise(r=>setTimeout(r,50));
   }
   if(!closed)throw Error('context-unverified');
  }
 }
}
module.exports={probeRecipients,recipientControl,inspectRecipients};
