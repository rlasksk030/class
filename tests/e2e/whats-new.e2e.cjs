// "What's new" after an update. The running version is reported as the newest version in NOTES through the update:state handler;
// isolated profiles only, no network.
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const {_electron}=require('playwright-core');
const ROOT=path.resolve(__dirname,'../..'),OUT=require('../output.cjs');
let count=0,current=null;
const NOTES=require('../../app/whats-new.js').NOTES,W=require('../../app/whats-new.js');
const NEW=Object.keys(NOTES).sort((a,b)=>W.compare(b,a))[0],[MA,MI,PA]=W.parse(NEW);
const OLD=`${MA}.${MI}.${PA-1}`,NONE=`${MA}.${MI}.${PA+2}`;const pass=n=>{count++;console.log('PASS '+n);};
const lastSeen=new Map();let currentPage=null,currentProfile=null;
async function launch(profile,version){
 const app=await _electron.launch({executablePath:require('electron'),args:['--no-sandbox',path.join(ROOT,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:profile}});
 const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
 // Replace the handlers only after the app registered its own (they exist once the window is loading).
 await app.evaluate(({ipcMain},v)=>{ipcMain.removeHandler('update:state');ipcMain.handle('update:state',()=>({phase:'idle',currentVersion:v}));
  ipcMain.removeHandler('update:check');ipcMain.handle('update:check',()=>({phase:'current',currentVersion:v}));
  ipcMain.removeHandler('fetch');ipcMain.handle('fetch',async()=>{throw Error('offline test');});},version);
 // The first page load above ran with the real app version (before these handlers were replaced) and may already have
 // remembered it. Put back what this profile held when the previous test session closed, then reload with the test version.
 await page.waitForTimeout(300);
 await page.evaluate(v=>{if(v===null)localStorage.removeItem('lastSeenVersion');else localStorage.setItem('lastSeenVersion',v);},lastSeen.has(profile)?lastSeen.get(profile):null);
 await page.reload();await page.waitForLoadState('domcontentloaded');
 current=app;currentPage=page;currentProfile=profile;return {app,page};
}
async function close(){lastSeen.set(currentProfile,await currentPage.evaluate(()=>localStorage.getItem('lastSeenVersion')));await current.close();}
const open=page=>page.evaluate(()=>document.getElementById('whatsNewDialog')?.open===true);
const seen=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('lastSeenVersion')));
(async()=>{
 // 1. New install: no teacher data → no notice, version remembered.
 const fresh=fs.mkdtempSync(path.join(OUT,'profile-whatsnew-fresh-'));
 let {app,page}=await launch(fresh,NEW);
 await page.waitForTimeout(2500);
 assert.equal(await open(page),false);assert.equal(await seen(page),NEW);pass('new install: no notice, version remembered');
 await close();

 // 2. Update from a version without this feature: teacher data present, nothing remembered yet.
 const updated=fs.mkdtempSync(path.join(OUT,'profile-whatsnew-update-'));
 ({app,page}=await launch(updated,OLD));
 await page.evaluate(()=>{localStorage.setItem('settings',JSON.stringify({grade:'6',classroom:'1'}));localStorage.setItem('morningDefault',JSON.stringify('책 읽기'));localStorage.removeItem('lastSeenVersion');});
 await close();
 ({app,page}=await launch(updated,NEW));
 await page.waitForFunction(()=>document.getElementById('whatsNewDialog')?.open===true,null,{timeout:15000});
 const shown=await page.evaluate(()=>({title:document.getElementById('whatsNewTitle').textContent,items:[...document.querySelectorAll('#whatsNewBody li')].map(li=>li.textContent)}));
 const expected=require('../../app/whats-new.js').NOTES[NEW];
 assert.equal(shown.title,`우리 교실 ${NEW}에서 달라진 점`);assert.deepEqual(shown.items,expected.items);
 pass('after update: notice lists this version\'s notes');
 await page.screenshot({path:path.join(OUT,'whats-new.png')});
 await page.click('#whatsNewClose');assert.equal(await open(page),false);assert.equal(await seen(page),NEW);pass('[확인] closes it and remembers the version');
 await close();

 // 3. Next start on the same version: shown only once.
 ({app,page}=await launch(updated,NEW));
 await page.waitForTimeout(2500);assert.equal(await open(page),false);pass('same version again: not shown');

 // 4. Can be read again from Settings → 업데이트.
 await page.evaluate(()=>document.querySelector('.open-update').click());
 await page.waitForSelector('#whatsNewReplay',{state:'visible'});await page.click('#whatsNewReplay');
 assert.equal(await open(page),true);assert.equal(await page.evaluate(()=>document.getElementById('updateDialog').open),false);pass('[새로워진 점] in the update dialog shows it again');
 await page.click('#whatsNewClose');
 await close();

 // 5. A dialog already open (e.g. settings) is not covered; the notice waits for it.
 const busy=fs.mkdtempSync(path.join(OUT,'profile-whatsnew-busy-'));
 ({app,page}=await launch(busy,OLD));
 await page.evaluate(()=>{localStorage.setItem('settings',JSON.stringify({grade:'6',classroom:'1'}));localStorage.setItem('morningDefault',JSON.stringify('책 읽기'));});
 await close();
 ({app,page}=await launch(busy,NEW));
 await page.evaluate(()=>document.getElementById('settingsDialog').showModal());
 await page.waitForTimeout(2500);assert.equal(await open(page),false);
 await page.evaluate(()=>document.getElementById('settingsDialog').close());
 await page.waitForFunction(()=>document.getElementById('whatsNewDialog')?.open===true,null,{timeout:5000});pass('waits until another open dialog is closed');
 await close();

 // 6. Version without notes: nothing shown, version still remembered.
 ({app,page}=await launch(updated,NONE));
 await page.waitForTimeout(2500);assert.equal(await open(page),false);assert.equal(await seen(page),NONE);pass('version without notes: nothing shown');
 await close();
 console.log(`${count}/${count} passed`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>current?.close().catch(()=>{}));
