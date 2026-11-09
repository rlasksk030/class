'use strict';
// Electron bridge for the *observed* Schoolbell editor controls only.
// Not a publishing driver. There is deliberately no submit, file-upload,
// date, identity, permission or server-receipt implementation here.
// The production capability must remain disabled until separately reviewed.
const {probeComposer}=require('./schoolbell-ui-probe.cjs');
const HOSTS=new Set(['schoolbell-e.com','www.schoolbell-e.com','v4.schoolbell-e.com']);

function officialPage(url) {
 let parsed;
 try { parsed=new URL(url); } catch { return false; }
 return parsed.protocol==='https:' && HOSTS.has(parsed.hostname) &&
   !parsed.username && !parsed.password && !parsed.port;
}

// Executed in the authenticated page, not in Node. Every editor element must
// be unique. Values are never interpolated into executable source code.
function browserOperation(action, payload, inspect) {
 const info=inspect(document);
 if(info.structureMatched!==true || info.composerCount!==1 ||
   ['title','body','photos','send','saveDraft'].some(k=>info[k]?.count!==1))
   throw Error('structure-unverified');
 const root=document.querySelectorAll('app-boards-write')[0];
 const one=selector=>{
  const found=root.querySelectorAll(selector);
  if(found.length!==1)throw Error('structure-unverified');
  return found[0];
 };
 const title=one('input[placeholder="제목을 입력해 주세요."]');
 const body=one('div.fr-element.fr-view[contenteditable="true"]');
 const normalize=value=>String(value).replace(/\r\n?/g,'\n');
 const bodyText=()=>normalize(typeof body.innerText==='string'?body.innerText:body.textContent);
 if(action==='inspect')return info;
 if(action==='read')return {title:title.value,body:bodyText()};
 if(action!=='title' && action!=='body')throw Error('unimplemented-action');
 if(typeof payload?.value!=='string' || payload.value.length>100000)throw Error('invalid-payload');
 if(action==='title') {
   if(info.title.enabled!==true || payload.value.length>500)throw Error('title-unavailable');
   // Native setter accommodates frameworks that intercept input.value.
   const descriptor=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
   if(!descriptor?.set)throw Error('title-unavailable');
   title.focus();descriptor.set.call(title,payload.value);
   title.dispatchEvent(new Event('input',{bubbles:true}));
   title.dispatchEvent(new Event('change',{bubbles:true}));
   if(title.value!==payload.value)throw Error('title-mismatch');
 } else {
   if(info.body.enabled!==true)throw Error('body-unavailable');
   // Plain text only. Never inject HTML into an authenticated page.
   body.focus();body.innerText=payload.value;
   body.dispatchEvent(new Event('input',{bubbles:true}));
   body.dispatchEvent(new Event('change',{bubbles:true}));
   if(bodyText()!==normalize(payload.value))throw Error('body-mismatch');
 }
 return {matched:true};
}

function createObservedComposerBridge({getWebContents,authorize}={}) {
 const get=()=>{
   const wc=typeof getWebContents==='function'?getWebContents():null;
   if(!wc || (typeof wc.isDestroyed==='function' && wc.isDestroyed()) ||
       !officialPage(wc.getURL?.()) || typeof wc.executeJavaScript!=='function')
     throw Error('site-unverified');
   return wc;
 };
 async function verify(action,request,signal,wc) {
   const mutating=action==='title'||action==='body';
   if(signal?.aborted || typeof authorize!=='function' ||
      (mutating && request?.stillPermitted?.()!==true) ||
      await authorize({action,target:request?.target,binding:request?.binding,webContents:wc})!==true ||
      signal?.aborted || (mutating && request?.stillPermitted?.()!==true) || get()!==wc)
     throw Error('permission-unverified');
 }
 async function run(action,value,request,signal) {
   const wc=get();await verify(action,request,signal,wc);
   const script="("+browserOperation.toString()+")("+JSON.stringify(action)+","+JSON.stringify(value)+",("+probeComposer.toString()+"))";
   // executeJavaScript is not an arbitrary cross-site fetch. It only touches
   // the official page already opened by the teacher in the isolated partition.
   const result=await wc.executeJavaScript(script,false);
   if(signal?.aborted || get()!==wc || ((action==='title'||action==='body') && request?.stillPermitted?.()!==true))
     throw Error('context-changed');
   return result;
 }
 // An explicit authority decision is required even for reading an account page.
 return Object.freeze({
   readStructure:(_probe,signal,request)=>run('inspect',null,request,signal),
   readFields:(request,signal)=>run('read',null,request,signal),
   writeTitle:(request,signal)=>run('title',{value:request?.value},request,signal),
   writeBodyText:(request,signal)=>run('body',{value:request?.value},request,signal)
 });
}
module.exports={createObservedComposerBridge,officialPage,browserOperation};
