// Storage migration E2E: the real v1.7.8 app creates data through its own screens, then the current app
// opens the same profile. Needs the v1.7.8 app source (app.asar extracted) in CLASSROOM_V178_APP.
//   npx asar extract "<v1.7.8 install>/resources/app.asar" <dir>   then   CLASSROOM_V178_APP=<dir> npm run test:migration
const path=require('path'),fs=require('fs');
const {_electron}=require('playwright-core');const electronPath=require('electron');
const ROOT=path.resolve(__dirname,'../..'),OUTDIR=path.join(__dirname,'.out'),PROFILE=path.join(OUTDIR,'profile-migration'),OLD=process.env.CLASSROOM_V178_APP;
if(!OLD||!fs.existsSync(path.join(OLD,'package.json'))){console.log('SKIP: set CLASSROOM_V178_APP to the extracted v1.7.8 app.asar folder');process.exit(0);}
const results=[];const ok=(n,c,d='')=>{results.push([n,!!c]);console.log((c?'PASS':'FAIL')+' '+n+(d?' — '+d:''));};
async function launch(dir){const app=await _electron.launch({executablePath:electronPath,args:['--no-sandbox',dir],env:{...process.env,CLASSROOM_TEST_PROFILE:PROFILE}});const page=await app.firstWindow();page.on('dialog',d=>d.accept());await page.waitForLoadState('domcontentloaded');
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('fetch');ipcMain.handle('fetch',async(_,url)=>{const ep=new URL(url).pathname.split('/').pop();
  if(ep==='classInfo')return {classInfo:[{head:[{list_total_count:2}]},{row:[{AY:String(new Date().getFullYear()-(new Date().getMonth()<2?1:0)),GRADE:'6',CLASS_NM:'1'},{AY:String(new Date().getFullYear()-(new Date().getMonth()<2?1:0)),GRADE:'6',CLASS_NM:'2'}]}]};
  if(ep==='elsTimetable')return {elsTimetable:[{head:[{list_total_count:2}]},{row:[{PERIO:'1',ITRT_CNTNT:'국어'},{PERIO:'2',ITRT_CNTNT:'수학'}]}]};
  if(ep==='mealServiceDietInfo')return {mealServiceDietInfo:[{head:[{list_total_count:1}]},{row:[{DDISH_NM:'잡곡밥<br/>미역국'}]}]};
  throw Error('offline');});});
 await page.waitForTimeout(700);return {app,page};}
const storage=page=>page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])));
(async()=>{
 fs.rmSync(PROFILE,{recursive:true,force:true});fs.mkdirSync(OUTDIR,{recursive:true});
 // ---------- v1.7.8 creates data through its own UI ----------
 let {app,page}=await launch(OLD);
 ok('v1.7.8 실행',(await app.evaluate(({app})=>app.getVersion()))==='1.7.8');
 await page.waitForSelector('#settingsDialog[open]');await page.selectOption('#grade','6');await page.waitForTimeout(300);await page.fill('#classroom','1');await page.click('#settingsForm .primary');await page.waitForTimeout(500);
 await page.click('[data-edit=morning]');await page.fill('#editText','책 읽기 20분\n일기 쓰기');await page.click('#editForm .primary');
 await page.click('[data-edit=notices]');await page.fill('#editText','체육복 챙기기');await page.click('#editForm .primary');
 await page.click('#screenSettings');await page.click('#openDdaySettings');await page.fill('#ddayTitle','수학여행');await page.fill('#ddayDate','2026-12-01');await page.click('#ddayForm .primary');await page.keyboard.press('Escape');
 await page.click('#screenSettings');await page.uncheck('[data-board-visible=meal]');const plus=page.locator('.preference-row',{has:page.locator('[data-board-visible=morning]')}).locator('button').nth(1);await plus.click();await plus.click();
 await page.click('#openPeriodSettings');await page.click('#periodForm .primary');await page.click('#enablePeriods');await page.keyboard.press('Escape');
 await page.click('#resizeToggle');await page.focus('[data-resize=middle-column]');for(let i=0;i<3;i++)await page.keyboard.press('ArrowRight');await page.click('#resizeToggle');
 await page.click('#timerButton');await page.click('[data-minutes="3"]');await page.check('#timerSound');await page.keyboard.press('Escape');
 await page.click('#randomTab');await page.$eval('#rosterEditor',d=>d.open=true);await page.fill('#rosterText','김하늘\n이바다\n박구름\n최별\n정해');await page.click('#saveRoster');await page.$eval('#exclusionDetails',d=>d.open=true).catch(()=>{});await page.locator('#excludeList input').first().check();await page.click('#drawOne');await page.waitForTimeout(2500);
 await page.click('#activityTab');await page.fill('#activityTitle','수학 익힘책');await page.locator('#pendingStudents button, #pendingStudents [role=button], #pendingStudents > *').first().click();await page.waitForTimeout(300);
 await page.click('#whiteboardTab');const lb=await (await page.$('#whiteboardTextLayer')).boundingBox();await page.mouse.click(lb.x+220,lb.y+160);await page.keyboard.type('오늘 준비물: 색연필');await page.click('#whiteboardFontPlus');
 await page.click('#whiteboardPen');const cb=await (await page.$('#whiteboardCanvas')).boundingBox();await page.mouse.move(cb.x+100,cb.y+400);await page.mouse.down();await page.mouse.move(cb.x+260,cb.y+440,{steps:5});await page.mouse.up();await page.click('#whiteboardTyping');
 await page.click('#dashboardTab');await page.waitForTimeout(300);
 const old=await storage(page);fs.writeFileSync(path.join(OUTDIR,'v178-storage.json'),JSON.stringify(old,null,1));
 const need=['settings','morningDefault','notes','ddayEvents','boardPreferences','boardSizes','periodSchedule','periodHighlightEnabled','classTimer','timerSound','classRosters','randomPickerSession','activityCompletion','whiteboardContents'];
 ok('v1.7.8이 화면 조작으로 사용자 데이터 생성',need.every(k=>old[k]!=null),need.filter(k=>old[k]==null).join(','));
 await app.close();
 // ---------- current version opens the same profile ----------
 ({app,page}=await launch(path.join(ROOT,'app')));
 const version=await app.evaluate(({app})=>app.getVersion());ok('최신 버전 실행',version!=='1.7.8',version);
 await page.waitForTimeout(500);
 const now=await storage(page);
 const same=k=>JSON.stringify(JSON.parse(old[k]))===JSON.stringify(JSON.parse(now[k]??'null'));
 const kept=need.filter(same),changed=need.filter(k=>!same(k));
 ok('기존 저장값 그대로 유지(초기화·재작성 없음)',changed.length===0,changed.length?'변경: '+changed.join(','):kept.length+'개 키 동일');
 ok('설정 대화상자 재요청 없음(학년/반 유지)',!(await page.$('#settingsDialog[open]'))&&(await page.textContent('#classTitle')).includes('6학년 1반'));
 ok('아침활동·안내사항 유지',(await page.innerText('#morning'))==='책 읽기 20분\n일기 쓰기'&&(await page.innerText('#notices'))==='체육복 챙기기');
 ok('새 제목 기능: 값 없으면 기본 제목',(await page.textContent('.morning h2')).trim()==='☀ 아침활동'&&(await page.textContent('.notices h2')).trim()==='✳ 안내사항'&&now.boardTitles===undefined);
 ok('D-Day 유지',(await page.textContent('#ddayBadge')).includes('수학여행'));
 ok('보드 숨김·글씨 크기 유지',await page.$eval('.meal',e=>e.classList.contains('board-concealed'))&&(await page.evaluate(()=>window.boardFontScales.morning))===1.2);
 ok('보드 크기 유지',await page.$eval('main',m=>m.style.gridTemplateColumns!==''));
 ok('교시 강조 설정 유지',JSON.parse(now.periodHighlightEnabled)===true&&JSON.parse(now.periodSchedule).length===6);
 await page.click('#timerButton');ok('타이머 설정 유지',(await page.textContent('#timerDisplay'))==='03:00'&&await page.isChecked('#timerSound'));await page.keyboard.press('Escape');
 await page.click('#randomTab');const roster=await page.innerText('#rosterList');ok('학생 명단·오늘 제외·뽑기 기록 유지',['김하늘','이바다','박구름','최별','정해'].every(n=>roster.includes(n))&&(await page.locator('#excludeList input:checked').count())===1&&(await page.locator('#pickHistory li').count())===1);
 await page.click('#activityTab');ok('활동완료 유지',(await page.inputValue('#activityTitle'))==='수학 익힘책'&&(await page.textContent('#completeCount')).startsWith('1'));
 await page.click('#whiteboardTab');ok('화이트보드 글상자·글씨 크기·판서 유지',(await page.inputValue('#whiteboardTextLayer textarea'))==='오늘 준비물: 색연필'&&JSON.parse(now.whiteboardContents).blocks[0].fontSize===40&&JSON.parse(now.whiteboardContents).strokes.length===1);
 ok('새 기능: 실행 취소/다시 실행 (기록 없음 상태로 시작)',await page.$eval('#whiteboardUndo',b=>b.disabled)&&await page.$eval('#whiteboardRedo',b=>b.disabled));
 await page.click('#diaryTab');ok('새 기능: 알림장 초안 기본값',(await page.inputValue('#diaryTitle')).endsWith('알림장')&&await page.isChecked('#diaryParents')&&await page.isChecked('#diaryStudents'));
 await page.click('#dashboardTab');await page.click('#settings');ok('새 기능: 설정의 백업/복원',await page.isVisible('#backupCreate')&&await page.isVisible('#backupRestore'));await page.keyboard.press('Escape');
 ok('새 기능: 제목 편집 버튼',await page.isVisible('.morning .board-title-edit'));
 await app.close();
 // Reopen once more: nothing drifts after a normal restart of the new version.
 ({app,page}=await launch(path.join(ROOT,'app')));const again=await storage(page);ok('재실행 후에도 동일',need.every(k=>JSON.stringify(JSON.parse(old[k]))===JSON.stringify(JSON.parse(again[k]??'null'))));await app.close();
 const f=results.filter(r=>!r[1]);console.log(`\n${results.length-f.length}/${results.length} passed`);process.exit(f.length?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
