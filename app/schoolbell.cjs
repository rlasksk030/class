// Manual handoff only. No remote DOM injection, API posting, credential extraction or retry loop.
const {BrowserWindow,ipcMain,dialog,clipboard,shell} = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const services = require('./diary-services.cjs');
const {bounded} = require('./hiclass-navigation.cjs');
module.exports = function setup(main) {
 const profile = require('./school-profile.cjs').get(), store = services.createStore(profile);
 const windows = new Map(); let busy = false;
 const expectedSchool = () => profile.config.active?.school.SCHUL_NM || require('./school.js').legacy.SCHUL_NM;
 const message = '학교종이 작업을 마치지 못했습니다. 초안과 사진은 유지됩니다. 게시 여부는 학교종이에서 확인해 주세요.';
 const allowed = e => e.sender === main()?.webContents && e.senderFrame === e.sender.mainFrame;
 function handle(name, fn) {
  ipcMain.handle(name, async (e, value) => {
   if (!allowed(e)) throw Error('접근 불가');
   if (busy) return {status:'busy',message:'진행 중인 확인을 마친 뒤 다시 시도해 주세요.'};
   busy = true;
   try { return await fn(value); }
   catch (error) { return {status:'error',message: error.schoolbellUserMessage || message}; }
   finally { busy = false; }
  });
 }
 function fail(text) { const error = Error(text); error.schoolbellUserMessage = text; throw error; }
 const status = key => {
  const row = store.get(key);
  return {service:row.service,link:row.schoolbell ? {confirmation:row.schoolbell.confirmation} : null,
   automatic:false,posts:Object.entries(row.posts).map(([hash,p])=>({hash,...p}))};
 };
 async function open(key) {
  services.classKey(key);
  for (const [other,w] of windows) if (other !== key && !w.isDestroyed()) w.close();
  let w = windows.get(key);
  if (!w || w.isDestroyed()) {
   w = new BrowserWindow({width:1200,height:850,title:'학교종이 · 직접 로그인 / 수동 발행',
    webPreferences:{partition:services.partition(profile.id,'schoolbell',key),contextIsolation:true,nodeIntegration:false,sandbox:true}});
   windows.set(key,w); w.removeMenu();
   w.on('closed',()=>windows.delete(key));
   w.webContents.on('did-fail-load',(_e,code,_description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3)w.schoolbellLoadFailed=true;});
   w.webContents.on('did-finish-load',()=>{w.schoolbellLoadFailed=false;});
   w.webContents.session.setPermissionRequestHandler((_wc,_permission,done)=>done(false));
   w.webContents.session.setPermissionCheckHandler(()=>false);
   const navigate = (event,url) => { try { services.safeURL(url); } catch { event.preventDefault(); } };
   w.webContents.on('will-navigate',navigate); w.webContents.on('will-redirect',navigate);
   w.webContents.setWindowOpenHandler(({url})=>{
    try { services.safeURL(url); void w.loadURL(url).catch(()=>{}); } catch {}
    return {action:'deny'};
   });
   try { await bounded(()=>w.loadURL(store.get(key).schoolbell?.url || services.HOME),20000,()=>{if(!w.isDestroyed())w.webContents.stop();}); }
   catch(error) { w.schoolbellLoadFailed=true;throw error; }
  } else if(w.schoolbellLoadFailed) {
   await bounded(()=>w.loadURL(store.get(key).schoolbell?.url || services.HOME),20000,()=>{if(!w.isDestroyed())w.webContents.stop();});
  }
  w.show(); w.focus(); return w;
 }
 function target(value) {
  if (!value || !/^[1-6]$/.test(value.grade) || typeof value.classroom !== 'string' ||
      !/^[가-힣a-zA-Z0-9][가-힣a-zA-Z0-9 -]{0,23}$/.test(value.classroom) ||
      !/^\d{4}$/.test(value.year) || value.classKey !== [value.year,value.grade,value.classroom].join(':'))
   fail('우리 교실의 학년·반 설정을 확인해 주세요.');
  return value;
 }
 handle('diary-service:status',key=>status(key));
 handle('diary-service:select',({classKey,service})=>{
  store.select(classKey,service);
  for (const w of windows.values()) if (!w.isDestroyed()) w.close();
  return status(classKey);
 });
 handle('schoolbell:open',async value=>{
  const to=target(value); await open(to.classKey);
  return {status:'manual',message:'학교종이에서 직접 로그인 → 담당 학급 → 알림장을 여세요. 돌아와 학교·학급을 확인해 주세요. 로그인 및 교사 권한은 자동 확인하지 않습니다.'};
 });
 handle('schoolbell:link',async value=>{
  const to=target(value), w=windows.get(to.classKey);
  if (!w || w.isDestroyed() || w.schoolbellLoadFailed) fail('학교종이 창을 먼저 열고 담당 학급의 알림장으로 이동해 주세요.');
  if (!services.matchTarget({schoolName:expectedSchool(),grade:to.grade,classroom:to.classroom},to.observed||{}))
   fail('학교 또는 학년·반이 우리 교실 설정과 다릅니다. 담당 학급을 다시 확인해 주세요.');
  let url;
  try { url=services.safeURL(w.webContents.getURL(),true); } catch(e) { fail(e.message); }
  const answer=await dialog.showMessageBox(main(),{type:'question',buttons:['취소','직접 확인했습니다'],defaultId:0,cancelId:0,
   message:'학교종이 담당 학급을 직접 확인하셨나요?',
   detail:expectedSchool()+' '+to.grade+'학년 '+to.classroom+'반\n학교종이의 학교명·학급명, 담임 권한, 알림장 게시판을 직접 확인한 경우에만 진행하세요.\n앱에서 로그인·학급 일치 여부를 자동 검증하지 않습니다.'});
  if(answer.response!==1) return {status:'cancelled',message:'학급 확인을 취소했습니다.'};
  if(w.isDestroyed() || w.webContents.getURL()!==url) fail('학교종이 화면이 바뀌었습니다. 담당 학급을 다시 확인해 주세요.');
  store.link(to.classKey,url);
  return {status:'manual-linked',message:'담당 학급 직접 확인 기록을 저장했습니다. 수동 발행만 사용할 수 있습니다.',...status(to.classKey)};
 });
 handle('schoolbell:prepare',async value=>{
  const note=services.payload(value);
  for(const ref of note.photos) await require('./media.cjs').current().read(ref);
  const row=store.get(note.classKey);
  if(!row.schoolbell) fail('학교종이 창에서 담당 학급을 먼저 확인해 주세요.');
  const answer=await dialog.showMessageBox(main(),{type:'question',buttons:['취소','수동 발행 준비'],defaultId:0,cancelId:0,
   message:'학교종이에서 직접 작성하고 발행합니다.',
   detail:expectedSchool()+' · '+note.classKey+'\n'+note.date+' · 사진 '+note.photos.length+'장\n학교·학급과 기존 게시물을 먼저 확인하세요. 앱은 자동 전송하지 않습니다. 중단되면 게시 여부를 확인하기 전까지 다시 준비하지 않습니다.'});
  if(answer.response!==1) return {status:'cancelled',message:'수동 발행 준비를 취소했습니다. 초안은 유지됩니다.'};
  const result=store.prepare(note);
  if(result.blocked) return {...result,message:'같은 내용의 기록 또는 결과 미확인 건이 있습니다. 학교종이에서 확인한 뒤 아래에서 결과를 기록해 주세요.'};
  // Persist before opening the remote page: a closed window/network error never loses the pending marker.
  await open(note.classKey);
  return {...result,message:'수동 발행 준비됨 · 제목/본문을 복사하고 사진을 직접 첨부하세요. 실제 발행 후 결과를 기록해 주세요.'};
 });
 handle('schoolbell:copy',({note,part})=>{
  const p=services.payload(note),hash=services.fingerprint(profile.id,'schoolbell',p),row=store.get(p.classKey);
  if(row.service!=='schoolbell'||row.posts[hash]?.status!=='manual-pending') fail('현재 초안으로 수동 발행 준비를 먼저 해 주세요. 내용을 바꿨다면 이전 건의 결과부터 확인해 주세요.');
  if(!['title','body'].includes(part)) fail('복사할 항목을 확인해 주세요.');
  clipboard.writeText(p[part]);
  return {status:'copied',message:(part==='title'?'제목':'본문')+' 복사됨 · 앱은 게시 결과를 확인하지 않습니다.'};
 });
 handle('schoolbell:photos',async note=>{
  const p=services.payload(note),hash=services.fingerprint(profile.id,'schoolbell',p),row=store.get(p.classKey);
  if(row.service!=='schoolbell'||row.posts[hash]?.status!=='manual-pending') fail('현재 초안으로 수동 발행 준비를 먼저 해 주세요.');
  if(!p.photos.length) fail('첨부할 사진이 없습니다.');
  const bytes=await Promise.all(p.photos.map(ref=>require('./media.cjs').current().read(ref)));
  const choice=await dialog.showOpenDialog(main(),{title:'학교종이에 직접 첨부할 사진 저장 위치',properties:['openDirectory','createDirectory']});
  if(choice.canceled||!choice.filePaths[0]) return {status:'cancelled',message:'사진 내보내기를 취소했습니다. 원본 사진은 유지됩니다.'};
  // Dedicated new directory, generated filenames and exclusive writes: never overwrite a user's file.
  const dir=await fs.mkdtemp(path.join(choice.filePaths[0],'schoolbell-photos-'));
  for(let i=0;i<bytes.length;i++) await fs.writeFile(path.join(dir,String(i+1).padStart(2,'0')+'.'+p.photos[i].id.split('.').at(-1)),bytes[i],{flag:'wx',mode:0o600});
  const error=await shell.openPath(dir);
  return {status:'exported',message:'사진 '+bytes.length+'장을 01번부터 순서대로 저장했습니다. 학교종이에 직접 첨부하고 개수와 순서를 확인하세요.'+(error?' 선택한 저장 위치에서 폴더를 열어 주세요.':'')};
 });
 handle('schoolbell:resolve',async ({classKey,hash,outcome})=>{
  const row=store.get(classKey),post=row.posts[hash];
  if(!post||post.status!=='manual-pending') fail('확인할 수동 발행 기록이 없습니다.');
  if(!['manual-confirmed','manual-not-posted'].includes(outcome)) fail('실제 게시 결과를 확인해 주세요.');
  const yes=outcome==='manual-confirmed';
  const answer=await dialog.showMessageBox(main(),{type:'question',buttons:['취소',yes?'게시 확인 기록':'미게시 확인 기록'],defaultId:0,cancelId:0,
   message:yes?'학교종이에서 실제 게시물을 확인하셨나요?':'학교종이에서 게시되지 않은 것을 확인하셨나요?',
   detail:expectedSchool()+' · '+classKey+'\n'+post.date+' · 사진 '+post.photoCount+'장\n'+(yes?'대상 학급, 본문, 사진 개수·순서까지 확인하세요. 사용자 확인 기록으로 저장되며 서버 검증 성공이 아닙니다.':'이미 게시되었는지 불확실하면 취소하세요. 미게시 확인 후에만 다시 준비할 수 있습니다.')});
  if(answer.response!==1)return {status:'cancelled',message:'결과 확인을 취소했습니다. 재발행은 계속 차단됩니다.'};
  const result=store.resolve(classKey,hash,outcome);
  return {...result,message:yes?'수동 게시 · 사용자 확인 기록을 저장했습니다. 초안과 사진은 보존됩니다.':'미게시 확인을 기록했습니다. 초안으로 다시 준비할 수 있습니다.'};
 });
 // Explicit IPC guard as well as disabled UI; no settings flag can enable unverified automatic posting.
 handle('schoolbell:publish',()=>({status:'blocked',message:'학교종이 자동 등록은 공식 허용 방식과 실제 검증 전까지 사용할 수 없습니다.'}));
 return () => !busy && [...windows.values()].every(w=>w.isDestroyed());
};
