'use strict';
// Draft photos -> Schoolbell attachments. Originals come from the app's media store (already
// hash-verified on read) and are handed to the service's own file input in draft order.
// Completion is judged the HiClass way: upload finished, same count, same order.
const {validateRef}=require('./media-store.cjs');
const flow=require('./schoolbell-flow.cjs');
const adapter=require('./schoolbell-adapter.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function refs(photos=[]){
 if(!Array.isArray(photos)||photos.length>20)throw Error('첨부 사진은 최대 20장입니다.');
 return photos.map(validateRef);
}
// read(ref) -> Buffer of the stored original; throws when the stored file is missing or damaged.
async function load(photos,read){
 const ids=refs(photos),names=flow.uploadNames(ids.map(id=>({id}))),files=[];
 for(let i=0;i<ids.length;i++){
  const bytes=Buffer.from(await read({id:ids[i]}));
  files.push({name:names[i],type:ids[i].endsWith('.png')?'image/png':'image/jpeg',size:bytes.length,base64:bytes.toString('base64')});
 }
 return files;
}
// Hand the files over once and wait until the composer lists exactly these names with no upload running.
// idleIndicator: the empty composer already showed an upload/progress element, so its presence
// says nothing; then the list must simply show the right names on two reads in a row.
async function attach(wc,files,{timeoutMs=60000+files.length*30000,idleIndicator=false}={}){
 if(!files.length)return;
 for(const [index,f] of files.entries())await adapter.run(wc,'file-add',{index,name:f.name,type:f.type,size:f.size,base64:f.base64});
 await adapter.run(wc,'files',{names:files.map(f=>f.name)});
 const names=files.map(f=>f.name),end=Date.now()+timeoutMs;
 let steady=0,last=null;
 while(Date.now()<end){
  const snapshot=await adapter.run(wc,'composer'),state=snapshot.files;last=snapshot.probe;
  // An error dialog during the upload ends the wait; nothing has been sent yet.
  if(snapshot.dialogs)break;
  const listed=state.known&&flow.sameNames(state.names,names);
  if(listed&&!state.uploading)return;
  steady=listed&&idleIndicator?steady+1:0;
  if(steady>=4)return;
  await sleep(250);
 }
 throw Object.assign(Error('upload'),{code:'upload',detail:last?{reason:'upload',...last}:undefined});
}
module.exports={refs,load,attach};
