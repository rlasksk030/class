/* Independent, local-only classroom tool. No student data is sent to a server. */
window.createRandomPicker=function({read,put}){
 const root=document.createElement('section');root.id='randomScreen';root.hidden=true;root.setAttribute('role','tabpanel');root.setAttribute('aria-labelledby','randomTab');document.body.append(root);
 // Layout (E01–E03): one large drawing card on the left (result, then the controls at its foot),
 // the roster and today's picks on the right. The presentation screen (E04) is a separate overlay.
 root.innerHTML=`<div class="random-heading uc-page-head"><h1 class="uc-page-head__title">랜덤 뽑기</h1><span id="randomClass" class="uc-page-head__sub"></span></div><div class="random-layout"><div class="random-main"><div class="random-stage"><div id="randomEmpty" class="random-empty"><p class="random-empty__msg">아직 뽑지 않았어요</p><p class="random-empty__sub">[한 명 뽑기]를 누르면 여기에 이름이 크게 나옵니다.</p></div><p id="randomLabel" class="random-label" hidden>뽑힌 사람</p><div id="pickResult" aria-live="polite"></div><p id="randomMeta" class="random-meta"></p><div id="groupResults"></div><div class="random-actions random-result-actions"><button id="showBig" type="button" class="primary" hidden>발표 화면으로 크게</button><button id="drawAgain" type="button" hidden>다시 뽑기</button><button id="cancelDraw" type="button" class="uc-btn--ghost" hidden>뽑기 취소</button></div><p id="pickStatus" role="status"></p></div><div class="random-controls"><div class="random-row"><button id="drawOne" type="button" class="primary random-draw-one">한 명 뽑기</button><span class="random-divider" aria-hidden="true"></span><span class="random-row__label" id="pickCountLabel">인원</span><div class="random-stepper" role="group" aria-labelledby="pickCountLabel"><button type="button" id="pickMinus" aria-label="인원 줄이기">−</button><output id="pickCount">2</output><button type="button" id="pickPlus" aria-label="인원 늘리기">+</button></div><button id="drawMany" type="button">선택 인원 뽑기</button><span class="random-row__gap"></span><label class="check random-check"><input id="noRepeat" type="checkbox" checked>한 바퀴 돌 때까지 중복 없이</label><button id="newRound" type="button">새 라운드 시작</button></div><div class="random-row random-groups"><span class="random-row__title">모둠 만들기</span><div class="uc-seg" id="groupMode" role="radiogroup" aria-label="모둠 편성 방식">${[2,3,4,5,6].map(n=>`<button type="button" role="radio" data-group-mode="${n}" aria-checked="${n===2}">${n}명씩</button>`).join('')}<button type="button" role="radio" data-group-mode="count" aria-checked="false">모둠 수</button></div><input id="groupCount" type="number" min="1" max="200" value="3" aria-label="모둠 수" hidden><button id="makeGroups" type="button">모둠 만들기</button><button id="shuffleGroups" type="button" class="uc-btn--ghost">다시 섞기</button></div></div></div><aside class="random-side"><section class="random-card random-roster"><div class="random-card__head"><h2>학생 명단 <span id="rosterCount"></span></h2><button type="button" id="rosterEdit" class="random-card__action">명단 편집</button></div><div id="rosterList"></div><details id="rosterEditor"><summary>학생 명단 편집</summary><p>한 줄에 한 명씩 입력하세요. 줄을 추가·수정·삭제하거나 순서를 바꿀 수 있습니다. 전체 붙여넣기도 가능합니다.</p><textarea id="rosterText" rows="8" aria-label="학생 명단"></textarea><button id="saveRoster" type="button" class="primary">명단 저장</button></details><div class="random-roster__foot"><span id="excludeCount"></span><button type="button" id="excludeToggle">오늘 제외</button></div><details id="exclusionDetails"><summary>오늘 제외</summary><div id="excludeList"></div><button id="includeAll" type="button">전체 다시 포함</button></details></section><section class="random-card random-history"><div class="random-card__head random-card__head--plain"><h2>오늘 뽑힌 사람</h2><button id="clearHistory" type="button" class="uc-btn--ghost">기록 초기화</button></div><ol id="pickHistory"></ol></section></aside></div>`;
 // E04: the picked name, large enough to read from the back of the classroom.
 const stage=document.createElement('section');stage.id='randomPresent';stage.className='random-present';stage.hidden=true;stage.setAttribute('role','dialog');stage.setAttribute('aria-label','랜덤 뽑기 발표 화면');
 stage.innerHTML='<div class="random-present__head"><span class="random-present__title">랜덤 뽑기 · 발표</span><button type="button" id="presentClose"><span class="uc-ico uc-ico--close" aria-hidden="true"></span>닫기</button></div><div class="random-present__card"><div class="random-present__label">뽑힌 사람</div><div class="random-present__body"><div id="presentName" class="random-present__name"></div><p id="presentMeta" class="random-present__meta"></p></div></div><div class="random-present__actions"><button type="button" id="presentAgain" class="primary">한 명 더 뽑기</button><button type="button" id="presentCancel">뽑기 취소</button></div>';
 document.body.append(stage);
 const $=id=>root.querySelector('#'+id)||stage.querySelector('#'+id);let state,key,date,busy=false,interval,timeout,last=null,lastCount=1,count=2,groupMode='2';
 const today=()=>Core.dateKey(),classKey=()=>ClassRoster.key();
 function persist(){put('randomPickerSession',{key,date,excluded:state.excluded,history:state.history,times:state.times,noRepeat:state.noRepeat});}
 function savePermanentRoster(){ClassRoster.save(state.students);}
 function sync(){const next=classKey(),d=today();if(next!==key||d!==date){stop();key=next;date=d;
 // Roster migration and storage are shared with the activity tool.
 const session=read('randomPickerSession',{}),same=session.key===key&&session.date===d;
 const history=same?session.history||[]:[],times=same&&Array.isArray(session.times)?session.times:[];
 state={students:ClassRoster.get(),date:d,noRepeat:session.noRepeat!==false,excluded:same?session.excluded||[]:[],history,times:history.map((_,i)=>Number.isFinite(times[i])?times[i]:null)};last=null;persist();render();}}
 function stop(){clearInterval(interval);clearTimeout(timeout);busy=false;}
 const eligible=()=>state.students.filter(s=>!state.excluded.includes(s.id));
 const pool=()=>eligible().filter(s=>!state.noRepeat||!state.history.includes(s.id));
 function shuffle(items){const out=[...items];for(let i=out.length-1;i>0;i--){const limit=Math.floor(4294967296/(i+1))*(i+1);let r;do{r=crypto.getRandomValues(new Uint32Array(1))[0];}while(r>=limit);const j=r%(i+1);[out[i],out[j]]=[out[j],out[i]];}return out;}
 // #pickResult holds only the names (the PIP reads its text); the label and the round line sit around it.
 function result(items){
  $('pickResult').replaceChildren(...items.map((s,i)=>{const el=document.createElement('div');el.textContent=items.length===1?s.name:`${i+1}. ${s.name}`;return el;}));
  $('pickResult').classList.toggle('is-many',items.length>1);
  showStage(items);
 }
 const roundLine=()=>state.noRepeat?`이번 바퀴 ${state.history.length}번째 · 남은 학생 ${pool().length}명`:`오늘 ${state.history.length}번째 · 참여 학생 ${eligible().length}명`;
 function showStage(items){
  const picked=items.length>0;
  $('randomLabel').hidden=!picked&&!busy;$('randomEmpty').hidden=picked||busy||!!$('groupResults').childElementCount;
  $('randomMeta').textContent=picked?roundLine():'';$('showBig').hidden=!picked;
  $('presentName').textContent=items.map(s=>s.name).join(' · ');$('presentName').classList.toggle('is-many',items.length>1);$('presentMeta').textContent=picked?roundLine():'';
 }
 const timeText=t=>Number.isFinite(t)?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t)):'';
 function render(){ $('randomClass').textContent=`${academicYear()}학년도 · ${settings.school?.SCHUL_NM||''} ${settings.grade||'—'}학년 ${settings.classroom||'—'}반`;
  $('rosterCount').textContent=state.students.length+'명';
  $('rosterList').replaceChildren(...state.students.map(s=>{const item=document.createElement('div');item.textContent=s.name;if(state.history.includes(s.id))item.className='is-picked';if(state.excluded.includes(s.id))item.classList.add('is-excluded');return item;}));
  $('rosterText').value=state.students.map(s=>s.name).join('\n');$('noRepeat').checked=state.noRepeat!==false;
  $('excludeCount').textContent=`오늘 제외 ${state.excluded.length}명`;
  $('excludeList').replaceChildren(...state.students.map(s=>{const label=document.createElement('label');label.className='check random-check';const box=document.createElement('input');box.type='checkbox';box.checked=state.excluded.includes(s.id);box.onchange=()=>{stop();last=null;state.excluded=box.checked?[...state.excluded,s.id]:state.excluded.filter(id=>id!==s.id);persist();result([]);$('groupResults').replaceChildren();render();};label.append(box,document.createTextNode(s.name));return label;}));
  $('pickHistory').replaceChildren(...state.history.map((id,i)=>{const li=document.createElement('li');const name=document.createElement('span');name.className='pick-name';name.textContent=state.students.find(s=>s.id===id)?.name||'';const at=document.createElement('span');at.className='pick-time';at.textContent=timeText(state.times[i]);li.append(name,at);return li;}));
  $('pickStatus').textContent=!state.students.length?'먼저 학생 명단을 등록해 주세요.':!eligible().length?'모든 학생이 오늘 제외되어 있습니다.':state.noRepeat&&!pool().length?'모두 한 번씩 뽑았습니다.':'';
  $('drawAgain').hidden=!last;$('cancelDraw').hidden=!last&&!busy;$('presentCancel').disabled=!last&&!busy;
  if(last){$('randomMeta').textContent=roundLine();$('presentMeta').textContent=roundLine();}
 }
 function draw(n){sync();if(busy)return;if(!Number.isInteger(n)||n<1){$('pickStatus').textContent='1 이상의 정수를 입력해 주세요.';return;}const candidates=pool();if(candidates.length<n){$('pickStatus').textContent=`뽑을 수 있는 학생은 ${candidates.length}명입니다. 인원을 줄이거나 새 라운드를 시작해 주세요.`;return;}busy=true;last=null;lastCount=n;$('cancelDraw').hidden=false;$('drawAgain').hidden=true;$('pickStatus').textContent='뽑는 중…';
 $('groupResults').replaceChildren();$('randomEmpty').hidden=true;$('randomLabel').hidden=false;$('pickResult').classList.remove('is-many');
 const startKey=key,startDate=date;interval=setInterval(()=>{const name=candidates[Math.floor(Math.random()*candidates.length)].name;$('pickResult').textContent=name;$('presentName').textContent=name;},85);
 timeout=setTimeout(()=>{stop();if(classKey()!==startKey||today()!==startDate){sync();return;}const chosen=shuffle(candidates).slice(0,n);last={before:[...state.history],beforeTimes:[...state.times],chosen};const now=Date.now();state.history.push(...chosen.map(s=>s.id));state.times.push(...chosen.map(()=>now));persist();render();result(chosen);},1500);}
 $('drawOne').onclick=()=>draw(1);
 // 인원 [−] n [+]: 1 to 200 (the old list offered 1–4 or a typed number).
 const setCount=n=>{count=Math.max(1,Math.min(200,n));$('pickCount').textContent=String(count);$('pickMinus').disabled=count<=1;};
 $('pickMinus').onclick=()=>setCount(count-1);$('pickPlus').onclick=()=>setCount(count+1);setCount(2);
 $('drawMany').onclick=()=>draw(count);
 $('drawAgain').onclick=()=>draw(lastCount);
 function cancel(){stop();if(last){state.history=last.before;state.times=last.beforeTimes;}last=null;persist();result([]);render();}
 $('cancelDraw').onclick=cancel;
 function reset(){stop();state.history=[];state.times=[];last=null;persist();result([]);render();}
 $('newRound').onclick=reset;$('clearHistory').onclick=reset;
 $('noRepeat').onchange=()=>{stop();state.noRepeat=$('noRepeat').checked;last=null;persist();result([]);render();};
 $('saveRoster').onclick=()=>{sync();const names=$('rosterText').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);if(names.length>200){$('pickStatus').textContent='명단은 200명 이하로 입력해 주세요.';return;}if(state.students.length&&!confirm('명단을 저장하면 현재 뽑기 기록이 초기화됩니다. 저장할까요?'))return;const old=[...state.students];state.students=names.map(name=>{const index=old.findIndex(s=>s.name===name);return index>=0?old.splice(index,1)[0]:{id:crypto.randomUUID(),name};});savePermanentRoster();state.excluded=state.excluded.filter(id=>state.students.some(s=>s.id===id));$('groupResults').replaceChildren();reset();$('rosterEditor').open=false;};
 // [명단 편집] and [오늘 제외] open the same editors as before (details elements).
 $('rosterEdit').onclick=()=>{$('rosterEditor').open=!$('rosterEditor').open;if($('rosterEditor').open)$('rosterText').focus();};
 $('excludeToggle').onclick=()=>{$('exclusionDetails').open=!$('exclusionDetails').open;};
 for(const d of [$('rosterEditor'),$('exclusionDetails')])d.addEventListener('toggle',()=>{root.classList.toggle('roster-editing',$('rosterEditor').open);root.classList.toggle('exclusion-open',$('exclusionDetails').open);$('rosterEdit').setAttribute('aria-expanded',String($('rosterEditor').open));$('excludeToggle').setAttribute('aria-expanded',String($('exclusionDetails').open));});
 $('includeAll').onclick=()=>{stop();state.excluded=[];last=null;persist();result([]);$('groupResults').replaceChildren();render();};
 // 모둠 만들기: 2–6명씩, or a number of groups ("모둠 수").
 root.querySelectorAll('[data-group-mode]').forEach(b=>b.onclick=()=>{groupMode=b.dataset.groupMode;root.querySelectorAll('[data-group-mode]').forEach(x=>x.setAttribute('aria-checked',String(x===b)));$('groupCount').hidden=groupMode!=='count';});
 function groups(){sync();const students=shuffle(eligible());const n=groupMode==='count'?Number($('groupCount').value):Math.ceil(students.length/Number(groupMode));if(!Number.isInteger(n)||n<1||n>students.length){$('pickStatus').textContent='모둠 수는 참여 학생 수 이내의 양의 정수여야 합니다.';return;}const groups=Array.from({length:n},()=>[]);students.forEach((s,i)=>groups[i%n].push(s));
  stop();last=null;result([]);$('randomEmpty').hidden=true;$('randomLabel').hidden=true;
  const sizes=[...new Set(groups.map(g=>g.length))].sort((a,b)=>b-a),small=groups.filter(g=>g.length===sizes.at(-1)).length,summary=document.createElement('p');summary.className='group-summary';
  summary.textContent=`모둠 ${n}개 · ${groupMode==='count'?'모둠 수로':sizes[0]+'명씩'} · ${students.length}명${sizes.length>1?` (${small===1?'한':small} 모둠은 ${sizes.at(-1)}명)`:''}`;
  const grid=document.createElement('div');grid.className='group-grid';
  grid.append(...groups.map((g,i)=>{const el=document.createElement('div');el.className='group-card group-card--'+(i%4);const title=document.createElement('h3');title.textContent=`${i+1}모둠`;const members=document.createElement('p');members.textContent=g.map(s=>s.name).join('\n');el.append(title,members);return el;}));
  $('groupResults').replaceChildren(summary,grid);render();}
 $('makeGroups').onclick=groups;$('shuffleGroups').onclick=groups;
 // E04 presentation screen: [한 명 더 뽑기] and [뽑기 취소] call the same drawing functions.
 const openStage=()=>{stage.hidden=false;document.body.classList.add('random-presenting');$('presentAgain').focus();};
 const closeStage=()=>{stage.hidden=true;document.body.classList.remove('random-presenting');if(!root.hidden)$('showBig').focus();};
 $('showBig').onclick=openStage;$('presentClose').onclick=closeStage;$('presentAgain').onclick=()=>draw(1);$('presentCancel').onclick=cancel;
 stage.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeStage();}});
 document.addEventListener('keydown',e=>{if(root.hidden||e.code!=='Space'||e.repeat||document.querySelector('dialog[open]')||e.target.closest('input,textarea,select,button,summary,[contenteditable="true"]'))return;e.preventDefault();draw(1);});
 setInterval(()=>{if(!root.hidden)sync();},1000);
 return {drawOne:()=>draw(1),setNoRepeat(value){sync();$('noRepeat').checked=value===true;$('noRepeat').onchange();},snapshot(){sync();return {key,result:$('pickResult').textContent,remaining:pool().length,noRepeat:state.noRepeat!==false,busy,status:$('pickStatus').textContent};},activate(active){root.hidden=!active;if(!active&&!stage.hidden)closeStage();if(active){sync();if(!state.students.length)$('rosterEditor').open=true;}else{if(state)render();}}};
};
