// Synthetic contracts only. These results are not Schoolbell service validation.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const services=require('./diary-services.cjs'),{createPublisher}=require('./schoolbell-publish.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(t,options={}) {
 const profile={id:'SYNTHETIC-SCHOOL',dir:fs.mkdtempSync(path.join(os.tmpdir(),'schoolbell-publish-'))};
 t.after(()=>fs.rmSync(profile.dir,{recursive:true,force:true}));
 const store=services.createStore(profile),buffers=[Buffer.from('synthetic bytes 1'),Buffer.from('synthetic bytes 2')];
 const note={classKey:'2026:6:1',date:'2026-11-07',title:'가상 제목',body:'첫째 줄\n\n둘째 줄  😊',photos:buffers.map(b=>({id:sha(b)+'.png'}))};
 store.select(note.classKey,'schoolbell');store.link(note.classKey,'https://schoolbell-e.com/ko/classes/synthetic/notes');
 const scope={service:'schoolbell',schoolId:profile.id,classKey:note.classKey,boardId:'synthetic-board',scopeType:'class',board:'diary',authenticated:true,teacher:true};
 const calls=[],draft={...note},state={inputs:null,files:[],submitted:0,inspect:0};
 const content=()=>({...state.inputs,photos:state.files.map(f=>({sha256:sha(f.bytes),bytes:f.bytes.length}))});
 const driver={
  async inspect(){calls.push('inspect');state.inspect++;return {...scope,...options.identity?.(state.inspect)};},
  async snapshot(){return {ids:options.existingIds||[],matching:options.matching||0};},
  async openComposer(){calls.push('opening');assert.equal(Object.values(store.get(note.classKey).automaticPosts)[0].status,'auto-pending');if(options.fail==='opening')throw Error('secret failure');},
  async fill(input){calls.push('input');state.inputs=input;if(options.fail==='input')throw Error('secret failure');},
  async attach(files){calls.push('attachments');state.files=files;if(options.fail==='attachments')throw Error('secret failure');},
  async readComposer(){calls.push('review');if(options.fail==='review')throw Error('secret failure');return {...content(),...options.composer};},
  async submit(){calls.push('submitting');state.submitted++;if(options.fail==='submitting')throw Error('secret failure');if(options.edit)draft.body='Newer edit';},
  async readPublished(){calls.push('verifying');if(options.fail==='verifying')throw Error('secret failure');return {kind:'published',id:'new-id',refreshed:true,scope:{...scope},...content(),...options.result};},
  async close(){calls.push('closed');return true;}
 };
 const args={profile,store,driver,readPhoto:ref=>buffers[note.photos.findIndex(p=>p.id===ref.id)],review:()=>options.confirm!==false,gate:()=>({enabled:true}),timeoutMs:50};
 return {profile,store,note,buffers,scope,calls,state,draft,driver,args,publish:()=>createPublisher(args).publish(note)};
}
test('production gate rejects even a supplied driver and renderer-like opt-in fields before any IO',async t=>{
 const f=fixture(t);delete f.args.gate;
 const result=await createPublisher(f.args).publish({...f.note,enabled:true,permission:'approved'});
 assert.equal(result.status,'blocked');assert.deepEqual(f.calls,[]);assert.equal(f.store.get(f.note.classKey).automaticPosts,undefined);
});
test('verified synthetic result preserves new edits, whitespace and ordered original bytes; history stores no content',async t=>{
 const f=fixture(t,{edit:true}),result=await f.publish();assert.equal(result.status,'success');
 assert.equal(f.state.inputs.body,f.note.body);assert.deepEqual(f.state.files.map(f=>f.bytes),f.buffers);assert.equal(f.draft.body,'Newer edit');
 assert.equal(f.state.submitted,1);assert.equal(f.store.get(f.note.classKey).automaticPosts[result.attemptId].status,'auto-success');
 assert.equal((await f.publish()).status,'blocked');assert.equal(f.state.submitted,1);
 const raw=fs.readFileSync(path.join(f.profile.dir,'diary-services.json'),'utf8');
 for(const secret of [f.note.title,f.note.body,'secret failure'])assert.ok(!raw.includes(secret));
 const receipt=services.createStore(f.profile).get(f.note.classKey).automaticPosts[result.attemptId].publication;
 assert.deepEqual(result.publication,receipt);assert.equal(receipt.postId,'new-id');assert.equal(receipt.boardId,f.scope.boardId);
 assert.equal(receipt.attachmentsVerified,true);assert.deepEqual(receipt.photos,f.buffers.map(b=>({sha256:sha(b),bytes:b.length})));
});
for(const identity of [{authenticated:false},{teacher:false},{schoolId:'OTHER'},{classKey:'2025:6:1'},{classKey:'2026:6:2'},{service:'hiclass'},{scopeType:'school'}])
 test('rejects unverified identity '+JSON.stringify(identity),async t=>{const f=fixture(t,{identity:()=>identity});assert.equal((await f.publish()).status,'blocked');assert.ok(!f.calls.includes('opening'));});
test('class or board change after input blocks final submit',async t=>{
 const f=fixture(t,{identity:n=>n>1?{boardId:'different-board'}:{}});assert.equal((await f.publish()).status,'uncertain');assert.equal(f.state.submitted,0);
});
for(const fail of ['opening','input','attachments','review','submitting','verifying'])
 test('failure at '+fail+' retains unresolved marker across restart and blocks all retries',async t=>{
  const f=fixture(t,{fail}),result=await f.publish();assert.equal(result.status,'uncertain');
  const reopened=services.createStore(f.profile);assert.equal(Object.values(reopened.get(f.note.classKey).automaticPosts)[0].status,'auto-uncertain');
  const writes=f.calls.filter(c=>c==='opening').length;assert.equal((await f.publish()).status,'blocked');assert.equal(f.calls.filter(c=>c==='opening').length,writes);
  assert.equal(reopened.prepare({...f.note,title:'Changed'}).blocked,true);assert.equal(f.note.photos.length,2);
 });
for(const composer of [{body:'partial'},{photos:[]},{photos:[{sha256:'wrong',bytes:17}]},{date:'2026-11-08'}])
 test('partial editor/attachment content cannot reach publish '+JSON.stringify(composer),async t=>{
  const f=fixture(t,{composer});assert.equal((await f.publish()).status,'uncertain');assert.equal(f.state.submitted,0);
 });
for(const result of [{kind:'scheduled'},{kind:'draft'},{refreshed:false},{id:''},{id:'old-id'},{body:'partial'},{photos:[]}])
 test('non-published or incomplete readback cannot become success '+JSON.stringify(result),async t=>{
  const f=fixture(t,{result,existingIds:['old-id']});assert.equal((await f.publish()).status,'uncertain');assert.equal(f.state.submitted,1);
 });
test('photo reversal is rejected before submit and post-readback reversal remains uncertain',async t=>{
 const f=fixture(t);const original=f.driver.readComposer;
 f.driver.readComposer=async()=>{const r=await original();r.photos.reverse();return r;};
 assert.equal((await f.publish()).status,'uncertain');assert.equal(f.state.submitted,0);
 const g=fixture(t);const read=g.driver.readPublished;g.driver.readPublished=async()=>{const r=await read();r.photos.reverse();return r;};
 assert.equal((await g.publish()).status,'uncertain');assert.equal(g.state.submitted,1);
});
test('cancellation and existing remote match never open composer or create pending',async t=>{
 for(const options of [{confirm:false},{matching:1}]){const f=fixture(t,options);await f.publish();assert.ok(!f.calls.includes('opening'));assert.equal(f.store.get(f.note.classKey).automaticPosts,undefined);}
});
test('disk failure prevents external edits, and a missing/corrupted original photo prevents remote access',async t=>{
 const f=fixture(t);f.store.beginAutomatic=()=>{throw Error('disk');};assert.equal((await f.publish()).status,'blocked');assert.ok(!f.calls.includes('opening'));
 const g=fixture(t);g.args.readPhoto=()=>Buffer.from('wrong bytes');assert.equal((await g.publish()).status,'blocked');assert.deepEqual(g.calls,['closed']);
});
test('timeout aborts outstanding input, never submits later, and keeps unresolved history',async t=>{
 const f=fixture(t);let signal;
 f.driver.fill=async(_input,s)=>{signal=s;return new Promise(resolve=>setTimeout(resolve,90));};
 const result=await f.publish();assert.equal(result.status,'uncertain');assert.equal(signal.aborted,true);
 await new Promise(r=>setTimeout(r,100));assert.equal(f.state.submitted,0);
});
test('concurrent clicks are serialized and service change stops final publish',async t=>{
 const f=fixture(t);let release;f.args.review=({phase})=>phase==='submit'?true:new Promise(r=>{release=r;});const p=createPublisher(f.args),first=p.publish(f.note);
 while(!release)await new Promise(r=>setTimeout(r,1));assert.equal((await p.publish(f.note)).status,'busy');release(true);await first;assert.equal(f.state.submitted,1);
 const g=fixture(t),attach=g.driver.attach;g.driver.attach=async files=>{await attach(files);g.store.select(g.note.classKey,'hiclass');};
 assert.equal((await g.publish()).status,'uncertain');assert.equal(g.state.submitted,0);
});
test('failure to stop the driver keeps the instance locked',async t=>{
 const f=fixture(t,{fail:'input'});f.driver.close=async()=>false;const p=createPublisher(f.args);
 assert.equal((await p.publish(f.note)).status,'uncertain');assert.equal((await p.publish(f.note)).status,'busy');
});
test('final user confirmation follows attachment verification and cancellation cannot submit',async t=>{
 const f=fixture(t),phases=[];
 f.args.review=({phase})=>{phases.push(phase);if(phase==='submit'){assert.equal(f.calls.at(-1),'review');return false;}return true;};
 assert.equal((await f.publish()).status,'uncertain');assert.deepEqual(phases,['prepare','submit']);
 assert.equal(f.state.submitted,0);assert.equal(Object.values(f.store.get(f.note.classKey).automaticPosts)[0].publication,undefined);
 assert.equal((await f.publish()).status,'blocked');assert.equal(f.state.submitted,0);
});
test('receipt persistence failure after verified readback stays unresolved and cannot resubmit',async t=>{
 const f=fixture(t),update=f.store.automaticState;
 f.store.automaticState=(key,id,state)=>{if(state.status==='auto-success')throw Error('disk fixture');return update(key,id,state);};
 assert.equal((await f.publish()).status,'uncertain');assert.equal(f.state.submitted,1);
 const record=Object.values(services.createStore(f.profile).get(f.note.classKey).automaticPosts)[0];
 assert.equal(record.status,'auto-uncertain');assert.equal(record.publication,undefined);
 assert.equal((await f.publish()).status,'blocked');assert.equal(f.state.submitted,1);
});
test('receipt rejects URLs and unverified identifiers without retaining page data',async t=>{
 const f=fixture(t,{result:{id:'https://example.invalid/?token=synthetic'}});
 assert.equal((await f.publish()).status,'uncertain');
 assert.equal(Object.values(f.store.get(f.note.classKey).automaticPosts)[0].publication,undefined);
 const g=fixture(t,{identity:()=>({boardId:'https://example.invalid/?token=synthetic'})});
 assert.equal((await g.publish()).status,'blocked');assert.equal(g.calls.includes('opening'),false);
});
