window.createClassDiary=function({read,put}){
 const root=document.createElement('section');root.id='diaryScreen';root.hidden=true;root.setAttribute('role','tabpanel');root.setAttribute('aria-labelledby','diaryTab');root.innerHTML=`<div class="diary-fields"><div class="diary-heading"><h1>알림장</h1><label>작성 날짜 <input id="diaryDate" type="date"></label></div><section id="diaryHiclass" class="diary-hiclass" data-state="none"><div class="diary-hiclass-line"><span id="diaryLinkState" role="status"></span><button id="diaryConnect" class="primary">하이클래스 연결하기</button></div><ol id="diaryLinkSteps" hidden><li>로그인</li><li>담당 학급 선택</li><li>알림장 게시판 열기</li><li>연결 확인</li></ol><p id="diaryLinkMessage" role="status"></p></section><div class="diary-actions"><button id="diaryImport">대시보드 내용 불러오기</button></div><label class="diary-title-field">제목<input id="diaryTitle"></label><div class="diary-font-controls" role="group" aria-label="편집 화면 본문 글씨 크기"><span>본문 글씨</span><button id="diaryFontMinus">글씨 작게</button><output id="diaryFontSize" aria-live="polite"></output><button id="diaryFontPlus">글씨 크게</button><button id="diaryFontReset">기본값</button><small>이 편집 화면에만 적용</small></div><label class="diary-body-field">본문<textarea id="diaryBody" placeholder="학생과 가정에 전할 내용을 적어 주세요."></textarea></label><section class="diary-photos" aria-label="첨부 사진"><button id="diaryPhotoAdd">사진 파일 추가</button><input id="diaryPhotoFiles" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" multiple hidden><p id="diaryPhotoHelp"></p><p>사진은 Ctrl+V로도 추가할 수 있습니다.</p><p id="diaryPhotoSending" hidden>사진은 표시된 순서로 하이클래스에 첨부됩니다. 업로드와 등록 확인이 끝날 때까지 초안을 보존합니다.</p><div id="diaryPhotos"></div></section></div><div class="diary-footer"><div class="diary-actions diary-recipients"><strong>하이클래스 수신대상</strong><label><input id="diaryParents" type="checkbox" checked> 학부모 수신</label><label><input id="diaryStudents" type="checkbox" checked> 학생 수신</label></div><div class="diary-actions diary-registration"><span id="diaryStatus" role="status" tabindex="0" aria-label="등록 상태"></span><button id="diaryPublish" class="primary">하이클래스 등록</button></div></div><dialog id="diaryImportDialog"><h2>필요한 내용만 선택하세요</h2><div id="diaryCandidates"></div><button id="diaryImportApply">선택 내용 추가</button><button id="diaryImportCancel">취소</button></dialog>`;document.body.append(root);
 const $=id=>root.querySelector('#'+id);let drafts=read('diaryDrafts',{}),date=Core.dateKey(),key,busy=false,connecting=false;const revisions=new Map(),pendingPhotos=new Map();let photoQueue=Promise.resolve(),unsaved=false;const persist=()=>{const ok=put('diaryDrafts',drafts);unsaved=!ok;return ok;};const changed=k=>revisions.set(k,(revisions.get(k)||0)+1);
 const classId=()=>`${academicYear()}:${settings.grade||''}:${settings.classroom||''}`;
 const title=d=>{const day=new Date(d+'T12:00:00');return `${day.getMonth()+1}월 ${day.getDate()}일 ${['일','월','화','수','목','금','토'][day.getDay()]}요일 알림장`;};
 function load(){key=classId()+':'+date;const draft=drafts[key]||{title:title(date),body:'',photos:[]};drafts[key]=draft;$('diaryDate').value=date;$('diaryTitle').value=draft.title;$('diaryBody').value=draft.body;$('diaryParents').checked=draft.parents!==false;$('diaryStudents').checked=draft.students!==false;$('diaryStatus').textContent=draft.postedHash?'이 날짜에 등록한 기록이 있습니다.':'작성 내용은 자동 저장됩니다.';renderPhotos();}
 function save(){drafts[key]={...drafts[key],title:$('diaryTitle').value,body:$('diaryBody').value,parents:$('diaryParents').checked,students:$('diaryStudents').checked,updatedAt:Date.now()};const ok=persist();$('diaryStatus').textContent=ok?'저장됨':'저장 공간을 확인해 주세요.';return ok;}
 const noTarget=()=>!$('diaryParents').checked&&!$('diaryStudents').checked,NO_TARGET='학부모 또는 학생 중 한 곳 이상을 수신대상으로 선택해 주세요.';
 $('diaryParents').onchange=$('diaryStudents').onchange=()=>{changed(key);save();if(noTarget())$('diaryStatus').textContent=NO_TARGET;};$('diaryTitle').oninput=$('diaryBody').oninput=()=>{changed(key);save();};$('diaryDate').onchange=()=>{if(!$('diaryDate').value)return;save();date=$('diaryDate').value;load();};

 const photos=k=>Array.isArray(drafts[k]?.photos)?drafts[k].photos:[];
 function renderPhotos(){
  $('diaryPhotoSending').hidden=photos(key).length===0;
  $('diaryPhotos').replaceChildren(...photos(key).map((photo,index)=>{
   const card=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption'),actions=document.createElement('div');
   img.alt=`첨부 사진 ${index+1}`;caption.textContent=`${index+1}. ${photo.name||'사진'}`;
   for(const [label,delta]of [['앞으로',-1],['뒤로',1],['삭제',0]]){const b=document.createElement('button');b.textContent=label;b.setAttribute('aria-label',`사진 ${index+1} ${label}`);b.disabled=delta<0&&index===0||delta>0&&index===photos(key).length-1;b.onclick=()=>{const list=photos(key).slice();if(delta)[list[index],list[index+delta]]=[list[index+delta],list[index]];else list.splice(index,1);drafts[key].photos=list;changed(key);save();renderPhotos();};actions.append(b);}
   card.append(img,caption,actions);queueMicrotask(()=>ClassPhotos.preview(img,photo));return card;
  }));
 }
 $('diaryPhotoHelp').textContent=ClassPhotos.help+' · 초안당 20장';
 function addPhotos(files,origin=key){
  if(!files.length||!origin)return;save();
  if(photos(origin).length+(pendingPhotos.get(origin)||0)+files.length>20){$('diaryStatus').textContent='초안 사진은 최대 20장입니다. 이번 선택은 추가하지 않았습니다.';return;}
  changed(origin);pendingPhotos.set(origin,(pendingPhotos.get(origin)||0)+files.length);$('diaryStatus').textContent='사진을 저장하는 중…';
  photoQueue=photoQueue.then(async()=>{let failures=[];for(const file of files){try{const ref=await ClassPhotos.add(file);drafts[origin].photos=[...photos(origin),ref];changed(origin);if(!persist())failures.push('초안 저장 실패: 사진은 화면에 유지됩니다. 저장 공간을 확인해 주세요.');}catch(e){failures.push(ClassPhotos.message(e));}finally{pendingPhotos.set(origin,pendingPhotos.get(origin)-1);}}
   if(key===origin){renderPhotos();$('diaryStatus').textContent=failures.length?failures.join(' / '):'사진 저장됨';}else document.getElementById('globalStatus').textContent=failures.length?failures.join(' / '):'사진을 처음 선택한 날짜·학급의 초안에 저장했습니다.';
  });
 }
 let fileOrigin=null;$('diaryPhotoAdd').onclick=()=>{fileOrigin=key;save();$('diaryPhotoFiles').click();};$('diaryPhotoFiles').onchange=e=>{addPhotos([...e.target.files],fileOrigin||key);fileOrigin=null;e.target.value='';};$('diaryPhotoFiles').oncancel=()=>fileOrigin=null;
 document.addEventListener('paste',e=>{if(root.hidden||e.defaultPrevented||document.querySelector('dialog[open]'))return;const active=document.activeElement;if(active&&active!==document.body&&!root.contains(active)&&active.id!=='diaryTab')return;const files=ClassPhotos.files(e);if(!files.length)return;e.preventDefault();addPhotos(files);});
 let fontSize=Math.min(48,Math.max(16,Number(read('diaryEditorPreferences',{}).fontSize)||24)),composing=false,pendingFont=null,fontUnsaved=false;
 function fontUI(){ $('diaryBody').style.fontSize=fontSize+'px';$('diaryFontSize').textContent=fontSize+'px';$('diaryFontMinus').disabled=fontSize<=16;$('diaryFontPlus').disabled=fontSize>=48; }
 function setFont(value){if(composing){pendingFont=value;return;}fontSize=Math.min(48,Math.max(16,value));fontUI();fontUnsaved=!put('diaryEditorPreferences',{fontSize});if(fontUnsaved)$('diaryStatus').textContent='글씨 크기 설정을 저장하지 못했습니다. 본문은 유지됩니다.';}
 for(const id of ['diaryFontMinus','diaryFontPlus','diaryFontReset'])$(id).onmousedown=e=>e.preventDefault();
 $('diaryFontMinus').onclick=()=>setFont((pendingFont||fontSize)-2);$('diaryFontPlus').onclick=()=>setFont((pendingFont||fontSize)+2);$('diaryFontReset').onclick=()=>setFont(24);
 $('diaryBody').addEventListener('compositionstart',()=>composing=true);$('diaryBody').addEventListener('compositionend',()=>{composing=false;if(pendingFont!==null){const n=pendingFont;pendingFont=null;setFont(n);}});fontUI();

 async function run(action){try{const result=await action();$('diaryStatus').textContent=result.message;return result;}catch{$('diaryStatus').textContent='하이클래스에 연결하지 못했습니다. 작성 내용은 유지됩니다.';}}
 // HiClass link status: one button, a visible state line and step guide while connecting.
 let link={linked:false,title:'',session:'unknown'},checkedSession=new Set();
 const classLabel=()=>`${settings.grade}학년 ${settings.classroom}반`;
 const target=()=>({classKey:classId(),label:classLabel(),grade:String(settings.grade||''),classroom:String(settings.classroom||'')});
 function showLink(){
  const box=$('diaryHiclass'),expired=link.linked&&link.session==='expired';
  box.dataset.state=expired?'expired':link.linked?'linked':'none';
  $('diaryLinkState').textContent=expired?'하이클래스 로그인이 만료되었습니다. 다시 로그인해 주세요.':link.linked?`● 하이클래스 연결됨 · 옥구초등학교 ${classLabel()}`+(link.title&&!link.title.includes(classLabel())?` (하이클래스: ${link.title})`:''):'○ 하이클래스 미연결';
  $('diaryLinkState').title=$('diaryLinkState').textContent;
  $('diaryConnect').textContent=expired?'다시 로그인':link.linked?'연결 변경':'하이클래스 연결하기';
 }
 function steps(step){$('diaryLinkSteps').hidden=!step;[...$('diaryLinkSteps').children].forEach((li,i)=>{li.classList.toggle('done',i+1<step);li.classList.toggle('current',i+1===step);});}
 async function refreshLink(){
  if(!window.desktop?.diaryStatus)return;
  const key=classId();
  try{const s=await window.desktop.diaryStatus(key);if(key!==classId())return;link={...link,linked:s.linked,title:s.title};}catch{}
  showLink();
  // A saved link stays connected across restarts; only a login page on the saved board marks it expired (once per run).
  if(link.linked&&!checkedSession.has(key)&&window.desktop.diarySession){checkedSession.add(key);window.desktop.diarySession(key).then(r=>{if(key===classId()){link.session=r.status;showLink();}}).catch(()=>{});}
 }
 window.desktop?.onDiaryProgress?.(p=>{
  $('diaryLinkMessage').hidden=false;
  if(p.state==='closed'){steps(0);$('diaryLinkMessage').textContent=p.message;$('diaryConnect').disabled=false;return;}
  steps(p.step);$('diaryLinkMessage').textContent=p.message;
  if(p.done){steps(0);$('diaryLinkMessage').hidden=true;$('diaryConnect').disabled=false;link={linked:true,title:p.title||'',session:'ok'};showLink();}
 });
 async function connect(action){
  if(connecting||busy)return;connecting=true;
  $('diaryConnect').disabled=true;$('diaryPublish').disabled=true;
  $('diaryLinkMessage').hidden=false;$('diaryLinkMessage').textContent='하이클래스 창을 여는 중…';
  let r;
  try{r=await action();}catch{r={message:'하이클래스에 연결하지 못했습니다. 작성 내용은 유지됩니다.'};}
  finally{connecting=false;$('diaryConnect').disabled=false;$('diaryPublish').disabled=busy;}
  if(r?.done){steps(0);$('diaryLinkMessage').hidden=true;$('diaryLinkMessage').textContent=r.message;link={linked:true,title:r.title||'',session:'ok'};showLink();return;}
  if(r?.step){steps(r.step);$('diaryLinkMessage').textContent=r.message;return;}
  steps(0);$('diaryLinkMessage').textContent=r?.message||'하이클래스에 연결하지 못했습니다. 작성 내용은 유지됩니다.';
 }
 $('diaryConnect').onclick=()=>connect(()=>window.desktop.diaryConnect(target()));
 $('diaryPublish').onclick=async()=>{if(busy||connecting||!save())return;if(pendingPhotos.get(key)){$('diaryStatus').textContent='사진 저장이 끝난 뒤 등록해 주세요.';return;}if(!$('diaryTitle').value.trim()||(!$('diaryBody').value.trim()&&!photos(key).length)){$('diaryStatus').textContent='제목을 입력하고 본문 또는 사진을 추가해 주세요.';return;}if(noTarget()){$('diaryStatus').textContent=NO_TARGET;return;}busy=true;$('diaryPublish').disabled=true;$('diaryPublish').textContent='등록 중...';const postingKey=key,postingRevision=revisions.get(key)||0;const payload={photos:photos(key).map(p=>({...p})),classKey:classId(),date,title:$('diaryTitle').value,body:$('diaryBody').value,parents:$('diaryParents').checked,students:$('diaryStudents').checked};$('diaryStatus').textContent='등록 상태 확인 중…';try{const result=await run(()=>window.desktop.diaryPublish(payload));if(result?.status==='success'&&(!payload.photos.length||result.attachmentsVerified===true)){const draft=drafts[postingKey];
 // Keep edits made while registration was pending, and retain registration history.
 const unchanged=(revisions.get(postingKey)||0)===postingRevision&&draft.title===payload.title&&draft.body===payload.body&&JSON.stringify(photos(postingKey))===JSON.stringify(payload.photos);
 const history=read('diaryRegistrationHistory',{});
 history[postingKey]=[...(Array.isArray(history[postingKey])?history[postingKey]:[]),{...payload,hash:result.hash||draft.postedHash||null,status:'success',registeredAt:Date.now(),result:{...result}}];
 if(!put('diaryRegistrationHistory',history)){$('diaryStatus').textContent='하이클래스 등록 완료 · 기록 저장을 확인해 주세요. 작성 내용은 유지됩니다.';return;}
 const nextDrafts={...drafts,[postingKey]:{...draft,...(unchanged?{title:title(payload.date),body:'',photos:[],updatedAt:Date.now()}:{}),postedHash:result.hash||draft.postedHash}};
 if(!put('diaryDrafts',nextDrafts)){$('diaryStatus').textContent='하이클래스 등록 완료 · 새 초안을 저장하지 못해 작성 내용을 유지합니다.';return;}
 drafts=nextDrafts;
 if(key===postingKey&&unchanged){$('diaryTitle').value=title(payload.date);$('diaryBody').value='';renderPhotos();$('diaryStatus').textContent='하이클래스 등록 완료 · 새 초안을 작성할 수 있습니다.';}link.session='ok';showLink();}else if(result?.status==='success'&&payload.photos.length){$('diaryStatus').textContent='첨부 사진의 등록을 확인하지 못했습니다. 자동 재전송하지 말고 하이클래스에서 확인해 주세요. 본문과 사진은 유지됩니다.';}else if(/로그인/.test(result?.message||'')){link.session='expired';showLink();}}finally{busy=false;$('diaryPublish').disabled=false;$('diaryPublish').textContent='하이클래스 등록';}};
 $('diaryImport').onclick=()=>{const items=[];const notices=document.getElementById('notices')?.innerText.trim();if(notices)items.push({label:'안내사항 / 준비물 / 전달사항',text:notices});$('diaryCandidates').replaceChildren(...items.map(item=>{const label=document.createElement('label'),check=document.createElement('input'),span=document.createElement('span');check.type='checkbox';check.dataset.text=item.text;span.textContent=item.label+'\n'+item.text;label.append(check,span);return label;}));if(!items.length)$('diaryCandidates').textContent='불러올 안내사항이 없습니다.';$('diaryImportDialog').showModal();};
 $('diaryImportCancel').onclick=()=>$('diaryImportDialog').close();$('diaryImportApply').onclick=()=>{const texts=[...$('diaryCandidates').querySelectorAll('input:checked')].map(x=>x.dataset.text);if(texts.length){changed(key);$('diaryBody').value=[$('diaryBody').value,...texts].filter(Boolean).join('\n\n');save();}$('diaryImportDialog').close();};
 const unfinished=()=>busy||unsaved||fontUnsaved||pendingFont!==null||[...pendingPhotos.values()].some(n=>n>0);
 window.addEventListener('classroom:before-data-transfer',e=>{if(unfinished())e.preventDefault();});
 window.addEventListener('beforeunload',e=>{if(unfinished()){e.preventDefault();e.returnValue='';$('diaryStatus').textContent='사진 처리·등록 또는 편집 내용 저장이 끝나지 않아 창을 유지합니다. 저장 상태를 확인해 주세요.';}});
 return {activate(active){if(!root.hidden&&key)save();root.hidden=!active;if(active){load();refreshLink();}}};
};
