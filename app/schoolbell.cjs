'use strict';
// Schoolbell (학교종이) diary publishing, modelled on hiclass.cjs:
// connect once (the teacher logs in and opens the class notice board, the app asks once to link it),
// then [학교종이 등록] publishes in a background window and confirms the result.
// The teacher always logs in by hand in the app's own window. No password is read or stored, no
// cookie is copied from another browser and no private API is called.
const {ipcMain,dialog,clipboard,shell}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');
const services=require('./diary-services.cjs');
const flow=require('./schoolbell-flow.cjs'),adapter=require('./schoolbell-adapter.cjs'),windows=require('./schoolbell-window.cjs');
const submit=require('./schoolbell-submit.cjs'),photos=require('./schoolbell-photos.cjs'),input=require('./schoolbell-input.cjs');
module.exports=function setup(main){
 const profile=require('./school-profile.cjs').get(),store=services.createStore(profile);
 const schoolName=()=>profile.config.active?.school.SCHUL_NM||require('./school.js').legacy.SCHUL_NM;
 const partition=key=>services.partition(profile.id,'schoolbell',key);
 const readPhoto=ref=>require('./media.cjs').current().read(ref);
 let visible=null,visibleKey=null,busy=false,connecting=false,offering=false;
 let pending=null,watchTimer=null,lastOffer='',lastProgress='',checking=null;

 const trusted=event=>event.sender===main()?.webContents&&event.senderFrame===event.sender.mainFrame;
 const GENERIC='학교종이 작업을 마치지 못했습니다. 초안과 사진은 유지됩니다.';
 function handle(name,fn){
  ipcMain.handle(name,async(event,value)=>{
   if(!trusted(event))throw Error('접근 불가');
   try{return await fn(value);}
   catch(error){return {status:'error',message:error.schoolbellUserMessage||GENERIC};}
  });
 }
 function fail(text){throw Object.assign(Error(text),{schoolbellUserMessage:text});}
 function progress(p){
  const key=JSON.stringify([p.phase,p.step,p.state,p.message]);if(key===lastProgress&&!p.done)return;lastProgress=key;
  const m=main();if(m&&!m.isDestroyed())m.webContents.send('diary:progress',{...p,service:'schoolbell',classKey:p.classKey||pending?.classKey||visibleKey});
 }
 function target(value){
  if(!value||typeof value.classKey!=='string'||typeof value.label!=='string'||!/^\d{4}:[1-6]:[가-힣a-zA-Z0-9][가-힣a-zA-Z0-9 -]{0,23}$/.test(value.classKey))
   fail('우리 교실의 학년·반 설정을 확인해 주세요.');
  services.classKey(value.classKey);
  return {classKey:value.classKey,label:value.label.slice(0,40),grade:String(value.grade||''),classroom:String(value.classroom||''),relogin:value.relogin===true};
 }
 const linkOf=key=>{
  const row=store.get(key),link=row.schoolbellLink;
  return {linked:!!link,title:link?.title||'',needsRelink:!link&&!!row.schoolbell,recipients:row.schoolbellRecipients||null};
 };
 function status(key){
  if(!busy)try{store.recoverAutomatic(key);}catch{}
  const row=store.get(key);
  return {service:row.service,schoolbell:linkOf(key),
   posts:Object.entries(row.posts).map(([hash,p])=>({hash,...p})),
   automaticPosts:Object.entries(row.automaticPosts||{}).map(([id,p])=>({id,hash:p.hash,status:p.status,date:p.date,photoCount:p.photoCount,time:p.time}))};
 }

 // ----- the visible window: login and class connection -----
 function stopWatch(){clearInterval(watchTimer);watchTimer=null;pending=null;lastOffer='';}
 function closeVisible(){if(visible&&!visible.isDestroyed())visible.destroy();visible=null;visibleKey=null;}
 function openVisible(key){
  if(visible&&!visible.isDestroyed()&&visibleKey!==key)closeVisible();
  if(!visible||visible.isDestroyed()){
   const created=visible=windows.visible(partition(key));visibleKey=key;
   for(const name of ['did-navigate','did-navigate-in-page','did-finish-load'])created.webContents.on(name,()=>setTimeout(check,600));
   created.on('closed',()=>{
    if(visible===created){visible=null;visibleKey=null;}
    if(pending){stopWatch();progress({step:0,state:'closed',classKey:key,message:'학교종이 창이 닫혔습니다. 연결하려면 [학교종이 연결하기]를 다시 눌러 주세요.'});}
   });
  }
  return visible;
 }
 // The class name lives on the class settings page. Read it in a background window of the same
 // login; when it cannot be read the teacher is told so in the confirmation instead of a guess.
 async function className(key,board){
  const origin=new URL(board.url).origin,w=windows.worker(partition(key));
  try{
   await windows.load(w,origin+'/ko/main/group/'+board.groupId+'/settings/groupinfo',15000);
   for(let i=0;i<24;i++){
    const info=await adapter.run(w.webContents,'group').catch(()=>null);
    if(info?.known&&info.name)return info;
    await windows.sleep(300);
   }
  }catch{}finally{if(!w.isDestroyed())w.destroy();}
  return null;
 }
 async function offer(w,to,board){
  if(offering)return board;
  offering=true;
  try{
   const info=await className(to.classKey,board),name=info?.name||'';
   const other=!!name&&!flow.titleMatches(name,to.grade,to.classroom);
   const answer=await dialog.showMessageBox(w,{type:'question',buttons:['취소','연결하기'],defaultId:0,cancelId:0,
    message:(name?name+' 알림장':'학교종이 학급 알림장')+'을 찾았습니다.\n이 학급에 연결할까요?',
    detail:'우리 교실: '+schoolName()+' '+to.label+'\n학교종이 알림장: '+board.url+
     (other?'\n\n주의: 학교종이 학급의 학년·반이 우리 교실 설정과 다릅니다.':'')+
     (info&&info.classType===false?'\n\n주의: 학급페이지가 아닌 곳의 게시판일 수 있습니다. 담당 학급페이지의 알림장인지 확인해 주세요.':'')+
     (name?'':'\n\n학급 이름을 읽지 못했습니다. 지금 열린 알림장이 담당 학급의 것인지 확인해 주세요.')});
   if(answer.response!==1)return {step:3,state:'cancelled',message:'연결을 취소했습니다. 연결할 학급의 알림장을 열어 주세요.'};
   const now=w.isDestroyed()?null:flow.classify(await adapter.inspect(w.webContents).catch(()=>({})));
   if(now?.state!=='board'||now.url!==board.url)return {step:2,state:'changed',message:'학교종이 화면이 바뀌었습니다. 연결할 학급의 알림장을 다시 열어 주세요.'};
   store.linkBoard(to.classKey,{url:board.url,groupId:board.groupId,title:name,schoolName:schoolName()});
   return {step:3,state:'linked',done:true,title:name,message:'학교종이 학급 연결이 완료되었습니다.'};
  }finally{offering=false;}
 }
 function finish(result){
  stopWatch();closeVisible();
  const m=main();if(m&&!m.isDestroyed())windows.reveal(m);
  progress(result);
 }
 async function check(){
  if(!pending||!visible||visible.isDestroyed()||busy||connecting||offering)return;
  const w=visible;let state;
  try{state=await windows.bounded(()=>adapter.inspect(w.webContents),8000);}catch{return;}
  if(!pending||w!==visible)return;
  const c=flow.classify(state);
  if(w.schoolbellBlocked){w.schoolbellBlocked=false;progress({step:c.step,state:'blocked',message:'허용되지 않은 주소로의 이동을 막았습니다. 학교종이 화면에서 다시 진행해 주세요.'});return;}
  // "다시 로그인": the same class board is already linked, so nothing is asked again.
  if(pending.relogin){
   if(c.state==='board'&&c.groupId===pending.link.groupId){finish({step:3,state:'linked',done:true,classKey:pending.classKey,title:pending.link.title,message:'학교종이에 다시 로그인했습니다.'});return;}
   if(c.state==='login'){pending.sawLogin=true;pending.returned=false;}
   else if(pending.sawLogin&&!pending.returned&&c.state!=='board'){pending.returned=true;windows.load(w,pending.link.url).catch(()=>{});}
  }
  if(c.state!=='board'){lastOffer='';progress(c);return;}
  if(c.url===lastOffer)return;
  lastOffer=c.url;
  const to=pending,result=await offer(w,to,c);
  if(result.done)finish({...result,classKey:to.classKey});else progress(result);
 }
 handle('schoolbell:connect',async value=>{
  const to=target(value);
  if(busy||connecting||offering)return {message:'학교종이 연결 또는 등록이 진행 중입니다.'};
  connecting=true;
  try{
   if(checking)await checking;
   const link=store.get(to.classKey).schoolbellLink,w=openVisible(to.classKey);
   pending={...to,relogin:to.relogin&&!!link,link};lastOffer='';lastProgress='';
   const current=w.webContents.getURL();
   windows.reveal(w);
   if(!current||current==='about:blank'||w.schoolbellLoadFailed)await windows.load(w,flow.HOME);
   if(pending&&!watchTimer)watchTimer=setInterval(check,1500);
   setTimeout(check,800);
   return {step:1,state:'started',message:flow.GUIDE};
  }catch{
   stopWatch();closeVisible();
   return {status:'error',message:'학교종이 화면을 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 연결해 주세요. 작성 내용은 유지됩니다.'};
  }finally{connecting=false;}
 });
 // Recovery: check the page that is open right now (the watcher normally does this by itself).
 handle('schoolbell:link',async value=>{
  const to=target(value);
  if(busy||connecting||offering)return {message:'학교종이 연결 또는 등록이 진행 중입니다.'};
  if(!visible||visible.isDestroyed()||visibleKey!==to.classKey)return {step:1,state:'closed',message:'[학교종이 연결하기]를 눌러 학교종이 창을 먼저 열어 주세요.'};
  const c=flow.classify(await windows.bounded(()=>adapter.inspect(visible.webContents),8000));
  if(c.state!=='board')return c;
  lastOffer=c.url;
  const result=await offer(visible,to,c);
  if(result.done)finish({...result,classKey:to.classKey});
  return result;
 });
 handle('schoolbell:status',key=>linkOf(services.classKey(key)));
 // Session check for a saved link: loads the saved board in a background window.
 // Only a login page means expired; anything unclear stays "unknown" and changes nothing.
 handle('schoolbell:session',key=>{
  const link=store.get(services.classKey(key)).schoolbellLink;
  if(!link)return {status:'none'};
  if(checking)return checking;
  if(busy||connecting||offering||pending||(visible&&!visible.isDestroyed()))return {status:'unknown'};
  // A registration started meanwhile waits for this short check instead of being refused.
  checking=(async()=>{
   let w;
   try{
    w=windows.worker(partition(key));
    await windows.load(w,link.url,20000);
    for(let i=0;i<24;i++){
     const c=flow.classify(await adapter.inspect(w.webContents));
     if(c.state==='login')return {status:'expired'};
     if(c.state==='board'&&c.groupId===link.groupId)return {status:'ok'};
     await windows.sleep(500);
    }
    return {status:w.schoolbellBlocked?'expired':'unknown'};
   }catch{return {status:'unknown'};}
   finally{checking=null;if(w&&!w.isDestroyed())w.destroy();}
  })();
  return checking;
 });
 handle('schoolbell:recipients',({classKey,recipients})=>({recipients:store.setRecipients(classKey,recipients)}));
 handle('schoolbell:close',()=>{
  if(busy||connecting||offering)return {closed:false,message:'학교종이 연결 또는 등록이 끝난 뒤 서비스를 바꿔 주세요.'};
  stopWatch();closeVisible();return {closed:true};
 });

 // ----- registration -----
 // Fixed codes and timings only: never the title, body, names, addresses or cookies.
 // Details are a fixed word or counts/booleans/element names; anything else is dropped.
 const safe=v=>typeof v==='number'||typeof v==='boolean'||(typeof v==='string'&&/^[a-z0-9:+._-]{1,64}$/i.test(v));
 const clean=v=>safe(v)?v:(v&&typeof v==='object'&&!Array.isArray(v))?
  Object.fromEntries(Object.entries(v).filter(([,x])=>safe(x)||(Array.isArray(x)&&x.length<=40&&x.every(safe))).slice(0,20)):null;
 async function writeTrace(trace){
  try{await fs.writeFile(path.join(profile.dir,'schoolbell-last-run.json'),JSON.stringify(trace,null,1),{mode:0o600});}catch{}
 }
 handle('schoolbell:publish',async value=>{
  if(busy||connecting||offering)return {status:'busy',message:'이미 연결 또는 등록이 진행 중입니다.'};
  busy=true;
  try{if(checking)await checking;}catch{}finally{busy=false;}
  if(connecting||offering)return {status:'busy',message:'이미 연결 또는 등록이 진행 중입니다.'};
  let note;
  try{note=services.payload(value);}catch{return {status:'error',message:'제목을 입력하고 본문 또는 사진을 추가해 주세요.'};}
  const row=store.get(note.classKey);
  if(row.service!=='schoolbell')return {status:'blocked',message:'현재 학급의 발행 서비스가 학교종이가 아닙니다.'};
  const link=row.schoolbellLink;
  if(!link)return {status:'error',message:row.schoolbell?'학교종이 학급을 다시 연결해 주세요. ([학교종이 연결하기])':'현재 학년·반의 학교종이 학급을 먼저 연결해 주세요.'};
  busy=true;stopWatch();closeVisible();
  const started=Date.now(),trace={version:require('electron').app.getVersion(),window:process.env.CLASSROOM_SCHOOLBELL_VISIBLE==='1'?'visible':'offscreen',photos:note.photos.length,recipients:row.schoolbellRecipients?'custom':'default',steps:[]};
  let attempt,w,cdp,clicked=false;
  try{
   const files=await photos.load(note.photos,readPhoto);
   attempt=store.beginAutomatic(note);
   if(attempt.blocked)return {status:'blocked',message:attempt.reason==='duplicate'?'이미 등록한 내용입니다. 중복 등록하지 않았습니다.':
    '이전 등록 결과가 확인되지 않았습니다. 학교종이에서 확인한 뒤 결과를 먼저 선택해 주세요.'};
   // The protocol session needs a live page, so give the new window one before attaching.
   w=windows.worker(partition(note.classKey));
   await w.loadURL('about:blank');
   cdp=await windows.bounded(()=>input.attach(w.webContents),10000);
   const worker=w;
   // Offline tests shorten the waits; the packaged app never sets this profile variable.
   const timeouts=process.env.CLASSROOM_TEST_PROFILE?globalThis.schoolbellTestTimeouts:undefined;
   const result=await windows.bounded(()=>submit.publish({w:worker,cdp,link,note,files,timeouts,recipients:row.schoolbellRecipients||null,
    onInfo:(name,value)=>{(trace.info||(trace.info={}))[name]=clean(value);},
    onStep:step=>{trace.steps.push({step,at:Date.now()-started});
     progress({phase:'publish',step,total:flow.STEPS.length,classKey:note.classKey,message:'학교종이 등록 중 ('+step+'/'+flow.STEPS.length+') '+flow.STEPS[step-1]});},
    beforeSend:()=>{store.automaticState(note.classKey,attempt.id,{status:'auto-pending',stage:'submitting'});clicked=true;}}),
    300000+files.length*90000,()=>{if(!worker.isDestroyed())worker.destroy();});
   const record=store.automaticState(note.classKey,attempt.id,{status:'auto-success',stage:'verifying',
    receipt:{postId:result.postId,boardId:link.groupId,photoCount:files.length,verifiedAt:Date.now()}});
   trace.outcome='success';trace.postId=!!result.postId;
   return {status:'success',hash:attempt.hash,attemptId:attempt.id,attachmentsVerified:true,postId:record.receipt.postId,message:'학교종이 등록 완료'};
  }catch(error){
   // error.sent comes from the flow; a timeout after the click command is treated as sent.
   const sent=error.sent===true||(error.sent===undefined&&clicked);
   trace.outcome=sent?'uncertain':'stopped';trace.code=typeof error.code==='string'?error.code.slice(0,40):'error';
   if(error.detail!==undefined)trace.detail=clean(error.detail);
   if(attempt?.id){
    try{
     if(sent)store.automaticState(note.classKey,attempt.id,{status:'auto-uncertain',stage:'verifying'});
     else store.discardAutomatic(note.classKey,attempt.id);
    }catch{/* the pending record stays and keeps blocking */}
   }
   return {status:sent?'uncertain':'error',code:trace.code,
    message:sent?submit.MESSAGES.uncertain:(error.userMessage||(error.code==='timeout'?submit.MESSAGES.timeout:submit.MESSAGES.structure))};
  }finally{
   try{cdp?.detach();}catch{}
   // Development watch mode keeps a failed run's window open so the stopped screen can be seen.
   const keep=process.env.CLASSROOM_SCHOOLBELL_VISIBLE==='1'&&trace.outcome!=='success';
   if(w&&!w.isDestroyed()&&!keep)w.destroy();
   trace.ms=Date.now()-started;await writeTrace(trace);
   busy=false;
  }
 });
 handle('schoolbell:resolve-automatic',async({classKey,id,outcome})=>{
  const post=store.get(classKey).automaticPosts?.[id];
  if(!post||!['auto-pending','auto-uncertain'].includes(post.status)||!['auto-user-confirmed','auto-user-not-posted'].includes(outcome))fail('확인할 등록 시도가 없습니다.');
  if(busy)fail('등록이 끝난 뒤 다시 선택해 주세요.');
  const yes=outcome==='auto-user-confirmed';
  const answer=await dialog.showMessageBox(main(),{type:'question',buttons:['취소',yes?'게시됨으로 기록':'게시 안 됨으로 기록'],defaultId:0,cancelId:0,
   message:yes?'학교종이에서 이 알림장이 게시된 것을 확인하셨나요?':'학교종이에서 이 알림장이 게시되지 않은 것을 확인하셨나요?',
   detail:schoolName()+' · '+post.date+' · 사진 '+post.photoCount+'장\n'+
    (yes?'게시됨으로 기록하면 같은 내용을 다시 보내지 않습니다. 초안과 사진은 그대로 둡니다.':'게시 안 됨으로 기록하면 같은 내용을 다시 등록할 수 있습니다. 확실하지 않으면 취소해 주세요.')});
  if(answer.response!==1)return {status:'cancelled',message:'기록을 그대로 두었습니다.'};
  store.resolveAutomatic(classKey,id,outcome);
  return {status:'resolved',message:yes?'게시됨으로 기록했습니다. 초안과 사진은 유지됩니다.':'게시 안 됨으로 기록했습니다. 다시 등록할 수 있습니다.'};
 });

 // ----- service selection and status -----
 handle('diary-service:status',key=>status(services.classKey(key)));
 handle('diary-service:select',({classKey,service})=>{
  if(busy||connecting||offering)return {status:'busy',message:'학교종이 연결 또는 등록이 끝난 뒤 서비스를 바꿔 주세요.'};
  store.select(classKey,service);stopWatch();closeVisible();
  return status(classKey);
 });

 // ----- manual publishing (emergency fallback): copy the text, save the photos, post by hand -----
 handle('schoolbell:prepare',async value=>{
  const note=services.payload(value);
  if(busy)fail('등록이 끝난 뒤 다시 시도해 주세요.');
  for(const ref of note.photos)await readPhoto(ref);
  const answer=await dialog.showMessageBox(main(),{type:'question',buttons:['취소','직접 발행 준비'],defaultId:0,cancelId:0,
   message:'학교종이에서 직접 작성하고 발행합니다.',
   detail:schoolName()+' · '+note.date+' · 사진 '+note.photos.length+'장\n앱은 자동으로 보내지 않습니다. 제목과 본문을 복사해 붙여넣고 사진을 직접 첨부한 뒤, 게시 결과를 여기에 기록해 주세요.'});
  if(answer.response!==1)return {status:'cancelled',message:'직접 발행 준비를 취소했습니다. 초안은 유지됩니다.'};
  const result=store.prepare(note);
  if(result.blocked)return {...result,message:'같은 내용의 기록 또는 결과 미확인 건이 있습니다. 학교종이에서 확인한 뒤 결과를 먼저 기록해 주세요.'};
  // The pending marker is saved first: a closed window or network error never loses it.
  try{const w=openVisible(note.classKey);if(!w.webContents.getURL()||w.schoolbellLoadFailed)await windows.load(w,store.get(note.classKey).schoolbellLink?.url||flow.HOME);windows.reveal(w);}catch{}
  return {...result,message:'직접 발행 준비됨 · 제목/본문을 복사하고 사진을 직접 첨부하세요. 발행 후 결과를 기록해 주세요.'};
 });
 const manualPending=note=>{
  const p=services.payload(note),hash=services.fingerprint(profile.id,'schoolbell',p),row=store.get(p.classKey);
  if(row.service!=='schoolbell'||row.posts[hash]?.status!=='manual-pending')fail('현재 초안으로 [직접 발행 준비]를 먼저 해 주세요. 내용을 바꿨다면 이전 건의 결과부터 기록해 주세요.');
  return p;
 };
 handle('schoolbell:copy',({note,part})=>{
  const p=manualPending(note);
  if(!['title','body'].includes(part))fail('복사할 항목을 확인해 주세요.');
  clipboard.writeText(p[part]);
  return {status:'copied',message:(part==='title'?'제목':'본문')+' 복사됨'};
 });
 handle('schoolbell:photos',async note=>{
  const p=manualPending(note);
  if(!p.photos.length)fail('첨부할 사진이 없습니다.');
  const bytes=await Promise.all(p.photos.map(readPhoto));
  const choice=await dialog.showOpenDialog(main(),{title:'학교종이에 직접 첨부할 사진 저장 위치',properties:['openDirectory','createDirectory']});
  if(choice.canceled||!choice.filePaths[0])return {status:'cancelled',message:'사진 내보내기를 취소했습니다. 원본 사진은 유지됩니다.'};
  // Dedicated new directory, generated filenames and exclusive writes: never overwrite a user's file.
  const dir=await fs.mkdtemp(path.join(choice.filePaths[0],'schoolbell-photos-'));
  for(let i=0;i<bytes.length;i++)await fs.writeFile(path.join(dir,String(i+1).padStart(2,'0')+'.'+p.photos[i].id.split('.').at(-1)),bytes[i],{flag:'wx',mode:0o600});
  const error=await shell.openPath(dir);
  return {status:'exported',message:'사진 '+bytes.length+'장을 01번부터 순서대로 저장했습니다. 학교종이에 직접 첨부하고 개수와 순서를 확인하세요.'+(error?' 선택한 저장 위치에서 폴더를 열어 주세요.':'')};
 });
 handle('schoolbell:resolve',async({classKey,hash,outcome})=>{
  const post=store.get(classKey).posts[hash];
  if(!post||post.status!=='manual-pending'||!['manual-confirmed','manual-not-posted'].includes(outcome))fail('확인할 직접 발행 기록이 없습니다.');
  const yes=outcome==='manual-confirmed';
  const answer=await dialog.showMessageBox(main(),{type:'question',buttons:['취소',yes?'게시됨으로 기록':'게시 안 됨으로 기록'],defaultId:0,cancelId:0,
   message:yes?'학교종이에서 실제 게시물을 확인하셨나요?':'학교종이에서 게시되지 않은 것을 확인하셨나요?',
   detail:schoolName()+' · '+post.date+' · 사진 '+post.photoCount+'장\n'+(yes?'대상 학급, 본문, 사진 개수·순서를 확인하세요.':'이미 게시되었는지 불확실하면 취소하세요.')});
  if(answer.response!==1)return {status:'cancelled',message:'기록을 그대로 두었습니다.'};
  store.resolve(classKey,hash,outcome);
  return {status:'resolved',message:yes?'게시됨으로 기록했습니다. 초안과 사진은 유지됩니다.':'게시 안 됨으로 기록했습니다. 다시 준비할 수 있습니다.'};
 });
 return ()=>!busy&&!connecting&&!offering&&!pending&&!checking;
};
