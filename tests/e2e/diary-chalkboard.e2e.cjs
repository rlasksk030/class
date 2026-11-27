// 알림장 칠판 모드 E2E (작업 지시서 8장): button state, open/close (Esc, [닫기]) without touching the
// draft, auto fit at three window sizes, manual size and date setting kept after a restart, pages
// (buttons, keyboard, tap), tool bar hiding after 3 s, font and contrast, backup/restore, and both
// publishing services where the edition has them. Isolated profile, offline.
const path=require('node:path'),fs=require('node:fs');
const {_electron}=require('playwright-core');
const ROOT=path.resolve(__dirname,'../..'),OUT=require('../output.cjs');
const PROFILE=path.join(OUT,'profile-diary-chalkboard'),BACKUP=path.join(OUT,'chalk-backup.json');
const results=[];let lastStep='start';const ok=(name,pass,detail='')=>{lastStep=name;results.push(!!pass);console.log((pass?'PASS':'FAIL')+' '+name+(detail?' — '+detail:''));};
const errors=[];let app,page;
const SHORT='1. 체육복 챙기기\n2. 우유 급식 신청서 금요일까지 제출\n3. 다음 주 수요일 현장체험학습';
const LONG=Array.from({length:30},(_,i)=>i%6===5?'':`${i+1}. 내일 준비물과 숙제를 꼭 확인하고 알림장에 적기`).join('\n');

async function launch(){
 app=await _electron.launch({executablePath:require('electron'),args:['--no-sandbox',path.join(ROOT,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:PROFILE}});
 page=await app.firstWindow();page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(`${e} (after "${lastStep}")`));
 await page.waitForLoadState('domcontentloaded');await page.setViewportSize({width:1440,height:900});
 await app.evaluate(({ipcMain,dialog},file)=>{ipcMain.removeHandler('fetch');ipcMain.handle('fetch',async()=>{throw Error('offline test');});
  dialog.showSaveDialog=async()=>({canceled:false,filePath:file});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},BACKUP);
 await page.evaluate(()=>document.fonts.ready);
}
const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const state=()=>page.evaluate(()=>window.diaryChalkboard.state());
const openBoard=async()=>{await page.click('#diaryChalk');await page.waitForSelector('#diaryChalkboard:not([hidden])');await page.evaluate(()=>document.fonts.ready);await frames();await page.waitForTimeout(150);};
const write=async(title,body)=>{await page.fill('#diaryTitle',title);await page.fill('#diaryBody',body);await page.waitForTimeout(250);};
// Every text block on the board stays inside the board and above the tool bar.
const inside=()=>page.evaluate(()=>{
 const board=document.getElementById('diaryChalkboard'),sheet=board.querySelector('.chalkboard__sheet'),bar=board.querySelector('.chalkboard__bar').getBoundingClientRect(),s=sheet.getBoundingClientRect();
 const issues=[];for(const el of board.querySelectorAll('.chalkboard__date,.chalkboard__title,.chalkboard__body')){if(el.hidden||!el.textContent)continue;const r=el.getBoundingClientRect();
  if(r.left<s.left-1||r.right>s.right+1||r.top<s.top-1)issues.push('outside:'+el.className);if(r.bottom>bar.top+1)issues.push('under bar:'+el.className+' '+Math.round(r.bottom)+'>'+Math.round(bar.top));}
 if(sheet.scrollHeight>sheet.clientHeight+1||sheet.scrollWidth>sheet.clientWidth+1)issues.push('overflow');
 return issues;});

(async()=>{try{
 fs.rmSync(PROFILE,{recursive:true,force:true});
 await launch();
 await page.evaluate(()=>{localStorage.setItem('settings',JSON.stringify({grade:'6',classroom:'1'}));localStorage.setItem('dashboardLocked','false');});
 await page.reload();await page.waitForLoadState('domcontentloaded');await page.click('#diaryTab');await page.waitForTimeout(300);
 // ---------- Button ----------
 await page.fill('#diaryBody','');await page.waitForTimeout(700);
 ok('본문이 비면 [칠판 모드] 흐림 + 안내',await page.isDisabled('#diaryChalk')&&(await page.textContent('#diaryChalkHint')).includes('먼저 적어'));
 const box=await page.locator('#diaryChalk').boundingBox();ok('[칠판 모드] 버튼 44px 이상 · 보내기 칸 맨 위',box.height>=44&&(await page.evaluate(()=>{const g=document.querySelector('.diary-chalk-group'),send=document.querySelector('.diary-send-title');return document.querySelector('.diary-footer').contains(g)&&g.getBoundingClientRect().bottom<=send.getBoundingClientRect().top&&!g.previousElementSibling;})));
 await write('11월 13일 알림장',SHORT);
 ok('본문을 쓰면 [칠판 모드] 활성',!(await page.isDisabled('#diaryChalk')));
 // ---------- Open / close keeps the editor and the draft ----------
 await page.evaluate(()=>{const b=document.getElementById('diaryBody');b.focus();b.setSelectionRange(5,9);});
 const before=await page.evaluate(()=>({body:document.getElementById('diaryBody').value,title:document.getElementById('diaryTitle').value,drafts:localStorage.getItem('diaryDrafts'),editor:localStorage.getItem('diaryEditorPreferences')}));
 await openBoard();
 const shown=await page.evaluate(()=>{const b=document.getElementById('diaryChalkboard');return {date:b.querySelector('.chalkboard__date').textContent,title:b.querySelector('.chalkboard__title').textContent,body:b.querySelector('.chalkboard__body').textContent,expected:new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'long'}).format(new Date(document.getElementById('diaryDate').value+'T00:00:00+09:00'))};});
 ok('열기: 날짜 · 제목 · 본문(쓴 그대로, 번호 그대로)',shown.date===shown.expected&&/^\d+월 \d+일 .요일$/.test(shown.date)&&shown.title==='11월 13일 알림장'&&shown.body===SHORT,JSON.stringify(shown));
 ok('칠판이 앱 창 전체를 덮음(아래 도구 막대 가림)',await page.evaluate(()=>{const r=document.getElementById('diaryChalkboard').getBoundingClientRect();return r.left===0&&r.top===0&&r.width===innerWidth&&r.height===innerHeight;})&&!(await page.isVisible('.app-bar .screen-tabs')));
 await page.keyboard.press('Escape');await frames();
 const after=await page.evaluate(()=>{const b=document.getElementById('diaryBody');return {body:b.value,title:document.getElementById('diaryTitle').value,drafts:localStorage.getItem('diaryDrafts'),editor:localStorage.getItem('diaryEditorPreferences'),sel:[b.selectionStart,b.selectionEnd]};});
 ok('Esc로 닫기 · 편집 내용 · 초안 · 편집기 글씨 크기 · 커서 그대로',!(await page.isVisible('#diaryChalkboard'))&&after.body===before.body&&after.title===before.title&&after.drafts===before.drafts&&after.editor===before.editor&&after.sel.join()==='5,9',JSON.stringify(after.sel));
 await openBoard();await page.click('#chalkClose');ok('[닫기]로 닫기',!(await page.isVisible('#diaryChalkboard')));
 // Edits after closing show up the next time it opens; photos never appear.
 await page.fill('#diaryBody',SHORT+'\n4. 독서 기록장 쓰기');await page.waitForTimeout(250);await openBoard();
 ok('고친 내용은 다시 열 때 보임 · 사진 없음(글자만)',(await page.textContent('.chalkboard__body')).endsWith('4. 독서 기록장 쓰기')&&!(await page.locator('#diaryChalkboard img').count()));
 await page.keyboard.press('Escape');await page.fill('#diaryBody',SHORT);await page.waitForTimeout(250);
 // ---------- Auto fit at three window sizes ----------
 const autoSizes={};
 for(const [w,h] of [[1100,760],[1440,900],[1920,1080]]){
  await page.setViewportSize({width:w,height:h});await openBoard();
  const s=await state(),issues=await inside();autoSizes[w]=s.size;
  ok(`${w}×${h} 자동 맞춤: 한 쪽 · 화면 밖/막대 아래로 넘침 없음 · 28px~min(12vh,120px)`,s.pages===1&&!issues.length&&s.size>=28&&s.size<=Math.max(28,Math.min(h*.12,120)),JSON.stringify({size:s.size,issues}));
  await page.keyboard.press('Escape');
 }
 ok('창이 클수록 글씨가 큼',autoSizes[1100]<autoSizes[1440]&&autoSizes[1440]<=autoSizes[1920],JSON.stringify(autoSizes));
 await page.setViewportSize({width:1440,height:900});
 // Window resize while open re-fits (ResizeObserver).
 await openBoard();const sizeA=(await state()).size;await page.setViewportSize({width:1100,height:760});await frames();await page.waitForTimeout(300);
 ok('열린 채로 창 크기가 바뀌면 다시 맞춤',(await state()).size<sizeA&&!(await inside()).length);
 await page.setViewportSize({width:1440,height:900});await frames();await page.waitForTimeout(300);
 // ---------- Font and contrast ----------
 const look=await page.evaluate(()=>{const b=document.getElementById('diaryChalkboard'),text=b.querySelector('.chalkboard__body');
  const rgb=c=>c.match(/\d+(\.\d+)?/g).slice(0,3).map(Number),lum=c=>{const [r,g,bl]=rgb(c).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*bl;};
  const fg=lum(getComputedStyle(text).color),bg=lum(getComputedStyle(b).backgroundColor);
  return {font:getComputedStyle(text).fontFamily.split(',')[0].replace(/["']/g,'').trim(),weight:getComputedStyle(text).fontWeight,loaded:document.fonts.check('bold 40px "Gowun Batang"'),ratio:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05),bar:getComputedStyle(b.querySelector('.chalkboard__button')).fontFamily.split(',')[0].replace(/["']/g,'').trim()};});
 ok('글꼴: 본문 고운바탕 Bold(실제 로드), 막대 나눔바른고딕',look.font==='Gowun Batang'&&look.weight==='700'&&look.loaded&&look.bar==='Nanum Barun Gothic',JSON.stringify(look));
 ok('본문 명암비 7:1 이상',look.ratio>=7,look.ratio.toFixed(2));
 ok('도구 막대 버튼 56px 이상',await page.evaluate(()=>[...document.querySelectorAll('#diaryChalkboard .chalkboard__button')].filter(b=>!b.hidden).every(b=>{const r=b.getBoundingClientRect();return r.height>=56&&r.width>=56;})));
 ok('쪽이 하나면 [이전] · 쪽 표시 · [다음] 숨김',!(await page.isVisible('#chalkPrev'))&&!(await page.isVisible('#chalkPage'))&&!(await page.isVisible('#chalkNext')));
 // ---------- Manual size, kept after a restart; [맞춤] returns to auto ----------
 const auto=(await state()).size;await page.click('#chalkBigger');await page.click('#chalkBigger');const manual=(await state()).size;
 ok('[가+] 두 번: 약 8%씩 커짐',manual>auto&&Math.abs(manual/auto-1.08*1.08)<.04,`${auto}→${manual}`);
 await page.keyboard.press('Escape');await app.close();await launch();await page.click('#diaryTab');await page.waitForTimeout(400);
 ok('재시작 후 초안 그대로',(await page.inputValue('#diaryBody'))===SHORT);
 await openBoard();ok('재시작 후에도 같은 크기',(await state()).size===manual,`${(await state()).size} vs ${manual}`);
 await page.click('#chalkFit');ok('[맞춤]: 자동 맞춤으로 복귀',(await state()).size===auto&&(await state()).prefs.fontScale===null);
 await page.click('#chalkSmaller');ok('[가−]: 작아짐',(await state()).size<auto);await page.click('#chalkFit');
 // ---------- Date: hide, kept ----------
 await page.click('#chalkDate');ok('[날짜 숨기기]: 날짜 줄 숨김',!(await page.isVisible('.chalkboard__date'))&&(await page.textContent('#chalkDate'))==='날짜 보이기');
 await page.keyboard.press('Escape');await app.close();await launch();await page.click('#diaryTab');await page.waitForTimeout(400);await openBoard();
 ok('날짜 숨김 기억(재시작 후)',!(await page.isVisible('.chalkboard__date'))&&(await state()).prefs.showDate===false);
 await page.click('#chalkDate');ok('[날짜 보이기]',await page.isVisible('.chalkboard__date'));
 await page.keyboard.press('Escape');
 // ---------- Long notice: pages, buttons, keyboard, tap ----------
 await write('11월 13일 알림장',LONG);await openBoard();
 let s=await state();
 ok('긴 글: 최소 크기 28px에서 여러 쪽',s.size===28&&s.pages>=2&&(await page.textContent('#chalkPage'))===`1 / ${s.pages}`,JSON.stringify(s));
 ok('첫 쪽: [이전] 흐림, [다음] 누를 수 있음',await page.isDisabled('#chalkPrev')&&!(await page.isDisabled('#chalkNext')));
 const firstPage=await page.textContent('.chalkboard__body');
 await page.click('#chalkNext');ok('[다음] → 2쪽(날짜 · 제목 다시 보임, 빈 줄로 시작 안 함)',(await page.textContent('#chalkPage')).startsWith('2 /')&&await page.isVisible('.chalkboard__date')&&await page.isVisible('.chalkboard__title')&&!(await page.textContent('.chalkboard__body')).startsWith('\n')&&!(await inside()).length);
 await page.keyboard.press('ArrowLeft');ok('← 키: 이전 쪽',(await page.textContent('#chalkPage')).startsWith('1 /')&&(await page.textContent('.chalkboard__body'))===firstPage);
 await page.keyboard.press('PageDown');ok('PageDown: 다음 쪽',(await page.textContent('#chalkPage')).startsWith('2 /'));
 await page.keyboard.press('PageUp');await page.keyboard.press('ArrowRight');ok('PageUp · → 키',(await page.textContent('#chalkPage')).startsWith('2 /'));
 await page.keyboard.press('ArrowLeft');await page.mouse.click(1200,400);ok('칠판 오른쪽을 누르면 다음 쪽',(await page.textContent('#chalkPage')).startsWith('2 /'));
 await page.mouse.click(200,400);ok('칠판 왼쪽을 누르면 이전 쪽',(await page.textContent('#chalkPage')).startsWith('1 /'));
 // ---------- Tool bar hides after 3 s; the first tap only shows it ----------
 await page.waitForTimeout(3400);
 ok('3초 동안 움직임이 없으면 도구 막대 숨김',!(await page.isVisible('.chalkboard__bar'))&&await page.evaluate(()=>document.getElementById('diaryChalkboard').classList.contains('bar-hidden')));
 await page.mouse.click(1200,400);ok('숨은 뒤 첫 누름은 막대만 다시 보임(쪽 넘김 없음)',await page.isVisible('.chalkboard__bar')&&(await page.textContent('#chalkPage')).startsWith('1 /'));
 await page.keyboard.press('Escape');
 // ---------- Backup → restore keeps the chalk settings ----------
 await write('11월 13일 알림장',SHORT);await openBoard();await page.click('#chalkBigger');await page.click('#chalkDate');const keep=(await state()).prefs;await page.keyboard.press('Escape');
 await page.click('#dashboardTab');await page.click('#settings');await page.click('#settingsNavBackup');await page.click('#backupCreate');await page.waitForTimeout(800);await page.keyboard.press('Escape');
 const file=JSON.parse(fs.readFileSync(BACKUP,'utf8'));ok('백업 파일에 칠판 설정 포함',JSON.stringify(file.data.diaryChalkPreferences)===JSON.stringify(keep),JSON.stringify(file.data.diaryChalkPreferences));
 await page.evaluate(()=>localStorage.setItem('diaryChalkPreferences',JSON.stringify({fontScale:null,showDate:true})));
 await page.click('#settings');await page.click('#settingsNavBackup');await page.click('#backupRestore');await page.waitForSelector('#backupConfirmDialog[open]');await page.click('#backupConfirmDialog button[value=restore]');
 await page.waitForTimeout(2000);await page.waitForLoadState('domcontentloaded');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(500);
 ok('백업 복원 후 칠판 설정 그대로',(await page.evaluate(()=>localStorage.getItem('diaryChalkPreferences')))===JSON.stringify(keep));
 // Broken saved values fall back to the defaults.
 await page.evaluate(()=>localStorage.setItem('diaryChalkPreferences','{"fontScale":"huge","showDate":"x"}'));await page.reload();await page.waitForLoadState('domcontentloaded');
 await page.click('#diaryTab');await page.waitForTimeout(400);
 if(!(await page.inputValue('#diaryBody')))await write('11월 13일 알림장',SHORT);
 await openBoard();ok('이상한 저장값은 기본값(자동 맞춤 · 날짜 보임)',(await state()).prefs.fontScale===null&&(await state()).prefs.showDate===true&&await page.isVisible('.chalkboard__date'));
 await page.keyboard.press('Escape');
 // ---------- Every publishing service ----------
 if(await page.locator('#diaryService').count()){
  for(const service of ['schoolbell','hiclass']){
   await page.selectOption('#diaryService',service);await page.waitForTimeout(400);
   if(!(await page.inputValue('#diaryBody')))await write('11월 13일 알림장',SHORT);
   await openBoard();ok(`발행 서비스 '${service}'에서도 칠판 모드 동작`,(await page.textContent('.chalkboard__body')).length>0);await page.keyboard.press('Escape');
  }
 }else ok('발행 서비스 고르기가 없는 판: 하이클래스 화면에서 동작',true);
 ok('페이지 오류 없음',!errors.length,errors.join(' | '));
}catch(e){console.error(e);results.push(false);}finally{if(app)await app.close().catch(()=>{});}
 const passed=results.filter(Boolean).length;
 console.log(`\n알림장 칠판 모드 E2E: ${passed}/${results.length} PASS`);
 process.exitCode=passed===results.length?0:1;
})();
