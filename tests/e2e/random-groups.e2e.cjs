// 랜덤 뽑기 모둠 결과가 뽑기 자리를 꽉 채우고, 이름이 잘리지 않으면서 크게 보이는지 확인합니다. 격리 프로필, 네트워크 없음.
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const {_electron}=require('playwright-core');
const ROOT=path.resolve(__dirname,'../..'),OUT=require('../output.cjs');
const PROFILE=fs.mkdtempSync(path.join(OUT,'profile-random-groups-'));
const NAMES=['전현수','문하율','김희성','김장한','이다인','황은찬','최일강','송은채','박민지','강민혁','고정현','김다솜','서가윤'];
let app,count=0;const pass=(n,d='')=>{count++;console.log('PASS '+n+(d?' — '+d:''));};
async function measure(page){
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
 return page.evaluate(()=>{
  const stage=document.querySelector('.random-stage'),grid=document.querySelector('.group-grid'),cards=[...grid.children];
  const s=stage.getBoundingClientRect(),g=grid.getBoundingClientRect(),cs=getComputedStyle(stage);
  const inner={left:s.left+parseFloat(cs.paddingLeft),right:s.right-parseFloat(cs.paddingRight),bottom:s.bottom-parseFloat(cs.paddingBottom)};
  const bodies=cards.map(c=>c.querySelector('p'));
  return {cards:cards.length,cols:getComputedStyle(grid).gridTemplateColumns.split(' ').length,font:parseFloat(getComputedStyle(bodies[0]).fontSize),
   widthShare:g.width/(inner.right-inner.left),bottomGap:inner.bottom-g.bottom,
   wrapped:bodies.some(p=>{const r=document.createRange();r.selectNodeContents(p);const rows=new Set([...r.getClientRects()].map(x=>Math.round(x.top)));return rows.size>p.textContent.split('\n').length;}),
   maxLines:Math.max(...bodies.map(p=>p.textContent.split('\n').length)),
   overflow:bodies.some(p=>p.scrollHeight>p.clientHeight+1||p.scrollWidth>p.clientWidth+1),
   outside:cards.some(c=>{const r=c.getBoundingClientRect();return r.right>s.right+1||r.bottom>s.bottom+1||r.left<s.left-1;}),
   stageScroll:stage.scrollHeight-stage.clientHeight,
   names:bodies.flatMap(p=>p.textContent.split('\n')).sort().join(',')};
 });
}
(async()=>{try{
 app=await _electron.launch({executablePath:require('electron'),args:['--no-sandbox',path.join(ROOT,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:PROFILE}});
 const page=await app.firstWindow();page.on('dialog',d=>d.accept());
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('fetch');ipcMain.handle('fetch',async()=>{throw Error('offline test');});});
 await page.evaluate(v=>{localStorage.setItem('settings',JSON.stringify({grade:'6',classroom:'1'}));localStorage.setItem('dashboardLocked','false');localStorage.setItem('lastSeenVersion',JSON.stringify(v));},require(path.join(ROOT,'app/package.json')).version);
 await page.reload();await page.evaluate(()=>document.fonts.ready);
 await page.setViewportSize({width:1440,height:900});
 await page.click('#randomTab');
 await page.evaluate(()=>{document.getElementById('rosterEditor').open=true;});
 await page.fill('#rosterText',NAMES.join('\n'));await page.click('#saveRoster');
 await page.evaluate(()=>{document.getElementById('rosterEditor').open=false;});
 const before=[];
 for(const [w,h] of [[1440,900],[1100,760],[1920,1080]]){
  await page.setViewportSize({width:w,height:h});
  for(const mode of ['count','2','4']){
   await page.click(`[data-group-mode="${mode}"]`);
   if(mode==='count')await page.fill('#groupCount','5');
   await page.click('#makeGroups');
   const m=await measure(page);
   await page.screenshot({path:path.join(OUT,`random-groups-${w}-${mode}.png`)});
   const label=`${w}×${h} ${mode==='count'?'모둠 수 5':mode+'명씩'}`;
   assert.equal(m.names,[...NAMES].sort().join(','),label+': 모든 학생이 한 번씩');
   assert.ok(!m.overflow,label+': 이름이 칸 밖으로 넘치지 않음');
   assert.ok(!m.wrapped,label+': 이름이 두 줄로 끊기지 않음');
   assert.ok(!m.outside&&m.stageScroll<=1,label+': 모둠 칸이 뽑기 자리 안에, 스크롤 없음');
   assert.ok(m.widthShare>0.98,label+': 가로를 채움 '+m.widthShare.toFixed(2));
   assert.ok(m.bottomGap<=2,label+': 아래까지 채움(남은 틈 '+m.bottomGap.toFixed(1)+'px)');
   // 큰 창에서는 확실히 크게. 1100×760처럼 낮은 창에서는 아래 조작 줄이 세 줄로 늘어 자리가 작으므로, 스크롤 없이 들어가는 크기면 됩니다.
   assert.ok(m.font>=(w>=1440?40:22),label+': 이름 글씨 크기('+m.font+'px)');
   // 가장 큰 크기인지: 글씨를 2px만 키워도 넘쳐야 합니다.
   assert.ok(await page.evaluate(f=>{const g=document.querySelector('.group-grid');g.style.setProperty('--group-font',(f+2)+'px');const over=[...g.querySelectorAll('p')].some(p=>p.scrollHeight>p.clientHeight+1||p.scrollWidth>p.clientWidth+1);g.style.setProperty('--group-font',f+'px');return over;},m.font),label+': 더 키우면 넘침(가장 큰 크기)');
   pass(label,`${m.cards}모둠 ${m.cols}열, 이름 ${m.font}px, 가로 ${(m.widthShare*100).toFixed(0)}%, 아래 틈 ${m.bottomGap.toFixed(0)}px`);
   before.push(m.font);
  }
 }
 // 한 명 뽑기로 돌아가면 모둠 화면 규칙이 풀리고 이름이 다시 가운데 크게 나옵니다.
 await page.click('.random-draw-one');await page.waitForTimeout(1800);
 const back=await page.evaluate(()=>({groups:!!document.querySelector('.group-grid'),cls:document.querySelector('.random-stage').classList.contains('has-groups'),name:document.getElementById('pickResult').textContent}));
 assert.ok(!back.groups&&!back.cls&&back.name,'한 명 뽑기 후 모둠 규칙 해제');pass('한 명 뽑기로 돌아가면 원래 화면');
 console.log(`${count}/${count} passed · screenshots: ${OUT}`);
}finally{if(app)await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
