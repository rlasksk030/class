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

 // ---------- Default board ----------
 ok('기본 배치(A) = 시간표 1-3열 · 아침활동/안내사항 4-9열(4:2행) · 급식 10-12열',L.equal(await current(),L.defaults())&&L.equal(await saved(),L.defaults()));
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
 ok('빈 칸은 오른쪽 끝 세 열 전체',Math.abs(emptyBox.x+emptyBox.width-(mainBox.x+mainBox.width))<=1&&Math.abs(emptyBox.height-mainBox.height)<=1);
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
 let from=await head('timetable',2),to=await cell(7,2);
 await press(from);await moveTo(from,to);
 ok('다른 칸 위로 끌면 맞바꾸기 미리보기',(await previewState())==='swap');
 await page.mouse.up();await frames();
 let l=await current();
 ok('시간표↔아침활동 자리 맞바꾸기(크기가 달라도)',at(l,'timetable')==='4,1,6,4,true'&&at(l,'morning')==='1,1,3,6,true',at(l,'timetable')+' / '+at(l,'morning'));
 g=await geometry();ok('맞바꾼 뒤 겹침·잘림 없음',!g.issues.length,JSON.stringify(g));
 await page.click('#layoutCancel');await frames();
 ok('[취소]로 맞바꾸기 되돌림',L.equal(await current(),L.defaults()));
 // Into empty cells, and a refused drop.
 await page.click('#layoutToggle');await page.click('main>.notices .layout-hide');
 from=await head('morning',5);to=await cell(5,3);
 await press(from);await moveTo(from,to);ok('빈 자리로 옮기기 미리보기',(await previewState())==='ok');await page.mouse.up();await frames();
 ok('아침활동을 아래 빈 자리로 옮김',at(await current(),'morning')==='4,3,6,4,true',at(await current(),'morning'));
 await page.click('#layoutReset');await page.click('main>.meal .layout-hide');await frames();
 from=await head('timetable',2);to=await cell(10,2);
 await press(from);await moveTo(from,to);
 ok('칸 두 개에 걸치는 자리는 빨간색',(await previewState())==='bad');
 await page.mouse.up();await frames();
 ok('놓을 수 없는 자리에서는 그대로',at(await current(),'timetable')==='1,1,3,6,true'&&(await message()).includes('놓을 수 없습니다'));
 // Hidden board back from the tray by dragging it onto the empty slot.
 const chip=await box('#layoutTray .layout-chip span'),slot=await cell(12,4);
 const cp={x:chip.x+chip.width/2,y:chip.y+chip.height/2};await press(cp);await moveTo(cp,slot);
 ok('숨긴 칸을 빈 칸으로 끌면 놓일 자리 미리보기',(await previewState())==='ok');
 await page.mouse.up();await frames();
 ok('보관함에서 끌어다 놓아 다시 표시',at(await current(),'meal')==='10,1,3,6,true'&&(await page.textContent('#layoutTray')).includes('없음'));
 await page.click('main>.meal .layout-hide');await page.click('#layoutTray [data-layout-show=meal]');await frames();
 ok('[+ 칸 이름] 다시 표시 버튼',at(await current(),'meal')==='10,1,3,6,true');

 // ---------- Keyboard ----------
 await page.focus('main>.notices');await page.keyboard.press('Shift+ArrowLeft');
 ok('Shift+←: 크기 줄이기',at(await current(),'notices')==='4,5,5,2,true');
 await page.keyboard.press('ArrowRight');
 ok('→: 빈 자리로 한 칸 이동',at(await current(),'notices')==='5,5,5,2,true');
 await page.focus('main>.timetable');await page.keyboard.press('ArrowRight');
 ok('→: 옆 칸과 자리 맞바꾸기',at(await current(),'timetable')==='4,1,6,4,true'&&at(await current(),'morning')==='1,1,3,6,true');
 await page.keyboard.press('Shift+ArrowDown');
 ok('Shift+↓: 겹치면 크기 바꾸지 않음',at(await current(),'timetable')==='4,1,6,4,true'&&(await message()).includes('더 늘이거나'));
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
 ok('터치(pointerType touch)로 끌어 맞바꾸기',(await page.evaluate(()=>window.__pointerTypes)).includes('touch')&&at(l,'meal')==='1,1,3,6,true'&&at(l,'timetable')==='10,1,3,6,true',JSON.stringify(await page.evaluate(()=>window.__pointerTypes)));
 await page.click('#layoutDone');

 // ---------- Lock ----------
 await page.click('#screenLock');
 ok('대시보드 잠금 시 [배치 편집] 비활성',await page.isDisabled('#layoutToggle')&&(await page.evaluate(()=>{window.boardLayout.begin();return window.boardLayout.editing();}))===false);
 await page.click('#screenLock');await frames();
 await page.click('#layoutToggle');ok('편집 중에는 아래 막대 자리에 편집 막대만',await page.isVisible('#layoutToolbar')&&!(await page.isVisible('#screenLock'))&&!(await page.isVisible('.screen-tabs')));
 await page.click('main>.notices .layout-hide');await page.evaluate(()=>document.getElementById('screenLock').click());await frames();
 ok('편집 중 잠그면 지금까지 배치를 저장하고 편집 종료',!(await page.evaluate(()=>window.boardLayout.editing()))&&at(await saved(),'notices').endsWith('false'));
 await page.click('#screenLock');await frames();

 // ---------- Backup and restore ----------
 const custom=await saved();
 await page.click('#settings');await page.click('#settingsNavBackup');await page.click('#backupCreate');await page.waitForTimeout(800);
 const file=JSON.parse(fs.readFileSync(BACKUP,'utf8'));
 ok('백업 파일에 배치 포함',L.equal(file.data.boardLayout,custom));
 await page.keyboard.press('Escape');
 await setLayout(L.defaults());
 const restore=async name=>{await app.evaluate(({},f)=>{globalThis.__openFile=f;},name);await page.click('#settings');await page.click('#settingsNavBackup');await page.click('#backupRestore');await page.waitForSelector('#backupConfirmDialog[open]');await page.click('#backupConfirmDialog button[value=restore]');await page.waitForTimeout(2000);await page.waitForLoadState('domcontentloaded');await page.waitForTimeout(800);};
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
 // ---------- Edit tools never cover the header, board text or each other ----------
 // Saved timetable/meal entries give those boards their bottom status line ("연결 실패 · 저장된 정보 · …").
 await page.evaluate(()=>{const day=Core.dateKey(),time=Date.now(),cache=JSON.parse(localStorage.getItem('cache')||'{}');
  cache[Core.dataKey(settings,day,'timetable')]={time,data:['국어','수학','사회','과학','체육'].map((subject,i)=>({period:String(i+1),subject}))};
  cache[Core.dataKey(settings,day,'meal')]={time,data:['흑미밥','미역국','닭갈비','배추김치','사과']};
  localStorage.setItem('cache',JSON.stringify(cache));});
 // Rectangles of what is actually painted. For the centre probe the grid cells are made hit-testable
 // through each element's style (the page's CSP blocks an added <style> element).
 const inspect=()=>page.evaluate(()=>{
  const R=el=>{if(!el||getComputedStyle(el).visibility==='hidden')return null;const b=el.getBoundingClientRect();return b.width>0&&b.height>0?b:null;};
  const hit=(a,b)=>!!(a&&b&&a.left<b.right-.5&&b.left<a.right-.5&&a.top<b.bottom-.5&&b.top<a.bottom-.5);
  const all=s=>[...document.querySelectorAll(s)],cover=[],centre=[],small=[];
  const bar=R(document.querySelector('#layoutToolbar'));if(!bar)cover.push('도구 막대 없음');
  for(const s of ['#classTitle','#date','#clock','#weather','header nav','.screen-tabs'])for(const el of all(s))if(hit(bar,R(el)))cover.push('도구 막대×'+s);
  for(const h of all('.weather .board-resize-handle')){
   const b=R(h),mark=R(h.querySelector('.handle-mark'));if(!b||!mark){cover.push('날씨 손잡이 안 보임');continue;}
   for(const el of all('#clock,header nav button'))if(hit(b,R(el)))cover.push('날씨 손잡이×'+(el.id||el.textContent.trim()));
   for(const el of all('#weather>*'))if(hit(mark,R(el)))cover.push('날씨 손잡이 표시×날씨 글자');
  }
  const cells=all('main>.layout-cell');cells.forEach(c=>c.style.setProperty('pointer-events','auto','important'));
  for(const c of all('main>.card')){
   if(getComputedStyle(c).display==='none')continue;const id=c.classList[1],hide=R(c.querySelector('.layout-hide'));
   if(!hide){cover.push('숨기기 없음:'+id);continue;}
   for(const el of c.querySelectorAll('.cardhead h2,.status,#'+id))if(el.textContent.trim()&&hit(hide,R(el)))cover.push('숨기기×'+id+(el.matches('h2')?' 제목':el.matches('.status')?' 상태 글자':' 내용'));
   const body=R(c.querySelector('#'+id)),el=body&&document.elementFromPoint(body.left+body.width/2,body.top+body.height/2);
   if(!el||!c.contains(el))centre.push(id+'→'+(el?.className||el?.tagName));
  }
  cells.forEach(c=>c.style.removeProperty('pointer-events'));
  for(const el of all('#layoutToolbar button,main>.card .layout-resize,.weather .board-resize-handle')){const b=R(el);if(b&&(b.width<44||b.height<44))small.push((el.id||el.getAttribute('aria-label')||el.className)+' '+Math.round(b.width)+'×'+Math.round(b.height));}
  for(const el of all('#layoutToolbar button'))if(R(el)&&parseFloat(getComputedStyle(el).fontSize)<16)small.push((el.id||el.textContent)+' 글씨 '+getComputedStyle(el).fontSize);
  const msg=document.querySelector('#layoutMessage'),lines=Math.round(msg.getBoundingClientRect().height/parseFloat(getComputedStyle(msg).lineHeight));
  const grip=getComputedStyle(document.querySelector('main>.card .cardhead'),'::before').content;
  return {cover,centre,small,lines,message:msg.textContent,grip};
 });
 await reload();
 for(const [w,h] of [[1100,760],[1440,900],[1920,1080]]){
  await page.setViewportSize({width:w,height:h});await frames();
  await page.click('#layoutToggle');await frames();await page.waitForTimeout(200);
  let r=await inspect();
  ok(`${w}×${h} 편집 모드: 도구 막대·날씨 손잡이·[숨기기]가 머리글·카드 글자를 가리지 않음`,!r.cover.length,JSON.stringify(r.cover));
  ok(`${w}×${h} 편집 모드: 격자선은 카드 뒤(내용 한가운데에서 카드가 잡힘)`,!r.centre.length,JSON.stringify(r.centre));
  ok(`${w}×${h} 크기 손잡이·도구 막대 버튼: 잡는 영역 44×44 이상, 버튼 글씨 16px 이상`,!r.small.length,JSON.stringify(r.small));
  ok(`${w}×${h} 기본 안내 한 줄 · 끌기 손잡이(점 6개) 표시`,r.lines===1&&r.message==='점 6개를 끌어 옮기고, 오른쪽 아래 모서리를 끌어 크기를 바꿉니다.'&&r.grip!=='none',JSON.stringify([r.lines,r.message,r.grip]));
  if(w===1440){
   await page.click('#layoutHelp');
   ok('[?]: 키보드·맞바꾸기 안내를 펼침',await page.isVisible('#layoutKeys')&&(await page.textContent('#layoutKeys')).includes('Shift+방향키')&&await page.getAttribute('#layoutHelp','aria-expanded')==='true');
   await page.click('#layoutHelp');
   await page.click('main>.meal .layout-hide');await frames();
   r=await inspect();
   ok('급식을 숨긴 편집 모드: 겹침 없음, [다시 표시]도 44×44 이상',!r.cover.length&&!r.small.length&&await page.isVisible('#layoutTray [data-layout-show=meal]'),JSON.stringify([r.cover,r.small]));
  }
  await page.click('#layoutCancel');await frames();
 }
 // The narrowest boards: four side by side at the smallest size.
 await setLayout(crowded);await page.setViewportSize({width:1100,height:760});await frames();
 await page.click('#layoutToggle');await frames();await page.waitForTimeout(200);
 const narrow=await inspect();
 ok('1100×760 네 칸 나란히(가장 좁은 칸) 편집 모드: [숨기기]가 제목·상태 글자를 가리지 않음',!narrow.cover.length,JSON.stringify(narrow.cover));
 ok('평소 화면에는 옮기기 표시 없음',await page.click('#layoutCancel').then(()=>page.evaluate(()=>getComputedStyle(document.querySelector('main>.card .cardhead'),'::before').content))==='none');
 await setLayout(L.defaults());

 // ---------- Screen structure A / B (화면 설정): each keeps its own arrangement, also after a restart ----------
 await page.setViewportSize({width:1440,height:900});await frames();
 const aBefore=await saved();
 await page.click('#screenSettings');await page.check('#screenDialog input[name=layoutStructure][value=B]');await frames();
 ok('화면 구조 B: 왼쪽 정보 기둥 + B 기본 배치',await page.evaluate(()=>document.body.classList.contains('structure-b'))&&L.equal(await current(),L.defaults('B'))&&(await page.evaluate(()=>localStorage.getItem('layoutStructure')))==='"B"');
 g=await geometry();ok('B 기본 배치: 겹침·잘림 없음',!g.issues.length,JSON.stringify(g));
 const column=await box('body>header'),firstBoard=await box('main');ok('B: 정보 기둥은 칸 영역 왼쪽',column.x+column.width<=firstBoard.x+1&&column.height>firstBoard.height*.9);
 ok('B: 기둥에 시계 · 날짜, 위쪽 머리글 없음',await page.isVisible('header #clock')&&await page.isVisible('header #date')&&Math.abs((await box('body>header')).y-(await box('main')).y)<=2);
 await page.keyboard.press('Escape');
 await page.click('#layoutToggle');await page.click('main>.meal .layout-hide');await page.click('#layoutDone');await frames();
 ok('B에서 바꾼 배치는 B에만 저장',at(await page.evaluate(()=>JSON.parse(localStorage.getItem('boardLayoutB'))),'meal').endsWith('false')&&L.equal(await saved(),aBefore));
 await page.click('#screenSettings');await page.check('#screenDialog input[name=layoutStructure][value=A]');await frames();await page.keyboard.press('Escape');
 ok('A로 돌아오면 A 배치 그대로(급식 보임)',!(await page.evaluate(()=>document.body.classList.contains('structure-b')))&&L.equal(await current(),aBefore)&&await page.isVisible('main>.meal'));
 await page.click('#screenSettings');await page.check('#screenDialog input[name=layoutStructure][value=B]');await page.keyboard.press('Escape');
 await app.close();await launch();
 ok('앱을 다시 켜도 구조 B와 B 배치 유지',await page.evaluate(()=>document.body.classList.contains('structure-b'))&&!(await page.isVisible('main>.meal'))&&L.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('boardLayout'))),aBefore));
 for(const [w,h] of [[1100,760],[1920,1080]]){await page.setViewportSize({width:w,height:h});await frames();await page.waitForTimeout(200);g=await geometry();ok(`B ${w}×${h}: 겹침·잘림 없음`,!g.issues.length,JSON.stringify(g));}
 await page.setViewportSize({width:1440,height:900});
 await page.click('#settings');await page.click('#settingsNavRun');
 const pipItems=await page.$$eval('[data-pip-option]',els=>els.map(e=>e.closest('label').textContent.trim()));
 // 보완 지시서 2장: the PIP keeps all six items, including the next period.
 ok('설정의 PIP 항목 6개 그대로(다음 교시 · 다음 과목 포함, 2열 × 3줄)',JSON.stringify(pipItems)===JSON.stringify(['현재 교시','현재 과목','다음 교시','다음 과목','현재 시각','타이머']),JSON.stringify(pipItems));
 // Backup → restore keeps structure B and its own arrangement.
 await page.click('#settingsNavBackup');await page.click('#backupCreate');await page.waitForTimeout(800);
 const withB=JSON.parse(fs.readFileSync(BACKUP,'utf8'));ok('백업 파일에 구조 · B 배치 포함',withB.data.layoutStructure==='B'&&at(withB.data.boardLayoutB,'meal').endsWith('false'));
 await page.keyboard.press('Escape');
 await page.evaluate(d=>{localStorage.setItem('layoutStructure','"A"');localStorage.setItem('boardLayoutB',JSON.stringify(d));},L.defaults('B'));await reload();
 await restore(BACKUP);
 ok('백업 복원 후 구조 B와 B 배치 복원',await page.evaluate(()=>document.body.classList.contains('structure-b'))&&at(await page.evaluate(()=>JSON.parse(localStorage.getItem('boardLayoutB'))),'meal').endsWith('false'));
 await app.evaluate(({},f)=>{globalThis.__openFile=null;});
 await page.click('#screenSettings');await page.check('#screenDialog input[name=layoutStructure][value=A]');await page.keyboard.press('Escape');

 // ---------- Fonts (보완 지시서 3-1) and the notices size (5-1) ----------
 await setLayout(L.defaults());await page.setViewportSize({width:1440,height:900});await frames();
 await page.evaluate(()=>{const d=Core.dateKey(),n=JSON.parse(localStorage.getItem('notes')||'{}');n[d]={...n[d],notices:'체육복 챙기기\n우유 급식 신청서 금요일까지 제출\n5교시 강당 이동'};localStorage.setItem('notes',JSON.stringify(n));});
 await reload();await page.waitForTimeout(300);
 const noticeSize=await page.$eval('#notices',e=>parseFloat(getComputedStyle(e).fontSize));
 ok('안내사항 3줄 · 1440×900 기본 배치: 글씨 18px 이상',noticeSize>=18,noticeSize+'px');
 const fontsUsed=await page.evaluate(()=>{const first=e=>getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g,'').trim();
  return {clock:first(document.getElementById('clock')),title:first(document.querySelector('main>.timetable h2')),tab:first(document.querySelector('.screen-tabs button')),button:first(document.querySelector('[data-edit=morning],[data-empty-edit=morning]')),tool:first(document.querySelector('#settings .uc-tool__label')),
   loaded:['Gowun Batang','Nanum Barun Gothic'].every(f=>document.fonts.check('16px "'+f+'"')&&document.fonts.check('bold 16px "'+f+'"'))};});
 ok('주요 요소 글꼴은 고운바탕 · 나눔바른고딕이고 실제로 로드됨',fontsUsed.loaded&&fontsUsed.clock==='Gowun Batang'&&fontsUsed.title==='Gowun Batang'&&fontsUsed.tab==='Gowun Batang'&&fontsUsed.button==='Nanum Barun Gothic'&&fontsUsed.tool==='Nanum Barun Gothic',JSON.stringify(fontsUsed));
 await page.click('#timerButton');const timerFont=await page.$eval('#timerDisplay',e=>getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g,'').trim());await page.keyboard.press('Escape');
 ok('타이머 숫자도 고운바탕',timerFont==='Gowun Batang',timerFont);
 const pipReady=app.waitForEvent('window');await page.evaluate(()=>desktop.openPip('timer'));const pip=await pipReady;await pip.waitForLoadState('domcontentloaded');await pip.waitForSelector('#pipTimerDisplay');await pip.evaluate(()=>document.fonts.ready);
 const pipFont=await pip.evaluate(()=>({display:getComputedStyle(document.getElementById('pipTimerDisplay')).fontFamily.split(',')[0].replace(/["']/g,'').trim(),button:getComputedStyle(document.querySelector('.pip-timer-controls button')).fontFamily.split(',')[0].replace(/["']/g,'').trim(),loaded:document.fonts.check('bold 16px "Gowun Batang"')&&document.fonts.check('16px "Nanum Barun Gothic"')}));
 ok('PIP 타이머 숫자 고운바탕 · 버튼 나눔바른고딕(시스템 글꼴 아님)',pipFont.display==='Gowun Batang'&&pipFont.button==='Nanum Barun Gothic'&&pipFont.loaded,JSON.stringify(pipFont));
 await pip.close();
 ok('페이지 오류 없음',!errors.length,errors.join(' | '));
}catch(e){console.error(e);results.push(false);}finally{if(app)await app.close().catch(()=>{});}
 const passed=results.filter(Boolean).length;
 console.log(`\n배치 편집 E2E: ${passed}/${results.length} PASS`);
 process.exitCode=passed===results.length?0:1;
})();
