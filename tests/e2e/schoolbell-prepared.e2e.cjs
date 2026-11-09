// LOCAL ONLY: observed composer shape, plain contenteditable (not the real Froala runtime).
// All identity/date/revision/result-ID fields below are explicitly synthetic bridge evidence.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {_electron}=require('playwright-core');
const services=require('../../app/diary-services.cjs'),{createPublisher}=require('../../app/schoolbell-publish.cjs');
const {createPreparedDriver}=require('../../app/schoolbell-prepared-driver.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'schoolbell-prepared-e2e-'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const target={schoolId:'SYNTHETIC',schoolName:'합성 시험 학교',year:'2026',grade:'6',classroom:'1',classKey:'2026:6:1'};
const scope={service:'schoolbell',schoolId:target.schoolId,classKey:target.classKey,boardId:'synthetic-board',scopeType:'class',board:'diary',authenticated:true,teacher:true};
let app,page,origin,passed=0,requests=0,uploads=[],posts=[],mode='normal',caseId=0;
const pass=s=>{passed++;console.log('PASS '+s);};
const html=`<!doctype html><meta charset="utf-8"><h1>LOCAL SYNTHETIC — no Schoolbell connection</h1>
<app-boards-write><input placeholder="제목을 입력해 주세요."><div class="fr-element fr-view" contenteditable="true"></div>
<input type="file" accept=".jpg,.jpeg,.png" multiple><button class="btn-with-description" disabled>보내기</button><button>임시저장</button>
<input data-synthetic-date type="date" value="2026-11-09"><section id="synthetic-uploads"></section></app-boards-write>
<section id="synthetic-posts"></section><script>
window.fixture={ready:false,rev:0,uploaded:false,submitted:false,dateKnown:true};
const q=s=>document.querySelector(s),root=q('app-boards-write'),title=q('[placeholder]'),body=q('[contenteditable]'),file=q('[type=file]'),send=q('.btn-with-description');
root.addEventListener('input',()=>{fixture.rev++;send.disabled=!(title.value&&body.textContent);});
function original(id){const a=document.createElement('a');a.className='synthetic-original';a.href='/originals/'+id;a.download='synthetic.png';a.textContent='synthetic original';return a;}
file.onchange=async()=>{fixture.rev++;fixture.uploaded=false;q('#synthetic-uploads').replaceChildren();
 const bytes=await Promise.all([...file.files].map(async f=>[...new Uint8Array(await f.arrayBuffer())]));
 const ids=await (await fetch('/uploads',{method:'POST',body:JSON.stringify(bytes)})).json();
 ids.forEach(id=>q('#synthetic-uploads').append(original(id)));fixture.rev++;fixture.uploaded=true;};
send.onclick=async()=>{await fetch('/posts',{method:'POST',body:JSON.stringify({title:title.value,body:body.textContent,date:q('[data-synthetic-date]').value,
 originals:[...q('#synthetic-uploads').querySelectorAll('a')].map(a=>Number(a.getAttribute('href').split('/').pop()))})});fixture.submitted=true;};
fetch('/posts').then(r=>r.json()).then(rows=>{for(const row of rows){const card=document.createElement('app-letter-item-long');card.dataset.syntheticId=row.id;card.dataset.syntheticDate=row.date;
 const title=document.createElement('app-translation-viewer');title.textContent=row.title;const body=document.createElement('app-text-viewer');body.textContent=row.body;
 const media=document.createElement('app-media-browser');row.originals.forEach(id=>media.append(original(id)));card.append(title,body,media);q('#synthetic-posts').append(card);}fixture.ready=true;});
</script>`;
const server=http.createServer(async(req,res)=>{
 const json=v=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(v));};
 if(req.url==='/uploads'&&req.method==='POST'){
  let raw='';for await(const b of req)raw+=b;let files=JSON.parse(raw);if(mode==='partial-upload')files=files.slice(0,-1);
  const ids=files.map(bytes=>{uploads.push(Buffer.from(bytes));return uploads.length-1;});json(ids);
 }else if(req.url==='/posts'&&req.method==='POST'){
  let raw='';for await(const b of req)raw+=b;const row=JSON.parse(raw);requests++;
  if(mode==='corrupt-result')row.body='합성 저장 결과 불일치';posts.push({...row,id:'synthetic-'+requests});json({});
 }else if(req.url==='/posts')json(posts);
 else if(/^\/originals\/\d+$/.test(req.url)){const b=uploads[Number(req.url.split('/').pop())];res.writeHead(b?200:404,{'content-type':'image/png'});res.end(b||'');}
 else{res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html);}
});
const ready=()=>page.waitForFunction(()=>window.fixture?.ready===true);
async function rows() {
 const data=await page.locator('app-letter-item-long').evaluateAll(elements=>elements.map(e=>({id:e.dataset.syntheticId,kind:'published',date:e.dataset.syntheticDate,
  title:e.querySelector('app-translation-viewer').textContent,body:e.querySelector('app-text-viewer').textContent,
  links:[...e.querySelectorAll('app-media-browser a.synthetic-original')].map(a=>a.href)})));
 return Promise.all(data.map(async({links,...row})=>({...row,scope,attachments:await originals(links,true)})));
}
async function originals(links,complete) {
 const items=[];
 for(const link of links){assert.equal(new URL(link).origin,origin);const r=await fetch(link,{redirect:'error'});assert.equal(r.status,200);
  items.push({state:'complete',source:'original-download',bytes:Buffer.from(await r.arrayBuffer())});}
 return {complete,items};
}
async function atomic(operation,r,signal) {
 assert.equal(signal.aborted,false);assert.equal(r.stillPermitted(),true);
 const request={...r};delete request.stillPermitted;
 if(operation==='files')request.value=r.value.map(f=>({id:f.id,bytes:[...f.bytes]}));
 await page.evaluate(({operation,r})=>{
  const root=document.querySelector('app-boards-write'),one=s=>{const nodes=root.querySelectorAll(s);if(nodes.length!==1)throw Error('ambiguous fixture DOM');return nodes[0];};
  if(r.binding.contextId!=='synthetic-context'||r.binding.actorKey!=='synthetic-teacher'||r.target.classKey!=='2026:6:1')throw Error('fixture binding');
  const title=one('[placeholder="제목을 입력해 주세요."]'),body=one('div.fr-element.fr-view[contenteditable="true"]'),date=one('[data-synthetic-date]');
  if(operation==='title')title.value=r.value;
  if(operation==='body')body.textContent=r.value;
  if(operation==='date')date.value=r.value;
  if(['title','body','date'].includes(operation))root.dispatchEvent(new Event('input',{bubbles:true}));
  if(operation==='files'){const transfer=new DataTransfer();r.value.forEach((f,i)=>transfer.items.add(new File([new Uint8Array(f.bytes)],'synthetic-'+i+'.png',{type:'image/png'})));
   const input=one('input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));}
  if(operation==='submit'){
   if(String(fixture.rev)!==r.revision||title.value!==r.note.title||body.textContent!==r.note.body||date.value!==r.note.date)throw Error('stale fixture revision');
   const send=one('button.btn-with-description');if(send.disabled)throw Error('disabled fixture submit');send.click();
  }
 },{operation,r:request});
}
async function makePublisher(label,photoBuffers) {
 await page.goto(origin);await ready();
 const profile={id:target.schoolId,dir:path.join(dir,'case-'+(++caseId))};fs.mkdirSync(profile.dir);
 const store=services.createStore(profile);store.select(target.classKey,'schoolbell');
 const note={classKey:target.classKey,date:'2026-11-09',title:'합성 '+label,body:'한글 본문\n\n둘째 줄  공백',photos:photoBuffers.map(b=>({id:hash(b)+'.png'}))};
 const bridge={
  async readContext(){assert.equal(new URL(page.url()).origin,origin);return {...target,...scope,identityVerified:true,authorityVerified:true,classApproved:true,testClassApproved:true,
   recipientsVerified:true,students:0,parents:0,externalNotifications:false,contextId:'synthetic-context',actorKey:'synthetic-teacher',observedAt:Date.now()};},
  async readStructure(probe){return page.evaluate(source=>(0,eval)('('+source+')(document)'),probe.toString());},
  async readDate(){return {verified:await page.evaluate(()=>fixture.dateKnown),writable:true,value:await page.inputValue('[data-synthetic-date]')};},
  async readBaseline(){return {complete:true,refreshed:true,posts:await rows()};},
  async openComposer(){},
  writeDate:(r,s)=>atomic('date',r,s),writeTitle:(r,s)=>atomic('title',r,s),writeBodyText:(r,s)=>atomic('body',r,s),
  async attachFiles(r,s){await atomic('files',r,s);await page.waitForFunction(()=>fixture.uploaded);},
  async readContent(){return {title:await page.inputValue('[placeholder="제목을 입력해 주세요."]'),body:await page.locator('div.fr-element.fr-view').textContent(),revision:await page.evaluate(()=>String(fixture.rev))};},
  async readUploads(){const links=await page.locator('#synthetic-uploads a').evaluateAll(a=>a.map(e=>e.href));return originals(links,await page.evaluate(()=>document.querySelector('[type=file]').files.length===0||fixture.uploaded));},
  async commitOnce(r,s){await atomic('submit',r,s);await page.waitForFunction(()=>fixture.submitted);return {clicked:true};},
  async readPublished(){await page.reload();await ready();return {complete:true,refreshed:true,posts:await rows()};},
  async close(){return true;}
 };
 const driver=createPreparedDriver({target,bridge,permission:()=>({official:true,method:'electron-ui',evidenceRef:'LOCAL-SYNTHETIC-ONLY',
  schoolId:target.schoolId,classKey:target.classKey,approvedTestClass:true,actions:['read','input','attachments','submit']})});
 const args={profile,store,driver,readPhoto:ref=>photoBuffers.find(b=>hash(b)===ref.id.split('.')[0]),review:()=>true,gate:()=>({enabled:true}),timeoutMs:15000};
 const publisher=createPublisher(args);return {note,publisher,store,args};
}
(async()=>{try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});origin='http://127.0.0.1:'+server.address().port;
 const entry=path.join(dir,'main.cjs');fs.writeFileSync(entry,`const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const w=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});w.webContents.session.webRequest.onBeforeRequest((d,done)=>done({cancel:!d.url.startsWith(${JSON.stringify(origin+'/')})}));w.loadURL(${JSON.stringify(origin)});});`);
 app=await _electron.launch({executablePath:require('electron'),args:['--no-sandbox',entry]});page=await app.firstWindow();await ready();
 const buffers=(await app.evaluate(({nativeImage})=>[1,2].map(n=>[...nativeImage.createFromBitmap(Buffer.from([n*50,90,160,255]),{width:1,height:1}).toPNG()]))).map(b=>Buffer.from(b));
 for(const count of [0,1,2]){
  const f=await makePublisher('사진 '+count,buffers.slice(0,count));const r=await f.publisher.publish(f.note);
  assert.equal(r.status,'success',JSON.stringify(r));assert.deepEqual(r.publication.photos,buffers.slice(0,count).map(b=>({sha256:hash(b),bytes:b.length})));
  assert.equal(f.store.get(target.classKey).automaticPosts[r.attemptId].status,'auto-success');
  pass('observed DOM shape: '+count+' file(s) uploaded to local server and original bytes re-downloaded after publication');
 }
 const duplicate=await makePublisher('사진 2',buffers),before=requests;
 assert.equal((await duplicate.publisher.publish(duplicate.note)).status,'blocked');assert.equal(requests,before);
 pass('fresh local ledger still blocks duplicate found in refreshed remote fixture');
 const unknown=await makePublisher('날짜 미확인',buffers);await page.evaluate(()=>fixture.dateKnown=false);
 assert.equal((await unknown.publisher.publish(unknown.note)).reason,'date-unverified');assert.equal(await page.inputValue('[placeholder]'),'');assert.equal(requests,before);
 pass('unknown date prevents first title/body/file mutation');
 const partial=await makePublisher('일부 업로드',buffers);mode='partial-upload';
 assert.equal((await partial.publisher.publish(partial.note)).reason,'upload-unverified');assert.equal(requests,before);
 pass('partial uploaded originals stop before final submit');
 mode='corrupt-result';const uncertain=await makePublisher('결과 불일치',buffers);
 assert.equal((await uncertain.publisher.publish(uncertain.note)).status,'uncertain');assert.equal(requests,before+1);
 assert.equal((await uncertain.publisher.publish({...uncertain.note,title:'변경 후'})).status,'blocked');assert.equal(requests,before+1);
 pass('changed persisted result remains uncertain and blocks all retries');
 console.log(passed+'/'+passed+' passed (local synthetic bridge only; live Schoolbell NOT RUN)');
}finally{
 if(app){const child=app.process();if(child.exitCode===null&&child.signalCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill('SIGKILL');await exited;}}
 server.closeAllConnections();server.close();
}})().catch(e=>{console.error(e);process.exitCode=1;});
