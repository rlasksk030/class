// "What's new" notice: shown once after the app was updated to a version that has notes below.
// Release maintainers: add an entry for the new version before building (newest first, 2–5 short lines).
(function(root){
 const NOTES={
  '1.8.17':{title:'화면 디자인을 새로 다듬었습니다',items:[
   '대시보드 · 작은 창 · 설정 창의 글씨, 색, 버튼 모양을 하나로 맞췄습니다.',
   '화면 설정에서 대시보드 구조를 A(위쪽 머리글)와 B(왼쪽 정보 기둥) 중에 고를 수 있습니다. 칸 배치는 구조마다 따로 기억합니다.',
   '랜덤 뽑기에서 뽑힌 이름을 [발표 화면으로 크게] 띄울 수 있습니다.',
   '알림장의 [칠판 모드]로 쓴 알림장을 초록 칠판에 크게 보여 줄 수 있습니다.',
   '이 안내는 업데이트한 뒤 한 번 나오고, 설정 → 업데이트의 [새로워진 점]에서 다시 볼 수 있습니다.'
  ]}
 };
 const KEY='lastSeenVersion';
 // "1.8.17" → [1,8,17]; anything else (validation builds, garbage) → null.
 function parse(v){const m=/^(\d+)\.(\d+)\.(\d+)$/.exec(String(v||''));return m?m.slice(1).map(Number):null;}
 function compare(a,b){const x=parse(a),y=parse(b);if(!x||!y)return NaN;for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]<y[i]?-1:1;return 0;}
 // Versions with notes after `seen` up to `current`, newest first (at most 3).
 // Without a known `seen` (first launch of this feature) only the current version's notes count.
 function pending(seen,current,notes=NOTES){
  if(!parse(current))return [];
  const known=parse(seen);
  if(known&&compare(current,seen)<=0)return [];
  return Object.keys(notes).filter(v=>parse(v)&&compare(v,current)<=0&&(known?compare(v,seen)>0:compare(v,current)===0))
   .sort((a,b)=>compare(b,a)).slice(0,3);
 }
 // What to do at startup. hasData: this profile already holds the teacher's data (so this is an update, not a new install).
 function decide({seen,current,hasData,notes=NOTES}){
  if(!parse(current))return {show:[],remember:null};
  if(!seen&&!hasData)return {show:[],remember:current}; // new install: nothing changed for this teacher
  // Going back to an older version (reinstall) keeps the newest version already seen.
 const keep=parse(seen)&&compare(current,seen)<0;
 return {show:pending(seen,current,notes),remember:keep?seen:current};
 }
 const api={NOTES,KEY,parse,compare,pending,decide};
 if(typeof module!=='undefined'){module.exports=api;return;}
 root.WhatsNewCore=api;

 if(!window.desktop?.updateState)return;
 const dialog=document.createElement('dialog');dialog.id='whatsNewDialog';dialog.className='whats-new-dialog';
 // Same frame as the other small windows (.uc-dialog --sm): ① title ② [×] (added by design.js) ③ one line ④ list ⑤ [확인].
 dialog.classList.add('uc-dialog','uc-dialog--sm');dialog.setAttribute('aria-labelledby','whatsNewTitle');
 dialog.innerHTML='<h2 id="whatsNewTitle"></h2><p class="dialog-desc" id="whatsNewLead">업데이트가 끝났습니다. 이번 버전에서 달라진 점입니다.</p><div id="whatsNewBody"></div><div class="actions"><button type="button" class="primary" id="whatsNewClose">확인</button></div>';
 document.body.append(dialog);
 dialog.querySelector('#whatsNewClose').onclick=()=>dialog.close();
 function show(versions){
  if(!versions.length)return;
  const body=dialog.querySelector('#whatsNewBody');body.replaceChildren();
  dialog.querySelector('#whatsNewTitle').textContent=`우리 교실 ${versions[0]}에서 달라진 점`;
  for(const v of versions){
   const section=document.createElement('section');
   const h=document.createElement('h3');h.textContent=versions.length>1?`${v} · ${NOTES[v].title}`:NOTES[v].title;section.append(h);
   const ul=document.createElement('ul');for(const item of NOTES[v].items){const li=document.createElement('li');li.textContent=item;ul.append(li);}
   section.append(ul);body.append(section);
  }
  dialog.showModal();
 }
 // Wait until no other dialog (first-run settings, recovery notice …) is open, at most ~20 s.
 function whenFree(task,tries=40){if(!document.querySelector('dialog[open]'))task();else if(tries>0)setTimeout(()=>whenFree(task,tries-1),500);}
 function hasData(){try{return !!window.BackupCore?.hasUserData(BackupCore.collect(k=>localStorage.getItem(k)));}catch{return false;}}
 let current=null;
 window.desktop.updateState().then(state=>{
  current=state?.currentVersion||null;
  let seen=null;try{seen=JSON.parse(localStorage.getItem(KEY));}catch{}
  const result=decide({seen,current,hasData:hasData()});
  if(result.remember&&result.remember!==seen){try{localStorage.setItem(KEY,JSON.stringify(result.remember));}catch{}}
  if(result.show.length)setTimeout(()=>whenFree(()=>show(result.show)),800);
  addReplayButton();
 }).catch(()=>{});
 // Settings → 업데이트 dialog gets a [새로워진 점] button while the running version has notes.
 function addReplayButton(){
  if(!NOTES[current])return;
  const actions=document.querySelector('#updateDialog .actions');if(!actions||actions.querySelector('#whatsNewReplay'))return;
  const b=document.createElement('button');b.type='button';b.id='whatsNewReplay';b.className='uc-btn--ghost';b.textContent='새로워진 점';
  b.onclick=()=>{document.getElementById('updateDialog')?.close();show([current]);};
  actions.prepend(b);
 }
})(globalThis);
