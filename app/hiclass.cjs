const {app,BrowserWindow,ipcMain,dialog}=require('electron');const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');const adapter=require('./hiclass-adapter.cjs');const navigation=require('./hiclass-navigation.cjs');const flow=require('./hiclass-flow.cjs');const windows=require('./hiclass-window.cjs');
module.exports=function(main){let window,busy=false,connecting=false;const file=path.join(app.getPath('userData'),'hiclass-links.json');const read=async()=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {links:{},posts:{}};throw e;}};const save=async data=>{const temp=file+'.tmp';await fs.writeFile(temp,JSON.stringify(data),{mode:0o600});await fs.rename(temp,file);};
 const presentation=windows.controller({reveal:navigation.reveal});
 function open(show=true){
  if(!window||window.isDestroyed()){
   window=new BrowserWindow({width:1200,height:850,show:false,skipTaskbar:!show,title:'하이클래스 연결',webPreferences:{partition:'persist:hiclass-teacher',contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
   window.removeMenu();presentation.attach(window);const created=window;
   created.webContents.on('did-fail-load',(_event,code,_description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3)created.hiclassLoadFailed=true;});
   for(const ev of ['did-navigate','did-navigate-in-page','did-finish-load'])created.webContents.on(ev,()=>setTimeout(check,600));
   created.on('closed',()=>{if(pending){stopWatch();presentation.finish();progress({step:0,state:'closed',message:'하이클래스 창이 닫혔습니다. 연결하려면 [하이클래스 연결하기]를 다시 눌러 주세요.'});}});
  }
  presentation.mode(show);return window;
 }
 const trusted=event=>event.sender===main()?.webContents;
 async function connection(action){
  if(busy||connecting)return {message:'하이클래스 연결 또는 등록이 진행 중입니다.'};
  connecting=true;
  try{return await action();}catch{return {status:'error',message:'하이클래스 화면을 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 연결해 주세요. 작성 내용은 유지됩니다.'};}finally{connecting=false;}
 }
 // Connection flow: the teacher logs in and opens the class note board; the app watches the window and asks
 // once to link it. Nothing is saved without the confirmation; the note-board and class-title checks are unchanged.
 let pending=null,watchTimer=null,lastOffer='',lastProgress='',offering=false;
 const target=p=>p&&typeof p.classKey==='string'&&typeof p.label==='string'?{classKey:p.classKey,label:p.label,grade:String(p.grade||''),classroom:String(p.classroom||'')}:null;
 function progress(p){const key=JSON.stringify([p.step,p.state,p.message]);if(key===lastProgress&&!p.done)return;lastProgress=key;const m=main();if(m&&!m.isDestroyed())m.webContents.send('diary:progress',p);}
 function stopWatch(){clearInterval(watchTimer);watchTimer=null;pending=null;lastOffer='';}
 async function offer(w,to,s){
  const c=flow.classify(s);
  if(c.state!=='note'||offering)return c;
  offering=true;
  try{
   const data=await read(),other=!flow.titleMatches(c.title,to.grade,to.classroom);
   const confirmation=await dialog.showMessageBox(w,{type:'question',buttons:['취소','연결하기'],defaultId:0,cancelId:0,message:`${c.title}을(를) 찾았습니다.\n이 학급에 연결할까요?`,detail:`우리 교실: 옥구초등학교 ${to.label}\n알림장 게시판: ${c.url}`+(other?'\n\n주의: 하이클래스 학급의 학년·반이 우리 교실 설정과 다릅니다.':'')});
   if(confirmation.response!==1)return {step:4,state:'cancelled',message:'연결을 취소했습니다. 연결할 학급의 알림장 게시판을 열어 주세요.'};
   data.links[to.classKey]={url:c.url,title:c.title};await save(data);
   return {step:4,state:'linked',done:true,title:c.title,message:'하이클래스 학급 연결이 완료되었습니다.'};
  }finally{offering=false;}
 }
 async function check(){
  if(!pending||!window||window.isDestroyed()||busy||connecting||offering)return;
  let s,w=window;try{for(const candidate of presentation.all()){const current=await navigation.bounded(()=>adapter.inspect(candidate),8000);if(flow.classify(current).state==='note'){s=current;w=candidate;break;}if(candidate===window)s=current;}}catch{return;}
  if(!pending)return;
  const c=flow.classify(s);
  if(c.state!=='note'){lastOffer='';progress(c);return;}
  if(c.url===lastOffer)return;
  lastOffer=c.url;const r=await offer(w,pending,s);progress(r);
  if(r.done){stopWatch();presentation.finish();navigation.reveal(main());}
 }
 ipcMain.handle('diary:connect',async(event,payload)=>{if(!trusted(event))throw Error('접근 불가');return connection(async()=>{const w=open();pending=target(payload);lastOffer='';lastProgress='';await navigation.ready(w,'https://www.hiclass.net');if(pending&&!watchTimer)watchTimer=setInterval(check,1500);setTimeout(check,800);return {step:1,state:'started',message:flow.GUIDE};});});
 // Recovery: check the page that is open right now (the watcher normally does this by itself).
 ipcMain.handle('diary:link',async(event,payload)=>{if(!trusted(event))throw Error('접근 불가');const to=target(payload);if(!to)throw Error('잘못된 요청');return connection(async()=>{
  const data=await read(),w=open();
  await navigation.ready(w,data.links[to.classKey]?.url||'https://www.hiclass.net');
  const s=await navigation.bounded(()=>adapter.inspect(w));
  const c=flow.classify(s);if(c.state!=='note')return c;
  lastOffer=c.url;const r=await offer(w,to,s);if(r.done){stopWatch();presentation.finish();navigation.reveal(main());}return r;
 });});
 ipcMain.handle('diary:status',async(event,classKey)=>{if(!trusted(event))throw Error('접근 불가');const link=(await read()).links?.[classKey];return {linked:!!link,title:link?.title||''};});
 // Session check for a saved link: loads the saved board in the hidden window; only a login page means expired.
 ipcMain.handle('diary:session',async(event,classKey)=>{
  if(!trusted(event))throw Error('접근 불가');
  const link=(await read()).links?.[classKey];if(!link)return {status:'none'};
  if(busy||connecting||pending||(window&&!window.isDestroyed()&&window.isVisible()))return {status:'unknown'};
  const r=await connection(async()=>{const w=open(false);await navigation.bounded(()=>w.loadURL(link.url),20000,()=>{if(!w.isDestroyed())w.webContents.stop();});
   for(let i=0;i<24;i++){const s=await adapter.inspect(w);if(s.login)return {status:'expired'};if(s.classTitle)return {status:'ok'};await new Promise(r=>setTimeout(r,500));}
   return {status:'unknown'};});
  return {status:['ok','expired'].includes(r?.status)?r.status:'unknown'};
 });
 ipcMain.handle('diary:publish',async(event,payload)=>{if(!trusted(event))throw Error('접근 불가');if(busy||connecting||offering)return {message:'이미 연결 또는 등록 진행 중입니다.'};if(!payload||typeof payload.parents!=='boolean'||typeof payload.students!=='boolean'||typeof payload.title!=='string'||typeof payload.body!=='string'||!payload.title.trim()||!payload.body.trim())return {message:'제목과 본문을 확인해 주세요.'};if(!payload.parents&&!payload.students)return {message:'학부모 또는 학생 중 한 곳 이상을 수신대상으로 선택해 주세요.'};busy=true;stopWatch();let data,hash,started=false;try{data=await read();const link=data.links[payload.classKey];if(!link)return {message:'현재 학년·반의 하이클래스 학급을 먼저 연결해 주세요.'};hash=crypto.createHash('sha256').update(JSON.stringify([payload.classKey,payload.date,payload.title,payload.body,payload.parents!==false,payload.students!==false])).digest('hex');if(data.posts[hash])return {status:data.posts[hash].status==='pending'?'uncertain':data.posts[hash].status,hash,message:data.posts[hash].status==='success'?'이미 등록한 내용입니다.':data.posts[hash].status==='draft'?'이미 하이클래스에 임시저장한 내용입니다.':'이전 등록 결과가 불확실합니다. 중복 방지를 위해 하이클래스에서 먼저 확인해 주세요.'};const w=open(false);const before=await adapter.prepare(w,link,payload);windows.assertBackground(w);data.posts[hash]={status:'pending',time:Date.now()};await save(data);started=true;const outcome=await adapter.submit(w,payload,before,link);data.posts[hash]={status:outcome,time:Date.now()};await save(data);return {status:outcome,hash,message:outcome==='success'?'하이클래스 등록 완료':'하이클래스 임시저장 완료 (공개 등록 아님)'};}catch(e){if(started&&e.safeToRetry===true){delete data.posts[hash];await save(data);started=false;}return {status:started?'uncertain':'error',message:started?'등록 여부를 확인하지 못했습니다. 중복 등록 방지를 위해 하이클래스에서 결과를 확인해 주세요.':e.message};}finally{presentation.finish();busy=false;}});
};
