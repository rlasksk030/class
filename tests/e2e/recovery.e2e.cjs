// Earlier-data recovery E2E: updater snapshot auto-recovery (empty profile only), no overwrite of existing
// data, and import from another profile folder (original folder untouched).
const path=require('path'),fs=require('fs'),crypto=require('crypto');
const {_electron}=require('playwright-core');const electronPath=require('electron');
const ROOT=path.resolve(__dirname,'../..'),OUTDIR=path.join(__dirname,'.out');
const P=n=>path.join(OUTDIR,'profile-recovery-'+n);
const results=[];const ok=(n,c,d='')=>{results.push([n,!!c]);console.log((c?'PASS':'FAIL')+' '+n+(d?' — '+d:''));};
async function launch(profile,folder){
 const app=await _electron.launch({executablePath:electronPath,args:['--no-sandbox',path.join(ROOT,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:profile}});
 const page=await app.firstWindow();page.on('dialog',d=>d.accept());await page.waitForLoadState('domcontentloaded');
 await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:!folder,filePaths:folder?[folder]:[]});},folder||null);
 await page.waitForTimeout(1500);return {app,page};
}
const dump=page=>page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])));
const hashDir=d=>{const h=crypto.createHash('sha256');const walk=x=>{for(const f of fs.readdirSync(x).sort()){const p=path.join(x,f);if(fs.statSync(p).isDirectory())walk(p);else{h.update(f);h.update(fs.readFileSync(p));}}};walk(d);return h.digest('hex');};
const USER={settings:{grade:'5',classroom:'3'},morningDefault:'복구 확인: 독서 20분',ddayEvents:[{id:'d1',title:'학예회',date:'2026-12-20'}],whiteboardContents:{strokes:[],text:'',fontSize:36,blocks:[{id:'b1',x:.1,y:.1,width:.4,text:'복구 화이트보드',fontSize:40}]},boardTitles:{morning:'오늘 할 일'}};
(async()=>{
 fs.mkdirSync(OUTDIR,{recursive:true});for(const n of ['A','B','C','D'])fs.rmSync(P(n),{recursive:true,force:true});
 // A: the "old" profile with teacher data.
 let {app,page}=await launch(P('A'));
 await page.evaluate(u=>{for(const [k,v] of Object.entries(u))localStorage.setItem(k,JSON.stringify(v));localStorage.setItem('dashboardLocked','false');},USER);await page.reload();await page.waitForTimeout(800);
 const original=await dump(page);await app.close();
 // B: empty profile + updater snapshot (same format UpdateRecovery flow writes) -> automatic one-time recovery.
 fs.mkdirSync(path.join(P('B'),'update-recovery','1790000000000'),{recursive:true});fs.writeFileSync(path.join(P('B'),'update-recovery','1790000000000','local-storage-backup.json'),JSON.stringify(original));
 ({app,page}=await launch(P('B')));await page.waitForTimeout(2500);
 ok('빈 프로필 + 업데이트 직전 백업 → 자동 복구',(await page.innerText('#morning'))==='복구 확인: 독서 20분'&&(await page.textContent('#classTitle')).includes('5학년 3반')&&(await page.textContent('.morning h2')).includes('오늘 할 일'));
 ok('복구 안내 표시',(await page.textContent('#globalStatus')).includes('이전 데이터를 복구했습니다'),await page.textContent('#globalStatus'));
 ok('자동 복구 전 현재 상태 보관본 생성',fs.readdirSync(path.join(P('B'),'backups')).some(f=>f.startsWith('before-restore-')));
 await app.close();({app,page}=await launch(P('B')));ok('다시 실행해도 반복 복구 없음',(await page.textContent('#globalStatus'))!==''&&!(await page.textContent('#globalStatus')).includes('복구했습니다'));await app.close();
 // C: profile already has data + snapshot -> never overwritten automatically.
 ({app,page}=await launch(P('C')));await page.evaluate(()=>{localStorage.setItem('settings',JSON.stringify({grade:'6',classroom:'1'}));localStorage.setItem('morningDefault',JSON.stringify('현재 데이터'));});await app.close();
 fs.mkdirSync(path.join(P('C'),'update-recovery','1790000000000'),{recursive:true});fs.writeFileSync(path.join(P('C'),'update-recovery','1790000000000','local-storage-backup.json'),JSON.stringify(original));
 ({app,page}=await launch(P('C')));await page.waitForTimeout(2000);ok('현재 데이터가 있으면 자동으로 덮어쓰지 않음',(await page.innerText('#morning'))==='현재 데이터');
 await page.click('#settings');await page.click('#recoveryFind');await page.waitForSelector('#recoveryList .recovery-item');
 ok('수동: 업데이트 직전 자동 백업 목록·요약',(await page.innerText('#recoveryList')).includes('업데이트 직전 자동 백업')&&(await page.innerText('#recoveryList')).includes('5학년 3반')&&(await page.innerText('#recoveryList')).includes('복구 확인: 독서 20분'));
 await page.click('#recoveryList .recovery-item button');await page.waitForSelector('#backupConfirmDialog[open]');await page.click('#backupConfirmDialog button[value=cancel]');await page.waitForTimeout(300);
 ok('확인창 취소 시 변경 없음',(await page.evaluate(()=>localStorage.getItem('morningDefault')))==='"현재 데이터"');
 await app.close();
 // D: import from another profile folder (A). A must stay byte-for-byte identical.
 const before=hashDir(path.join(P('A'),'Local Storage'));
 ({app,page}=await launch(P('D'),P('A')));
 // A fresh profile opens the class settings dialog by itself; the recovery button is inside it.
 await page.waitForSelector('#settingsDialog[open]');await page.click('#recoveryFind');await page.waitForTimeout(500);await page.click('#recoveryFolder');await page.waitForSelector('#recoveryList .recovery-item');
 ok('다른 폴더(Local Storage) 읽기·요약',(await page.innerText('#recoveryList')).includes('선택한 폴더')&&(await page.innerText('#recoveryList')).includes('5학년 3반'));
 await page.click('#recoveryList .recovery-item button');await page.waitForSelector('#backupConfirmDialog[open]');await page.click('#backupConfirmDialog button[value=restore]');
 await page.waitForTimeout(2500);await page.waitForLoadState('domcontentloaded');await page.waitForTimeout(800);
 const now=await dump(page);const keys=Object.keys(USER);
 ok('가져온 뒤 화면을 실제로 다시 불러옴',(await page.innerText('#morning'))==='복구 확인: 독서 20분'&&await page.evaluate(()=>!window.dashboardRestoring));
 ok('다른 폴더에서 가져오기 → 값 동일',keys.every(k=>now[k]===original[k]),keys.filter(k=>now[k]!==original[k]).join(','));
 ok('원본 폴더는 바뀌지 않음',hashDir(path.join(P('A'),'Local Storage'))===before);
 await app.close();
 // The temporary read copy may stay locked while the app runs (Windows); it must be gone after the next start.
 ({app,page}=await launch(P('D')));await page.waitForTimeout(1000);
 ok('임시 읽기 사본은 다음 실행 때까지 정리',!fs.existsSync(path.join(P('D'),'Partitions'))||!fs.readdirSync(path.join(P('D'),'Partitions')).some(f=>f.startsWith('recovery-')));
 ok('가져온 데이터 재실행 후 유지',(await page.innerText('#morning'))==='복구 확인: 독서 20분');
 // Another copy on this PC (registry lookup is Windows-only; stubbed here): shown as a notice, nothing removed.
 ok('다른 설치본이 없으면 안내 없음',await page.evaluate(()=>document.getElementById('installNotice').hidden));
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('install:others');ipcMain.handle('install:others',()=>[{dir:'C:\\Program Files\\classroom-dashboard',version:'1.8.1',allUsers:true}]);});
 await page.reload();
 await page.waitForFunction(()=>{const n=document.getElementById('installNotice');return n&&!n.hidden;},null,{timeout:10000});
 const notice=await page.evaluate(()=>document.getElementById('installNotice')?.textContent||'');
 ok('다른 설치본 안내: 위치·버전·관리자 계정 안내',notice.includes('C:\\Program Files\\classroom-dashboard')&&notice.includes('1.8.1')&&notice.includes('관리자 계정'),notice);
 ok('안내가 상단 상태줄에도 표시',(await page.textContent('#globalStatus')).includes('다른 위치에도 우리 교실'));
 ok('안내 후에도 데이터 유지',(await page.innerText('#morning'))==='복구 확인: 독서 20분');
 await app.close();
 const f=results.filter(r=>!r[1]);console.log(`\n${results.length-f.length}/${results.length} passed`);process.exit(f.length?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
