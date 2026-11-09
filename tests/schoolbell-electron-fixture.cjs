// LOCAL SYNTHETIC EVIDENCE ONLY. HTTPS is intercepted by this in-memory Electron
// session's protocol handler; NOTHING reaches Schoolbell. Never ship this file.
const {app,BrowserWindow,session,nativeImage}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createElectronDriver,createRuntimeDriver}=require('../app/schoolbell-electron-driver.cjs');
const {createObservedComposerBridge}=require('../app/schoolbell-observed-composer.cjs');
const {createPublisher}=require('../app/schoolbell-publish.cjs');
const services=require('../app/diary-services.cjs'),media=require('../app/media-store.cjs');
const target={schoolId:'SYNTHETIC',schoolName:'합성 학교',year:'2026',grade:'6',classroom:'1',classKey:'2026:6:1'};
const scope={service:'schoolbell',schoolId:target.schoolId,classKey:target.classKey,boardId:'synthetic-board',scopeType:'class',board:'diary',authenticated:true,teacher:true};
const binding={boardId:scope.boardId,contextId:'synthetic-context',actorKey:'synthetic-teacher'};
const origin='https://schoolbell-e.com',boardURL=origin+'/ko/main/group/100/boards/classnews';
let win,mode='normal',uploads=[],posts=[],clicks=0,caseId=0,grant=true;
const results=[],pass=s=>results.push(s);
const html=`<!doctype html><meta charset="utf-8"><h1>LOCAL SYNTHETIC ONLY</h1>
<main data-synthetic-context="synthetic-context" data-synthetic-teacher="synthetic-teacher" data-synthetic-class="2026:6:1" data-synthetic-date="2026-11-09" data-synthetic-authority="yes" data-upload-state="complete" data-date-known="yes">
<app-boards-write><input placeholder="제목을 입력해 주세요."><div class="fr-element fr-view" contenteditable="true" style="white-space:pre-wrap"></div>
<input type="file" multiple accept=".jpg,.jpeg,.png"><button class="btn-with-description" disabled>보내기</button><button>임시저장</button><app-letter-write-file-list id="uploads"></app-letter-write-file-list></app-boards-write><section id="posts"></section></main>
<script>
const q=s=>document.querySelector(s),meta=q('main'),title=q('[placeholder]'),body=q('[contenteditable]'),input=q('[type=file]'),send=q('.btn-with-description');
window.fixtureModel={title:'',body:'',titleEvents:[],bodyEvents:[]};
title.addEventListener('input',e=>{fixtureModel.title=title.value;fixtureModel.titleEvents.push(e.type);send.disabled=!title.value;});
title.addEventListener('change',e=>fixtureModel.titleEvents.push(e.type));
body.addEventListener('input',e=>{fixtureModel.body=body.innerText;fixtureModel.bodyEvents.push({type:e.type,trusted:e.isTrusted});});
const link=id=>{const a=document.createElement('a');a.href='/original/'+id;a.textContent='synthetic original';return a;};
input.addEventListener('change',async()=>{
 meta.dataset.uploadState='pending';
 const files=await Promise.all([...input.files].map(async f=>({bytes:[...new Uint8Array(await f.arrayBuffer())],name:f.name})));
 const ids=await (await fetch('/upload',{method:'POST',body:JSON.stringify(files)})).json();
 q('#uploads').replaceChildren(...ids.map((id,i)=>{const row=document.createElement('app-file-row'),name=document.createElement('app-file-name-text');
 const base=document.createElement('span'),ext=document.createElement('span'),size=document.createElement('span');
 base.className='text-truncate flex-shrink-1';ext.className='flex-shrink-0';size.className='mx-1 small flex-shrink-0';
 const dot=files[i].name.lastIndexOf('.');base.textContent=files[i].name.slice(0,dot);ext.textContent=files[i].name.slice(dot);size.textContent='(1.92 KB)';
 name.append(base,ext,size);row.append(name,link(id));return row;}));meta.dataset.uploadState='complete';
});
send.addEventListener('click',async()=>{
 if(meta.dataset.syntheticRedirect==='yes')history.replaceState(null,'','/ko/main/group/100/boards/schoolnews');
 const row={title:title.value,body:body.innerText,date:meta.dataset.syntheticDate,originals:[...document.querySelectorAll('#uploads a')].map(a=>Number(a.pathname.split('/').pop()))};
 await fetch('/publish',{method:'POST',body:JSON.stringify(row)});meta.dataset.sent='yes';
});
fetch('/posts').then(r=>r.json()).then(rows=>{for(const row of rows){const el=document.createElement('app-letter-item-long');
 el.dataset.syntheticId=row.id;el.dataset.syntheticDate=row.date;
 const title=document.createElement('app-translation-viewer');title.textContent=row.title;
 const body=document.createElement('app-text-viewer'),text=document.createElement('div');text.className='fr-view';text.textContent=row.body;body.append(text);
 const media=document.createElement('app-media-browser'),files=document.createElement('app-letter-filelist');
 const toggle=document.createElement('div');toggle.className='d-flex align-items-center cursor-pointer';toggle.textContent='첨부파일 ('+row.originals.length+')';files.append(toggle);
 const items=row.originals.map((id,i)=>{const item=document.createElement('div'),base=document.createElement('span'),ext=document.createElement('span'),size=document.createElement('span');
  item.className='file-item text-sm btn-link mb-1';item.style.display='none';item.dataset.syntheticLink=link(id).href;
  base.className='text-truncate';base.textContent='synthetic-'+(i+1);ext.className='text-nowrap';ext.textContent='.png';size.className='file-item-size mx-1 text-nowrap';size.textContent='(1.92 KB)';
  item.append(base,ext,size);item.addEventListener('click',()=>{const a=document.createElement('a');a.href='/download/'+id;a.click();});return item;});
 toggle.addEventListener('click',()=>items.forEach(e=>e.style.display='block'));files.append(...items);el.append(title,body,media,files);const wrapper=document.createElement('div');wrapper.className='notification-post';wrapper.dataset.letterId=row.id;wrapper.append(el);q('#posts').append(wrapper);}meta.dataset.ready='yes';});
</script>`;
const permission=()=>grant?{official:true,method:'electron-ui',evidenceRef:'LOCAL-FIXTURE-NOT-A-SERVICE-GRANT',schoolId:target.schoolId,classKey:target.classKey,
 approvedTestClass:true,actions:['read','input','attachments','submit']}:null;
// Synthetic selectors and meaning exist ONLY in this test. Production has no
// implementation for these missing live-service facts.
function guardDOM(document,r){
 const meta=document.querySelector('main');
 if(meta?.dataset.syntheticAuthority!=='yes'||meta.dataset.syntheticClass!==r.target.classKey||
    meta.dataset.syntheticContext!==r.binding.contextId||meta.dataset.syntheticTeacher!==r.binding.actorKey)return false;
 if(r.action==='commit')return meta.dataset.syntheticDate===r.note.date&&meta.dataset.uploadState==='complete'&&
  document.querySelectorAll('#uploads a').length===r.photos.length;
 return true;
}
async function wait(expression){for(let i=0;i<150;i++){if(await win.webContents.executeJavaScript(expression))return;await new Promise(r=>setTimeout(r,10));}throw Error('fixture timeout');}
async function fresh(){await win.loadURL(boardURL);await wait('document.querySelector("main")?.dataset.ready==="yes"');}
async function originals(links){
 const items=[];for(const link of links){assert.equal(new URL(link).origin,origin);
  // This session protocol handles this request locally; Node's external fetch is never used.
  const response=await win.webContents.session.fetch(link);assert.equal(response.status,200);
  items.push({state:'complete',source:'original-download',bytes:Buffer.from(await response.arrayBuffer())});}
 return {complete:true,items};
}
async function rows(){
 const data=await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('app-letter-item-long')).map(e=>({id:e.dataset.syntheticId,date:e.dataset.syntheticDate,
 title:e.querySelector('app-translation-viewer').textContent,body:e.querySelector('app-text-viewer').textContent,links:Array.from(e.querySelectorAll('app-letter-filelist .file-item')).map(a=>a.dataset.syntheticLink)}))`);
 return Promise.all(data.map(async({links,...row})=>({...row,scope,kind:'published',attachments:await originals(links)})));
}
function evidence(){return {
 guardDOM,finalAction:'single-send',
 async readContext(){const yes=await win.webContents.executeJavaScript('document.querySelector("main")?.dataset.syntheticAuthority==="yes"');
  return {...target,...scope,...binding,identityVerified:yes,authorityVerified:yes,classApproved:yes,testClassApproved:true,
   recipientsVerified:true,students:0,parents:0,externalNotifications:false,observedAt:Date.now()};},
 async readDate(){const d=await win.webContents.executeJavaScript('({...document.querySelector("main").dataset})');return {verified:d.dateKnown==='yes',value:d.syntheticDate,writable:false};},
 async readBaseline(){return {complete:true,refreshed:true,posts:await rows()};},
 async readUploads(){await wait('document.querySelector("main").dataset.uploadState==="complete"');
  return originals(await win.webContents.executeJavaScript('Array.from(document.querySelectorAll("#uploads a")).map(a=>a.href)'));},
 async readPublished(){await wait('document.querySelector("main").dataset.sent==="yes"');await fresh();return {complete:true,refreshed:true,posts:await rows()};}
};}
async function make(count=2,options={}){
 await fresh();grant=true;
 const dir=path.join(app.getPath('userData'),'case-'+(++caseId));fs.mkdirSync(dir);
 const profile={id:target.schoolId,dir,config:{active:{school:{SCHUL_NM:target.schoolName}}}};
 const store=services.createStore(profile);store.select(target.classKey,'schoolbell');
 const photos=media.createStore(dir,b=>nativeImage.createFromBuffer(b).getSize());const refs=[];
 for(let i=0;i<count;i++)refs.push(await photos.add(nativeImage.createFromBitmap(Buffer.from([20+i*80,80,130,255]),{width:1,height:1}).toPNG(),'synthetic.png'));
 const note={classKey:target.classKey,title:'합성 제목 '+caseId,date:'2026-11-09',body:'한글 조합 완료 😊\n\n둘째 줄  공백 <b>일반 문자</b>\n끝',photos:refs};
 const ev=Object.assign(evidence(),options.evidence);
 const driver=createElectronDriver({target,getWebContents:()=>win.webContents,permission,evidence:ev,tempRoot:dir});
 const publisher=createPublisher({profile,store,driver,readPhoto:r=>photos.read(r),review:options.review||(()=>true),gate:()=>({enabled:true}),timeoutMs:5000});
 return {publisher,note,store,photos,driver};
}
global.runSchoolbellElectronTests=async()=>{
 const ses=session.fromPartition('schoolbell-electron-local-fixture');
 await ses.protocol.handle('https',async request=>{
  const u=new URL(request.url);if(u.origin!==origin)return new Response('',{status:403});
  const json=v=>new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json'}});
  if(u.pathname==='/upload'){
   let files=await request.json();if(mode==='partial')files=files.slice(0,-1);if(mode==='reversed')files.reverse();
   const ids=files.map(f=>{uploads.push(Buffer.from(f.bytes));return uploads.length-1;});return json(ids);
  }
  if(u.pathname.startsWith('/original/')){let b=uploads[Number(u.pathname.split('/').pop())];if(mode==='corrupt-upload')b=Buffer.from('corrupt');return new Response(b,{headers:{'Content-Type':'image/png'}});}
  if(u.pathname.startsWith('/download/')){const b=mode==='corrupt-download'?Buffer.from('corrupt'):uploads[Number(u.pathname.split('/').pop())];return new Response(b,{headers:{'Content-Type':'image/png','Content-Disposition':'attachment; filename="synthetic.png"'}});}
  if(u.pathname==='/publish'){clicks++;const row=await request.json();if(mode==='corrupt-post')row.body='합성 결과 불일치';posts.push({...row,id:'synthetic-'+clicks});return json({});}
  if(u.pathname==='/posts')return json(posts);
  return new Response(html,{headers:{'Content-Type':'text/html;charset=utf-8'}});
 });
 // Intercepted HTTPS above is the only resource allowed. No sessions are reused.
 ses.webRequest.onBeforeRequest((d,done)=>done({cancel:!d.url.startsWith(origin+'/')}));
 win=new BrowserWindow({show:false,webPreferences:{session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try{
  let opened=0;
  const blocked=createRuntimeDriver({profile:{id:target.schoolId,config:{active:{school:{SCHUL_NM:target.schoolName}}}},openClass:()=>{opened++;return win;},closeClass:()=>true});
  await assert.rejects(()=>blocked.inspect(scope),e=>e.code==='permission-unverified');assert.equal(opened,0);
  const locked=createPublisher({profile:{},driver:blocked});assert.equal((await locked.publish({})).status,'blocked');assert.equal(opened,0);
  pass('production gate and independent missing grant block before opening a web window');
  for(const count of [0,1,2]){
   const f=await make(count,{evidence:{readPublished:undefined,async readPublishedMetadata(){
    await wait('document.querySelector("main").dataset.sent==="yes"');await fresh();
    const row=posts.at(-1);return {complete:true,refreshed:true,boardURL,id:row.id,date:row.date,scope};
   }}});const result=await f.publisher.publish(f.note);
   assert.equal(result.status,'success',JSON.stringify({result,stage:Object.values(f.store.get(target.classKey).automaticPosts).at(-1)?.stage,dom:await win.webContents.executeJavaScript('({title:document.querySelector("[placeholder]").value,body:document.querySelector("[contenteditable]").innerText,model:fixtureModel})')}));assert.equal(result.publication.photos.length,count);
   assert.equal(f.store.get(target.classKey).automaticPosts[result.attemptId].status,'auto-success');
   for(let i=0;i<count;i++)assert.equal(result.publication.photos[i].sha256,f.note.photos[i].id.split('.')[0]);
   assert.equal(posts.at(-1).body,f.note.body);
   assert.equal(fs.readdirSync(path.join(app.getPath('userData'),'case-'+caseId)).some(n=>n.startsWith('schoolbell-verify-')),false);
   pass('actual Electron adapter: '+count+' original file(s), native text events, one click, refresh and observed UI original downloads');
  }
  const damaged=await make(1,{evidence:{readPublished:undefined,async readPublishedMetadata(){
   await wait('document.querySelector("main").dataset.sent==="yes"');await fresh();
   const row=posts.at(-1);return {complete:true,refreshed:true,boardURL,id:row.id,date:row.date,scope};
  }}});mode='corrupt-download';let damagedBefore=clicks;
  assert.equal((await damaged.publisher.publish(damaged.note)).reason,'publication-unverified');
  assert.equal(clicks,damagedBefore+1);assert.equal((await damaged.publisher.publish(damaged.note)).status,'blocked');
  assert.equal(clicks,damagedBefore+1);assert.equal(fs.readdirSync(path.join(app.getPath('userData'),'case-'+caseId)).some(n=>n.startsWith('schoolbell-verify-')),false);mode='normal';
  pass('corrupt UI-downloaded original prevents success, removes only verification temp files and never republishes');
  const redirected=await make(0,{evidence:{readPublished:undefined,async readPublishedMetadata(){
   await wait('document.querySelector("main").dataset.sent==="yes"');
   assert.equal(new URL(win.webContents.getURL()).pathname.endsWith('/schoolnews'),true);await fresh();
   const row=posts.at(-1);return {complete:true,refreshed:true,boardURL,id:row.id,date:row.date,scope};
  }}});
  await win.webContents.executeJavaScript('document.querySelector("main").dataset.syntheticRedirect="yes"');
  const redirectBefore=clicks;assert.equal((await redirected.publisher.publish(redirected.note)).status,'success');assert.equal(clicks,redirectBefore+1);
  pass('acknowledged one-click navigation to schoolnews is followed by read-only classnews verification');
  const duplicate=await make(2);duplicate.note.title=posts.findLast(row=>row.originals.length===2).title;const duplicateBefore=clicks;
  assert.equal((await duplicate.publisher.publish(duplicate.note)).status,'blocked');assert.equal(clicks,duplicateBefore);
  pass('refreshed persisted content blocks duplicate even with a new local ledger');
  for(const variant of ['partial','reversed','corrupt-upload']){
   const f=await make(2);mode=variant;const before=clicks;
   const result=await f.publisher.publish(f.note);assert.equal(result.status,'uncertain');assert.equal(result.reason,'upload-unverified');assert.equal(clicks,before);
   assert.equal((await f.publisher.publish({...f.note,title:'변경 후'})).status,'blocked');assert.equal(clicks,before);mode='normal';
   pass(variant+' originals block final send and retry; local photos remain readable');
   for(const ref of f.note.photos)assert.ok((await f.photos.read(ref)).length);
  }
  for(const missing of ['readContext','readDate','readUploads','readPublished']){
   const f=await make(0,{evidence:{[missing]:undefined}});const before=clicks;
   const result=await f.publisher.publish(f.note);assert.notEqual(result.status,'success');
   assert.equal(result.reason,({readContext:'context-unverified',readDate:'date-unverified',readUploads:'upload-unverified',readPublished:'publication-unverified'})[missing]);
   assert.equal(clicks,before+(missing==='readPublished'?1:0));
   pass('missing '+missing+' never becomes verified success');
  }
  const cancel=await make(1,{review:({phase})=>phase!=='submit'});let before=clicks;
  assert.equal((await cancel.publisher.publish(cancel.note)).status,'uncertain');assert.equal(clicks,before);
  pass('separate final approval cancellation prevents any click');
  const edit=await make(0,{review:async({phase})=>{if(phase==='submit')await win.webContents.executeJavaScript('document.querySelector("[placeholder]").value="new edit"');return true;}});
  assert.equal((await edit.publisher.publish(edit.note)).status,'uncertain');assert.equal(clicks,before);
  pass('edit while final confirmation is open prevents stale submission');
  const unknownFinal=await make(0,{evidence:{finalAction:undefined}});
  assert.equal((await unknownFinal.publisher.publish(unknownFinal.note)).reason,'publication-unverified');assert.equal(clicks,before);
  pass('unobserved final confirmation semantics prevent send-button click');
  const uncertain=await make(2);mode='corrupt-post';
  assert.equal((await uncertain.publisher.publish(uncertain.note)).status,'uncertain');assert.equal(clicks,before+1);
  assert.equal((await uncertain.publisher.publish(uncertain.note)).status,'blocked');assert.equal(clicks,before+1);mode='normal';
  pass('post-storage mismatch remains uncertain and never retries');
  await fresh();const composer=createObservedComposerBridge({getWebContents:()=>win.webContents,authorize:()=>true,domGuard:guardDOM});
  const req={target,binding,stillPermitted:()=>true};await composer.readStructure(null,null,req);
  await composer.writeTitle({...req,value:'한글 제목'});await composer.writeBodyText({...req,value:'첫 줄\n\n<script>문자</script>  공백'});
  const model=await win.webContents.executeJavaScript('fixtureModel');assert.equal(model.title,'한글 제목');
  assert.deepEqual(model.titleEvents,['input','change']);assert.ok(model.bodyEvents.some(e=>e.trusted));
  assert.equal(model.body,'첫 줄\n\n<script>문자</script>  공백');assert.equal(await win.webContents.executeJavaScript('document.querySelector("[contenteditable]").querySelectorAll("script").length'),0);
  pass('framework event model receives trusted native body input; Korean/newlines/literal HTML preserved');
  await win.webContents.executeJavaScript('document.querySelector("[contenteditable]").dispatchEvent(new CompositionEvent("compositionstart",{bubbles:true}))');
  await assert.rejects(()=>composer.writeBodyText({...req,value:'덮어쓰기'}),/composition-active/);
  await win.webContents.executeJavaScript('document.querySelector("[contenteditable]").dispatchEvent(new CompositionEvent("compositionend",{bubbles:true}))');
  await composer.writeBodyText({...req,value:''});assert.equal((await composer.readFields(req)).body,'');
  pass('active composition blocks replacement; empty body clears through native editing');
  for(const value of ['\n첫 줄\n','한 줄\n\n','  공백  ','줄\r\n다음','\n','']){
   await composer.writeBodyText({...req,value});assert.equal((await composer.readFields(req)).body,value.replace(/\r\n?/g,'\n'));
  }
  pass('replacing existing text preserves leading/trailing empty lines and spaces exactly');
  await win.webContents.executeJavaScript('document.querySelector("main").dataset.syntheticAuthority="no"');
  await assert.rejects(()=>composer.writeTitle({...req,value:'wrong class'}),/context-unverified/);
  assert.equal((await composer.readFields(req)).title,'한글 제목');
  pass('current DOM authority mismatch blocks actual editor mutation');
  await composer.close();return results;
 }finally{if(win&&!win.isDestroyed())win.destroy();ses.protocol.unhandle('https');}
};
app.whenReady().then(()=>{global.schoolbellFixtureReady=true;});
