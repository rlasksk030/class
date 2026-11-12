'use strict';
// One Schoolbell registration in the background window:
// board -> 작성하기 -> title -> body -> photos -> recipients -> 즉시발행 -> 보내기 -> service dialog -> result.
// Before the send click every failure is safe to retry. After it, anything short of a verified new
// post is reported as "sent, result unknown" so the caller blocks a second send.
const flow=require('./schoolbell-flow.cjs'),adapter=require('./schoolbell-adapter.cjs'),photos=require('./schoolbell-photos.cjs');
const {editorLines}=require('./schoolbell-editor-text.cjs');
const {bounded,sleep}=require('./schoolbell-window.cjs');
const KEEP=' 초안과 사진은 유지됩니다.';
const MESSAGES={
 expired:'학교종이 로그인이 만료되었습니다. 다시 로그인해 주세요.'+KEEP,
 board:'연결된 학급의 알림장을 열지 못했습니다. 학교종이 연결을 확인해 주세요.'+KEEP,
 structure:'학교종이 화면이 바뀌어 등록하지 못했습니다.'+KEEP,
 duplicate:'같은 제목과 내용의 글이 학교종이에 이미 있습니다. 중복 등록하지 않았습니다.',
 'draft-exists':'학교종이에 작성 중인 글이 있어 등록하지 않았습니다. 학교종이에서 그 글을 먼저 정리해 주세요.'+KEEP,
 upload:'사진 업로드를 확인하지 못해 등록하지 않았습니다.'+KEEP,
 recipients:'수신대상을 학교종이에 적용하지 못해 등록하지 않았습니다.'+KEEP,
 mode:'즉시발행 상태를 확인하지 못해 등록하지 않았습니다.'+KEEP,
 changed:'학교종이 작성 화면의 내용이 초안과 달라 등록을 중단했습니다.'+KEEP,
 click:'보내기 버튼을 누르지 못해 등록하지 않았습니다.'+KEEP,
 timeout:'학교종이 응답이 늦어 등록하지 못했습니다. 인터넷 연결을 확인해 주세요.'+KEEP,
 closed:'학교종이 작업 창이 닫혀 등록하지 못했습니다.'+KEEP,
 uncertain:'게시 결과를 확인하지 못했습니다. 다시 보내지 말고 학교종이에서 게시 여부를 확인해 주세요.'+KEEP
};
function stop(code,sent=false){
 const error=Error(code);error.code=code;error.sent=sent;
 error.userMessage=sent?MESSAGES.uncertain:(MESSAGES[code]||MESSAGES.structure);
 return error;
}
// Poll until fn returns a truthy value. Errors thrown by fn end the wait immediately.
async function until(fn,ms,interval=200){
 const end=Date.now()+ms;
 for(;;){const value=await fn();if(value)return value;if(Date.now()>=end)return null;await sleep(interval);}
}
const ROLES=['guardian1','guardian2','student'];
const sameRoles=(state,want)=>ROLES.every(key=>state[key]===want[key]);

async function publish({w,cdp,link,note,files,recipients=null,onStep=()=>{},beforeSend=()=>{},timeouts={}}){
 const t={load:25000,board:20000,composer:20000,settle:8000,dialog:8000,result:40000,verify:30000,...timeouts};
 const wc=w.webContents,names=files.map(f=>f.name),body=editorLines(note.body).join('\n').replace(/\u00a0/g,' ');
 const expected={title:note.title,body:note.body,files:names};
 let sent=false;
 // A page call that never answers (the document was replaced) must not hang the run.
 const run=(action,arg,ms=15000)=>bounded(()=>adapter.run(wc,action,arg),ms);
 const quiet=(action,arg)=>run(action,arg).catch(()=>null);
 const open=async url=>{try{await require('./schoolbell-window.cjs').load(w,url,t.load);}catch(error){throw stop(error.code==='timeout'?'timeout':'board',sent);}};
 const readBoard=async()=>{
  // Loaded when cards or the list's end marker are shown; a brand-new class may show neither.
  let last=null;
  const loaded=await until(async()=>{last=await quiet('board',{title:note.title});return last?.known&&(last.count>0||last.ended)?last:null;},6000,300);
  return loaded||(last?.known?last:null);
 };

 try{
  // 1. The linked class board, with the login still valid.
  onStep(1);
  await open(link.url);
  const at=await until(async()=>{
   const state=await quiet('inspect');if(!state)return null;
   const where=flow.classify(state);
   if(where.state==='login')throw stop('expired');
   return where.state==='board'?where:null;
  },t.board,300);
  if(!at)throw stop(w.schoolbellBlocked?'expired':'board');
  if(at.groupId!==link.groupId)throw stop('board');
  const before=await readBoard();
  if(!before)throw stop('structure');
  if(before.matches.some(card=>flow.cardMatches(card,expected)))throw stop('duplicate');
  const baseline={ids:before.ids,matching:0};

  // 2. Composer through the board's own button; it must be this class and must be empty.
  onStep(2);
  let pressed=false;
  const entered=await until(async()=>{
   const r=await quiet('open-composer',{click:!pressed});
   if(r?.clicked)pressed=true;
   return r?.ready?r:null;
  },t.composer,250);
  if(!entered)throw stop('structure');
  const where=flow.route(wc.getURL());
  if(where.kind!=='composer'||where.groupId!==link.groupId)throw stop('board');
  // Settled: three identical reads in a row, with the recipient text loaded.
  let stable=0,previous='',snapshot=null;
  await until(async()=>{
   const now=await quiet('composer'),key=JSON.stringify(now);
   if(now&&now.label&&key===previous)stable++;else stable=0;
   previous=key;snapshot=now;return stable>=2;
  },t.settle,250);
  if(!snapshot)throw stop('structure');
  if(snapshot.title!==''||!['','\n'].includes(snapshot.body)||snapshot.files.names.length||snapshot.files.uploading||snapshot.dialogs)throw stop('draft-exists');
  if(!snapshot.label)throw stop('recipients');

  // 3. Title and body.
  onStep(3);
  await run('title',{value:note.title});
  await run('body',{lines:editorLines(note.body)});
  snapshot=await run('composer');
  if(snapshot.title!==note.title||snapshot.body!==body)throw stop('changed');

  // 4. Photos in draft order; wait until every upload is listed.
  onStep(4);
  try{await photos.attach(wc,files);}catch(error){throw stop(error.code==='upload'?'upload':error.code||'upload');}

  // 5. Recipients (only when the teacher chose them in the app) and immediate publication.
  onStep(5);
  if(recipients){
   const show=async()=>{
    let clicked=false;
    const state=await until(async()=>{
     const current=await run('targets');if(current.open)return current;
     if(!clicked){const r=await run('targets-open');if(r.clicked)clicked=true;}
     return null;
    },t.dialog,200);
    if(!state)throw stop('recipients');
    return state;
   };
   const close=async apply=>{
    const closed=()=>until(async()=>!(await run('targets')).open,5000,150);
    const pressedButton=await run('targets-close',{apply});
    if(await closed())return;
    // A confirm button that leaves the dialog open: close it with 닫기 once.
    if(!(apply&&pressedButton.applied))throw stop('recipients');
    await run('targets-close',{apply:false});
    if(!await closed())throw stop('recipients');
   };
   let current=await show();
   if(!sameRoles(current.state,recipients)){
    current=await run('targets',{set:recipients});
    if(!sameRoles(current.state,recipients))throw stop('recipients');
    await close(true);
    current=await show();   // read again what the composer really kept
    if(!sameRoles(current.state,recipients))throw stop('recipients');
   }
   await close(false);
  }
  // The radios may exist only while the send dropdown is open. It is then left open: sending with
  // the open menu is the path observed to work on the service, and focus changes would close it.
  snapshot=await run('composer');
  if(snapshot.mode==='unknown'){
   await run('mode-toggle');
   snapshot=await until(async()=>{const now=await run('composer');return now.mode!=='unknown'?now:null;},3000,150);
   if(!snapshot)throw stop('mode');
  }
  if(snapshot.mode==='scheduled'){
   await run('mode-immediate');
   snapshot=await until(async()=>{const now=await run('composer');return now.mode==='immediate'?now:null;},3000,150);
   if(!snapshot)throw stop('mode');
  }
  snapshot=await run('composer');
  if(!snapshot.label)throw stop('recipients');
  const label=snapshot.label;

  // 6. One trusted click on 보내기, armed in the same task as the last content comparison.
  onStep(6);
  const armed=await until(async()=>{const a=await run('arm-send',{title:note.title,body,names,label});return a.ready?a:null;},t.settle,250);
  if(!armed)throw stop('click');
  await beforeSend();
  try{await cdp.click(armed.x,armed.y);}
  catch(error){if(error.pressed)sent=true;throw stop('click',sent);}
  const delivery=await until(async()=>{const a=await quiet('armed',{token:armed.token});return a&&(a.clicked||a.blocked)?a:null;},2000,50);
  // Blocked or never arrived on the button: provably nothing was sent.
  if(delivery&&!delivery.clicked)throw stop('click');
  if(!delivery){const a=await quiet('armed',{token:armed.token});if(a&&!a.unknown&&!a.events)throw stop('click');}
  sent=true;

  // The service's own confirmation (if any), then its result screen.
  let confirmed=false;
  const arrived=await until(async()=>{
   if(cdp.nativeDialog())throw stop('native-dialog',true);
   const now=await quiet('outcome');if(!now)return null;
   const r=flow.route(now.url);
   if(['board','result'].includes(r.kind)&&r.groupId===link.groupId&&now.board&&!now.composer)return true;
   if(now.dialogs.length){
    const decision=now.dialogs.length===1?flow.confirmDialog(now.dialogs[0]):{action:'unknown'};
    if(decision.action!=='confirm')throw stop('dialog',true);
    if(!confirmed){
     const a=await quiet('arm-dialog',{button:decision.button,label:now.dialogs[0].buttons[decision.button]});
     if(a?.ready){await cdp.click(a.x,a.y);confirmed=true;}
    }
   }
   return null;
  },t.result,200);
  if(!arrived)throw stop('no-result',true);

  // 7. Fresh board read: exactly one new post equal to what was sent.
  onStep(7);
  await open(link.url);
  let status='missing',reloaded=false;
  const started=Date.now();
  const verdict=await until(async()=>{
   if(!reloaded&&Date.now()-started>t.verify/2){reloaded=true;await open(link.url);}
   const now=await quiet('board',{title:note.title});
   if(!now?.known)return null;
   const result=flow.judge(baseline,now,expected);status=result.status;
   return result.status==='success'?result:null;
  },t.verify,500);
  if(!verdict)throw stop('unverified-'+status,true);
  return {status:'success',postId:verdict.postId};
 }catch(error){
  if(error.userMessage)throw error;
  throw stop(error.code||'structure',sent);
 }
}
module.exports={publish,stop,MESSAGES};
