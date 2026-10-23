// Immutable, content-addressed local photos. No automatic deletion: drafts, history and undo may refer to them.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const MAX_FILE=10*1024*1024,MAX_PIXELS=16000000,MAX_LIBRARY=128*1024*1024,MAX_BACKUP=200*1024*1024;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const invalid=()=>Error('손상되었거나 지원하지 않는 사진입니다. PNG 또는 JPEG 사진을 선택해 주세요.');
function dimensions(b){
 if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){
  let pos=8,first=true,end=false,width,height;
  while(pos+12<=b.length){const len=b.readUInt32BE(pos),type=b.toString('ascii',pos+4,pos+8);if(len>b.length-pos-12)throw invalid();
   if(first){if(type!=='IHDR'||len!==13)throw invalid();width=b.readUInt32BE(pos+8);height=b.readUInt32BE(pos+12);first=false;}
   // Check every chunk, not just the signature; a partially decoded PNG must not be accepted.
   let crc=0xffffffff;for(let i=pos+4;i<pos+8+len;i++){crc^=b[i];for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
   if(((crc^0xffffffff)>>>0)!==b.readUInt32BE(pos+8+len))throw invalid();
   pos+=len+12;if(type==='IEND'){if(len!==0||pos!==b.length)throw invalid();end=true;break;}
  }
  if(!end)throw invalid();return {ext:'png',width,height};
 }
 if(b[0]===255&&b[1]===216&&b.at(-2)===255&&b.at(-1)===217){
  let pos=2;while(pos+4<b.length){if(b[pos++]!==255)throw invalid();while(b[pos]===255)pos++;const marker=b[pos++];if(marker===218)break;const len=b.readUInt16BE(pos);if(len<2||pos+len>b.length)throw invalid();
   if([192,193,194].includes(marker)){if(len<8)throw invalid();return {ext:'jpg',width:b.readUInt16BE(pos+5),height:b.readUInt16BE(pos+3)};}pos+=len;
  }
 }
 throw invalid();
}
function validateRef(ref){if(!ref||typeof ref.id!=='string'||!/^([a-f0-9]{64})\.(png|jpg)$/.test(ref.id))throw invalid();return ref.id;}
function references(data){
 const all=[...Object.values(data?.diaryDrafts||{}).flatMap(d=>d?.photos||[]),...Object.values(data?.diaryRegistrationHistory||{}).flatMap(rows=>Array.isArray(rows)?rows.flatMap(d=>d?.photos||[]):[]),...(data?.whiteboardContents?.blocks||[]).filter(b=>b.type==='image').map(b=>b.photo)];
 const refs=new Map();for(const r of all)refs.set(validateRef(r),r);return [...refs.values()];
}
function createStore(root,decode){
 const dir=path.join(root,'media');let queue=Promise.resolve();
 async function directory(create=true){if(create)await fs.mkdir(dir,{recursive:true,mode:0o700});const s=await fs.lstat(dir);if(!s.isDirectory()||s.isSymbolicLink())throw Error('사진 저장 폴더를 확인해 주세요.');}
 function inspect(bytes,name=''){
  const b=Buffer.from(bytes);if(!b.length||b.length>MAX_FILE)throw Error('사진은 한 장당 10 MB 이하로 추가해 주세요.');
  const info=dimensions(b);if(!info.width||!info.height||info.width>8192||info.height>8192||info.width*info.height>MAX_PIXELS)throw Error('사진은 8192 픽셀 이하, 1600만 픽셀 이하로 추가해 주세요.');
  const extension=path.extname(String(name)).toLowerCase();if(extension&&!((info.ext==='png'&&extension==='.png')||(info.ext==='jpg'&&['.jpg','.jpeg'].includes(extension))))throw Error('파일 확장자와 실제 사진 형식이 다릅니다. PNG 또는 JPEG로 다시 저장해 주세요.');
  const size=decode(b);if(!size||!size.width||!size.height||size.width*size.height>MAX_PIXELS)throw invalid();
  // Native decoder may apply JPEG orientation. Keep those display dimensions, preserving the original bytes.
  return {b,ref:{id:hash(b)+'.'+info.ext,width:size.width,height:size.height,size:b.length,name:path.basename(String(name)).replace(/[\x00-\x1f]/g,'').slice(0,120)||'붙여넣은 사진.'+info.ext}};
 }
 async function read(ref){await directory(false);const id=validateRef(ref),file=path.join(dir,id),s=await fs.lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>MAX_FILE)throw invalid();const b=await fs.readFile(file);if(hash(b)!==id.split('.')[0])throw Error('저장된 사진이 손상되었습니다. 백업 파일을 확인해 주세요.');return b;}
 async function store(bytes,name){const {b,ref}=inspect(bytes,name);await directory();const file=path.join(dir,ref.id);try{await read(ref);return ref;}catch(e){if(e.code!=='ENOENT')throw e;}
  let total=0;for(const n of await fs.readdir(dir)){const s=await fs.lstat(path.join(dir,n));total+=s.size;}if(total+b.length>MAX_LIBRARY)throw Error('앱 사진 보관 용량 128 MB에 도달했습니다. 기존 사진은 보존됩니다.');
  // Exclusive creation prevents collisions and following a pre-existing symbolic link.
  const temp=path.join(dir,crypto.randomUUID()+'.tmp'),handle=await fs.open(temp,'wx',0o600);try{await handle.writeFile(b);await handle.sync();await handle.close();await fs.rename(temp,file);}catch(e){await handle.close().catch(()=>{});await fs.rm(temp,{force:true});throw e;}return ref;
 }
 const add=(bytes,name)=>{const task=queue.then(()=>store(bytes,name));queue=task.catch(()=>{});return task;};
 async function pack(data){const out={};for(const r of references(data))out[r.id]=(await read(r)).toString('base64');return out;}
 async function restore(data,media={}){
  const refs=references(data);if(!media||typeof media!=='object'||Array.isArray(media))throw invalid();
  // Verify all files before writing any reference into the data store.
  const pending=[];for(const r of refs){const encoded=media[r.id];if(typeof encoded!=='string'||encoded.length>Math.ceil(MAX_FILE/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw Error('백업에 필요한 사진이 없거나 손상되었습니다. 복원하지 않았습니다.');const b=Buffer.from(encoded,'base64'),checked=inspect(b,r.id);if(checked.ref.id!==r.id||checked.ref.width!==r.width||checked.ref.height!==r.height||checked.ref.size!==r.size)throw invalid();pending.push({b,id:r.id});}
  for(const p of pending)await add(p.b,p.id);
  return true;
 }
 return {add,read,pack,restore,inspect};
}
module.exports={createStore,references,validateRef,dimensions,MAX_FILE,MAX_PIXELS,MAX_LIBRARY,MAX_BACKUP,hash};
