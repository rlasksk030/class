const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createTestAuthorization,validTestGrant,testContext,bindingOf,sameBinding,finalTestContent}=require('./schoolbell-test-authorization.cjs');
const {requirePermission}=require('./schoolbell-electron-driver.cjs');
const target={schoolId:'synthetic',schoolName:'합성 학교',year:'2026',grade:'6',classroom:'1',classKey:'2026:6:1'};
function fixture(){
 let now=1000,url='https://schoolbell-e.com/ko/main/group/100/boards/write/classnews';const events=[];
 const wc=Object.assign(new EventEmitter(),{isDestroyed:()=>false,getURL:()=>url});
 const facts={boardId:'100',contextId:'100',actorKey:null,checks:{classPage:true,gradeClass:true,adminSettingsEditable:true,rosterEmpty:true,inviteEmpty:true,recipientTableEmpty:true},
  students:0,parents:0,adminCount:1,mandatoryAdministrator:true,recipientEvidence:{known:true,unfiltered:true,empty:true,mandatoryAdministrator:true,targetLabel:'합성 학급'},accountObservationDigest:'memory-only-observation',observedAt:now};
 const auth=createTestAuthorization({canUse:()=>true,now:()=>now,persist:async e=>events.push(e)});
 return {wc,facts,events,auth,setNow:n=>now=n,setURL:u=>{url=u;wc.emit('did-navigate',null,u);}};
}
test('native test consent is distinct from official permission; copying a record cannot authorize execution',async()=>{
 const f=fixture(),p=await f.auth.issue({target,facts:f.facts,webContents:f.wc});
 assert.equal(p.official,false);assert.equal(p.actorKey,null);assert.equal(validTestGrant(p,target,'input',1000),true);
 assert.equal(validTestGrant(structuredClone(p),target,'input',1000),false);
 assert.equal(validTestGrant(p,{...target,classKey:'2026:6:2'},'read',1000),false);
 assert.equal(validTestGrant(p,target,'submit',1000),false);
 const c={...target,...f.auth.attach(f.facts,target,f.wc)};
 assert.equal(testContext(c,p,1000),true);assert.equal(sameBinding(c,bindingOf(c)),true);
 assert.equal(c.identityVerified,undefined);assert.equal(c.actorKey,null);
 assert.ok(!JSON.stringify(f.events).includes('memory-only-observation'));
 await f.auth.issue({target,facts:f.facts,webContents:f.wc});
 assert.equal(validTestGrant(p,target,'input',1000),false,'a replaced consent never becomes valid again');
});
test('packaged/ordinary profiles, members, account observation change, logout and expiration cannot retain test access',async()=>{
 const f=fixture();await assert.rejects(()=>createTestAuthorization().issue({target,facts:f.facts,webContents:f.wc}),/test-class-unverified/);
 await assert.rejects(()=>f.auth.issue({target,facts:{...f.facts,students:1},webContents:f.wc}),/test-class-unverified/);
 const p=await f.auth.issue({target,facts:f.facts,webContents:f.wc});
 assert.throws(()=>f.auth.attach({...f.facts,accountObservationDigest:'changed'},target,f.wc),/context-unverified/);
 f.setURL('https://schoolbell-e.com/ko/main/userinfo');f.setURL('https://schoolbell-e.com/ko/main/group/100/boards/write/classnews');assert.equal(f.auth.current(),null);
 const f2=fixture(),p2=await f2.auth.issue({target,facts:f2.facts,webContents:f2.wc});f2.setNow(p2.expiresAt);assert.equal(f2.auth.current(),null);
});
test('a separate final confirmation binds exactly one draft and ordered original hashes',async()=>{
 const f=fixture(),p=await f.auth.issue({target,facts:f.facts,webContents:f.wc});
 const note={classKey:target.classKey,date:'2026-11-09',title:'합성',body:'본문'},photos=[{sha256:'a'.repeat(64),bytes:97},{sha256:'b'.repeat(64),bytes:97}];
 await f.auth.approveFinal(note,photos,{boardId:'100',approvalId:p.approvalId});
 assert.equal(validTestGrant(p,target,'submit',1000),true);assert.equal(finalTestContent(p,note,photos),true);
 assert.equal(finalTestContent(p,{...note,body:'변경'},photos),false);assert.equal(finalTestContent(p,note,[...photos].reverse()),false);
 f.auth.revoke();assert.equal(validTestGrant(p,target,'submit',1000),false);
});
