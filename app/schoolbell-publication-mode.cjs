'use strict';
// The labels were observed on the actual send dropdown. Native checked state
// is evidence of immediate/scheduled mode, never of a future server timestamp.
function readPublicationMode(document){
 const roots=document.querySelectorAll('app-boards-write');if(roots.length!==1)return {known:false};
 const controls=Array.from(document.querySelectorAll('input[type="radio"]'));
 const label=e=>Array.from(e.labels||[]).map(l=>l.textContent.trim()).join(' ').trim();
 const now=controls.filter(e=>label(e)==='즉시발행하기'),later=controls.filter(e=>label(e)==='예약발행하기');
 if(now.length!==1||later.length!==1||now[0].disabled||later[0].disabled||
    now[0].checked===later[0].checked)return {known:false,immediateCount:now.length,scheduledCount:later.length};
 return {known:true,mode:now[0].checked?'immediate':'scheduled',dateSelectable:!now[0].checked};
}
function modeDropdown(document){
 const roots=document.querySelectorAll('app-boards-write');if(roots.length!==1)return false;
 const buttons=Array.from(roots[0].querySelectorAll('button')).filter(b=>
  [b.getAttribute('aria-label'),b.getAttribute('title'),b.textContent.trim()].includes('드롭다운 토글'));
 if(buttons.length!==1||buttons[0].disabled)return false;buttons[0].click();return true;
}
async function inspectPublicationMode(wc,signal,{keepOpen=false}={}){
 const url=wc.getURL(),run=async fn=>{
  if(signal?.aborted||wc.isDestroyed()||wc.getURL()!==url)throw Error('context-changed');
  const result=await wc.executeJavaScriptInIsolatedWorld(17487,[{code:'('+fn.toString()+')(document)'}]);
  if(signal?.aborted||wc.isDestroyed()||wc.getURL()!==url)throw Error('context-changed');return result;
 };
 const initial=await run(readPublicationMode);if(initial.known)return {...initial,availableWhenClosed:true};
 const opened=await run(modeDropdown);if(!opened)return {...initial,dropdownKnown:false};
 let result=initial;
 try{const until=Date.now()+3000;while(Date.now()<until){result=await run(readPublicationMode);if(result.known)break;await new Promise(r=>setTimeout(r,100));}}
 finally{if(!keepOpen)await run(modeDropdown);}
 return {...result,dropdownKnown:true,...(keepOpen?{keptOpen:true}:{availableWhenClosed:(await run(readPublicationMode)).known})};
}
module.exports={readPublicationMode,modeDropdown,inspectPublicationMode};
