'use strict';
// Verification only. No composer, input, upload or send interface is accepted.
// Only an uncertain attempt that already reached post-send verification can be
// completed, with the exact saved content hash and freshly downloaded originals.
const services=require('./diary-services.cjs'),trial=require('./schoolbell-test-authorization.cjs');
const {hash}=require('./media-store.cjs'),{validDate}=require('./schoolbell-date-policy.cjs');
const {fail}=require('./schoolbell-driver-errors.cjs');
function submissionEvidence(records,{attempt,target,note,photos}){
 const digest=trial.contentDigest(note,photos);
 const finals=records.filter(r=>r.event==='test-final-confirmed'&&r.contentSha256===digest&&Number.isFinite(r.time)&&
  Number.isFinite(attempt.time)&&Number.isFinite(attempt.updatedAt)&&r.time>=attempt.time&&r.time<=attempt.updatedAt);
 if(finals.length!==1)fail('publication-unverified');
 const final=finals[0],scopes=records.filter(r=>r.event==='test-scope-approved'&&r.approvalId===final.approvalId);
 const scope=scopes[0];
 if(scopes.length!==1||scope.kind!=='user-approved-development-test'||scope.official!==false||scope.source!=='native-main-confirmation'||
    scope.method!=='electron-ui'||!services.remoteId(scope.boardId)||!Number.isFinite(scope.approvedAt)||!Number.isFinite(scope.expiresAt)||
    scope.approvedAt>final.time||scope.expiresAt<=final.time||
    !['schoolId','schoolName','year','grade','classroom','classKey'].every(k=>scope.target?.[k]===target[k]))fail('context-unverified');
 return {boardId:scope.boardId,approvalId:scope.approvalId};
}
async function reconcile({profile,store,target,note:input,attemptId,permission,readContext,readBaseline,readPhoto,readSubmissionRecords,signal}){
 const note=services.payload(input),fingerprint=services.fingerprint(profile.id,'schoolbell',note);
 const pending=()=>{
  const row=store.get(note.classKey),attempt=row.automaticPosts?.[attemptId];
  if(row.service!=='schoolbell'||!attempt||attempt.status!=='auto-uncertain'||attempt.stage!=='verifying'||
     attempt.hash!==fingerprint||attempt.date!==note.date||attempt.photoCount!==note.photos.length)fail('driver-state');
  if(signal?.aborted||!trial.validTestGrant(permission(),target,'read'))fail('permission-unverified');return attempt;
 };
 pending();
 const context=async()=>{
  pending();const c=await readContext(signal);pending();
  if(!trial.testContext(c,permission())||!['schoolId','schoolName','year','grade','classroom','classKey'].every(k=>c[k]===target[k])||
     c.authenticated!==true||c.service!=='schoolbell'||c.scopeType!=='class'||c.board!=='diary')fail('context-unverified');
  return c;
 };
 const before=await context(),photos=[];
 for(const ref of note.photos){const bytes=Buffer.from(await readPhoto(ref));if(!bytes.length||hash(bytes)!==ref.id.split('.')[0])fail('upload-unverified');photos.push({sha256:hash(bytes),bytes:bytes.length});}
 const submitted=submissionEvidence(await readSubmissionRecords(),{attempt:pending(),target,note,photos});
 if(before.boardId!==submitted.boardId)fail('context-unverified');
 const result=await readBaseline({note,stillPermitted:()=>{try{pending();return true;}catch{return false;}}},signal);pending();
 if(result?.complete!==true||result.refreshed!==true||result.filter?.title!==note.title||!Array.isArray(result.ids)||
    result.ids.some(id=>!services.remoteId(id))||new Set(result.ids).size!==result.ids.length||result.posts?.length!==1)fail('publication-unverified');
 const post=result.posts[0];
 if(!services.remoteId(post.id)||!result.ids.includes(post.id)||post.kind!=='published'||post.title!==note.title||
    typeof post.body!=='string'||post.body.replace(/\r\n?/g,'\n')!==note.body.replace(/\r\n?/g,'\n')||
    !validDate(post.date)||post.dateSource!=='observed-service-ui'||post.scope?.service!=='schoolbell'||post.scope.schoolId!==target.schoolId||
    post.scope.classKey!==target.classKey||post.scope.boardId!==before.boardId||post.attachments?.complete!==true||!Array.isArray(post.attachments.items))fail('publication-unverified');
 const originals=post.attachments.items.map(item=>{
  if(item.state!=='complete'||item.source!=='original-download'||!Buffer.isBuffer(item.bytes)||!item.bytes.length)fail('upload-unverified');
  return {sha256:hash(item.bytes),bytes:item.bytes.length};
 });
 if(JSON.stringify(originals)!==JSON.stringify(photos))fail('upload-unverified');
 const after=await context();
 if(!trial.sameBinding(after,trial.bindingOf(before))||JSON.stringify(after.recipientEvidence)!==JSON.stringify(before.recipientEvidence))fail('context-unverified');
 pending();const publication=services.publication({postId:post.id,boardId:before.boardId,attachmentsVerified:true,photos,verifiedAt:Date.now(),
  executionMode:'development-test',approvalId:permission().approvalId,identitySource:'user-confirmation',servicePermission:'unconfirmed',
  dateMode:'immediate',draftDate:note.date,publishedDate:post.date},photos.length);
 store.reconcileAutomatic(note.classKey,attemptId,fingerprint,publication);
 return {status:'success',attemptId,hash:fingerprint,attachmentsVerified:true,publication,reconciled:true};
}
module.exports={reconcile,submissionEvidence};
