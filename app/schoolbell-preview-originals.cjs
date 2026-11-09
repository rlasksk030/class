'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {officialPage}=require('./schoolbell-observed-composer.cjs');
const {probeAttachments}=require('./schoolbell-ui-probe.cjs');
const {downloadOriginal}=require('./schoolbell-download.cjs');
const {MAX_LIBRARY,hash}=require('./media-store.cjs');
// Observed preview uses a v5 iframe. This does NOT widen the top-level login or
// navigation allowlist. The displayed image is JPEG-converted, NEVER an original.
function previewControl(document,action){
 const roots=document.querySelectorAll('app-boards-write');if(roots.length!==1)throw Error('upload-unverified');
 const previews=document.querySelectorAll('app-mobile-preview');
 if(!previews.length&&action==='open'){
  const buttons=Array.from(document.querySelectorAll('button')).filter(b=>b.textContent.trim()==='미리보기');
  if(buttons.length!==1||buttons[0].disabled)throw Error('upload-unverified');buttons[0].click();return {opened:true};
 }
 if(previews.length!==1)return {ready:false};
 const frames=previews[0].querySelectorAll('iframe');
 if(frames.length!==1||!frames[0].getClientRects().length)return {ready:false};
 return {ready:true,src:frames[0].src};
}
function previewFiles(document,expected,index){
 const roots=document.querySelectorAll('app-group-board-letter-detail-preview');if(roots.length!==1)throw Error('upload-unverified');
 const rows=Array.from(roots[0].querySelectorAll('app-files-list ion-item.file-item'));
 const names=rows.map(row=>row.textContent.replace(/\s*\(\d+(?:\.\d+)?\s*(?:B|KB|MB|GB)\)\s*$/i,'').trim());
 if(JSON.stringify(names)!==JSON.stringify(expected))throw Error('upload-unverified');
 if(index!==null){
  const row=rows[index],buttons=row?.shadowRoot?.querySelectorAll('button.item-native');
  if(!row||!row.getClientRects().length||buttons?.length!==1||buttons[0].disabled)throw Error('upload-unverified');
  buttons[0].click(); // Observed native Ionic file control, no internal handler/API.
 }
 return {count:rows.length};
}
function createPreviewOriginals({getWebContents,tempRoot,timeoutMs=12000}={}){
 let active=false,closed=false;const controller=new AbortController();
 async function readUploads(request,external){
  if(active||closed)throw Error('driver-state');active=true;
  const signal=external?AbortSignal.any([external,controller.signal]):controller.signal;
  const wc=getWebContents?.(),initial=wc&&!wc.isDestroyed()?wc.getURL():null;
  const check=()=>{if(closed||signal.aborted||!wc||wc.isDestroyed()||wc.getURL()!==initial||!officialPage(initial)||request.stillPermitted?.()!==true)throw Error('upload-unverified');};
  const main=async(fn,...args)=>{check();const value=await wc.executeJavaScriptInIsolatedWorld(17485,[{code:'('+fn.toString()+')(document,'+args.map(v=>JSON.stringify(v)).join(',')+')'}]);check();return value;};
  let opened=false,dir;
  try{
   check();const names=request.expectedNames,photos=request.expectedPhotos;
   if(!Array.isArray(names)||!Array.isArray(photos)||names.length!==photos.length||names.length>20)throw Error('upload-unverified');
   const ui=await main(probeAttachments);
   if(!ui.listKnown||ui.uploading||JSON.stringify(ui.names)!==JSON.stringify(names))throw Error('upload-unverified');
   if(!names.length)return {complete:true,items:[]};
   let preview=await main(previewControl,'read');
   if(!preview.ready){preview=await main(previewControl,'open');opened=preview.opened===true;}
   const deadline=Date.now()+timeoutMs;let frame;
   while(Date.now()<deadline){
    preview=await main(previewControl,'read');
    if(preview.ready){
     const u=new URL(preview.src);
     if(u.protocol!=='https:'||u.hostname!=='v5.schoolbell-e.com'||u.port||u.username||u.password)throw Error('upload-unverified');
     const frames=wc.mainFrame.framesInSubtree.filter(f=>f!==wc.mainFrame&&!f.isDestroyed()&&f.parent===wc.mainFrame&&f.url===preview.src);
     if(frames.length===1){frame=frames[0];break;}
    }
    await new Promise(r=>setTimeout(r,100));
   }
   if(!frame)throw Error('upload-unverified');
   const operate=async index=>{
    check();if(frame.isDestroyed()||frame.url!==preview.src)throw Error('upload-unverified');
    const value=await frame.executeJavaScript('('+previewFiles.toString()+')(document,'+JSON.stringify(names)+','+JSON.stringify(index)+')',index!==null);
    check();return value;
   };
   // No DOM src/image download: the preview derivative was experimentally found
   // to differ from the original. Only the file control's download can qualify.
   await operate(null);dir=await fs.mkdtemp(path.join(tempRoot,'schoolbell-upload-verify-'));
   const items=[];let total=0;
   for(let i=0;i<photos.length;i++){
    const bytes=await downloadOriginal({webContents:wc,destination:path.join(dir,i+'.original'),signal,timeoutMs,errorMessage:'upload-unverified',activate:()=>operate(i)});
    total+=bytes.length;
    if(total>MAX_LIBRARY||hash(bytes)!==photos[i].sha256||bytes.length!==photos[i].bytes)throw Error('upload-unverified');
    items.push({state:'complete',source:'original-download',bytes});
   }
   await operate(null);const after=await main(probeAttachments);
   if(after.uploading||JSON.stringify(after.names)!==JSON.stringify(names))throw Error('upload-unverified');
   return {complete:true,items};
  }finally{
   try{
    if(opened&&wc&&!wc.isDestroyed()&&wc.getURL()===initial){
     const visible=await wc.executeJavaScriptInIsolatedWorld(17485,[{code:'document.querySelectorAll("app-mobile-preview").length===1'}]);
     if(visible){wc.sendInputEvent({type:'keyDown',keyCode:'Escape'});wc.sendInputEvent({type:'keyUp',keyCode:'Escape'});}
    }
   }finally{
    // Renderer teardown must not strand original bytes or an active attempt.
    try{if(dir)await fs.rm(dir,{recursive:true,force:true});}finally{active=false;}
   }
  }
 }
 return {readUploads,close(){closed=true;controller.abort();return !active;}};
}
module.exports={previewControl,previewFiles,createPreviewOriginals};
