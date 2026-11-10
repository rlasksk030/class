'use strict';
// Readback controls observed in the actual A/B/C publications on 2026-11-09.
// No network API, session extraction, publication, or identity/date inference.
const fs=require('node:fs/promises'),path=require('node:path');
const {officialPage}=require('./schoolbell-observed-composer.cjs');
const {readEditorText}=require('./schoolbell-editor-text.cjs');
const {MAX_LIBRARY,hash}=require('./media-store.cjs');
const {downloadOriginal}=require('./schoolbell-download.cjs');
function diaryRoute(url){
 if(!officialPage(url))return null;
 const u=new URL(url),m=u.pathname.match(/^\/ko\/main\/group\/(\d+)\/boards\/classnews(?:\/posts\/(\d+))?$/);
 return m?{groupId:m[1],postId:m[2]||null,boardURL:u.origin+'/ko/main/group/'+m[1]+'/boards/classnews'}:null;
}
// Select ONLY the requested title; never return unrelated post bodies or authors.
function postOperation(document,request,readText){
 const cards=Array.from(document.querySelectorAll('app-letter-item-long')).filter(e=>{
  if(request.postId&&e.closest('div.notification-post[data-letter-id]')?.getAttribute('data-letter-id')!==request.postId)return false;
  const t=e.querySelectorAll('app-translation-viewer');return t.length===1&&t[0].textContent.trim()===request.note.title;
 });
 if(cards.length!==1)throw Error('publication-unverified:card');
 const card=cards[0];
 if(request.postId&&card.closest('div.notification-post[data-letter-id]')?.getAttribute('data-letter-id')!==request.postId)throw Error('publication-unverified');
 const bodies=card.querySelectorAll('app-text-viewer .fr-view');
 const lists=card.querySelectorAll('app-letter-filelist'),media=card.querySelectorAll('app-media-browser');
 if(bodies.length!==1)throw Error('publication-unverified:body');
 if(lists.length!==1||media.length!==1)throw Error('publication-unverified:files');
 if(media[0].querySelectorAll('img,video,a').length)throw Error('publication-unverified:media');
 const body=readText(bodies[0]);if(typeof request.note.body==='string'&&body!==request.note.body.replace(/\r\n?/g,'\n'))throw Error('publication-unverified');
 const rows=Array.from(lists[0].querySelectorAll('.file-item'));
 const names=rows.map(row=>{
  const base=row.querySelectorAll('span.text-truncate'),ext=row.querySelectorAll('span.text-nowrap:not(.file-item-size)');
  if(base.length!==1||ext.length!==1)throw Error('publication-unverified');
  return base[0].textContent.trim()+ext[0].textContent.trim();
 });
 if(request.names&&JSON.stringify(request.names)!==JSON.stringify(names))throw Error('publication-unverified:order');
 if(request.action==='expand'){
  if(rows.length&&rows.some(e=>!e.getClientRects().length)){
   const toggles=lists[0].querySelectorAll('.d-flex.align-items-center.cursor-pointer');
   if(toggles.length!==1)throw Error('publication-unverified');
   // Actual UI: the nested "첨부파일 (N)" label opens the list. Clicking the
   // layout container itself does not dispatch through the label's handler.
   const isLabel=e=>/^첨부파일\s*\(\d+\)$/.test(e.textContent.trim());
   const labels=[toggles[0],...toggles[0].querySelectorAll('*')].filter(e=>isLabel(e)&&!Array.from(e.children).some(isLabel));
   if(labels.length!==1)throw Error('publication-unverified:files');labels[0].click();
  }
 }else if(request.action==='download'){
  const row=rows[request.index];
  if(!Number.isInteger(request.index)||!row||!row.getClientRects().length)throw Error('publication-unverified:hidden');
  row.click();
 }
 return {title:request.note.title,body,names,
  ...(request.action==='ready'?{filesVisible:rows.every(e=>e.getClientRects().length>0),
   visibility:rows.map(e=>{const result=[];for(let p=e;p&&p!==card;p=p.parentElement){
    const s=p.ownerDocument.defaultView.getComputedStyle(p);result.push({tag:p.tagName,display:s.display,visibility:s.visibility,rects:p.getClientRects().length});
   }return result;})}:{}),
  dateVerified:false,postIdVerified:false,originalsVerified:false};
}
function createObservedPostBridge({getWebContents,authorize,tempRoot,timeoutMs=15000}={}){
 let active=false,closed=false;const controller=new AbortController();
 function current(request,signal){
  const wc=getWebContents?.(),route=wc&&!wc.isDestroyed()?diaryRoute(wc.getURL()):null;
  const expected=diaryRoute(request.boardURL);
  if(closed||signal.aborted||!route||!expected||route.boardURL!==expected.boardURL)throw Error('publication-unverified');
  return wc;
 }
 async function operation(request,signal){
  const wc=current(request,signal),url=wc.getURL();
  if(typeof authorize!=='function'||await authorize({webContents:wc,request})!==true)throw Error('permission-unverified');
  if(current(request,signal)!==wc||wc.getURL()!==url)throw Error('publication-unverified');
  const code='(()=>{try{return {ok:true,value:('+postOperation.toString()+')(document,'+JSON.stringify(request)+',('+readEditorText.toString()+'))};}catch(e){return {ok:false,stage:(["publication-unverified:card","publication-unverified:body","publication-unverified:files","publication-unverified:media","publication-unverified:order","publication-unverified:hidden"].includes(e.message)?e.message:"publication-unverified")};}})()';
  const result=await wc.executeJavaScriptInIsolatedWorld(17482,[{code}],request.action==='download');
  if(current(request,signal)!==wc||wc.getURL()!==url||await authorize({webContents:wc,request})!==true)throw Error('publication-unverified');
  if(result?.ok!==true)throw Error(result?.stage||'publication-unverified');return result.value;
 }
 async function download(request,signal,dir){
  return downloadOriginal({webContents:current(request,signal),destination:path.join(dir,String(request.index)+'.original'),signal,timeoutMs,
   errorMessage:'publication-unverified:download',activate:()=>operation({...request,action:'download'},signal)});
 }
 async function run(request,externalSignal,originals,comparison=false){
  if(active||closed)throw Error('driver-state');active=true;
  const signal=externalSignal?AbortSignal.any([externalSignal,controller.signal]):controller.signal;
  let dir;
  try{
   const fields=await operation({...request,action:'read'},signal);if(!originals)return fields;
   if((!comparison&&(!Array.isArray(request.photos)||fields.names.length!==request.photos.length))||fields.names.length>20||!tempRoot)throw Error('publication-unverified');
   if(!fields.names.length)return {fields,attachments:{complete:true,items:[]}};
   await operation({...request,action:'expand',names:fields.names},signal);
   // Expanding the real file list renders rows asynchronously. Never treat
   // the click itself as proof that a download target is ready.
   const readyUntil=Date.now()+timeoutMs;
   let ready;
   while(!(ready=await operation({...request,action:'ready',names:fields.names},signal)).filesVisible){
    if(Date.now()>=readyUntil){const error=Error('publication-unverified:hidden');error.fileVisibility=ready.visibility;throw error;}
    await new Promise(resolve=>setTimeout(resolve,100));
   }
   dir=await fs.mkdtemp(path.join(tempRoot,'schoolbell-verify-'));
   const items=[];let total=0;
   for(let i=0;i<fields.names.length;i++){
    const bytes=await download({...request,names:fields.names,index:i},signal,dir);total+=bytes.length;
    if(total>MAX_LIBRARY||(!comparison&&(hash(bytes)!==request.photos[i].sha256||bytes.length!==request.photos[i].bytes)))throw Error('publication-unverified');
    items.push({state:'complete',source:'original-download',bytes});
   }
   const after=await operation({...request,action:'read',names:fields.names},signal);
   if(after.body!==fields.body)throw Error('publication-unverified');
   return {fields,attachments:{complete:true,items}};
  }finally{try{if(dir)await fs.rm(dir,{recursive:true,force:true});}finally{active=false;}}
 }
 return {readFields:(r,s)=>run(r,s,false),readOriginals:(r,s)=>run(r,s,true),readOriginalsForComparison:(r,s)=>run(r,s,true,true),
  close(){closed=true;controller.abort();return !active;}};
}
module.exports={diaryRoute,postOperation,createObservedPostBridge};
