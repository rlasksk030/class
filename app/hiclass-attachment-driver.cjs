// Real service driver, based on HiClass's public production PostEditModal,
// ImagePackGrid, uploadEncoded and PostCard sources. See the v1.8.7 release record.
// Uses the service's normal input/change/upload pipeline and existing session.
// It never reads tokens, cookies, auth headers or unrelated response bodies.
const {randomUUID}=require('node:crypto');
const {assertBackground}=require('./hiclass-window.cjs');
const {validateRef}=require('./media-store.cjs');
const {postState}=require('./hiclass-posts.cjs');

async function pageDriver(key,action,arg,readPosts){
 const titleSelector='textarea[placeholder="제목을 입력하세요."]';
 const visible=e=>!!e?.getClientRects().length;
 const fail=code=>{throw Error(code);};
 const sha=async file=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
 // Compare full server paths, not filenames. The image host serves resized originals.
 const identity=value=>{try{const u=new URL(value,location.href);if(u.protocol!=='https:'||!['download.hiclass.net','image.hiclass.net','file.hiclass.net'].includes(u.hostname))return '';return (u.hostname==='image.hiclass.net'?'download.hiclass.net':u.hostname)+u.pathname;}catch{return '';}};
 let state=window[key];
 if(action==='dispose'){
  if(state){state.closed=true;if(window.fetch===state.wrapper)window.fetch=state.fetch;for(const name of state.events)document.removeEventListener(name,state.lock,true);delete window[key];}
  return true;
 }
 if(action==='init'){
  if(state||location.origin!=='https://www.hiclass.net'||location.href!==arg.url)fail('page');
  const titles=[...document.querySelectorAll(titleSelector)].filter(visible),bodies=[...document.querySelectorAll('.fr-element.fr-view[contenteditable="true"]')].filter(visible);
  if(titles.length!==1||bodies.length!==1)fail('structure');
  const inputs=[...document.querySelectorAll('input[type="file"][accept="image/*"][multiple]')].filter(e=>visible(e.parentElement)&&e.parentElement.querySelector('[aria-label="묶음 사진 추가"]'));
  if(inputs.length!==1)fail('structure');
  const input=inputs[0],grid=input.parentElement;
  let root=titles[0].parentElement;
  while(root&&(!root.contains(bodies[0])||!root.contains(grid)))root=root.parentElement;
  if(!root||root===document.body||root===document.documentElement||grid.querySelector('[aria-label^="사진 "]'))fail('structure');
  state=window[key]={input,grid,root,href:location.href,fetch:window.fetch,receipts:[],active:null,error:'',closed:false,before:readPosts(arg.payload).ids,events:['pointerdown','click','keydown','input','change','drop','paste']};
  // This window is hidden by the normal background flow. Prevent trusted user
  // edits from mixing a second file with the currently observed upload.
  state.lock=e=>{if(e.isTrusted){e.preventDefault();e.stopImmediatePropagation();}};
  for(const name of state.events)document.addEventListener(name,state.lock,true);
  state.wrapper=async function(resource,options){
   let endpoint;try{endpoint=new URL(typeof resource==='string'?resource:resource.url,location.href);}catch{return state.fetch.call(this,resource,options);}
   if(endpoint.origin!=='https://file.hiclass.net'||endpoint.pathname!=='/multipart')return state.fetch.call(this,resource,options);
   const op=state.active;
   try{
    if(state.closed||state.error||!op||op.receipt||location.href!==state.href)fail('upload-state');
    const form=options?.body,files=form instanceof FormData?form.getAll('file'):[];
    if(options?.method?.toUpperCase()!=='POST'||!(form instanceof FormData)||form.get('encode')!=='true'||files.length!==1||!(files[0] instanceof File))fail('upload-contract');
    const file=files[0];
    // HiClass compresses the original before uploading. Bind the original hash,
    // the actual compressed request hash and its server response in one operation.
    if(file.name!==op.contentId||!file.type.startsWith('image/')||!file.size||file.size>10*1024*1024)fail('upload-file');
    const requestHash=await sha(file);
    if(op.requestHash&&op.requestHash!==requestHash)fail('upload-changed');
    op.requestHash=requestHash;op.attempts++;
    if(op.attempts>2||(op.attempts===2&&op.lastStatus!==401))fail('upload-repeated');
    const response=await state.fetch.call(this,resource,options);op.lastStatus=response.status;
    // Only the service's existing 401 refresh may retry; this driver never retries.
    if(response.status===401&&op.attempts===1)return response;
    if(!response.ok)fail('upload-http');
    const data=await response.clone().json(),original=data?._links?.original?.href,thumbnail=data?._links?.thumbnail?.href;
    if(!identity(original)||typeof data.size!=='number'||data.size<=0||!/^image\//.test(data.contentType||file.type))fail('upload-response');
    if(thumbnail&&!identity(thumbnail))fail('upload-response');
    if(state.closed||location.href!==state.href||state.active!==op)fail('page');
    op.receipt={contentId:op.contentId,remoteId:original,thumbnail:thumbnail||'',requestHash,complete:true};
    return response;
   }catch{state.error='upload';throw Error('사진 업로드 완료를 확인하지 못했습니다.');}
  };
  window.fetch=state.wrapper;return true;
 }
 if(!state||state.closed||state.error||location.href!==state.href||window.fetch!==state.wrapper)fail('page');
 const items=()=>[...state.grid.querySelectorAll('[role="button"][aria-label^="사진 "]')].map((e,i)=>({label:e.getAttribute('aria-label'),src:e.querySelector('img')?.src||'',loaded:!!e.querySelector('img')?.complete&&e.querySelector('img').naturalWidth>0,index:i}));
 const matches=(list,receipts,published=false)=>list.length===receipts.length&&list.every((item,i)=>item.label===(published?`묶음 사진 ${i+1} 크게 보기`:`사진 ${i+1} 편집`)&&item.loaded&&[receipts[i].remoteId,receipts[i].thumbnail].filter(Boolean).some(url=>identity(url)&&identity(url)===identity(item.src)));
 const ready=()=>state.input.isConnected&&state.grid.isConnected&&!!state.grid.querySelector('[aria-label="묶음 사진 추가"]')&&!state.grid.querySelector('.animate-spin');
 if(action==='upload'){
  if(state.active||arg.index!==state.receipts.length||!ready()||!matches(items(),state.receipts))fail('editor-changed');
  const bytes=Uint8Array.from(atob(arg.bytes),c=>c.charCodeAt(0)),file=new File([bytes],arg.id,{type:arg.id.endsWith('.png')?'image/png':'image/jpeg'});
  if(await sha(file)!==arg.id.split('.')[0])fail('source-hash');
  const transfer=new DataTransfer();transfer.items.add(file);state.input.files=transfer.files;
  if(state.input.files.length!==1||await sha(state.input.files[0])!==arg.id.split('.')[0])fail('input-hash');
  state.active={contentId:arg.id,attempts:0,requestHash:'',lastStatus:0};
  state.input.dispatchEvent(new Event('change',{bubbles:true}));return true;
 }
 if(action==='status'){
  if(document.querySelector('.swal2-popup')||!state.input.isConnected)fail('upload-dialog');
  const receipt=state.active?.receipt;
  if(!receipt||!ready())return null;
  if(!matches(items(),[...state.receipts,receipt]))return null;
  state.receipts.push(receipt);state.active=null;return receipt;
 }
 const receipts=arg.receipts;
 if(!Array.isArray(receipts)||receipts.length!==state.receipts.length||receipts.some((r,i)=>r.contentId!==state.receipts[i].contentId||r.remoteId!==state.receipts[i].remoteId||r.requestHash!==state.receipts[i].requestHash))fail('receipts');
 if(action==='editor')return !state.active&&ready()&&matches(items(),receipts)?receipts.map(r=>r.contentId):[];
 if(action==='published'){
  if(document.querySelector(titleSelector))return [];
  const posts=readPosts(arg.payload).matches.filter(p=>p.modern&&p.id&&!state.before.includes(p.id));
  return posts.length===1&&matches(posts[0].images,receipts,true)?receipts.map(r=>r.contentId):[];
 }
 fail('action');
}

function create(w,payload,link){
 const key='__classroomPhotos_'+randomUUID().replaceAll('-','');let initialized=false;
 const call=(action,arg={})=>{if(action!=='dispose')assertBackground(w);return w.webContents.executeJavaScript(`(${pageDriver.toString()})(${JSON.stringify(key)},${JSON.stringify(action)},${JSON.stringify(arg)},${postState.toString()})`);};
 const pause=()=>new Promise(r=>setTimeout(r,200));
 return {
  async upload(ref,index){
   try{
    if(!initialized){await call('init',{url:link.url,payload:{title:payload.title,body:payload.body}});initialized=true;}
    const id=validateRef(ref),bytes=await require('./media.cjs').current().read(ref);
    await call('upload',{id,index,bytes:bytes.toString('base64')});
    const end=Date.now()+90000;
    while(Date.now()<end){const receipt=await call('status');if(receipt)return receipt;await pause();}
   }catch{}
   throw Error(`${index+1}번째 사진의 업로드 완료를 확인하지 못해 등록을 중단했습니다. 연결·로그인 상태와 사진을 확인해 주세요. 본문과 사진은 초안에 보존됩니다.`);
  },
  async editor(receipts){try{return await call('editor',{receipts});}catch{return []; }},
  async published(receipts){
   const end=Date.now()+20000;
   while(Date.now()<end){try{const ids=await call('published',{receipts,payload:{title:payload.title,body:payload.body}});if(ids.length===receipts.length)return ids;}catch{return []; }await pause();}
   return [];
  },
  async dispose(){try{await call('dispose');}catch{}initialized=false;}
 };
}
module.exports={create};
