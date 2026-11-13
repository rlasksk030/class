// Regression E2E for features that existed before v1.8.2: random picker, timer, D-Day, board settings,
// screen lock, timetable edit/highlight, notices "yesterday", diary local rules. Output: tests/e2e/.out
const path=require('path'),fs=require('fs');
const {_electron}=require('playwright-core');const electronPath=require('electron');
const ROOT=path.resolve(__dirname,'../..'),OUTDIR=require('../output.cjs'),PROFILE=path.join(OUTDIR,'profile-regression');
const results=[];const ok=(n,c,d='')=>{results.push([n,!!c]);console.log((c?'PASS':'FAIL')+' '+n+(d?' — '+d:''));};
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
const shift=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
async function launch(){const app=await _electron.launch({executablePath:electronPath,args:['--no-sandbox',path.join(ROOT,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:PROFILE}});const page=await app.firstWindow();page.on('dialog',d=>d.accept());await page.waitForLoadState('domcontentloaded');
 await app.evaluate(({ipcMain})=>{globalThis.publishCalls=0;ipcMain.removeHandler('fetch');ipcMain.handle('fetch',async(_,url)=>{const ep=new URL(url).pathname.split('/').pop();
  if(ep==='elsTimetable')return {elsTimetable:[{head:[{list_total_count:6}]},{row:['국어','수학','사회','과학','체육','음악'].map((s,i)=>({PERIO:String(i+1),ITRT_CNTNT:s}))}]};
  if(ep==='mealServiceDietInfo')return {mealServiceDietInfo:[{head:[{list_total_count:1}]},{row:[{DDISH_NM:'잡곡밥<br/>미역국'}]}]};throw Error('offline');});
  ipcMain.removeHandler('diary:publish');ipcMain.handle('diary:publish',async()=>{globalThis.publishCalls++;return {status:'error',message:'테스트: 하이클래스 연결 안 됨'};});
  ipcMain.removeHandler('diary:connect');ipcMain.handle('diary:connect',async()=>{throw Error('자동화 실패 모의');});});
 await page.waitForTimeout(600);return {app,page};}
(async()=>{
 fs.rmSync(PROFILE,{recursive:true,force:true});fs.mkdirSync(OUTDIR,{recursive:true});
 let {app,page}=await launch();const d=today(),y=shift(d,-1);
 await page.evaluate(([d,y])=>{localStorage.setItem('settings',JSON.stringify({grade:'6',classroom:'1'}));localStorage.setItem('dashboardLocked','false');localStorage.setItem('notes',JSON.stringify({[y]:{notices:'어제 안내: 우산 챙기기'}}));
  const now=new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Seoul'})),m=now.getHours()*60+now.getMinutes(),t=x=>String(Math.floor(((x%1440)+1440)%1440/60)).padStart(2,'0')+':'+String(((x%1440)+1440)%1440%60).padStart(2,'0');
  // Period 1 always contains the current minute (any time of day); later periods only if they fit before midnight.
  const start=Math.max(m-5,0),rows=[0,1,2,3,4,5].map(i=>({period:i+1,start:start+i*40,end:Math.min(start+i*40+35,1439)})).filter(r=>r.end>r.start&&r.start<1439);localStorage.setItem('periodSchedule',JSON.stringify(rows.map(r=>({period:r.period,start:t(r.start),end:t(r.end)}))));localStorage.setItem('periodHighlightEnabled','true');},[d,y]);
 await page.reload();await page.waitForTimeout(900);
 // ---------- 시간표 ----------
 ok('시간표 자동 조회',(await page.locator('#timetable .lesson').count())===6);
 ok('현재 교시 자동 강조(지금 교시만, 다음 교시 표시 없음)',(await page.locator('#timetable .lesson-current').count())===1&&(await page.locator('#timetable .lesson-next').count())===0&&!(await page.innerText('#timetable')).includes('다음')&&!(await page.innerText('header')).includes('다음'));
 await page.click('[data-edit=timetable]');{const fields=page.locator('#timetableRows input');ok('시간표 수정 창: 교시마다 과목 칸 1~6교시',(await fields.count())===6&&(await page.textContent('#timetableRows')).includes('6교시')&&!(await page.isVisible('#editText')));for(let i=0;i<6;i++)await fields.nth(i).fill(['국어','영어'][i]||'');}await page.click('#editForm .primary');
 ok('시간표 당일 직접 수정',(await page.innerText('#timetable')).includes('영어')&&(await page.innerText('#timetableStatus')).includes('직접 수정'));
 await page.click('[data-edit=timetable]');await page.click('#restore');ok('원래 시간표로 되돌리기',(await page.locator('#timetable .lesson').count())===6);
 // ---------- 안내사항: 어제 내용 ----------
 // An empty board shows one write button in a dashed box; its head [작성] is hidden (same action).
 ok('빈 안내사항: 점선 상자 + [안내사항 작성], 머리 [작성] 숨김',await page.isVisible('#notices .board-empty')&&!(await page.isVisible('[data-edit=notices]'))&&(await page.textContent('[data-empty-edit=notices]')).includes('안내사항 작성'));
 await page.click('[data-empty-edit=notices]');await page.click('#loadYesterday');ok('안내사항 어제 내용 불러오기',(await page.inputValue('#editText'))==='어제 안내: 우산 챙기기');await page.fill('#editText','오늘 안내: 체육복');await page.click('#editForm .primary');
 ok('안내사항 저장',(await page.innerText('#notices'))==='오늘 안내: 체육복');
 // ---------- D-Day ----------
 await page.click('#screenSettings');await page.click('#openDdaySettings');
 for(const [t,n] of [['현장체험',10],['졸업식',40],['운동회',5]]){await page.fill('#ddayTitle',t);await page.fill('#ddayDate',shift(d,n));await page.click('#ddayForm .primary');}
 ok('D-Day 최대 2개 표시(가까운 순)',(await page.locator('#ddayBadge span').count())===2&&(await page.textContent('#ddayBadge span')).includes('운동회 D-5'));
 await page.locator('.event-row',{hasText:'운동회'}).getByText('수정').click();await page.fill('#ddayTitle','가을 운동회');await page.fill('#ddayDate',shift(d,0));await page.click('#ddayForm .primary');
 ok('D-Day 제목/날짜 수정·당일 D-Day',(await page.textContent('#ddayBadge')).includes('가을 운동회 D-Day'));
 const badgeFont=await page.$eval('#ddayBadge span',e=>parseFloat(getComputedStyle(e).fontSize));ok('D-Day 글씨 18px 이상',badgeFont>=18,badgeFont+'px');
 for(const t of ['가을 운동회','현장체험','졸업식'])await page.locator('.event-row',{hasText:t}).getByText('삭제').click();
 ok('D-Day 삭제·없으면 영역 숨김',!(await page.isVisible('#ddayBadge')));
 await page.keyboard.press('Escape');
 // ---------- 보드 설정 ----------
 await page.click('#screenSettings');await page.uncheck('[data-board-visible=meal]');ok('보드 숨김(자리 비움)',await page.$eval('.meal',e=>getComputedStyle(e).display==='none')&&(await page.evaluate(()=>JSON.parse(localStorage.getItem('boardLayout')).items.meal.visible))===false);
 await page.check('[data-board-visible=meal]');const rowPlus=page.locator('.preference-row',{has:page.locator('[data-board-visible=notices]')}).locator('button').nth(1);await rowPlus.click();
 ok('보드별 글씨 크기',(await page.evaluate(()=>JSON.parse(localStorage.getItem('boardPreferences')).notices.scale))===1.1);await page.keyboard.press('Escape');
 const before=await page.$eval('.notices',e=>Math.round(e.getBoundingClientRect().width));await page.click('#layoutToggle');await page.focus('main>.notices');for(let i=0;i<2;i++)await page.keyboard.press('Shift+ArrowLeft');
 const narrower=await page.$eval('.notices',e=>Math.round(e.getBoundingClientRect().width));await page.click('#layoutReset');const reset=await page.$eval('.notices',e=>Math.round(e.getBoundingClientRect().width));await page.click('#layoutDone');
 ok('보드 크기 조절·기본 배치 복원',narrower<before&&Math.abs(reset-before)<=1,`${before}→${narrower}→${reset}`);
 // ---------- 타이머 ----------
 await page.click('#timerButton');for(const n of [1,3,5,10,15]){await page.click(`[data-minutes="${n}"]`);if((await page.textContent('#timerDisplay'))!==String(n).padStart(2,'0')+':00')ok('타이머 프리셋 '+n,false);}
 await page.fill('#timerMinutes','0');await page.fill('#timerSeconds','3');await page.click('#timerSet');await page.check('#timerSound');await page.click('#timerStart');await page.keyboard.press('Escape');
 await page.waitForFunction(()=>/^00:0[12]$/.test(document.querySelector('#timerButton').textContent));const closedTimerLabel=await page.textContent('#timerButton');ok('팝업 닫아도 진행·버튼에 남은 시간',/^00:0[12]$/.test(closedTimerLabel)&&await page.evaluate(()=>classroomTools.timer().state==='running'&&!document.querySelector('#timerDialog').open),closedTimerLabel);
 await page.waitForTimeout(2600);ok('타이머 완료 표시',(await page.textContent('#timerButton')).includes('종료')&&await page.isVisible('#timerFinished'));await page.click('#timerFinished button');
 await page.click('#timerButton');await page.click('#timerReset');ok('타이머 초기화',(await page.textContent('#timerDisplay'))==='00:03');await page.click('#timerStart');await page.click('#timerPause');ok('일시정지→계속하기',(await page.textContent('#timerStart'))==='계속하기');await page.click('#timerReset');await page.keyboard.press('Escape');
 // ---------- 랜덤 뽑기 ----------
 await page.click('#randomTab');await page.$eval('#rosterEditor',e=>e.open=true);await page.fill('#rosterText',['가온','나래','다온','라온','마루','바다'].join('\n'));await page.click('#saveRoster');
 await page.click('#drawOne');await page.waitForTimeout(1800);ok('1명 뽑기',(await page.locator('#pickHistory li').count())===1);
 // E04 발표 화면: 뽑힌 이름을 크게, 닫으면 그대로 돌아옴(뽑기 기록은 그대로)
 await page.click('#showBig');{const big=await page.textContent('#presentName'),small=await page.textContent('#pickResult');ok('발표 화면으로 크게(같은 이름, 아래 막대 없음)',await page.isVisible('#randomPresent')&&big===small&&big.length>0&&!(await page.isVisible('.app-bar .screen-tabs')));}
 await page.click('#presentClose');ok('발표 화면 닫기',!(await page.isVisible('#randomPresent'))&&(await page.locator('#pickHistory li').count())===1&&!(await page.textContent('#pickResult')).includes('🎉'));
 await page.click('#pickPlus');ok('인원 [−] 2 [+] → 3',(await page.textContent('#pickCount'))==='3');await page.click('#drawMany');await page.waitForTimeout(1800);ok('여러 명 뽑기',(await page.locator('#pickHistory li').count())===4);
 const hist=await page.evaluate(()=>JSON.parse(localStorage.getItem('randomPickerSession')).history);ok('한 라운드 중복 없음',new Set(hist).size===hist.length);
 await page.click('#drawMany');await page.waitForTimeout(400);ok('남은 인원 초과 시 안내',(await page.textContent('#pickStatus')).includes('뽑을 수 있는 학생은 2명'));
 await page.$eval('#exclusionDetails',e=>e.open=true);await page.locator('#excludeList input').nth(0).check();ok('오늘 제외',(await page.evaluate(()=>JSON.parse(localStorage.getItem('randomPickerSession')).excluded.length))===1);
 await page.click('#includeAll');ok('전체 다시 포함',(await page.evaluate(()=>JSON.parse(localStorage.getItem('randomPickerSession')).excluded.length))===0);
 await page.click('#newRound');ok('새 라운드',(await page.locator('#pickHistory li').count())===0);
 await page.click('[data-group-mode="2"]');await page.click('#makeGroups');const g1=await page.innerText('#groupResults');await page.click('#shuffleGroups');
 ok('모둠 자동 편성·다시 섞기',(await page.locator('#groupResults h3').count())===3&&!!g1);
 // ---------- 알림장 (로컬) ----------
 await page.click('#diaryTab');await page.fill('#diaryBody','내일 준비물: 리코더');await page.uncheck('#diaryParents');await page.uncheck('#diaryStudents');
 ok('학부모·학생 모두 OFF 안내',(await page.textContent('#diaryStatus')).includes('한 곳 이상'));
 await page.click('#diaryPublish');ok('모두 OFF면 등록 차단(하이클래스 호출 없음)',(await app.evaluate(()=>globalThis.publishCalls))===0&&(await page.textContent('#diaryStatus')).includes('한 곳 이상'));
 const combos=[[true,true],[true,false],[false,true]];let saved=true;
 for(const [p,s] of combos){await page.setChecked('#diaryParents',p);await page.setChecked('#diaryStudents',s);const dr=await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('diaryDrafts')))[0]);if(dr.parents!==p||dr.students!==s)saved=false;}
 ok('수신대상 4개 조합 초안과 함께 저장',saved);
 await page.click('#diaryPublish');await page.waitForTimeout(300);ok('선택 시 등록 요청 전달·실패해도 초안 유지',(await app.evaluate(()=>globalThis.publishCalls))===1&&(await page.inputValue('#diaryBody'))==='내일 준비물: 리코더');
 await page.click('#diaryConnect');await page.waitForTimeout(300);ok('하이클래스 자동화 실패가 앱을 멈추지 않음',(await page.textContent('#diaryLinkMessage')).includes('작성 내용은 유지')&&await page.isVisible('#diaryTab')&&(await page.inputValue('#diaryBody'))==='내일 준비물: 리코더');
 await page.fill('#diaryDate',shift(d,1));await page.dispatchEvent('#diaryDate','change');ok('날짜별 초안(새 날짜는 빈 본문)',(await page.inputValue('#diaryBody'))==='');
 await page.fill('#diaryDate',d);await page.dispatchEvent('#diaryDate','change');ok('기존 날짜 초안 복원',(await page.inputValue('#diaryBody'))==='내일 준비물: 리코더');
 // ---------- 화면 잠금 ----------
 await page.click('#dashboardTab');await page.click('#screenLock');
 ok('잠금 시 편집 버튼·설정 숨김',!(await page.isVisible('[data-edit=morning]'))&&!(await page.isVisible('[data-empty-edit]'))&&(await page.locator('.app-bar__right .uc-tool:visible').count())===5&&!(await page.isVisible('#settings'))&&!(await page.isVisible('.morning .board-title-edit')));
 await page.click('#screenLock');ok('잠금 해제(수정 또는 빈 칸의 작성 버튼이 다시 보임)',await page.isVisible('[data-edit=morning]:visible, [data-empty-edit=morning]:visible')&&await page.isVisible('#settings'));
 await app.close();
 ({app,page}=await launch());
 await page.click('#randomTab');ok('재실행 후 명단 유지',(await page.innerText('#rosterList')).includes('바다'));
 await page.click('#diaryTab');ok('재실행 후 알림장 초안 유지',(await page.inputValue('#diaryBody'))==='내일 준비물: 리코더');
 await app.close();
 const f=results.filter(r=>!r[1]);console.log(`\n${results.length-f.length}/${results.length} passed`);process.exit(f.length?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
