// Actual previous-release -> candidate NSIS upgrade, in a clean Windows runner only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process'),{_electron}=require(require.resolve('playwright-core',{paths:[process.cwd()]}));
assert.equal(process.platform,'win32');assert.equal(process.env.GITHUB_ACTIONS,'true');
const [edition,fixtureArg]=process.argv.slice(2),fixtures=path.resolve(fixtureArg),base=fs.mkdtempSync(path.join(os.tmpdir(),'timer-pip-release-'));
const install=path.join(base,'app'),profile=path.join(base,'profile'),exe=path.join(install,'우리 교실.exe');
const candidate=edition==='nationwide'?'classroom-dashboard-nationwide-setup-1.8.10-x64.exe':'classroom-dashboard-setup-1.8.10.exe';
const baseline=edition==='nationwide'?'1.8.9':'1.8.7';let app,page;
const installFile=name=>execFileSync(path.join(fixtures,name),['/S','/currentuser','/D='+install],{timeout:240000});
async function launch(){app=await _electron.launch({executablePath:exe,env:{...process.env,CLASSROOM_TEST_PROFILE:profile},timeout:90000});page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');}
(async()=>{try{
 installFile('previous.exe');await launch();assert.equal(await app.evaluate(({app})=>app.getVersion()),baseline);
 await page.evaluate(()=>{
  const put=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  put('settings',{grade:'6',classroom:'1',school:{ATPT_OFCDC_SC_CODE:'P10',SD_SCHUL_CODE:'8342104',SCHUL_NM:'옥구초등학교',SCHUL_KND_SC_NM:'초등학교'}});
  put('classRosters',{fixture:{students:[{id:'synthetic-1',name:'가상 학생'}]}});put('diaryDrafts',{fixture:{body:'PIP upgrade fixture'}});
  put('activityCompletion',{fixture:['synthetic-1']});put('customReleaseFixture',{preserve:true});
  put('classTimer',{duration:60000,remaining:60000,deadline:null,state:'idle'});
 });
 await page.reload();await page.waitForLoadState('domcontentloaded');
 const keys=['settings','classRosters','diaryDrafts','activityCompletion','customReleaseFixture','classTimer'];
 const before=await page.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)])),keys);
 const userData=await app.evaluate(({app})=>app.getPath('userData'));await app.close();app=null;
 installFile(candidate);await launch();assert.equal(await app.evaluate(({app})=>app.getVersion()),'1.8.10');
 assert.equal(await app.evaluate(({app})=>app.getPath('userData')),userData);
 assert.deepEqual(await page.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)])),keys),before);
 console.log('PASS '+edition+' same-directory upgrade preserves user data and saved timer');
 await page.evaluate(()=>{for(const d of document.querySelectorAll('dialog[open]'))d.close();});
 await page.click('#timerButton');await page.click('#timerDialog [data-pip="timer"]');
 let pip;for(let n=0;n<50;n++){pip=app.windows().find(p=>p.url().endsWith('/pip.html'));if(pip)break;await page.waitForTimeout(100);}
 assert.ok(pip);await pip.waitForSelector('#pipTimerDisplay');assert.equal(await pip.textContent('#pipTimerDisplay'),'01:00');
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/pip.html')).isAlwaysOnTop()),true);
 await pip.click('[data-timer-action="start"]');await page.waitForFunction(()=>classroomTools.timer().state==='running');
 await pip.click('[data-timer-action="pause"]');await page.waitForFunction(()=>classroomTools.timer().state==='paused');
 await pip.click('[data-timer-action="reset"]');await page.waitForFunction(()=>classroomTools.timer().state==='idle');
 console.log('PASS '+edition+' packaged timer PIP opens always-on-top and controls the shared timer');
}finally{if(app)await app.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
