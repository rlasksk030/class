// Interactive authentication is user initiated. Background tasks never create native popups.
function popup(url,interactive){
 let u;try{u=new URL(url);}catch{return {action:'deny'};}
 if(u.protocol!=='https:')return {action:'deny'};
 if(interactive)return {action:'allow',overrideBrowserWindowOptions:{show:false,skipTaskbar:true,webPreferences:{partition:'persist:hiclass-teacher',contextIsolation:true,nodeIntegration:false,sandbox:true}}};
 const auth=/(^|[./_-])(login|signin|oauth|authorize|auth)([./_?=-]|$)/i.test(u.hostname+u.pathname);
 return {action:'deny',message:auth?'하이클래스 로그인이 만료되었습니다. 다시 로그인해 주세요.':'하이클래스가 별도 창 처리를 요청해 자동 등록을 중단했습니다. 연결 변경에서 하이클래스 상태를 확인해 주세요. 작성 내용은 유지됩니다.'};
}
function assertBackground(w){if(w.hiclassBackgroundError)throw Error(w.hiclassBackgroundError);}
function controller({reveal}){
 const windows=new Set();let interactive=false,root;
 const hide=w=>{if(!w.isDestroyed()){w.hide();w.setSkipTaskbar(true);w.setFocusable(false);}};
 const show=w=>{w.setFocusable(true);w.setSkipTaskbar(false);reveal(w);};
 function track(w){
  windows.add(w);
  w.webContents.setWindowOpenHandler(({url})=>{const p=popup(url,interactive);if(p.message&&root)root.hiclassBackgroundError=p.message;const {message,...decision}=p;return decision;});
  w.webContents.on('did-create-window',child=>{track(child);if(interactive)show(child);else hide(child);});
  w.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith('https://'))e.preventDefault();});
  w.on('closed',()=>windows.delete(w));
 }
 return {
  attach(w){root=w;track(w);},
  mode(visible){interactive=visible;if(root)root.hiclassBackgroundError=null;for(const w of windows){if(visible&&w===root)show(w);else hide(w);}},
  finish(){interactive=false;for(const w of windows)hide(w);},
  all(){return [...windows].filter(w=>!w.isDestroyed());}
 };
}
module.exports={popup,assertBackground,controller};
