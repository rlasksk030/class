const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {fixture}=require('../tests/schoolbell-prepared-fixture.cjs');
const {createPublisher}=require('./schoolbell-publish.cjs');
const mutations=f=>f.state.events.filter(e=>['date','title','body','files','submit'].includes(e));
test('default production gate blocks prepared driver before site reads or writes',async t=>{
 const f=fixture(t);delete f.args.gate;assert.equal((await createPublisher(f.args).publish(f.note)).status,'blocked');assert.deepEqual(f.state.events,[]);
});
for(const fields of [null,{official:false},{evidenceRef:''},{method:'private-api'},{classKey:'2026:6:2'},{approvedTestClass:false},{actions:['read']}])
 test('missing or out-of-scope permission cannot mutate '+JSON.stringify(fields),async t=>{
  const f=fixture(t);if(fields===null)f.state.permission=false;else f.state.permissionFields=fields;
  const r=await f.publish();assert.equal(r.reason,'permission-unverified');assert.deepEqual(mutations(f),[]);assert.equal(f.state.clicks,0);
 });
for(const photoCount of [0,1,2])test('verified originals and refreshed result persist receipt for '+photoCount+' photos',async t=>{
 const f=fixture(t,{photoCount}),r=await f.publish();assert.equal(r.status,'success');assert.equal(f.state.clicks,1);
 assert.deepEqual(r.publication.photos,f.originals.slice(0,photoCount).map(b=>({sha256:f.hash(b),bytes:b.length})));
 assert.equal(f.store.get(f.note.classKey).automaticPosts[r.attemptId].status,'auto-success');
 const raw=fs.readFileSync(path.join(f.profile.dir,'diary-services.json'),'utf8');
 for(const secret of [f.note.body,f.note.title,'synthetic-teacher','LOCAL-FIXTURE-NOT-REAL-PERMISSION'])assert.equal(raw.includes(secret),false);
 assert.equal((await f.publish()).status,'blocked');assert.equal(f.state.clicks,1);
});
for(const context of [{schoolId:'OTHER'},{schoolName:'다른 합성 학교'},{year:'2025'},{grade:'5'},{classroom:'2'},
 {authenticated:false},{teacher:false},{authorityVerified:false},{identityVerified:false},{classApproved:false},
 {observedAt:0},{observedAt:Number.MAX_SAFE_INTEGER}])test('identity/authority evidence rejected '+JSON.stringify(context),async t=>{
 const f=fixture(t);f.state.context=context;assert.equal((await f.publish()).reason,'context-unverified');assert.deepEqual(mutations(f),[]);
});
for(const context of [{students:1},{parents:1},{students:null},{recipientsVerified:false},{externalNotifications:true},{testClassApproved:false}])
 test('test classroom constraints fail closed '+JSON.stringify(context),async t=>{
  const f=fixture(t);f.state.context=context;assert.equal((await f.publish()).reason,'test-class-unverified');assert.deepEqual(mutations(f),[]);
 });
for(const selector of ['input[placeholder="제목을 입력해 주세요."]','div.fr-element.fr-view[contenteditable="true"]','input[type="file"]','button.btn-with-description'])
 test('missing/duplicated observed element blocks before input '+selector,async t=>{
  for(const mode of ['missing','duplicates']){const f=fixture(t);f.state[mode]=selector;
   assert.equal((await f.publish()).reason,'structure-unverified');assert.deepEqual(mutations(f),[]);}
 });
test('unknown date and non-writable mismatch block before title/body/files',async t=>{
 for(const change of [{dateVerified:false},{date:'2026-02-30'},{date:'2026-11-08',dateWritable:false}]){
  const f=fixture(t);Object.assign(f.state,change);assert.equal((await f.publish()).reason,'date-unverified');assert.deepEqual(mutations(f),[]);
 }
 const f=fixture(t);f.state.date='2026-11-08';assert.equal((await f.publish()).status,'success');assert.equal(mutations(f)[0],'date');
});
test('permission or class change during date validation cannot reach first input',async t=>{
 for(const change of [f=>{f.state.permission=false;},f=>{f.state.context.classroom='2';}]){
  const f=fixture(t),read=f.bridge.readDate;let count=0;
  f.bridge.readDate=async()=>{const d=await read();if(++count===2)change(f);return d;};
  assert.notEqual((await f.publish()).status,'success');assert.deepEqual(mutations(f),[]);
 }
});
for(const mode of ['pending','partial','reversed','corrupt','claimed-hash-only'])test('upload evidence blocks '+mode,async t=>{
 const f=fixture(t),read=f.bridge.readUploads;
 f.bridge.readUploads=async()=>{const x=await read();if(mode==='pending')x.complete=false;
  if(mode==='partial')x.items.pop();if(mode==='reversed')x.items.reverse();if(mode==='corrupt')x.items[0].bytes=Buffer.from('changed');
  if(mode==='claimed-hash-only'){x.items[0].sha256=f.hash(f.originals[0]);delete x.items[0].bytes;}return x;};
 const r=await f.publish();assert.equal(r.status,'uncertain');assert.equal(r.reason,'upload-unverified');assert.equal(f.state.clicks,0);
 assert.equal((await f.publish({...f.note,title:'새 합성 제목'})).status,'blocked');assert.equal(f.state.clicks,0);
});
test('baseline requires completed refresh; duplicate uses photo bytes and their order',async t=>{
 for(const key of ['baselineComplete','baselineRefreshed']){const f=fixture(t);f.state[key]=false;
  assert.equal((await f.publish()).reason,'baseline-unverified');assert.deepEqual(mutations(f),[]);}
 const f=fixture(t);assert.equal((await f.publish({...f.note,photos:[f.note.photos[0]]})).status,'success');
 assert.equal((await f.publish({...f.note,photos:[f.note.photos[1]]})).status,'success');
 assert.equal((await f.publish()).status,'success');
 assert.equal((await f.publish({...f.note,photos:[...f.note.photos].reverse()})).status,'success');
 assert.equal(f.state.clicks,4);assert.equal((await f.publish()).status,'blocked');assert.equal(f.state.clicks,4);
});
test('final confirmation cancellation preserves pending evidence without submit',async t=>{
 const f=fixture(t);f.args.review=({phase})=>phase!=='submit';
 const r=await createPublisher(f.args).publish(f.note);assert.equal(r.status,'uncertain');assert.equal(f.state.clicks,0);
 assert.equal(Object.values(f.store.get(f.note.classKey).automaticPosts)[0].status,'auto-uncertain');
});
test('an individually valid but changed audience after final confirmation cannot send',async t=>{
 const f=fixture(t);
 f.state.context.recipientEvidence={known:true,unfiltered:true,empty:true,mandatoryAdministrator:false,targetLabel:'합성 원래 대상'};
 f.args.review=({phase})=>{if(phase==='submit')f.state.context.recipientEvidence.targetLabel='합성 다른 대상';return true;};
 const r=await createPublisher(f.args).publish(f.note);
 assert.equal(r.reason,'test-class-unverified');assert.equal(f.state.clicks,0);
 assert.equal(Object.values(f.store.get(f.note.classKey).automaticPosts)[0].status,'auto-uncertain');
});
for(const change of ['revision','class','permission','recipient'])test('atomic commit guard rejects last-moment '+change,async t=>{
 const f=fixture(t);f.state.beforeCommit=()=>{
  if(change==='revision'){f.state.body='새 편집';f.state.revision++;}if(change==='class')f.state.context.classroom='2';
  if(change==='permission')f.state.permission=false;if(change==='recipient')f.state.context.students=1;
 };
 assert.equal((await f.publish()).status,'uncertain');assert.equal(f.state.clicks,0);
});
for(const mode of ['no-refresh','incomplete','body','date','partial','reversed','duplicate','old-id'])test('post readback remains uncertain for '+mode,async t=>{
 const f=fixture(t);f.state.afterCommit=row=>{
  if(mode==='no-refresh')f.state.resultRefreshed=false;if(mode==='incomplete')f.state.resultComplete=false;
  if(mode==='body')row.body='다른 본문';if(mode==='date')row.date='2026-11-08';if(mode==='partial')row.attachments.items.pop();
  if(mode==='reversed')row.attachments.items.reverse();if(mode==='duplicate')f.state.posts.push({...row,id:'second-synthetic-id'});
  if(mode==='old-id')row.id='';
 };
 const r=await f.publish();assert.equal(r.status,'uncertain');assert.equal(r.reason,'publication-unverified');assert.equal(f.state.clicks,1);
 assert.equal(Object.values(f.store.get(f.note.classKey).automaticPosts)[0].status,'auto-uncertain');
 assert.equal((await f.publish({...f.note,title:'변경 후 재전송'})).status,'blocked');assert.equal(f.state.clicks,1);
});
test('unknown bridge errors are redacted; unresolved close locks publisher',async t=>{
 const f=fixture(t);f.bridge.readDate=async()=>{throw Error('PRIVATE BODY / SESSION / URL');};
 const r=await f.publish();assert.equal(JSON.stringify(r).includes('PRIVATE'),false);
 const g=fixture(t);g.bridge.close=()=>new Promise(()=>{});
 assert.equal((await g.publish()).status,'success');assert.equal((await g.publish()).status,'busy');
});
test('missing date evidence port blocks before input with a specific safe reason',async t=>{
 const f=fixture(t);delete f.bridge.readDate;assert.equal((await f.publish()).reason,'date-unverified');assert.deepEqual(mutations(f),[]);
});
test('timeout aborts delayed mutation and cannot submit in the background',async t=>{
 const f=fixture(t),write=f.bridge.writeTitle;f.args.timeoutMs=20;
 f.bridge.writeTitle=async(r,s)=>{await new Promise(resolve=>setTimeout(resolve,60));return write(r,s);};
 const p=createPublisher(f.args);assert.equal((await p.publish(f.note)).status,'uncertain');
 await new Promise(resolve=>setTimeout(resolve,90));assert.deepEqual(mutations(f),[]);assert.equal(f.state.clicks,0);
 assert.equal((await p.publish({...f.note,title:'새 본문'})).status,'blocked');
});
test('verified result whose receipt cannot be persisted remains uncertain and preserves payload',async t=>{
 const f=fixture(t),before=JSON.stringify(f.note),save=f.store.automaticState;
 f.store.automaticState=(key,id,state)=>{if(state.status==='auto-success')throw Error('synthetic disk full');return save(key,id,state);};
 const r=await f.publish();assert.equal(r.status,'uncertain');assert.equal(f.state.clicks,1);assert.equal(JSON.stringify(f.note),before);
 assert.equal(Object.values(f.store.get(f.note.classKey).automaticPosts)[0].status,'auto-uncertain');
 assert.equal((await f.publish({...f.note,title:'바뀐 합성 내용'})).status,'blocked');assert.equal(f.state.clicks,1);
});
test('post-send board redirect permits read-only return, then requires the original binding',async t=>{
 for(const restore of [true,false]){
  const f=fixture(t),read=f.bridge.readPublished;
  f.state.afterCommit=()=>{f.state.context.board='schoolnews';};
  f.bridge.readPublished=async()=>{if(restore)delete f.state.context.board;return read();};
  const result=await f.publish();
  assert.equal(result.status,restore?'success':'uncertain');
  if(!restore)assert.equal(result.reason,'context-unverified');
  assert.equal(f.state.clicks,1);
 }
});

test('filtered full-list baseline keeps unrelated IDs and rejects a mismatched filter or missing candidate ID',async t=>{
 for(const bad of [null,'filter','id']){
  const f=fixture(t,{photoCount:0});
  const candidate={id:'candidate',title:f.note.title,body:f.note.body,date:f.note.date,kind:'published',scope:f.scope,attachments:{complete:true,items:[]}};
  f.bridge.readBaseline=async()=>({complete:true,refreshed:true,ids:bad==='id'?['unrelated']:['unrelated','candidate'],filter:{title:bad==='filter'?'different':f.note.title},posts:[candidate]});
  await f.driver.inspect({schoolId:f.scope.schoolId,classKey:f.scope.classKey});
  if(bad)await assert.rejects(()=>f.driver.snapshot({scope:f.scope,note:f.note}),e=>e.code==='baseline-unverified');
  else assert.deepEqual(await f.driver.snapshot({scope:f.scope,note:f.note}),{ids:['unrelated','candidate'],matching:1});
  assert.deepEqual(mutations(f),[]);await f.driver.close();
 }
});
test('immediate publication keeps an older draft date separate from the verified server date and never writes a date field',async t=>{
 const f=fixture(t,{publicationMode:'immediate'});f.note.date='2026-11-08';
 const result=await f.publish();assert.equal(result.status,'success');assert.equal(f.state.clicks,1);
 assert.equal(f.state.events.includes('date'),false);
 assert.equal(result.publication.draftDate,'2026-11-08');assert.equal(result.publication.publishedDate,'2026-11-09');
 assert.equal(result.publication.dateMode,'immediate');
 assert.deepEqual(f.store.get(f.note.classKey).automaticPosts[result.attemptId].publication,result.publication);
 f.note.date='2026-11-10';assert.equal((await f.publish()).status,'blocked');assert.equal(f.state.clicks,1);
});
test('immediate mode rejects scheduling and unverifiable post dates without retransmission',async t=>{
 const scheduled=fixture(t,{publicationMode:'immediate'});scheduled.state.scheduled=true;
 assert.equal((await scheduled.publish()).reason,'date-unverified');assert.deepEqual(mutations(scheduled),[]);
 for(const change of [row=>row.date='2026-02-30',row=>delete row.dateSource]){
  const f=fixture(t,{publicationMode:'immediate'});f.state.afterCommit=change;
  assert.equal((await f.publish()).status,'uncertain');assert.equal(f.state.clicks,1);
  assert.equal((await f.publish()).status,'blocked');assert.equal(f.state.clicks,1);
 }
});
