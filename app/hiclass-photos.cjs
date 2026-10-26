// The production driver is created in the main process, never supplied by renderer IPC.
// Missing or changed service contracts must still block photo publication.
const crypto=require('node:crypto');
const {validateRef}=require('./media-store.cjs');
const UNSUPPORTED='하이클래스 사진 첨부 연결을 확인하지 못했습니다. 등록하지 않았으며 본문과 사진은 초안에 보존됩니다.';
function ids(photos=[]){if(!Array.isArray(photos)||photos.length>20)throw Error('첨부 사진은 최대 20장입니다.');return photos.map(validateRef);}
function digest(payload){const content=[payload.classKey,payload.date,payload.title,payload.body,payload.parents!==false,payload.students!==false],photos=ids(payload.photos);if(photos.length)content.push(photos);return crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');}
function same(actual,expected){return Array.isArray(actual)&&actual.length===expected.length&&actual.every((id,i)=>id===expected[i]);}
const transactions=new WeakMap();
async function prepare(w,payload,driver){
 const expected=ids(payload.photos);transactions.delete(w);if(!expected.length)return;
 if(!driver)throw Error(UNSUPPORTED);
 const receipts=[];for(const [index,photo]of payload.photos.entries()){
  const receipt=await driver.upload(photo,index);
  if(!receipt||receipt.contentId!==expected[index]||receipt.complete!==true||typeof receipt.remoteId!=='string'||!receipt.remoteId)throw Error('사진 업로드 완료를 확인하지 못했습니다. 등록하지 않았습니다.');
  receipts.push(receipt);
 }
 if(!same(await driver.editor(receipts),expected))throw Error('사진 첨부 개수·내용·순서가 초안과 다릅니다. 등록하지 않았습니다.');
 transactions.set(w,{expected,receipts,driver});
}
async function verify(w,payload,published=false){
 const expected=ids(payload.photos);if(!expected.length)return true;const tx=transactions.get(w);
 if(!tx||!same(tx.expected,expected))throw Error(UNSUPPORTED);
 if(!same(await tx.driver[published?'published':'editor'](tx.receipts),expected))throw Error(published?'등록된 사진을 확인하지 못했습니다. 자동 재전송하지 말고 하이클래스에서 확인해 주세요.':'사진 첨부 완료 상태가 변경되었습니다. 등록하지 않았습니다.');
 return true;
}
function forget(w){transactions.delete(w);}
module.exports={prepare,verify,forget,digest,ids,UNSUPPORTED};
