'use strict';
// Concrete Electron composer + existing prepared transaction driver. Evidence
// providers are trusted main-process source code, NEVER renderer/settings data.
// Partial observed UI evidence is installed; unverified identity/date/upload/list
// coverage continues to fail closed behind the production permission gate.
const {createObservedComposerBridge}=require('./schoolbell-observed-composer.cjs');
const {createObservedPostBridge}=require('./schoolbell-observed-post.cjs');
const {hash}=require('./media-store.cjs');
const {createPreparedDriver}=require('./schoolbell-prepared-driver.cjs');
const {fail}=require('./schoolbell-driver-errors.cjs');
function requirePermission(permission,target,action){
 const p=permission?.();
 if(p?.official!==true||p.method!=='electron-ui'||!p.evidenceRef?.trim()||p.schoolId!==target.schoolId||
    p.classKey!==target.classKey||p.approvedTestClass!==true||!p.actions?.includes(action))fail('permission-unverified');
}
function createElectronDriver({target,getWebContents,permission=()=>null,evidence={},stop,tempRoot}={}){
 const actionOf=a=>({title:'input',body:'input',files:'attachments',commit:'submit'})[a]||'read';
 let binding=null,expectedNames=[],expectedPhotos=[],preparedText={title:null,body:null};
 const posts=createObservedPostBridge({getWebContents,tempRoot,authorize:()=>{
  requirePermission(permission,target,'read');return !!binding;
 }});
 async function read(method,signal,code,request={}){
  requirePermission(permission,target,'read');
  if(signal?.aborted)fail('driver-state');
  if(typeof evidence[method]!=='function')fail(code);
  const value=await evidence[method]({...request,webContents:getWebContents(),target,binding,note:request.note||preparedText},signal);
  if(signal?.aborted)fail('driver-state');
  requirePermission(permission,target,'read');return value;
 }
 const composer=createObservedComposerBridge({getWebContents,stop,domGuard:evidence.guardDOM,
  authorize:({action,target:requested,binding:expected})=>{
   requirePermission(permission,target,actionOf(action));
   if(requested&&JSON.stringify(requested)!==JSON.stringify(target))return false;
   return !expected||!!binding&&['boardId','contextId','actorKey'].every(k=>expected[k]===binding[k]);
  }});
 const request=()=>({target,binding});
 async function editor(method,r,signal){
  try{return await composer[method](r,signal);}
  catch(error){
   if(error?.name==='SchoolbellPreparationError')throw error;
   const code=({ 'structure-unverified':'structure-unverified','context-unverified':'context-unverified',
    'permission-unverified':'permission-unverified','site-unverified':'context-unverified','driver-state':'driver-state',
    'upload-unverified':'upload-unverified','publication-unverified':'publication-unverified'})[error?.message]||'content-unverified';
   fail(code);
  }
 }
 const bridge={
  async readContext(_r,s){const c=await read('readContext',s,'context-unverified');binding=c&&{boardId:c.boardId,contextId:c.contextId,actorKey:c.actorKey};return c;},
  readStructure:(_probe,s)=>composer.readStructure(null,s,request()),
  readDate:(_r,s)=>read('readDate',s,'date-unverified'),
  readBaseline:(r,s)=>read('readBaseline',s,'baseline-unverified',r),
  async readPublished(_r,s){
   if(typeof evidence.readPublished==='function')return read('readPublished',s,'publication-unverified');
   // Reuse the observed card and ordinary UI download controls once an approved
   // metadata provider has revisited the bound board and verified ID/date/scope.
   // Metadata alone is insufficient: independently verify the full body and files.
   const m=await read('readPublishedMetadata',s,'publication-unverified');
   if(m?.complete!==true||m.refreshed!==true||!preparedText.title||typeof preparedText.body!=='string')fail('publication-unverified');
   let proof;try{proof=await posts.readOriginals({boardURL:m.boardURL,postId:m.id,note:preparedText,photos:expectedPhotos},s);}
   catch{fail('publication-unverified');}
   return {complete:true,refreshed:true,posts:[{id:m.id,date:m.date,scope:m.scope,kind:'published',
    title:proof.fields.title,body:proof.fields.body,attachments:proof.attachments}]};
  },
  async readUploads(_r,s){
   const proof=await read('readUploads',s,'upload-unverified');
   const ui=await editor('readAttachmentState',request(),s);
   if(ui.listKnown!==true||ui.uploading||JSON.stringify(ui.names)!==JSON.stringify(expectedNames))fail('upload-unverified');
   // UI/file names alone are insufficient. Require the independent originals
   // provider; no provider is installed for the live service yet.
   return proof;
  },
  readContent:(_r,s)=>editor('readFields',request(),s),
  async openComposer(r,s){
   // The teacher can already have the observed composer open. No guessed entry selector.
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
  commitOnce:(r,s)=>{
   // Observing a send button does not establish its confirmation/scheduling semantics.
   if(evidence.finalAction!=='single-send'||typeof evidence.guardDOM!=='function')fail('publication-unverified');
   return editor('commitOnce',{...r,finalAction:evidence.finalAction},s);
  },
  async close(){const readStopped=posts.close(),stopped=await composer.close();return readStopped&&stopped&&(typeof evidence.close!=='function'||await evidence.close()===true);}
 };
 return createPreparedDriver({target,permission,bridge});
}
// Lazily creates one per-attempt driver. The publisher gate runs BEFORE this
// code opens a remote window. A missing official grant independently denies it.
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
