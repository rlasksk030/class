// Measure the real Electron layout with an isolated profile; never use the teacher's data.
const path=require('node:path'),fs=require('node:fs');
const assert=require('node:assert/strict');
const {_electron}=require('playwright-core');
const ROOT=path.resolve(__dirname,'../..'),OUT=require('../output.cjs');
fs.mkdirSync(OUT,{recursive:true});
const PROFILE=fs.mkdtempSync(path.join(OUT,'profile-timetable-'));
let app,count=0;
// Board sizes are changed the way a teacher does it: [배치 편집] with the keyboard, then [완료].
async function arrange(page,steps){await page.click('#layoutToggle');for(const [sel,key,n] of steps){await page.focus(sel);for(let i=0;i<n;i++)await page.keyboard.press(key);}await page.click('#layoutDone');}
const subjects=['영어시험, 청소','언어문화 개선','동아리활동','동아리활동','사회','사회'];
// Timetable editing (B01): one subject field per period.
async function fillTimetable(page,list){await page.click('[data-edit=timetable]');const fields=page.locator('#timetableRows input');const n=await fields.count();assert.ok(n>=list.length);for(let i=0;i<n;i++)await fields.nth(i).fill(list[i]||'');await page.click('#editForm .primary');}
async function geometry(page,label,{singleLine=false}={}){
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const g=await page.evaluate(()=>{
  const table=document.getElementById('timetable'),card=table.closest('.card'),cs=getComputedStyle(card),cr=card.getBoundingClientRect(),tr=table.getBoundingClientRect();
  const rows=[...table.querySelectorAll('.lesson')].map(row=>{
   const b=row.querySelector('b').getBoundingClientRect(),span=row.querySelector('span'),r=span.getBoundingClientRect(),s=getComputedStyle(span);
   return {number:b.left,left:r.left,right:r.right,height:r.height,line:parseFloat(s.lineHeight),align:s.textAlign};
  });
  const left=cr.left+parseFloat(cs.borderLeftWidth)+parseFloat(cs.paddingLeft),right=cr.right-parseFloat(cs.borderRightWidth)-parseFloat(cs.paddingRight);
  return {rows,center:(tr.left+tr.right)/2,cardCenter:(left+right)/2,left,right,overflow:table.scrollWidth-table.clientWidth,verticalOverflow:table.scrollHeight-table.clientHeight,font:parseFloat(getComputedStyle(table).fontSize)};
 });
 assert.equal(g.rows.length,6);
 assert.ok(Math.max(...g.rows.map(x=>x.left))-Math.min(...g.rows.map(x=>x.left))<=1,label+' subject starts');
 assert.ok(Math.max(...g.rows.map(x=>x.number))-Math.min(...g.rows.map(x=>x.number))<=1,label+' period starts');
 assert.ok(Math.abs(g.center-g.cardCenter)<=1,label+' group center');
 assert.ok(g.rows.every(x=>x.align==='left'&&x.left>=g.left-1&&x.right<=g.right+1),label+' containment/alignment');
 assert.ok(g.overflow<=1,label+' horizontal overflow');
 assert.ok(g.verticalOverflow<=1,label+' vertical overflow');
 if(singleLine)assert.ok(g.rows.every(x=>x.height<=x.line+1),label+' enough width: no wrapping');
 count++;console.log('PASS '+label+' '+JSON.stringify(g));return g;
}
(async()=>{try{
 app=await _electron.launch({executablePath:require('electron'),args:['--no-sandbox',path.join(ROOT,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:PROFILE}});
 const page=await app.firstWindow();
 // The host can clamp a visible native window to a very short work area. Pin
 // this renderer layout test so auto-fit's minimum size does not mask font controls.
 await page.setViewportSize({width:1280,height:900});
 assert.deepEqual(await page.evaluate(()=>[innerWidth,innerHeight]),[1280,900]);
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('fetch');ipcMain.handle('fetch',async()=>{throw Error('offline test');});});
 await page.evaluate(()=>{localStorage.setItem('settings',JSON.stringify({grade:'6',classroom:'1'}));localStorage.setItem('dashboardLocked','false');});
 await page.reload();await page.evaluate(()=>document.fonts.ready);
 await fillTimetable(page,subjects);
 await geometry(page,'default card');
 // Make room on the right (middle boards 2 columns narrower and 2 to the right), then widen the timetable.
 await arrange(page,[['main>.morning','Shift+ArrowLeft',2],['main>.morning','ArrowRight',2],['main>.notices','Shift+ArrowLeft',2],['main>.notices','ArrowRight',2],['main>.timetable','Shift+ArrowRight',2]]);
 assert.equal(await page.evaluate(()=>window.boardLayout.get().items.timetable.w),5);
 await geometry(page,'wider card',{singleLine:true});
 await page.screenshot({path:path.join(OUT,'timetable-wide.png')});
 await page.click('#screenSettings');for(let i=0;i<4;i++)await page.click('[aria-label="시간표 글자 크게"]');await page.click('#screenDialog .close-extra');
 const bigger=await geometry(page,'larger font');
 await page.click('#screenSettings');for(let i=0;i<8;i++)await page.click('[aria-label="시간표 글자 작게"]');await page.click('#screenDialog .close-extra');
 const smaller=await geometry(page,'smaller font',{singleLine:true});assert.ok(smaller.font<bigger.font);
 await page.evaluate(()=>{const row=document.querySelector('#timetable .lesson:nth-child(5)');row.classList.add('lesson-current');row.setAttribute('aria-current','true');});
 await geometry(page,'current period highlight');
 await arrange(page,[['main>.timetable','Shift+ArrowLeft',4]]); // stops at the 2-column minimum
 assert.equal(await page.evaluate(()=>window.boardLayout.get().items.timetable.w),2);
 await geometry(page,'narrow card');
 await fillTimetable(page,subjects.map((s,i)=>i===0?'공간이 부족한 경우에만 자연스럽게 줄바꿈하는 아주 긴 수업 이름 ABCDEFGHIJKLMNOPQRSTUVWXYZ':s));
 await geometry(page,'long subject wraps');await page.screenshot({path:path.join(OUT,'timetable-narrow.png')});
 await fillTimetable(page,[]);
 assert.ok(await page.isVisible('#timetable .empty'));count++;console.log('PASS empty timetable');
 console.log(`${count}/${count} passed`);
}finally{if(app)await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
