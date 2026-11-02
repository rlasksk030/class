window.createActivityCompletion=function({read,put}){
 const root=document.createElement('section');root.id='activityScreen';root.hidden=true;
 root.setAttribute('role','tabpanel');root.setAttribute('aria-labelledby','activityTab');
 root.innerHTML=`<div class="activity-heading"><div class="activity-title-area"><label for="activityTitle">활동완료 <span id="activityClass"></span></label><input id="activityTitle" type="text" maxlength="160" placeholder="활동명을 입력하세요" autocomplete="off"></div><button id="newActivity" type="button">새 활동</button><details class="activity-menu"><summary aria-label="전체 상태 변경 메뉴">더보기</summary><div><button id="completeAll" type="button">전체 완료</button><button id="incompleteAll" type="button">전체 미완료</button></div></details></div><div class="activity-feedback"><span id="activityMessage" role="status" aria-live="polite"></span><span id="activitySaveStatus" role="status"></span></div><div class="activity-columns"><section class="activity-column pending"><h2>미완료 <span id="pendingCount">0명</span></h2><div id="pendingStudents" class="activity-cards" aria-label="미완료 학생"></div></section><section class="activity-column complete"><h2>완료 <span id="completeCount">0명</span></h2><div id="completeStudents" class="activity-cards" aria-label="완료 학생"></div></section></div>`;
 document.body.append(root);
 const $=id=>root.querySelector('#'+id);let key=null,activity={title:'',done:[]},rosterSignature='';
 function save(){
  const states=read('activityCompletion',{});states[key]={title:activity.title,done:[...activity.done]};
  const saved=put('activityCompletion',states);
  $('activitySaveStatus').textContent=saved?'자동 저장됨':'저장 공간을 확인해 주세요. 변경 내용이 저장되지 않았습니다.';
 }
 function sync(){
  const next=ClassRoster.key(),students=ClassRoster.get(),signature=JSON.stringify(students);
  if(key!==next){
   key=next;const stored=read('activityCompletion',{})[key];
   activity={title:typeof stored?.title==='string'?stored.title:'',done:Array.isArray(stored?.done)?stored.done:[]};
   $('activityTitle').value=activity.title;$('activitySaveStatus').textContent='';
   rosterSignature='';
  }
  if(signature!==rosterSignature){
   rosterSignature=signature;
   const ids=new Set(students.map(s=>s.id));const done=activity.done.filter(id=>ids.has(id));
   if(done.length!==activity.done.length){activity.done=done;save();}
  }
  $('activityClass').textContent=`${academicYear()}학년도 · ${settings.grade||'—'}학년 ${settings.classroom||'—'}반`;
  return students;
 }
 function render(movedId,focus=false){
  const students=sync(),done=new Set(activity.done),pending=$('pendingStudents'),complete=$('completeStudents');
  pending.replaceChildren();complete.replaceChildren();let moved;
  for(const student of students){
   const finished=done.has(student.id),button=document.createElement('button');button.type='button';
   button.className='activity-student';button.dataset.studentId=student.id;
   button.textContent=student.name+(finished?' ✓':'');
   button.setAttribute('aria-label',student.name+(finished?' — 완료 취소':' — 완료로 이동'));
   button.onclick=()=>toggle(student.id,true);
   (finished?complete:pending).append(button);if(student.id===movedId)moved=button;
  }
  const count=students.filter(s=>done.has(s.id)).length;
  $('pendingCount').textContent=(students.length-count)+'명';$('completeCount').textContent=count+'명';
  $('activityMessage').textContent=!students.length?'랜덤 뽑기 탭에서 현재 학급 명단을 등록해 주세요.':count===students.length?'✓ 모두 완료했어요!':'';
  if(moved){if(focus)moved.focus({preventScroll:true});moved.scrollIntoView({block:'nearest'});if(!matchMedia('(prefers-reduced-motion: reduce)').matches)moved.animate([{opacity:.35,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:180,easing:'ease-out'});}
 }
 const titleInput=$('activityTitle');let composingTitle=false;
 function setTitle(value){sync();activity.title=String(value).slice(0,160);if(!composingTitle&&titleInput.value!==activity.title)titleInput.value=activity.title;save();}
 titleInput.addEventListener('pointerdown',()=>{window.desktop?.focusInput?.();titleInput.focus({preventScroll:true});});
 titleInput.addEventListener('compositionstart',()=>{composingTitle=true;});
 titleInput.addEventListener('compositionend',()=>{composingTitle=false;setTitle(titleInput.value);});
 titleInput.addEventListener('input',()=>{if(!composingTitle)setTitle(titleInput.value);});
 titleInput.addEventListener('blur',()=>{composingTitle=false;setTitle(titleInput.value);});
 $('newActivity').onclick=()=>{if(!confirm('현재 완료 상태를 초기화하고 새 활동을 시작할까요?'))return;sync();activity={title:'',done:[]};$('activityTitle').value='';save();render();$('activityTitle').focus();};
 function setAll(completed){
  if(!confirm(completed?'모든 학생을 완료로 변경할까요?':'모든 학생을 미완료로 변경할까요?'))return;
  const students=sync();activity.done=completed?students.map(s=>s.id):[];save();render();root.querySelector('.activity-menu').open=false;
 }
 $('completeAll').onclick=()=>setAll(true);$('incompleteAll').onclick=()=>setAll(false);
 document.addEventListener('class-roster-changed',()=>{if(!root.hidden)render();});
 window.addEventListener('storage',e=>{if(root.hidden)return;if(e.key==='activityCompletion'){key=null;render();}else if(e.key==='classRosters')render();});
 setInterval(()=>{if(!root.hidden&&(ClassRoster.key()!==key||JSON.stringify(ClassRoster.get())!==rosterSignature))render();},1000);
 function toggle(id,focus=false){const students=sync();if(!students.some(s=>s.id===id))return;const done=new Set(activity.done);if(done.has(id))done.delete(id);else done.add(id);activity.done=[...done];save();render(id,focus);}
 return {toggle,setTitle,snapshot(){const students=sync();return {key,title:activity.title,done:activity.done,students};},activate(active){root.hidden=!active;if(active)render();else root.querySelector('.activity-menu').open=false;}};
};
