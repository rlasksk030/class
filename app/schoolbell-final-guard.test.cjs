'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {makeGuardProof,finalDOMGuard,publicationDate}=require('./schoolbell-final-guard.cjs');
const {audienceVerified}=require('./schoolbell-audience.cjs');
const {hash}=require('./media-store.cjs');
const target={schoolId:'SYNTHETIC',schoolName:'합성',year:'2026',grade:'6',classroom:'1',classKey:'2026:6:1'};
const binding={boardId:'100',contextId:'local-context',actorKey:'local-teacher'};
function fixture(){
 const now=Date.now(),bytes=Buffer.from('synthetic bytes for receipt contract only');
 const context={...target,...binding,service:'schoolbell',scopeType:'class',board:'diary',identityVerified:true,authorityVerified:true,
  authenticated:true,teacher:true,classApproved:true,testClassApproved:true,recipientsVerified:true,students:0,parents:0,externalNotifications:false,
  observedAt:now,recipientEvidence:{known:true,unfiltered:true,empty:true,mandatoryAdministrator:false,targetLabel:'합성 대상'}};
 return {action:'commit',target,binding,note:{date:'2026-11-09'},context,now,revision:'document-token:8',
  href:'https://schoolbell-e.com/ko/main/group/100/boards/write/classnews',
  date:{verified:true,source:'observed-service-ui',meaning:'publication-calendar-date',value:'2026-11-09',scope:{...target,...binding},observedAt:now},
  expectedNames:['01-local.png'],expectedPhotos:[{sha256:hash(bytes),bytes:bytes.length}],
  uploads:{complete:true,observedAt:now,binding,revision:'document-token:8',items:[{state:'complete',source:'original-download',bytes}]}};
}
test('final proof requires scoped live authority and cannot promote partial observed context',()=>{
 for(const change of [c=>c.identityVerified=false,c=>c.authorityVerified=false,c=>c.actorKey='other',c=>c.year='2025',
  c=>c.observedAt-=15001,c=>c.recipientsVerified=false,c=>c.students=1,c=>c.recipientEvidence.unfiltered=false]){
  const f=fixture();change(f.context);assert.throws(()=>makeGuardProof(f),/context-unverified/);
 }
 const f=fixture();assert.equal(makeGuardProof(f).binding.actorKey,binding.actorKey);
});
test('draft date never substitutes for an unknown, stale, wrong-scope or different-meaning service date',()=>{
 for(const change of [d=>d.verified=false,d=>delete d.source,d=>d.meaning='draft-date',d=>d.value='2026-02-30',
  d=>d.value='2026-11-08',d=>d.observedAt-=15001,d=>d.scope.boardId='101']){
  const f=fixture();change(f.date);assert.throws(()=>publicationDate(f.date,f),/date-unverified/);
 }
});
test('final photo proof is tied to downloaded bytes, their order, binding and document revision',()=>{
 for(const change of [u=>u.revision='new-document:8',u=>u.binding={...binding,boardId:'101'},u=>u.observedAt-=15001,
  u=>u.items[0].bytes=Buffer.from('changed'),u=>u.items[0].source='preview',u=>u.items=[]]){
  const f=fixture();change(f.uploads);assert.throws(()=>makeGuardProof(f),/upload-unverified/);
 }
 const f=fixture(),second=Buffer.from('second');f.uploads.items.push({state:'complete',source:'original-download',bytes:second});
 f.expectedNames.push('02-local.png');f.expectedPhotos.push({sha256:hash(second),bytes:second.length});
 assert.equal(makeGuardProof(f).photos.length,2);f.uploads.items.reverse();assert.throws(()=>makeGuardProof(f),/upload-unverified/);
});
test('atomic DOM check rejects target/modal/file/date/revision changes before the single send',()=>{
 const f=fixture(),proof=makeGuardProof(f),label={textContent:'합성 대상'},location={href:f.href};let modal=null;
 const document={location,defaultView:{getComputedStyle:()=>({visibility:'visible'})},querySelectorAll:selector=>selector==='app-boards-write'?[{querySelectorAll:()=>[label]}]:modal?[modal]:[]};
 const payload={...f,proof,finalAction:'single-send',attachmentState:{listKnown:true,uploading:false,names:f.expectedNames},photos:f.expectedPhotos};
 assert.equal(finalDOMGuard(document,payload),true);
 for(const change of [p=>p.note={date:'2026-11-08'},p=>p.revision='changed',p=>p.attachmentState={listKnown:true,uploading:true,names:f.expectedNames},
  p=>p.attachmentState={listKnown:true,uploading:false,names:['wrong.png']},p=>p.proof={...proof,expiresAt:Date.now()-1}]){
  const p={...payload};change(p);assert.equal(finalDOMGuard(document,p),false);
 }
 label.textContent='다른 대상';assert.equal(finalDOMGuard(document,payload),false);label.textContent='합성 대상';
 modal={};assert.equal(finalDOMGuard(document,payload),false);
 modal={getClientRects:()=>[],querySelectorAll:()=>[]};assert.equal(finalDOMGuard(document,payload),true,'closed retained preview is not an open modal');
 modal={querySelectorAll:()=>[{getClientRects:()=>[{width:300,height:500}]}]};assert.equal(finalDOMGuard(document,payload),false,'visible iframe blocks send');modal=null;
 location.href=f.href.replace('/100/','/101/');assert.equal(finalDOMGuard(document,payload),false);
});
test('mandatory administrator requires verified current-teacher-only evidence and matching explicit main-process approval',()=>{
 const f=fixture(),c=f.context;c.recipientEvidence.mandatoryAdministrator=true;
 assert.equal(audienceVerified(c,null),false);c.externalNotifications=true;c.adminCount=1;
 c.notificationEvidence={verified:true,source:'observed-service-ui',kind:'current-teacher-only',actorKey:c.actorKey,otherTargets:0,observedAt:f.now};
 const grant={selfNotice:{allowed:true,schoolId:c.schoolId,classKey:c.classKey,boardId:c.boardId,actorKey:c.actorKey,evidenceRef:'LOCAL-ONLY'}};
 assert.equal(audienceVerified(c,grant),true);assert.doesNotThrow(()=>makeGuardProof({...f,permission:grant}));
 for(const patch of [{actorKey:'other'},{boardId:'101'},{allowed:false},{evidenceRef:''}])assert.equal(audienceVerified(c,{selfNotice:{...grant.selfNotice,...patch}}),false);
 c.notificationEvidence.otherTargets=1;assert.equal(audienceVerified(c,grant),false);
});
