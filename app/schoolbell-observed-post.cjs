'use strict';
// Readback controls observed in the actual A/B/C publications on 2026-11-09.
// No network API, session extraction, publication, or identity/date inference.
const fs=require('node:fs/promises'),path=require('node:path');
const {officialPage}=require('./schoolbell-observed-composer.cjs');
const {readEditorText}=require('./schoolbell-editor-text.cjs');
const {MAX_FILE,MAX_LIBRARY,hash,dimensions}=require('./media-store.cjs');
function diaryRoute(url){
 if(!officialPage(url))return null;
 const u=new URL(url),m=u.pathname.match(/^\/ko\/main\/group\/(\d+)\/boards\/classnews(?:\/posts\/(\d+))?$/);
 return m?{groupId:m[1],postId:m[2]||null,boardURL:u.origin+'/ko/main/group/'+m[1]+'/boards/classnews'}:null;
}
// Select ONLY the requested title; never return unrelated post bodies or authors.
function postOperation(document,request,readText){
 const cards=Array.from(document.querySelectorAll('app-letter-item-long')).filter(e=>{
  const t=e.querySelectorAll('app-translation-viewer');return t.length===1&&t[0].textContent.trim()===request.note.title;
 });
 if(cards.length!==1)throw Error('publication-unverified');
 const card=cards[0];
 if(request.postId&&card.closest('div.notification-post[data-letter-id]')?.getAttribute('data-letter-id')!==request.postId)throw Error('publication-unverified');
 const bodies=card.querySelectorAll('app-text-viewer .fr-view');
 const lists=card.querySelectorAll('app-letter-filelist'),media=card.querySelectorAll('app-media-browser');
 if(bodies.length!==1||lists.length!==1||media.length!==1||media[0].querySelectorAll('img,video,a').length)throw Error('publication-unverified');
 const body=readText(bodies[0]);if(body!==request.note.body.replace(/\r\n?/g,'\n'))throw Error('publication-unverified');
 const rows=Array.from(lists[0].querySelectorAll('.file-item'));
 const names=rows.map(row=>{
  const base=row.querySelectorAll('span.text-truncate'),ext=row.querySelectorAll('span.text-nowrap:not(.file-item-size)');
  if(base.length!==1||ext.length!==1)throw Error('publication-unverified');
  return base[0].textContent.trim()+ext[0].textContent.trim();
 });
 if(request.names&&JSON.stringify(request.names)!==JSON.stringify(names))throw Error('publication-unverified');
 if(request.action==='expand'){
  if(rows.length&&rows.some(e=>!e.getClientRects().length)){
   const toggles=lists[0].querySelectorAll('.d-flex.align-items-center.cursor-pointer');
   if(toggles.length!==1)throw Error('publication-unverified');toggles[0].click();
  }
 }else if(request.action==='download'){
  const row=rows[request.index];
  if(!Number.isInteger(request.index)||!row||!row.getClientRects().length)throw Error('publication-unverified');
  row.click();
 }
 return {title:request.note.title,body,names,dateVerified:false,postIdVerified:false,originalsVerified:false};
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
  const code='(()=>{try{return {ok:true,value:('+postOperation.toString()+')(document,'+JSON.stringify(request)+',('+readEditorText.toString()+'))};}catch{return {ok:false};}})()';
  const result=await wc.executeJavaScriptInIsolatedWorld(17482,[{code}],request.action==='download');
  if(current(request,signal)!==wc||wc.getURL()!==url||await authorize({webContents:wc,request})!==true)throw Error('publication-unverified');
  if(result?.ok!==true)throw Error('publication-unverified');return result.value;
 }
 async function download(request,signal,dir){
  const wc=current(request,signal),destination=path.join(dir,String(request.index)+'.original');
  let item,timer,onDownload,onAbort,settled=false;
  const result=new Promise((resolve,reject)=>{
   const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);wc.session.removeListener('will-download',onDownload);signal.removeEventListener('abort',onAbort);if(error){item?.cancel();reject(error);}else resolve(value);};
   onAbort=()=>finish(Error('publication-unverified'));
   onDownload=(_event,download,source)=>{
    if(source!==wc||item)return;
    item=download;wc.session.removeListener('will-download',onDownload);
    if(item.getTotalBytes()>MAX_FILE){finish(Error('publication-unverified'));return;}
    item.setSavePath(destination);
    item.on('updated',()=>{if(item.getReceivedBytes()>MAX_FILE)finish(Error('publication-unverified'));});
    item.once('done',(_event,state)=>state==='completed'?finish(null,destination):finish(Error('publication-unverified')));
   };
   wc.session.on('will-download',onDownload);signal.addEventListener('abort',onAbort,{once:true});
   timer=setTimeout(onAbort,timeoutMs);
   if(signal.aborted)onAbort();
  });
  // Observe rejection immediately; a DOM click error must not leave an unhandled
  // download waiter, listener, or background operation after cancellation.
  const settledResult=result.then(file=>({file}),error=>({error}));
  try{await operation({...request,action:'download'},signal);}catch(error){onAbort();await settledResult;throw error;}
  const outcome=await settledResult;if(outcome.error)throw outcome.error;
  const stat=await fs.stat(outcome.file);if(!stat.size||stat.size>MAX_FILE)throw Error('publication-unverified');
  const bytes=await fs.readFile(outcome.file);dimensions(bytes);return bytes;
 }
 async function run(request,externalSignal,originals){
  if(active||closed)throw Error('driver-state');active=true;
  const signal=externalSignal?AbortSignal.any([externalSignal,controller.signal]):controller.signal;
  let dir;
  try{
   const fields=await operation({...request,action:'read'},signal);if(!originals)return fields;
   if(!Array.isArray(request.photos)||fields.names.length!==request.photos.length||fields.names.length>20||!tempRoot)throw Error('publication-unverified');
   if(!fields.names.length)return {fields,attachments:{complete:true,items:[]}};
   await operation({...request,action:'expand',names:fields.names},signal);
   dir=await fs.mkdtemp(path.join(tempRoot,'schoolbell-verify-'));
   const items=[];let total=0;
   for(let i=0;i<fields.names.length;i++){
    const bytes=await download({...request,names:fields.names,index:i},signal,dir);total+=bytes.length;
    if(total>MAX_LIBRARY||hash(bytes)!==request.photos[i].sha256||bytes.length!==request.photos[i].bytes)throw Error('publication-unverified');
    items.push({state:'complete',source:'original-download',bytes});
   }
   const after=await operation({...request,action:'read',names:fields.names},signal);
   if(after.body!==fields.body)throw Error('publication-unverified');
   return {fields,attachments:{complete:true,items}};
  }finally{if(dir)await fs.rm(dir,{recursive:true,force:true});active=false;}
 }
 return {readFields:(r,s)=>run(r,s,false),readOriginals:(r,s)=>run(r,s,true),
  close(){closed=true;controller.abort();return !active;}};
}
module.exports={diaryRoute,postOperation,createObservedPostBridge};
