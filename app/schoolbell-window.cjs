'use strict';
// Connection diagnostics only: no cookies, account IDs, URLs or page text leave
// this module. A loaded class page is not authentication/authority evidence.
const {bounded}=require('./hiclass-navigation.cjs');
const {safeURL}=require('./diary-services.cjs');
const {isLoginOrigin}=require('./schoolbell-login-navigation.cjs');
const states=new WeakMap();
const messages=Object.freeze({
 closed:'앱 전용 학교종이 창을 열어 직접 로그인해 주세요.',
 loading:'학교종이 화면을 불러오는 중입니다.',
 'navigation-blocked':'허용되지 않은 주소로 이동하려 해 중단했습니다. 연결하기로 공식 HTTPS 화면을 다시 여세요.',
 'network-failed':'학교종이 서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 연결하기를 다시 눌러 주세요.',
 timeout:'학교종이 화면 연결 시간이 초과되었습니다. 연결하기를 다시 눌러 주세요.',
 'renderer-gone':'학교종이 창이 응답을 멈췄습니다. 연결하기를 다시 눌러 주세요.',
 'login-required':'학교종이 로그인 화면이 열렸습니다. 이 앱 전용 창에서 직접 로그인해 주세요.',
 'external-login':'앱 전용 웨일스페이스 인증 창에서 직접 로그인해 주세요. 학교종이로 돌아온 뒤 담당 학급을 확인합니다.',
 'class-page-open':'담당 학급 화면이 열려 있습니다. 연결 상태 확인으로 학교·학급·교사 권한을 확인해 주세요.',
 'page-open':'학교종이 창이 열렸습니다. 직접 로그인한 뒤 담당 학급의 알림장을 여세요.'
});
function watch(w){
 const state={loading:false,problem:null,blockedHost:null};states.set(w,state);
 const wc=w.webContents;
 wc.on('did-start-navigation',(_e,_url,inPlace,mainFrame)=>{if(mainFrame){state.loading=!inPlace;state.problem=null;state.blockedHost=null;}});
 wc.on('did-fail-load',(_e,code,_description,_url,mainFrame)=>{
  if(mainFrame&&code!==-3){state.problem='network-failed';state.loading=false;w.schoolbellLoadFailed=true;}
 });
 wc.on('did-finish-load',()=>{state.loading=false;if(!state.problem)w.schoolbellLoadFailed=false;});
 wc.on('render-process-gone',()=>{state.problem='renderer-gone';state.loading=false;w.schoolbellLoadFailed=true;});
 return {block(url){
  state.problem='navigation-blocked';state.loading=false;w.schoolbellLoadFailed=true;
  // Host only, transient. Never retain an OAuth query, fragment or credential.
  try{const u=new URL(url);state.blockedHost=/^[a-z0-9.-]+$/.test(u.hostname)?u.hostname:null;}catch{state.blockedHost=null;}
 }};
}
function describe(w){
 let state='closed';
 if(w&&!w.isDestroyed()){
  const info=states.get(w);
  if(info?.problem)state=info.problem;
  else if(info?.loading||w.webContents.isLoadingMainFrame())state='loading';
  else {
   try{
    const u=new URL(w.webContents.getURL());
    if(isLoginOrigin(u.href))state='external-login';
    else {safeURL(u.href);state=/\/(?:gate|login|signin)(?:\/|$)/.test(u.pathname)?'login-required':
     /^\/ko\/main\/group\/\d+\/boards\/(?:write\/)?classnews(?:\/posts\/\d+)?$/.test(u.pathname)?'class-page-open':'page-open';
    }
   }catch{state='network-failed';}
  }
 }
 const host=state==='navigation-blocked'?states.get(w)?.blockedHost:null;
 return {state,message:messages[state]+(host?' 차단된 연결 호스트: '+host:'')};
}
async function load(w,url,timeoutMs=20000,allow=safeURL){
 const info=states.get(w);if(!info)throw Error('Window not watched');
 info.problem=null;info.blockedHost=null;info.loading=true;
 try{
  await bounded(async()=>{
   if(!allow(url))throw Error('Unsafe destination');
   try{await w.loadURL(url);}catch(error){
    // Schoolbell redirects its public entry to v4 via script. Chromium can
    // abort the initial load even when the permitted replacement is healthy.
    if(error.code!=='ERR_ABORTED'&&error.errno!==-3)throw error;
    while(!w.isDestroyed()&&w.webContents.isLoadingMainFrame()&&!info.problem)await new Promise(r=>setTimeout(r,50));
    if(w.isDestroyed()||info.problem)throw error;
    if(!isLoginOrigin(w.webContents.getURL()))safeURL(w.webContents.getURL());
   }
  },timeoutMs,()=>{
   info.problem='timeout';info.loading=false;w.schoolbellLoadFailed=true;
   if(!w.isDestroyed())w.webContents.stop();
  });
  if(info.problem)throw Error('Connection failed');
  w.schoolbellLoadFailed=false;
 }catch{
  if(!info.problem)info.problem='network-failed';info.loading=false;w.schoolbellLoadFailed=true;
  const error=Error('Schoolbell connection unavailable');
  error.schoolbellUserMessage=describe(w).message+' 초안과 사진은 유지됩니다.';throw error;
 }
}
module.exports={watch,describe,load};
