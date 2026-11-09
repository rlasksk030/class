'use strict';
const {officialPage}=require('./schoolbell-observed-composer.cjs');
// The classnews list and its single 작성하기 button were observed on the live
// service. Click that control; never construct an unobserved write/navigation URL.
function composerEntry(document,open,expectedURL){
 if(document.location.href!==expectedURL)throw Error('context-unverified');
 const composers=document.querySelectorAll('app-boards-write');
 if(composers.length===1)return {ready:true};
 if(composers.length)throw Error('structure-unverified');
 const boards=document.querySelectorAll('app-group-board');
 if(boards.length!==1)return {ready:false};
 const buttons=Array.from(document.querySelectorAll('button')).filter(b=>b.textContent.trim()==='작성하기');
 if(buttons.length!==1||buttons[0].disabled||!buttons[0].getClientRects().length)throw Error('structure-unverified');
 if(open)buttons[0].click();return {ready:false,clicked:open};
}
async function openObservedComposer(wc,{groupId,signal,allowed,timeoutMs=12000}={}){
 if(!/^\d+$/.test(groupId||''))throw Error('context-unverified');
 let origin;
 const check=()=>{
  if(signal?.aborted||wc.isDestroyed()||allowed?.()!==true)throw Error('context-unverified');
  const value=wc.getURL();if(!officialPage(value))throw Error('context-unverified');
  const u=new URL(value),m=u.pathname.match(/^\/ko\/main\/group\/(\d+)\/boards\/(?:write\/)?classnews(?:\/posts\/\d+)?$/);
  if(u.search||u.hash||!m||m[1]!==groupId||(origin&&u.origin!==origin))throw Error('context-unverified');origin=u.origin;
 };
 const deadline=Date.now()+timeoutMs;let clicked=false;
 while(Date.now()<deadline){
  check();const result=await wc.executeJavaScriptInIsolatedWorld(17487,[{code:'('+composerEntry.toString()+')(document,'+JSON.stringify(!clicked)+','+JSON.stringify(wc.getURL())+')'}]);check();
  if(result?.ready)return;
  clicked ||= result?.clicked===true;
  await new Promise(r=>setTimeout(r,100));
 }
 throw Error('structure-unverified');
}
module.exports={composerEntry,openObservedComposer};
