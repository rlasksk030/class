'use strict';
// Development-only, fixed synthetic preparation. No publisher, final approval,
// commit, save, scheduled-send, success receipt or draft-reset API is exposed.
const crypto=require('node:crypto'),zlib=require('node:zlib');
const {createObservedComposerBridge}=require('./schoolbell-observed-composer.cjs');
const {classRoute}=require('./schoolbell-live-context.cjs');
const {safeRecipientObservation}=require('./schoolbell-recipients.cjs');
const {hash}=require('./media-store.cjs');
const NOTE=Object.freeze({title:'우리 교실 일반 학급 비게시 검증',body:'학교종이 자동 입력 기능을 확인하는\n비게시 테스트입니다.\n실제 발송하지 않습니다.'});
function syntheticPhoto(){
 const chunk=(kind,data)=>{const b=Buffer.concat([Buffer.from(kind),data]);let crc=0xffffffff;
  for(const v of b){crc^=v;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  const out=Buffer.alloc(b.length+8);out.writeUInt32BE(data.length);b.copy(out,4);out.writeUInt32BE((crc^0xffffffff)>>>0,out.length-4);return out;};
 const head=Buffer.alloc(13);head.writeUInt32BE(16);head.writeUInt32BE(16,4);head[8]=8;head[9]=6;
 const pixels=Buffer.alloc((16*4+1)*16,180);for(let y=0;y<16;y++)pixels[y*65]=0;
 const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',zlib.deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
 return {id:hash(bytes)+'.png',bytes};
}
// This guard permits only input into the unchanged, initially blank document.
// It cannot authorize commit even if passed to a composer with a commit method.
function nonpublishingGuard(document,payload,_mode,readText){
 const p=payload.proof,now=Date.now();
 if(!['title','body','files'].includes(payload.action)||p?.kind!=='nonpublishing-input'||p.action!==payload.action||
  !Number.isFinite(p.issuedAt)||!Number.isFinite(p.expiresAt)||typeof p.operation!=='string'||!p.operation||
  typeof p.expected?.title!=='string'||typeof p.expected?.body!=='string'||
  now<p.issuedAt||now>=p.expiresAt||document.location.href!==p.href||typeof readText!=='function')return false;
 const u=new URL(p.href),m=u.pathname.match(/^\/ko\/main\/group\/(\d+)\/boards\/write\/classnews$/);
 if(!m||m[1]!==p.boardId||u.search||u.hash)return false;
 const roots=document.querySelectorAll('app-boards-write');if(roots.length!==1)return false;const root=roots[0];
 const state=globalThis.__classroomSchoolbellStates?.get(root);
 if(!state||state.documentToken!==p.documentToken||state.submitted||state.composing)return false;
 const labels=root.querySelectorAll('app-letter-simplified-target-text');
 if(labels.length!==1||labels[0].textContent!==p.recipientLabel)return false;
 for(const e of document.querySelectorAll('app-select-letter-targets,app-mobile-preview')){
  const nodes=e.querySelectorAll('iframe'),surfaces=nodes.length?Array.from(nodes):[e];
  if(surfaces.some(n=>{const s=document.defaultView.getComputedStyle(n);return s.display!=='none'&&s.visibility!=='hidden'&&s.visibility!=='collapse'&&Number(s.opacity)!==0&&Array.from(n.getClientRects()).some(r=>r.width>0&&r.height>0);}))return false;
 }
 const titles=root.querySelectorAll('input[placeholder="제목을 입력해 주세요."]');
 const bodies=root.querySelectorAll('div.fr-element.fr-view[contenteditable="true"]');
 const files=root.querySelectorAll('input[type="file"]'),lists=root.querySelectorAll('app-letter-write-file-list');
 if(titles.length!==1||bodies.length!==1||files.length!==1||lists.length!==1||files[0].files.length||lists[0].querySelectorAll('app-file-row').length)return false;
 const seen=globalThis.__classroomNonpublishingOperations||(globalThis.__classroomNonpublishingOperations=new WeakMap());
 if(seen.get(root)!==p.operation){
  if(titles[0].value!==p.expected.title||readText(bodies[0])!==p.expected.body)return false;
  seen.set(root,p.operation);
 }
 // Subsequent checks occur synchronously inside the existing native body edit.
 // No user event can interleave between these checks; final text is re-read.
 return true;
}
function observationKey(c){
 return JSON.stringify({boardId:c?.boardId,account:c?.accountObservationDigest||null,
  recipients:c?.recipientEvidence&&{label:c.recipientEvidence.targetLabel,roles:c.recipientEvidence.roles,
   empty:c.recipientEvidence.empty,unfiltered:c.recipientEvidence.unfiltered,visibleRows:c.recipientEvidence.visibleRows}});
}
function ordinaryContext(c){
 const r=c?.recipientEvidence,preview=safeRecipientObservation(r);
 return c?.checks?.classPage===true&&c.checks.gradeClass===true&&/^\d+$/.test(c.boardId||'')&&
  r?.known===true&&r.unfiltered===true&&r.empty===false&&preview.roleSelectionKnown&&
  typeof r.targetLabel==='string'&&!!r.targetLabel.trim();
}
async function runNonpublishingCheck({webContents:wc,target,canUse,inspectContext,readOriginals,confirm,
 signal,timeoutMs=60000,bridgeFactory=createObservedComposerBridge}={}){
 const steps={context:false,blankComposer:false,teacherConsent:false,title:false,body:false,upload:false,original:false,finalContext:false};
 const result={kind:'nonpublishing',steps,sendCount:0,scheduleCount:0,saveCount:0,identityVerified:false,authorityVerified:false,recipientsVerified:false};
 let stage='context',bridge,invalidated=false;
 const initialURL=wc?.getURL(),route=classRoute(initialURL);
 const allowed=()=>canUse?.()===true&&!invalidated&&!signal?.aborted&&wc&&!wc.isDestroyed()&&wc.getURL()===initialURL;
 const invalidate=()=>{invalidated=true;};
 const inPage=(_e,_url,main)=>{if(main)invalidate();};
 wc?.on?.('did-navigate',invalidate);wc?.on?.('did-navigate-in-page',inPage);wc?.on?.('render-process-gone',invalidate);wc?.on?.('destroyed',invalidate);
 const check=()=>{if(!allowed())throw Error('context-changed');};
 try{
  check();if(!route||!new URL(initialURL).pathname.endsWith('/boards/write/classnews'))throw Error('open-blank-composer');
  const context=await inspectContext(signal);check();
  if(!ordinaryContext(context)||context.boardId!==route.groupId)throw Error('context-unverified');
  if(context.publicationMode?.known!==true||context.publicationMode.mode!=='immediate')throw Error('date-unverified');
  steps.context=true;const key=observationKey(context);
  const checkContext=async()=>{check();const value=await inspectContext(signal);check();
   if(!ordinaryContext(value)||observationKey(value)!==key)throw Error('context-changed');return value;};
  const photo=syntheticPhoto(),photos=[{sha256:hash(photo.bytes),bytes:photo.bytes.length}],names=['01-'+photo.id];
  let expected={title:'',body:''},documentToken;
  bridge=bridgeFactory({getWebContents:()=>wc,
   authorize:({action})=>allowed()&&['inspect','read','attachments-read','title','body','files'].includes(action),
   domGuard:nonpublishingGuard,
   prepareProof:async({action})=>{const fresh=await checkContext();return {kind:'nonpublishing-input',action,operation:crypto.randomUUID(),
    issuedAt:Date.now(),expiresAt:Date.now()+15000,href:initialURL,boardId:route.groupId,documentToken,
    recipientLabel:fresh.recipientEvidence.targetLabel,expected:{...expected}};},stop:()=>true});
  const request={target,binding:{boardId:route.groupId},stillPermitted:allowed};
  stage='blank-composer';let fields=await bridge.readFields(request,signal);
  const blank=()=>fields.title===''&&fields.body===''&&fields.attachmentState?.listKnown===true&&!fields.attachmentState.uploading&&fields.attachmentState.names.length===0;
  if(!blank())throw Error('existing-content');documentToken=fields.revision.split(':')[0];steps.blankComposer=true;
  stage='teacher-consent';if(await confirm({context,note:NOTE,photos})!==true)throw Error('cancelled');check();steps.teacherConsent=true;
  fields=await bridge.readFields(request,signal);
  if(!blank()||fields.revision.split(':')[0]!==documentToken)throw Error('existing-content');
  stage='title';await bridge.writeTitle({...request,value:NOTE.title},signal);expected.title=NOTE.title;
  fields=await bridge.readFields(request,signal);if(fields.title!==expected.title||fields.body!=='')throw Error('content-unverified');steps.title=true;
  stage='body';await bridge.writeBodyText({...request,value:NOTE.body},signal);expected.body=NOTE.body;
  fields=await bridge.readFields(request,signal);if(fields.title!==NOTE.title||fields.body!==NOTE.body)throw Error('content-unverified');steps.body=true;
  stage='upload';await bridge.attachFiles({...request,value:[photo]},signal);
  const until=Date.now()+timeoutMs;let upload;
  do{check();upload=await bridge.readAttachmentState(request,signal);
   if(upload?.listKnown&&!upload.uploading&&JSON.stringify(upload.names)===JSON.stringify(names))break;
   await new Promise(r=>setTimeout(r,100));
  }while(Date.now()<until);
  if(!upload?.listKnown||upload.uploading||JSON.stringify(upload.names)!==JSON.stringify(names))throw Error('upload-unverified');steps.upload=true;
  stage='original';const proof=await readOriginals({...request,expectedNames:names,expectedPhotos:photos},signal);check();
  if(proof?.complete!==true||proof.items?.length!==1||proof.items[0].source!=='original-download'||
   proof.items[0].state!=='complete'||hash(proof.items[0].bytes)!==photos[0].sha256||proof.items[0].bytes.length!==photos[0].bytes)throw Error('upload-unverified');steps.original=true;
  stage='final-context';const finalContext=await checkContext();fields=await bridge.readFields(request,signal);
  if(fields.title!==NOTE.title||fields.body!==NOTE.body||JSON.stringify(fields.attachmentState?.names)!==JSON.stringify(names))throw Error('content-unverified');
  if(finalContext.publicationMode?.known!==true||finalContext.publicationMode.mode!=='immediate')throw Error('date-unverified');
  steps.finalContext=true;
  return {...result,status:'nonpublishing-verified',publicationMode:'immediate',photos,
   evidenceSources:{classId:'observed-service-route',gradeClass:'observed-class-label-and-app-settings',schoolYear:'teacher-confirmation',
    teacherIdentity:'teacher-confirmation-only',roleSelection:'observed-service-controls',officialServicePermission:'unconfirmed'},
   recipientCheck:safeRecipientObservation(finalContext.recipientEvidence)};
 }catch(error){
  const codes=['context-changed','open-blank-composer','context-unverified','existing-content','cancelled','content-unverified','upload-unverified','date-unverified','structure-unverified','permission-unverified'];
  return {...result,status:'blocked',stage,reason:codes.includes(error.message)?error.message:'preparation-unverified'};
 }finally{
  wc?.removeListener?.('did-navigate',invalidate);wc?.removeListener?.('did-navigate-in-page',inPage);wc?.removeListener?.('render-process-gone',invalidate);wc?.removeListener?.('destroyed',invalidate);
  await bridge?.close();
 }
}
module.exports={NOTE,syntheticPhoto,nonpublishingGuard,ordinaryContext,runNonpublishingCheck};
