const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const services=require('./diary-services.cjs'),{hash}=require('./media-store.cjs');
const {createTestAuthorization}=require('./schoolbell-test-authorization.cjs'),{reconcile}=require('./schoolbell-reconcile.cjs');
async function fixture(t,ordinary=false){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'schoolbell-reconcile-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const target={schoolId:'synthetic',schoolName:'합성 학교',year:'2026',grade:'6',classroom:'1',classKey:'2026:6:1'};
 const profile={id:target.schoolId,dir},store=services.createStore(profile),bytes=Buffer.from('synthetic original');
 const note={classKey:target.classKey,date:'2026-11-09',title:'합성 재검증',body:'합성 본문',photos:[{id:hash(bytes)+'.png'}]};
 store.select(note.classKey,'schoolbell');const attempt=store.beginAutomatic(note);
 store.automaticState(note.classKey,attempt.id,{status:'auto-pending',stage:'verifying'});
 store.automaticState(note.classKey,attempt.id,{status:'auto-uncertain',stage:'verifying'});
 const wc=Object.assign(new EventEmitter(),{isDestroyed:()=>false,getURL:()=> 'https://schoolbell-e.com/ko/main/group/100/boards/classnews'});
 const facts={boardId:'100',contextId:'100',actorKey:null,checks:{classPage:true,gradeClass:true,adminSettingsEditable:true,rosterEmpty:true,inviteEmpty:true,recipientTableEmpty:true},students:0,parents:0,adminCount:1,mandatoryAdministrator:true,
  recipientEvidence:{known:true,unfiltered:true,empty:true,mandatoryAdministrator:true,targetLabel:'합성 대상'},accountObservationDigest:'synthetic-memory-only',observedAt:Date.now()};
 if(ordinary){facts.managementObservationDigest='synthetic-management';facts.students=null;facts.parents=null;facts.recipientEvidence={known:true,unfiltered:true,empty:false,selectionScope:'class-roles',targetLabel:'synthetic roles',roles:{administrator:{checked:true,disabled:true},guardian1:{checked:true,disabled:false},guardian2:{checked:true,disabled:false},student:{checked:false,disabled:false}}};}
 const records=[],auth=ordinary?require('./schoolbell-operating-authorization.cjs').createOperatingAuthorization({canPublish:()=>true,persist:async record=>records.push(record)}):createTestAuthorization({canUse:()=>true,persist:async record=>records.push(record)});const grant=await auth.issue({target,facts,webContents:wc});
 await auth.approveFinal(note,[{sha256:hash(bytes),bytes:bytes.length}],{boardId:'100',approvalId:grant.approvalId,authorizationId:grant.authorizationId});
 const dataFile=path.join(dir,'diary-services.json'),saved=JSON.parse(fs.readFileSync(dataFile));saved.classes[note.classKey].automaticPosts[attempt.id].updatedAt=Date.now();fs.writeFileSync(dataFile,JSON.stringify(saved));
 const post={id:'new-post',kind:'published',title:note.title,body:note.body,date:'2026-11-10',dateSource:'observed-service-ui',scope:{service:'schoolbell',schoolId:target.schoolId,classKey:target.classKey,boardId:'100'},attachments:{complete:true,items:[{state:'complete',source:'original-download',bytes}]}};
 const result={complete:true,refreshed:true,filter:{title:note.title},ids:['old-post','new-post'],posts:[post]};let reads=0;
 const args={profile,store,target,note,attemptId:attempt.id,permission:()=>auth.current(),readPhoto:async()=>bytes,
  readContext:async()=>({...target,...auth.attach({...facts,observedAt:Date.now()},target,wc),authenticated:true,service:'schoolbell',scopeType:'class',board:'diary'}),
  readBaseline:async()=>{reads++;return result;},readSubmissionRecords:async()=>records};
 return {args,store,profile,note,attempt,post,result,auth,records,reads:()=>reads};
}
test('verification-only completion saves original receipt and uncertainty provenance, with no send transport',async t=>{
 const f=await fixture(t),r=await reconcile(f.args);assert.equal(r.status,'success');assert.equal(r.reconciled,true);assert.equal(f.reads(),1);
 const saved=f.store.get(f.note.classKey).automaticPosts[f.attempt.id];assert.equal(saved.status,'auto-success');assert.equal(saved.publication.postId,'new-post');assert.equal(saved.publication.publishedDate,'2026-11-10');assert.equal(saved.reconciliation.previousStatus,'auto-uncertain');
 assert.equal(f.store.beginAutomatic(f.note).blocked,true);await assert.rejects(()=>reconcile(f.args));
 const data=fs.readFileSync(path.join(f.profile.dir,'diary-services.json'),'utf8');assert.equal(data.includes(f.note.body),false);
});
test('wrong draft, unposted stage, ambiguous post and incomplete original proof cannot create a receipt',async t=>{
 for(const change of ['draft','stage','multiple','bytes','scope','revoked','audience','save','submission-board','submission-missing','submission-content']){
  const f=await fixture(t);
  if(change==='draft')f.args.note={...f.note,body:'changed'};
  if(change==='stage'){const p=path.join(f.profile.dir,'diary-services.json'),d=JSON.parse(fs.readFileSync(p));d.classes[f.note.classKey].automaticPosts[f.attempt.id].stage='input';fs.writeFileSync(p,JSON.stringify(d));}
  if(change==='multiple')f.result.posts.push({...f.post,id:'another'});
  if(change==='bytes')f.post.attachments.items[0].bytes=Buffer.from('wrong');
  if(change==='scope')f.post.scope.boardId='other';
  if(change==='revoked')f.auth.revoke();
  if(change==='audience'){let n=0,read=f.args.readContext;f.args.readContext=async()=>{const c=await read();if(++n===2)c.recipientEvidence={...c.recipientEvidence,targetLabel:'changed'};return c;};}
  if(change==='save')f.store.reconcileAutomatic=()=>{throw Error('save failed');};
  if(change==='submission-board')f.records[0].boardId='200';
  if(change==='submission-missing')f.records.pop();
  if(change==='submission-content')f.records[1].contentSha256='0'.repeat(64);
  await assert.rejects(()=>reconcile(f.args),change);assert.equal(f.store.get(f.note.classKey).automaticPosts[f.attempt.id].status,'auto-uncertain',change);
 }
});

test('ordinary uncertain attempt reconciles read-only with teacher provenance and no repeat submit approval',async t=>{
 const f=await fixture(t,true);f.auth.finishAttempt();
 const r=await reconcile(f.args);assert.equal(r.status,'success');assert.equal(f.reads(),1);
 assert.equal(r.publication.executionMode,'teacher-authorized-class');assert.equal(r.publication.servicePermission,'unconfirmed');
 assert.equal(r.publication.identitySource,'teacher-confirmation');assert.equal(f.store.beginAutomatic(f.note).blocked,true);
 const g=await fixture(t,true);g.records[0].boardId='other';await assert.rejects(()=>reconcile(g.args));
 assert.equal(g.store.get(g.note.classKey).automaticPosts[g.attempt.id].status,'auto-uncertain');
});
