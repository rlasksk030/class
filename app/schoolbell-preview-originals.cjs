'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {officialPage}=require('./schoolbell-observed-composer.cjs');
const {probeAttachments}=require('./schoolbell-ui-probe.cjs');
const {downloadOriginal}=require('./schoolbell-download.cjs');
const {MAX_LIBRARY,hash}=require('./media-store.cjs');
// Observed live iframe destination, after the embedded v5 app has initialized.
// Pin the current class and classnews preview; never accept another class/post.
function previewRoute(value,owner){
 try{const u=new URL(value),p=new URL(owner),m=p.pathname.match(/^\/ko\/main\/group\/(\d+)\/boards\/write\/classnews$/);
  const parts=previewURLParts(value);
  return !!m&&!!parts&&JSON.stringify(parts.path)===JSON.stringify(('/mobile/groups/0:'+m[1]+'/boards/classnews/posts/preview').split('/'))&&
   [...u.searchParams.keys()].length===2&&u.searchParams.getAll('state').length===1&&!!u.searchParams.get('state')&&
   u.searchParams.get('state').length<=200&&u.searchParams.getAll('origin').length===1&&u.searchParams.get('origin')===p.origin&&!u.hash;
 }catch{return false;}
}
function previewURLParts(value){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='v5.schoolbell-e.com'||u.port||u.username||u.password)return null;
  u.searchParams.sort();return {origin:u.origin,path:u.pathname.split('/').map(decodeURIComponent),query:[...u.searchParams],hash:u.hash};
 }catch{return null;}
}
const samePreviewURL=(a,b)=>!!previewURLParts(a)&&JSON.stringify(previewURLParts(a))===JSON.stringify(previewURLParts(b));
// Observed preview uses a v5 iframe. This does NOT widen the top-level login or
// navigation allowlist. The displayed image is JPEG-converted, NEVER an original.
function previewControl(document,action){
 const roots=document.querySelectorAll('app-boards-write');if(roots.length!==1)throw Error('upload-unverified');
 const previews=document.querySelectorAll('app-mobile-preview');
 const frames=previews.length===1?previews[0].querySelectorAll('iframe'):[];
 const visible=frames.length===1&&!!frames[0].getClientRects().length;
 if(previews.length<=1&&!visible&&action==='open'){
  const buttons=Array.from(document.querySelectorAll('button')).filter(b=>b.textContent.trim()==='미리보기');
  if(buttons.length!==1||buttons[0].disabled)throw Error('upload-unverified');buttons[0].click();return {opened:true};
 }
 if(previews.length!==1)return {ready:false,reason:'container-count'};
 if(frames.length!==1)return {ready:false,reason:'iframe-count'};
 if(!visible)return {ready:false,reason:'iframe-hidden'};
 return {ready:true,src:frames[0].src};
}
function previewFiles(document,expected,index){
 const roots=document.querySelectorAll('app-group-board-letter-detail-preview');if(roots.length!==1)throw Error('upload-unverified:preview-root-count');
 const rows=Array.from(roots[0].querySelectorAll('app-files-list ion-item.file-item'));
 const names=rows.map(row=>row.textContent.replace(/\s*\(\d+(?:\.\d+)?\s*(?:bytes|B|KB|MB|GB)\)\s*$/i,'').trim().replace(/\s+(\.[a-z0-9]+)$/i,'$1'));
 if(rows.length!==expected.length)throw Error('upload-unverified:preview-row-count');
 if(JSON.stringify(names)!==JSON.stringify(expected))throw Error('upload-unverified:preview-name-mismatch');
 if(index!==null){
  const row=rows[index],buttons=row?.shadowRoot?.querySelectorAll('button.item-native');
  if(!row||!row.getClientRects().length||buttons?.length!==1||buttons[0].disabled)throw Error('upload-unverified:preview-file-control');
  buttons[0].click(); // Observed native Ionic file control, no internal handler/API.
 }
 return {count:rows.length};
}
function previewDiagnostics(document,expected){
 const rows=Array.from(document.querySelectorAll('app-files-list ion-item.file-item'));
 return {customTags:[...new Set(Array.from(document.querySelectorAll('*')).map(e=>e.localName).filter(s=>s.includes('-')))].slice(0,40),
  rows:rows.map((r,i)=>({expectedNamePresent:r.textContent.replace(/\s/g,'').includes(expected[i]||'__missing__'),
   sizeSuffix:/\(\d+(?:\.\d+)?\s*(?:bytes|B|KB|MB|GB)\)\s*$/i.test(r.textContent),
   shadowButtonCount:r.shadowRoot?.querySelectorAll('button.item-native').length??0})).slice(0,20)};
}
function createPreviewOriginals({getWebContents,tempRoot,timeoutMs=12000}={}){
 let active=false,closed=false;const controller=new AbortController();
 async function readUploads(request,external){
  if(active||closed)throw Error('driver-state');active=true;
  const signal=external?AbortSignal.any([external,controller.signal]):controller.signal;
  const wc=getWebContents?.(),initial=wc&&!wc.isDestroyed()?wc.getURL():null;
  const check=()=>{if(closed||signal.aborted||!wc||wc.isDestroyed()||wc.getURL()!==initial||!officialPage(initial)||request.stillPermitted?.()!==true)throw Error('upload-unverified');};
  const main=async(fn,...args)=>{check();const value=await wc.executeJavaScriptInIsolatedWorld(17485,[{code:'('+fn.toString()+')(document,'+args.map(v=>JSON.stringify(v)).join(',')+')'}]);check();return value;};
  let opened=false,dir,stage='attachment-list',frame,previewURL;
  try{
   check();const names=request.expectedNames,photos=request.expectedPhotos;
   if(!Array.isArray(names)||!Array.isArray(photos)||names.length!==photos.length||names.length>20)throw Error('upload-unverified');
   const ui=await main(probeAttachments);
   if(!ui.listKnown||ui.uploading||JSON.stringify(ui.names)!==JSON.stringify(names))throw Error('upload-unverified');
   if(!names.length)return {complete:true,items:[]};
   stage='preview-frame';let preview=await main(previewControl,'read');
   if(!preview.ready){preview=await main(previewControl,'open');opened=preview.opened===true;}
   const deadline=Date.now()+timeoutMs;let frameReason='not-ready';
   while(Date.now()<deadline){
    preview=await main(previewControl,'read');
    if(preview.ready){
     let u;try{u=new URL(preview.src);}catch{}
     // A visible iframe may still be the initial empty document. Wait for the
     // observed allowed origin; never execute in an unverified loading frame.
     if(u?.protocol==='https:'&&u.hostname==='v5.schoolbell-e.com'&&!u.port&&!u.username&&!u.password){
      const children=wc.mainFrame.framesInSubtree.filter(f=>f!==wc.mainFrame&&!f.isDestroyed());
      const matching=children.filter(f=>previewRoute(f.url,initial));
      const frames=matching.filter(f=>f.parent===wc.mainFrame);
      frameReason=matching.length===1?'parent-mismatch':matching.length===0?'url-mismatch':'duplicate-frame';
      if(frames.length===1){frame=frames[0];previewURL=frame.url;break;}
     }else frameReason='origin-not-ready';
    }else frameReason=preview.reason||'not-ready';
    await new Promise(r=>setTimeout(r,100));
   }
   if(!frame){stage='preview-'+frameReason;throw Error('upload-unverified');}
   const operate=async index=>{
    check();if(frame.isDestroyed()||!samePreviewURL(frame.url,previewURL))throw Error('upload-unverified:preview-url-changed');
    const value=await frame.executeJavaScript('('+previewFiles.toString()+')(document,'+JSON.stringify(names)+','+JSON.stringify(index)+')',index!==null);
    check();return value;
   };
   // No DOM src/image download: the preview derivative was experimentally found
   // to differ from the original. Only the file control's download can qualify.
   stage='preview-files';const filesUntil=Date.now()+timeoutMs;
   while(true){try{await operate(null);break;}catch(error){check();if(Date.now()>=filesUntil)throw error;await new Promise(r=>setTimeout(r,100));}}
   dir=await fs.mkdtemp(path.join(tempRoot,'schoolbell-upload-verify-'));
   const items=[];let total=0;
   for(let i=0;i<photos.length;i++){
    stage='original-download';const bytes=await downloadOriginal({webContents:wc,destination:path.join(dir,i+'.original'),signal,timeoutMs,errorMessage:'upload-unverified',activate:()=>operate(i)});
    total+=bytes.length;
    stage='original-mismatch';if(total>MAX_LIBRARY||hash(bytes)!==photos[i].sha256||bytes.length!==photos[i].bytes)throw Error('upload-unverified');
    items.push({state:'complete',source:'original-download',bytes});
   }
   stage='after-ui';await operate(null);const after=await main(probeAttachments);
   if(after.uploading||JSON.stringify(after.names)!==JSON.stringify(names))throw Error('upload-unverified');
   return {complete:true,items};
  }catch(error){
   const failure=error.message==='upload-unverified'?Error('upload-unverified:'+stage):error;
   if(stage==='preview-files'&&frame&&!frame.isDestroyed()){
    try{check();const a=previewURLParts(frame.url),b=previewURLParts(previewURL);
     failure.previewDetails={...await frame.executeJavaScript('('+previewDiagnostics.toString()+')(document,'+JSON.stringify(request.expectedNames)+')'),
      url:{sameOrigin:a?.origin===b?.origin,samePath:JSON.stringify(a?.path)===JSON.stringify(b?.path),sameQuery:JSON.stringify(a?.query)===JSON.stringify(b?.query),sameHash:a?.hash===b?.hash}};check();}catch{}
   }
   throw failure;
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
module.exports={previewControl,previewFiles,createPreviewOriginals,samePreviewURL,previewRoute};
