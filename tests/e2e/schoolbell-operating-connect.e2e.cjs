// Real main/preload/editor connection wiring with synthetic main-owned evidence.
// All HTTPS is intercepted. This test never calls publish/input/upload/save.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {_electron}=require('playwright-core'),root=path.resolve(__dirname,'../..');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'schoolbell-operating-connect-'));let app;
(async()=>{try{
 app=await _electron.launch({executablePath:require('electron'),args:['--no-sandbox',path.join(root,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:profile}});
 const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
 await app.evaluate(({app,session,ipcMain,dialog},root)=>{
  const hook=s=>s.protocol.handle('https',()=>new Response('<!doctype html><p>synthetic connection only</p>',{headers:{'content-type':'text/html'}}));
  hook(session.defaultSession);app.on('session-created',hook);
  ipcMain.removeHandler('fetch');ipcMain.handle('fetch',()=>{throw Error('offline fixture');});
  globalThis.connectionConfirmations=0;dialog.showMessageBox=async(_w,o)=>{if(o.message==='현재 로그인과 담당 학급을 연결할까요?')globalThis.connectionConfirmations++;return {response:1};};
  process.mainModule.require(root+'/app/schoolbell-live-context.cjs').createLiveContextProvider=({target,getWebContents})=>({close:()=>true,inspect:async()=>({...target,
   boardId:new URL(getWebContents().getURL()).pathname.split('/')[4],observedAt:Date.now(),actorKey:null,identityVerified:false,authorityVerified:false,
   accountObservationDigest:'synthetic-session',managementObservationDigest:'synthetic-admin',adminCount:1,
   checks:{classPage:true,gradeClass:true,adminSettingsEditable:true},recipientEvidence:{known:true,unfiltered:true,empty:false,selectionScope:'class-roles',targetLabel:'synthetic class recipients',
    roles:Object.fromEntries(['administrator','guardian1','guardian2','student'].map(k=>[k,{checked:true,disabled:k==='administrator'}]))}})});
 },root);
 await page.evaluate(()=>{localStorage.setItem('settings',JSON.stringify({grade:'1',classroom:'2'}));localStorage.setItem('dashboardLocked','false');});
 await page.reload();await page.click('#diaryTab');await page.waitForFunction(()=>!document.querySelector('#diaryService').disabled);
 await page.selectOption('#diaryService','schoolbell');await page.waitForFunction(()=>!document.querySelector('#diaryService').disabled);
 const target=await page.evaluate(()=>({year:academicYear(),grade:settings.grade,classroom:settings.classroom,classKey:[academicYear(),settings.grade,settings.classroom].join(':')}));
 assert.equal(await page.locator('#schoolbellPublish').isDisabled(),true);
 await page.click('#schoolbellOpen');await page.waitForFunction(()=>!document.querySelector('#diaryService').disabled);
 await app.evaluate(async({BrowserWindow})=>{await BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https://schoolbell-e.com')).loadURL('https://schoolbell-e.com/ko/main/group/100/boards/classnews');});
 await page.click('#schoolbellConnectOperating');await page.waitForFunction(()=>!document.querySelector('#diaryService').disabled);
 const state=await page.evaluate(key=>desktop.diaryServiceStatus(key),target.classKey);
 assert.equal(state.operatingConnection.connected,true,JSON.stringify(state));assert.equal(state.capability.enabled,true);assert.equal(await page.locator('#schoolbellPublish').isEnabled(),true);
 assert.equal(await app.evaluate(()=>globalThis.connectionConfirmations),1);assert.equal(state.automaticPosts.length,0);
 console.log('PASS real main/preload/editor: confirmed class enables only its register button, without publishing');
 await app.evaluate(async({BrowserWindow})=>{await BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https://schoolbell-e.com')).loadURL('https://schoolbell-e.com/ko/main/group/101/boards/classnews');});
 await page.click('#dashboardTab');await page.click('#diaryTab');await page.waitForFunction(()=>!document.querySelector('#diaryService').disabled);
 assert.equal(await page.locator('#schoolbellPublish').isDisabled(),true);
 const changed=await page.evaluate(key=>desktop.diaryServiceStatus(key),target.classKey);assert.equal(changed.operatingConnection.connected,false);assert.equal(changed.automaticPosts.length,0);
 console.log('PASS real navigation revokes class permission and disables registration; no test approval reused');
 }finally{if(app)await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
