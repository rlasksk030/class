// Electron E2E: run with `npm run test:e2e` (Linux CI: wrap with xvfb-run). Output goes to tests/e2e/.out (git-ignored).
const path=require('path');const ROOT=path.resolve(__dirname,'../..'),OUTDIR=path.join(__dirname,'.out');
const {_electron}=require('playwright-core');const electronPath=require('electron');
const fs=require('fs'),assert=require('assert/strict');
const APP=process.argv[2]||path.join(ROOT,'app'), PROFILE=process.argv[3]||path.join(OUTDIR,'profile-titles'), OUT=path.join(OUTDIR,'shots');
fs.mkdirSync(OUT,{recursive:true});
const results=[];const ok=(n,c,d='')=>{results.push([n,!!c,d]);console.log((c?'PASS':'FAIL')+' '+n+(d?' — '+d:''));};
async function launch(){const app=await _electron.launch({executablePath:electronPath,args:['--no-sandbox',APP],env:{...process.env,CLASSROOM_TEST_PROFILE:PROFILE}});const page=await app.firstWindow();page.on('dialog',d=>d.accept());await page.setViewportSize?.({width:1440,height:900}).catch(()=>{});await page.waitForLoadState('domcontentloaded');await page.waitForTimeout(800);return {app,page};}
const title=(page,k)=>page.$eval(`.${k} .cardhead h2`,h=>h.textContent);
const layout=page=>page.evaluate(()=>Object.fromEntries(['timetable','morning','notices','meal'].map(k=>{const c=document.querySelector('.'+k),h=c.querySelector('.cardhead'),t=h.querySelector('h2'),s=getComputedStyle(t),r=c.getBoundingClientRect(),hr=h.getBoundingClientRect(),tr=t.getBoundingClientRect();return [k,{card:[r.x,r.y,r.width,r.height].map(Math.round),head:Math.round(hr.height),title:[tr.x,tr.y].map(Math.round),font:s.fontFamily,size:s.fontSize,weight:s.fontWeight,color:s.color}];})));
const body=page=>page.evaluate(()=>({morning:document.getElementById('morning').textContent,notices:document.getElementById('notices').textContent,store:{m:localStorage.getItem('morningDefault'),n:localStorage.getItem('notes')}}));
const unlocked=page=>page.evaluate(()=>!window.dashboardLocked);
async function setLock(page,on){if((await page.evaluate(()=>!!window.dashboardLocked))!==on)await page.click('#screenLock');}
(async()=>{
 fs.rmSync(PROFILE,{recursive:true,force:true});
 let {app,page}=await launch();
 await page.evaluate(()=>{const d=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());localStorage.setItem('settings',JSON.stringify({grade:'6',classroom:'1'}));localStorage.setItem('morningDefault',JSON.stringify('책 읽기 20분\n일기 쓰기'));localStorage.setItem('notes',JSON.stringify({[d]:{notices:'체육복 챙기기'}}));localStorage.setItem('dashboardLocked','true');});
 await app.close();({app,page}=await launch());
 const base=await layout(page);fs.writeFileSync(OUTDIR+'/layout-'+(process.argv[4]||'new')+'.json',JSON.stringify(base,null,1));
 await page.screenshot({path:OUT+'/'+(process.argv[4]||'new')+'-01-default-locked.png'});
 if(process.argv[4]==='orig'){await app.close();return;}
 const before=await body(page);
 ok('1. 기본 제목 표시',(await title(page,'morning'))==='☀ 아침활동'&&(await title(page,'notices'))==='✳ 안내사항',await title(page,'morning'));
 // 10. locked: no edit
 ok('10a. 잠금 시 연필 숨김',!(await page.isVisible('.morning .board-title-edit')));
 await page.dblclick('.morning .board-title');ok('10b. 잠금 시 더블클릭 편집 불가',!(await page.$('.board-title-editor')));
 await setLock(page,false);ok('11a. 잠금 해제',await unlocked(page));
 ok('11b. 잠금 해제 시 연필 표시',await page.isVisible('.morning .board-title-edit'));
 await page.screenshot({path:OUT+'/new-02-unlocked.png'});
 // 2+4 Enter save
 await page.click('.morning .board-title-edit');
 const headBefore=(await layout(page)).morning.head;
 await page.screenshot({path:OUT+'/new-03-editing.png'});
 ok('4a. 편집 중 헤더 높이 유지',(await layout(page)).morning.head===base.morning.head,`${headBefore} vs ${base.morning.head}`);
 await page.fill('.board-title-editor input','오늘 할 일');await page.keyboard.press('Enter');
 ok('2/4. 아침활동 Enter 저장',(await title(page,'morning'))==='☀ 오늘 할 일');
 // 5 Esc cancel
 await page.dblclick('.morning .board-title');await page.fill('.board-title-editor input','취소될 제목');await page.keyboard.press('Escape');
 ok('5. Esc 취소',(await title(page,'morning'))==='☀ 오늘 할 일'&&!(await page.$('.board-title-editor')));
 // 3+6 notices, outside click save
 await page.click('.notices .board-title-edit');await page.fill('.board-title-editor input','꼭 확인하세요');await page.mouse.click(700,450);
 await page.click('#meal');
 ok('3/6. 안내사항 바깥 클릭 저장',(await title(page,'notices'))==='✳ 꼭 확인하세요',await title(page,'notices'));
 // Korean IME-like: typing real Korean with keyboard.type
 await page.dblclick('.notices .board-title');await page.keyboard.press('Control+A');await page.keyboard.type('꼭 확인하세요');await page.keyboard.press('Enter');
 // 13 long title
 await page.click('.morning .board-title-edit');const ml=await page.$eval('.board-title-editor input',i=>i.maxLength);await page.fill('.board-title-editor input','가'.repeat(45));const len=await page.$eval('.board-title-editor input',i=>i.value.length);await page.keyboard.press('Enter');
 const L=await layout(page);const tmorning=await title(page,'morning');
 const cut=await page.$eval('.morning .board-title',h=>h.scrollWidth>h.clientWidth);
 ok('13a. 최대 30자 제한',ml===30&&len===30&&tmorning==='☀ '+'가'.repeat(30),`${ml}/${len}`);
 ok('13b. 긴 제목에서도 보드 크기·위치 불변',JSON.stringify(Object.fromEntries(Object.entries(L).map(([k,v])=>[k,v.card])))===JSON.stringify(Object.fromEntries(Object.entries(base).map(([k,v])=>[k,v.card]))),'ellipsis='+cut);
 ok('13c. 제목 스타일 불변',['font','size','weight','color'].every(p=>L.morning[p]===base.morning[p]&&L.notices[p]===base.notices[p]));
 await page.screenshot({path:OUT+'/new-04-long-title.png'});
 // narrow window
 const win=await app.browserWindow(page);await win.evaluate(w=>w.setSize(900,650));await page.waitForTimeout(500);await page.screenshot({path:OUT+'/new-05-long-title-narrow.png'});
 const narrowOk=await page.evaluate(()=>['morning','notices'].every(k=>{const h=document.querySelector('.'+k+' .cardhead');return h.scrollWidth<=h.clientWidth+1&&h.getBoundingClientRect().height<90;}));
 ok('13d. 좁은 창에서도 헤더 넘침 없음',narrowOk);
 await win.evaluate(w=>w.setSize(1440,960));await page.waitForTimeout(400);
 // 9 restore default
 await page.click('.morning .board-title-edit');await page.screenshot({path:OUT+'/new-06-editing-long.png'});await page.click('.board-title-reset');
 ok('9. 기본 제목 복원',(await title(page,'morning'))==='☀ 아침활동'&&!JSON.parse(await page.evaluate(()=>localStorage.getItem('boardTitles'))).morning);
 await page.click('.morning .board-title-edit');await page.fill('.board-title-editor input','오늘 할 일');await page.keyboard.press('Enter');
 // 12 touch long press via CDP
 const cdp=await page.context().newCDPSession(page);
 const box=await (await page.$('.notices .board-title')).boundingBox();const tp={x:box.x+30,y:box.y+box.height/2};
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[tp]});await page.waitForTimeout(800);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const touchEdit=!!(await page.$('.notices .board-title-editor, .notices .cardhead .board-title-editor'));
 ok('12a. 터치 길게 누르기로 편집 시작',touchEdit);
 if(touchEdit){await page.fill('.board-title-editor input','알립니다');const rb=await (await page.$('#meal')).boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rb.x+20,y:rb.y+20}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(200);}
 ok('12b. 터치 바깥 탭 저장',(await title(page,'notices'))==='✳ 알립니다',await title(page,'notices'));
 const pb=await (await page.$('.morning .board-title-edit')).boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:pb.x+pb.width/2,y:pb.y+pb.height/2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(200);
 ok('12c. 연필 터치로 편집 시작',!!(await page.$('.morning .board-title-editor')));await page.keyboard.press('Escape');
 // lock while editing
 await page.click('.morning .board-title-edit');await page.fill('.board-title-editor input','오늘 할 일');await setLock(page,true);
 ok('10c. 편집 중 잠그면 편집 종료·연필 숨김',!(await page.$('.board-title-editor'))&&!(await page.isVisible('.morning .board-title-edit')));
 const after=await body(page);
 ok('8a. 본문 내용 유지(화면·저장소)',JSON.stringify(before)===JSON.stringify(after),after.morning+' / '+after.notices);
 await page.evaluate(()=>document.dispatchEvent(new Event('update:flush')));
 await app.close();
 // 7 restart
 ({app,page}=await launch());
 ok('7. 재실행 후 제목 유지',(await title(page,'morning'))==='☀ 오늘 할 일'&&(await title(page,'notices'))==='✳ 알립니다');
 ok('8b. 재실행 후 본문 유지',JSON.stringify(await body(page))===JSON.stringify(before));
 ok('10d. 재실행 후 잠금 유지·연필 숨김',!(await unlocked(page))&&!(await page.isVisible('.notices .board-title-edit')));
 await page.screenshot({path:OUT+'/new-07-restart-custom.png'});
 ok('health. 업데이트 헬스체크 조건',await page.evaluate(()=>Boolean(window.classroomTools&&window.desktop&&document.getElementById('activityTab'))));
 ok('store. 제목·본문 별도 키',await page.evaluate(()=>{const t=JSON.parse(localStorage.getItem('boardTitles'));return t.morning==='오늘 할 일'&&t.notices==='알립니다'&&Object.keys(t).length===2;}));
 await app.close();
 const f=results.filter(r=>!r[1]);console.log(`\n${results.length-f.length}/${results.length} passed`);process.exit(f.length?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
