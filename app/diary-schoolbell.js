// Publishing service selector and the Schoolbell (학교종이) controls, kept at the HiClass level:
// one connection line, [학교종이 연결하기], recipients and [학교종이 등록].
// The common editor (diary.js) owns the draft, the photos and what happens after a success.
window.createDiaryServices = function({root,readNote,save,target,isBusy,status,photoHelp,onHiclass,onPublish}) {
 const $ = id=>root.querySelector('#'+id);
 const FAIL='학교종이에 연결하지 못했습니다. 작성 내용은 유지됩니다.';
 const selector=document.createElement('label');
 selector.className='diary-service-selector';
 selector.innerHTML='<span>발행 서비스</span><select id="diaryService"><option value="hiclass">하이클래스</option><option value="schoolbell">학교종이</option></select>';
 $('diaryHiclass').before(selector);
 const panel=document.createElement('section'); panel.id='diarySchoolbell'; panel.className='diary-hiclass'; panel.dataset.state='none'; panel.hidden=true;
 panel.innerHTML='<div class="diary-hiclass-line"><span id="schoolbellLinkState" role="status"></span><button id="schoolbellConnect" class="primary">학교종이 연결하기</button></div>'+
  '<ol id="schoolbellSteps" hidden><li>로그인</li><li>학급 알림장 열기</li><li>연결 확인</li></ol>'+
  '<p id="schoolbellMessage" role="status" hidden></p>'+
  '<div id="schoolbellUnresolved" hidden></div>'+
  '<details id="schoolbellManual"><summary>직접 발행하기 (비상용)</summary>'+
  '<p>자동 등록이 안 될 때만 사용합니다. 제목과 본문을 복사해 학교종이 알림장 [작성하기]에 붙여넣고, 사진은 순서대로 저장해 직접 첨부한 뒤 발행하세요.</p>'+
  '<div class="diary-actions"><button id="schoolbellPrepare">직접 발행 준비</button><button id="schoolbellCopyTitle">제목 복사</button>'+
  '<button id="schoolbellCopyBody">본문 복사</button><button id="schoolbellPhotos">사진 순서대로 저장</button></div>'+
  '<div id="schoolbellHistory"></div></details>';
 $('diaryHiclass').after(panel);
 const hiclassRecipients=root.querySelector('.diary-recipients');
 const recipients=document.createElement('div'); recipients.id='schoolbellRecipients'; recipients.className='diary-actions diary-recipients'; recipients.hidden=true;
 recipients.innerHTML='<strong>학교종이 수신대상</strong>'+
  '<select id="schoolbellRecipientMode" aria-label="학교종이 수신대상 선택 방식"><option value="default">학교종이 기본 선택</option><option value="custom">직접 선택</option></select>'+
  '<label><input id="schoolbellGuardian1" type="checkbox"> 보호자1</label><label><input id="schoolbellGuardian2" type="checkbox"> 보호자2</label>'+
  '<label><input id="schoolbellStudent" type="checkbox"> 학생</label><small>관리자는 항상 포함됩니다.</small>';
 hiclassRecipients.after(recipients);
 const publishButton=document.createElement('button'); publishButton.id='schoolbellPublish'; publishButton.className='primary'; publishButton.textContent='학교종이 등록'; publishButton.hidden=true;
 $('diaryPublish').after(publishButton);
 const roles=[['schoolbellGuardian1','guardian1'],['schoolbellGuardian2','guardian2'],['schoolbellStudent','student']];

 let service='hiclass',busy=false,loading=false,connecting=false,generation=0,currentKey='';
 let link={linked:false,title:'',needsRelink:false,session:'unknown'};
 const checkedSession=new Set();
 const controls=()=>[...panel.querySelectorAll('button'),...recipients.querySelectorAll('select,input')];
 const message=text=>{$('schoolbellMessage').hidden=!text;$('schoolbellMessage').textContent=text||'';};
 function steps(step){$('schoolbellSteps').hidden=!step;[...$('schoolbellSteps').children].forEach((li,i)=>{li.classList.toggle('done',i+1<step);li.classList.toggle('current',i+1===step);});}
 function showLink(){
  const expired=link.linked&&link.session==='expired',to=target();
  panel.dataset.state=expired?'expired':link.linked?'linked':'none';
  $('schoolbellLinkState').textContent=expired?'학교종이 로그인이 만료되었습니다. 다시 로그인해 주세요.':
   link.linked?'● 학교종이 연결됨 · '+(settings.school?.SCHUL_NM||'')+' '+to.label+(link.title&&!link.title.includes(to.label)?' (학교종이: '+link.title+')':''):
   link.needsRelink?'○ 학교종이 다시 연결 필요':'○ 학교종이 미연결';
  $('schoolbellLinkState').title=$('schoolbellLinkState').textContent;
  $('schoolbellConnect').textContent=expired?'다시 로그인':link.linked?'연결 변경':'학교종이 연결하기';
 }
 // null = keep the selection the Schoolbell composer shows; otherwise the three roles are applied.
 function showRecipients(value){
  $('schoolbellRecipientMode').value=value?'custom':'default';
  for(const [id,key] of roles){$(id).checked=value?value[key]:true;$(id).closest('label').hidden=!value;}
 }
 const LABELS={'manual-pending':'직접 발행 · 결과 미기록','manual-confirmed':'직접 발행 · 게시됨','manual-not-posted':'직접 발행 · 게시 안 됨',
  'auto-pending':'자동 등록 · 결과 미확인','auto-uncertain':'자동 등록 · 결과 미확인','auto-success':'자동 등록 · 게시 확인됨',
  'auto-user-confirmed':'자동 등록 · 게시됨(직접 확인)','auto-user-not-posted':'자동 등록 · 게시 안 됨(직접 확인)'};
 function row(post,resolve){
  const line=document.createElement('div');line.className='schoolbell-history-row';
  const label=document.createElement('span');label.textContent=post.date+' · 사진 '+post.photoCount+'장 · '+(LABELS[post.status]||'확인 필요');line.append(label);
  if(resolve)for(const [text,outcome] of resolve){const button=document.createElement('button');button.textContent=text;button.onclick=()=>run(()=>outcome(post));line.append(button);}
  return line;
 }
 function paint(data) {
  service=data.service||'hiclass'; $('diaryService').value=service;
  const schoolbell=service==='schoolbell';
  $('diaryHiclass').hidden=schoolbell;panel.hidden=!schoolbell;
  hiclassRecipients.hidden=schoolbell;recipients.hidden=!schoolbell;
  $('diaryPublish').hidden=schoolbell;publishButton.hidden=!schoolbell;
  photoHelp.textContent=schoolbell?'사진은 표시된 순서로 학교종이에 첨부됩니다. 업로드와 게시 확인이 끝날 때까지 초안을 보존합니다.':
   '사진은 표시된 순서로 하이클래스에 첨부됩니다. 업로드와 등록 확인이 끝날 때까지 초안을 보존합니다.';
  const state=data.schoolbell||{};
  link={...link,linked:!!state.linked,title:state.title||'',needsRelink:!!state.needsRelink};showLink();
  showRecipients(state.recipients||null);
  // A result nobody confirmed blocks the next registration, so it is shown above everything else.
  const manual=(data.posts||[]).filter(p=>p.status==='manual-pending'),automatic=(data.automaticPosts||[]).filter(p=>['auto-pending','auto-uncertain'].includes(p.status));
  const unresolved=$('schoolbellUnresolved');unresolved.hidden=!manual.length&&!automatic.length;
  const note=document.createElement('p');note.textContent='이전 등록 결과가 확인되지 않았습니다. 학교종이에서 확인한 뒤 선택해 주세요. 선택하기 전에는 새로 등록하지 않습니다.';
  unresolved.replaceChildren(note,
   ...automatic.map(p=>row(p,[['게시됨',post=>desktop.schoolbellResolveAutomatic({classKey:currentKey,id:post.id,outcome:'auto-user-confirmed'})],['게시 안 됨',post=>desktop.schoolbellResolveAutomatic({classKey:currentKey,id:post.id,outcome:'auto-user-not-posted'})]])),
   ...manual.map(p=>row(p,[['게시됨',post=>desktop.schoolbellResolve({classKey:currentKey,hash:post.hash,outcome:'manual-confirmed'})],['게시 안 됨',post=>desktop.schoolbellResolve({classKey:currentKey,hash:post.hash,outcome:'manual-not-posted'})]])));
  const done=[...(data.automaticPosts||[]),...(data.posts||[])].filter(p=>!['manual-pending','auto-pending','auto-uncertain'].includes(p.status)).sort((a,b)=>(b.time||0)-(a.time||0));
  $('schoolbellHistory').replaceChildren(...done.slice(0,30).map(p=>row(p)));
  $('schoolbellCopyTitle').disabled=$('schoolbellCopyBody').disabled=$('schoolbellPhotos').disabled=!manual.length;
 }
 async function refresh() {
  const id=++generation,to=target();currentKey=to.classKey;
  loading=true;$('diaryService').disabled=true;
  try {
   const data=await desktop.diaryServiceStatus(to.classKey);
   if(id!==generation||to.classKey!==target().classKey)return;
   if(data.status)throw Error();
   paint(data);
   loading=false;$('diaryService').disabled=false;$('diaryPublish').disabled=isBusy();publishButton.disabled=busy||isBusy();
   // A saved link stays connected across restarts; only a login page on the saved board marks it expired (once per run).
   if(service==='schoolbell'&&link.linked&&!checkedSession.has(to.classKey)){
    checkedSession.add(to.classKey);
    desktop.schoolbellSession(to.classKey).then(r=>{if(to.classKey===target().classKey&&['ok','expired'].includes(r?.status)){link.session=r.status;showLink();}}).catch(()=>{});
   }
  } catch { if(id!==generation||to.classKey!==target().classKey)return;loading=false;service='unavailable';status('발행 서비스 설정을 읽지 못했습니다. 다시 알림장을 열어 주세요.');$('diaryService').disabled=true;$('diaryPublish').disabled=true;publishButton.disabled=true; }
 }
 async function run(action) {
  if(busy||loading||connecting||isBusy()||!save())return;
  const origin=target().classKey;busy=true;publishButton.disabled=true;$('diaryService').disabled=true;
  for(const c of controls())c.disabled=true;
  try { const result=await action();if(origin===target().classKey)status(result?.message||'작업 결과를 확인해 주세요.');return result; }
  catch { if(origin===target().classKey)status('학교종이 작업을 마치지 못했습니다. 초안과 사진은 유지됩니다.'); }
  finally {busy=false;$('diaryService').disabled=false;for(const c of controls())c.disabled=false;await refresh();}
 }
 $('diaryService').onchange=async()=>{
  const next=$('diaryService').value;
  if(busy||loading||connecting||isBusy()||!save()){$('diaryService').value=service;return;}
  await run(async()=>{
   for(const close of [desktop.diaryClose,desktop.schoolbellClose]){
    const closed=await close();
    if(!closed.closed){$('diaryService').value=service;return closed;}
   }
   const result=await desktop.diaryServiceSelect({classKey:target().classKey,service:next});
   if(!result.status){steps(0);message('');if(next==='hiclass')onHiclass();return {...result,message:'발행 서비스를 저장했습니다. 공통 초안과 사진은 유지됩니다.'};}
   $('diaryService').value=service;return result;
  });
 };
 // Connection: the main process watches the Schoolbell window and reports each step.
 desktop.onDiaryProgress?.(p=>{
  if(p.service!=='schoolbell'||(p.classKey&&p.classKey!==target().classKey))return;
  if(p.phase==='publish'){status(p.message);return;}
  if(p.state==='closed'){steps(0);message(p.message);$('schoolbellConnect').disabled=false;return;}
  if(p.done){steps(0);message('');status(p.message);link={linked:true,title:p.title||'',needsRelink:false,session:'ok'};checkedSession.add(target().classKey);showLink();$('schoolbellConnect').disabled=false;return;}
  steps(p.step);message(p.message);
 });
 $('schoolbellConnect').onclick=async()=>{
  if(connecting||busy||loading||isBusy())return;
  connecting=true;$('schoolbellConnect').disabled=true;publishButton.disabled=true;message('학교종이 창을 여는 중…');
  let r;
  try{r=await desktop.schoolbellConnect({...target(),relogin:link.linked&&link.session==='expired'});}catch{r={message:FAIL};}
  finally{connecting=false;$('schoolbellConnect').disabled=false;publishButton.disabled=busy||isBusy();}
  if(r?.step){steps(r.step);message(r.message);return;}
  steps(0);message(r?.message||FAIL);
 };
 async function saveRecipients(){
  const custom=$('schoolbellRecipientMode').value==='custom';
  const value=custom?Object.fromEntries(roles.map(([id,key])=>[key,$(id).checked])):null;
  for(const [id] of roles)$(id).closest('label').hidden=!custom;
  const classKey=target().classKey;
  try{const r=await desktop.schoolbellRecipients({classKey,recipients:value});if(classKey===target().classKey)status(r?.status?r.message:'학교종이 수신대상을 저장했습니다.');}
  catch{if(classKey===target().classKey)status('수신대상을 저장하지 못했습니다. 다시 선택해 주세요.');}
 }
 $('schoolbellRecipientMode').onchange=()=>{if($('schoolbellRecipientMode').value==='custom')for(const [id] of roles)$(id).checked=true;saveRecipients();};
 for(const [id] of roles)$(id).onchange=saveRecipients;
 publishButton.onclick=async()=>{
  if(service!=='schoolbell'||typeof onPublish!=='function')return;
  publishButton.textContent='등록 중...';
  try{
   const result=await run(onPublish);
   if(result?.status==='success')link.session='ok';
   else if(/로그인/.test(result?.message||''))link.session='expired';
   showLink();
  }finally{publishButton.textContent='학교종이 등록';}
 };
 $('schoolbellPrepare').onclick=()=>run(()=>desktop.schoolbellPrepare(readNote()));
 for(const part of ['Title','Body'])$('schoolbellCopy'+part).onclick=()=>run(()=>desktop.schoolbellCopy({note:readNote(),part:part.toLowerCase()}));
 $('schoolbellPhotos').onclick=()=>run(()=>desktop.schoolbellPhotos(readNote()));
 // Coming back from the Schoolbell window refreshes the saved state only.
 window.addEventListener('focus',()=>{if(!root.hidden&&!busy&&!loading&&!connecting&&!isBusy())void refresh();});
 return {refresh,busy:()=>busy||loading||connecting,service:()=>service};
};
