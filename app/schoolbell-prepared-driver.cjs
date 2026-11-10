// Transaction driver: production permission and registered, session-bound development consent are separate contracts.
// The bridge is trusted main-process code, not settings, renderer input or a remote API.
// Only observed composer selectors are in the probe; unknown date/identity/upload/result
// UI requires separately implemented bridge evidence. Missing evidence always blocks.
const crypto=require('node:crypto');
const {probeComposer}=require('./schoolbell-ui-probe.cjs');
const {remoteId}=require('./diary-services.cjs');
const {fail}=require('./schoolbell-driver-errors.cjs');
const {audienceVerified}=require('./schoolbell-audience.cjs');
const trial=require('./schoolbell-test-authorization.cjs');
const {immediateEvidence,contentDateMatches}=require('./schoolbell-date-policy.cjs');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const text=v=>typeof v==='string'?v.replace(/\r\n?/g,'\n'):null;
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const sameContent=(a,b)=>a.title===b.title&&text(a.body)===text(b.body)&&a.date===b.date&&same(a.photos,b.photos);
function createPreparedDriver({bridge,target,permission=()=>null,publicationMode='fixed',now=Date.now,maxAgeMs=15000,closeTimeoutMs=5000,diagnostic=()=>{}}) {
 target=structuredClone(target);
 if(!target||typeof target.schoolId!=='string'||!target.schoolId||typeof target.schoolName!=='string'||!target.schoolName||
    !/^\d{4}$/.test(target.year)||!/^[1-6]$/.test(target.grade)||typeof target.classroom!=='string'||!target.classroom||
    target.classKey!==[target.year,target.grade,target.classroom].join(':'))fail('context-unverified');
 let phase='idle',controller=new AbortController(),bound=null,boundAudience=null,note=null,baseline=[],photos=[],submitted=false;
 const requirePhase=(...allowed)=>{if(!allowed.includes(phase))fail('driver-state');};
 if(!['fixed','immediate'].includes(publicationMode))fail('date-unverified');
 const matchesContent=(actual,expected,published=false)=>actual.title===expected.title&&text(actual.body)===text(expected.body)&&
  same(actual.photos,expected.photos)&&contentDateMatches(actual,expected,publicationMode,published);
 const signalFor=signal=>signal?AbortSignal.any([signal,controller.signal]):controller.signal;
 function permitted(action) {
  const p=permission();
  if(trial.validTestGrant(p,target,action,now()))return;
  if(p?.official!==true||p.method!=='electron-ui'||typeof p.evidenceRef!=='string'||!p.evidenceRef.trim()||
     p.schoolId!==target.schoolId||p.classKey!==target.classKey||p.approvedTestClass!==true||
     !Array.isArray(p.actions)||!p.actions.includes(action))fail('permission-unverified');
 }
 async function call(method,arg,signal) {
  if(signal.aborted)fail('driver-state');
  if(typeof bridge?.[method]!=='function')fail(({readDate:'date-unverified',writeDate:'date-unverified',readContext:'context-unverified',
   readStructure:'structure-unverified',readUploads:'upload-unverified',readBaseline:'baseline-unverified',readPublished:'publication-unverified'})[method]||'driver-state');
  const value=await bridge[method](arg,signal);
  if(signal.aborted)fail('driver-state');
  return value;
 }
 const scope=c=>({service:'schoolbell',schoolId:target.schoolId,classKey:target.classKey,boardId:c.boardId,
  scopeType:'class',board:'diary',authenticated:true,teacher:c.trial?false:true,...(c.trial?{executionMode:'development-test',approvalId:c.trial.approvalId,identitySource:'user-confirmation',authoritySource:c.trial.authoritySource}:{}),...(publicationMode==='immediate'?{publicationMode}:{}),
  selfNotification:!!c.trial||c.externalNotifications===true&&c.recipientEvidence?.mandatoryAdministrator===true&&c.notificationEvidence?.kind==='current-teacher-only'});
 async function guard(action,signal) {
  diagnostic({step:'prepared-guard',state:'started',phase,action});
  permitted(action);
  const c=await call('readContext',null,signal);permitted(action);
  const test=trial.testContext(c,permission(),now());
  if((!test&&(c?.identityVerified!==true||c.authorityVerified!==true||c.teacher!==true||c.classApproved!==true||typeof c.actorKey!=='string'||!c.actorKey))||c?.authenticated!==true||
     c.service!=='schoolbell'||c.scopeType!=='class'||c.board!=='diary'||!remoteId(c.boardId)||
     !['schoolId','schoolName','year','grade','classroom','classKey'].every(k=>c[k]===target[k])||
     !Number.isFinite(c.observedAt)||c.observedAt>now()||now()-c.observedAt>maxAgeMs||
     typeof c.contextId!=='string'||!c.contextId){
   diagnostic({step:'prepared-guard',state:'failed',phase,action,reason:'context',checks:{
    testAccepted:test,identity:c?.identityVerified===true,authority:c?.authorityVerified===true,
    authenticated:c?.authenticated===true,scope:c?.service==='schoolbell'&&c.scopeType==='class'&&c.board==='diary',
    boardIdValid:!!remoteId(c?.boardId),targetMatch:!!c&&['schoolId','schoolName','year','grade','classroom','classKey'].every(k=>c[k]===target[k]),
    fresh:Number.isFinite(c?.observedAt)&&c.observedAt<=now()&&now()-c.observedAt<=maxAgeMs,
    contextIdPresent:typeof c?.contextId==='string'&&!!c.contextId}});fail('context-unverified');
  }
  if(!audienceVerified(c,permission(),now())){diagnostic({step:'prepared-guard',state:'failed',phase,action,reason:'audience-unverified'});fail('test-class-unverified');}
  const audience=JSON.stringify([c.students,c.parents,c.externalNotifications,c.recipientEvidence||null,
   c.notificationEvidence?.kind||null,c.notificationEvidence?.actorKey||null,c.notificationEvidence?.otherTargets??null]);
  if(boundAudience!==null&&boundAudience!==audience){diagnostic({step:'prepared-guard',state:'failed',phase,action,reason:'audience-changed'});fail('test-class-unverified');}
  boundAudience=audience;
  const binding=trial.bindingOf(c);
  if(bound&&!same(bound,binding)){diagnostic({step:'prepared-guard',state:'failed',phase,action,reason:'binding-changed'});fail('context-unverified');}
  bound=binding;return scope(c);
 }
 async function act(action,method,value,signal) {
  await guard(action,signal);
  return call(method,{value,target:structuredClone(target),binding:{...bound},
   stillPermitted:()=>{try{permitted(action);return !signal.aborted;}catch{return false;}}},signal);
 }
 function expectScope(expected) {
  if(expected?.schoolId!==target.schoolId||expected.classKey!==target.classKey||
     (expected.boardId&&expected.boardId!==bound?.boardId))fail('context-unverified');
 }
 async function structure(signal) {
  const p=await call('readStructure',probeComposer,signal);
  if(p?.schema!==1||p.kind!=='schoolbell-composer-structure'||p.structureMatched!==true||p.composerCount!==1||
     !['title','body','photos','send','saveDraft'].every(k=>p[k]?.count===1)||
     p.title.enabled!==true||p.body.enabled!==true||p.photos.enabled!==true)fail('structure-unverified');
  return p;
 }
 async function readDate(signal) {
  const d=await call('readDate',null,signal);
  if(publicationMode==='immediate'?!immediateEvidence(d):d?.verified!==true||!date(d.value))fail('date-unverified');return d;
 }
 // Require independently downloaded original bytes, not filenames, preview URLs or claimed hashes.
 function originals(value,code) {
  if(value?.complete!==true||!Array.isArray(value.items))fail(code);
  return value.items.map(item=>{
   if(item?.state!=='complete'||item.source!=='original-download'||
      !(Buffer.isBuffer(item.bytes)||item.bytes instanceof Uint8Array)||item.bytes.length===0)fail(code);
   return {sha256:sha(item.bytes),bytes:item.bytes.length};
  });
 }
 async function content(signal) {
  const d=await readDate(signal),uploaded=originals(await call('readUploads',null,signal),'upload-unverified');
  const c=await call('readContent',null,signal);
  if(typeof c?.title!=='string'||typeof c.body!=='string'||typeof c.revision!=='string'||!c.revision)fail('content-unverified');
  return {title:c.title,body:c.body,date:d.value,...(publicationMode==='immediate'?{publicationMode,draftDate:note.date}:{}),revision:c.revision,semanticRevision:c.semanticRevision,photos:uploaded};
 }
 function post(raw) {
  if(!remoteId(raw?.id)||typeof raw.title!=='string'||typeof raw.body!=='string'||!date(raw.date)||
     raw.kind!=='published'||raw.scope?.boardId!==bound.boardId||raw.scope?.schoolId!==target.schoolId||
     raw.scope?.classKey!==target.classKey||raw.scope?.service!=='schoolbell')fail('publication-unverified');
  if(publicationMode==='immediate'&&raw.dateSource!=='observed-service-ui')fail('publication-unverified');
  return {id:raw.id,title:raw.title,body:raw.body,date:raw.date,...(publicationMode==='immediate'?{publicationMode,draftDate:note?.date,dateSource:raw.dateSource}:{}),photos:originals(raw.attachments,'publication-unverified')};
 }
 async function inspect(expected,externalSignal) {
  requirePhase('idle','inspected','baselined','opened','filled','attached','reviewed','submitted');
  if(phase==='idle'){controller=new AbortController();bound=null;boundAudience=null;note=null;baseline=[];photos=[];submitted=false;}
  const signal=signalFor(externalSignal);expectScope(expected);const c=await guard('read',signal);
  if(phase==='idle')phase='inspected';return c;
 }
 async function snapshot({scope:expected,note:input},externalSignal) {
  requirePhase('inspected');expectScope(expected);const signal=signalFor(externalSignal);await guard('read',signal);
  const result=await call('readBaseline',{note:structuredClone(input)},signal);await guard('read',signal);
  if(result?.complete!==true||result.refreshed!==true||!Array.isArray(result.posts))fail('baseline-unverified');
  const rows=result.posts.map(post),filtered=Array.isArray(result.ids),ids=filtered?result.ids:rows.map(r=>r.id);
  if(filtered&&(result.filter?.title!==input.title||ids.some(id=>!remoteId(id))||rows.some(r=>r.title!==input.title||!ids.includes(r.id))))fail('baseline-unverified');
  if(new Set(rows.map(r=>r.id)).size!==rows.length)fail('baseline-unverified');
  if(new Set(ids).size!==ids.length)fail('baseline-unverified');
  note=structuredClone(input);if(!date(note.date)||note.classKey!==target.classKey)fail('date-unverified');
  const matching=rows.filter(r=>r.title===note.title&&text(r.body)===text(note.body)&&(publicationMode==='immediate'||r.date===note.date)&&
   same(r.photos.map(p=>p.sha256),note.photos.map(p=>p.id.split('.')[0]))).length;
  baseline=ids;phase='baselined';return {ids:[...ids],matching};
 }
 async function openComposer(expected,externalSignal) {
  requirePhase('baselined');expectScope(expected);const signal=signalFor(externalSignal);await guard('input',signal);
  await act('input','openComposer',null,signal);await guard('input',signal);await structure(signal);
  const d=await readDate(signal);if(publicationMode!=='immediate'&&d.value!==note.date&&d.writable!==true)fail('date-unverified');
  phase='opened';
 }
 async function fill(input,externalSignal) {
  requirePhase('opened');const signal=signalFor(externalSignal);
  if(!['title','body','date'].every(k=>input[k]===note[k]))fail('content-unverified');
  await guard('input',signal);await structure(signal);
  const d=await readDate(signal);if(publicationMode!=='immediate'&&d.value!==note.date&&d.writable!==true)fail('date-unverified');
  // Unknown date fails before the first title/body mutation. Plain text only; no HTML injection.
  if(publicationMode!=='immediate'&&d.value!==note.date){await act('input','writeDate',note.date,signal);await guard('input',signal);}
  await act('input','writeTitle',note.title,signal);await guard('input',signal);
  await act('input','writeBodyText',note.body,signal);await guard('input',signal);
  const c=await call('readContent',null,signal),currentDate=await readDate(signal);
  if(c?.title!==note.title||text(c.body)!==text(note.body)||(publicationMode!=='immediate'&&currentDate.value!==note.date))fail('content-unverified');
  phase='filled';
 }
 async function attach(files,externalSignal) {
  requirePhase('filled');const signal=signalFor(externalSignal);await guard('attachments',signal);
  const p=await structure(signal);
  if(files.length!==note.photos.length||files.some((f,i)=>f.id!==note.photos[i].id||sha(f.bytes)!==f.id.split('.')[0]))fail('upload-unverified');
  if(files.length>1&&p.photos.multiple!==true)fail('structure-unverified');
  for(const f of files){const ext=f.id.split('.').at(-1);if(!({png:p.photos.accepts?.png,jpg:p.photos.accepts?.jpeg,jpeg:p.photos.accepts?.jpeg}[ext]))fail('upload-unverified');}
  photos=files.map(f=>({sha256:sha(f.bytes),bytes:f.bytes.length}));
  if(files.length)await act('attachments','attachFiles',files.map(f=>({id:f.id,bytes:Buffer.from(f.bytes)})),signal);
  await guard('attachments',signal);
  if(!same(originals(await call('readUploads',null,signal),'upload-unverified'),photos))fail('upload-unverified');
  phase='attached';
 }
 async function readComposer(externalSignal) {
  requirePhase('attached','reviewed');const signal=signalFor(externalSignal);await guard('read',signal);await structure(signal);
  const c=await content(signal);await guard('read',signal);
  if(!matchesContent(c,{...note,photos}))fail('content-unverified');
  if(typeof bridge.checkCommit==='function')await call('checkCommit',{target:structuredClone(target),binding:{...bound},revision:c.revision,semanticRevision:c.semanticRevision,note:structuredClone(note),photos:structuredClone(photos),stillPermitted:()=>{try{permitted('read');return !signal.aborted;}catch{return false;}}},signal);
  phase='reviewed';return c;
 }
 async function submit(expected,externalSignal) {
  requirePhase('reviewed');expectScope(expected.scope);const signal=signalFor(externalSignal);
  if(submitted||!same(expected.beforeIds,baseline)||!sameContent({...expected.note,photos:expected.photos},{...note,photos}))fail('driver-state');
  await guard('submit',signal);const p=await structure(signal),c=await content(signal);await guard('submit',signal);
  if(p.send.enabled!==true||!matchesContent(c,{...note,photos}))fail('content-unverified');
  submitted=true;phase='submitted'; // Consume before awaiting: failed/unknown commits can never be retried.
  // The approved bridge must check this binding + revision + whole content and current permission
  // atomically with its single UI click, including changes occurring after the reads above.
  const committed=await call('commitOnce',{target:structuredClone(target),binding:{...bound},revision:c.revision,semanticRevision:c.semanticRevision,
   note:structuredClone(note),photos:structuredClone(photos),beforeIds:[...baseline],
   stillPermitted:()=>{try{permitted('submit');return !signal.aborted;}catch{return false;}}},signal);
  if(committed?.clicked!==true)fail('publication-unverified');
 }
 async function readPublished(expected,externalSignal) {
  requirePhase('submitted');expectScope(expected);const signal=signalFor(externalSignal);permitted('read');
  // Actual send may redirect to schoolnews even when the post was saved in
  // classnews. The read-only provider must revisit the previously bound board;
  // do not infer success from the redirect or attempt another send. Validate
  // the full current binding AFTER that read-only navigation and before proof.
  const result=await call('readPublished',null,signal);const current=await guard('read',signal);
  if(result?.complete!==true||result.refreshed!==true||!Array.isArray(result.posts))fail('publication-unverified');
  const rows=result.posts.map(post);
  if(new Set(rows.map(r=>r.id)).size!==rows.length)fail('publication-unverified');
  const matches=rows.filter(r=>!baseline.includes(r.id)&&matchesContent(r,{...note,photos},true));
  if(matches.length!==1)fail('publication-unverified');phase='published';
  return {...matches[0],kind:'published',refreshed:true,scope:current};
 }
 async function close() {
  controller.abort();phase='closing';let timer;
  try {
   const stopped=await Promise.race([Promise.resolve().then(()=>bridge.close()),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),closeTimeoutMs);})]);
   if(stopped!==true)return false;phase='idle';return true;
  }catch{return false;}finally{clearTimeout(timer);}
 }
 return {inspect,snapshot,openComposer,fill,attach,readComposer,submit,readPublished,close};
}
module.exports={createPreparedDriver};
