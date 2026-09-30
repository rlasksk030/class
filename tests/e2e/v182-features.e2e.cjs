// Electron E2E: run with `npm run test:e2e` (Linux CI: wrap with xvfb-run). Output goes to tests/e2e/.out (git-ignored).
const path=require('path');const ROOT=path.resolve(__dirname,'../..'),OUTDIR=path.join(__dirname,'.out');
const {_electron}=require('playwright-core');const electronPath=require('electron');
const fs=require('fs');const PROFILE=path.join(OUTDIR,'profile-v182'),OUT=path.join(OUTDIR,'shots'),BK=path.join(OUTDIR,'backup-out.json');fs.mkdirSync(OUT,{recursive:true});
const results=[];const ok=(n,c,d='')=>{results.push([n,!!c]);console.log((c?'PASS':'FAIL')+' '+n+(d?' — '+d:''));};
async function launch(){const app=await _electron.launch({executablePath:electronPath,args:['--no-sandbox',path.join(ROOT,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:PROFILE}});const page=await app.firstWindow();page.on('dialog',d=>d.accept());await page.waitForLoadState('domcontentloaded');await page.waitForTimeout(700);return {app,page};}
const neis=async(app,mode)=>app.evaluate(({ipcMain},mode)=>{ipcMain.removeHandler('fetch');ipcMain.handle('fetch',async(_,url)=>{const u=new URL(url);if(u.hostname!=='open.neis.go.kr'||mode==='error')throw Error('offline');const ep=u.pathname.split('/').pop();
 if(mode==='holiday')return {RESULT:{CODE:'INFO-200',MESSAGE:'해당하는 데이터가 없습니다.'}};
 if(ep==='mealServiceDietInfo')return {mealServiceDietInfo:[{head:[{list_total_count:1},{RESULT:{CODE:'INFO-000'}}]},{row:[{DDISH_NM:'잡곡밥<br/>미역국 (5.6)<br/>불고기'}]}]};
 if(ep==='elsTimetable')return {elsTimetable:[{head:[{list_total_count:3},{RESULT:{CODE:'INFO-000'}}]},{row:[{PERIO:'1',ITRT_CNTNT:'국어'},{PERIO:'2',ITRT_CNTNT:'수학'},{PERIO:'3',ITRT_CNTNT:'체육'}]}]};
 if(ep==='classInfo')return {classInfo:[{head:[{list_total_count:1}]},{row:[{AY:'2026',GRADE:'6',CLASS_NM:'1'}]}]};
 return {RESULT:{CODE:'INFO-200'}};});},mode);
const txt=(page,id)=>page.$eval('#'+id,e=>e.innerText.trim());
const refresh=async page=>{await page.click('#refresh');await page.waitForTimeout(600);};
(async()=>{
 fs.rmSync(PROFILE,{recursive:true,force:true});fs.rmSync(BK,{force:true});
 let {app,page}=await launch();
 await page.evaluate(()=>{localStorage.setItem('settings',JSON.stringify({grade:'6',classroom:'1',apiKey:'SECRET-KEY-123'}));localStorage.setItem('morningDefault',JSON.stringify('책 읽기 20분'));localStorage.setItem('boardTitles',JSON.stringify({morning:'오늘 할 일'}));localStorage.setItem('dashboardLocked','false');localStorage.setItem('ddayEvents',JSON.stringify([{title:'수학여행',date:'2026-12-01'}]));localStorage.setItem('lastLocation',JSON.stringify({lat:35.9,lon:126.7}));localStorage.setItem('boardSizes',JSON.stringify({row:.6}));});
 await neis(app,'normal');await page.reload();await page.waitForTimeout(900);
 // ---------- 시간표/급식 상태 ----------
 ok('A. 정상 수업일 시간표',(await txt(page,'timetable')).includes('국어')&&(await txt(page,'timetable')).includes('체육'));
 ok('A. 정상 급식',(await txt(page,'meal')).includes('미역국'));
 await neis(app,'error');await refresh(page);
 ok('C. API 장애 + 캐시 → 저장된 시간표 유지',(await txt(page,'timetable')).includes('국어')&&(await txt(page,'timetableStatus')).includes('저장된 정보'),await txt(page,'timetableStatus'));
 ok('C. API 장애 + 캐시 → 저장된 급식 유지',(await txt(page,'meal')).includes('미역국'));
 await page.screenshot({path:OUT+'/v2-01-cache.png'});
 await neis(app,'holiday');await page.evaluate(()=>localStorage.setItem('cache','{}'));await page.reload();await page.waitForTimeout(900);
 const tt=await txt(page,'timetable'),ml=await txt(page,'meal');
 ok('B. 휴일(정상 응답+0건) 시간표',tt==='오늘은 등록된 수업이 없습니다.',tt);ok('B. 급식 없는 날',ml==='오늘은 급식이 없습니다.',ml);
 ok('B. 휴일은 오류 문구 없음',!(await page.evaluate(()=>document.querySelector('main').innerText)).match(/불러오지 못|undefined|null|error/i));
 await page.screenshot({path:OUT+'/v2-02-holiday.png'});
 await neis(app,'error');await page.evaluate(()=>localStorage.setItem('cache','{}'));await page.reload();await page.waitForTimeout(900);
 ok('D. API 장애 + 캐시 없음 → 작은 안내',(await txt(page,'timetable')).includes('불러오지 못했습니다')&&(await page.$eval('#timetable .empty',e=>parseFloat(getComputedStyle(e).fontSize)))<=16);
 ok('방학에도 다른 보드 정상',(await txt(page,'morning'))==='책 읽기 20분'&&(await page.$eval('.morning h2',h=>h.textContent)).includes('오늘 할 일'));
 await page.screenshot({path:OUT+'/v2-03-error-nocache.png'});
 await neis(app,'normal');await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForTimeout(700);
 ok('캐시 복구: 연결 회복 시 자동 재조회',(await txt(page,'timetable')).includes('국어'));
 // ---------- 화이트보드 ----------
 await page.click('#whiteboardTab');await page.waitForTimeout(300);
 const U='#whiteboardUndo',R='#whiteboardRedo',dis=s=>page.$eval(s,b=>b.disabled);
 ok('WB. 초기 실행취소/다시실행 비활성',(await dis(U))&&(await dis(R)));
 const lb=await (await page.$('#whiteboardTextLayer')).boundingBox();
 await page.mouse.click(lb.x+200,lb.y+150);await page.keyboard.type('오늘 준비물',{delay:40});await page.waitForTimeout(1300);
 const blocks=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('whiteboardContents')).blocks.map(b=>b.text+'@'+b.x.toFixed(3)+','+b.y.toFixed(3)+'#'+b.fontSize));
 ok('WB. 텍스트 생성·자동저장',(await blocks())[0]?.startsWith('오늘 준비물'));
 ok('WB. 실행취소 활성/다시실행 비활성',!(await dis(U))&&(await dis(R)));
 await page.click(U);ok('WB. 입력 묶음 한 번에 취소',(await blocks())[0]?.startsWith('@'),JSON.stringify(await blocks()));
 await page.click(U);ok('WB. 블록 생성 취소',(await blocks()).length===0);
 ok('WB. 되돌릴 것 없으면 비활성',await dis(U));
 await page.click(R);await page.click(R);ok('WB. 다시 실행 2회',(await blocks())[0]?.startsWith('오늘 준비물')&&await dis(R));
 // move
 const before=(await blocks())[0];await page.click('#whiteboardTextLayer textarea');const mv=await (await page.$('.textblock-move')).boundingBox();
 await page.mouse.move(mv.x+10,mv.y+8);await page.mouse.down();await page.mouse.move(mv.x+210,mv.y+108,{steps:6});await page.mouse.up();
 const moved=(await blocks())[0];ok('WB. 이동',moved!==before);
 await page.click(U);ok('WB. 이동 취소',(await blocks())[0]===before,(await blocks())[0]+' vs '+before);
 await page.click(R);ok('WB. 이동 다시 실행',(await blocks())[0]===moved);
 // font
 await page.click('#whiteboardTextLayer textarea');await page.click('#whiteboardFontPlus');const f1=(await blocks())[0];
 await page.click(U);ok('WB. 글씨 크기 변경 취소',(await blocks())[0]===moved&&f1!==moved,f1);
 // edit text more
 await page.click('#whiteboardTextLayer textarea');await page.keyboard.press('End');await page.keyboard.type(' 챙기기');await page.mouse.click(lb.x+900,lb.y+500);await page.waitForTimeout(100);
 const edited=await blocks();ok('WB. 텍스트 수정 + 바깥 클릭 시 기록',edited.some(t=>t.startsWith('오늘 준비물 챙기기')));
 // delete
 await page.click('#whiteboardTextLayer textarea >> nth=0');await page.click('.whiteboard-block.selected .textblock-delete');const afterDel=await blocks();
 await page.click(U);const undel=await blocks();await page.click(R);const redel=await blocks();
 ok('WB. 삭제→취소→다시 실행',undel.length===afterDel.length+1&&redel.length===afterDel.length,`${afterDel.length}/${undel.length}/${redel.length}`);
 await page.click(U);
 // pen stroke
 await page.click('#whiteboardPen');const cb=await (await page.$('#whiteboardCanvas')).boundingBox();await page.mouse.move(cb.x+100,cb.y+400);await page.mouse.down();await page.mouse.move(cb.x+300,cb.y+450,{steps:5});await page.mouse.up();
 const strokes=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('whiteboardContents')).strokes.length);
 const s1=await strokes();await page.click(U);const s0=await strokes();await page.click(R);ok('WB. 판서도 같은 기록으로 취소/다시',s1===1&&s0===0&&(await strokes())===1);
 await page.click('#whiteboardTyping');
 // clear all + undo
 const full=await blocks();await page.click('#whiteboardClear');ok('WB. 전체 지우기(확인창 유지)',(await blocks()).length===0&&(await strokes())===0);
 await page.click(U);ok('WB. 전체 지우기 후 실행 취소',JSON.stringify(await blocks())===JSON.stringify(full)&&(await strokes())===1);
 // shortcuts
 const wb=()=>page.evaluate(()=>localStorage.getItem('whiteboardContents'));await page.evaluate(()=>document.activeElement.blur());const k0=await wb();await page.keyboard.press('Control+z');const k1=await wb();await page.keyboard.press('Control+y');const k2=await wb();await page.keyboard.press('Control+z');await page.keyboard.press('Control+Shift+Z');
 ok('WB. Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z',k1!==k0&&k2===k0&&(await wb())===k0);
 await page.screenshot({path:OUT+'/v2-04-whiteboard.png'});
 // undo then restart persistence
 await page.click('#whiteboardTextLayer textarea >> nth=0');await page.click('.whiteboard-block.selected .textblock-delete');await page.click(U);const persisted=await blocks();
 await page.click('#dashboardTab');await app.close();({app,page}=await launch());
 ok('WB. 취소 후 상태가 재실행 후 유지',JSON.stringify(await blocks())===JSON.stringify(persisted));
 // shortcut must not fire on dashboard
 await page.keyboard.press('Control+z');ok('WB. 대시보드에서는 단축키 무시',JSON.stringify(await blocks())===JSON.stringify(persisted));
 // ---------- 백업 / 복원 ----------
 await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[globalThis.__openFile||file]});},BK);
 await page.click('#settings');await page.waitForTimeout(300);await page.screenshot({path:OUT+'/v2-05-settings.png'});
 await page.click('#backupCreate');await page.waitForTimeout(700);
 ok('BK. 백업 완료 메시지',(await txt(page,'backupStatus')).startsWith('백업이 완료되었습니다.'),await txt(page,'backupStatus'));
 const raw=fs.readFileSync(BK,'utf8'),bk=JSON.parse(raw);
 ok('BK. schemaVersion·appVersion·createdAt',bk.schemaVersion===1&&bk.appVersion==='1.8.2'&&!!bk.createdAt&&bk.format==='classroom-dashboard-backup',bk.appVersion);
 ok('BK. 사용자 데이터 포함',bk.data.morningDefault==='책 읽기 20분'&&bk.data.boardTitles.morning==='오늘 할 일'&&bk.data.ddayEvents.length===1&&bk.data.whiteboardContents.blocks.length===persisted.length&&bk.data.boardSizes.row===.6&&bk.data.settings.grade==='6');
 ok('BK. 민감정보·캐시·위치 제외',!raw.includes('SECRET-KEY-123')&&!bk.data.cache&&!bk.data.lastLocation&&!Object.keys(bk.data).some(k=>k.startsWith('weather'))&&!/cookie|token|password|hiclass/i.test(raw));
 const userFiles=fs.readdirSync(PROFILE);ok('BK. 로그인 세션(Partitions)은 백업 대상 아님',!raw.includes('Partitions'),userFiles.join(','));
 // change data then restore
 await page.evaluate(()=>{localStorage.setItem('morningDefault',JSON.stringify('바뀐 내용'));localStorage.setItem('boardTitles',JSON.stringify({morning:'바뀐 제목'}));});
 // invalid file
 fs.writeFileSync(OUTDIR+'/bad.json','{"hello":1}');await app.evaluate(({},f)=>{globalThis.__openFile=f;},OUTDIR+'/bad.json');
 await page.click('#backupRestore');await page.waitForTimeout(400);
 ok('BK. 잘못된 파일 거부',(await txt(page,'backupStatus'))==='이 파일은 사용할 수 있는 학급 대시보드 백업 파일이 아닙니다.'&&(await page.evaluate(()=>localStorage.getItem('morningDefault')))==='"바뀐 내용"');
 const t=JSON.parse(raw);t.data.morningDefault='변조됨';fs.writeFileSync(OUTDIR+'/tampered.json',JSON.stringify(t));await app.evaluate(({},f)=>{globalThis.__openFile=f;},OUTDIR+'/tampered.json');
 await page.click('#backupRestore');await page.waitForTimeout(400);ok('BK. 손상 파일 거부, 기존 데이터 유지',(await txt(page,'backupStatus')).includes('손상')&&(await page.evaluate(()=>localStorage.getItem('morningDefault')))==='"바뀐 내용"');
 await app.evaluate(({},f)=>{globalThis.__openFile=f;},BK);
 await page.click('#backupRestore');await page.waitForSelector('#backupConfirmDialog[open]');await page.screenshot({path:OUT+'/v2-06-restore-confirm.png'});
 await page.click('#backupConfirmDialog button[value=cancel]');await page.waitForTimeout(200);
 ok('BK. 확인창 취소 시 변경 없음',(await page.evaluate(()=>localStorage.getItem('morningDefault')))==='"바뀐 내용"');
 await page.evaluate(()=>{window.__beforeRestore=1;});await page.click('#backupRestore');await page.waitForSelector('#backupConfirmDialog[open]');await page.click('#backupConfirmDialog button[value=restore]');
 await page.waitForTimeout(2000);await page.waitForLoadState('domcontentloaded');await page.waitForTimeout(800);
 ok('BK. 복원 후 화면을 실제로 다시 불러옴(저장 차단 해제)',await page.evaluate(()=>window.__beforeRestore===undefined&&!window.dashboardRestoring));
 ok('BK. 복원 후 다시 불러오기·값 복원',(await txt(page,'morning'))==='책 읽기 20분'&&(await page.$eval('.morning h2',h=>h.textContent)).includes('오늘 할 일'));
 ok('BK. 복원 시 화이트보드 덮어쓰기 없음',JSON.stringify(await blocks())===JSON.stringify(persisted));
 ok('BK. 복원 전 자동 보관본 생성',fs.readdirSync(PROFILE+'/backups').some(f=>f.startsWith('before-restore-')));
 ok('BK. 복원해도 이 PC의 제외 항목(API 키)은 유지',(await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('settings'));return s.grade==='6'&&s.apiKey==='SECRET-KEY-123';})));
 ok('health. 업데이트 헬스체크 조건',await page.evaluate(()=>Boolean(window.classroomTools&&window.desktop&&document.getElementById('activityTab'))));
 await app.close();
 const f=results.filter(r=>!r[1]);console.log(`\n${results.length-f.length}/${results.length} passed`);process.exit(f.length?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
