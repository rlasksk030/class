// Manual handoff remains available. Automatic UI transport is installed behind the code-owned disabled gate.
const {app,BrowserWindow,ipcMain,dialog,clipboard,shell} = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const services = require('./diary-services.cjs');
const capability = require('./schoolbell-capability.cjs');
const connection = require('./schoolbell-window.cjs');
const {bounded} = require('./hiclass-navigation.cjs');
module.exports = function setup(main) {
 const profile = require('./school-profile.cjs').get(), store = services.createStore(profile);
 const windows = new Map(); let busy = false,testTrace=[];
 const liveContext=require('./schoolbell-live-context.cjs');
 const trial=require('./schoolbell-test-authorization.cjs');
 const testAuthorization=trial.createTestAuthorization({
  canUse:()=>!app.isPackaged&&!!process.env.CLASSROOM_TEST_PROFILE&&path.resolve(app.getPath('userData'))===path.resolve(process.env.CLASSROOM_TEST_PROFILE),
  persist:record=>fs.appendFile(path.join(profile.dir,'schoolbell-test-approvals.jsonl'),JSON.stringify(record)+'\n',{mode:0o600})
 });
 const createReader=ses=>{
  // Reuse only this app's session; never copy cookies from another browser.
  const reader=new BrowserWindow({show:false,webPreferences:{session:ses,contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  reader.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  const guard=(event,url)=>{try{services.safeURL(url);}catch{event.preventDefault();}};
  reader.webContents.on('will-navigate',guard);reader.webContents.on('will-redirect',guard);
  return reader;
 };
 const contextProvider=(win,to,diagnostic)=>{
  const events=[],provider=liveContext.createLiveContextProvider({target:to,getWebContents:()=>win.isDestroyed()?null:win.webContents,createReader,
   showRecipientReader:testAuthorization.available(),diagnostic:entry=>{events.push(entry);diagnostic?.(entry);}});
  const inspect=provider.inspect;provider.inspect=async signal=>{
   events.length=0;try{return await inspect(signal);}finally{
    if(testAuthorization.available())await fs.writeFile(path.join(profile.dir,'schoolbell-context-lifecycle.json'),JSON.stringify(events.slice(-80),null,2),{mode:0o600}).catch(()=>{});
   }
  };return provider;
 };
 // No official grant or complete verified live provider exists. These code-owned
 // defaults cannot be enabled by IPC, saved settings or environment variables.
 const makeDriver=(permission=()=>null)=>{
  let trialWindowUsed=false;
  const diagnostic=entry=>{
   if(!testAuthorization.available())return;
   testTrace.push(entry);
   if((entry.step==='commitOnce'&&entry.state==='started')||(entry.step==='writeTitle'&&entry.state==='complete'))trialWindowUsed=true;
  };
  return require('./schoolbell-electron-driver.cjs').createRuntimeDriver({profile,permission,openClass:open,
  evidenceFactory:(to,win)=>{const context=contextProvider(win,to,diagnostic);
   const uploads=require('./schoolbell-preview-originals.cjs').createPreviewOriginals({getWebContents:()=>win.isDestroyed()?null:win.webContents,tempRoot:profile.dir});
   const posts=require('./schoolbell-live-posts.cjs').createLivePostProvider({target:to,tempRoot:profile.dir,createReader,diagnostic,getWebContents:()=>win.isDestroyed()?null:win.webContents});return {
   readBaseline:posts.readBaseline,readPublishedMetadata:posts.readPublishedMetadata,readUploads:uploads.readUploads,
   diagnostic,
   // A/B/C observed one send action, with no second service confirmation click.
   // The independent app final confirmation and disabled production gate remain.
   finalAction:'single-send',publicationMode:'immediate',
   openComposer:(request,signal)=>require('./schoolbell-composer-entry.cjs').openObservedComposer(win.webContents,{
    groupId:request.binding?.boardId,signal,allowed:request.stillPermitted}),
   async readContext(_r,signal){let facts=await context.inspect(signal);
    const p=permission(),entry={step:'context',checks:facts.checks,recipientCheck:facts.recipientCheck,grantPresent:!!p,grantMatches:trial.validTestGrant(p,to,'read'),factsReady:trial.testFacts(facts)};
    if(testAuthorization.available())testTrace.push(entry);
    if(entry.grantMatches){try{facts=testAuthorization.attach(facts,to,win.webContents);entry.attached=true;}catch(e){entry.attached=false;throw e;}}
    const value={...to,...facts,service:'schoolbell',scopeType:'class',board:'diary',
    authenticated:facts.checks.classPage,teacher:facts.authorityVerified,classApproved:false,testClassApproved:false,
    contextId:facts.boardId,students:facts.students,parents:facts.parents,externalNotifications:null};
    entry.testContextAccepted=trial.testContext(value,p);return value;},
   async readDate(request,signal){
    const mode=await require('./schoolbell-publication-mode.cjs').inspectPublicationMode(win.webContents,signal,{keepOpen:true});
    return {verified:mode.known===true&&mode.mode==='immediate',
     source:'observed-service-ui',meaning:'publication-mode',mode:mode.mode,value:null,writable:false,
     observedAt:Date.now(),scope:{...to,...request.binding}};
   },
   close(){const contextStopped=context.close(),postsStopped=posts.close(),uploadsStopped=uploads.close();return contextStopped&&postsStopped&&uploadsStopped;}
  };},
  closeClass:key=>{
   const w=windows.get(key);
   if(w&&!w.isDestroyed()){
    // All driver jobs and grants are still stopped/revoked. In the isolated
    // trial, retain the ordinary service UI once editing starts so
    // a timeout cannot cancel a delayed publish or erase its validation error.
    // This never retries, confirms success, or authorizes another send.
    if(testAuthorization.available()&&trialWindowUsed){w.show();w.focus();}
    else w.destroy();
   }
   return true;
  }});
 };
 const confirmationParent=()=>{const parent=main();if(parent?.isMinimized())parent.restore();parent?.show();parent?.focus();return parent;};
 const publisherOptions={profile,store,
  readPhoto:ref=>require('./media.cjs').current().read(ref),review:async ({phase,scope,note,photos=[]})=>{
   const final=phase==='submit';
   if(final&&scope.executionMode==='development-test'){
    const wc=windows.get(scope.classKey)?.webContents;
    const inspect=async()=>wc?.executeJavaScriptInIsolatedWorld(17484,[{code:'(()=>{const e=document.querySelector("app-boards-write button.btn-with-description");if(!e)return null;const {point,...target}=('+require('./schoolbell-send-input.cjs').inspectSendTarget.toString()+')(document,e);return {target,mode:('+require('./schoolbell-publication-mode.cjs').readPublicationMode.toString()+')(document)};})()'}]);
    const immediate=await inspect();await new Promise(resolve=>setTimeout(resolve,500));const settled=await inspect();
    await fs.writeFile(path.join(profile.dir,'schoolbell-test-preflight.json'),JSON.stringify({
     observedAt:Date.now(),sendTarget:testTrace.findLast(e=>e.step==='readFields'&&e.sendTarget)?.sendTarget||null,immediate,settled
    },null,2),{mode:0o600});
   }
   const answer=await dialog.showMessageBox(confirmationParent(),{type:'question',buttons:['취소',final?'이 내용으로 한 번 게시':'입력 준비'],defaultId:0,cancelId:0,
    message:final?'검증된 학교종이 알림장을 게시할까요?':'학교종이 작성 화면에 초안을 입력할까요?',
    detail:expectedSchool()+' · '+scope.classKey+'\n'+note.date+' · 사진 '+note.photos.length+'장\n'+note.title+'\n'+note.body+'\n'+
     (scope.executionMode==='development-test'?'개발 시험 · 실제 학급 ID '+scope.boardId+'\n학생 0명 / 학부모 0명 / 필수 관리자 1명\n학교·학년도 연결 및 관리자 본인 여부는 사용자 확인 근거입니다. 서비스의 고유 계정 ID/공식 허용을 검증한 것은 아닙니다.\n':'')+
     (final?photos.map((p,i)=>'사진 '+(i+1)+': '+p.bytes+' bytes · SHA-256 '+p.sha256).join('\n')+'\n':'')+
     (scope.publicationMode==='immediate'?'즉시발행입니다. 앱 작성일은 초안 구분용이며 학교종이 게시 날짜를 지정하지 않습니다. 실제 발행일은 게시 후 서버 표시로 확인해 기록합니다.\n':'')+
     (scope.selfNotification?'필수 관리자(현재 교사 본인)에게 알림이 전달될 수 있습니다.\n':'')+
     (final?'학교·학급·수신대상과 본문·사진이 검증된 경우에만 게시합니다. 결과가 불확실하면 재전송하지 않습니다.':'아직 게시하지 않습니다. 입력·사진 검증 후 별도로 최종 확인합니다.')});
   if(answer.response===1&&final&&scope.executionMode==='development-test')await testAuthorization.approveFinal(note,photos,scope);
   return answer.response===1;
  }};
 const publisher=require('./schoolbell-publish.cjs').createPublisher({...publisherOptions,driver:makeDriver()});
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
   developmentChecks:testAuthorization.available(),developmentTrial:testAuthorization.status(key),
   connection:connection.describe(windows.get(key)),
   automatic:false,capability:capability.status(),posts:Object.entries(row.posts).map(([hash,p])=>({hash,...p})),
   automaticPosts:Object.entries(row.automaticPosts||{}).map(([id,p])=>({id,...p}))};
 };
 async function open(key) {
  services.classKey(key);
  const saved=store.get(key).schoolbell?.url;
  const destination=saved?services.safeURL(saved,true):services.HOME;
  for (const [other,w] of windows) if (other !== key && !w.isDestroyed()) w.close();
  let w = windows.get(key);
  if (!w || w.isDestroyed()) {
   w = new BrowserWindow({width:1200,height:850,title:'학교종이 · 우리 교실에서 직접 로그인',
    webPreferences:{partition:services.partition(profile.id,'schoolbell',key),contextIsolation:true,nodeIntegration:false,sandbox:true}});
   windows.set(key,w); w.removeMenu();
   w.on('closed',()=>windows.delete(key));
   const watched=connection.watch(w);
   const loginNavigation=require('./schoolbell-login-navigation.cjs').createLoginNavigation();
   w.webContents.session.setPermissionRequestHandler((_wc,_permission,done)=>done(false));
   w.webContents.session.setPermissionCheckHandler(()=>false);
   const navigate = (event,url) => {
    if(!loginNavigation.allow(url,w.webContents.getURL())){watched.block(url);event.preventDefault();}
   };
   w.webContents.on('will-navigate',navigate); w.webContents.on('will-redirect',navigate);
   w.webContents.setWindowOpenHandler(({url})=>{
    if(loginNavigation.allow(url,w.webContents.getURL()))void connection.load(w,url,20000,()=>true).catch(()=>{});
    else watched.block(url);
    return {action:'deny'};
   });
   await connection.load(w,destination);
  } else if(w.schoolbellLoadFailed) {
   await connection.load(w,destination);
  }
  if(w.isMinimized())w.restore();w.show(); w.focus(); return w;
 }
 function target(value) {
  if (!value || !/^[1-6]$/.test(value.grade) || typeof value.classroom !== 'string' ||
      !/^[가-힣a-zA-Z0-9][가-힣a-zA-Z0-9 -]{0,23}$/.test(value.classroom) ||
      !/^\d{4}$/.test(value.year) || value.classKey !== [value.year,value.grade,value.classroom].join(':'))
   fail('우리 교실의 학년·반 설정을 확인해 주세요.');
  return {...value,schoolId:profile.id,schoolName:expectedSchool()};
 }
 handle('diary-service:status',key=>status(key));
 handle('diary-service:select',({classKey,service})=>{
  store.select(classKey,service);
  for (const w of windows.values()) if (!w.isDestroyed()) w.close();
  return status(classKey);
 });
 handle('schoolbell:open',async value=>{
  const to=target(value),w=await open(to.classKey);
  return {status:'opened',message:connection.describe(w).message};
 });
 handle('schoolbell:inspect',async value=>{
  const to=target(value),win=windows.get(to.classKey);
  if(!win||win.isDestroyed())return {status:'blocked',message:'학교종이 창에서 직접 로그인한 뒤 담당 학급의 알림장을 열어 주세요.'};
  const provider=contextProvider(win,to),abort=new AbortController();
  try{
   const result=await bounded(()=>provider.inspect(abort.signal),25000,()=>{abort.abort();provider.close();});
   if(process.env.CLASSROOM_TEST_PROFILE)await fs.writeFile(path.join(profile.dir,'schoolbell-evidence-check.json'),JSON.stringify({checks:result.checks,
    blockers:result.blockers,publicationMode:result.publicationMode,recipientCheck:result.recipientCheck},null,2),{mode:0o600});
   // Never expose display names, avatar URLs, group IDs or actor hashes to the
   // renderer/log. This report is not a stored verified link or publication grant.
   return {status:'blocked',checks:result.checks,blockers:result.blockers,
    message:'실제 화면 확인: '+(result.checks.gradeClass?'학년·반 일치. ':'학년·반 확인 필요. ')+
     (result.checks.recipientTableEmpty?'발행 대상 구성원 없음 확인. ':result.checks.rosterEmpty?'명단 입력 값 0건(발행 대상은 별도 확인 필요). ':'명단 확인 필요. ')+
     (result.publicationMode?.known?'발행 방식: '+(result.publicationMode.mode==='immediate'?'즉시발행. ':'예약발행(지원하지 않음). '):'발행 방식 확인 필요. ')+
     result.blockers.map(code=>liveContext.blockerMessages[code]).filter(Boolean).join(' ')};
  }catch(error){return {status:'blocked',message:liveContext.blockerMessages[error.message]||'앱의 로그인 상태와 실제 학급 화면을 확인하지 못했습니다. 자동 등록 잠금과 초안은 유지됩니다.'};}
  finally{abort.abort();provider.close();}
 });
 handle('schoolbell:check-posts',async value=>{
  const to=target(value.target),note=services.payload(value.note),win=windows.get(to.classKey);
  if(note.classKey!==to.classKey)fail('조회할 초안과 학급이 다릅니다.');
  if(!win||win.isDestroyed())fail('학교종이 연결하기에서 담당 학급 알림장을 먼저 열어 주세요.');
  // Verify local originals before comparing their hashes with downloaded files.
  const photos=[];
  for(const ref of note.photos){const bytes=await require('./media.cjs').current().read(ref);photos.push({sha256:require('./media-store.cjs').hash(bytes),bytes:bytes.length});}
  const abort=new AbortController(),initialURL=win.webContents.getURL();
  const provider=require('./schoolbell-live-posts.cjs').createLivePostProvider({target:to,tempRoot:profile.dir,createReader,
   getWebContents:()=>win.isDestroyed()?null:win.webContents});
  try{
   const result=await bounded(()=>provider.readBaseline({note,
    stillPermitted:()=>!abort.signal.aborted&&!win.isDestroyed()&&win.webContents.getURL()===initialURL},abort.signal),90000,
    ()=>{abort.abort();provider.close();});
   const {summarizeReadback,readbackMessage}=require('./schoolbell-readback.cjs');
   const report={...summarizeReadback(result,{...note,photos}),draftDate:note.date};
   // Isolated development-profile evidence only: no bodies, names, URLs, IDs,
   // session data or originals. Production profiles never write this report.
   if(process.env.CLASSROOM_TEST_PROFILE)await fs.writeFile(path.join(profile.dir,'schoolbell-readback-check.json'),JSON.stringify(report,null,2),{mode:0o600});
   return {status:'read-only',message:readbackMessage(report)};
  }catch(error){
   if(process.env.CLASSROOM_TEST_PROFILE)await fs.writeFile(path.join(profile.dir,'schoolbell-readback-check.json'),JSON.stringify({complete:false,
    stage:/^(publication|baseline|date|context)-unverified(?::[a-z]+)?$/.test(error.message)?error.message:'interrupted',
    locations:(error.stack||'').split('\n').map(line=>line.match(/\/(schoolbell-[a-z-]+\.cjs:\d+:\d+)/)?.[1]).filter(Boolean),
    ...(error.fileVisibility?{fileVisibility:error.fileVisibility}:{})},null,2),{mode:0o600});
   const reason={'context-unverified':'담당 학급의 알림장 화면을 열어 주세요.',
    'baseline-unverified':'검색 없는 전체 게시물 목록의 마지막까지 확인하지 못했습니다.',
    'date-unverified':'게시물에 표시된 발행 날짜를 확인하지 못했습니다.',
    'publication-unverified':'게시물 본문 또는 첨부 원본을 대조하지 못했습니다.'}[error.message.split(':')[0]]||'조회 중 화면 변경 또는 연결 중단이 발생했습니다.';
   return {status:'blocked',message:'게시물 조회 미완료 · '+reason+' 초안과 사진은 유지됩니다.'};
  }finally{abort.abort();provider.close();}
 });
 handle('schoolbell:check-uploads',async value=>{
  if(!process.env.CLASSROOM_TEST_PROFILE)fail('개발 시험 프로필에서만 사용할 수 있는 읽기 전용 검사입니다.');
  const to=target(value.target),note=services.payload(value.note),win=windows.get(to.classKey);
  if(note.classKey!==to.classKey||!win||win.isDestroyed()||!liveContext.classRoute(win.webContents.getURL()))fail('시험 학급의 작성 화면을 먼저 확인해 주세요.');
  const original=[];
  for(const ref of note.photos){const bytes=await require('./media.cjs').current().read(ref);original.push({sha256:require('./media-store.cjs').hash(bytes),bytes:bytes.length});}
  const expectedNames=note.photos.map((f,i)=>String(i+1).padStart(2,'0')+'-'+f.id),initial=win.webContents.getURL();
  const abort=new AbortController(),provider=require('./schoolbell-preview-originals.cjs').createPreviewOriginals({getWebContents:()=>win.isDestroyed()?null:win.webContents,tempRoot:profile.dir});
  let report;
  const readSendState=async()=>{try{return await win.webContents.executeJavaScriptInIsolatedWorld(17484,[{code:'(()=>{const roots=document.querySelectorAll("app-boards-write"),buttons=roots.length===1?roots[0].querySelectorAll("button.btn-with-description"):[];if(buttons.length!==1)return {known:false};const {point,...target}=('+require('./schoolbell-send-input.cjs').inspectSendTarget.toString()+')(document,buttons[0]);return {target,mode:('+require('./schoolbell-publication-mode.cjs').readPublicationMode.toString()+')(document)};})()'}]);}catch{return {known:false};}};
  const sendBefore=await readSendState();
  try{
   const proof=await bounded(()=>provider.readUploads({expectedNames,expectedPhotos:original,
    stillPermitted:()=>!abort.signal.aborted&&!win.isDestroyed()&&win.webContents.getURL()===initial},abort.signal),45000,()=>{abort.abort();provider.close();});
   report={complete:proof.complete===true,count:proof.items.length,photos:original};
  }catch(error){report={complete:false,stage:/^upload-unverified(?::[a-z-]+)?$/.test(error.message)?error.message:'interrupted',...(error.previewDetails?{previewDetails:error.previewDetails}:{})};}
  finally{abort.abort();provider.close();}
  report.sendBefore=sendBefore;report.sendAfter=await readSendState();
  await fs.writeFile(path.join(profile.dir,'schoolbell-upload-check.json'),JSON.stringify(report,null,2),{mode:0o600});
  return {status:report.complete?'read-only':'blocked',message:report.complete?'게시 전 첨부 원본 '+report.count+'장 대조 완료. 아직 게시하지 않았으며 초안과 사진은 유지됩니다.':'게시 전 원본 다운로드 또는 대조를 완료하지 못했습니다. 게시와 초안 초기화는 차단됩니다.'};
 });
 handle('schoolbell:link',async value=>{
  const to=target(value), w=windows.get(to.classKey);
  if (!w || w.isDestroyed() || w.schoolbellLoadFailed) fail('학교종이 창을 먼저 열고 담당 학급의 알림장으로 이동해 주세요.');
  if (!services.matchTarget({schoolName:expectedSchool(),year:to.year,grade:to.grade,classroom:to.classroom},to.observed||{}))
   fail('학교 또는 학년도·학년·반이 우리 교실 설정과 다릅니다. 담당 학급을 다시 확인해 주세요.');
  let url;
  try { url=services.safeURL(w.webContents.getURL(),true); } catch(e) { fail(e.message); }
  const answer=await dialog.showMessageBox(confirmationParent(),{type:'question',buttons:['취소','직접 확인했습니다'],defaultId:0,cancelId:0,
   message:'학교종이 담당 학급을 직접 확인하셨나요?',
   detail:expectedSchool()+' '+to.year+'학년도 '+to.grade+'학년 '+to.classroom+'반\n학교종이의 학교명·학급명, 담임 권한, 알림장 게시판을 직접 확인한 경우에만 진행하세요.\n앱에서 로그인·학급 일치 여부를 자동 검증하지 않습니다.'});
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
  const answer=await dialog.showMessageBox(confirmationParent(),{type:'question',buttons:['취소','수동 발행 준비'],defaultId:0,cancelId:0,
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
  const answer=await dialog.showMessageBox(confirmationParent(),{type:'question',buttons:['취소',yes?'게시 확인 기록':'미게시 확인 기록'],defaultId:0,cancelId:0,
   message:yes?'학교종이에서 실제 게시물을 확인하셨나요?':'학교종이에서 게시되지 않은 것을 확인하셨나요?',
   detail:expectedSchool()+' · '+classKey+'\n'+post.date+' · 사진 '+post.photoCount+'장\n'+(yes?'대상 학급, 본문, 사진 개수·순서까지 확인하세요. 사용자 확인 기록으로 저장되며 서버 검증 성공이 아닙니다.':'이미 게시되었는지 불확실하면 취소하세요. 미게시 확인 후에만 다시 준비할 수 있습니다.')});
  if(answer.response!==1)return {status:'cancelled',message:'결과 확인을 취소했습니다. 재발행은 계속 차단됩니다.'};
  const result=store.resolve(classKey,hash,outcome);
  return {...result,message:yes?'수동 게시 · 사용자 확인 기록을 저장했습니다. 초안과 사진은 보존됩니다.':'미게시 확인을 기록했습니다. 초안으로 다시 준비할 수 있습니다.'};
 });
 // Explicit IPC guard as well as disabled UI; no settings flag can enable unverified automatic posting.
 handle('schoolbell:authorize-test',async value=>{
  if(!testAuthorization.available())fail('분리된 개발 시험 앱에서만 승인할 수 있습니다. 운영 등록 잠금은 유지됩니다.');
  const to=target(value),win=windows.get(to.classKey);
  if(!win||win.isDestroyed()||!liveContext.classRoute(win.webContents.getURL()))fail('현재 앱 창에서 담당 테스트 학급의 알림장을 먼저 열어 주세요.');
  const reader=contextProvider(win,to),controller=new AbortController();
  try{
   await require('./schoolbell-composer-entry.cjs').openObservedComposer(win.webContents,{groupId:liveContext.classRoute(win.webContents.getURL()).groupId,
    signal:controller.signal,allowed:()=>testAuthorization.available()&&!win.isDestroyed()});
   const href=win.webContents.getURL();
   const inspect=()=>bounded(()=>reader.inspect(controller.signal),30000,()=>{controller.abort();reader.close();});
   const facts=await inspect();if(!trial.testFacts(facts)||!facts.accountObservationDigest)fail('빈 학생·학부모 대상, 관리자 1명, 관리 화면 편집 권한 및 현재 계정 표시를 모두 확인해야 합니다.');
   const answer=await dialog.showMessageBox(confirmationParent(),{type:'question',buttons:['취소','이 테스트 학급으로 1회 시험 승인'],defaultId:0,cancelId:0,
    message:'현재 앱 세션의 테스트 학급을 연결할까요?',
    detail:'앱 설정: '+expectedSchool()+' · '+to.classKey+'\n실제 학교종이 학급: '+facts.classDisplayName+' · ID '+facts.boardId+'\n'+
     '실제 확인: 관리 화면 편집 가능, 학생 0명·학부모 0명, 필수 관리자 1명.\n'+
     '사용자 확인: 이 학급을 위 앱 설정에 연결하며, 현재 로그인은 본인 계정이고 유일한 관리자는 본인입니다. 가상 문구·사진만 사용하며 본인 관리자 알림을 허용합니다.\n'+
     '학교·학년도와 관리자 본인 연결은 사용자 확인 기록입니다. 서비스가 고유 신원이나 공식 자동화를 승인했다고 기록하지 않습니다.\n'+
     '승인은 현재 창에서 30분·1회 시험에만 적용됩니다. 입력·첨부 후 게시 직전 다시 확인하며 운영 잠금은 유지됩니다.'});
   if(answer.response!==1)return {status:'cancelled',message:'시험 승인을 취소했습니다.'};
   if(win.isDestroyed()||win.webContents.getURL()!==href)fail('학급 화면이 변경됐습니다.');
   const after=await inspect();if(after.boardId!==facts.boardId||after.accountObservationDigest!==facts.accountObservationDigest)fail('계정 또는 학급이 변경됐습니다.');
   await testAuthorization.issue({target:to,facts:after,webContents:win.webContents});
   return {status:'test-approved',message:'현재 시험 학급에 한해 등록 버튼을 사용할 수 있습니다. 입력·원본 확인 후 최종 게시 승인을 다시 받습니다. 운영 잠금 유지.'};
  }finally{controller.abort();reader.close();}
 });
 handle('schoolbell:publish',async value=>{
  const p=testAuthorization.current();
  if(!p||value?.classKey!==p.target.classKey)return publisher.publish(value);
  testTrace=[];
  const testPublisher=require('./schoolbell-publish.cjs').createPublisher({...publisherOptions,timeoutMs:60000,
   driver:makeDriver(()=>testAuthorization.current()),gate:()=>({enabled:testAuthorization.current()===p,executionMode:'development-test',approvalId:p.approvalId})});
  try{
   const result=await testPublisher.publish(value);
   await fs.writeFile(path.join(profile.dir,'schoolbell-test-result.json'),JSON.stringify({status:result.status,reason:result.reason||null,
    attachmentsVerified:result.attachmentsVerified===true,publication:result.publication||null,trace:testTrace.slice(-40)},null,2),{mode:0o600});
   return result;
  }finally{testAuthorization.revoke();}
 });
 handle('schoolbell:verify-uncertain',async value=>{
  if(!testAuthorization.available())fail('개발 시험 프로필의 결과 재검증만 지원합니다.');
  const to=target(value.target),note=services.payload(value.note),win=windows.get(to.classKey);
  if(note.classKey!==to.classKey||!win||win.isDestroyed())fail('같은 앱 초안과 담당 학급 화면을 확인해 주세요.');
  const grant=testAuthorization.current();
  if(!trial.validTestGrant(grant,to,'read'))fail('현재 테스트 학급 연결을 먼저 확인해 주세요.');
  const controller=new AbortController(),href=win.webContents.getURL(),context=contextProvider(win,to);
  const posts=require('./schoolbell-live-posts.cjs').createLivePostProvider({target:to,tempRoot:profile.dir,createReader,
   getWebContents:()=>win.isDestroyed()?null:win.webContents});
  try{
   const result=await bounded(()=>require('./schoolbell-reconcile.cjs').reconcile({profile,store,target:to,note,attemptId:value.attemptId,
    permission:()=>!win.isDestroyed()&&win.webContents.getURL()===href?testAuthorization.current():null,
    readContext:async signal=>{
     const facts=testAuthorization.attach(await context.inspect(signal),to,win.webContents);
     return {...to,...facts,service:'schoolbell',scopeType:'class',board:'diary',authenticated:facts.checks.classPage,contextId:facts.boardId};
    },readBaseline:posts.readBaseline,readPhoto:ref=>require('./media.cjs').current().read(ref),
    readSubmissionRecords:async()=>(await fs.readFile(path.join(profile.dir,'schoolbell-test-approvals.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line)),
    signal:controller.signal}),90000,
    ()=>{controller.abort();context.close();posts.close();});
   return result;
  }catch(error){return {status:'uncertain',...(require('./schoolbell-driver-errors.cjs').publicFailure(error)||{}),
   message:'기존 게시물 재검증을 마치지 못했습니다. 새 게시물은 보내지 않았으며 초안과 사진을 유지합니다.'};}
  finally{controller.abort();context.close();posts.close();testAuthorization.revoke();}
 });
 handle('schoolbell:resolve-automatic',async ({classKey,id,outcome})=>{
  const post=store.get(classKey).automaticPosts?.[id];
  if(!post||!['auto-pending','auto-uncertain'].includes(post.status)||
     !['auto-user-confirmed','auto-user-not-posted'].includes(outcome))fail('확인할 자동 등록 시도가 없습니다.');
  const answer=await dialog.showMessageBox(confirmationParent(),{type:'question',buttons:['취소','직접 확인 기록'],defaultId:0,cancelId:0,
   message:'학교종이에서 실제 게시물을 확인하셨나요?',
   detail:expectedSchool()+' · '+classKey+'\n'+post.date+' · 사진 '+post.photoCount+'장\n'+
    (outcome==='auto-user-confirmed'?'게시물·본문·사진을 모두 확인한 경우에만 기록하세요. 자동 검증 성공으로 변경하지 않습니다.':
    '게시되지 않은 것이 확실할 때만 기록하세요. 불확실하면 취소하세요. 기존 시도 기록은 보존됩니다.')});
  if(answer.response!==1)return {status:'cancelled',message:'기록을 유지했습니다. 자동 재전송하지 않습니다.'};
  return {...store.resolveAutomatic(classKey,id,outcome),message:'사용자 확인을 별도로 기록했습니다. 초안과 사진은 유지됩니다.'};
 });
 return () => !busy && [...windows.values()].every(w=>w.isDestroyed());
};
