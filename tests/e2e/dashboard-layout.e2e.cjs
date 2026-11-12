// [배치 편집] E2E: move, swap, resize, hide/show, fill, reset, cancel/done, restart, lock, backup/restore,
// first-run migration, broken values, three window sizes and touch. Isolated profile, offline.
const path=require('node:path'),fs=require('node:fs');
const {_electron}=require('playwright-core');
const ROOT=path.resolve(__dirname,'../..'),OUT=require('../output.cjs');
const PROFILE=path.join(OUT,'profile-dashboard-layout'),BACKUP=path.join(OUT,'layout-backup.json'),OLD=path.join(OUT,'layout-old-backup.json');
const L=require('../../app/layout-core.js');
let lastStep='start';const results=[];const ok=(name,pass,detail='')=>{lastStep=name;results.push(!!pass);console.log((pass?'PASS':'FAIL')+' '+name+(detail?' — '+detail:''));};
const errors=[];
let app,page;

async function launch(){
 app=await _electron.launch({executablePath:require('electron'),args:['--no-sandbox',path.join(ROOT,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:PROFILE}});
 page=await app.firstWindow();
 page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(`${e} (after "${lastStep}") ${String(e.stack||'').split('\n')[1]||''}`));
 await page.waitForLoadState('domcontentloaded');
 await page.setViewportSize({width:1440,height:960});
 await app.evaluate(({ipcMain,dialog},files)=>{
  ipcMain.removeHandler('fetch');ipcMain.handle('fetch',async()=>{throw Error('offline test');});
  dialog.showSaveDialog=async()=>({canceled:false,filePath:files.backup});
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[globalThis.__openFile||files.backup]});
 },{backup:BACKUP});
 await page.evaluate(()=>document.fonts.ready);await frames();
}
const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const reload=async()=>{await page.reload();await page.waitForLoadState('domcontentloaded');await page.evaluate(()=>document.fonts.ready);await frames();await page.waitForTimeout(200);};
const current=()=>page.evaluate(()=>window.boardLayout.get());
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('boardLayout')));
const at=(l,id)=>{const r=l.items[id];return [r.x,r.y,r.w,r.h,r.visible].join(',');};
const box=sel=>page.locator(sel).boundingBox();
// Centre of grid cell (x, y) from the real track sizes.
const cell=(x,y)=>page.evaluate(([x,y])=>{const m=document.querySelector('main'),cs=getComputedStyle(m),b=m.getBoundingClientRect();
 const at=(list,gap,start,i)=>{const s=list.split(' ').map(parseFloat);let pos=start;for(let k=0;k<i-1;k++)pos+=s[k]+gap;return pos+s[i-1]/2;};
 return {x:at(cs.gridTemplateColumns,parseFloat(cs.columnGap),b.left,x),y:at(cs.gridTemplateRows,parseFloat(cs.rowGap),b.top,y)};},[x,y]);
// A point in a board's title bar above grid column `col` (clear of the [숨기기] button).
async function head(id,col){const l=await current(),r=l.items[id],c=await cell(col,r.y),h=await box(`main>.${id} .cardhead`);return {x:c.x,y:h.y+h.height/2};}
async function press(from){await page.mouse.move(from.x,from.y);await page.mouse.down();}
async function moveTo(from,to){for(let i=1;i<=8;i++)await page.mouse.move(from.x+(to.x-from.x)*i/8,from.y+(to.y-from.y)*i/8);await frames();}
const previewState=()=>page.evaluate(()=>{const p=document.querySelector('main>.layout-preview');return p.hidden?'none':p.dataset.state;});
const message=()=>page.textContent('#layoutMessage');
// Visible boards inside <main>, not overlapping, titles not cut.
const geometry=()=>page.evaluate(()=>{
 const m=document.querySelector('main').getBoundingClientRect(),cards=[...document.querySelectorAll('main>.card')].filter(c=>getComputedStyle(c).display!=='none');
 const rects=cards.map(c=>c.getBoundingClientRect()),issues=[];
 rects.forEach((a,i)=>{if(a.left<m.left-1||a.right>m.right+1||a.top<m.top-1||a.bottom>m.bottom+1)issues.push('outside:'+cards[i].classList[1]);
  rects.slice(i+1).forEach((b,j)=>{if(a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1)issues.push('overlap:'+cards[i].classList[1]+'/'+cards[i+j+1].classList[1]);});});
 for(const c of cards){const h=c.querySelector('.cardhead'),t=h.querySelector('h2');if(h.scrollWidth>h.clientWidth+1||t.scrollWidth>t.clientWidth+1)issues.push('title:'+c.classList[1]);}
 return {issues,widths:Object.fromEntries(cards.map((c,i)=>[c.classList[1],Math.round(rects[i].width)]))};
});
const setLayout=async layout=>{await page.evaluate(l=>localStorage.setItem('boardLayout',JSON.stringify(l)),layout);await reload();};

(async()=>{try{
 fs.rmSync(PROFILE,{recursive:true,force:true});
 await launch();
 await page.evaluate(()=>{localStorage.setItem('settings',JSON.stringify({grade:'6',classroom:'1'}));localStorage.setItem('dashboardLocked','false');
  localStorage.setItem('morningDefault',JSON.stringify(['독서 기록장에 어제 읽은 책의 줄거리와 느낀 점을 세 줄 이상 쓰기','수학 익힘책 34쪽부터 36쪽까지 풀고 틀린 문제는 다시 확인하기','오늘의 한 문장을 공책에 바르게 따라 쓰고 소리 내어 읽기','알림장을 확인하고 가방 속 준비물과 숙제를 정리하기','교실 뒤 게시판의 모둠 역할표를 보고 오늘 맡은 일 확인하기','우유 당번은 1교시 전에 우유를 가져와 나누어 주기'].map((t,i)=>`${i+1}. ${t}`).join('\n')));});
 await reload();
 // A fresh nationwide profile with no school chosen throws in core.js schoolKey (same on v1.8.13
 // without this change); count page errors only once the class is set up.
 errors.length=0;

 // ---------- Default board ----------
 ok('기본 배치 = 시간표 1-3열 · 아침활동/안내사항 4-10열(4:2행) · 급식 11-12열',L.equal(await current(),L.defaults())&&L.equal(await saved(),L.defaults()));
 let g=await geometry();ok('기본 배치: 겹침·잘림 없음',!g.issues.length,JSON.stringify(g));
 ok('평소에는 격자선·빈 칸·편집 도구가 보이지 않음',!(await page.isVisible('#layoutToolbar'))&&!(await page.locator('main>.layout-cell').first().isVisible())&&!(await page.isVisible('.layout-hide')));
 await page.screenshot({path:path.join(OUT,'layout-default.png')});

 // ---------- Edit mode ----------
 const widthsBefore=(await geometry()).widths;
 await page.click('#layoutToggle');await frames();
 ok('편집 모드에 들어가도 칸 크기는 그대로',Object.entries((await geometry()).widths).every(([k,v])=>Math.abs(v-widthsBefore[k])<=1),JSON.stringify([widthsBefore,(await geometry()).widths]));
 ok('[배치 편집]: 도구 막대·격자선·숨기기·크기 손잡이 표시',await page.isVisible('#layoutToolbar')&&await page.locator('main>.layout-cell').first().isVisible()&&await page.isVisible('main>.meal .layout-hide')&&await page.isVisible('main>.notices .layout-resize-se')&&(await page.locator('main>.layout-cell').count())===72);
 ok('편집 중 날씨 크기 손잡이 표시',await page.isVisible('.weather [data-resize=weather-width]'));
 await page.evaluate(()=>document.querySelector('[data-edit=morning]').click());
 ok('편집 중 [수정] 버튼은 동작하지 않음',!(await page.evaluate(()=>document.getElementById('editDialog').open)));
 await page.screenshot({path:path.join(OUT,'layout-edit.png')});

 // Hide meal: its cells become an empty slot.
 await page.click('main>.meal .layout-hide');await frames();
 ok('급식 숨기기: 칸이 사라지고 빈 칸 표시',!(await page.isVisible('main>.meal'))&&(await page.locator('main>.layout-empty').count())===1&&(await page.textContent('#layoutTray')).includes('급식'));
 const emptyBox=await box('main>.layout-empty'),mainBox=await box('main');
 ok('빈 칸은 오른쪽 끝 두 열 전체',Math.abs(emptyBox.x+emptyBox.width-(mainBox.x+mainBox.width))<=1&&Math.abs(emptyBox.height-mainBox.height)<=1);
 // Stretch notices to the right edge with its side handle.
 const morningFont=await page.$eval('#morning',e=>parseFloat(e.style.fontSize));
 const handle=await box('main>.notices .layout-resize-e'),edge=await cell(12,6);
 const start={x:handle.x+handle.width/2,y:handle.y+handle.height/2};await press(start);await moveTo(start,{x:edge.x,y:start.y});await page.mouse.up();await frames();
 const notices=await box('main>.notices');
 ok('안내사항을 오른쪽 끝까지 늘림',at(await current(),'notices')==='4,5,9,2,true'&&Math.abs(notices.x+notices.width-(mainBox.x+mainBox.width))<=1,at(await current(),'notices'));
 // Too far: covering the morning board is refused.
 const corner=await box('main>.notices .layout-resize-se'),up=await cell(12,2);
 const cs={x:corner.x+corner.width/2,y:corner.y+corner.height/2};await press(cs);await moveTo(cs,{x:cs.x,y:up.y});
 ok('다른 칸과 겹치는 크기는 빨간색으로 막음',(await previewState())==='bad'&&at(await current(),'notices')==='4,5,9,2,true');
 await page.mouse.up();await frames();
 await page.click('#layoutFill');await frames();
 ok('[빈 칸 채우기]: 아침활동이 남은 빈 칸으로 늘어남',at(await current(),'morning')==='4,1,9,4,true'&&(await page.locator('main>.layout-empty').count())===0);
 await page.click('#layoutDone');await frames();await page.waitForTimeout(300);
 ok('[완료]: 저장하고 편집 모드 종료',!(await page.isVisible('#layoutToolbar'))&&at(await saved(),'morning')==='4,1,9,4,true'&&at(await saved(),'meal').endsWith('false'));
 ok('칸 크기가 바뀌면 글씨 맞춤이 다시 실행됨',(await page.$eval('#morning',e=>parseFloat(e.style.fontSize)))>morningFont,`${morningFont}→${await page.$eval('#morning',e=>e.style.fontSize)}`);
 await page.screenshot({path:path.join(OUT,'layout-meal-hidden-wide.png')});

 // ---------- Restart keeps it; 화면 설정 shares the same visibility ----------
 await app.close();await launch();
 ok('앱 재시작 후 배치 유지',at(await current(),'morning')==='4,1,9,4,true'&&at(await current(),'notices')==='4,5,9,2,true'&&!(await page.isVisible('main>.meal')));
 await page.click('#screenSettings');
 ok('화면 설정의 급식 표시 체크도 꺼져 있음',!(await page.isChecked('[data-board-visible=meal]')));
 await page.click('[data-board-visible=meal]');await frames(); // refused: Playwright's check() would insist on the new state
 ok('빈 자리가 없으면 다시 표시하지 않고 안내',!(await page.isChecked('[data-board-visible=meal]'))&&(await page.textContent('#boardVisibilityStatus')).includes('빈 자리가 없어')&&!(await page.isVisible('main>.meal')));
 await page.uncheck('[data-board-visible=notices]');await frames();
 ok('화면 설정에서 숨겨도 같은 배치 정보에 저장',at(await saved(),'notices').endsWith('false')&&!(await page.isVisible('main>.notices')));
 await page.check('[data-board-visible=notices]');await frames();
 ok('화면 설정에서 다시 표시',at(await saved(),'notices')==='4,5,9,2,true');
 await page.keyboard.press('Escape');

 // ---------- Reset, cancel ----------
 await page.click('#layoutToggle');await page.click('#layoutReset');await frames();
 ok('[기본 배치로]: 기본 배치, 숨긴 칸도 다시 표시',L.equal(await current(),L.defaults())&&await page.isVisible('main>.meal'));
 await page.click('#layoutCancel');await frames();
 ok('[취소]: 편집 전 상태로',at(await current(),'morning')==='4,1,9,4,true'&&!(await page.isVisible('main>.meal'))&&at(await saved(),'meal').endsWith('false'));
 await page.click('#layoutToggle');await page.click('#layoutReset');await page.click('#layoutDone');await frames();
 ok('[기본 배치로] 후 [완료]: 저장',L.equal(await saved(),L.defaults()));

 // ---------- Moving and swapping (mouse) ----------
 await page.click('#layoutToggle');
 let from=await head('timetable',2),to=await cell(12,3);
 await press(from);await moveTo(from,to);
 ok('다른 칸 위로 끌면 맞바꾸기 미리보기',(await previewState())==='swap');
 await page.mouse.up();await frames();
 let l=await current();
 ok('시간표↔급식 자리 맞바꾸기(크기가 달라도)',at(l,'timetable')==='11,1,2,6,true'&&at(l,'meal')==='1,1,3,6,true',at(l,'timetable')+' / '+at(l,'meal'));
 g=await geometry();ok('맞바꾼 뒤 겹침·잘림 없음',!g.issues.length,JSON.stringify(g));
 await page.click('#layoutCancel');await frames();
 ok('[취소]로 맞바꾸기 되돌림',L.equal(await current(),L.defaults()));
 // Into empty cells, and a refused drop.
 await page.click('#layoutToggle');await page.click('main>.notices .layout-hide');
 from=await head('morning',5);to=await cell(5,3);
 await press(from);await moveTo(from,to);ok('빈 자리로 옮기기 미리보기',(await previewState())==='ok');await page.mouse.up();await frames();
 ok('아침활동을 아래 빈 자리로 옮김',at(await current(),'morning')==='4,3,7,4,true',at(await current(),'morning'));
 await page.click('#layoutReset');await page.click('main>.meal .layout-hide');await frames();
 from=await head('timetable',2);to=await cell(11,2);
 await press(from);await moveTo(from,to);
 ok('칸 두 개에 걸치는 자리는 빨간색',(await previewState())==='bad');
 await page.mouse.up();await frames();
 ok('놓을 수 없는 자리에서는 그대로',at(await current(),'timetable')==='1,1,3,6,true'&&(await message()).includes('놓을 수 없습니다'));
 // Hidden board back from the tray by dragging it onto the empty slot.
 const chip=await box('#layoutTray .layout-chip span'),slot=await cell(12,4);
 const cp={x:chip.x+chip.width/2,y:chip.y+chip.height/2};await press(cp);await moveTo(cp,slot);
 ok('숨긴 칸을 빈 칸으로 끌면 놓일 자리 미리보기',(await previewState())==='ok');
 await page.mouse.up();await frames();
 ok('보관함에서 끌어다 놓아 다시 표시',at(await current(),'meal')==='11,1,2,6,true'&&(await page.textContent('#layoutTray')).includes('없음'));
 await page.click('main>.meal .layout-hide');await page.click('#layoutTray [data-layout-show=meal]');await frames();
 ok('[다시 표시] 버튼',at(await current(),'meal')==='11,1,2,6,true');

 // ---------- Keyboard ----------
 await page.focus('main>.notices');await page.keyboard.press('Shift+ArrowLeft');
 ok('Shift+←: 크기 줄이기',at(await current(),'notices')==='4,5,6,2,true');
 await page.keyboard.press('ArrowRight');
 ok('→: 빈 자리로 한 칸 이동',at(await current(),'notices')==='5,5,6,2,true');
 await page.focus('main>.timetable');await page.keyboard.press('ArrowRight');
 ok('→: 옆 칸과 자리 맞바꾸기',at(await current(),'timetable')==='4,1,7,4,true'&&at(await current(),'morning')==='1,1,3,6,true');
 await page.keyboard.press('Shift+ArrowDown');
 ok('Shift+↓: 겹치면 크기 바꾸지 않음',at(await current(),'timetable')==='4,1,7,4,true'&&(await message()).includes('더 늘이거나'));
 await page.keyboard.press('Escape');await frames();
 ok('Esc: 편집 취소',!(await page.isVisible('#layoutToolbar'))&&L.equal(await current(),L.defaults()));

 // ---------- Touch ----------
 await page.click('#layoutToggle');
 await page.evaluate(()=>{window.__pointerTypes=[];document.querySelector('main').addEventListener('pointerdown',e=>window.__pointerTypes.push(e.pointerType),true);});
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 from=await head('meal',11);to=await cell(2,3);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from.x,y:from.y}]});
 for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/8,y:from.y+(to.y-from.y)*i/8}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await frames();
 await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});
 l=await current();
 ok('터치(pointerType touch)로 끌어 맞바꾸기',(await page.evaluate(()=>window.__pointerTypes)).includes('touch')&&at(l,'meal')==='1,1,3,6,true'&&at(l,'timetable')==='11,1,2,6,true',JSON.stringify(await page.evaluate(()=>window.__pointerTypes)));
 await page.click('#layoutDone');

 // ---------- Lock ----------
 await page.click('#screenLock');
 ok('대시보드 잠금 시 [배치 편집] 비활성',await page.isDisabled('#layoutToggle')&&(await page.evaluate(()=>{window.boardLayout.begin();return window.boardLayout.editing();}))===false);
 await page.click('#screenLock');await frames();
 await page.click('#layoutToggle');await page.click('main>.notices .layout-hide');await page.click('#screenLock');await frames();
 ok('편집 중 잠그면 지금까지 배치를 저장하고 편집 종료',!(await page.evaluate(()=>window.boardLayout.editing()))&&at(await saved(),'notices').endsWith('false'));
 await page.click('#screenLock');await frames();

 // ---------- Backup and restore ----------
 const custom=await saved();
 await page.click('#settings');await page.click('#backupCreate');await page.waitForTimeout(800);
 const file=JSON.parse(fs.readFileSync(BACKUP,'utf8'));
 ok('백업 파일에 배치 포함',L.equal(file.data.boardLayout,custom));
 await page.keyboard.press('Escape');
 await setLayout(L.defaults());
 const restore=async name=>{await app.evaluate(({},f)=>{globalThis.__openFile=f;},name);await page.click('#settings');await page.click('#backupRestore');await page.waitForSelector('#backupConfirmDialog[open]');await page.click('#backupConfirmDialog button[value=restore]');await page.waitForTimeout(2000);await page.waitForLoadState('domcontentloaded');await page.waitForTimeout(800);};
 await restore(BACKUP);
 ok('백업 복원 후 배치 유지',L.equal(await saved(),custom)&&L.equal(await current(),custom));
 const oldData={morningDefault:'예전 백업',boardPreferences:{notices:{visible:false,scale:1}}};
 const checksum=await page.evaluate(d=>BackupCore.checksum(d),oldData);
 fs.writeFileSync(OLD,JSON.stringify({format:'classroom-dashboard-backup',schemaVersion:2,appVersion:'1.8.12',createdAt:new Date().toISOString(),school:'',academicYear:'',grade:'6',classroom:'1',keys:Object.keys(oldData),checksum,data:oldData}));
 await restore(OLD);
 l=await saved();
 ok('예전 백업(배치 없음) 복원: 그 백업의 숨김 설정으로 기본 배치 생성',L.isValid(l)&&at(l,'notices').endsWith('false')&&['timetable','morning','meal'].every(id=>at(l,id)===at(L.defaults(),id)));
 await app.evaluate(({},f)=>{globalThis.__openFile=null;});

 // ---------- First run after the update, broken value ----------
 await page.evaluate(()=>{localStorage.removeItem('boardLayout');localStorage.setItem('boardPreferences',JSON.stringify({meal:{visible:false,scale:1.2},notices:{visible:true,scale:1}}));localStorage.setItem('boardSizes',JSON.stringify({columns:[.3,.5,.2],row:.5,weatherWidth:280}));});
 await reload();l=await saved();
 ok('업데이트 후 첫 실행: 숨김·크기 설정 이어받기',at(l,'timetable')==='1,1,4,6,true'&&at(l,'morning')==='5,1,6,3,true'&&at(l,'notices')==='5,4,6,3,true'&&at(l,'meal')==='11,1,2,6,false',JSON.stringify(l.items));
 ok('기존 키는 지우지 않음(날씨 크기·글씨 크기 계속 사용)',await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('boardSizes')),p=JSON.parse(localStorage.getItem('boardPreferences'));return s.weatherWidth===280&&s.columns.length===3&&p.meal.scale===1.2&&window.boardFontScales.meal===1.2;}));
 await page.evaluate(()=>localStorage.setItem('boardLayout','{"version":1,"items":'));await reload();
 ok('깨진 저장값은 기본 배치로 대체, 화면 정상',L.equal(await current(),L.defaults())&&await page.isVisible('main>.timetable')&&await page.isVisible('main>.meal'));
 const overlapping=L.defaults();overlapping.items.meal.x=9;overlapping.items.meal.w=4;await setLayout(overlapping);
 ok('겹치는 저장값도 기본 배치로 대체',L.equal(await current(),L.defaults()));

 // ---------- Window sizes ----------
 const crowded=L.defaults();Object.assign(crowded.items.timetable,{x:1,w:3});Object.assign(crowded.items.morning,{x:4,w:3,y:1,h:6});Object.assign(crowded.items.notices,{x:7,w:3,y:1,h:6});Object.assign(crowded.items.meal,{x:10,w:3,y:1,h:6});
 for(const [w,h] of [[1440,960],[1100,800],[900,650]]){
  await page.setViewportSize({width:w,height:h});
  for(const [name,layout] of [['기본',L.defaults()],['네 칸 나란히',crowded]]){
   await setLayout(layout);await page.setViewportSize({width:w,height:h});await frames();await page.waitForTimeout(200);
   g=await geometry();ok(`${w}×${h} ${name} 배치: 겹침·제목 잘림 없음`,!g.issues.length,JSON.stringify(g));
  }
 }
 await setLayout(L.defaults());
 ok('페이지 오류 없음',!errors.length,errors.join(' | '));
}catch(e){console.error(e);results.push(false);}finally{if(app)await app.close().catch(()=>{});}
 const passed=results.filter(Boolean).length;
 console.log(`\n배치 편집 E2E: ${passed}/${results.length} PASS`);
 process.exitCode=passed===results.length?0:1;
})();
