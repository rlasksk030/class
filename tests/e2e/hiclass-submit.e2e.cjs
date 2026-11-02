// Offline, real renderer fixtures. No credentials, genuine session, or public registration.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron}=require('playwright-core');
const ROOT=path.resolve(__dirname,'../..'),PROFILE=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'classroom-submit-'));
const MODULE=path.join(ROOT,'app/hiclass-adapter.cjs'),FLOW=path.join(ROOT,'app/hiclass-submit.cjs');
const LINK={url:'https://www.hiclass.net/main/clazzes/test/note/test',title:'옥구초등학교 6학년 1반'};
const PAYLOAD={parents:false,students:true,title:'fixture title',body:'fixture body'};
let app,count=0;const pass=s=>{count++;console.log('PASS '+s);};
async function fixture(config={}){
 await app.evaluate(async({BrowserWindow,session},arg)=>{
  if(!globalThis.fixtureWindow){const s=session.fromPartition('submit-offline');s.protocol.handle('https',()=>new Response(globalThis.fixtureHTML,{headers:{'content-type':'text/html; charset=utf-8'}}));globalThis.fixtureWindow=new BrowserWindow({show:false,webPreferences:{session:s}});}
  fixtureWindow.hiclassBackgroundError=null;fixtureWindow.webContents.setWindowOpenHandler(()=>{fixtureWindow.hiclassBackgroundError='별도 창 요청으로 자동 등록 중단';return {action:'deny'};});
  const {config:c,link,payload}=arg;
  globalThis.fixtureHTML=`<!doctype html><meta charset="utf-8"><strong>${link.title}</strong><button id="outside">등록</button><article class="repeat"><strong>old</strong>old body</article><div role="dialog" id="editor"><textarea placeholder="제목을 입력하세요.">${payload.title}</textarea><div class="fr-element fr-view" contenteditable="true">${payload.body}</div><div id="targets"><div role="checkbox" aria-checked="${c.preMismatch?'true':'false'}">학부모</div><div role="checkbox" aria-checked="true">학생</div></div><button id="register">등록</button>${c.duplicate?'<button>등록</button>':''}</div><script>
  const config=${JSON.stringify(c)},payload=${JSON.stringify(payload)};window.registerClicks=0;window.finalClicks=0;
  window.addEventListener('click',e=>{if(config.trustedMismatch&&e.target.id==='confirm')document.querySelector('[role=checkbox]').setAttribute('aria-checked','true');},true);
  register.onclick=()=>{window.registerClicks++;if(config.popup)window.open("https://www.hiclass.net/required-popup");const controls=document.querySelectorAll('[role=checkbox]');if(config.partialMismatch){controls[0].style.display='none';controls[1].setAttribute('aria-checked','false');}if(config.hidden)targets.style.display='none';if(config.removed)targets.remove();if(config.unreadable)controls.forEach(e=>e.removeAttribute('aria-checked'));if(config.mismatch)controls[0].setAttribute('aria-checked','true');if(config.ambiguous){const e=controls[1].cloneNode(true);targets.append(e);}if(config.noPopup)return;
   const wrap=document.createElement('div');if(config.swal)wrap.className='swal2-container';const d=document.createElement('div');d.setAttribute('role','dialog');if(!config.nonModal)d.setAttribute('aria-modal','true');if(config.swal)d.className='swal2-popup';const message=config.unknown?'삭제하시겠습니까?':'작성한 내용을\\n 지금  클래스 구성원들에게 보내시겠습니까?';const text=document.createElement('div');if(config.swal)text.className='swal2-html-container';text.textContent=message;d.append(text);const cancel=document.createElement('button');cancel.textContent='취소';cancel.onclick=()=>wrap.remove();d.append(cancel);const confirm=document.createElement('button');confirm.id='confirm';confirm.textContent='확인';if(config.swal)confirm.className='swal2-confirm';confirm.onclick=()=>{window.finalClicks++;wrap.remove();editor.remove();if(!config.noArticle){const a=document.createElement('article');a.className='repeat';const title=document.createElement('strong');title.textContent=payload.title;a.append(title,document.createTextNode(config.wrongBody?'different':payload.body));document.body.append(a);}};d.append(confirm);wrap.append(d);document.body.append(wrap);
  };
  </script>`;
  await fixtureWindow.loadURL(link.url);
 },{config,link:LINK,payload:PAYLOAD});
}
const begin=(options={})=>app.evaluate(async(_,arg)=>{
 const adapter=process.mainModule.require(arg.module),flow=process.mainModule.require(arg.flow);
 const before=await flow.articleSnapshot(fixtureWindow,arg.payload);globalThis.stages=[];
 globalThis.result=null;globalThis.submission=adapter.submit(fixtureWindow,arg.payload,before,arg.link,{popupTimeout:600,resultTimeout:600,manualTimeout:4000,...arg.options,onStage:s=>stages.push(s)}).then(status=>result={status},e=>result={error:e.message,safeToRetry:e.safeToRetry});
},{module:MODULE,flow:FLOW,payload:PAYLOAD,link:LINK,options});
const finish=()=>app.evaluate(async()=>{await submission;return {result,stages,finalClicks:await fixtureWindow.webContents.executeJavaScript('window.finalClicks'),registerClicks:await fixtureWindow.webContents.executeJavaScript('window.registerClicks'),unlocked:await fixtureWindow.webContents.executeJavaScript('!window.__classroomSubmitTransaction')};});
(async()=>{try{
 app=await _electron.launch({executablePath:require('electron'),args:[path.join(ROOT,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:PROFILE}});
 await (await app.firstWindow()).waitForLoadState('domcontentloaded');
 for(const [name,c,mode] of [['current generic modal',{},'live'],['legacy SweetAlert',{swal:true},'live'],['hidden controls',{hidden:true},'snapshot'],['removed controls',{removed:true},'snapshot'],['erased aria state',{unreadable:true},'snapshot']]){
  await fixture(c);await begin();const r=await finish();assert.equal(r.result.status,'success');assert.equal(r.finalClicks,1);assert.equal(r.stages.find(s=>s.stage==='F').recipientVerification,mode);assert.equal(r.stages.find(s=>s.stage==='B'&&s.snapshot).snapshot.parents,false);assert.equal(r.unlocked,true);assert.equal(await app.evaluate(()=>fixtureWindow.isVisible()),false);pass(name+': verified snapshot, normalized popup and new article without showing window');
 }
 for(const [name,c] of [['pre-click mismatch',{preMismatch:true}],['post-popup mismatch',{mismatch:true}],['partially hidden controls with readable mismatch',{partialMismatch:true}],['ambiguous targets',{ambiguous:true}],['unknown confirmation',{unknown:true}],['no modal snapshot proof',{hidden:true,nonModal:true}],['duplicate composer register',{duplicate:true}],['no confirmation',{noPopup:true}],['native popup requested before final confirmation',{popup:true}]]){
  await fixture(c);await begin();const r=await finish();assert.ok(r.result.error);assert.equal(r.finalClicks,0);assert.equal(r.unlocked,true);if(c.preMismatch||c.duplicate)assert.equal(r.registerClicks,0);if(c.mismatch||c.ambiguous)assert.equal(r.result.safeToRetry,true);pass(name+': final publication blocked');
 }
 await fixture();await begin({autoConfirm:false});
 const target=(await app.windows()).find(p=>p.url()===LINK.url);
 await target.waitForSelector('#confirm');await target.click('#confirm');const manual=await finish();assert.equal(manual.result.status,'success');assert.equal(manual.stages.find(s=>s.stage==='H').manual,true);pass('trusted manual confirmation continues through actual article verification');
 await fixture({trustedMismatch:true});await begin({autoConfirm:false});await target.waitForSelector('#confirm');await target.click('#confirm');const blocked=await finish();assert.ok(blocked.result.error);assert.equal(blocked.finalClicks,0);pass('trusted manual confirmation is blocked when recipients change');
 await fixture();await begin({autoConfirm:false});await target.waitForSelector('#confirm');await target.getByText('취소',{exact:true}).click();const cancelled=await finish();assert.ok(cancelled.result.error);assert.equal(cancelled.finalClicks,0);assert.equal(cancelled.result.safeToRetry,true);pass('manual cancellation remains safely retryable');
 for(const c of [{noArticle:true},{wrongBody:true}]){await fixture(c);await begin();const r=await finish();assert.ok(r.result.error);assert.equal(r.finalClicks,1);assert.equal(r.result.safeToRetry,false);assert.equal(r.stages.some(s=>s.stage==='H'),false);pass('unverified result stays uncertain, never success');}
 // Exercise the actual IPC ledger: only a proven non-publication may remove this attempt's pending marker.
 const main=(await app.windows()).find(p=>p.url()!==LINK.url);
 for(const safeToRetry of [true,false]){
  await app.evaluate(({app},arg)=>{
   const fs=process.mainModule.require('node:fs'),path=process.mainModule.require('node:path'),adapter=process.mainModule.require(arg.module);
   fs.writeFileSync(path.join(app.getPath('userData'),'hiclass-links.json'),JSON.stringify({links:{fixture:arg.link},posts:{existing:{status:'success',time:1}}}));
   adapter.prepare=async()=>({ids:[],matching:0});adapter.submit=async()=>{const e=Error('fixture submit stopped');e.safeToRetry=arg.safeToRetry;throw e;};
  },{module:MODULE,link:LINK,safeToRetry});
  const r=await main.evaluate(p=>window.desktop.diaryPublish({...p,classKey:'fixture',date:'2026-10-06'}),PAYLOAD);
  assert.equal(r.status,safeToRetry?'error':'uncertain');
  const ledger=await app.evaluate(({app})=>JSON.parse(process.mainModule.require('node:fs').readFileSync(process.mainModule.require('node:path').join(app.getPath('userData'),'hiclass-links.json'),'utf8')).posts);
  assert.equal(ledger.existing.status,'success');assert.equal(Object.keys(ledger).length,safeToRetry?1:2);
  pass(safeToRetry?'proven cancellation permits retry without losing earlier history':'uncertain publication retains duplicate guard and prior history');
 }
 console.log(`${count}/${count} passed`);
}finally{if(app)await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
