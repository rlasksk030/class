// Public-registration outcomes are mocked at IPC. This test cannot send a real note.
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const {_electron}=require('playwright-core');
const ROOT=path.resolve(__dirname,'../..'),OUT=path.join(__dirname,'.out');fs.mkdirSync(OUT,{recursive:true});
const PROFILE=fs.mkdtempSync(path.join(OUT,'profile-diary-'));let app,count=0;
const pass=n=>{count++;console.log('PASS '+n);};
(async()=>{try{
 app=await _electron.launch({executablePath:require('electron'),args:['--no-sandbox',path.join(ROOT,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:PROFILE}});
 const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
 await app.evaluate(({ipcMain})=>{
  ipcMain.removeHandler('fetch');ipcMain.handle('fetch',async()=>{throw Error('offline');});
  ipcMain.removeHandler('diary:status');ipcMain.handle('diary:status',async()=>({linked:true,title:'옥구초등학교 6학년 1반'}));
  ipcMain.removeHandler('diary:session');ipcMain.handle('diary:session',async()=>({status:'ok'}));
  globalThis.result={status:'error',message:'등록 실패'};
  ipcMain.removeHandler('diary:publish');ipcMain.handle('diary:publish',async()=>{if(globalThis.hold)await new Promise(r=>globalThis.finish=r);if(globalThis.result.throw)throw Error('network');return globalThis.result;});
 });
 await page.evaluate(()=>{localStorage.setItem('settings',JSON.stringify({grade:'6',classroom:'1'}));localStorage.setItem('dashboardLocked','false');const d=Core.dateKey();localStorage.setItem('notes',JSON.stringify({[d]:{notices:'준비물: 리코더'}}));localStorage.setItem('ddayEvents',JSON.stringify([{id:'test',title:'운동회',date:d}]));});
 await page.reload();
 // Seed events through the UI, using the application's own storage shape.
 await page.click('#screenSettings');await page.click('#openDdaySettings');await page.fill('#ddayTitle','운동회');await page.fill('#ddayDate',await page.evaluate(()=>Core.dateKey()));await page.click('#ddayForm .primary');await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 assert.ok(await page.isVisible('#ddayBadge'));await page.click('#diaryTab');assert.equal(await page.isVisible('#ddayBadge'),false);pass('D-Day dashboard only');
 await page.click('#diaryImport');assert.equal(await page.locator('#diaryCandidates input').count(),1);assert.ok(!(await page.textContent('#diaryCandidates')).includes('운동회'));await page.click('#diaryImportCancel');pass('import excludes D-Day');
 const date=await page.inputValue('#diaryDate'),defaultTitle=await page.inputValue('#diaryTitle');
 await page.uncheck('#diaryStudents');
 const draft=()=>page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('diaryDrafts'))).find(x=>x.body==='작성 본문')||Object.values(JSON.parse(localStorage.getItem('diaryDrafts')))[0]);
 for(const outcome of [{status:'error',message:'등록 실패'},{status:'error',message:'로그인 만료'},{throw:true},{status:'error',message:'학급 불일치'},{status:'error',message:'수신대상 불일치'},{status:'uncertain',message:'결과 불확실'},{status:'draft',message:'임시저장'},{status:'cancelled',message:'취소'},{message:'성공 여부 없음'}]){
  await page.fill('#diaryTitle','작성 제목');await page.fill('#diaryBody','작성 본문');
  await app.evaluate((_,o)=>globalThis.result=o,outcome);await page.click('#diaryPublish');await page.waitForFunction(()=>!document.getElementById('diaryPublish').disabled);
  assert.equal(await page.inputValue('#diaryTitle'),'작성 제목');assert.equal(await page.inputValue('#diaryBody'),'작성 본문');assert.equal((await draft()).body,'작성 본문');pass('retain draft: '+(outcome.message||'network exception'));
 }
 await app.evaluate(()=>globalThis.result={status:'success',hash:'published-hash',message:'등록 완료'});await page.click('#diaryPublish');await page.waitForFunction(()=>!document.getElementById('diaryPublish').disabled);
 assert.equal(await page.inputValue('#diaryTitle'),defaultTitle);assert.equal(await page.inputValue('#diaryBody'),'');assert.equal(await page.inputValue('#diaryDate'),date);assert.ok(await page.isChecked('#diaryParents'));assert.equal(await page.isChecked('#diaryStudents'),false);
 const saved=await draft();assert.equal(saved.postedHash,'published-hash');assert.equal(saved.body,'');assert.equal(saved.title,defaultTitle);assert.ok((await page.textContent('#diaryLinkState')).includes('연결됨'));pass('success resets title/body and preserves date, recipients, link, hash');
 const history=await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('diaryRegistrationHistory'))).flat());assert.ok(history.some(x=>x.hash==='published-hash'&&x.body==='작성 본문'&&x.status==='success'));pass('published v1.8.4 registration history retained');
 await page.reload();await page.click('#diaryTab');assert.equal(await page.inputValue('#diaryBody'),'');assert.equal((await draft()).postedHash,'published-hash');assert.equal(await page.isChecked('#diaryStudents'),false);pass('new draft saved across reload');
 await page.fill('#diaryTitle','작성 제목');await page.fill('#diaryBody','작성 본문');await app.evaluate(()=>{globalThis.hold=true;globalThis.result={status:'success',hash:'second-hash',message:'등록 완료'};});await page.click('#diaryPublish');await page.fill('#diaryBody','등록 중 새로 쓴 본문');await app.evaluate(()=>{globalThis.hold=false;globalThis.finish();});await page.waitForFunction(()=>!document.getElementById('diaryPublish').disabled);assert.equal(await page.inputValue('#diaryBody'),'등록 중 새로 쓴 본문');pass('pending registration preserves newer edits');
 await page.fill('#diaryBody','작성 본문');await app.evaluate(()=>{globalThis.hold=true;globalThis.result={status:'success',hash:'third-hash',message:'등록 완료'};});await page.click('#diaryPublish');
 await page.fill('#diaryDate','2026-12-15');await page.dispatchEvent('#diaryDate','change');await page.fill('#diaryBody','다른 날짜 초안');
 await app.evaluate(()=>{globalThis.hold=false;globalThis.finish();});await page.waitForFunction(()=>!document.getElementById('diaryPublish').disabled);assert.equal(await page.inputValue('#diaryBody'),'다른 날짜 초안');
 await page.fill('#diaryDate',date);await page.dispatchEvent('#diaryDate','change');assert.equal(await page.inputValue('#diaryBody'),'');assert.equal((await draft()).postedHash,'third-hash');pass('success resets submitted date only');
 await page.click('#dashboardTab');assert.ok(await page.isVisible('#ddayBadge'));pass('D-Day restored on dashboard');
 console.log(`${count}/${count} passed`);
}finally{if(app)await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
