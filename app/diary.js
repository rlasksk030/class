window.createClassDiary=function({read,put}){
 const root=document.createElement('section');root.id='diaryScreen';root.hidden=true;root.setAttribute('role','tabpanel');root.setAttribute('aria-labelledby','diaryTab');root.innerHTML=`<div class="diary-fields"><div class="diary-heading"><h1>알림장</h1><label>작성 날짜 <input id="diaryDate" type="date"></label></div><section id="diaryHiclass" class="diary-hiclass" data-state="none"><div class="diary-hiclass-line"><span id="diaryLinkState" role="status"></span><button id="diaryConnect" class="primary">하이클래스 연결하기</button></div><ol id="diaryLinkSteps" hidden><li>로그인</li><li>담당 학급 선택</li><li>알림장 게시판 열기</li><li>연결 확인</li></ol><p id="diaryLinkMessage" role="status"></p></section><div class="diary-actions"><button id="diaryImport">대시보드 내용 불러오기</button></div><label class="diary-title-field">제목<input id="diaryTitle"></label><label class="diary-body-field">본문<textarea id="diaryBody" placeholder="학생과 가정에 전할 내용을 적어 주세요."></textarea></label></div><div class="diary-footer"><div class="diary-actions diary-recipients"><strong>하이클래스 수신대상</strong><label><input id="diaryParents" type="checkbox" checked> 학부모 수신</label><label><input id="diaryStudents" type="checkbox" checked> 학생 수신</label></div><div class="diary-actions diary-registration"><span id="diaryStatus" role="status" tabindex="0" aria-label="등록 상태"></span><button id="diaryPublish" class="primary">하이클래스 등록</button></div></div><dialog id="diaryImportDialog"><h2>필요한 내용만 선택하세요</h2><div id="diaryCandidates"></div><button id="diaryImportApply">선택 내용 추가</button><button id="diaryImportCancel">취소</button></dialog>`;document.body.append(root);
 const $=id=>root.querySelector('#'+id);let drafts=read('diaryDrafts',{}),date=Core.dateKey(),key,busy=false,connecting=false;
 const classId=()=>`${academicYear()}:${settings.grade||''}:${settings.classroom||''}`;
 const title=d=>{const day=new Date(d+'T12:00:00');return `${day.getMonth()+1}월 ${day.getDate()}일 ${['일','월','화','수','목','금','토'][day.getDay()]}요일 알림장`;};
 function load(){key=classId()+':'+date;const draft=drafts[key]||{title:title(date),body:''};$('diaryDate').value=date;$('diaryTitle').value=draft.title;$('diaryBody').value=draft.body;$('diaryParents').checked=draft.parents!==false;$('diaryStudents').checked=draft.students!==false;$('diaryStatus').textContent=draft.postedHash?'이 날짜에 등록한 기록이 있습니다.':'작성 내용은 자동 저장됩니다.';}
 function save(){drafts[key]={...drafts[key],title:$('diaryTitle').value,body:$('diaryBody').value,parents:$('diaryParents').checked,students:$('diaryStudents').checked,updatedAt:Date.now()};const ok=put('diaryDrafts',drafts);$('diaryStatus').textContent=ok?'저장됨':'저장 공간을 확인해 주세요.';return ok;}
 const noTarget=()=>!$('diaryParents').checked&&!$('diaryStudents').checked,NO_TARGET='학부모 또는 학생 중 한 곳 이상을 수신대상으로 선택해 주세요.';
 $('diaryParents').onchange=$('diaryStudents').onchange=()=>{save();if(noTarget())$('diaryStatus').textContent=NO_TARGET;};$('diaryTitle').oninput=save;$('diaryBody').oninput=save;$('diaryDate').onchange=()=>{if(!$('diaryDate').value)return;save();date=$('diaryDate').value;load();};
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
 $('diaryPublish').onclick=async()=>{if(busy||connecting||!save())return;if(!$('diaryTitle').value.trim()||!$('diaryBody').value.trim()){$('diaryStatus').textContent='제목과 본문을 입력해 주세요.';return;}if(noTarget()){$('diaryStatus').textContent=NO_TARGET;return;}busy=true;$('diaryPublish').disabled=true;$('diaryPublish').textContent='등록 중...';const postingKey=key;const payload={classKey:classId(),date,title:$('diaryTitle').value,body:$('diaryBody').value,parents:$('diaryParents').checked,students:$('diaryStudents').checked};$('diaryStatus').textContent='등록 상태 확인 중…';try{const result=await run(()=>window.desktop.diaryPublish(payload));if(result?.status==='success'){const draft=drafts[postingKey];
 // Keep edits made while registration was pending, and retain registration history.
 const unchanged=draft.title===payload.title&&draft.body===payload.body;
 const history=read('diaryRegistrationHistory',{});
 history[postingKey]=[...(Array.isArray(history[postingKey])?history[postingKey]:[]),{...payload,hash:result.hash||draft.postedHash||null,status:'success',registeredAt:Date.now(),result:{...result}}];
 if(!put('diaryRegistrationHistory',history)){$('diaryStatus').textContent='하이클래스 등록 완료 · 기록 저장을 확인해 주세요. 작성 내용은 유지됩니다.';return;}
 const nextDrafts={...drafts,[postingKey]:{...draft,...(unchanged?{title:title(payload.date),body:'',updatedAt:Date.now()}:{}),postedHash:result.hash||draft.postedHash}};
 if(!put('diaryDrafts',nextDrafts)){$('diaryStatus').textContent='하이클래스 등록 완료 · 새 초안을 저장하지 못해 작성 내용을 유지합니다.';return;}
 drafts=nextDrafts;
 if(key===postingKey&&unchanged){$('diaryTitle').value=title(payload.date);$('diaryBody').value='';$('diaryStatus').textContent='하이클래스 등록 완료 · 새 초안을 작성할 수 있습니다.';}link.session='ok';showLink();}else if(/로그인/.test(result?.message||'')){link.session='expired';showLink();}}finally{busy=false;$('diaryPublish').disabled=false;$('diaryPublish').textContent='하이클래스 등록';}};
 $('diaryImport').onclick=()=>{const items=[];const notices=document.getElementById('notices')?.innerText.trim();if(notices)items.push({label:'안내사항 / 준비물 / 전달사항',text:notices});$('diaryCandidates').replaceChildren(...items.map(item=>{const label=document.createElement('label'),check=document.createElement('input'),span=document.createElement('span');check.type='checkbox';check.dataset.text=item.text;span.textContent=item.label+'\n'+item.text;label.append(check,span);return label;}));if(!items.length)$('diaryCandidates').textContent='불러올 안내사항이 없습니다.';$('diaryImportDialog').showModal();};
 $('diaryImportCancel').onclick=()=>$('diaryImportDialog').close();$('diaryImportApply').onclick=()=>{const texts=[...$('diaryCandidates').querySelectorAll('input:checked')].map(x=>x.dataset.text);if(texts.length){$('diaryBody').value=[$('diaryBody').value,...texts].filter(Boolean).join('\n\n');save();}$('diaryImportDialog').close();};
 return {activate(active){if(!root.hidden&&key)save();root.hidden=!active;if(active){load();refreshLink();}}};
};
