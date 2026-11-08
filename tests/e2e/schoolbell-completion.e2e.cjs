// Common-editor completion contract only. IPC responses/permission are synthetic.
// No live driver is installed; no Schoolbell account, session or publication is used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {_electron}=require('playwright-core');
const ROOT=path.resolve(__dirname,'../..'),OUT=require('../output.cjs');
const profile=fs.mkdtempSync(path.join(OUT,'schoolbell-completion-'));
let app,page,count=0;
const pass=name=>{count++;console.log('PASS '+name);};
const ready=()=>page.waitForFunction(()=>!document.querySelector('#diaryService').disabled);
const body=()=>page.inputValue('#diaryBody');
const photos=()=>page.locator('#diaryPhotos figure').count();
const history=()=>page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('diaryRegistrationHistory')||'{}')).flat());
async function configure(value){await app.evaluate((_,v)=>Object.assign(globalThis.fixture,v),value);}
async function draft(label){await page.fill('#diaryTitle','합성 '+label);await page.fill('#diaryBody','합성 본문 '+label);}
async function publish(){await page.click('#schoolbellPublish');await ready();}
async function heldStart(){await configure({hold:true});await page.click('#schoolbellPublish');await app.evaluate(async()=>{while(!globalThis.releaseFixture)await new Promise(r=>setTimeout(r,10));});}
async function release(){await app.evaluate(()=>{globalThis.fixture.hold=false;globalThis.releaseFixture();globalThis.releaseFixture=null;});await ready();}
(async()=>{try{
 app=await _electron.launch({executablePath:require('electron'),args:['--no-sandbox',path.join(ROOT,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:profile}});
 page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
 await app.evaluate(({ipcMain,session},root)=>{
  for(const scheme of ['http','https'])session.defaultSession.protocol.handle(scheme,()=>new Response('',{status:503}));
  ipcMain.removeHandler('fetch');ipcMain.handle('fetch',()=>{throw Error('offline fixture');});
  const req=process.mainModule.require;
  const store=req(root+'/app/diary-services.cjs').createStore(req(root+'/app/school-profile.cjs').get());
  globalThis.fixture={enabled:false,result:'success',receipt:'verified',hold:false,attachmentsVerified:true,calls:0};
  const original=ipcMain._invokeHandlers.get('diary-service:status');
  ipcMain.removeHandler('diary-service:status');
  ipcMain.handle('diary-service:status',async(e,key)=>{
   if(globalThis.fixture.statusError)throw Error('fixture status unavailable');
   const state=await original(e,key);
   return {...state,capability:{enabled:globalThis.fixture.enabled,message:'LOCAL SYNTHETIC TEST ONLY'}};
  });
  ipcMain.removeHandler('schoolbell:publish');
  ipcMain.handle('schoolbell:publish',async(_e,note)=>{
   const f={...globalThis.fixture};globalThis.fixture.calls++;
   globalThis.submitted=structuredClone(note);
   if(f.hold)await new Promise(resolve=>globalThis.releaseFixture=resolve);
   if(f.result==='throw')throw Error('fixture offline');
   if(f.result!=='success')return {status:f.result,message:'합성 '+f.result};
   const attempt=store.beginAutomatic(note);
   if(attempt.blocked)return {status:'blocked',message:'합성 중복 차단'};
   if(f.receipt==='manual'){
    store.automaticState(note.classKey,attempt.id,{status:'auto-uncertain',stage:'verifying'});
    store.resolveAutomatic(note.classKey,attempt.id,'auto-user-confirmed');
   }else{
    store.automaticState(note.classKey,attempt.id,{status:'auto-pending',stage:'verifying'});
    store.automaticState(note.classKey,attempt.id,{status:'auto-success',stage:'verifying'});
   }
   return {status:'success',attemptId:f.receipt==='missing'?'missing':attempt.id,hash:attempt.hash,attachmentsVerified:f.attachmentsVerified};
  });
 },ROOT);
 await page.evaluate(()=>{localStorage.setItem('settings',JSON.stringify({grade:'6',classroom:'1'}));localStorage.setItem('dashboardLocked','false');});
 await page.reload();await page.click('#diaryTab');await ready();await page.selectOption('#diaryService','schoolbell');await ready();
 assert.equal(await page.locator('#schoolbellPublish').isDisabled(),true);
 await page.evaluate(()=>document.querySelector('#schoolbellPublish').onclick());
 assert.equal(await app.evaluate(()=>globalThis.fixture.calls),0);
 pass('disabled production capability blocks even direct click handler invocation');
 await configure({enabled:true});await page.click('#dashboardTab');await page.click('#diaryTab');await ready();
 const date=await page.inputValue('#diaryDate');
 const png=Buffer.from(await app.evaluate(({nativeImage})=>[...nativeImage.createFromBitmap(Buffer.from([90,40,150,255]),{width:1,height:1}).toPNG()]));
 const addPhoto=async()=>{const n=await photos();await page.locator('#diaryPhotoFiles').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:png});await page.waitForFunction(n=>document.querySelectorAll('#diaryPhotos figure').length===n+1,n);};
 await draft('보존');await addPhoto();
 for(const result of ['error','cancelled','blocked','uncertain','throw']){
  await configure({result});await publish();assert.equal(await body(),'합성 본문 보존');assert.equal(await photos(),1);assert.equal((await history()).length,0);
 }
 pass('failure, cancellation, blocked response, uncertainty and exception retain body/photos');
 await configure({result:'success',attachmentsVerified:false});await draft('미검증 사진');await publish();
 assert.equal(await photos(),1);assert.equal((await history()).length,0);
 await configure({attachmentsVerified:true,receipt:'manual'});await draft('사용자 확인');await publish();
 assert.equal(await body(),'합성 본문 사용자 확인');assert.equal((await history()).length,0);
 await configure({receipt:'missing'});await draft('이력 누락');await publish();
 assert.equal(await photos(),1);assert.equal((await history()).length,0);
 pass('missing photo proof, manual confirmation and unmatched persisted receipt never clear draft');
 await configure({receipt:'verified'});await draft('성공');await publish();
 assert.equal(await body(),'');assert.equal(await photos(),0);
 let entries=await history();assert.equal(entries.length,1);assert.equal(entries[0].service,'schoolbell');assert.equal(entries[0].photos.length,1);assert.equal(entries[0].body,'합성 본문 성공');
 await page.reload();await page.click('#diaryTab');await ready();assert.equal(await body(),'');assert.equal((await history()).length,1);
 pass('verified automatic receipt saves service-tagged original history before clearing; reload restores new draft');
 await draft('사진 없음');await publish();assert.equal(await body(),'');assert.equal((await history()).at(-1).photos.length,0);
 pass('verified no-photo success creates new draft');
 await draft('등록 중 편집');await heldStart();await page.fill('#diaryBody','새로 쓴 본문');await addPhoto();await release();
 assert.equal(await body(),'새로 쓴 본문');assert.equal(await photos(),1);assert.equal((await history()).at(-1).body,'합성 본문 등록 중 편집');assert.equal((await history()).at(-1).photos.length,0);
 pass('new text and photo added during posting are preserved; history uses submitted snapshot');
 await draft('날짜 이동');await heldStart();await page.fill('#diaryDate','2027-01-12');await page.dispatchEvent('#diaryDate','change');await draft('다른 날짜');await release();
 assert.equal(await body(),'합성 본문 다른 날짜');
 await page.fill('#diaryDate',date);await page.dispatchEvent('#diaryDate','change');assert.equal(await body(),'');assert.equal(await photos(),0);
 pass('success clears only submitted date and leaves newly edited date intact');
 // Force only the post-success storage write to fail, after the preflight autosave.
 await draft('기록 저장 실패');await addPhoto();await heldStart();
 await page.evaluate(()=>{window.realSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='diaryRegistrationHistory')throw Error('quota fixture');return window.realSetItem.call(this,k,v);};});
 const before=(await history()).length;await release();assert.equal(await body(),'합성 본문 기록 저장 실패');assert.equal(await photos(),1);assert.equal((await history()).length,before);
 await page.evaluate(()=>{Storage.prototype.setItem=window.realSetItem;});
 pass('history storage failure keeps complete draft and does not report a fresh draft');
 await draft('새 초안 저장 실패');await heldStart();
 await page.evaluate(()=>{Storage.prototype.setItem=function(k,v){if(k==='diaryDrafts')throw Error('quota fixture');return window.realSetItem.call(this,k,v);};});
 await release();assert.equal(await body(),'합성 본문 새 초안 저장 실패');assert.equal(await photos(),1);assert.equal((await history()).at(-1).body,'합성 본문 새 초안 저장 실패');
 await page.evaluate(()=>{Storage.prototype.setItem=window.realSetItem;});
 await page.reload();await page.click('#diaryTab');await ready();assert.equal(await body(),'합성 본문 새 초안 저장 실패');assert.equal(await photos(),1);
 pass('new-draft storage failure preserves saved body/photos and verified history across reload');
 await draft('학급 이동');await heldStart();await page.click('#dashboardTab');
 await page.evaluate(()=>{settings.classroom='2';});await page.click('#diaryTab');await draft('다른 학급');await release();
 assert.equal(await body(),'합성 본문 다른 학급');assert.equal(await page.inputValue('#diaryService'),'hiclass');
 await page.click('#dashboardTab');await page.evaluate(()=>{settings.classroom='1';});await page.click('#diaryTab');await ready();assert.equal(await body(),'');assert.equal(await photos(),0);
 pass('class switch during posting cannot clear or relabel another class draft');
 await page.selectOption('#diaryService','hiclass');await ready();assert.equal(await page.locator('#diaryPublish').isVisible(),true);
 pass('return to HiClass retains existing publishing controls');
 console.log(count+'/'+count+' passed (synthetic IPC only; live Schoolbell remains BLOCKED)');
}finally{if(app)await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
