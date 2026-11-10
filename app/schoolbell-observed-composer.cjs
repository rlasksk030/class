'use strict';
// Only the composer selectors observed on 2026-11-09. Unknown service evidence
// (identity/date/upload receipt/final confirmation) is deliberately not inferred.
const {probeComposer,probeAttachments}=require('./schoolbell-ui-probe.cjs');
const {readEditorText}=require('./schoolbell-editor-text.cjs');
const {readPublicationMode}=require('./schoolbell-publication-mode.cjs');
const {inspectSendTarget,armSend,focusForSend,waitForSendTarget,deliverSend}=require('./schoolbell-send-input.cjs');
const {validateRef,MAX_FILE,MAX_LIBRARY,hash,dimensions}=require('./media-store.cjs');
const HOSTS=new Set(['schoolbell-e.com','www.schoolbell-e.com','v4.schoolbell-e.com']);
const WORLD=17481; // Isolated from site JS; shared DOM, no credentials or framework internals.
function officialPage(url) {
 let parsed;try{parsed=new URL(url);}catch{return false;}
 return parsed.protocol==='https:'&&HOSTS.has(parsed.hostname)&&!parsed.username&&!parsed.password&&!parsed.port;
}
// Self-contained DOM operation. The trusted, separately reviewed guard must read
// current DOM evidence synchronously, including binding/date/uploads for commit.
function browserOperation(action,payload,inspect,guard,readText,readAttachments,readMode,armNative,inspectNative) {
 const info=inspect(document);
 if(info.structureMatched!==true||info.composerCount!==1||
    ['title','body','photos','send','saveDraft'].some(k=>info[k]?.count!==1))throw Error('structure-unverified');
 const root=document.querySelectorAll('app-boards-write')[0];
 const one=s=>{const nodes=root.querySelectorAll(s);if(nodes.length!==1)throw Error('structure-unverified');return nodes[0];};
 const title=one('input[placeholder="제목을 입력해 주세요."]'),body=one('div.fr-element.fr-view[contenteditable="true"]');
 const file=one('input[type="file"]');
 const normalize=v=>String(v).replace(/\r\n?/g,'\n');
 const bodyText=()=>readText(body);
 // Opening read-only dropdowns/previews is not an edit. Still invalidate for
 // all title/body/file/target mutations, native input/change events, and a
 // replaced document. The final guard separately checks current publish mode.
 const editSelector='input[placeholder="제목을 입력해 주세요."],div.fr-element.fr-view[contenteditable="true"],input[type="file"],app-letter-write-file-list,app-letter-simplified-target-text';
 const editNode=node=>{const e=node?.nodeType===3?node.parentElement:node;return !!e?.closest?.(editSelector);};
 const edits=records=>records.some(r=>editNode(r.target)||
  [...(r.addedNodes||[]),...(r.removedNodes||[])].some(n=>editNode(n)||!!n.querySelector?.(editSelector)));
 // This state lives only in the isolated world. It never contains draft text,
 // account identifiers or authentication state, and is not persisted.
 const states=globalThis.__classroomSchoolbellStates||(globalThis.__classroomSchoolbellStates=new WeakMap());
 let state=states.get(root);
 if(!state){
  state={documentToken:crypto.randomUUID(),revision:0,composing:false,submitted:false};states.set(root,state);
  root.addEventListener('compositionstart',()=>{state.composing=true;},true);
  root.addEventListener('compositionend',()=>{state.composing=false;state.revision++;},true);
  for(const name of ['input','change'])root.addEventListener(name,()=>state.revision++,true);
  state.observer=new MutationObserver(records=>{if(edits(records))state.revision++;});
  state.observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true});
 }
 const revision=()=>{if(edits(state.observer.takeRecords()))state.revision++;return state.documentToken+':'+state.revision;};
 const fields=()=>({title:title.value,body:bodyText(),revision:revision()});
 const guarded=()=>{
  const check={...payload,action,...(action==='commit'?{attachmentState:readAttachments(document)}:{})};
  if(typeof guard==='function'&&guard(document,check,readMode)===true)return true;
  const error=Error('context-unverified');error.guardFailure=check.guardFailure;throw error;
 };
 if(action==='inspect')return info;
 if(action==='read'){
  const {point,...sendTarget}=inspectNative(document,one('button.btn-with-description'));
  return {...fields(),sendTarget};
 }
 if(action==='attachments-read')return readAttachments(document);
 if(action==='focus-title'||action==='focus-body'){
  if(state.composing)throw Error('composition-active');
  const element=action==='focus-title'?title:body;element.focus();
  if(document.activeElement!==element)throw Error('context-unverified');
  return {focused:true};
 }
 if(!['title','body','files','commit'].includes(action))throw Error('unimplemented-action');
 if(state.composing)throw Error('composition-active');
 if(!guarded())throw Error('context-unverified');
 if(action==='title'||action==='body'){
  if(typeof payload?.value!=='string'||payload.value.length>100000)throw Error('invalid-payload');
 }
 if(action==='title'){
  if(info.title.enabled!==true||title.readOnly||payload.value.length>500)throw Error('title-unavailable');
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
  if(!setter)throw Error('title-unavailable');
  title.focus();if(!guarded())throw Error('context-unverified');setter.call(title,payload.value);
  title.dispatchEvent(new Event('input',{bubbles:true}));title.dispatchEvent(new Event('change',{bubbles:true}));
  if(title.value!==payload.value)throw Error('content-unverified');
 }else if(action==='body'){
  if(info.body.enabled!==true||!body.isContentEditable)throw Error('body-unavailable');
  // Native Chromium editing in one DOM task: framework input listeners receive
  // the edit. No innerHTML, innerText assignment, paste HTML, or private Froala API.
  body.focus();if(!guarded())throw Error('context-unverified');const selection=document.getSelection(),range=document.createRange();
  range.selectNodeContents(body);selection.removeAllRanges();selection.addRange(range);
  const value=normalize(payload.value);
  if(bodyText()){
   if(!document.execCommand('delete',false))throw Error('body-unavailable');
   // A whole-editor deletion may leave an empty caret line. Start the new
   // replacement at an actually empty DOM, never append to that placeholder.
   if(['','\n'].includes(bodyText())&&['','\n'].includes(body.textContent)){
    body.replaceChildren();range.selectNodeContents(body);selection.removeAllRanges();selection.addRange(range);
    body.dispatchEvent(new Event('input',{bubbles:true}));
   }
  }
  // Chromium's multiline insertText can create empty DIVs whose innerText adds
  // an extra blank line. Native line-break commands retain the exact plain text.
  const lines=value.split('\n');
  for(let i=0;i<lines.length;i++){
   if(state.composing||document.querySelectorAll('app-boards-write')[0]!==root||!guarded())throw Error('context-unverified');
   if(i&&!document.execCommand('insertLineBreak',false))throw Error('body-unavailable');
   if(lines[i]&&!document.execCommand('insertText',false,lines[i]))throw Error('body-unavailable');
  }
  // Native editing keeps a terminal BR/newline as a caret placeholder. Remove only
  // that proven extra character, never trim or normalize the user's whitespace.
  if(bodyText()===value+'\n'){
   let last=body.lastChild;while(last?.nodeType===1&&last.nodeName!=='BR'&&last.lastChild)last=last.lastChild;
   if(last?.nodeName==='BR')last.remove();
   else if(last?.nodeType===3&&last.data.endsWith('\n'))last.deleteData(last.length-1,1);
   body.dispatchEvent(new Event('input',{bubbles:true}));
  }
  body.dispatchEvent(new Event('change',{bubbles:true}));
  if(bodyText()!==value)throw Error('content-unverified');
 }else if(action==='files'){
  if(info.photos.enabled!==true||(!info.photos.multiple&&payload.files.length>1)||file.files.length)throw Error('upload-unverified');
  const transfer=new DataTransfer();
  payload.files.forEach((f,i)=>{
   const binary=atob(f.base64),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
   transfer.items.add(new File([bytes],String(i+1).padStart(2,'0')+'-'+f.id,{type:f.type}));
  });
  file.files=transfer.files;
  if(file.files.length!==payload.files.length||[...file.files].some((f,i)=>f.size!==payload.files[i].size))throw Error('upload-unverified');
  file.dispatchEvent(new Event('input',{bubbles:true}));file.dispatchEvent(new Event('change',{bubbles:true}));
  // FileList assignment only. Upload completion is ALWAYS checked independently.
  return {selected:payload.files.length,attachmentsVerified:false};
 }else{
  const current=fields();
  if(state.submitted||info.send.enabled!==true||payload.finalAction!=='single-send'||
     current.revision!==payload.revision||current.title!==payload.note.title||current.body!==normalize(payload.note.body))throw Error('content-unverified');
  const send=one('button.btn-with-description');
  if(!send.getClientRects().length||send.disabled||send.matches(':disabled')||send.getAttribute('aria-disabled')==='true')throw Error('publication-unverified');
  // Consume before arming. The native event must still hit this exact element
  // and pass the same whole-content guard; a DOM click is never a fallback.
  state.submitted=true;
  return armNative(document,send,state,()=>{
   const latest=fields();
   return !state.composing&&document.querySelectorAll('app-boards-write')[0]===root&&
    latest.revision===payload.revision&&latest.title===payload.note.title&&latest.body===normalize(payload.note.body)&&guarded();
  },inspectNative);
 }
 return {matched:true};
}
function encodeFiles(files){
 if(!Array.isArray(files)||!files.length||files.length>20)throw Error('upload-unverified');
 let total=0;
 return files.map(f=>{
  const id=validateRef(f),bytes=Buffer.from(f.bytes||[]);total+=bytes.length;
  if(!bytes.length||bytes.length>MAX_FILE||total>MAX_LIBRARY||hash(bytes)!==id.split('.')[0]||dimensions(bytes).ext!==id.split('.')[1])throw Error('upload-unverified');
  return {id,size:bytes.length,type:id.endsWith('.png')?'image/png':'image/jpeg',base64:bytes.toString('base64')};
 });
}
function createObservedComposerBridge({getWebContents,authorize,domGuard,prepareProof,stop,diagnostic}={}) {
 let closed=false,active=false;const jobs=new Set();
 const get=()=>{
  const wc=getWebContents?.();
  if(closed||!wc||wc.isDestroyed()||!officialPage(wc.getURL())||typeof wc.executeJavaScriptInIsolatedWorld!=='function')throw Error('site-unverified');
  return wc;
 };
 const mutating=action=>['focus-title','focus-body','title','body','files','commit'].includes(action);
 async function verify(action,request,signal,wc,url,submitted=false){
  if(closed||signal?.aborted||typeof authorize!=='function'||(mutating(action)&&request?.stillPermitted?.()!==true)||
     await authorize({action,target:request?.target,binding:request?.binding,webContents:wc})!==true||closed||signal?.aborted||
     (mutating(action)&&request?.stillPermitted?.()!==true)||get()!==wc||(!submitted&&wc.getURL()!==url))throw Error('permission-unverified');
 }
 async function perform(action,value,request,signal){
  const wc=get(),url=wc.getURL();await verify(action,request,signal,wc,url);
  const focused=action==='commit'?await focusForSend(wc,diagnostic):null;
  if(action==='commit')await waitForSendTarget(wc,{diagnostic,permitted:async()=>{await verify(action,request,signal,wc,url);return focused();}});
  const payload={...value,target:request?.target,binding:request?.binding};
  if(['title','body','files','commit'].includes(action)&&typeof prepareProof==='function'){
   payload.proof=await prepareProof({action,request,href:url},signal);
   await verify(action,request,signal,wc,url);
  }
  const operation='('+browserOperation.toString()+')('+JSON.stringify(action)+','+JSON.stringify(payload)+',('+probeComposer.toString()+'),'+(typeof domGuard==='function'?'('+domGuard.toString()+')':'null')+',('+readEditorText.toString()+'),('+probeAttachments.toString()+'),('+readPublicationMode.toString()+'),('+armSend.toString()+'),('+inspectSendTarget.toString()+'))';
  // Electron otherwise replaces renderer exceptions with an opaque error. Return
  // a fixed code only: never a site exception, account text, or photo payload.
  const script='(()=>{try{return {ok:true,value:'+operation+'};}catch(e){return {ok:false,code:'+JSON.stringify([
   'structure-unverified','unimplemented-action','composition-active','context-unverified','invalid-payload',
   'title-unavailable','body-unavailable','content-unverified','upload-unverified','publication-unverified'])+'.includes(e.message)?e.message:"content-unverified",nativeFailure:'+JSON.stringify(['already-armed','geometry','disabled','occluded','validation'])+'.includes(e.nativeFailure)?e.nativeFailure:null,guardFailure:'+JSON.stringify(['proof','route','composer','recipient-label','overlay','preview-overlay','audience-overlay','mode-reader','mode','attachments'])+'.includes(e.guardFailure)?e.guardFailure:null};}})()';
  const result=await wc.executeJavaScriptInIsolatedWorld(WORLD,[{code:script}],false);
  if(action==='commit'&&result?.ok===true){
   result.value=await deliverSend(wc,result.value,{focused,diagnostic,
    permitted:async()=>{await verify(action,request,signal,wc,url);return true;},
    readResult:token=>wc.executeJavaScriptInIsolatedWorld(WORLD,[{code:'(()=>{const a=globalThis.__classroomSchoolbellLastSend;return a?.token==='+JSON.stringify(token)+'?{clicked:a.clicked,blocked:a.blocked,reason:a.reason,events:a.events}:null;})()'}])});
  }
  // A successful single-click acknowledgement may already have navigated to a
  // different official board. Preserve the same window/grant checks and let the
  // separate readback verify the original binding; never send again.
  await verify(action,request,signal,wc,url,action==='commit'&&result?.ok===true&&result.value?.clicked===true);
  if(result?.ok!==true){const error=Error(result?.code||'content-unverified');error.guardFailure=result?.guardFailure;error.nativeFailure=result?.nativeFailure;throw error;}return result.value;
 }
 function run(action,value,request,signal){
  // Reject overlapping jobs instead of queuing stale class/content mutations.
  if(active||closed)return Promise.reject(Error('driver-state'));
  active=true;const job=perform(action,value,request,signal).finally(()=>{active=false;jobs.delete(job);});jobs.add(job);return job;
 }
 return Object.freeze({
  readStructure:(_probe,signal,request)=>run('inspect',null,request,signal),
  readFields:(request,signal)=>run('read',null,request,signal),
  readAttachmentState:(request,signal)=>run('attachments-read',null,request,signal),
  focusTitle:(r,s)=>run('focus-title',null,r,s),
  focusBody:(r,s)=>run('focus-body',null,r,s),
  writeTitle:(r,s)=>run('title',{value:r?.value},r,s),
  writeBodyText:(r,s)=>run('body',{value:r?.value},r,s),
  attachFiles:async(r,s)=>run('files',{files:encodeFiles(r?.value)},r,s),
  commitOnce:(r,s)=>run('commit',{revision:r?.revision,note:r?.note,photos:r?.photos,finalAction:r?.finalAction},r,s),
  async close(){closed=true;const stopped=await stop?.();await Promise.allSettled([...jobs]);return stopped===undefined?jobs.size===0:stopped===true;}
 });
}
module.exports={createObservedComposerBridge,officialPage,browserOperation,encodeFiles};
