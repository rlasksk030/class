// Line icons (ui/icons.css: CSS mask-image over currentColor) are really drawn in the Electron app.
// A mask image that cannot load (for example blocked by CORS on file://) leaves an empty box, so each icon is
// screenshotted and must contain drawn pixels: app bar tools, dialog [×], the D-Day dialog, and the layout-edit
// tools (hide, size handle, title edit, help, [+] of a hidden board). No console message may report a blocked load.
const path=require('node:path'),fs=require('node:fs'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {_electron}=require('playwright-core');
const ROOT=path.resolve(__dirname,'../..'),OUT=require('../output.cjs');
let app,page,count=0;const blocked=[];
const ok=(label,result,detail='')=>{assert.ok(result,label+(detail?' — '+detail:''));console.log('PASS '+label);count++;};
// Minimal PNG reader (8-bit RGB/RGBA, as Chromium writes screenshots).
function pixels(buf){
 let p=8,w=0,h=0,ct=0;const idat=[];
 while(p<buf.length){const len=buf.readUInt32BE(p),type=buf.toString('ascii',p+4,p+8),data=buf.subarray(p+8,p+8+len);
  if(type==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);ct=data[9];}else if(type==='IDAT')idat.push(data);else if(type==='IEND')break;p+=12+len;}
 const bpp=ct===6?4:3,raw=zlib.inflateSync(Buffer.concat(idat)),stride=w*bpp,px=Buffer.alloc(h*stride);
 for(let y=0;y<h;y++){const f=raw[y*(stride+1)],line=raw.subarray(y*(stride+1)+1,(y+1)*(stride+1));
  for(let x=0;x<stride;x++){const a=x>=bpp?px[y*stride+x-bpp]:0,b=y?px[(y-1)*stride+x]:0,c=x>=bpp&&y?px[(y-1)*stride+x-bpp]:0;let v=line[x];
   if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4){const q=a+b-c,pa=Math.abs(q-a),pb=Math.abs(q-b),pc=Math.abs(q-c);v+=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
   px[y*stride+x]=v&255;}}
 return {w,h,bpp,px};
}
// Share of pixels clearly different from the corner (background) colour: an empty mask gives 0.
function ink(png){const {w,h,bpp,px}=pixels(png);let n=0;
 for(let i=0;i<w*h;i++)if(Math.abs(px[i*bpp]-px[0])+Math.abs(px[i*bpp+1]-px[1])+Math.abs(px[i*bpp+2]-px[2])>60)n++;return n/(w*h);}
async function drawn(selector,label,min=1){
 const list=page.locator(selector),n=await list.count(),seen=[];
 for(let i=0;i<n;i++){const el=list.nth(i);if(!(await el.isVisible()))continue;const name=await el.evaluate(e=>[...e.classList].find(c=>c.startsWith('uc-ico--'))||'uc-ico');seen.push([name,ink(await el.screenshot())]);}
 ok(label,seen.length>=min&&seen.every(([,r])=>r>0.04),JSON.stringify(seen.map(([name,r])=>name.slice(8)+'='+r.toFixed(2))));
}
(async()=>{try{
 const PROFILE=fs.mkdtempSync(path.join(OUT,'profile-icons-'));
 app=await _electron.launch({executablePath:require('electron'),args:['--no-sandbox',path.join(ROOT,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:PROFILE}});
 page=await app.firstWindow();
 page.on('console',m=>{const t=m.text();if(/CORS|blocked|Failed to load|ERR_FILE/i.test(t))blocked.push(t.slice(0,200));});
 await page.waitForLoadState('domcontentloaded');await page.setViewportSize({width:1440,height:900});
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('fetch');ipcMain.handle('fetch',async()=>{throw Error('offline test');});});
 const version=require(path.join(ROOT,'app/package.json')).version;
 await page.evaluate(v=>{localStorage.setItem('settings',JSON.stringify({grade:'6',classroom:'1'}));localStorage.setItem('dashboardLocked','false');
  localStorage.setItem('morningDefault',JSON.stringify('책 읽기 20분'));localStorage.setItem('lastSeenVersion',JSON.stringify(v));
  localStorage.setItem('ddayEvents',JSON.stringify([{id:'d1',title:'현장체험학습',date:'2099-12-20'}]));},version);
 await page.reload();await page.waitForLoadState('domcontentloaded');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1200);
 await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 await drawn('.app-bar .uc-ico','아래 도구 막대 아이콘이 그려짐',7);
 await drawn('main>.card .cardhead .uc-ico','칸 제목 아이콘이 그려짐',1);
 await page.click('#timerButton');await page.waitForSelector('#timerDialog[open]');
 await drawn('#timerDialog .uc-ico--close','대화 상자 [×] 아이콘이 그려짐',1);
 await page.keyboard.press('Escape');
 await page.click('#screenSettings');await page.click('#openDdaySettings');await page.waitForSelector('#ddayDialog[open]');
 await drawn('#ddayDialog .uc-ico','D-Day 창 아이콘이 그려짐',1);
 await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 await page.evaluate(()=>window.boardLayout.begin());await page.waitForTimeout(400);
 await drawn('main>.card .layout-hide .uc-ico','배치 편집 [숨기기] 아이콘이 그려짐',4);
 await drawn('main>.card .uc-ico--resize','배치 편집 크기 손잡이 아이콘이 그려짐',4);
 await drawn('main>.card .board-title-edit .uc-ico','배치 편집 제목 바꾸기 아이콘이 그려짐',4);
 await drawn('.app-bar .uc-ico--help','배치 편집 [?] 아이콘이 그려짐',1);
 await page.click('main>.meal .layout-hide');await page.waitForSelector('[data-layout-show] .uc-ico');
 await drawn('[data-layout-show] .uc-ico','숨긴 칸 다시 넣기 [+] 아이콘이 그려짐',1);
 await page.evaluate(()=>window.boardLayout.cancel());
 ok('아이콘을 불러오지 못했다는 콘솔 메시지 없음',!blocked.length,blocked.join(' | '));
 await page.screenshot({path:path.join(OUT,'icons.png')});
}catch(e){console.error(e);process.exitCode=1;}finally{if(app)await app.close().catch(()=>{});}
 if(!process.exitCode)console.log(`${count}/${count} passed`);
})();
