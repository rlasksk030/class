// Real published installers on disposable GitHub Actions Windows VMs only.
// G: per-user overwrite; H: broken old uninstaller; I: machine install + running-app refusal.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync,execFileSync}=require('node:child_process'),{_electron}=require('playwright-core');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async function(scenario,dir){
 assert.equal(process.env.GITHUB_ACTIONS,'true','Failure simulation is restricted to disposable CI VMs');
 const expectedVersion=require('../../app/package.json').version,scope=scenario==='I'?'allusers':'currentuser';
 const hive=scenario==='I'?'HKLM':'HKCU',guid='d78eedc4-9833-5771-9f01-d94e51e1b797';
 const key=`${hive}\\Software\\${guid}`,out=path.join(__dirname,'.out');fs.mkdirSync(out,{recursive:true});
 const report={baseline:'1.8.4',candidate:expectedVersion,scenario,checks:[]};let app;
 const ok=(name,test)=>{assert.ok(test,name);report.checks.push(name);console.log('PASS '+name);};
 const registry=()=>{const raw=execFileSync('reg',['query',key,'/v','InstallLocation'],{encoding:'utf8'});const match=raw.match(/InstallLocation\s+REG_\w+\s+(.+)/);assert.ok(match,'install folder registry');return match[1].trim();};
 const sha=file=>require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const install=async(file,folder)=>{
  const result=spawnSync(file,['/S','/'+scope,...(folder?['/D='+folder]:[])],{windowsHide:true,timeout:180000});
  assert.ifError(result.error);await sleep(2000);return result.status;
 };
 async function launch(folder){
  const env={...process.env,CLASSROOM_TEST_HIDDEN:'1'};delete env.CLASSROOM_TEST_PROFILE;
  app=await _electron.launch({executablePath:path.join(folder,'우리 교실.exe'),env,timeout:60000});
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');await page.waitForTimeout(1000);return page;
 }
 const storage=page=>page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])));
 const setup=v=>path.resolve(dir,`setup-${v}.exe`);
 try{
  ok('published v1.8.4 digest',sha(setup('1.8.4'))==='f72232b8e64c6840da2cca19606ee94c6c04280894ee40e733a58918a0c90d71');
  ok('baseline installation',await install(setup('1.8.4'))===0);
  const folder=registry();report.installDir=folder;let page=await launch(folder);
  ok('baseline runs as 1.8.4',await app.evaluate(({app})=>app.getVersion())==='1.8.4');
  await page.evaluate(()=>{
   const put=(k,v)=>localStorage.setItem(k,JSON.stringify(v)),y=String(new Date().getFullYear()-(new Date().getMonth()<2?1:0)),d=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()),c=`${y}:4:2`,draftKey=c+':'+d;
   put('settings',{grade:'4',classroom:'2'});put('morningDefault','기준선 아침활동');put('notes',{[d]:{notices:'기준선 안내사항'}});
   put('ddayEvents',[{id:'event',title:'현장학습',date:'2026-12-01'}]);put('classRosters',{[c]:{students:[{id:'s1',name:'검증학생1'},{id:'s2',name:'검증학생2'}]}});
   put('boardPreferences',{morning:{visible:true,scale:1.2},meal:{visible:false,scale:1}});put('boardSizes',{row:.6,columns:[.3,.4,.3]});put('boardTitles',{morning:'기준선 제목'});
   put('morningHistory',{[d]:'기준선 아침활동 이력'});put('overrides',{[`P10:8342104:4:2:${d}:timetable`]:[{period:'1',subject:'기준선 직접 수정'}]});
   put('periodSchedule',[{period:1,start:'09:00',end:'09:40'}]);put('periodHighlightEnabled',true);put('classTimer',{duration:180000,remaining:180000,deadline:null,state:'idle'});put('timerSound',false);
   put('whiteboardContents',{strokes:[],text:'',fontSize:36,blocks:[{id:'block',x:.1,y:.1,width:.4,text:'기준선 판서',fontSize:40}]});
   put('activityCompletion',{[c+':'+d]:['s1']});put('randomPickerSession',{key:c,date:d,excluded:['s2'],history:['s1'],noRepeat:false});
   put('diaryDrafts',{[draftKey]:{title:'기준선 알림장',body:'초안 유지',parents:true,students:false,postedHash:'old-hash'}});
   put('diaryRegistrationHistory',{[draftKey]:[{status:'success',hash:'older-post'}]});put('customUserSetting',{keep:'unknown keys must survive'});
  });await page.reload();await page.waitForTimeout(1000);
  const before=await storage(page),profile=await app.evaluate(({app})=>app.getPath('userData'));
  const linkFile=path.join(profile,'hiclass-links.json'),desktopFile=path.join(profile,'desktop-settings.json');
  const classKey=await page.evaluate(()=>ClassRoster.key());
  fs.writeFileSync(linkFile,JSON.stringify({links:{[classKey]:{title:'검증 학급',url:'https://www.hiclass.net/main/clazzes/test/note/test'}},posts:{'old-hash':{status:'success'}}}));
  const linkHash=sha(linkFile),desktop=JSON.parse(fs.readFileSync(desktopFile));
  const sessionMarker=path.join(profile,'Partitions','hiclass-teacher','validation-session-sentinel');
  fs.mkdirSync(path.dirname(sessionMarker),{recursive:true});fs.writeFileSync(sessionMarker,'preserve existing session files');const sessionHash=sha(sessionMarker);
  if(scenario==='I'){
   const oldHash=sha(path.join(folder,'resources/app.asar'));
   ok('running app blocks silent install with code 2',await install(setup('new'),folder)===2);
   ok('running app remains alive at 1.8.4',await app.evaluate(({app})=>app.getVersion())==='1.8.4');
   ok('blocked install leaves app package unchanged',sha(path.join(folder,'resources/app.asar'))===oldHash);
  }
  await app.close();app=null;await sleep(1500);
  if(scenario==='H'){
   // Deliberately corrupt only this VM's old uninstaller; same-directory updates must never execute it.
   fs.writeFileSync(path.join(folder,'Uninstall 우리 교실.exe'),'invalid old uninstaller for CI regression');
  }
  ok('candidate overwrite installation',await install(setup('new'),folder)===0);
  ok('same installation directory',registry()===folder);
  ok('HiClass links/posts unchanged',sha(linkFile)===linkHash);
  page=await launch(folder);ok('candidate version',await app.evaluate(({app})=>app.getVersion())===expectedVersion);
  ok('same userData path',await app.evaluate(({app})=>app.getPath('userData'))===profile);
  const after=await storage(page),ignored=new Set(['cache','location','locationAttempt']);
  report.keys=Object.keys(before).filter(k=>!ignored.has(k));report.changed=report.keys.filter(k=>before[k]!==after[k]);
  ok('all stored user keys preserved ('+report.keys.length+')',report.changed.length===0);
  ok('desktop startup/PIP settings preserved',JSON.stringify(JSON.parse(fs.readFileSync(desktopFile)))===JSON.stringify(desktop));
  ok('session partition file preserved',fs.existsSync(sessionMarker)&&sha(sessionMarker)===sessionHash);
  ok('grade/class settings not requested again',!(await page.isVisible('#settingsDialog')));
  await app.close();app=null;
  console.log(`${report.checks.length}/${report.checks.length} passed`);
 }finally{if(app)await app.close();fs.writeFileSync(path.join(out,`report-${scenario}.json`),JSON.stringify(report,null,2));}
};
