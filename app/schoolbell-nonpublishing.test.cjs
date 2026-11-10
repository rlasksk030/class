'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {runNonpublishingCheck,nonpublishingGuard,syntheticPhoto,NOTE}=require('./schoolbell-nonpublishing.cjs');
const {encodeFiles}=require('./schoolbell-observed-composer.cjs');
function fixture(overrides={}){
 const wc=new EventEmitter();wc.getURL=()=> 'https://schoolbell-e.com/ko/main/group/100/boards/write/classnews';wc.isDestroyed=()=>false;
 const calls=[],fields={title:'',body:'',revision:'document:0',attachmentState:{listKnown:true,uploading:false,names:[]}};
 const context={boardId:'100',checks:{classPage:true,gradeClass:true},accountObservationDigest:'synthetic-session-continuity',
  publicationMode:{known:true,mode:'immediate'},recipientEvidence:{known:true,unfiltered:true,empty:false,visibleRows:2,targetLabel:'synthetic audience',
   roles:Object.fromEntries(['administrator','guardian1','guardian2','student'].map(k=>[k,{checked:true,disabled:k==='administrator'}]))}};
 const run=()=>runNonpublishingCheck({webContents:wc,target:{classKey:'2026:1:2'},canUse:()=>true,inspectContext:async()=>context,
  confirm:async()=>true,readOriginals:async()=>({complete:true,items:[{state:'complete',source:'original-download',bytes:syntheticPhoto().bytes}]}),
  bridgeFactory:options=>{
   assert.equal(options.authorize({action:'commit'}),false);assert.equal(options.authorize({action:'commit-check'}),false);
   assert.equal(options.authorize({action:'compare-commit'}),false);
   const write=async(action,request,fn)=>{assert.equal(options.authorize({action}),true);await options.prepareProof({action});calls.push(action);fn(request);};
   return {readFields:async()=>structuredClone(fields),
    writeTitle:r=>write('title',r,r=>{fields.title=r.value;}),writeBodyText:r=>write('body',r,r=>{fields.body=r.value;}),
    attachFiles:r=>write('files',r,r=>{assert.equal(r.value.length,1);encodeFiles(r.value);fields.attachmentState.names=['01-'+r.value[0].id];}),
    readAttachmentState:async()=>structuredClone(fields.attachmentState),close:async()=>true,
    commitOnce:()=>{throw Error('No send method may be used');}};
  },...overrides});
 return {run,wc,calls,fields,context};
}
test('fixed nonpublishing preparation reuses inputs and originals without any send grant or draft reset',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.status,'nonpublishing-verified');assert.ok(Object.values(r.steps).every(Boolean));
 assert.deepEqual(f.calls,['title','body','files']);assert.equal(f.fields.title,NOTE.title);assert.equal(f.fields.body,NOTE.body);
 assert.equal(r.sendCount+r.scheduleCount+r.saveCount,0);
 assert.equal(r.identityVerified,false);assert.equal(r.authorityVerified,false);assert.equal(r.recipientsVerified,false);
 assert.equal(r.recipientCheck.totalParents,null);assert.equal(r.recipientCheck.totalStudents,null);
 assert.equal(JSON.stringify(r).includes('synthetic-session-continuity'),false);assert.equal(JSON.stringify(r).includes('synthetic audience'),false);
});
test('any existing title, body, or attachment is preserved without confirmation or input',async()=>{
 for(const type of ['title','body','photo']){
  let confirmations=0;const f=fixture({confirm:async()=>{confirmations++;return true;}});
  if(type==='photo')f.fields.attachmentState.names=['private-existing.png'];else f.fields[type]='private-existing-content';
  const before=structuredClone(f.fields),r=await f.run();assert.equal(r.reason,'existing-content');
  assert.equal(confirmations,0);assert.deepEqual(f.calls,[]);assert.deepEqual(f.fields,before);
  assert.equal(JSON.stringify(r).includes('private-existing'),false);
 }
});
test('class mismatch, absent cooperation, or navigation during approval prevents every write',async()=>{
 let f=fixture();f.context.checks.gradeClass=false;assert.equal((await f.run()).reason,'context-unverified');assert.deepEqual(f.calls,[]);
 f=fixture();f.context.publicationMode.mode='scheduled';assert.equal((await f.run()).reason,'date-unverified');assert.deepEqual(f.calls,[]);
 f=fixture({canUse:()=>false});assert.equal((await f.run()).reason,'context-changed');assert.deepEqual(f.calls,[]);
 f=fixture({confirm:async()=>false});assert.equal((await f.run()).reason,'cancelled');assert.deepEqual(f.calls,[]);
 f=fixture({confirm:async()=>{f.wc.emit('did-navigate');return true;}});assert.equal((await f.run()).reason,'context-changed');assert.deepEqual(f.calls,[]);
});
test('changed recipients and unverified originals never produce a successful preparation',async()=>{
 let checks=0;const f=fixture({inspectContext:async()=>{if(++checks>1)f.context.recipientEvidence.roles.student.checked=false;return f.context;}});
 assert.equal((await f.run()).reason,'context-changed');assert.deepEqual(f.calls,[]);
 const bad=fixture({readOriginals:async()=>({complete:true,items:[{state:'complete',source:'preview-jpeg',bytes:Buffer.from('not original')}]})});
 const r=await bad.run();assert.equal(r.status,'blocked');assert.equal(r.stage,'original');assert.equal(r.sendCount,0);
 assert.equal(bad.fields.body,NOTE.body);assert.equal(bad.fields.attachmentState.names.length,1);
});
test('DOM guard refuses send-related actions before inspecting any document',()=>{
 for(const action of ['commit','commit-check','compare-commit','save','schedule'])assert.equal(nonpublishingGuard(null,{action}),false);
 for(const expiresAt of [undefined,NaN])assert.equal(nonpublishingGuard(null,{action:'title',proof:{kind:'nonpublishing-input',action:'title',issuedAt:Date.now(),expiresAt}}),false);
});
