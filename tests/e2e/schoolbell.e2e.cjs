// Schoolbell (학교종이) automatic registration E2E.
// The real app (main, preload, editor) runs against the synthetic site in tests/schoolbell-site.cjs.
// No real network, credentials, students or publication.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {_electron}=require('playwright-core'),site=require('../schoolbell-site.cjs');
const ROOT=path.resolve(__dirname,'../..'),PROFILE=fs.mkdtempSync(path.join(os.tmpdir(),'schoolbell-e2e-'));
const results=[];
const ok=(name,condition,detail='')=>{results.push([name,!!condition]);console.log((condition?'PASS':'FAIL')+' '+name+(condition||!detail?'':' — '+detail));};
const BOARD='https://schoolbell-e.com/ko/main/group/100/boards/classnews';
const year=()=>{const n=new Date();return String(n.getFullYear()-(n.getMonth()<2?1:0));};
const KEY=()=>year()+':6:1';
let app,page;
// Playwright also watches the background window and tries to answer a confirm() that the app has
// already suppressed; that harness-only protocol error is not an app failure.
process.on('unhandledRejection',error=>{if(/No dialog is showing/.test(String(error?.message)))return;console.error(error);process.exit(1);});

async function launch({loggedIn=false,posts=[]}={}){
 app=await _electron.launch({executablePath:require('electron'),args:['--no-sandbox',path.join(ROOT,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:PROFILE}});
 page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
 await app.evaluate(site.install,site.html);
 await app.evaluate(({dialog,ipcMain,shell},state)=>{
  Object.assign(globalThis.sb,state);
  ipcMain.removeHandler('fetch');ipcMain.handle('fetch',()=>{throw Error('offline fixture');});
  globalThis.dialogs=[];globalThis.answer=1;
  dialog.showMessageBox=async(_w,o)=>{globalThis.dialogs.push({message:o.message,detail:o.detail,buttons:o.buttons});return {response:globalThis.answer};};
  const fs=process.mainModule.require('node:fs'),path=process.mainModule.require('node:path'),os=process.mainModule.require('node:os');
  globalThis.exportDir=fs.mkdtempSync(path.join(os.tmpdir(),'schoolbell-export-'));
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[globalThis.exportDir]});shell.openPath=async()=>'';
  // Short waits for the failure cases; the flow itself is unchanged.
  globalThis.schoolbellTestTimeouts={composer:3000,settle:3000,dialog:3000,result:3000,verify:3000};
 },{loggedIn,posts});
 await page.evaluate(()=>{localStorage.setItem('settings',JSON.stringify({grade:'6',classroom:'1'}));localStorage.setItem('dashboardLocked','false');});
 await page.reload();await page.click('#diaryTab');await ready();
}
const ready=()=>page.waitForFunction(()=>!document.querySelector('#diaryService').disabled&&document.querySelector('#schoolbellPublish').textContent==='학교종이 등록',null,{timeout:60000});
const main=(fn,arg)=>app.evaluate(fn,arg);
const sb=()=>main(()=>({loggedIn:globalThis.sb.loggedIn,posts:globalThis.sb.posts,publishes:globalThis.sb.publishes,scheduled:globalThis.sb.scheduled,clicks:globalThis.sb.clicks,last:globalThis.sb.lastPublish}));
const config=value=>main((_,value)=>{globalThis.sb.config=value;globalThis.sb.clicks=[];},value);
const dialogs=()=>main(()=>globalThis.dialogs);
const answer=value=>main((_,value)=>{globalThis.answer=value;},value);
const windows=()=>main(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>!w.webContents.getURL().startsWith('file:')).map(w=>({url:w.webContents.getURL(),visible:w.isVisible()})));
const visibleGo=url=>main(({BrowserWindow},url)=>BrowserWindow.getAllWindows().find(w=>w.isVisible()&&!w.webContents.getURL().startsWith('file:')).webContents.loadURL(url).then(()=>true,e=>e.message),url);
const visibleRun=code=>main(({BrowserWindow},code)=>BrowserWindow.getAllWindows().find(w=>w.isVisible()&&!w.webContents.getURL().startsWith('file:')).webContents.executeJavaScript(code),code);
const stored=()=>JSON.parse(fs.readFileSync(path.join(PROFILE,'diary-services.json'),'utf8')).classes[KEY()];
const status=()=>page.textContent('#diaryStatus');
const waitText=async(selector,re,ms=10000)=>{const end=Date.now()+ms;let text='';while(Date.now()<end){text=await page.textContent(selector);if(re.test(text))return text;await page.waitForTimeout(150);}return text;};
async function write(title,body){await page.fill('#diaryTitle',title);await page.fill('#diaryBody',body);}
async function register(){await ready();await page.click('#schoolbellPublish');await page.waitForTimeout(150);await ready();return status();}
async function addPhotos(count,seed){
 const images=await main(({nativeImage},{count,seed})=>Array.from({length:count},(_,i)=>[...nativeImage.createFromBitmap(Buffer.from([seed+i*37,80,120,255]),{width:1,height:1}).toPNG()]),{count,seed});
 const before=await page.locator('#diaryPhotos figure').count();
 for(const [i,bytes] of images.entries())await page.locator('#diaryPhotoFiles').setInputFiles({name:'fixture-'+seed+'-'+i+'.png',mimeType:'image/png',buffer:Buffer.from(bytes)});
 await page.waitForFunction(n=>document.querySelectorAll('#diaryPhotos figure').length===n,before+count);
}
const draftPhotos=()=>page.evaluate(()=>{const drafts=JSON.parse(localStorage.getItem('diaryDrafts'));const key=Object.keys(drafts).find(k=>k.endsWith(':'+document.querySelector('#diaryDate').value));return (drafts[key].photos||[]).map(p=>p.id);});
const records=()=>Object.values(stored().automaticPosts||{});
// Samples every window that is not the dashboard: none may be shown or focused during a registration.
const watch=()=>main(({BrowserWindow})=>{globalThis.seen=[];clearInterval(globalThis.sampler);globalThis.sampler=setInterval(()=>{for(const w of BrowserWindow.getAllWindows()){if(w.webContents.getURL().startsWith('file:'))continue;if(w.isVisible())globalThis.seen.push('visible');if(w.isFocused())globalThis.seen.push('focused');}},30);});
const watched=()=>main(()=>{clearInterval(globalThis.sampler);return globalThis.seen;});

(async()=>{
 await launch();
 // ----- service selection -----
 ok('기본 발행 서비스는 하이클래스',await page.inputValue('#diaryService')==='hiclass'&&!await page.locator('#diarySchoolbell').isVisible());
 await write('연결 전 제목','연결 전 본문');
 await page.selectOption('#diaryService','schoolbell');await ready();
 ok('학교종이 선택: 연결 줄·버튼 하나, 하이클래스 컨트롤 숨김',await page.locator('#diarySchoolbell').isVisible()&&!await page.locator('#diaryHiclass').isVisible()&&
  !await page.locator('#diaryPublish').isVisible()&&!await page.locator('#diaryParents').isVisible()&&await page.locator('#schoolbellPublish').isVisible()&&
  (await page.locator('#diarySchoolbell .diary-hiclass-line button:visible').count())===1);
 ok('미연결 표시',(await page.textContent('#schoolbellLinkState'))==='○ 학교종이 미연결'&&(await page.textContent('#schoolbellConnect'))==='학교종이 연결하기');
 ok('서비스 전환 후 공통 초안 유지',await page.inputValue('#diaryBody')==='연결 전 본문');
 ok('연결 전 등록은 안내만 하고 창을 만들지 않음',/먼저 연결/.test(await register())&&(await windows()).length===0&&(await sb()).publishes===0);

 // ----- connection -----
 await page.click('#schoolbellConnect');
 ok('① 연결 창 열림·로그인 안내·단계 표시',/로그인/.test(await waitText('#schoolbellMessage',/로그인/))&&await page.isVisible('#schoolbellSteps')&&
  (await windows()).some(w=>w.visible&&w.url==='https://schoolbell-e.com/ko/main'));
 await visibleRun('document.querySelector("#toLogin").click()');
 ok('로그인 화면에서는 1단계',/학교종이 창에서 로그인/.test(await waitText('#schoolbellMessage',/학교종이 창에서 로그인/))&&(await page.textContent('#schoolbellSteps li.current')).includes('로그인'));
 await visibleRun('document.querySelector("#loginButton").click()');
 ok('② 로그인 후 학급 알림장 안내',/담당 학급페이지의 알림장/.test(await waitText('#schoolbellMessage',/담당 학급페이지/))&&(await page.textContent('#schoolbellSteps li.current')).includes('학급 알림장 열기'));
 await visibleGo('https://schoolbell-e.com/ko/main/group/100/settings/studentlist');
 ok('학급페이지의 다른 화면은 연결하지 않음',/이 학급의 알림장을 열어 주세요/.test(await waitText('#schoolbellMessage',/이 학급의 알림장/))&&(await dialogs()).length===0&&!fs.existsSync(path.join(PROFILE,'diary-services.json'))||!stored()?.schoolbellLink);
 await answer(0);
 await visibleGo('https://schoolbell-e.com/ko/main/group/200/boards/classnews');
 const cancelled=await waitText('#schoolbellMessage',/연결을 취소/);let asked=await dialogs();
 ok('다른 학년·반: 확인창에 경고, 취소하면 저장 없음',asked.length===1&&asked[0].message==='5학년 2반 알림장을 찾았습니다.\n이 학급에 연결할까요?'&&/학년·반이 우리 교실 설정과 다릅니다/.test(asked[0].detail)&&
  /연결을 취소/.test(cancelled)&&!stored()?.schoolbellLink,JSON.stringify(asked));
 await answer(1);
 await visibleGo(BOARD);
 await waitText('#schoolbellLinkState',/연결됨/);asked=await dialogs();
 ok('③ 알림장 감지 → "연결할까요?" 한 번',asked.length===2&&asked[1].message==='6학년 1반 알림장을 찾았습니다.\n이 학급에 연결할까요?'&&asked[1].buttons.join()==='취소,연결하기'&&
  !/주의/.test(asked[1].detail)&&asked[1].detail.includes('우리 교실: 옥구초등학교 6학년 1반'),JSON.stringify(asked[1]));
 const link=stored().schoolbellLink;
 ok('게시판 주소·학급 이름·학교명 저장',link.url===BOARD&&link.groupId==='100'&&link.title==='6학년 1반'&&link.schoolName==='옥구초등학교',JSON.stringify(link));
 ok('비밀번호·쿠키·토큰 저장 없음',!/password|cookie|token/i.test(fs.readFileSync(path.join(PROFILE,'diary-services.json'),'utf8')));
 ok('연결 후 창을 닫고 우리 교실로 복귀',(await windows()).length===0&&await main(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('file:')).isVisible()));
 ok('연결됨 표시·[연결 변경]',(await page.textContent('#schoolbellLinkState'))==='● 학교종이 연결됨 · 옥구초등학교 6학년 1반'&&(await page.textContent('#schoolbellConnect'))==='연결 변경'&&!await page.isVisible('#schoolbellSteps'));

 // ----- registration: 0 / 1 / 2 photos -----
 const today=await page.inputValue('#diaryDate'),defaultTitle=await page.evaluate(()=>{const d=new Date(document.querySelector('#diaryDate').value+'T12:00:00');return (d.getMonth()+1)+'월 '+d.getDate()+'일 '+['일','월','화','수','목','금','토'][d.getDay()]+'요일 알림장';});
 await write('사진 없는 알림장','첫 줄 한글\n\n  들여쓴 셋째 줄\n넷째 줄');
 await watch();
 let message=await register(),server=await sb(),seen=await watched();
 ok('사진 0장: 등록 성공',/학교종이 등록 완료 · 새 초안/.test(message)&&server.publishes===1&&server.posts[0].title==='사진 없는 알림장',message);
 ok('본문 한글·빈 줄·공백 그대로 입력',server.posts[0].html==='<p>첫 줄 한글<br><br>&nbsp; 들여쓴 셋째 줄<br>넷째 줄</p>'||server.posts[0].html==='<p>첫 줄 한글<br><br>  들여쓴 셋째 줄<br>넷째 줄</p>',server.posts[0].html);
 ok('보내기는 trusted 클릭 한 번',server.clicks.length===1&&server.clicks[0].trusted===true,JSON.stringify(server.clicks));
 ok('등록 중 학교종이 창은 보이지도 포커스를 갖지도 않음',seen.length===0&&(await windows()).length===0,JSON.stringify(seen.slice(0,5)));
 ok('성공 후 변경 없는 초안만 비움',await page.inputValue('#diaryTitle')===defaultTitle&&await page.inputValue('#diaryBody')==='');
 let history=await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('diaryRegistrationHistory')||'{}')).flat());
 ok('등록 이력 저장',history.length===1&&history[0].service==='schoolbell'&&history[0].status==='success'&&history[0].title==='사진 없는 알림장'&&/^[a-f0-9]{64}$/.test(history[0].hash));
 let record=records();
 ok('성공 기록에 게시물 ID 저장',record.length===1&&record[0].status==='auto-success'&&record[0].receipt.postId==='601'&&record[0].receipt.boardId==='100'&&record[0].receipt.photoCount===0,JSON.stringify(record));
 const trace=fs.readFileSync(path.join(PROFILE,'schoolbell-last-run.json'),'utf8');
 ok('진단 기록에 본문·제목 없음',JSON.parse(trace).outcome==='success'&&!trace.includes('사진 없는')&&!trace.includes('첫 줄'));

 await write('사진 한 장','사진 1장 본문');await addPhotos(1,10);
 let ids=await draftPhotos();
 message=await register();server=await sb();
 ok('사진 1장: 업로드·게시 확인 후 성공',/학교종이 등록 완료/.test(message)&&server.posts[0].files.join()==='사진01.png'&&server.posts[0].hashes[0]===ids[0].split('.')[0],message+' '+JSON.stringify(server.posts[0]));
 ok('사진 초안 비움·원본 파일 보존',(await page.locator('#diaryPhotos figure').count())===0&&fs.existsSync(path.join(PROFILE,'media',ids[0])));

 await write('사진 두 장','사진 2장 본문');await addPhotos(2,60);
 ids=await draftPhotos();
 await config({landSchoolnews:true});
 message=await register();server=await sb();
 ok('사진 2장: 순서 유지 (게시 후 schoolnews로 이동해도 확인)',/학교종이 등록 완료/.test(message)&&server.posts[0].files.join()==='사진01.png,사진02.png'&&
  server.posts[0].hashes.join()===ids.map(id=>id.split('.')[0]).join(),message+' '+JSON.stringify(server.posts[0]));
 await config({});

 // ----- edits made during a registration are kept -----
 await write('등록 중 수정','처음 본문');
 await ready();await page.click('#schoolbellPublish');await page.fill('#diaryBody','처음 본문\n등록 중 추가');
 await page.waitForTimeout(150);await ready();
 ok('등록 중 추가한 내용 보존',/추가하거나 바꾼 내용은 유지/.test(await status())&&await page.inputValue('#diaryBody')==='처음 본문\n등록 중 추가'&&(await sb()).posts[0].html==='<p>처음 본문</p>',await status());

 // ----- duplicates -----
 await write('사진 없는 알림장','첫 줄 한글\n\n  들여쓴 셋째 줄\n넷째 줄');
 let before=(await sb()).publishes;
 ok('같은 내용 재등록 차단 (기존 해시)',/이미 등록한 내용/.test(await register())&&(await sb()).publishes===before);
 await main(()=>{globalThis.sb.posts.unshift({id:'900',groupId:'100',title:'학교종이에만 있는 글',html:'<p>같은 본문</p>',files:[]});});
 await write('학교종이에만 있는 글','같은 본문');
 let count=records().length;
 ok('학교종이에 같은 글이 있으면 중복 등록 안 함',/이미 있습니다/.test(await register())&&(await sb()).publishes===before&&records().length===count&&await page.inputValue('#diaryBody')==='같은 본문');

 // ----- the page is not what we expect: stop before sending, keep the draft -----
 const stopped=async(name,settings,pattern,photosKept=0)=>{
  await config(settings);const n=(await sb()).publishes,r=records().length;
  const text=await register();
  ok(name,pattern.test(text)&&(await sb()).publishes===n&&records().length===r&&await page.inputValue('#diaryTitle')==='중단 시험'&&(await page.locator('#diaryPhotos figure').count())===photosKept&&(await windows()).length===0,text);
 };
 await write('중단 시험','초안은 남아야 합니다');
 await stopped('구조 변경(제목 입력란): 고정 문구로 중단',{changedStructure:true},/학교종이 화면이 바뀌어 등록하지 못했습니다/);
 await stopped('작성하기 버튼 없음: 중단',{noWriteButton:true},/학교종이 화면이 바뀌어 등록하지 못했습니다/);
 await stopped('학교종이에 작성 중인 글: 덮어쓰지 않고 중단',{existingDraft:true},/작성 중인 글이 있어 등록하지 않았습니다/);
 await stopped('임시저장 복원 안내창: 중단',{restoreDialog:true},/작성 중인 글이 있어 등록하지 않았습니다/);
 await addPhotos(1,150);
 await stopped('사진 업로드 실패: 중단, 사진 보존',{uploadFail:true},/사진 업로드를 확인하지 못해 등록하지 않았습니다/,1);
 await page.click('#diaryPhotos button[aria-label="사진 1 삭제"]');
 await config({});

 // ----- sent but not confirmed: pending, no resend until the teacher decides -----
 await config({postMissing:true});
 before=(await sb()).publishes;
 message=await register();
 ok('게시 결과 미확인: 초안 보존·재전송 없음',/게시 결과를 확인하지 못했습니다/.test(message)&&(await sb()).publishes===before+1&&await page.inputValue('#diaryTitle')==='중단 시험'&&
  records().some(p=>p.status==='auto-uncertain'),message);
 ok('미확인 안내와 [게시됨]/[게시 안 됨] 표시',await page.locator('#schoolbellUnresolved').isVisible()&&(await page.locator('#schoolbellUnresolved button').allTextContents()).join()==='게시됨,게시 안 됨');
 await config({});
 await write('다른 내용','미확인 건이 있으면 보내지 않습니다');
 ok('미확인 기록이 있으면 다른 내용도 등록 차단',/이전 등록 결과가 확인되지 않았습니다/.test(await register())&&(await sb()).publishes===before+1);
 count=(await dialogs()).length;
 await page.locator('#schoolbellUnresolved button',{hasText:'게시 안 됨'}).click();await page.waitForTimeout(150);await ready();
 ok('[게시 안 됨] 선택 후 다시 등록 가능',(await dialogs()).length===count+1&&!await page.locator('#schoolbellUnresolved').isVisible()&&records().some(p=>p.status==='auto-user-not-posted')&&
  /학교종이 등록 완료/.test(await register()));
 await config({postAltered:true});
 await write('내용이 달라진 글','보낸 본문');
 message=await register();
 ok('게시된 글의 본문이 다르면 성공 처리하지 않음',/게시 결과를 확인하지 못했습니다/.test(message)&&await page.inputValue('#diaryBody')==='보낸 본문',message);
 await config({});
 await page.locator('#schoolbellUnresolved button',{hasText:'게시됨'}).first().click();await page.waitForTimeout(150);await ready();
 before=(await sb()).publishes;
 ok('[게시됨] 선택 후 같은 내용 재등록 차단',records().some(p=>p.status==='auto-user-confirmed')&&/이미 등록한 내용/.test(await register())&&(await sb()).publishes===before);
 const unresolved=async(name,settings,check=()=>true)=>{
  await config(settings);
  const text=await register(),state=await sb();
  ok(name,/게시 결과를 확인하지 못했습니다/.test(text)&&check(state)&&records().some(p=>p.status==='auto-uncertain'),text+' '+JSON.stringify(state.clicks));
  await config({});
  await page.locator('#schoolbellUnresolved button',{hasText:'게시 안 됨'}).first().click();await page.waitForTimeout(150);await ready();
 };
 await write('결과 화면 없음','보내기 뒤 화면이 그대로');
 await unresolved('보내기 뒤 완료 화면이 없으면 미확인',{swallow:true});
 before=(await sb()).publishes;
 await write('알 수 없는 확인창','확인창 내용이 다름');
 await unresolved('알 수 없는 확인창은 누르지 않고 미확인',{unknownDialog:true},state=>state.publishes===before&&state.clicks.filter(c=>c.dialog).length===0);
 count=(await dialogs()).length;
 await write('브라우저 확인창','confirm 사용');
 await unresolved('브라우저 확인창(confirm)은 창을 띄우지 않고 미확인',{nativeConfirm:true},state=>state.publishes===before);

 // ----- the service's own confirmation, send dropdown, recipients -----
 await config({confirm:true});
 await write('확인창 있는 등록','학교종이 확인창');
 message=await register();server=await sb();
 ok('학교종이 확인창: trusted 클릭으로 [확인] 후 성공',/학교종이 등록 완료/.test(message)&&server.clicks.length===2&&server.clicks.every(c=>c.trusted)&&server.clicks[1].dialog===true,message+JSON.stringify(server.clicks));
 await config({scheduledDefault:true});
 await write('예약이 기본인 화면','즉시발행으로 바꿔 보냄');
 message=await register();server=await sb();
 ok('예약발행이 선택돼 있으면 즉시발행으로 바꿔 등록',/학교종이 등록 완료/.test(message)&&server.last.mode==='now'&&server.scheduled===0,message);
 await config({modeOnlyWhenOpen:true});
 await write('메뉴를 열어야 보이는 발행 방식','드롭다운 확인');
 message=await register();
 ok('발행 방식이 메뉴 안에만 있어도 확인 후 등록',/학교종이 등록 완료/.test(message)&&(await sb()).last.mode==='now',message);
 await config({studentOffByDefault:true});
 await write('기본 선택 그대로','수신대상 기본 선택');
 message=await register();
 ok('수신대상 기본 선택: 학교종이 작성 화면 선택을 바꾸지 않음',/학교종이 등록 완료/.test(message)&&(await sb()).last.roles.student===false&&(await sb()).last.roles.guardian1===true&&!stored().schoolbellRecipients,message);
 await page.selectOption('#schoolbellRecipientMode','custom');
 await page.locator('#schoolbellGuardian2').uncheck();
 await waitText('#diaryStatus',/수신대상을 저장/);
 ok('직접 선택한 수신대상을 학급별로 저장',JSON.stringify(stored().schoolbellRecipients)==='{"guardian1":true,"guardian2":false,"student":true}');
 await write('수신대상 직접 선택','보호자2 제외, 학생 포함');
 message=await register();server=await sb();
 ok('직접 선택: 적용 후 다시 열어 대조하고 등록',/학교종이 등록 완료/.test(message)&&server.last.roles.guardian1&&!server.last.roles.guardian2&&server.last.roles.student&&server.last.roles.administrator,message+JSON.stringify(server.last?.roles));
 await config({targetsApplyLive:true});
 await write('확인 버튼 없는 수신대상 창','닫기만 있는 경우');
 message=await register();
 ok('수신대상 창에 확인 버튼이 없어도 적용·대조',/학교종이 등록 완료/.test(message)&&(await sb()).last.roles.guardian2===false,message);
 await config({targetsIgnored:true});
 await write('수신대상 적용 실패','적용되지 않으면 보내지 않음');
 before=(await sb()).publishes;
 message=await register();
 ok('수신대상이 적용되지 않으면 보내지 않음',/수신대상을 학교종이에 적용하지 못해 등록하지 않았습니다/.test(message)&&(await sb()).publishes===before&&await page.inputValue('#diaryTitle')==='수신대상 적용 실패',message);
 await config({});
 await page.selectOption('#schoolbellRecipientMode','default');await waitText('#diaryStatus',/수신대상을 저장/);
 ok('기본 선택으로 되돌리면 저장값 제거',!stored().schoolbellRecipients&&!await page.locator('#schoolbellGuardian1').isVisible());
 await config({noPostIds:true});
 await write('게시물 ID가 없는 목록','ID 없이도 내용으로 확인');
 message=await register();
 ok('게시물 ID를 못 얻어도 내용 일치로 성공',/학교종이 등록 완료/.test(message)&&records().some(p=>p.status==='auto-success'&&p.receipt.postId===null),message);
 await config({});

 // ----- manual publishing fallback -----
 await write('직접 발행 제목','직접 발행 본문');await addPhotos(1,200);
 await page.locator('#schoolbellManual > summary').click();
 ok('직접 발행: 준비 전에는 복사 비활성',await page.locator('#schoolbellCopyTitle').isDisabled());
 await page.click('#schoolbellPrepare');await page.waitForTimeout(150);await ready();
 await page.click('#schoolbellCopyTitle');await page.waitForTimeout(150);await ready();
 const copiedTitle=await main(({clipboard})=>clipboard.readText());
 await page.click('#schoolbellCopyBody');await page.waitForTimeout(150);await ready();
 const copiedBody=await main(({clipboard})=>clipboard.readText());
 await page.click('#schoolbellPhotos');await page.waitForTimeout(150);await ready();
 const exported=await main(()=>{const fs=process.mainModule.require('node:fs'),path=process.mainModule.require('node:path');return fs.readdirSync(globalThis.exportDir).flatMap(d=>fs.readdirSync(path.join(globalThis.exportDir,d)));});
 ok('직접 발행: 제목·본문 복사, 사진 순서대로 저장',copiedTitle==='직접 발행 제목'&&copiedBody==='직접 발행 본문'&&exported.join()==='01.png',JSON.stringify([copiedTitle,copiedBody,exported]));
 before=(await sb()).publishes;
 ok('직접 발행 결과 미기록 중에는 자동 등록 차단',/이전 등록 결과가 확인되지 않았습니다/.test(await register())&&(await sb()).publishes===before);
 await page.locator('#schoolbellUnresolved button',{hasText:'게시됨'}).first().click();await page.waitForTimeout(150);await ready();
 ok('직접 발행 결과 기록',Object.values(stored().posts).some(p=>p.status==='manual-confirmed')&&!await page.locator('#schoolbellUnresolved').isVisible());
 await main(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows())if(!w.webContents.getURL().startsWith('file:'))w.destroy();});
 await page.click('#diaryPhotos button[aria-label="사진 1 삭제"]');

 // ----- service switch keeps everything; HiClass is still the same panel -----
 await page.selectOption('#diaryService','hiclass');await ready();
 ok('하이클래스로 되돌리면 하이클래스 화면 그대로',await page.locator('#diaryHiclass').isVisible()&&await page.locator('#diaryPublish').isVisible()&&await page.locator('#diaryParents').isVisible()&&
  !await page.locator('#diarySchoolbell').isVisible()&&!await page.locator('#schoolbellPublish').isVisible()&&(await page.textContent('#diaryConnect'))==='하이클래스 연결하기');
 await page.selectOption('#diaryService','schoolbell');await ready();
 ok('다시 학교종이: 연결 유지',(await page.textContent('#schoolbellLinkState')).startsWith('● 학교종이 연결됨'));
 const posts=(await sb()).posts;
 await app.close();

 // ----- restart: login expired -> "다시 로그인" only -----
 await launch({loggedIn:false,posts});
 ok('재실행: 로그인 만료 표시와 [다시 로그인]',/로그인이 만료/.test(await waitText('#schoolbellLinkState',/만료/))&&(await page.textContent('#schoolbellConnect'))==='다시 로그인');
 await write('만료 중 등록','로그인이 만료된 상태');
 count=records().length;
 ok('만료 상태에서 등록: 로그인 안내, 초안 보존',/로그인이 만료되었습니다/.test(await register())&&records().length===count&&await page.inputValue('#diaryBody')==='로그인이 만료된 상태'&&(await sb()).publishes===0);
 count=(await dialogs()).length;
 await page.click('#schoolbellConnect');
 await waitText('#schoolbellMessage',/로그인/);
 await visibleRun('document.querySelector("#toLogin").click()');await waitText('#schoolbellMessage',/학교종이 창에서 로그인/);
 await visibleRun('document.querySelector("#loginButton").click()');
 await waitText('#schoolbellLinkState',/연결됨/);
 ok('다시 로그인: 묻지 않고 같은 학급으로 복귀',(await dialogs()).length===count&&(await page.textContent('#schoolbellConnect'))==='연결 변경'&&(await windows()).length===0&&/다시 로그인했습니다/.test(await status()),await status());
 message=await register();
 ok('다시 로그인 후 등록 성공',/학교종이 등록 완료/.test(message),message+' '+fs.readFileSync(path.join(PROFILE,'schoolbell-last-run.json'),'utf8').replace(/\s+/g,' '));
 await app.close();

 // ----- restart with a valid login; data written by v1.8.12 stays and blocks -----
 const file=path.join(PROFILE,'diary-services.json'),data=JSON.parse(fs.readFileSync(file,'utf8')),old=year()+':6:2';
 data.classes[old]={service:'schoolbell',posts:{},schoolbell:{url:'https://schoolbell-e.com/ko/main/group/300/boards/classnews',confirmation:'teacher-manual',time:1},
  automaticPosts:{'11111111-1111-4111-8111-111111111111':{hash:'a'.repeat(64),status:'auto-uncertain',stage:'verifying',date:'2026-11-10',photoCount:1,time:2},
   '22222222-2222-4222-8222-222222222222':{hash:'b'.repeat(64),status:'auto-success',stage:'verifying',date:'2026-11-10',photoCount:1,time:3,
    publication:{postId:'77',boardId:'300',attachmentsVerified:true,photos:[{sha256:'c'.repeat(64),bytes:97}],verifiedAt:4}}}};
 fs.writeFileSync(file,JSON.stringify(data));
 await launch({loggedIn:true,posts});
 await page.waitForTimeout(1500);
 ok('재실행: 로그인이 유효하면 연결됨 그대로',(await page.textContent('#schoolbellLinkState'))==='● 학교종이 연결됨 · 옥구초등학교 6학년 1반'&&(await windows()).length===0);
 await page.evaluate(()=>{localStorage.setItem('settings',JSON.stringify({grade:'6',classroom:'2'}));});
 await page.reload();await page.click('#diaryTab');await ready();
 ok('v1.8.12 직접 확인 값만 있는 학급: 다시 연결 필요',(await page.textContent('#schoolbellLinkState'))==='○ 학교종이 다시 연결 필요'&&(await page.textContent('#schoolbellConnect'))==='학교종이 연결하기');
 ok('v1.8.12 미확인 기록 계속 표시',await page.locator('#schoolbellUnresolved').isVisible()&&(await page.locator('#schoolbellUnresolved .schoolbell-history-row').count())===1);
 await write('옛 학급','다시 연결 전');
 ok('다시 연결 전에는 등록하지 않음',/다시 연결/.test(await register())&&(await sb()).publishes===0);
 const kept=JSON.parse(fs.readFileSync(file,'utf8')).classes[old];
 ok('v1.8.12 기록 보존',kept.schoolbell.confirmation==='teacher-manual'&&Object.keys(kept.automaticPosts).length===2&&kept.automaticPosts['22222222-2222-4222-8222-222222222222'].publication.postId==='77');
 await app.close();

 const failed=results.filter(([,passed])=>!passed);
 console.log(`\n학교종이 자동 등록 E2E: ${results.length-failed.length}/${results.length} PASS (합성 사이트, 실서비스 아님)`);
 process.exit(failed.length?1:0);
})().catch(async error=>{console.error(error);try{await app?.close();}catch{}process.exit(1);});
