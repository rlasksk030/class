'use strict';
// Schoolbell windows. Two kinds share one persistent login partition per class:
//  - visible(): the ordinary window where the teacher logs in and opens the class notice board;
//  - worker(): a background window for the session check and for publishing.
// The worker renders offscreen. It never appears on screen or in the taskbar and never takes
// focus, but unlike a hidden ordinary window it keeps producing frames, so the service's
// animated dialogs and loading covers finish normally.
// Navigation stays on the official Schoolbell hosts plus the service's own login provider
// (schoolbell-login-navigation.cjs); new windows and permission requests are refused.
const {BrowserWindow}=require('electron');
const {createLoginNavigation}=require('./schoolbell-login-navigation.cjs');
const TIMEOUT='학교종이 연결 시간이 초과되었습니다. 인터넷 연결을 확인하고 다시 시도해 주세요. 작성 내용은 유지됩니다.';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function bounded(action,ms=20000,onTimeout=()=>{}){
 let timer;
 try{return await Promise.race([Promise.resolve().then(action),new Promise((_,reject)=>{timer=setTimeout(()=>{try{onTimeout();}finally{reject(Object.assign(Error(TIMEOUT),{code:'timeout'}));}},ms);})]);}
 finally{clearTimeout(timer);}
}
function guard(w,interactive){
 const wc=w.webContents,login=createLoginNavigation();
 wc.session.setPermissionRequestHandler((_wc,_permission,done)=>done(false));
 wc.session.setPermissionCheckHandler(()=>false);
 const navigate=(event,url)=>{if(!login.allow(url,wc.getURL())){event.preventDefault();w.schoolbellBlocked=true;}};
 wc.on('will-navigate',navigate);wc.on('will-redirect',navigate);
 // Never a second window. A permitted login link opens in the same visible window instead.
 wc.setWindowOpenHandler(({url})=>{
  if(interactive&&login.allow(url,wc.getURL()))load(w,url).catch(()=>{});
  else w.schoolbellBlocked=true;
  return {action:'deny'};
 });
 wc.on('did-fail-load',(_event,code,_description,_url,mainFrame)=>{if(mainFrame&&code!==-3)w.schoolbellLoadFailed=true;});
}
const preferences=partition=>({partition,contextIsolation:true,nodeIntegration:false,sandbox:true});
function visible(partition){
 const w=new BrowserWindow({width:1200,height:850,show:false,title:'학교종이 연결',webPreferences:preferences(partition)});
 w.removeMenu();guard(w,true);return w;
}
function worker(partition){
 // CLASSROOM_SCHOOLBELL_VISIBLE=1 (development only): watch the background run in an ordinary window.
 const watch=process.env.CLASSROOM_SCHOOLBELL_VISIBLE==='1';
 const w=new BrowserWindow({width:1280,height:900,show:false,skipTaskbar:!watch,focusable:watch,title:'학교종이 등록',
  webPreferences:{...preferences(partition),offscreen:!watch,backgroundThrottling:false,disableDialogs:true}});
 w.removeMenu();guard(w,false);
 const wc=w.webContents;
 wc.setAudioMuted(true);
 if(watch)w.showInactive();else wc.setFrameRate(20);
 // The background window may always leave a page; nothing the teacher typed lives there.
 wc.on('will-prevent-unload',event=>event.preventDefault());
 wc.on('did-finish-load',()=>{try{wc.setZoomFactor(1);}catch{}});
 return w;
}
function reveal(w){if(w.isMinimized())w.restore();w.show();w.focus();}
// The public entry redirects by script, which can abort the first load although the permitted
// replacement page loads fine. Wait for that replacement instead of failing.
async function load(w,url,ms=20000){
 w.schoolbellLoadFailed=false;w.schoolbellBlocked=false;
 await bounded(async()=>{
  try{await w.loadURL(url);}catch(error){
   if(error.code!=='ERR_ABORTED'&&error.errno!==-3)throw error;
   while(!w.isDestroyed()&&w.webContents.isLoadingMainFrame())await sleep(50);
   if(w.isDestroyed())throw error;
  }
 },ms,()=>{if(!w.isDestroyed())w.webContents.stop();});
}
module.exports={TIMEOUT,bounded,sleep,visible,worker,reveal,load};
