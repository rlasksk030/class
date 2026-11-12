// First run of the nationwide app on a brand-new profile, before any school is chosen:
// no renderer errors, no NEIS lookups, the school prompt and the default board layout.
const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');
const {_electron}=require('playwright-core');
const ROOT=path.resolve(__dirname,'../..'),L=require('../../app/layout-core.js');
const PROFILE=fs.mkdtempSync(path.join(os.tmpdir(),'class-first-run-'));
let app,page,count=0;const pageErrors=[];
const ok=(label,result,detail='')=>{assert.ok(result,label+(detail?' — '+detail:''));console.log('PASS '+label);count++;};
async function launch(){
 app=await _electron.launch({executablePath:require('electron'),args:['--no-sandbox',path.join(ROOT,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:PROFILE}});
 page=await app.firstWindow();
 page.on('pageerror',e=>pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')pageErrors.push(m.text());});
 await app.evaluate(({ipcMain})=>{globalThis.fetched=[];ipcMain.removeHandler('fetch');ipcMain.handle('fetch',async(_,url)=>{globalThis.fetched.push(String(url));throw Error('offline test');});});
 // Reload once so every script runs again with the error listener already attached.
 await page.reload();await page.waitForLoadState('domcontentloaded');await page.evaluate(()=>document.fonts.ready);
}
const neisCalls=async()=>(await app.evaluate(()=>globalThis.fetched)).filter(u=>u.includes('open.neis.go.kr'));
(async()=>{try{
 await launch();
 // The PIP snapshot repeats every 120 ms; more than ten passes with no school selected.
 await page.waitForTimeout(1500);
 ok('새 프로필: 학교 선택 안내와 NEIS 도우미가 열림',await page.locator('#settingsDialog[open] #neisGuide[open]').count()===1&&await page.locator('#grade').isDisabled());
 ok('학교 선택 전 시간표·급식 칸은 안내만 표시',(await page.innerText('#timetable'))==='설정에서 학교를 선택해 주세요.'&&(await page.innerText('#meal'))==='설정에서 학교를 선택해 주세요.');
 ok('학교 선택 전 NEIS 조회 0회',(await neisCalls()).length===0,JSON.stringify(await neisCalls()));
 ok('기본 배치로 네 칸이 표시되고 배치가 저장됨',await page.evaluate(()=>['timetable','morning','notices','meal'].every(id=>getComputedStyle(document.querySelector('main>.'+id)).display!=='none'))&&L.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('boardLayout'))),L.defaults()));
 ok('첫 실행 동안 페이지 오류 0회',pageErrors.length===0,[...new Set(pageErrors)].join(' | '));
 // Closing the setup dialog without choosing a school and starting again must stay quiet too.
 await page.keyboard.press('Escape');await page.waitForTimeout(300);
 await app.close();app=null;await launch();await page.waitForTimeout(1500);
 ok('다시 실행해도(학교 미선택) 페이지 오류·NEIS 조회 0회',pageErrors.length===0&&(await neisCalls()).length===0,[...new Set(pageErrors)].join(' | '));
 console.log(`${count}/${count} passed`);
}finally{if(app)await app.close();fs.rmSync(PROFILE,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
