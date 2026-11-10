'use strict';
// DOM-only evidence from the actual account/group/roster screens observed on
// 2026-11-09. Private display values stay in main-process memory. The public IPC
// report exposes only booleans/counts; native consent can show the bound class.
// Available controls are never promoted to verified service identity/authority.
const {officialPage}=require('./schoolbell-observed-composer.cjs');
const {inspectRecipients}=require('./schoolbell-recipients.cjs');
const {openObservedComposer}=require('./schoolbell-composer-entry.cjs');
const crypto=require('node:crypto'),observationSalt=crypto.randomBytes(32);
function classRoute(value){
 if(!officialPage(value))return null;
 const u=new URL(value);if(u.search||u.hash)return null;
 const m=u.pathname.match(/^\/ko\/main\/group\/(\d+)\/(?:boards\/(?:write\/)?classnews(?:\/posts\/\d+)?|settings\/(?:groupinfo|studentlist|invite))$/);
 return m?{origin:u.origin,groupId:m[1],base:u.origin+'/ko/main/group/'+m[1]}:null;
}
// Self-contained to reuse for read-only inspection in both Electron and a
// connected browser. No fields are written and no clicks are performed here.
function readContextScreen(document,kind){
 const all=(root,s)=>Array.from(root.querySelectorAll(s));
 const one=s=>{const es=all(document,s);return es.length===1?es[0]:null;};
 if(kind==='group'){
  const root=one('app-settings-groupinfo'),name=one('app-name-and-address input[placeholder="기관이름을 입력해주세요."]');
  const cards=all(document,'app-admin-list .img-thumbnail');
  return {known:!!root&&!!name&&all(document,'app-name-and-address .group-type-icon.class').length===1,
   groupName:name?.value||'',nameEditable:!!name&&!name.disabled&&!name.readOnly,
   admins:cards.map(c=>({name:c.querySelector('p.text-truncate')?.textContent.trim()||'',avatar:c.querySelector('app-profile-img img')?.getAttribute('src')||''})),
   adminFlags:all(document,'app-admin-list .faceadmin-tag').length,
   // These fields are NOT present in the observed independent class screen.
   schoolVerified:false,yearVerified:false};
 }
 if(kind==='account'){
  const root=one('app-main-userinfo'),name=one('app-update-info input[placeholder="새로운 이름을 입력해주세요."]');
  const avatar=one('app-update-info app-profile-img img');
  const phone=root?.textContent.match(/현재\s*휴대폰번호\s*:\s*(0\d{1,2}[- ]?\d{3,4}[- ]?\d{4})/);
  return {known:!!root&&!!name&&!!avatar,name:name?.value||'',avatar:avatar?.getAttribute('src')||'',
   // The displayed contact is used transiently in main-process memory for
   // session continuity, never as an account ID or administrator identity proof.
   currentContactPresent:!!phone,currentContactObservation:phone?phone[1].replace(/[- ]/g,''):null,
   // A "new name" form is not an authoritative current-account identifier.
   actorVerified:false};
 }
 if(kind==='roster'){
  const root=one('app-settings-studentlist'),table=root&&all(root,'table');
  if(!table||table.length!==1)return {known:false};
  const headers=all(table[0],'thead th').map(e=>e.textContent.trim());
  if(JSON.stringify(headers)!==JSON.stringify(['번호','이름','보호자 휴대폰1','보호자 휴대폰2','학생 휴대폰']))return {known:false};
  const rows=all(table[0],'tbody tr'),filled=[0,0,0,0];
  for(const row of rows){const cells=all(row,'td');if(cells.length!==4)return {known:false};
   cells.forEach((cell,i)=>{if(cell.textContent.trim()||all(cell,'input').some(e=>e.value.trim()))filled[i]++;});}
  return {known:true,slots:rows.length,filled,empty:filled.every(n=>n===0)};
 }
 if(kind==='invite'){
  const root=one('app-settings-invite');
  return {known:!!root,noInviteTargets:!!root&&all(root,'button').some(e=>e.textContent.replace(/\s/g,'')==='초대하기(대상이없습니다.)')};
 }
 return {known:false};
}
function summarizeContext({group,account,roster,invite,recipients},target){
 const match=group?.groupName?.match(/(?:^|\s)([1-6])\s*학년\s*([가-힣A-Za-z0-9 -]+?)\s*반\s*$/);
 const sole=group?.admins?.length===1?group.admins[0]:null;
 const displayMatch=!!sole&&!!account?.name&&sole.name===account.name&&!!account.avatar&&sole.avatar===account.avatar;
 const checks={classPage:group?.known===true,
  gradeClass:!!match&&match[1]===target.grade&&match[2].trim()===target.classroom,
  school:group?.schoolVerified===true,year:group?.yearVerified===true,
  actor:account?.actorVerified===true,accountContactAvailable:account?.currentContactPresent===true,adminDisplayMatch:displayMatch,
  adminSettingsEditable:group?.known===true&&group.nameEditable===true&&group.adminFlags===1,
  rosterEmpty:roster?.known===true&&roster.empty===true,
  inviteEmpty:invite?.known===true&&invite.noInviteTargets===true,
  recipientTableEmpty:recipients?.known===true&&recipients.unfiltered===true&&recipients.empty===true};
 const blockers=[];
 for(const [key,code] of Object.entries({classPage:'class-page-unverified',gradeClass:'class-mismatch',school:'school-unverified',year:'year-unverified',actor:'actor-unverified',rosterEmpty:'roster-unverified',inviteEmpty:'recipients-unverified'}))if(!checks[key])blockers.push(code);
 if(!displayMatch||group?.adminFlags!==1)blockers.push('teacher-unverified');
 // Empty registration slots are not a verified server membership count, and
 // the sole mandatory administrator may still receive a notification.
 if(!checks.recipientTableEmpty)blockers.push('membership-unverified');
 blockers.push('notification-policy-unverified');
 return {checks,blockers,classDisplayName:group?.groupName||null,adminCount:group?.admins?.length??null,filledFields:roster?.known?roster.filled:null,
  identityVerified:false,authorityVerified:false,recipientsVerified:false,
  students:checks.recipientTableEmpty?0:null,parents:checks.recipientTableEmpty?0:null,
  mandatoryAdministrator:recipients?.mandatoryAdministrator===true,
  // Transient main-process proof only; inspect IPC returns checks/messages,
  // never this label/role data or account identifiers.
  recipientEvidence:recipients?.known===true?recipients:null,
  // A display name/avatar hash is not a unique account identifier.
  actorKey:null,
  // Equality of a displayed contact only detects changes during this short
  // app session. It is NOT a service account ID or administrator identity proof.
  // Salt is process-local; neither raw contact nor digest is persisted/exposed.
  accountObservationDigest:account?.currentContactObservation?crypto.createHmac('sha256',observationSalt).update(account.currentContactObservation).digest('hex'):null};
}
function createLiveContextProvider({getWebContents,createReader,target,showRecipientReader=false,timeoutMs=12000,diagnostic=()=>{}}={}){
 let reader=null,active=false,closed=false;
 const controller=new AbortController();
 async function screen(kind,url,signal){
  if(signal?.aborted)throw Error('cancelled');
  await reader.loadURL(url);
  const end=Date.now()+timeoutMs;
  while(Date.now()<end){
   if(signal?.aborted||!reader||reader.isDestroyed())throw Error('cancelled');
   const wc=reader.webContents;if(wc.getURL()!==url)throw Error('login-required');
   const result=await wc.executeJavaScriptInIsolatedWorld(17483,[{code:'('+readContextScreen.toString()+')(document,'+JSON.stringify(kind)+')'}]);
   if(result?.known)return result;
   await new Promise(r=>setTimeout(r,100));
  }
  throw Error('context-unverified');
 }
 async function inspect(external){
  if(active||closed)throw Error('busy');
  const signal=external?AbortSignal.any([external,controller.signal]):controller.signal;
  const owner=getWebContents?.(),route=owner&&!owner.isDestroyed()?classRoute(owner.getURL()):null;
  if(!route)throw Error('class-page-unverified');
  active=true;const initialURL=owner.getURL(),started=Date.now();let stage='reader';
  const at=value=>{stage=value;diagnostic({step:'context-provider',state:'started',stage});};
  const abort=()=>{if(reader&&!reader.isDestroyed())reader.destroy();};signal.addEventListener('abort',abort,{once:true});
  try{
   if(signal.aborted)throw Error('cancelled');
   reader=await createReader(owner.session);
   if(signal.aborted)throw Error('cancelled');
   at('group');const group=await screen('group',route.base+'/settings/groupinfo',signal);
   at('account');const account=await screen('account',route.origin+'/ko/main/userinfo',signal);
   at('roster');const roster=await screen('roster',route.base+'/settings/studentlist',signal);
   at('invite');const invite=await screen('invite',route.base+'/settings/invite',signal);
   if(owner.isDestroyed()||owner.getURL()!==initialURL)throw Error('context-changed');
   at('recipients');let recipients=await inspectRecipients(owner,signal,{diagnostic}),modeContents=owner;
   if(!recipients.known&&!/\/boards\/write\/classnews$/.test(initialURL)){
    // The owner may be on the list or a posted result. Inspect the send-target
    // dialog in our disposable same-session reader, never move/overwrite the
    // teacher's existing page. Opening a blank composer does not enter or send.
    at('recipient-reader');await reader.loadURL(route.base+'/boards/classnews');
    // The live service did not open the target modal reliably in a hidden
    // window. In isolated development tests, render the blank composer without
    // taking focus. Account/roster screens have already finished and stay hidden.
    if(showRecipientReader)reader.showInactive();
    await openObservedComposer(reader.webContents,{groupId:route.groupId,signal,
     allowed:()=>!owner.isDestroyed()&&owner.getURL()===initialURL&&!closed});
    recipients=await inspectRecipients(reader.webContents,signal,{diagnostic});
    modeContents=reader.webContents;
   }
   if(owner.isDestroyed()||owner.getURL()!==initialURL)throw Error('context-changed');
   at('publication-mode');const publicationMode=await require('./schoolbell-publication-mode.cjs').inspectPublicationMode(modeContents,signal);
   diagnostic({step:'context-provider',state:'complete',elapsedMs:Date.now()-started});
   return {...summarizeContext({group,account,roster,invite,recipients},target),publicationMode,
    recipientCheck:{...(recipients.known?{known:true,empty:recipients.empty,visibleRows:recipients.visibleRows}:{known:false,reason:recipients.reason}),...require('./schoolbell-recipients.cjs').safeCounts(recipients)},boardId:route.groupId,observedAt:Date.now()};
  }catch(error){
   diagnostic({step:'context-provider',state:'failed',stage,elapsedMs:Date.now()-started,aborted:signal.aborted,
    ownerChanged:owner.isDestroyed()||owner.getURL()!==initialURL,
    reason:['cancelled','login-required','context-changed','context-unverified','date-unverified'].includes(error.message)?error.message:'provider-error'});throw error;
  }finally{signal?.removeEventListener('abort',abort);abort();reader=null;active=false;}
 }
 return {inspect,close(){closed=true;controller.abort();if(reader&&!reader.isDestroyed())reader.destroy();return !active;}};
}
const blockerMessages=Object.freeze({
 'class-page-unverified':'담당 학급의 알림장 화면을 열어 주세요.',
 'class-mismatch':'실제 학급 이름의 학년·반을 앱 설정과 대조하지 못했습니다.',
 'school-unverified':'학급 이름과 별도로 검증할 학교 정보를 확인하지 못했습니다.',
 'year-unverified':'학급의 학년도 정보를 별도로 확인하지 못했습니다.',
 'actor-unverified':'현재 로그인 계정의 고유 식별정보를 확인하지 못했습니다.',
 'teacher-unverified':'현재 계정과 실제 교사·관리자 권한의 일치를 확인하지 못했습니다.',
 'roster-unverified':'학생명단의 빈 입력란 여부를 확인하지 못했습니다.',
 'recipients-unverified':'초대·발행 수신대상 없음을 확인하지 못했습니다.',
 'membership-unverified':'작성 화면의 발행 대상에서 검색하지 않은 전체 구성원 상태를 확인해야 합니다.',
 'notification-policy-unverified':'필수 관리자 알림의 수신자와 허용 범위를 확인해야 합니다.'
});
module.exports={classRoute,readContextScreen,summarizeContext,createLiveContextProvider,blockerMessages};
