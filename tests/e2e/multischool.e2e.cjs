// All schools, class data, sessions and service responses in this test are synthetic.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {_electron}=require('playwright-core'),Schools=require('../../app/school.js');
const root=path.resolve(__dirname,'../..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'class-188-schools-'));
const one={...Schools.legacy,ATPT_OFCDC_SC_CODE:'B10',SD_SCHUL_CODE:'7010001',SCHUL_NM:'가상초등학교',ORG_RDNMA:'가상 서울 주소'};
const two={...one,ATPT_OFCDC_SC_CODE:'J10',SD_SCHUL_CODE:'7010002',ORG_RDNMA:'가상 경기 주소'};
let app,page,count=0;
function ok(label,result){assert.ok(result,label);console.log('PASS '+label);count++;}
async function launch(){
 app=await _electron.launch({executablePath:require('electron'),args:[path.join(root,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:profile}});
 page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
 await app.evaluate(({app,ipcMain},schools)=>{
  // The harness launches the replacement process after observing the original process exit.
  app.relaunch=()=>{};globalThis.seen=[];
  ipcMain.removeHandler('fetch');ipcMain.handle('fetch',(_e,url)=>{
   const u=new URL(url),name=u.pathname.split('/').pop();globalThis.seen.push([name,Object.fromEntries(u.searchParams)]);
   if(name==='schoolInfo')return {schoolInfo:[{head:[{list_total_count:2}]},{row:schools}]};
   if(name==='classInfo')return {classInfo:[{row:[{AY:u.searchParams.get('AY'),GRADE:'6',CLASS_NM:'1'}]}]};
   if(name==='elsTimetable'||name==='mealServiceDietInfo')return {[name]:[{row:name==='elsTimetable'?[{PERIO:'1',ITRT_CNTNT:'가상 국어'}]:[{DDISH_NM:'가상 급식'}]}]};
   throw Error('offline');
  });
 },[one,two]);
 // Start the renderer with the fixture already active, including its initial automatic refresh.
 await page.reload({waitUntil:'domcontentloaded'});
}
async function select(school){
 if(!await page.locator('#settingsDialog').isVisible())await page.click('#settings');
 await page.locator('#schoolChooser').evaluate(el=>el.open=true);
 await page.fill('#schoolName','가상초등학교');await page.click('#schoolSearch');await page.waitForFunction(()=>document.querySelector('#schoolResults').options.length===3);
 await page.selectOption('#schoolResults',school===one?'0':'1');await page.selectOption('#grade','6');await page.fill('#classroom','1');
 const exit=new Promise(resolve=>app.process().once('exit',resolve));
 await page.click('#settingsForm .primary').catch(e=>{if(!e.message.includes('closed'))throw e;});await exit;app=null;await launch();
}
(async()=>{try{
 await launch();ok('new installation starts with NEIS helper and no selected school',await page.locator('#settingsDialog[open] #neisGuide[open]').count()&&await page.locator('#grade').isDisabled());
 await select(one);await page.click('#refresh');await page.waitForFunction(()=>document.querySelector('#meal').innerText.includes('가상 급식'));
 const requests=await app.evaluate(()=>globalThis.seen);
 ok('both NEIS services receive selected office and school codes', ['elsTimetable','mealServiceDietInfo'].every(ep=>requests.some(([name,p])=>name===ep&&p.ATPT_OFCDC_SC_CODE==='B10'&&p.SD_SCHUL_CODE==='7010001')));
 await page.evaluate(()=>{for(const key of ['classRosters','diaryDrafts','activityCompletion'])localStorage.setItem(key,JSON.stringify({fixture:'first school'}));});
 await app.evaluate(({app},root)=>{const p=process.mainModule.require(root+'/app/school-profile.cjs').get(),fs=process.mainModule.require('fs');fs.writeFileSync(p.dir+'/hiclass-links.json',JSON.stringify({links:{'6:1':{title:'first school'}},posts:{}}));},root);
 await select(two);
 ok('same name, grade and class in another district open an isolated store',await page.evaluate(()=>['classRosters','diaryDrafts','activityCompletion'].every(k=>!localStorage.getItem(k)?.includes('first school'))));
 ok('second school has no first-school HiClass link',!(await page.evaluate(()=>desktop.diaryStatus('6:1'))).linked);
 await page.evaluate(()=>localStorage.setItem('activityCompletion',JSON.stringify({fixture:'second school'})));
 await select(one);
 ok('returning restores all first-school data and the correct link',await page.evaluate(async()=>['classRosters','diaryDrafts','activityCompletion'].every(k=>localStorage.getItem(k)?.includes('first school'))&&(await desktop.diaryStatus('6:1')).linked));
 console.log(count+'/'+count+' passed');
}finally{if(app)await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
