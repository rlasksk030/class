const {findRecipientControls,messages}=require('./hiclass-recipients.cjs');
const titleSelector='textarea[placeholder="제목을 입력하세요."]';
const pause=()=>new Promise(r=>setTimeout(r,100));
// Renderer functions are deliberately self-contained and never return draft content.
function confirmation(){
 const visible=e=>!!e?.getClientRects().length;
 const normalize=s=>String(s||'').replace(/\s+/g,' ').trim();
 const kinds={'작성한 내용을 지금 클래스 구성원들에게 보내시겠습니까?':'publish','임시 저장한 게시물은 클래스 구성원에게 공개되지 않습니다. 임시 저장하시겠습니까?':'draft','수신대상이 없는 게시글은 클래스 선생님만 확인이 가능합니다. 게시글을 등록하시겠습니까?':'teachers'};
 const dialogs=[...new Set(document.querySelectorAll('.swal2-popup[role="dialog"],[role="dialog"][aria-modal="true"],[role="alertdialog"]'))].filter(e=>visible(e)&&!e.querySelector('textarea[placeholder="제목을 입력하세요."]'));
 if(dialogs.length!==1)return {error:dialogs.length?'ambiguous-popup':'missing-popup'};
 const dialog=dialogs[0],content=dialog.querySelector('.swal2-html-container');let text='';
 if(content)text=normalize(content.textContent);
 else{const walker=document.createTreeWalker(dialog,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const n=walker.currentNode;if(!n.parentElement.closest('button,[role=button],a,[aria-hidden=true]'))text+=' '+n.textContent;}text=normalize(text);}
 const kind=kinds[text];if(!kind)return {error:'unknown-popup'};
 const buttons=[...dialog.querySelectorAll('button,[role=button]')].filter(visible);
 const confirms=buttons.filter(e=>e.matches('.swal2-confirm')||['확인','등록'].includes(normalize(e.textContent)));
 const cancels=buttons.filter(e=>e.matches('.swal2-cancel')||normalize(e.textContent)==='취소');
 if(confirms.length!==1)return {error:'ambiguous-confirm'};
 return {dialog,confirm:confirms[0],cancel:cancels.length===1?cancels[0]:null,text,kind,modal:dialog.getAttribute('aria-modal')==='true'||!!dialog.closest('.swal2-container'),disabled:confirms[0].disabled===true};
}
function registerControl(){
 const visible=e=>!!e?.getClientRects().length;
 const titles=[...document.querySelectorAll('textarea[placeholder="제목을 입력하세요."]')].filter(visible),bodies=[...document.querySelectorAll('.fr-element.fr-view[contenteditable="true"]')].filter(visible);
 if(titles.length!==1||bodies.length!==1)return {error:'editor'};
 let root=titles[0].closest('[role="dialog"],form');
 if(!root){root=titles[0].parentElement;while(root&&(!root.contains(bodies[0])||![...root.querySelectorAll('button,[role=button]')].some(e=>visible(e)&&e.textContent.trim()==='등록')))root=root.parentElement;}
 if(!root||root===document.body||root===document.documentElement||!root.contains(bodies[0]))return {error:'editor'};
 const buttons=[...root.querySelectorAll('button,[role=button]')].filter(e=>visible(e)&&e.textContent.replace(/\s+/g,' ').trim()==='등록');
 if(buttons.length!==1||buttons[0].disabled)return {error:'register'};
 return {root,button:buttons[0]};
}
function transaction(find,dialog,register,action,arg){
 const key='__classroomSubmitTransaction';let g=window[key];
 const failure=(error,reason)=>({error,reason});
 const check=()=>{
  if(!g)return failure('snapshot');
  if(g.cancelled)return failure('cancelled');
  if(g.error)return failure(g.error);
  if(location.href!==g.href)return failure('class');
  const c=dialog();if(c.error)return c;
  const classTitle=[...document.querySelectorAll('strong')].find(e=>e.getClientRects().length&&e.textContent.includes('옥구초등학교'))?.textContent.trim();
  if(classTitle&&classTitle!==g.classTitle)return failure('class');
  const r=find();let mode='live';
  if(r.error){
   if(Object.entries(r.available||{}).some(([name,value])=>g[name]!==value))return failure('mismatch');
   const unreadable=r.error==='missing'||r.reason==='unreadable-state';
   if(!unreadable)return failure('ambiguous');
   if(c.kind!=='publish'||!c.modal||!g.root.isConnected||!g.root.inert)return failure('snapshot');
   mode='snapshot';
  }else if(r.parents.checked!==g.parents||r.students.checked!==g.students)return failure('mismatch');
  if(c.kind==='teachers'&&(g.parents||g.students))return failure('mismatch');
  if(c.kind==='publish'&&!g.parents&&!g.students)return failure('mismatch');
  if(c.disabled)return failure('disabled-confirm');
  g.popupSeen=true;g.kind=c.kind;g.text=c.text;g.mode=mode;
  return {c,mode,kind:c.kind,text:c.text};
 };
 if(action==='start'){
  if(g)return failure('in-progress');
  const r=find();if(r.error)return r;
  if(r.parents.checked!==arg.parents||r.students.checked!==arg.students)return failure('mismatch');
  const control=register();if(control.error)return control;
  const normalize=s=>String(s||'').replace(/\s+/g,' ').trim();
  if(control.root.querySelector('textarea[placeholder="제목을 입력하세요."]').value!==arg.title||normalize(control.root.querySelector('.fr-element.fr-view').innerText)!==normalize(arg.body))return failure('changed-draft');
  g=window[key]={parents:arg.parents,students:arg.students,classTitle:arg.classTitle,href:location.href,verifiedAt:Date.now(),root:control.root,previousInert:control.root.inert,confirmed:false,cancelled:false,initialClick:true};
  // Lock the verified editor until the transaction completes. The confirmation is a separate modal.
  g.root.inert=true;
  g.listener=e=>{
   if(g.initialClick||!e.isTrusted)return;
   const c=dialog();
   if(!c.error&&c.dialog.contains(e.target)){
    const button=e.target.closest('button,[role=button]');
    if(e.type==='click'&&button===c.confirm){const state=check();if(state.error){g.error=state.error;e.preventDefault();e.stopImmediatePropagation();}else{g.confirmed=true;g.manual=true;}}
    if(e.type==='click'&&button===c.cancel)g.cancelled=true;
    return;
   }
   e.preventDefault();e.stopImmediatePropagation();
  };
  for(const name of ['pointerdown','click','keydown','input','change'])document.addEventListener(name,g.listener,true);
  control.button.click();g.initialClick=false;
  return {snapshot:{parents:g.parents,students:g.students,verifiedAt:g.verifiedAt},clicked:true};
 }
 if(action==='status'){
  if(!g)return failure('snapshot');
  if(g.confirmed)return {confirmed:true,manual:!!g.manual,kind:g.kind,text:g.text,mode:g.mode};
  const state=check();if(state.error)return state;
  return {confirmed:false,kind:state.kind,text:state.text,mode:state.mode};
 }
 if(action==='confirm'){
  if(g?.confirmed)return {confirmed:true,manual:!!g.manual};
  const state=check();if(state.error)return state;
  g.confirmed=true;state.c.confirm.click();return {confirmed:true,manual:false};
 }
 if(action==='abort'){
  if(!g)return {safeToRetry:true};
  const c=dialog();
  if(!g.confirmed&&!c.error&&c.cancel&&!c.cancel.disabled){g.cancelRequested=true;c.cancel.click();}
  return {safeToRetry:false};
 }
 if(action==='abort-status'){
  // A cancel click alone is not proof: wait for the popup to close and the editor to remain.
  return {safeToRetry:!!g&&!g.confirmed&&(g.cancelRequested||g.cancelled)&&location.href===g.href&&g.root.isConnected&&dialog().error==='missing-popup'&&!!g.root.querySelector('textarea[placeholder="제목을 입력하세요."]')};
 }
 if(action==='cleanup'&&g){
  for(const name of ['pointerdown','click','keydown','input','change'])document.removeEventListener(name,g.listener,true);
  g.root.inert=g.previousInert;delete window[key];return true;
 }
 return failure('snapshot');
}
const pageAction=(w,action,arg={})=>w.webContents.executeJavaScript(`(${transaction.toString()})(${findRecipientControls.toString()},${confirmation.toString()},${registerControl.toString()},${JSON.stringify(action)},${JSON.stringify(arg)})`);
function errorFor(state){
 const labels={...messages,'missing-popup':'하이클래스 등록 확인창을 찾지 못했습니다.','unknown-popup':'하이클래스 확인 내용이 변경되어 등록을 중단했습니다.','ambiguous-popup':'하이클래스 등록 확인창을 안전하게 식별하지 못했습니다.','ambiguous-confirm':'하이클래스 확인 버튼을 안전하게 식별하지 못했습니다.','snapshot':'수신대상 안전 검증을 유지할 수 없어 등록을 중단했습니다.','class':'연결된 학급과 현재 하이클래스 학급이 달라 등록하지 않았습니다.','editor':'알림장 작성 화면을 확실하게 찾지 못했습니다.','changed-draft':'하이클래스 작성 내용이 초안과 달라 등록을 중단했습니다.','register':'등록 버튼을 확실하게 찾지 못했습니다.','cancelled':'하이클래스 등록을 취소했습니다.','disabled-confirm':'하이클래스 확인 버튼을 사용할 수 없습니다.','in-progress':'이미 하이클래스 등록이 진행 중입니다.'};
 const e=Error(labels[state.error]||'하이클래스 등록을 확인하지 못했습니다.');e.stage=state.error;return e;
}
async function articleSnapshot(w,payload){
 return w.webContents.executeJavaScript(`(()=>{const n=s=>String(s||'').replace(/\\s+/g,' ').trim(),title=${JSON.stringify(payload.title)},body=${JSON.stringify(payload.body)};const articles=[...document.querySelectorAll('article')];return {ids:articles.map(e=>e.id).filter(Boolean),matching:articles.filter(e=>e.querySelector('strong')?.textContent.trim()===title&&n(e.innerText).includes(n(body))).length};})()`);
}
async function published(w,payload,before){
 return w.webContents.executeJavaScript(`(()=>{if(document.querySelector(${JSON.stringify(titleSelector)}))return false;const n=s=>String(s||'').replace(/\\s+/g,' ').trim(),title=${JSON.stringify(payload.title)},body=${JSON.stringify(payload.body)},before=${JSON.stringify(before)};const matches=[...document.querySelectorAll('article')].filter(e=>e.querySelector('strong')?.textContent.trim()===title&&n(e.innerText).includes(n(body)));return matches.length>(before.matching||0)&&matches.some(e=>!e.id||!before.ids.includes(e.id));})()`);
}
async function submit(w,payload,before,link,verifyClass,clickText,options={}){
 const stage=(name,state={})=>options.onStage?.({stage:name,...state});let clicked=false;
 try{
  await verifyClass(w,link);stage('B',{classVerified:true});
  if((before.matching||0)>0)throw Error('같은 제목과 본문의 게시물이 이미 있습니다. 중복 등록하지 않았습니다.');
  w.show?.();
  const start=await pageAction(w,'start',{parents:payload.parents,students:payload.students,classTitle:link.title.trim(),title:payload.title,body:payload.body});
  if(start.error)throw errorFor(start);clicked=true;stage('B',{snapshot:start.snapshot});stage('C',{registerClicked:true});
  let state,end=Date.now()+(options.popupTimeout||15000);
  while(Date.now()<end){state=await pageAction(w,'status');if(state.error&&state.error!=='missing-popup')throw errorFor(state);if(!state.error)break;await pause();}
  if(state?.error)throw errorFor(state);stage('D',{popup:true});stage('E',{kind:state.kind,text:state.text});stage('F',{recipientVerification:state.mode});stage('G',{ready:true});
  if(!state.confirmed&&options.autoConfirm!==false){await verifyClass(w,link);const result=await pageAction(w,'confirm');if(result.error)throw errorFor(result);}
  else if(!state.confirmed){
   end=Date.now()+(options.manualTimeout||300000);
   while(Date.now()<end){state=await pageAction(w,'status');if(state.error)throw errorFor(state);if(state.confirmed)break;await pause();}
   if(!state.confirmed)throw Error('확인 버튼 입력을 기다리는 시간이 끝났습니다. 초안은 유지됩니다.');
  }
  const kind=state.kind;end=Date.now()+(options.resultTimeout||20000);
  if(kind==='draft'){
   while(Date.now()<end){if(await w.webContents.executeJavaScript(`!document.querySelector(${JSON.stringify(titleSelector)})`))break;await pause();}
   await clickText(w,['임시저장']);
  }
  while(Date.now()<end){if(await published(w,payload,before)){stage('H',{published:true,manual:state.manual===true});return kind==='draft'?'draft':'success';}await pause();}
  throw Error('실제 게시물을 확인하지 못했습니다. 초안은 유지됩니다.');
 }catch(e){
  if(!clicked)e.safeToRetry=true;
  else{try{
   await pageAction(w,'abort');e.safeToRetry=false;
   for(let i=0;i<16;i++){if((await pageAction(w,'abort-status')).safeToRetry){e.safeToRetry=true;break;}await pause();}
  }catch{e.safeToRetry=false;}}
  throw e;
 }finally{try{await pageAction(w,'cleanup');}catch{}}
}
module.exports={submit,articleSnapshot,confirmation,registerControl};
