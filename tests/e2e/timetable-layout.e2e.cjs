// Measure the real Electron layout with an isolated profile; never use the teacher's data.
const path=require('node:path'),fs=require('node:fs');
const assert=require('node:assert/strict');
const {_electron}=require('playwright-core');
const ROOT=path.resolve(__dirname,'../..'),OUT=path.join(__dirname,'.out');
fs.mkdirSync(OUT,{recursive:true});
const PROFILE=fs.mkdtempSync(path.join(OUT,'profile-timetable-'));
let app,count=0;
const subjects=['영어시험, 청소','언어문화 개선','동아리활동','동아리활동','사회','사회'];
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
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('fetch');ipcMain.handle('fetch',async()=>{throw Error('offline test');});});
 await page.evaluate(()=>{localStorage.setItem('settings',JSON.stringify({grade:'6',classroom:'1'}));localStorage.setItem('dashboardLocked','false');});
 await page.reload();await page.evaluate(()=>document.fonts.ready);
 await page.click('[data-edit=timetable]');await page.fill('#editText',subjects.map((s,i)=>`${i+1} | ${s}`).join('\n'));await page.click('#editForm .primary');
 await geometry(page,'default card');
 await page.click('#resizeToggle');await page.focus('[data-resize=left-column]');for(let i=0;i<7;i++)await page.keyboard.press('Shift+ArrowRight');await page.click('#resizeToggle');
 await geometry(page,'wider card',{singleLine:true});
 await page.screenshot({path:path.join(OUT,'timetable-wide.png')});
 await page.click('#screenSettings');for(let i=0;i<4;i++)await page.click('[aria-label="시간표 글자 크게"]');await page.click('#screenDialog .close-extra');
 const bigger=await geometry(page,'larger font');
 await page.click('#screenSettings');for(let i=0;i<8;i++)await page.click('[aria-label="시간표 글자 작게"]');await page.click('#screenDialog .close-extra');
 const smaller=await geometry(page,'smaller font',{singleLine:true});assert.ok(smaller.font<bigger.font);
 await page.evaluate(()=>{const row=document.querySelector('#timetable .lesson:nth-child(5)');row.classList.add('lesson-current');row.setAttribute('aria-current','true');});
 await geometry(page,'current period highlight');
 await page.click('#resizeToggle');await page.focus('[data-resize=left-column]');for(let i=0;i<20;i++)await page.keyboard.press('Shift+ArrowLeft');await page.click('#resizeToggle');
 await geometry(page,'narrow card');
 await page.click('[data-edit=timetable]');await page.fill('#editText',subjects.map((s,i)=>`${i+1} | ${i===0?'공간이 부족한 경우에만 자연스럽게 줄바꿈하는 아주 긴 수업 이름 ABCDEFGHIJKLMNOPQRSTUVWXYZ':s}`).join('\n'));await page.click('#editForm .primary');
 await geometry(page,'long subject wraps');await page.screenshot({path:path.join(OUT,'timetable-narrow.png')});
 await page.click('[data-edit=timetable]');await page.fill('#editText','');await page.click('#editForm .primary');
 assert.ok(await page.isVisible('#timetable .empty'));count++;console.log('PASS empty timetable');
 console.log(`${count}/${count} passed`);
}finally{if(app)await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
