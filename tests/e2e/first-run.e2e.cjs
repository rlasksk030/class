// First run of the 옥구초 app on a brand-new profile, before the grade and class are chosen:
// the class setup opens, the title shows the school name only (never "undefined학년 undefined반"),
// and nothing throws. Isolated profile, offline.
const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict');
const {_electron}=require('playwright-core');
const ROOT=path.resolve(__dirname,'../..');
const PROFILE=fs.mkdtempSync(path.join(os.tmpdir(),'class-okgu-first-run-'));
let app,page,count=0;const pageErrors=[];
const ok=(label,result,detail='')=>{assert.ok(result,label+(detail?' — '+detail:''));console.log('PASS '+label);count++;};
async function launch(){
 app=await _electron.launch({executablePath:require('electron'),args:['--no-sandbox',path.join(ROOT,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:PROFILE}});
 page=await app.firstWindow();
 page.on('pageerror',e=>pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')pageErrors.push(m.text());});
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('fetch');ipcMain.handle('fetch',async()=>{throw Error('offline test');});});
 // Reload once so every script runs again with the error listener already attached.
 await page.reload();await page.waitForLoadState('domcontentloaded');await page.evaluate(()=>document.fonts.ready);
}
(async()=>{try{
 await launch();await page.waitForTimeout(1500);
 const school=await page.evaluate(()=>OKGU_SCHOOL.SCHUL_NM);
 ok('새 프로필: 학급 설정 창이 열림',await page.locator('#settingsDialog[open]').count()===1);
 const title=await page.textContent('#classTitle');
 ok('학년·반 없이 처음 실행: 제목은 학교 이름만(undefined 없음)',title===school&&!title.includes('undefined'),title);
 ok('첫 실행 동안 페이지 오류 0회',pageErrors.length===0,[...new Set(pageErrors)].join(' | '));
 // Closing the setup without choosing a class and starting again keeps the same title.
 await page.keyboard.press('Escape');await page.waitForTimeout(300);
 await app.close();app=null;await launch();await page.waitForTimeout(800);
 ok('다시 실행해도(학년·반 미선택) 제목에 undefined 없음, 페이지 오류 0회',(await page.textContent('#classTitle'))===school&&pageErrors.length===0,[...new Set(pageErrors)].join(' | '));
 // After the class is set the full title comes back.
 await page.evaluate(()=>{settings={...settings,grade:'6',classroom:'1'};render();});
 ok('학년·반을 정하면 "학교 ○학년 ○반"',(await page.textContent('#classTitle'))===`${school} 6학년 1반`);
 console.log(`${count}/${count} passed`);
}finally{if(app)await app.close();fs.rmSync(PROFILE,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
