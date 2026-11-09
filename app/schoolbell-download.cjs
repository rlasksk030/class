'use strict';
// Ordinary renderer UI downloads only. No private endpoints, URL fetch, cookies
// or authentication export. Shared by post and pre-publication original checks.
const fs=require('node:fs/promises');
const {MAX_FILE,dimensions}=require('./media-store.cjs');
async function downloadOriginal({webContents:wc,activate,destination,signal,timeoutMs=15000,errorMessage='publication-unverified'}){
 let item,timer,onDownload,onAbort,settled=false;
 const result=new Promise((resolve,reject)=>{
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);wc.session.removeListener('will-download',onDownload);signal.removeEventListener('abort',onAbort);if(error){item?.cancel();reject(error);}else resolve(value);};
  onAbort=()=>finish(Error(errorMessage));
  onDownload=(_event,download,source)=>{
   if(source!==wc||item)return;
   item=download;wc.session.removeListener('will-download',onDownload);
   if(item.getTotalBytes()>MAX_FILE){finish(Error(errorMessage));return;}
   item.setSavePath(destination);
   item.on('updated',()=>{if(item.getReceivedBytes()>MAX_FILE)finish(Error(errorMessage));});
   item.once('done',(_event,state)=>state==='completed'?finish(null,destination):finish(Error(errorMessage)));
  };
  wc.session.on('will-download',onDownload);signal.addEventListener('abort',onAbort,{once:true});
  timer=setTimeout(onAbort,timeoutMs);if(signal.aborted)onAbort();
 });
 const pending=result.then(file=>({file}),error=>({error}));
 try{if(signal.aborted)throw Error(errorMessage);await activate();}catch(error){onAbort();await pending;throw error;}
 const outcome=await pending;if(outcome.error)throw outcome.error;
 const stat=await fs.stat(outcome.file);if(!stat.size||stat.size>MAX_FILE)throw Error(errorMessage);
 const bytes=await fs.readFile(outcome.file);dimensions(bytes);return bytes;
}
module.exports={downloadOriginal};
