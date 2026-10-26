// Synthetic data only. No live HiClass session or publication.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron}=require('playwright-core');
const ROOT=path.resolve(__dirname,'../..'),OUT=require('../output.cjs');
const PROFILE=fs.mkdtempSync(path.join(OUT,'profile-transfer-'));
let app,page,count=0,failure;
const pass=text=>{count++;console.log('PASS '+text);};
const openSettings=async()=>{await page.click('#dashboardTab');await page.click('#settings');};
const closeSettings=async()=>{await page.keyboard.press('Escape');};
const state=()=>app.evaluate(()=>({...globalThis.testDialogs}));
(async()=>{try{
 app=await _electron.launch({executablePath:require('electron'),args:[path.join(ROOT,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:PROFILE}});
 page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
 await app.evaluate(({ipcMain,dialog},file)=>{
  ipcMain.removeHandler('fetch');ipcMain.handle('fetch',()=>{throw Error('offline fixture');});
  ipcMain.removeHandler('diary:status');ipcMain.handle('diary:status',()=>({linked:false}));
  globalThis.testDialogs={save:0,open:0};
  dialog.showSaveDialog=async()=>{testDialogs.save++;return {filePath:file};};
  dialog.showOpenDialog=async()=>{testDialogs.open++;return {filePaths:[file]};};
 },path.join(PROFILE,'backup.json'));
 await page.evaluate(()=>{localStorage.setItem('settings',JSON.stringify({grade:'6',classroom:'1'}));localStorage.setItem('dashboardLocked','false');});
 await page.reload();await page.click('#diaryTab');await page.fill('#diaryBody','백업 경계 가상 본문');
 const png=await app.evaluate(({nativeImage})=>[...nativeImage.createFromBitmap(Buffer.alloc(120*80*4,220),{width:120,height:80}).toPNG()]);
 const upload=selector=>page.setInputFiles(selector,{name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(png)});
 for(const surface of ['diary','whiteboard']){
  await page.click(surface==='diary'?'#diaryTab':'#whiteboardTab');
  await page.evaluate(()=>{window.originalPhotoAdd=ClassPhotos.add;ClassPhotos.add=async f=>{await new Promise(resolve=>window.releaseImport=resolve);return originalPhotoAdd(f);};});
  await upload(surface==='diary'?'#diaryPhotoFiles':'#whiteboardPhotoFiles');
  await page.waitForFunction(()=>typeof window.releaseImport==='function');
  await openSettings();const before=await state();
  await page.click('#backupCreate');
  await page.waitForFunction(()=>!document.getElementById('backupCreate').disabled);
  assert.equal((await state()).save,before.save,'pending import must block backup before its native dialog');
  assert.match(await page.textContent('#backupStatus'),/사진|저장/);
  await page.click('#backupRestore');
  await page.waitForFunction(()=>!document.getElementById('backupRestore').disabled);
  assert.equal((await state()).open,before.open,'pending import must block restore before its native dialog');
  pass(surface+' pending photo blocks backup and restore without discarding it');
  await page.evaluate(()=>{ClassPhotos.add=originalPhotoAdd;releaseImport();delete window.releaseImport;});
  await page.waitForFunction(surface=>surface==='diary'?Object.values(JSON.parse(localStorage.getItem('diaryDrafts'))).some(d=>d.photos?.length):JSON.parse(localStorage.getItem('whiteboardContents')).blocks.some(b=>b.type==='image'),surface);
  await closeSettings();
 }
 await page.click('#diaryTab');
 await page.evaluate(()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='diaryDrafts')throw Error('synthetic quota');return originalSet.call(this,k,v);};});
 await page.fill('#diaryBody','저장 실패 후 보존할 가상 본문');await openSettings();
 const before=await state();await page.click('#backupCreate');
 await page.waitForFunction(()=>!document.getElementById('backupCreate').disabled);
 assert.equal((await state()).save,before.save);pass('unsaved draft cannot be exported as a successful stale backup');
 await page.evaluate(()=>Storage.prototype.setItem=originalSet);await closeSettings();await page.click('#diaryTab');
 assert.equal(await page.inputValue('#diaryBody'),'저장 실패 후 보존할 가상 본문');
 await openSettings();await page.click('#backupCreate');await page.waitForFunction(()=>document.getElementById('backupStatus').textContent.includes('완료'));
 const backup=JSON.parse(fs.readFileSync(path.join(PROFILE,'backup.json')));
 assert.ok(Object.values(backup.data.diaryDrafts).some(d=>d.body==='저장 실패 후 보존할 가상 본문'&&d.photos.length===1));
 assert.ok(backup.data.whiteboardContents.blocks.some(b=>b.type==='image'));
 assert.ok(Object.keys(backup.media).length);pass('after saving recovers, backup includes both editors and their photo bytes');
 await closeSettings();await page.click('#diaryTab');
 await page.evaluate(()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='diaryEditorPreferences')throw Error('synthetic preferences quota');return originalSet.call(this,k,v);};});
 await page.click('#diaryFontPlus');assert.equal(await page.textContent('#diaryFontSize'),'26px');await openSettings();
 const fontBefore=await state();await page.click('#backupCreate');await page.waitForFunction(()=>!document.getElementById('backupCreate').disabled);
 assert.equal((await state()).save,fontBefore.save);pass('unsaved font preference also blocks stale backup');
 await page.evaluate(()=>Storage.prototype.setItem=originalSet);await closeSettings();await page.click('#diaryTab');await page.click('#diaryFontPlus');
 assert.equal(await page.textContent('#diaryFontSize'),'28px');
 console.log(`${count}/${count} passed`);
}catch(error){failure=error;throw error;}finally{
 if(page)await page.evaluate(()=>{if(window.originalPhotoAdd)ClassPhotos.add=originalPhotoAdd;window.releaseImport?.();if(window.originalSet)Storage.prototype.setItem=originalSet;document.getElementById('diaryBody')?.dispatchEvent(new Event('input'));}).catch(()=>{});
 if(app){if(failure)await app.evaluate(({app})=>app.exit(0)).catch(()=>{});else await app.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
