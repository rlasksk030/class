const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {_electron}=require('playwright-core'),ROOT=path.resolve(__dirname,'../..'),PROFILE=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'classroom-timer-startup-'));
let app,page,count=0;const pass=s=>{count++;console.log('PASS '+s);};
const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('classTimer')));
async function launch(){
 app=await _electron.launch({executablePath:require('electron'),args:[path.join(ROOT,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:PROFILE}});page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
 await page.addInitScript(()=>{window.soundPulses=0;window.AudioContext=class{currentTime=0;destination={};resume(){return Promise.resolve();}createOscillator(){window.soundPulses++;return {frequency:{},connect(){},start(){},stop(){}};}createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}};});
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('fetch');ipcMain.handle('fetch',async()=>{throw Error('offline');});});
 await page.evaluate(()=>{if(!JSON.parse(localStorage.getItem('settings')||'{}').grade)localStorage.setItem('settings',JSON.stringify({grade:'6',classroom:'1'}));});
 await page.reload();await page.waitForLoadState('domcontentloaded');
}
async function preset(seconds){if(!await page.locator('#timerDialog').evaluate(e=>e.open))await page.click('#timerButton');await page.fill('#timerMinutes','0');await page.fill('#timerSeconds',String(seconds));await page.click('#timerSet');}
async function finished(){await preset(1);await page.check('#timerSound');await page.click('#timerStart');await page.waitForFunction(()=>classroomTools.timer().state==='finished');}
async function idle(){await page.waitForFunction(()=>classroomTools.timer().state==='idle');const t=await state();assert.equal(t.remaining,t.duration);assert.equal(t.deadline,null);assert.equal(await page.textContent('#timerButton'),'⏱ 타이머');assert.equal(await page.isVisible('#timerFinished'),false);}
(async()=>{try{
 await launch();
 const registrations=async()=>app.evaluate(async({shell},module)=>process.mainModule.require(module).inventory(shell,process.env),path.join(ROOT,'app/startup-manager.cjs'));
 const startupBefore=process.platform==='win32'?await registrations():[];
 await preset(10);await page.click('#timerStart');const deadline=(await state()).deadline;await page.click('#timerDialog .close-extra');await page.waitForTimeout(1200);assert.equal((await state()).state,'running');assert.equal((await state()).deadline,deadline);assert.match(await page.textContent('#timerButton'),/⏱ 00:0[89]/);pass('running close preserves deadline and countdown');
 await page.click('#timerButton');await page.click('#timerPause');const paused=await state();await page.keyboard.press('Escape');await page.waitForTimeout(400);assert.deepEqual(await state(),paused);await page.click('#timerButton');assert.equal(await page.textContent('#timerStart'),'계속하기');pass('paused Escape preserves remaining time and resume');
 await page.click('#timerReset');await page.keyboard.press('Escape');await idle();
 for(const mode of ['button','Escape','native close']){
  await finished();assert.ok(await page.isVisible('#timerFinished'));const pulses=await page.evaluate(()=>soundPulses);await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>soundPulses),pulses);
  if(mode==='button')await page.click('#timerDialog .close-extra');else if(mode==='Escape')await page.keyboard.press('Escape');else await page.locator('#timerDialog').evaluate(e=>e.close());
  await idle();await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>soundPulses),pulses);pass('finished '+mode+' resets saved state, banner and button without another alarm');
 }
 await finished();await page.click('#timerFinished button');await idle();assert.equal(await page.inputValue('#timerSeconds'),'1');await page.click('#timerStart');assert.equal((await state()).state,'running');pass('acknowledge inside open dialog resets and immediately restarts configured time');
 await page.keyboard.press('Escape');await page.waitForFunction(()=>classroomTools.timer().state==='finished');await page.waitForTimeout(500);assert.ok(await page.isVisible('#timerFinished'));pass('closed-dialog completion keeps alert until user acknowledgement');
 await page.click('#timerFinished button');await idle();pass('banner acknowledgement outside dialog clears completion');
 await app.close();await launch();await idle();pass('acknowledged completion remains idle after relaunch');
 // Keep an unacknowledged completion visible across reload instead of silently discarding the alert.
 await finished();await page.reload();await page.waitForLoadState('domcontentloaded');assert.equal((await state()).state,'finished');assert.ok(await page.isVisible('#timerFinished'));await page.click('#timerFinished button');await idle();pass('unacknowledged alert survives reload, acknowledgement is persisted');
 await preset(20);await page.click('#timerStart');await page.keyboard.press('Escape');await page.evaluate(()=>desktop.openPip('dashboard'));let pip;for(let i=0;i<50;i++){pip=app.windows().find(p=>p.url().endsWith('/pip.html'));if(pip)break;await page.waitForTimeout(100);}assert.ok(pip,'PIP renderer opened');await pip.waitForSelector('.pip-timer');assert.match(await pip.textContent('.pip-timer'),/⏱ 00:/);pass('PIP running timer visible');
 await page.click('#timerButton');await page.click('#timerPause');await page.keyboard.press('Escape');await pip.waitForFunction(()=>document.querySelector('.pip-timer')?.textContent.includes('일시정지'));pass('PIP paused timer preserved');
 await finished();await page.click('#timerFinished button');await idle();await pip.waitForFunction(()=>!document.querySelector('.pip-timer'));pass('PIP completion clears after acknowledgement');await pip.close();
 // Both copies use the same profile lock even if their executable/app locations differ.
 const secondDir=path.join(PROFILE,'second-app');fs.mkdirSync(secondDir);fs.writeFileSync(path.join(secondDir,'package.json'),JSON.stringify({name:'alternate-copy',version:'1.8.5',main:'main.cjs'}));fs.writeFileSync(path.join(secondDir,'main.cjs'),'require('+JSON.stringify(path.join(ROOT,'app/main.cjs'))+')');
 const before=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length);
 for(const dir of [path.join(ROOT,'app'),secondDir]){const child=spawn(require('electron'),[dir],{env:{...process.env,CLASSROOM_TEST_PROFILE:PROFILE},windowsHide:true,stdio:'ignore'});const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Duplicate launch did not exit')),15000);child.on('error',reject);child.on('exit',c=>{clearTimeout(timer);resolve(c);});});assert.equal(code,0);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),before);pass('manual duplicate launch exits without another window: '+(dir===secondDir?'different app path':'same path'));}
 const settings=await page.evaluate(()=>desktop.settings());assert.equal(typeof settings.startupEnabled,'boolean');await page.evaluate(()=>desktop.startup(false));assert.equal((await page.evaluate(()=>desktop.settings())).startupEnabled,false);await app.close();await launch();assert.equal((await page.evaluate(()=>desktop.settings())).startupEnabled,false);pass('isolated startup OFF persists across relaunch without OS registration');
 if(process.platform==='win32'){assert.deepEqual(await registrations(),startupBefore);pass('real Windows startup inventory unchanged by all isolated E2E launches and settings');}
 console.log(`${count}/${count} passed`);
}finally{if(app)await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
