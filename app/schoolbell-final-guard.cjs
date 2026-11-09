'use strict';
// Main-process evidence -> a single composer operation. This is not a source
// of identity/date/permission facts. Missing live providers still prevent input.
const {hash}=require('./media-store.cjs');
const {officialPage}=require('./schoolbell-observed-composer.cjs');
const {audienceVerified}=require('./schoolbell-audience.cjs');
const {immediateEvidence}=require('./schoolbell-date-policy.cjs');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const isoDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&
 Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
function fresh(value,now){return Number.isFinite(value)&&value<=now&&now-value<=15000;}
function sameScope(c,target,binding){
 return c&&['schoolId','schoolName','year','grade','classroom','classKey'].every(k=>c[k]===target[k])&&
  ['boardId','contextId','actorKey'].every(k=>typeof binding?.[k]==='string'&&binding[k]&&c[k]===binding[k]);
}
// Fixed-date integrations retain their old contract. Observed immediate mode
// has no pre-send server date; keep the draft date separate and verify the
// actual date from the new post after sending. No clock/title fallback.
function publicationDate(evidence,{target,binding,note,now=Date.now()}){
 if(immediateEvidence(evidence)){
  if(!isoDate(note?.date)||!fresh(evidence.observedAt,now)||!sameScope(evidence.scope,target,binding))throw Error('date-unverified');
  return null;
 }
 if(evidence?.verified!==true||evidence.source!=='observed-service-ui'||
    evidence.meaning!=='publication-calendar-date'||!isoDate(evidence.value)||
    evidence.value!==note?.date||!fresh(evidence.observedAt,now)||
    !sameScope(evidence.scope,target,binding))throw Error('date-unverified');
 return evidence.value;
}
function makeGuardProof({action,target,binding,note,context,date,uploads,expectedNames,expectedPhotos,href,revision,permission,now=Date.now()}){
 if(!sameScope(context,target,binding)||!fresh(context.observedAt,now)||
    context.identityVerified!==true||context.authorityVerified!==true||context.authenticated!==true||
    context.teacher!==true||context.classApproved!==true||context.testClassApproved!==true||
    context.service!=='schoolbell'||context.scopeType!=='class'||context.board!=='diary'||
    !audienceVerified(context,permission,now)||!officialPage(href))throw Error('context-unverified');
 const recipients=context.recipientEvidence;
 if(recipients?.known!==true||recipients.unfiltered!==true||recipients.empty!==true||
    typeof recipients.targetLabel!=='string'||!recipients.targetLabel.trim())throw Error('context-unverified');
 const value=publicationDate(date,{target,binding,note,now});
 let photos=[];
 if(action==='commit'){
  if(uploads?.complete!==true||!fresh(uploads.observedAt,now)||uploads.revision!==revision||
     !same(uploads.binding,binding)||!Array.isArray(uploads.items))throw Error('upload-unverified');
  photos=uploads.items.map(item=>{
   if(item?.state!=='complete'||item.source!=='original-download'||!(Buffer.isBuffer(item.bytes)||item.bytes instanceof Uint8Array)||!item.bytes.length)throw Error('upload-unverified');
   return {sha256:hash(item.bytes),bytes:item.bytes.length};
  });
  if(!same(photos,expectedPhotos)||photos.length!==expectedNames.length)throw Error('upload-unverified');
 }
 return {schema:1,action,href,issuedAt:now,expiresAt:Math.min(now+15000,context.observedAt+15000,date.observedAt+15000,
  action==='commit'?uploads.observedAt+15000:Infinity,
  recipients.mandatoryAdministrator?context.notificationEvidence.observedAt+15000:Infinity),
  target:structuredClone(target),binding:structuredClone(binding),date:value,
  ...(immediateEvidence(date)?{publicationMode:'immediate',draftDate:note.date}:{}),
  recipientLabel:recipients.targetLabel,revision:action==='commit'?revision:null,
  names:action==='commit'?[...expectedNames]:[],photos};
}
// Self-contained, serialized only into Electron's isolated world. There are no
// synthetic identity attributes or inferred school/year/date selectors here.
function finalDOMGuard(document,payload,readMode){
 const p=payload.proof,same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),now=Date.now();
 if(p?.schema!==1||p.action!==payload.action||!Number.isFinite(p.issuedAt)||!Number.isFinite(p.expiresAt)||
    now<p.issuedAt||now>=p.expiresAt||!same(p.target,payload.target)||!same(p.binding,payload.binding)||
    document.location.href!==p.href)return false;
 const u=new URL(document.location.href),m=u.pathname.match(/^\/ko\/main\/group\/(\d+)\/boards\/write\/classnews$/);
 if(!m||m[1]!==p.binding.boardId||u.search||u.hash)return false;
 const roots=document.querySelectorAll('app-boards-write');if(roots.length!==1)return false;
 const labels=roots[0].querySelectorAll('app-letter-simplified-target-text');
 if(labels.length!==1||labels[0].textContent!==p.recipientLabel)return false;
 // A modal audience edit/preview must be finished before any mutation or send.
 if(document.querySelector('app-select-letter-targets,app-mobile-preview'))return false;
 if(p.publicationMode==='immediate'){
  if(typeof readMode!=='function')return false;
  const mode=readMode(document);if(mode.known!==true||mode.mode!=='immediate'||p.date!==null)return false;
 }
 if(payload.action==='commit'){
  const a=payload.attachmentState;
  if((p.publicationMode==='immediate'?p.draftDate!==payload.note?.date:p.date!==payload.note?.date)||p.revision!==payload.revision||!same(p.photos,payload.photos)||
     a?.listKnown!==true||a.uploading||!same(a.names,p.names)||payload.finalAction!=='single-send')return false;
 }
 return true;
}
module.exports={makeGuardProof,finalDOMGuard,publicationDate};
