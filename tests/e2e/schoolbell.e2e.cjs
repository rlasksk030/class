// Synthetic official-origin pages only. No credentials, actual students or real outbound publication.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {_electron}=require('playwright-core'),services=require('../../app/diary-services.cjs');
const ROOT=path.resolve(__dirname,'../..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'schoolbell-e2e-'));
let app,page,count=0;const pass=name=>{count++;console.log('PASS '+name);};
async function launch(){
 app=await _electron.launch({executablePath:require('electron'),args:['--no-sandbox',path.join(ROOT,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:profile}});
 page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
 await app.evaluate(({ipcMain,dialog,BrowserWindow,session,shell},root)=>{
  ipcMain.removeHandler('fetch');ipcMain.handle('fetch',()=>{throw Error('offline');});
  globalThis.confirmResponse=1;dialog.showMessageBox=async()=>({response:globalThis.confirmResponse});
  const fs=process.mainModule.require('fs'),path=process.mainModule.require('path');
  globalThis.exportDir=fs.mkdtempSync(path.join(process.mainModule.require('os').tmpdir(),'schoolbell-export-'));
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[globalThis.exportDir]});shell.openPath=async()=> '';
  globalThis.requestCount=0;
  const hooked=new WeakSet();
  const hook=ses=>{
   if(hooked.has(ses))return;hooked.add(ses);
   ses.protocol.handle('https',request=>{
    globalThis.requestCount++;if(globalThis.failPage)throw Error('offline fixture');
    return new Response('<!doctype html><meta charset="utf-8"><h1>가상 학급 알림장</h1><p>Local fixture only</p>',{headers:{'content-type':'text/html; charset=utf-8'}});
   });
  };
  process.mainModule.require('electron').app.on('session-created',hook);
  // Existing default session and HiClass legacy session cannot make a real request either.
  hook(session.defaultSession);hook(session.fromPartition('persist:hiclass-teacher'));
 },ROOT);
 await page.evaluate(()=>{localStorage.setItem('settings',JSON.stringify({grade:'6',classroom:'1'}));localStorage.setItem('dashboardLocked','false');});
 await page.reload();await page.click('#diaryTab');
 await page.waitForFunction(()=>!document.querySelector('#diaryService').disabled);
}
const note=()=>page.evaluate(()=>({classKey:[academicYear(),settings.grade,settings.classroom].join(':'),date:document.querySelector('#diaryDate').value,title:document.querySelector('#diaryTitle').value,body:document.querySelector('#diaryBody').value,photos:Object.values(JSON.parse(localStorage.getItem('diaryDrafts'))).find(x=>x.body===document.querySelector('#diaryBody').value)?.photos||[]}));
async function ready(){await page.waitForFunction(()=>!document.querySelector('#diaryService').disabled);}
const state=async()=>page.evaluate(()=>desktop.diaryServiceStatus([academicYear(),settings.grade,settings.classroom].join(':')));
(async()=>{try{
 await launch();
 assert.equal(await page.inputValue('#diaryService'),'hiclass');pass('legacy default HiClass');
 await page.fill('#diaryTitle','가상 제목');await page.fill('#diaryBody','가상 본문');
 // NativeImage generates valid fixture PNGs; no student photo exists in this test.
 const images=await app.evaluate(({nativeImage})=>[1,2].map(n=>{
  const image=nativeImage.createFromBitmap(Buffer.from([20*n,50,90,255]),{width:1,height:1});
  return [...image.toPNG()];
 }));
 for(let i=0;i<2;i++)await page.locator('#diaryPhotoFiles').setInputFiles({name:'synthetic-'+i+'.png',mimeType:'image/png',buffer:Buffer.from(images[i])});
 await page.waitForFunction(()=>document.querySelectorAll('#diaryPhotos figure').length===2);
 await page.selectOption('#diaryService','schoolbell');await ready();
 assert.ok(await page.locator('#diarySchoolbell').isVisible());assert.ok(!await page.locator('.diary-recipients').isVisible());assert.ok(!await page.locator('#diaryPublish').isVisible());
 assert.equal(await page.inputValue('#diaryBody'),'가상 본문');pass('service switch preserves common draft/photos and hides HiClass recipient controls');
 await page.click('#schoolbellOpen');await ready();
 const to=await page.evaluate(()=>({classKey:[academicYear(),settings.grade,settings.classroom].join(':'),year:String(academicYear()),grade:settings.grade,classroom:settings.classroom}));
 const browser=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https://schoolbell-e.com')).id);
 const isolated=await app.evaluate(async({BrowserWindow},id)=>{
  const w=BrowserWindow.fromId(id),prefs=w.webContents.getLastWebPreferences();
  let rejected=false;try{await process.mainModule.require('electron').ipcMain._invokeHandlers.get('schoolbell:copy')({sender:w.webContents,senderFrame:w.webContents.mainFrame},{});}catch{rejected=true;}
  return {sandbox:prefs.sandbox,node:prefs.nodeIntegration,preload:!!prefs.preload,rejected};
 },browser);
 assert.deepEqual(isolated,{sandbox:true,node:false,preload:false,rejected:true});pass('remote window has no preload, Node or trusted IPC access');
 await app.evaluate(({BrowserWindow},id)=>BrowserWindow.fromId(id).loadURL('https://schoolbell-e.com/ko/classes/synthetic/notes'),browser);
 await page.fill('#schoolbellSchool','다른초등학교');await page.fill('#schoolbellGrade','6');await page.fill('#schoolbellClass','1');
 await page.click('#schoolbellLink');await ready();assert.match(await page.textContent('#diaryStatus'),/다릅니다/);assert.equal((await state()).link,null);pass('wrong school blocks manual class confirmation');
 await page.fill('#schoolbellSchool','옥구초등학교');await page.click('#schoolbellLink');await ready();assert.equal((await state()).link.confirmation,'teacher-manual');pass('matching teacher confirmation is explicitly manual, never authenticated success');
 const payload=await note();
 await page.click('#schoolbellPrepare');await ready();let st=await state();assert.equal(st.posts.length,1);assert.equal(st.posts[0].status,'manual-pending');
 await page.click('#schoolbellCopyBody');await ready();assert.equal(await app.evaluate(({clipboard})=>clipboard.readText()),payload.body);
 await page.click('#schoolbellPhotos');await ready();
 const exported=await app.evaluate(()=>{const fs=process.mainModule.require('fs'),path=process.mainModule.require('path'),dir=path.join(globalThis.exportDir,fs.readdirSync(globalThis.exportDir)[0]);return fs.readdirSync(dir).sort().map(n=>[n,[...fs.readFileSync(path.join(dir,n))]]);});
 assert.deepEqual(exported.map(x=>x[0]),['01.png','02.png']);assert.deepEqual(exported.map(x=>x[1]),images);pass('copy/export preserve exact photo bytes and order, remain pending');
 await page.click('#schoolbellPrepare');await ready();assert.equal((await state()).posts.length,1);assert.match(await page.textContent('#diaryStatus'),/미확인|같은 내용/);pass('duplicate handoff blocked');
 await app.evaluate(({BrowserWindow},id)=>BrowserWindow.fromId(id).destroy(),browser);
 await app.close();app=null;await launch();assert.equal(await page.inputValue('#diaryService'),'schoolbell');assert.equal(await page.inputValue('#diaryBody'),'가상 본문');assert.equal(await page.locator('#diaryPhotos figure').count(),2);assert.equal((await state()).posts[0].status,'manual-pending');pass('restart restores service, draft, photos and unresolved publication');
 await page.fill('#diaryTitle','바뀐 제목');await page.click('#schoolbellPrepare');await ready();assert.equal((await state()).posts.length,1);pass('editing content cannot bypass unresolved handoff');
 const hash=(await state()).posts[0].hash;
 await app.evaluate(()=>globalThis.confirmResponse=0);
 const cancelled=await page.evaluate(({key,hash})=>desktop.schoolbellResolve({classKey:key,hash,outcome:'manual-confirmed'}),{key:to.classKey,hash});assert.equal(cancelled.status,'cancelled');assert.equal((await state()).posts[0].status,'manual-pending');
 await app.evaluate(()=>globalThis.confirmResponse=1);
 await page.evaluate(({key,hash})=>desktop.schoolbellResolve({classKey:key,hash,outcome:'manual-confirmed'}),{key:to.classKey,hash});
 assert.equal((await state()).posts[0].status,'manual-confirmed');assert.equal(await page.inputValue('#diaryBody'),'가상 본문');pass('explicit result confirmation records manual outcome without clearing newer edits');
 await page.selectOption('#diaryService','hiclass');await ready();assert.ok(await page.locator('#diaryPublish').isVisible());assert.equal(await page.locator('#diaryPhotos figure').count(),2);pass('return to HiClass retains draft and photos');
 await page.selectOption('#diaryService','schoolbell');await ready();
 await app.evaluate(()=>globalThis.failPage=true);
 await page.click('#schoolbellPrepare');await ready();
 const unresolved=(await state()).posts.find(p=>p.status==='manual-pending');
 assert.ok(unresolved);assert.match(await page.textContent('#diaryStatus'),/마치지 못했습니다/);
 const attempts=await app.evaluate(()=>globalThis.requestCount);
 await page.click('#schoolbellPrepare');await ready();
 assert.equal(await app.evaluate(()=>globalThis.requestCount),attempts);assert.equal(await page.locator('#diaryPhotos figure').count(),2);pass('network failure preserves draft/photos and pending record, duplicate never retries network');
 await page.evaluate(({key,hash})=>desktop.schoolbellResolve({classKey:key,hash,outcome:'manual-not-posted'}),{key:to.classKey,hash:unresolved.hash});
 await app.evaluate(()=>globalThis.failPage=false);
 await page.click('#schoolbellPrepare');await ready();assert.equal((await state()).posts.find(p=>p.hash===unresolved.hash).status,'manual-pending');
 pass('explicit not-posted confirmation permits deliberate recovery from failed handoff');
 const another=await page.evaluate(()=>desktop.diaryServiceStatus('2026:6:2'));
 assert.equal(another.service,'hiclass');assert.deepEqual(another.posts,[]);pass('another class has independent selection, link and publication history');
 // Inspect sessions via real Electron cookie APIs, with synthetic cookie values.
 const sessions=await app.evaluate(async({session},root)=>{
  const s=process.mainModule.require(root+'/app/diary-services.cjs');
  const tuples=[['P10-8342104','schoolbell','2026:6:1'],['P10-8342104','schoolbell','2026:6:2'],['B10-7010001','schoolbell','2026:6:1'],['P10-8342104','hiclass','2026:6:1']];
  const sessions=tuples.map(t=>session.fromPartition(s.partition(...t)));
  await sessions[0].cookies.set({url:'https://schoolbell-e.com',name:'fixture',value:'synthetic'});
  return Promise.all(sessions.map(s=>s.cookies.get({name:'fixture'}).then(c=>c.length)));
 },ROOT);
 assert.deepEqual(sessions,[1,0,0,0]);pass('real Electron cookie stores isolate school, class and service');
 const ipc=await app.evaluate(async({BrowserWindow})=>{
  const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('file:')),{ipcMain}=process.mainModule.require('electron');
  const handler=ipcMain._invokeHandlers.get('schoolbell:publish');
  return handler({sender:w.webContents,senderFrame:w.webContents.mainFrame},{});
 });
 assert.equal(ipc.status,'blocked');pass('automatic Schoolbell publication disabled in main process');
 console.log(count+'/'+count+' passed');
}finally{if(app)await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
