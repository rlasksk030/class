'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const operating=require('./schoolbell-operating-authorization.cjs'),trial=require('./schoolbell-test-authorization.cjs');
const {requirePermission}=require('./schoolbell-electron-driver.cjs'),services=require('./diary-services.cjs');
const target={schoolId:'SYNTHETIC',schoolName:'합성',year:'2026',grade:'1',classroom:'2',classKey:'2026:1:2'};
async function fixture({publish=true}={}){
 let now=Date.now(),url='https://schoolbell-e.com/ko/main/group/100/boards/write/classnews';
 const wc=new EventEmitter();wc.isDestroyed=()=>false;wc.getURL=()=>url;
 const facts={...target,boardId:'100',contextId:'100',actorKey:null,observedAt:now,
  identityVerified:false,authorityVerified:false,recipientsVerified:false,students:null,parents:null,
  checks:{classPage:true,gradeClass:true,adminSettingsEditable:true},accountObservationDigest:'synthetic-account',managementObservationDigest:'synthetic-management',adminCount:2,
  recipientEvidence:{known:true,unfiltered:true,empty:false,selectionScope:'class-roles',targetLabel:'합성 역할 대상',visibleRows:18,
   roles:{administrator:{checked:true,disabled:true},guardian1:{checked:true,disabled:false},guardian2:{checked:true,disabled:false},student:{checked:false,disabled:false}}}};
 const records=[],auth=operating.createOperatingAuthorization({canPublish:()=>publish,now:()=>now,persist:async r=>records.push(r)});
 const grant=await auth.issue({target,facts,webContents:wc});
 return {auth,grant,facts,wc,records,context:()=>auth.attach(facts,target,wc),time:n=>now+=n,navigate:v=>{url=v;wc.emit('did-navigate',null,v);}};
}
test('registered ordinary binding distinguishes declarations from service identity and release gate',async()=>{
 const f=await fixture({publish:false}),c=f.context();
 assert.equal(operating.validGrant(f.grant,target,'read'),true);
 for(const action of ['input','attachments','submit'])assert.equal(operating.validGrant(f.grant,target,action),false);
 assert.equal(operating.validGrant({...f.grant},target,'read'),false);
 assert.equal(operating.validGrant(f.grant,null,'read'),false);
 assert.equal(trial.validTestGrant(f.grant,target,'read'),false);
 assert.equal(c.actorKey,null);assert.equal(c.identityVerified,false);assert.equal(c.authorityVerified,false);assert.equal(c.students,null);
 assert.equal(operating.operatingContext(c,f.grant),true);
 assert.equal(JSON.stringify(f.records).includes('synthetic-account'),false);
 assert.equal(JSON.stringify(f.records).includes('synthetic-management'),false);
});
test('class, session, management and audience changes revoke the ordinary binding',async()=>{
 for(const mutate of [c=>c.boardId='101',c=>c.accountObservationDigest='changed',c=>c.managementObservationDigest='changed',
  c=>c.recipientEvidence.roles.student.checked=true,c=>c.recipientEvidence.unfiltered=false,c=>c.checks.adminSettingsEditable=false]){
  const f=await fixture();mutate(f.facts);assert.throws(()=>f.context(),/context-unverified/);assert.equal(f.auth.current(),null);
 }
 const f=await fixture();f.navigate('https://schoolbell-e.com/ko/main/group/101/boards/classnews');assert.equal(f.auth.current(),null);
 const g=await fixture();g.time(30*60*1000);assert.equal(g.auth.current(),null);
});
test('only exact final content authorizes submit; official permission stays unconfirmed',async()=>{
 const f=await fixture(),note={classKey:target.classKey,date:'2026-11-10',title:'합성',body:'본문'},photos=[];
 assert.throws(()=>requirePermission(()=>f.grant,target,'submit'));
 await f.auth.approveFinal(note,photos,{boardId:'100',authorizationId:f.grant.authorizationId});
 assert.doesNotThrow(()=>requirePermission(()=>f.grant,target,'submit'));
 assert.equal(operating.finalContent(f.grant,note,photos),true);assert.equal(operating.finalContent(f.grant,{...note,body:'변경'},photos),false);
 assert.equal(f.grant.official,false);assert.equal(f.grant.servicePermission,'unconfirmed');
 assert.equal(operating.validGrant(f.grant,{...target,classroom:'3'},'read'),false);
 f.navigate('https://schoolbell-e.com/ko/main/group/100/boards/schoolnews');assert.ok(f.auth.current(),'known same-class post redirect can be read back, never authorizes another board mutation');
 f.auth.finishAttempt();assert.equal(operating.validGrant(f.grant,target,'submit'),false);assert.ok(f.auth.current());
 f.auth.revoke();assert.equal(operating.validGrant(f.grant,target,'submit'),false);
});
test('ordinary receipts retain declaration provenance without inventing identity or member totals',async()=>{
 const f=await fixture(),receipt={postId:'200',boardId:'100',photos:[],attachmentsVerified:true,verifiedAt:Date.now(),
  executionMode:'teacher-authorized-class',authorizationId:f.grant.authorizationId,identitySource:'teacher-confirmation',
  authoritySource:'management-controls-and-teacher-confirmation',servicePermission:'unconfirmed',audienceScope:'class-roles'};
 assert.equal(services.publication(receipt,0).identitySource,'teacher-confirmation');
 assert.throws(()=>services.publication({...receipt,servicePermission:'official'},0));
 assert.throws(()=>services.publication({...receipt,identitySource:'observed-service-ui'},0));
});
