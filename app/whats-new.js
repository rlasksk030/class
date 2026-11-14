// "What's new" notice: shown once after the app was updated to a version that has notes below.
// Release maintainers: add an entry for the new version before building (newest first, 2–5 short lines).
(function(root){
 const NOTES={
  '1.8.17':{title:'업데이트 안내를 놓치지 않게 고쳤습니다',items:[
   '업데이트 안내가 다른 창에 가려 보이지 않던 문제를 고쳤습니다.',
   '처음 설정 창처럼 다른 창이 열려 있으면, 그 창을 닫은 뒤에 안내를 보여 드립니다.',
   '1.8.15 이전 버전에서 바로 업데이트하면 1.8.16에서 달라진 점도 함께 보여 드립니다.'
  ]},
  '1.8.16':{title:'화면 디자인을 새로 다듬었습니다',items:[
   '대시보드 · 작은 창 · 설정 창의 글씨, 색, 버튼 모양을 하나로 맞췄습니다.',
   '화면 설정에서 대시보드 구조를 A(위쪽 머리글)와 B(왼쪽 정보 기둥) 중에 고를 수 있습니다. 칸 배치는 구조마다 따로 기억합니다.',
   '랜덤 뽑기에서 뽑힌 이름을 [발표 화면으로 크게] 띄울 수 있습니다.',
   '알림장의 [칠판 모드]로 쓴 알림장을 초록 칠판에 크게 보여 줄 수 있습니다.',
   '앞으로 업데이트한 뒤 처음 켜면 이렇게 달라진 점을 보여 드립니다. 설정 → 업데이트의 [새로워진 점]에서 다시 볼 수 있습니다.'
  ]}
 };
 const KEY='lastSeenVersion';
 // "1.8.17" → [1,8,17]; anything else (validation builds, garbage) → null.
 function parse(v){const m=/^(\d+)\.(\d+)\.(\d+)$/.exec(String(v||''));return m?m.slice(1).map(Number):null;}
 function compare(a,b){const x=parse(a),y=parse(b);if(!x||!y)return NaN;for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]<y[i]?-1:1;return 0;}
 // Versions with notes after `seen` up to `current`, newest first (at most 3).
 // Without a known `seen` the teacher comes from a version before this notice existed (decide() only asks when the
 // profile holds data), so every version with notes up to `current` counts: 1.8.15 → 1.8.17 also shows 1.8.16.
 function pending(seen,current,notes=NOTES){
  if(!parse(current))return [];
  const known=parse(seen);
  if(known&&compare(current,seen)<=0)return [];
  return Object.keys(notes).filter(v=>parse(v)&&compare(v,current)<=0&&(!known||compare(v,seen)>0))
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
 const remember=v=>{try{localStorage.setItem(KEY,JSON.stringify(v));}catch{}};
 // The startup notice while it waits for other dialogs to close: {versions, remember}.
 let waiting=null;
 function show(versions,rememberAs){
  if(!versions.length||dialog.open)return;
  const body=dialog.querySelector('#whatsNewBody');body.replaceChildren();
  dialog.querySelector('#whatsNewTitle').textContent=`우리 교실 ${versions[0]}에서 달라진 점`;
  for(const v of versions){
   const section=document.createElement('section');
   const h=document.createElement('h3');h.textContent=versions.length>1?`${v} · ${NOTES[v].title}`:NOTES[v].title;section.append(h);
   const ul=document.createElement('ul');for(const item of NOTES[v].items){const li=document.createElement('li');li.textContent=item;ul.append(li);}
   section.append(ul);body.append(section);
  }
  dialog.showModal();
  // Remembered only once the notice is really on screen: an app closed before that shows it at the next start.
  if(rememberAs)remember(rememberAs);
 }
 function showWaiting(){if(!waiting)return false;const w=waiting;waiting=null;show(w.versions,w.remember);return true;}
 // Wait, with no time limit, until no other dialog (first-run settings, recovery notice …) is open.
 function whenFree(task){if(!document.querySelector('dialog[open]'))task();else setTimeout(()=>whenFree(task),500);}
 function hasData(){try{return !!window.BackupCore?.hasUserData(BackupCore.collect(k=>localStorage.getItem(k)));}catch{return false;}}
 let current=null;
 window.desktop.updateState().then(state=>{
  current=state?.currentVersion||null;
  let seen=null;try{seen=JSON.parse(localStorage.getItem(KEY));}catch{}
  const result=decide({seen,current,hasData:hasData()});
  if(result.show.length){waiting={versions:result.show,remember:result.remember};setTimeout(()=>whenFree(showWaiting),800);}
  else if(result.remember&&result.remember!==seen)remember(result.remember); // new install, no notes, or an older version
  addReplayButton();
 }).catch(()=>{});
 // Settings → 업데이트 dialog gets a [새로워진 점] button while the running version has notes.
 function addReplayButton(){
  if(!NOTES[current])return;
  const actions=document.querySelector('#updateDialog .actions');if(!actions||actions.querySelector('#whatsNewReplay'))return;
  const b=document.createElement('button');b.type='button';b.id='whatsNewReplay';b.className='uc-btn--ghost';b.textContent='새로워진 점';
  // While the startup notice still waits, this shows (and remembers) that one instead, so it does not appear twice.
  b.onclick=()=>{document.getElementById('updateDialog')?.close();if(!showWaiting())show([current]);};
  actions.prepend(b);
 }
})(globalThis);
