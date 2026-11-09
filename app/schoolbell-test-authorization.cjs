'use strict';
// A local, short-lived test consent is NOT an official service grant or an
// account identifier. Only the main-process native confirmation can issue it.
const crypto=require('node:crypto');
const leases=new WeakMap();
const targetKeys=['schoolId','schoolName','year','grade','classroom','classKey'];
function validTestGrant(p,target,action='read',now=Date.now()){
 const lease=p&&leases.get(p);
 return !!lease&&!!target&&lease.live()&&p.kind==='user-approved-development-test'&&p.official===false&&
  p.source==='native-main-confirmation'&&p.method==='electron-ui'&&p.expiresAt>now&&p.approvedAt<=now&&
  targetKeys.every(k=>target[k]===undefined||target[k]===p.target[k])&&
  p.actions.includes(action)&&(action!=='submit'||!!lease.finalDigest);
}
function testFacts(f){
 return f?.checks?.classPage===true&&f.checks.gradeClass===true&&f.checks.adminSettingsEditable===true&&
  f.checks.rosterEmpty===true&&f.checks.inviteEmpty===true&&f.checks.recipientTableEmpty===true&&
  f.students===0&&f.parents===0&&f.adminCount===1&&f.mandatoryAdministrator===true&&
  f.recipientEvidence?.known===true&&f.recipientEvidence.unfiltered===true&&f.recipientEvidence.empty===true;
}
function testContext(c,p,now=Date.now()){
 return validTestGrant(p,c,'read',now)&&testFacts(c)&&c.boardId===p.boardId&&
  c.actorKey===null&&c.trial?.approvalId===p.approvalId&&c.trial.accountObservationUnchanged===true&&
  c.trial.mappingSource==='user-confirmation'&&c.trial.authoritySource==='edit-controls-and-user-confirmation'&&
  Number.isFinite(c.observedAt)&&c.observedAt<=now&&now-c.observedAt<=15000;
}
function bindingOf(c){return {boardId:c.boardId,contextId:c.contextId,actorKey:c.actorKey,
 ...(c.trial?{approvalId:c.trial.approvalId}:{})};}
function sameBinding(c,b){
 return !!c&&!!b&&['boardId','contextId'].every(k=>typeof b[k]==='string'&&!!b[k]&&c[k]===b[k])&&
  (b.approvalId?c.actorKey===null&&b.actorKey===null&&(c.approvalId||c.trial?.approvalId)===b.approvalId:
   typeof b.actorKey==='string'&&!!b.actorKey&&c.actorKey===b.actorKey);
}
function contentDigest(note,photos){return crypto.createHash('sha256').update(JSON.stringify({classKey:note.classKey,date:note.date,title:note.title,body:note.body,photos})).digest('hex');}
function finalTestContent(p,note,photos){return leases.get(p)?.finalDigest===contentDigest(note,photos);}
function createTestAuthorization({canUse=()=>false,persist=async()=>{},now=Date.now}={}){
 let grant=null,owner=null,digest=null,revoked=true,detach=()=>{};
 function allowedURL(value){
  try{const u=new URL(value);return u.protocol==='https:'&&['schoolbell-e.com','www.schoolbell-e.com','v4.schoolbell-e.com'].includes(u.hostname)&&
   !u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&new RegExp('^/ko/main/group/'+grant.boardId+'/boards/(?:write/)?(?:classnews|schoolnews)(?:/posts/\\d+)?$').test(u.pathname);
  }catch{return false;}
 }
 function live(){
  if(revoked||!canUse()||!owner||owner.isDestroyed()||grant.expiresAt<=now())return false;
  return allowedURL(owner.getURL());
 }
 return {
  available:()=>canUse(),
  current(){return grant&&live()?grant:null;},
  status(key){const p=this.current();return {available:canUse(),enabled:!!p&&p.target.classKey===key,
   ...(p&&p.target.classKey===key?{approvalId:p.approvalId,expiresAt:p.expiresAt}:{}),
   message:p&&p.target.classKey===key?'개발 시험 승인됨 · 사용자 확인 근거로 현재 학급에서 1회 실행합니다. 운영 잠금은 유지됩니다.':'개발 시험은 현재 앱 세션과 빈 테스트 학급에 대한 별도 확인이 필요합니다.'};},
  async issue({target,facts,webContents}){
   if(!canUse()||!testFacts(facts)||typeof facts.accountObservationDigest!=='string'||!facts.accountObservationDigest||!/^\d+$/.test(facts.boardId))throw Error('test-class-unverified');
   revoked=true;detach();owner=webContents;digest=facts.accountObservationDigest;
   const approvedAt=now();grant=Object.freeze({kind:'user-approved-development-test',official:false,source:'native-main-confirmation',method:'electron-ui',
    approvalId:crypto.randomUUID(),approvedAt,expiresAt:approvedAt+30*60*1000,boardId:facts.boardId,target:structuredClone(target),
    schoolId:target.schoolId,classKey:target.classKey,actions:['read','input','attachments','submit'],
    assertions:{appClassMapping:true,ownTestClass:true,soleAdministratorIsSelf:true,selfNoticeAllowed:true,syntheticOnly:true},
    servicePermission:'unconfirmed',serviceIdentityVerified:false,actorKey:null});
   // Audit only the consent/scope. No contact digest, credentials or cookie data.
   await persist({event:'test-scope-approved',...grant});revoked=false;
   const issued=grant;leases.set(issued,{live:()=>grant===issued&&live(),finalDigest:null});if(!live()){revoked=true;throw Error('context-unverified');}
   // A normal file download starts navigation but does not replace the page.
   // Revoke on committed page/account changes, while the driver's existing
   // navigation epoch prevents mutations during a pending navigation.
   const watched=owner,onNavigation=(_event,url)=>{if(!allowedURL(url))revoked=true;},
    onInPage=(_event,url,mainFrame)=>{if(mainFrame&&!allowedURL(url))revoked=true;},onGone=()=>{revoked=true;};
   watched.on?.('did-navigate',onNavigation);watched.on?.('did-navigate-in-page',onInPage);watched.on?.('render-process-gone',onGone);watched.on?.('destroyed',onGone);
   detach=()=>{watched.removeListener?.('did-navigate',onNavigation);watched.removeListener?.('did-navigate-in-page',onInPage);watched.removeListener?.('render-process-gone',onGone);watched.removeListener?.('destroyed',onGone);};return grant;
  },
  attach(facts,target,webContents){
   const p=this.current();if(!p||webContents!==owner||!validTestGrant(p,target,'read',now())||!testFacts(facts)||
    facts.boardId!==p.boardId||facts.accountObservationDigest!==digest)throw Error('context-unverified');
   return {...facts,trial:{approvalId:p.approvalId,accountObservationUnchanged:true,mappingSource:'user-confirmation',authoritySource:'edit-controls-and-user-confirmation'}};
  },
  async approveFinal(note,photos,scope){
   const p=this.current();if(!p||scope.approvalId!==p.approvalId||scope.boardId!==p.boardId||note.classKey!==p.target.classKey)throw Error('permission-unverified');
   const hash=contentDigest(note,photos);await persist({event:'test-final-confirmed',approvalId:p.approvalId,contentSha256:hash,time:now()});
   if(this.current()!==p)throw Error('permission-unverified');leases.get(p).finalDigest=hash;
  },
  revoke(){revoked=true;detach();}
 };
}
module.exports={validTestGrant,testContext,testFacts,bindingOf,sameBinding,finalTestContent,createTestAuthorization};
