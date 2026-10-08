// Native Electron sizes + Chromium device scale factors; does not change Windows settings.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron}=require('playwright-core'),ROOT=path.resolve(__dirname,'../..'),OUT=path.join(__dirname,'.out/diary-layout');fs.mkdirSync(OUT,{recursive:true});let app,count=0;
const pass=s=>{count++;console.log('PASS '+s);};
const measure=page=>page.evaluate(()=>{
 const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,height:r.height};};
 const root=document.getElementById('diaryScreen'),fields=document.querySelector('.diary-fields'),body=document.getElementById('diaryBody');
 return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,root:rect('diaryScreen'),button:rect('diaryPublish'),title:rect('diaryTitle'),body:rect('diaryBody'),parents:rect('diaryParents'),students:rect('diaryStudents'),status:rect('diaryStatus'),tabs:rect('diaryTab'),rootOverflow:root.scrollHeight-root.clientHeight,fieldsOverflow:fields.scrollHeight-fields.clientHeight,bodyOverflow:body.scrollHeight-body.clientHeight};
});
(async()=>{try{
 for(const scale of [1,1.25,1.5]){
  const profile=fs.mkdtempSync(path.join(OUT,'profile-'));
  app=await _electron.launch({executablePath:require('electron'),args:['--force-device-scale-factor='+scale,path.join(ROOT,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:profile}});
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('fetch');ipcMain.handle('fetch',async()=>{throw Error('offline');});for(const name of ['diary:status','diary:session'])ipcMain.removeHandler(name);ipcMain.handle('diary:status',()=>({linked:true,title:'옥구초등학교 6학년 1반'}));ipcMain.handle('diary:session',()=>({status:'ok'}));});
  await page.evaluate(()=>{localStorage.setItem('settings',JSON.stringify({grade:'6',classroom:'1'}));localStorage.setItem('dashboardLocked','false');});await page.reload();await page.click('#diaryTab');
  for(const [width,height] of [[1440,960],[1280,720],[900,650]]){
   await app.evaluate(({BrowserWindow},{width,height})=>{const w=BrowserWindow.getAllWindows()[0];w.setBounds({x:0,y:0,width,height});},{width,height});await page.waitForTimeout(150);
   await page.fill('#diaryTitle','긴 제목 '.repeat(35));await page.fill('#diaryBody',Array.from({length:100},(_,i)=>`${i+1}번째 학생과 가정에 전할 긴 본문입니다.`).join('\n'));
   await page.evaluate(()=>{document.getElementById('diaryLinkState').textContent='● 하이클래스 연결됨 · 아주 긴 학급 연결 상태 '.repeat(15);document.getElementById('diaryStatus').textContent='연결 오류가 발생했습니다. 초안을 유지합니다. '.repeat(30);});
   const m=await measure(page);assert.ok(Math.abs(m.dpr-scale)<.02,JSON.stringify(m));assert.ok(m.rootOverflow<=1&&m.fieldsOverflow<=1,JSON.stringify(m));assert.ok(m.body.height>=100&&m.bodyOverflow>0,JSON.stringify(m));
   for(const r of [m.button,m.title,m.parents,m.students,m.body,m.status])assert.ok(r.y>=0&&r.bottom<=m.root.bottom+1&&r.right<=m.width,JSON.stringify(m));
   assert.ok(m.button.y>=m.parents.bottom&&m.root.bottom<=m.tabs.y,JSON.stringify(m));assert.ok(m.status.right<=m.button.x,JSON.stringify(m));
   const prior=m.button;await page.locator('#diaryBody').press('End');await page.locator('#diaryBody').press('Enter');await page.locator('#diaryBody').press('A');const after=await measure(page);assert.equal(after.button.y,prior.y);assert.equal(after.button.bottom,prior.bottom);
   await page.screenshot({path:path.join(OUT,`${width}x${height}-${scale}.png`)});pass(`${width}x${height} scale ${scale}: button/title/recipients visible; editor-only scrolling; long messages stable`);
  }
  // Browser zoom simulates less available logical space separately from OS device scaling.
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1.5));await page.waitForTimeout(150);
  let m=await measure(page);assert.ok(m.button.bottom<=m.root.bottom+1&&m.root.bottom<=m.tabs.y);assert.ok(m.fieldsOverflow>0);pass(`scale ${scale}: extreme zoom keeps action accessible and fields scrollable`);
  await page.focus('#diaryDate');const seen=new Set(['diaryDate']);for(let i=0;i<18;i++){await page.keyboard.press('Tab');seen.add(await page.evaluate(()=>document.activeElement.id));}
  for(const id of ['diaryConnect','diaryImport','diaryTitle','diaryBody','diaryParents','diaryStudents','diaryStatus','diaryPublish'])assert.ok(seen.has(id),id+' not keyboard accessible');pass(`scale ${scale}: keyboard reaches every diary control`);
  await app.close();app=null;
 }
 console.log(`${count}/${count} passed`);
}finally{if(app)await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
