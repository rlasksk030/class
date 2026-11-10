'use strict';
// Main-owned class binding. Teacher declarations are NOT service identity,
// membership totals, or official automation permission. Release enablement is
// an independent code gate; a connection can be checked while sending is locked.
const crypto=require('node:crypto');
const {contentDigest}=require('./schoolbell-test-authorization.cjs');
const leases=new WeakMap(),keys=['schoolId','schoolName','year','grade','classroom','classKey'];
const roles=['administrator','guardian1','guardian2','student'];
function factsReady(c){
 const r=c?.recipientEvidence;
 return c?.checks?.classPage===true&&c.checks.gradeClass===true&&c.checks.adminSettingsEditable===true&&
  typeof c.accountObservationDigest==='string'&&!!c.accountObservationDigest&&
  typeof c.managementObservationDigest==='string'&&!!c.managementObservationDigest&&/^\d+$/.test(c.boardId||'')&&
  Number.isSafeInteger(c.adminCount)&&c.adminCount>0&&r?.known===true&&r.unfiltered===true&&
  r.selectionScope==='class-roles'&&typeof r.targetLabel==='string'&&!!r.targetLabel.trim()&&
  roles.every(k=>typeof r.roles?.[k]?.checked==='boolean'&&typeof r.roles[k].disabled==='boolean')&&
  r.roles.administrator.checked===true&&r.roles.administrator.disabled===true;
}
function observedBinding(c){
 return JSON.stringify({boardId:c.boardId,account:c.accountObservationDigest,admins:c.adminCount,
  management:c.managementObservationDigest||null,label:c.recipientEvidence.targetLabel,
  roles:c.recipientEvidence.roles,selectionScope:c.recipientEvidence.selectionScope});
}
function validGrant(p,target,action='read',now=Date.now()){
 const lease=p&&leases.get(p);
 return !!target&&!!lease&&lease.live()&&p.kind==='teacher-confirmed-class-binding'&&p.official===false&&
  p.source==='native-main-confirmation'&&p.servicePermission==='unconfirmed'&&p.expiresAt>now&&p.approvedAt<=now&&
  keys.every(k=>target?.[k]===undefined||target[k]===p.target[k])&&p.actions.includes(action)&&
  (action==='read'||lease.canPublish())&&(action!=='submit'||!!lease.finalDigest);
}
function operatingContext(c,p,now=Date.now()){
 return validGrant(p,c,'read',now)&&factsReady(c)&&c.boardId===p.boardId&&c.actorKey===null&&
  c.operating?.authorizationId===p.authorizationId&&c.operating.accountObservationUnchanged===true&&
  c.operating.mappingSource==='teacher-confirmation'&&c.operating.authoritySource==='management-controls-and-teacher-confirmation'&&
  Number.isFinite(c.observedAt)&&c.observedAt<=now&&now-c.observedAt<=15000&&
  observedBinding(c)===leases.get(p).binding;
}
function finalContent(p,note,photos){return leases.get(p)?.finalDigest===contentDigest(note,photos);}
function createOperatingAuthorization({canPublish=()=>false,persist=async()=>{},now=Date.now}={}){
 let grant=null,owner=null,revoked=true,detach=()=>{};
 const revoke=()=>{revoked=true;detach();};
 function route(value){try{const u=new URL(value);return u.protocol==='https:'&&
  ['schoolbell-e.com','www.schoolbell-e.com','v4.schoolbell-e.com'].includes(u.hostname)&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&
  new RegExp('^/ko/main/group/'+grant.boardId+'/boards/(?:write/)?(?:classnews|schoolnews)(?:/posts/\\d+)?$').test(u.pathname);
 }catch{return false;}}
 const live=()=>!revoked&&owner&&!owner.isDestroyed()&&grant?.expiresAt>now()&&route(owner.getURL());
 return {
  current:()=>live()?grant:null,
  status(key){const p=this.current();return {connected:!!p&&p.target.classKey===key,enabled:!!p&&p.target.classKey===key&&canPublish(),
   identitySource:'teacher-confirmation',servicePermission:'unconfirmed'};},
  async issue({target,facts,webContents}){
   if(!factsReady(facts)||!Number.isFinite(facts.observedAt)||facts.observedAt>now()||now()-facts.observedAt>15000||!keys.every(k=>typeof target?.[k]==='string'&&!!target[k]))throw Error('context-unverified');
   revoke();owner=webContents;const approvedAt=now();
   grant=Object.freeze({kind:'teacher-confirmed-class-binding',official:false,source:'native-main-confirmation',method:'electron-ui',
    authorizationId:crypto.randomUUID(),approvedAt,expiresAt:approvedAt+30*60*1000,boardId:facts.boardId,
    target:Object.freeze({...target}),schoolId:target.schoolId,classKey:target.classKey,
    actions:Object.freeze(['read','input','attachments','submit']),servicePermission:'unconfirmed',serviceIdentityVerified:false,actorKey:null,
    mappingSource:'teacher-confirmation',authoritySource:'management-controls-and-teacher-confirmation',audienceSource:'observed-class-role-controls'});
   await persist({event:'operating-class-confirmed',...grant});
   revoked=false;const issued=grant;leases.set(issued,{live:()=>grant===issued&&live(),canPublish,binding:observedBinding(facts),finalDigest:null});
   if(!live()){revoke();throw Error('context-unverified');}
   const watched=owner,onNav=(_e,url)=>{if(!route(url))revoke();},onInPage=(_e,url,main)=>{if(main&&!route(url))revoke();};
   watched.on?.('did-navigate',onNav);watched.on?.('did-navigate-in-page',onInPage);watched.on?.('destroyed',revoke);watched.on?.('render-process-gone',revoke);
   detach=()=>{watched.removeListener?.('did-navigate',onNav);watched.removeListener?.('did-navigate-in-page',onInPage);watched.removeListener?.('destroyed',revoke);watched.removeListener?.('render-process-gone',revoke);};return grant;
  },
  attach(facts,target,wc){const p=this.current();
   if(!p||wc!==owner||!validGrant(p,target,'read',now())||!factsReady(facts)||observedBinding(facts)!==leases.get(p).binding){revoke();throw Error('context-unverified');}
   return {...facts,operating:{authorizationId:p.authorizationId,accountObservationUnchanged:true,mappingSource:p.mappingSource,authoritySource:p.authoritySource}};
  },
  async approveFinal(note,photos,scope){const p=this.current();
   if(!p||!canPublish()||scope.authorizationId!==p.authorizationId||scope.boardId!==p.boardId||note.classKey!==p.target.classKey)throw Error('permission-unverified');
   const digest=contentDigest(note,photos);await persist({event:'operating-final-confirmed',authorizationId:p.authorizationId,contentSha256:digest,time:now()});
   if(this.current()!==p||!canPublish())throw Error('permission-unverified');leases.get(p).finalDigest=digest;
  },finishAttempt(){const p=this.current();if(p)leases.get(p).finalDigest=null;},revoke
 };
}
module.exports={factsReady,observedBinding,validGrant,operatingContext,finalContent,createOperatingAuthorization};
