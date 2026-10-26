const message='하이클래스 연결 시간이 초과되었습니다. 인터넷 연결을 확인하고 다시 연결해 주세요. 작성 내용은 유지됩니다.';
async function bounded(action,ms=20000,onTimeout=()=>{}){
 let timer;
 try{return await Promise.race([Promise.resolve().then(action),new Promise((_,reject)=>{timer=setTimeout(()=>{try{onTimeout();}finally{reject(Error(message));}},ms);})]);}
 finally{clearTimeout(timer);}
}
function reveal(w){if(w.isMinimized())w.restore();w.show();w.focus();}
async function ready(w,url,ms=20000){
 const current=w.webContents.getURL();
 if(!current||current==='about:blank'||w.hiclassLoadFailed){
  try{await bounded(()=>w.loadURL(url),ms,()=>{if(!w.isDestroyed())w.webContents.stop();});w.hiclassLoadFailed=false;}
  catch(error){w.hiclassLoadFailed=true;throw error;}
 }else if(w.webContents.isLoadingMainFrame()){
  let expired=false;
  await bounded(async()=>{while(!expired&&!w.isDestroyed()&&w.webContents.isLoadingMainFrame())await new Promise(resolve=>setTimeout(resolve,100));if(w.isDestroyed())throw Error('하이클래스 창이 닫혔습니다. 다시 연결해 주세요.');},ms,()=>{expired=true;w.hiclassLoadFailed=true;if(!w.isDestroyed())w.webContents.stop();});
 }
}
module.exports={bounded,reveal,ready};
