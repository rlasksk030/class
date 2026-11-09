// Posting coordinator, not a Schoolbell website driver. Production is gated off.
// Only an approved, observed UI driver may implement this contract; tests use local fixtures.
const crypto=require('node:crypto');
const services=require('./diary-services.cjs');
const capability=require('./schoolbell-capability.cjs');
const {publicFailure}=require('./schoolbell-driver-errors.cjs');
const {contentDateMatches}=require('./schoolbell-date-policy.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const text=s=>typeof s==='string'?s.replace(/\r\n?/g,'\n'):null;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function matches(actual,expected) {
 return actual?.service==='schoolbell' && actual.schoolId===expected.schoolId && actual.classKey===expected.classKey &&
  actual.scopeType==='class' && actual.board==='diary' && services.remoteId(actual.boardId) &&
  actual.authenticated===true && actual.teacher===true && (!expected.boardId || actual.boardId===expected.boardId)&&
  (expected.selfNotification===undefined||(actual.selfNotification===true)===expected.selfNotification);
}
function contentMatches(actual,note,photos,mode='fixed',published=false) {
 return contentDateMatches(actual,note,mode,published) && actual.title===note.title && text(actual.body)===text(note.body) &&
  Array.isArray(actual.photos) && same(actual.photos.map(p=>({sha256:p.sha256,bytes:p.bytes})),photos);
}
function createPublisher({profile,store,readPhoto,driver=null,review,gate=capability.status,timeoutMs=20000}) {
 let running=false;
 async function publish(value) {
  const access=gate();
  if(!access.enabled || !driver)return {...access,status:'blocked'};
  if(running)return {status:'busy'};
  running=true;
  let note,attempt,stage='prepared',controller=new AbortController();
  // No retries. A timed-out operation is aborted and can never lead to a later submit.
  async function step(fn) {
   if(controller.signal.aborted)throw Error('cancelled');
   let timer;
   try{return await Promise.race([Promise.resolve().then(()=>fn(controller.signal)),new Promise((_,reject)=>{
    timer=setTimeout(()=>{controller.abort();reject(Error('timeout'));},timeoutMs);
   })]);}finally{clearTimeout(timer);}
  }
  function checkLocal() {
   if(controller.signal.aborted || !gate().enabled || store.get(note.classKey).service!=='schoolbell')throw Error('context');
  }
  function record(next) {
   checkLocal();stage=next;store.automaticState(note.classKey,attempt.id,{status:'auto-pending',stage});
  }
  const message='학교종이 게시 결과를 확인하지 못했습니다. 초안과 사진은 유지됩니다. 자동으로 재전송하지 않으며 실제 게시물을 먼저 확인해 주세요.';
  try {
   note=services.payload(value);
   if(!/^\d{4}:[1-6]:[가-힣a-zA-Z0-9][가-힣a-zA-Z0-9 -]{0,23}$/.test(note.classKey))throw Error('class');
   checkLocal();
   // Read original bytes, independently verify content-addressed identity, retain order.
   const files=[];
   for(const ref of note.photos){const bytes=Buffer.from(await step(()=>readPhoto(ref)));
    if(hash(bytes)!==ref.id.split('.')[0])throw Error('photo');files.push({id:ref.id,bytes});}
   const expectedPhotos=files.map(f=>({sha256:hash(f.bytes),bytes:f.bytes.length}));
   const expected={schoolId:profile.id,classKey:note.classKey};
   const observed=await step(signal=>driver.inspect(expected,signal));
   if(!matches(observed,expected))throw Error('identity');
   expected.boardId=observed.boardId;
   expected.selfNotification=observed.selfNotification===true;
   expected.publicationMode=observed.publicationMode||'fixed';
   if(!['fixed','immediate'].includes(expected.publicationMode))throw Error('date');
   const baseline=await step(signal=>driver.snapshot({scope:{...expected},note:structuredClone(note)},signal));
   if(!Array.isArray(baseline?.ids) || baseline.ids.some(id=>typeof id!=='string') || baseline.matching!==0)throw Error('duplicate');
   // The driver must not write or upload anything before the local confirmation and pending record.
   if(typeof review!=='function' || await step(()=>review({phase:'prepare',scope:{...expected},note:structuredClone(note)}))!==true)return {status:'cancelled'};
   checkLocal();
   attempt=store.beginAutomatic(note);
   if(attempt.blocked)return {status:'blocked',message:'이전 수동 또는 자동 등록 결과를 먼저 확인해 주세요.'};
   record('opening');await step(signal=>driver.openComposer(expected,signal));
   record('input');await step(signal=>driver.fill({title:note.title,body:note.body,date:note.date},signal));
   record('attachments');await step(signal=>driver.attach(files,signal));
   record('review');
   if(!matches(await step(signal=>driver.inspect(expected,signal)),expected) ||
      !contentMatches(await step(signal=>driver.readComposer(signal)),note,expectedPhotos,expected.publicationMode))throw Error('partial');
   // Separate final permission after the actual composer and attachment bytes have been checked.
   if(await step(()=>review({phase:'submit',scope:{...expected},note:structuredClone(note),photos:structuredClone(expectedPhotos)}))!==true)
    throw Error('final-confirmation-cancelled');
   record('submitting');
   // Single final action. The driver must atomically recheck identity/content immediately before clicking.
   await step(signal=>driver.submit({scope:{...expected},note:structuredClone(note),photos:expectedPhotos,beforeIds:[...baseline.ids]},signal));
   record('verifying');
   const result=await step(signal=>driver.readPublished(expected,signal));
   if(result?.kind!=='published' || result.refreshed!==true || !services.remoteId(result.id) ||
      baseline.ids.includes(result.id) || !matches(result.scope,expected) ||
      !contentMatches(result,note,expectedPhotos,expected.publicationMode,true))throw Error('unverified');
   checkLocal();
   const publication=services.publication({postId:result.id,boardId:expected.boardId,
    ...(expected.publicationMode==='immediate'?{dateMode:'immediate',draftDate:note.date,publishedDate:result.date}:{}),
    photos:expectedPhotos,attachmentsVerified:true,verifiedAt:Date.now()},note.photos.length);
   store.automaticState(note.classKey,attempt.id,{status:'auto-success',stage,publication});
   // No draft writes here. Caller may clear only an unchanged snapshot after saving history.
   return {status:'success',hash:attempt.hash,attemptId:attempt.id,attachmentsVerified:true,publication};
  } catch (error) {
   controller.abort();
   if(attempt?.id){try{store.automaticState(note.classKey,attempt.id,{status:'auto-uncertain',stage});}catch{/* pending remains fail-closed */}}
   return {status:attempt?.id?'uncertain':'blocked',message,...publicFailure(error)};
  } finally {
   controller.abort();
   // Closing the driver must stop all outstanding work; never run a retry or background timer.
   try{if(await driver.close()===true)running=false;}catch{/* Remain busy if outstanding work cannot be stopped. */}
  }
 }
 return {publish,busy:()=>running};
}
module.exports={createPublisher,matches,contentMatches};
