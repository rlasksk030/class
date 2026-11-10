'use strict';
// Concrete Electron composer + existing prepared transaction driver. Evidence
// providers are trusted main-process source code, NEVER renderer/settings data.
// Observed UI evidence and registered main-process class permission are required.
// Teacher confirmation never becomes service identity or official permission.
const {createObservedComposerBridge,commitCodes}=require('./schoolbell-observed-composer.cjs');
const {createObservedPostBridge}=require('./schoolbell-observed-post.cjs');
const {hash}=require('./media-store.cjs');
const {createPreparedDriver}=require('./schoolbell-prepared-driver.cjs');
const {fail}=require('./schoolbell-driver-errors.cjs');
const {makeGuardProof,finalDOMGuard}=require('./schoolbell-final-guard.cjs');
const {audienceVerified}=require('./schoolbell-audience.cjs');
const trial=require('./schoolbell-test-authorization.cjs');
function requirePermission(permission,target,action){
 const p=permission?.();
 if(trial.validTestGrant(p,target,action)||require('./schoolbell-operating-authorization.cjs').validGrant(p,target,action))return;
 if(p?.official!==true||p.method!=='electron-ui'||!p.evidenceRef?.trim()||p.schoolId!==target.schoolId||
    p.classKey!==target.classKey||p.approvedTestClass!==true||!p.actions?.includes(action))fail('permission-unverified');
}
function createElectronDriver({target,getWebContents,permission=()=>null,evidence={},stop,tempRoot}={}){
 const actionOf=a=>({'focus-title':'input','focus-body':'input',title:'input',body:'input',files:'attachments',commit:'submit'})[a]||'read';
 let binding=null,expectedNames=[],expectedPhotos=[],preparedText={title:null,body:null};
 let transactionNote=null,lastContext=null,lastDate=null,lastUploads=null;
 let watched=null,documentEpoch=0;
 const invalidate=()=>{documentEpoch++;lastContext=null;lastDate=null;lastUploads=null;};
 const navigation=(_event,_url,_inPlace,mainFrame)=>{if(mainFrame)invalidate();};
 function unwatch(){if(watched?.removeListener){watched.removeListener('did-start-navigation',navigation);watched.removeListener('render-process-gone',invalidate);watched.removeListener('destroyed',invalidate);}watched=null;}
 function watch(wc){if(watched!==wc){unwatch();invalidate();watched=wc;
  wc?.on?.('did-start-navigation',navigation);wc?.on?.('render-process-gone',invalidate);wc?.on?.('destroyed',invalidate);
 }return documentEpoch;}
 const posts=createObservedPostBridge({getWebContents,tempRoot,authorize:()=>{
  requirePermission(permission,target,'read');return !!binding;
 }});
 async function read(method,signal,code,request={}){
  requirePermission(permission,target,'read');
  if(signal?.aborted)fail('driver-state');
  if(typeof evidence[method]!=='function')fail(code);
  const wc=getWebContents(),epoch=watch(wc);
  evidence.diagnostic?.({step:'evidence-read',method,state:'started'});
  let value;
  try{value=await evidence[method]({...request,webContents:wc,target,binding,note:request.note||preparedText,stillPermitted:()=>{try{requirePermission(permission,target,'read');return !signal?.aborted;}catch{return false;}}},signal);}
  catch(error){evidence.diagnostic?.({step:'evidence-read',method,state:'failed',reason:'provider',aborted:!!signal?.aborted});if(error?.name==='SchoolbellPreparationError')throw error;
   const known=['permission-unverified','context-unverified','baseline-unverified','date-unverified','upload-unverified','publication-unverified'];
   fail(known.includes(error?.message)?error.message:code);
  }
  if(getWebContents()!==wc||(['readContext','readDate','readUploads','readBaseline'].includes(method)&&epoch!==documentEpoch)){
   evidence.diagnostic?.({step:'evidence-read',method,state:'failed',reason:'document-changed',windowChanged:getWebContents()!==wc,epochChanged:epoch!==documentEpoch});fail('context-unverified');
  }
  if(signal?.aborted)fail('driver-state');
  requirePermission(permission,target,'read');return value;
 }
 const normalize=value=>String(value).replace(/\r\n?/g,'\n');
 const audience=c=>JSON.stringify([c.students,c.parents,c.externalNotifications,c.recipientEvidence||null,
  c.notificationEvidence?.kind||null,c.notificationEvidence?.actorKey||null,c.notificationEvidence?.otherTargets??null]);
 // One read-only refresh before arming, never an attempted send or retry.
 // Re-download originals and rebind only cosmetic class/style revision changes.
 async function refreshCommit({request:r,readCurrent},signal){
  const oldContext=lastContext,wc=getWebContents(),epoch=watch(wc);
  if(!oldContext||!trial.sameBinding(oldContext,r.binding))fail('context-unverified');
  const currentContext=await read('readContext',signal,'context-unverified');
  if(!trial.sameBinding(currentContext,r.binding)||audience(currentContext)!==audience(oldContext)||
     !audienceVerified(currentContext,permission()))fail('context-unverified');
  const uploaded=await read('readUploads',signal,'upload-unverified',{expectedNames,expectedPhotos});
  if(uploaded?.complete!==true||!Array.isArray(uploaded.items))fail('upload-unverified');
  const photos=uploaded.items.map(item=>{
   if(item.state!=='complete'||item.source!=='original-download'||!(Buffer.isBuffer(item.bytes)||item.bytes instanceof Uint8Array)||!item.bytes.length)fail('upload-unverified');
   return {sha256:hash(item.bytes),bytes:item.bytes.length};
  });
  if(JSON.stringify(photos)!==JSON.stringify(expectedPhotos)||JSON.stringify(r.photos)!==JSON.stringify(expectedPhotos))fail('upload-unverified');
  const date=await read('readDate',signal,'date-unverified');
  const current=await readCurrent();
  if(getWebContents()!==wc||epoch!==documentEpoch||!trial.sameBinding(binding,r.binding))fail('context-unverified');
  if(!Number.isSafeInteger(r.semanticRevision)||current.semanticRevision!==r.semanticRevision||
     current.revision?.split(':')[0]!==r.revision?.split(':')[0])fail('commit-semantic-change');
  if(current.title!==r.note.title)fail('commit-title-mismatch');
  if(current.body!==normalize(r.note.body))fail('commit-body-mismatch');
  if(current.attachmentState?.listKnown!==true||current.attachmentState.uploading||
     JSON.stringify(current.attachmentState.names)!==JSON.stringify(expectedNames))fail('upload-unverified');
  lastContext=structuredClone(currentContext);lastDate=structuredClone(date);
  lastUploads={...uploaded,binding:structuredClone(binding),revision:current.revision,observedAt:Date.now()};
  evidence.diagnostic?.({step:'commit-revalidation',contextMatches:true,audienceMatches:true,originalsMatch:true,titleMatches:true,bodyMatches:true,semanticRevisionMatches:true});
  return current;
 }
 const composer=createObservedComposerBridge({getWebContents,stop,diagnostic:evidence.diagnostic,refreshCommit,domGuard:evidence.guardDOM||finalDOMGuard,
  prepareFinalState:evidence.publicationMode==='immediate'?async(_r,signal)=>{lastDate=structuredClone(await read('readDate',signal,'date-unverified'));}:undefined,
  prepareProof:typeof evidence.guardDOM==='function'?undefined:({action,request,href})=>makeGuardProof({
   action,target,binding,note:transactionNote,context:lastContext,date:lastDate,uploads:lastUploads,
   expectedNames,expectedPhotos,href,revision:request?.revision,permission:permission()}),
  authorize:({action,target:requested,binding:expected})=>{
   requirePermission(permission,target,actionOf(action));
   if(['focus-title','focus-body','title','body','files','commit'].includes(action)&&typeof evidence.guardDOM!=='function'&&
      (!lastContext||!audienceVerified(lastContext,permission())))return false;
   if(requested&&JSON.stringify(requested)!==JSON.stringify(target))return false;
   return !expected||trial.sameBinding(binding,expected);
  }});
 const request=()=>({target,binding});
 async function editor(method,r,signal){
  evidence.diagnostic?.({step:method,state:'started'});
  try{
   // The actual service closes the mode menu when an input gains focus.
   // Focus first, then reread the native checked radio; the atomic guard stays
   // mandatory during every edit. No assumed mode or stale dropdown fallback.
   if(evidence.publicationMode==='immediate'&&['writeTitle','writeBodyText'].includes(method))
    await composer[method==='writeTitle'?'focusTitle':'focusBody'](r,signal);
   // Audience inspection may close the send dropdown. Reopen/read the actual
   // choice immediately before each guarded mutation, so the atomic DOM guard
   // can inspect native checked state in the same task as that mutation.
   if(evidence.publicationMode==='immediate'&&['writeTitle','writeBodyText','attachFiles','commitOnce','checkCommit'].includes(method)){
    const trace=async stage=>{if(!['commitOnce','checkCommit'].includes(method))return;const c=await composer.compareCommit(r,signal);evidence.diagnostic?.({step:'commit-comparison',stage,...c.checks,changes:c.changes,...(c.failure?{reason:c.failure}:{})});};
    await trace('before-readDate');lastDate=structuredClone(await read('readDate',signal,'date-unverified'));await trace('after-readDate');
   }
   const result=await composer[method](r,signal);
   evidence.diagnostic?.({step:method,state:'complete',...(method==='readFields'?{sendTarget:result.sendTarget}:{})});return result;
  }
  catch(error){
   evidence.diagnostic?.({step:method,state:'failed',guardFailure:error.guardFailure||null,nativeFailure:error.nativeFailure||null,proofFailure:error.stack?.includes('makeGuardProof')===true,...(commitCodes.includes(error.message)||commitCodes.includes(error.code)?{comparisonFailure:error.code||error.message}:{}),...(error.commitChecks?{comparisons:error.commitChecks}:{})});
   if(error?.name==='SchoolbellPreparationError')throw error;
   const code=commitCodes.includes(error?.message)?error.message:({ 'structure-unverified':'structure-unverified','context-unverified':'context-unverified',
    'permission-unverified':'permission-unverified','site-unverified':'context-unverified','driver-state':'driver-state','date-unverified':'date-unverified',
    'upload-unverified':'upload-unverified','publication-unverified':'publication-unverified','content-unverified':'content-unverified'})[error?.message]||'renderer-unclassified';
   fail(code);
  }
 }
 const bridge={
  async readContext(_r,s){lastContext=null;const c=await read('readContext',s,'context-unverified');lastContext=structuredClone(c);binding=c&&trial.bindingOf(c);return c;},
  readStructure:(_probe,s)=>composer.readStructure(null,s,request()),
  async readDate(_r,s){lastDate=null;const value=await read('readDate',s,'date-unverified');lastDate=structuredClone(value);return value;},
  async readBaseline(r,s){transactionNote=structuredClone(r.note);return read('readBaseline',s,'baseline-unverified',r);},
  async readPublished(_r,s){
   if(typeof evidence.readPublished==='function')return read('readPublished',s,'publication-unverified');
   // Reuse the observed card and ordinary UI download controls once an approved
   // metadata provider has revisited the bound board and verified ID/date/scope.
   // Metadata alone is insufficient: independently verify the full body and files.
   const m=await read('readPublishedMetadata',s,'publication-unverified');
   if(m?.complete!==true||m.refreshed!==true||!preparedText.title||typeof preparedText.body!=='string')fail('publication-unverified');
   let proof;try{proof=await posts.readOriginals({boardURL:m.boardURL,postId:m.id,note:preparedText,photos:expectedPhotos},s);}
   catch{fail('publication-unverified');}
   return {complete:true,refreshed:true,posts:[{id:m.id,date:m.date,dateSource:m.dateSource,scope:m.scope,kind:'published',
    title:proof.fields.title,body:proof.fields.body,attachments:proof.attachments}]};
  },
  async readUploads(_r,s){
   lastUploads=null;
   const proof=await read('readUploads',s,'upload-unverified',{expectedNames,expectedPhotos});
   const ui=await editor('readAttachmentState',request(),s);
   if(ui.listKnown!==true||ui.uploading||JSON.stringify(ui.names)!==JSON.stringify(expectedNames))fail('upload-unverified');
   const fields=await editor('readFields',request(),s);
   lastUploads={...proof,binding:structuredClone(binding),revision:fields.revision,observedAt:Date.now()};
   // UI/file names alone are insufficient. The connected original-file provider
   // must succeed independently; its live app execution is still unverified.
   return proof;
  },
  readContent:(_r,s)=>editor('readFields',request(),s),
  async openComposer(r,s){
   // Reuse an open composer or enter through the observed class-list button.
   if(typeof evidence.openComposer==='function')await evidence.openComposer({...r,webContents:getWebContents()},s);
   return composer.readStructure(null,s,request());
  },
  async writeDate(r,s){
   if(typeof evidence.writeDate!=='function')fail('date-unverified');
   return evidence.writeDate({...r,webContents:getWebContents()},s);
  },
  async writeTitle(r,s){const result=await editor('writeTitle',r,s);preparedText.title=r.value;return result;},
  async writeBodyText(r,s){const result=await editor('writeBodyText',r,s);preparedText.body=r.value;return result;},
  async attachFiles(r,s){
   const result=await editor('attachFiles',r,s);
   expectedNames=r.value.map((f,i)=>String(i+1).padStart(2,'0')+'-'+f.id);
   expectedPhotos=r.value.map(f=>({sha256:hash(f.bytes),bytes:f.bytes.length}));return result;
  },
  checkCommit:(r,s)=>editor('checkCommit',{...r,finalAction:evidence.finalAction},s),
  commitOnce:(r,s)=>{
   // Observing a send button does not establish its confirmation/scheduling semantics.
   if(evidence.finalAction!=='single-send')fail('publication-unverified');
   return editor('commitOnce',{...r,finalAction:evidence.finalAction},s);
  },
  async close(){try{const readStopped=posts.close(),stopped=await composer.close();return readStopped&&stopped&&(typeof evidence.close!=='function'||await evidence.close()===true);}finally{unwatch();invalidate();}}
 };
 return createPreparedDriver({target,permission,bridge,publicationMode:evidence.publicationMode||'fixed',diagnostic:evidence.diagnostic});
}
// Lazily creates one per-attempt driver. The publisher gate runs BEFORE this
// code opens a remote window. Missing production/test permission independently denies it.
function createRuntimeDriver({profile,openClass,closeClass,permission=()=>null,evidenceFactory}={}){
 let driver=null,openingKey=null;
 const methods=['snapshot','openComposer','fill','attach','readComposer','submit','readPublished'];
 const wrapper={
  async inspect(expected,signal){
   if(!driver){
    const [year,grade,classroom]=String(expected.classKey).split(':');
    const target={schoolId:profile.id,schoolName:profile.config.active?.school.SCHUL_NM||require('./school.js').legacy.SCHUL_NM,
     year,grade,classroom,classKey:expected.classKey};
    requirePermission(permission,target,'read');
    if(signal?.aborted)fail('driver-state');
    openingKey=expected.classKey;
    const win=await openClass(expected.classKey);
    if(signal?.aborted){await closeClass(expected.classKey);fail('driver-state');}
    requirePermission(permission,target,'read');
    driver=createElectronDriver({target,permission,tempRoot:profile.dir,getWebContents:()=>win.isDestroyed()?null:win.webContents,
     evidence:typeof evidenceFactory==='function'?evidenceFactory(target,win):{},stop:()=>closeClass(expected.classKey)});
   }
   return driver.inspect(expected,signal);
  },
  async close(){if(!driver){if(openingKey!==null){const key=openingKey;openingKey=null;return await closeClass(key)===true;}return true;}
   const stopped=await driver.close();if(stopped===true){driver=null;openingKey=null;}return stopped;}
 };
 for(const name of methods)wrapper[name]=(...args)=>{if(!driver)fail('driver-state');return driver[name](...args);};
 return wrapper;
}
module.exports={createElectronDriver,createRuntimeDriver,requirePermission};
