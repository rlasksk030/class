// Real Windows installer scenarios (GitHub Actions windows-latest). Installs the published setup files,
// runs the installed app with its real profile (no CLASSROOM_TEST_PROFILE), writes data, installs the next
// version and records install folders, uninstall entries, shortcuts, userData and stored keys.
// Usage: node tests/windows/installer-scenario.cjs <A|B|C|D|E|F>
// A v1.7.8 -> new (updater: /S /D=)  B v1.7.8 + manual v1.8.1 -> new  C fresh new  D v1.7.8 -> v1.8.1 (updater) -> new  E v1.8.1 only -> new
// F v1.7.8 + v1.8.1 "all users" (Program Files) -> new setup run by the teacher; the Program Files copy stays and the app says so <dir with setup-1.7.8.exe, setup-1.8.1.exe, setup-new.exe>
const {execFileSync,spawnSync}=require('child_process'),fs=require('fs'),path=require('path');
const {_electron}=require('playwright-core');
const [scenario,dir]=process.argv.slice(2);
const OUT=path.join(__dirname,'.out');fs.mkdirSync(OUT,{recursive:true});
const GUIDS={'v1.7.x org.school.classroomdashboard':'d78eedc4-9833-5771-9f01-d94e51e1b797','v1.8.x kr.classroom.dashboard':'80d89bea-829d-5beb-a731-910f2523db96'};
const EXE='우리 교실.exe',report={scenario,steps:[]},results=[];
const ok=(n,c,d='')=>{results.push([n,!!c]);console.log((c?'PASS':'FAIL')+' '+n+(d?' — '+d:''));};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ps=cmd=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','[Console]::OutputEncoding=[Text.Encoding]::UTF8;'+cmd],{encoding:'utf8'}).trim();

function uninstallEntries(){
 const out=[];
 for(const hive of ['HKCU','HKLM'])for(const [label,guid] of Object.entries(GUIDS)){
  try{const txt=execFileSync('reg',['query',`${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${guid}`],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
   const get=k=>(txt.match(new RegExp('^\\s+'+k+'\\s+REG_\\w+\\s+(.*)$','m'))||[])[1]?.trim();
   const uninstall=get('UninstallString'),fromUninstall=(uninstall?.match(/^"([^"]+)"/)||[])[1];
   let installKey;try{installKey=(execFileSync('reg',['query',`${hive}\\Software\\${guid}`,'/v','InstallLocation'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).match(/InstallLocation\s+REG_\w+\s+(.*)$/m)||[])[1]?.trim();}catch{}
   out.push({hive,label,displayName:get('DisplayName'),version:get('DisplayVersion'),installLocation:get('InstallLocation')||installKey||(fromUninstall&&path.dirname(fromUninstall)),uninstall});}catch{}
 }
 return out;
}
function shortcuts(){
 const script=`$sh=New-Object -ComObject Shell.Application;$dirs=@([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('CommonDesktopDirectory'),[Environment]::GetFolderPath('Programs'),[Environment]::GetFolderPath('CommonPrograms'));foreach($d in $dirs){if(Test-Path $d){Get-ChildItem $d -Recurse -Filter *.lnk -ErrorAction SilentlyContinue|?{$_.Name -like '*교실*'}|%{ "{0}|{1}" -f $_.FullName,$sh.Namespace($_.DirectoryName).ParseName($_.Name).GetLink.Path }}}`;
 return ps(script).split(/\r?\n/).filter(Boolean).map(l=>{const [link,target]=l.split('|');return {link,target};});
}
function runKey(){try{return execFileSync('reg',['query','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'],{encoding:'utf8'}).split(/\r?\n/).filter(l=>/classroom|교실/i.test(l)).map(s=>s.trim());}catch{return [];}}
function installs(){return [...new Set(uninstallEntries().map(e=>e.installLocation).filter(Boolean))].filter(d=>fs.existsSync(path.join(d,EXE)));}
function profileInfo(){const p=path.join(process.env.APPDATA,'classroom-dashboard');const ls=path.join(p,'Local Storage','leveldb');return {userData:p,exists:fs.existsSync(p),leveldbFiles:fs.existsSync(ls)?fs.readdirSync(ls).length:0,entries:fs.existsSync(p)?fs.readdirSync(p).sort():[]};}
function snapshot(label){const s={label,uninstallEntries:uninstallEntries(),installs:installs(),shortcuts:shortcuts(),runKey:runKey(),profile:profileInfo()};report.steps.push(s);console.log('\n### '+label+'\n'+JSON.stringify(s,null,1));return s;}

async function waitForExit(names,ms=180000){const end=Date.now()+ms;while(Date.now()<end){const list=execFileSync('tasklist',['/FO','CSV','/NH'],{encoding:'utf8'});if(!names.some(n=>list.toLowerCase().includes(n.toLowerCase())))return;await sleep(1000);}}
async function install(file,args){
 console.log(`\n>>> ${path.basename(file)} ${args.join(' ')}`);
 const r=spawnSync(file,args,{stdio:'inherit',windowsHide:true,timeout:240000});
 if(r.error||r.signal)console.log(`installer did not finish normally: ${r.error?.message||r.signal}`);
 await waitForExit([path.basename(file),'Un_A.exe','Un_B.exe','Uninstall 우리 교실.exe']);await sleep(2000);
 return r.status;
}
async function launch(installDir){
 const exe=path.join(installDir,EXE);const env={...process.env};delete env.CLASSROOM_TEST_PROFILE;
 const app=await _electron.launch({executablePath:exe,env,timeout:60000});const page=await app.firstWindow();page.on('dialog',d=>d.accept());
 await page.waitForLoadState('domcontentloaded');await page.waitForTimeout(1500);
 const info=await app.evaluate(({app})=>({version:app.getVersion(),userData:app.getPath('userData'),exe:process.execPath}));
 return {app,page,info};
}
const KEYS=['settings','morningDefault','notes','ddayEvents','classRosters','boardPreferences','boardSizes','periodSchedule','periodHighlightEnabled','classTimer','timerSound','whiteboardContents','activityCompletion','randomPickerSession'];
const storage=page=>page.evaluate(k=>Object.fromEntries(k.map(x=>[x,localStorage.getItem(x)])),KEYS);
async function writeData(page){
 await page.evaluate(()=>{const y=String(new Date().getFullYear()-(new Date().getMonth()<2?1:0));const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
  const set=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  set('settings',{grade:'6',classroom:'1'});set('morningDefault','P0 검증: 책 읽기 20분');set('notes',{[today]:{notices:'P0 검증: 체육복'}});set('ddayEvents',[{id:'d1',title:'수학여행',date:'2026-12-01'}]);
  set('classRosters',{[`${y}:6:1`]:{students:[{id:'s1',name:'김하늘'},{id:'s2',name:'이바다'}]}});set('boardPreferences',{meal:{visible:false,scale:1},morning:{visible:true,scale:1.2}});set('boardSizes',{row:.6});
  set('periodSchedule',[{period:1,start:'09:00',end:'09:40'}]);set('periodHighlightEnabled',true);set('classTimer',{duration:180000,remaining:180000,deadline:null,state:'idle'});set('timerSound',true);
  set('whiteboardContents',{strokes:[],text:'',fontSize:36,blocks:[{id:'b1',x:.1,y:.1,width:.4,text:'P0 화이트보드',fontSize:40}]});set('activityCompletion',{});set('randomPickerSession',{});});
 await page.reload();await page.waitForTimeout(1200);
}
async function main(){
 const setup=v=>path.join(dir,`setup-${v}.exe`);
 let expected=null;
 if(['A','B','D','F'].includes(scenario)){
  await install(setup('1.7.8'),['/S']);const s1=snapshot('v1.7.8 설치 직후');
  ok('v1.7.8 설치 확인',s1.installs.length===1,s1.installs.join(', '));
  let {app,page,info}=await launch(s1.installs[0]);report.v178=info;ok('v1.7.8 실행',info.version==='1.7.8',JSON.stringify(info));
  await writeData(page);expected=await storage(page);ok('v1.7.8 데이터 기록',(await page.innerText('#morning')).includes('P0 검증'));await app.close();await sleep(1500);
  snapshot('v1.7.8 데이터 기록 후');
  if(scenario==='F'){
   // The v1.8.1 wizard offers "Anyone who uses this computer": a second copy in Program Files with its own entry.
   await install(setup('1.8.1'),['/S','/allusers']);const s2=snapshot('v1.8.1 "모든 사용자" 설치 후');
   const pf=s2.installs.find(d=>!d.toLowerCase().startsWith(process.env.LOCALAPPDATA.toLowerCase()));report.v181PerMachine=pf;
   ok('v1.8.1 모든 사용자 설치가 별도 폴더에 생김(문제 상태 재현)',!!pf&&s2.installs.length===2,s2.installs.join(', '));
   if(pf){const r=await launch(pf);const now=await storage(r.page);const same=KEYS.filter(k=>expected[k]===now[k]).length;report.v181PerMachineData={...r.info,sameKeys:same};console.log(`v1.8.1 (Program Files): userData ${r.info.userData}, same keys ${same}/${KEYS.length}`);await r.app.close();await sleep(1500);}
   // The teacher runs the new setup (one-click, per user): it updates the v1.7.x per-user copy.
   await install(setup('new'),['/S']);const s3=snapshot('새 설치 파일 실행 후 (Program Files 사본 남음)');
   ok('새 버전은 v1.7.x 사용자 설치 폴더를 갱신',s3.uninstallEntries.some(e=>e.label.startsWith('v1.7.x')&&e.hive==='HKCU'&&e.version!=='1.7.8'),s3.uninstallEntries.map(e=>`${e.hive} ${e.label} ${e.version}`).join(' / '));
   // The v1.8.1 uninstaller does nothing (or hangs) when run silently, and removing an all-users copy needs an
   // administrator, so the Program Files copy is left alone by design; the new app shows a notice about it instead.
  }
  if(scenario==='B'||scenario==='D'){
   // B: v1.8.1 installed from its setup file (manual install, defaults). D: v1.7.8's own updater path ("/S /D=<install dir>").
   await install(setup('1.8.1'),scenario==='B'?['/S']:['/S','/D='+s1.installs[0]]);const s2=snapshot(scenario==='B'?'v1.8.1 수동 설치(기본값) 후':'v1.8.1 업데이트 경로(/S /D=) 설치 후');
   report.v181Installs=s2.installs;
   for(const d of s2.installs){const r=await launch(d);const now=await storage(r.page);const same=KEYS.filter(k=>expected[k]===now[k]).length;console.log(`v1.8.1 check ${d}: version ${r.info.version}, userData ${r.info.userData}, same keys ${same}/${KEYS.length}`);report['v181_'+d]={...r.info,sameKeys:same};await r.app.close();await sleep(1500);}
  }
  // Emulate the in-app updater: UpdateRecovery runs the new setup with "/S /D=<current install folder>".
  if(scenario!=='F'){const target=installs().find(d=>fs.existsSync(path.join(d,EXE)));await install(setup('new'),['/S','/D='+target]);}
 }else{
  if(scenario==='E'){
   await install(setup('1.8.1'),['/S']);const s1=snapshot('v1.8.1 단독 설치 직후');ok('v1.8.1 설치 확인',s1.installs.length===1,s1.installs.join(', '));
   let {app,page,info}=await launch(s1.installs[0]);ok('v1.8.1 실행',info.version==='1.8.1',JSON.stringify(info));await writeData(page);expected=await storage(page);await app.close();await sleep(1500);
   await install(setup('new'),['/S','/D='+s1.installs[0]]);
  }else await install(setup('new'),['/S']);
 }
 const final=snapshot('최신 버전 적용 후');
 const version=JSON.parse(fs.readFileSync(path.join(__dirname,'../../app/package.json'),'utf8')).version;
 if(scenario==='F')return finishF(final,expected,version);
 const newest=[];for(const d of final.installs){const r=await launch(d);newest.push({dir:d,...r.info,data:await storage(r.page),settingsOpen:!!(await r.page.$('#settingsDialog[open]'))});await r.app.close();await sleep(1500);}
 report.final=newest.map(({data,...x})=>({...x,keys:Object.keys(data).filter(k=>data[k]!=null)}));
 ok('최신 버전이 실행됨',newest.some(n=>n.version===version),newest.map(n=>n.version).join(','));
 ok('우리 교실 제거 항목이 하나(v1.7.x appId)',final.uninstallEntries.length===1&&final.uninstallEntries[0].label.startsWith('v1.7.x'),final.uninstallEntries.map(e=>`${e.hive} ${e.label} ${e.version}`).join(' / '));
 ok('설치된 실행 파일이 하나',final.installs.length===1,final.installs.join(', '));
 ok('바로가기가 모두 같은 실행 파일을 가리킴',new Set(final.shortcuts.map(s=>s.target.toLowerCase())).size<=1,final.shortcuts.map(s=>s.target).join(' | '));
 if(expected){for(const n of newest.filter(n=>n.version===version)){const missing=KEYS.filter(k=>expected[k]!==n.data[k]);ok(`기존 데이터 전부 동일 (${n.dir})`,missing.length===0,missing.length?'다름: '+missing.join(','):KEYS.length+'개 키 동일');ok('학년/반 설정창 재요청 없음',!n.settingsOpen);}}
 else ok('신규 설치: 최초 설정 화면',newest.every(n=>n.settingsOpen));
 finish();
}
// F: the per-user copy is updated and keeps the data; the Program Files copy is untouched and the new app points it out.
async function finishF(final,expected,version){
 const local=process.env.LOCALAPPDATA.toLowerCase(),home=process.env.USERPROFILE.toLowerCase();
 const perUser=final.installs.find(d=>d.toLowerCase().startsWith(local)),pf=final.installs.find(d=>!d.toLowerCase().startsWith(local));
 ok('사용자 설치 폴더가 남아 있음',!!perUser,final.installs.join(', '));
 const hkcu=final.uninstallEntries.filter(e=>e.hive==='HKCU');
 ok('사용자(HKCU) 제거 항목은 v1.7.x 하나, 최신 버전',hkcu.length===1&&hkcu[0].label.startsWith('v1.7.x')&&hkcu[0].version===version,hkcu.map(e=>`${e.label} ${e.version}`).join(' / '));
 ok('Program Files 사본은 자동으로 제거하지 않음(그대로 남음)',!!pf&&final.uninstallEntries.some(e=>e.hive==='HKLM'&&e.label.startsWith('v1.8.x')),pf||'없음');
 if(!perUser)return finish();
 const r=await launch(perUser);
 await r.page.waitForFunction(()=>!document.getElementById('installNotice')?.hidden,null,{timeout:20000}).catch(()=>{});
 const notice=await r.page.evaluate(()=>document.getElementById('installNotice')?.textContent||'');
 const data=await storage(r.page),settingsOpen=!!(await r.page.$('#settingsDialog[open]'));
 await r.app.close();await sleep(1500);
 report.final=[{dir:perUser,...r.info,notice,keys:Object.keys(data).filter(k=>data[k]!=null)}];
 ok('최신 버전이 사용자 설치 폴더에서 실행됨',r.info.version===version,r.info.version);
 const missing=KEYS.filter(k=>expected[k]!==data[k]);ok('기존 데이터 전부 동일',missing.length===0,missing.length?'다름: '+missing.join(','):KEYS.length+'개 키 동일');
 ok('학년/반 설정창 재요청 없음',!settingsOpen);
 ok('다른 위치 설치본 안내 표시',!!pf&&notice.toLowerCase().includes(pf.toLowerCase()),notice);
 const mine=snapshot('최신 버전 실행 후').shortcuts.filter(s=>s.link.toLowerCase().startsWith(home));
 ok('사용자 바로가기는 최신(사용자 설치) 실행 파일을 가리킴',mine.every(s=>s.target.toLowerCase()===path.join(perUser,EXE).toLowerCase()),mine.map(s=>s.target).join(' | '));
 finish();
}
function finish(){
 fs.writeFileSync(path.join(OUT,`report-${scenario}.json`),JSON.stringify(report,null,1));
 const f=results.filter(r=>!r[1]);console.log(`\n${results.length-f.length}/${results.length} passed`);process.exit(f.length?1:0);
}
main().catch(e=>{console.error(e);fs.writeFileSync(path.join(OUT,`report-${scenario}.json`),JSON.stringify(report,null,1));process.exit(2);});
