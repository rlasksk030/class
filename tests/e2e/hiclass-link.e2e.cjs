// HiClass connection UX E2E with a fake www.hiclass.net served inside the HiClass session (no real network).
// Drives the real main-process watcher: login -> class selection -> class home -> note board -> confirmation -> saved.
const path=require('path'),fs=require('fs');
const {_electron}=require('playwright-core');const electronPath=require('electron');
const ROOT=path.resolve(__dirname,'../..'),OUTDIR=path.join(__dirname,'.out'),PROFILE=path.join(OUTDIR,'profile-hiclass');
const results=[];const ok=(n,c,d='')=>{results.push([n,!!c]);console.log((c?'PASS':'FAIL')+' '+n+(d?' — '+d:''));};
const academicYear=()=>{const n=new Date();return String(n.getFullYear()-(n.getMonth()<2?1:0));};
async function launch(answer=1){
 const app=await _electron.launch({executablePath:electronPath,args:['--no-sandbox',path.join(ROOT,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:PROFILE}});
 const page=await app.firstWindow();page.on('dialog',d=>d.accept());await page.waitForLoadState('domcontentloaded');
 await app.evaluate(({session,dialog,ipcMain},answer)=>{
  const pages={'/':'<h1>하이클래스</h1><input type="password"><button>로그인</button>','/main/home':'<h1>내 클래스</h1><a>옥구초등학교 6학년 1반</a>','/main/clazzes/c1':'<strong>옥구초등학교 6학년 1반</strong><a>알림장</a>','/main/clazzes/c1/note/n1':'<strong>옥구초등학교 6학년 1반</strong><h2>알림장</h2>'};
  session.fromPartition('persist:hiclass-teacher').protocol.handle('https',req=>{const u=new URL(req.url);return new Response(`<!doctype html><meta charset="utf-8"><body>${pages[u.pathname]??pages['/']}</body>`,{headers:{'content-type':'text/html; charset=utf-8'}});});
  globalThis.dialogs=[];dialog.showMessageBox=async(w,o)=>{globalThis.dialogs.push({message:o.message,detail:o.detail,buttons:o.buttons});return {response:answer};};
  globalThis.sessionStatus='ok';ipcMain.removeHandler('diary:session');ipcMain.handle('diary:session',async()=>({status:globalThis.sessionStatus}));
 },answer);
 await page.waitForTimeout(500);return {app,page};
}
const hiclassGo=(app,p)=>app.evaluate(({BrowserWindow},p)=>{const w=BrowserWindow.getAllWindows().find(x=>x.getTitle()==='하이클래스 연결'||x.webContents.getURL().includes('hiclass.net'));return w.webContents.loadURL('https://www.hiclass.net'+p);},p);
const waitText=async(page,sel,re,ms=8000)=>{const end=Date.now()+ms;while(Date.now()<end){const t=await page.textContent(sel);if(re.test(t))return t;await page.waitForTimeout(200);}return page.textContent(sel);};
(async()=>{
 fs.rmSync(PROFILE,{recursive:true,force:true});fs.mkdirSync(OUTDIR,{recursive:true});
 let {app,page}=await launch();
 await page.evaluate(()=>{localStorage.setItem('settings',JSON.stringify({grade:'6',classroom:'1'}));localStorage.setItem('dashboardLocked','false');});await page.reload();await page.waitForTimeout(700);
 await page.click('#diaryTab');await page.waitForTimeout(300);
 ok('미연결 상태 표시·버튼 하나',(await page.textContent('#diaryLinkState')).includes('미연결')&&(await page.textContent('#diaryConnect'))==='하이클래스 연결하기'&&(await page.locator('#diaryLink').count())===0);
 await page.click('#diaryConnect');
 ok('① 로그인 안내와 단계 표시',/로그인/.test(await waitText(page,'#diaryLinkMessage',/로그인/))&&await page.isVisible('#diaryLinkSteps')&&(await page.textContent('#diaryLinkSteps li.current')).includes('로그인'));
 ok('연결 진행 중에도 버튼 하나',(await page.locator('.diary-hiclass-line button').count())===1);
 await hiclassGo(app,'/main/home');ok('② 담당 학급 선택 안내',/담당 학급을 선택/.test(await waitText(page,'#diaryLinkMessage',/담당 학급을 선택/))&&(await page.textContent('#diaryLinkSteps li.current')).includes('담당 학급 선택'));
 await hiclassGo(app,'/main/clazzes/c1');const home=await waitText(page,'#diaryLinkMessage',/학급은 확인했습니다/);
 ok('③ 학급 홈만 열면 연결하지 않고 구체적 안내',/학급은 확인했습니다\. 이제 해당 학급의 알림장 게시판을 열어 주세요/.test(home)&&(await app.evaluate(()=>globalThis.dialogs.length))===0,home);
 ok('학급 홈에서는 저장 없음',!fs.existsSync(path.join(PROFILE,'hiclass-links.json'))||!JSON.parse(fs.readFileSync(path.join(PROFILE,'hiclass-links.json'),'utf8')).links[`${academicYear()}:6:1`]);
 await hiclassGo(app,'/main/clazzes/c1/note/n1');const done=await waitText(page,'#diaryLinkMessage',/연결이 완료/);
 const dlg=await app.evaluate(()=>globalThis.dialogs);
 ok('④ 알림장 게시판 자동 감지 → 확인창 1회',dlg.length===1&&dlg[0].message.includes('옥구초등학교 6학년 1반을(를) 찾았습니다')&&dlg[0].message.includes('이 학급에 연결할까요?')&&dlg[0].buttons.join()==='취소,연결하기',JSON.stringify(dlg));
 const saved=JSON.parse(fs.readFileSync(path.join(PROFILE,'hiclass-links.json'),'utf8')).links[`${academicYear()}:6:1`];
 ok('[연결하기] 순간 classKey·게시판 URL·학급명 저장',saved?.url==='https://www.hiclass.net/main/clazzes/c1/note/n1'&&saved?.title==='옥구초등학교 6학년 1반',JSON.stringify(saved));
 ok('완료 메시지',/하이클래스 학급 연결이 완료되었습니다/.test(done));
 ok('연결 완료 후 하이클래스 숨김·대시보드 포커스',await app.evaluate(({BrowserWindow})=>{const all=BrowserWindow.getAllWindows();return all.filter(w=>w.webContents.getURL().includes('hiclass.net')).every(w=>!w.isVisible())&&all.find(w=>w.webContents.getURL().startsWith('file:')).isFocused();}));
 ok('연결 완료 표시·[연결 변경]',(await page.textContent('#diaryLinkState'))==='● 하이클래스 연결됨 · 옥구초등학교 6학년 1반'&&(await page.textContent('#diaryConnect'))==='연결 변경'&&!(await page.isVisible('#diaryLinkSteps'))&&(await page.locator('#diaryLink').count())===0);
 const raw=fs.readFileSync(path.join(PROFILE,'hiclass-links.json'),'utf8');ok('비밀번호·쿠키 저장 없음',!/password|cookie|token/i.test(raw));
 await app.close();
 // Restart: saved link shows as connected; an expired login is the only thing that asks to log in again.
 ({app,page}=await launch());await page.click('#diaryTab');await page.waitForTimeout(600);
 ok('재실행 후에도 "연결됨" 표시',(await page.textContent('#diaryLinkState')).startsWith('● 하이클래스 연결됨')&&(await page.textContent('#diaryConnect'))==='연결 변경');
 await app.evaluate(()=>{globalThis.sessionStatus='expired';});await app.close();
 ({app,page}=await launch());await app.evaluate(()=>{globalThis.sessionStatus='expired';});await page.click('#diaryTab');await page.waitForTimeout(600);
 ok('로그인 만료 시에만 다시 로그인 안내',(await page.textContent('#diaryLinkState'))==='하이클래스 로그인이 만료되었습니다. 다시 로그인해 주세요.'&&(await page.textContent('#diaryConnect'))==='다시 로그인');
 await app.close();
 // Cancel in the confirmation: nothing saved for another class.
 fs.rmSync(path.join(PROFILE,'hiclass-links.json'),{force:true});
 ({app,page}=await launch(0));await page.click('#diaryTab');await page.click('#diaryConnect');await page.waitForTimeout(500);await hiclassGo(app,'/main/clazzes/c1/note/n1');
 const cancel=await waitText(page,'#diaryLinkMessage',/취소/);ok('확인창 [취소] 시 저장 안 함',/연결을 취소했습니다/.test(cancel)&&!fs.existsSync(path.join(PROFILE,'hiclass-links.json')));
 await page.click('#diaryConnect');await waitText(page,'#diaryLinkMessage',/연결을 취소했습니다/);ok('[하이클래스 연결하기]로 다시 확인창',(await app.evaluate(()=>globalThis.dialogs.length))===2);
 await app.close();
 const f=results.filter(r=>!r[1]);console.log(`\n${results.length-f.length}/${results.length} passed`);process.exit(f.length?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
