/* Independent, local-only classroom tool. No student data is sent to a server. */
window.createRandomPicker=function({read,put}){
 const root=document.createElement('section');root.id='randomScreen';root.hidden=true;root.setAttribute('role','tabpanel');root.setAttribute('aria-labelledby','randomTab');document.body.append(root);
 root.innerHTML=`<div class="random-heading"><h1>랜덤 뽑기</h1><span id="randomClass"></span></div><div class="random-layout"><aside><h2>학생 명단</h2><div id="rosterList"></div><details id="rosterEditor"><summary>학생 명단 편집</summary><p>한 줄에 한 명씩 입력하세요. 줄을 추가·수정·삭제하거나 순서를 바꿀 수 있습니다. 전체 붙여넣기도 가능합니다.</p><textarea id="rosterText" rows="8" aria-label="학생 명단"></textarea><button id="saveRoster">명단 저장</button></details><details id="exclusionDetails"><summary>오늘 제외</summary><div id="excludeList"></div><button id="includeAll">전체 다시 포함</button></details></aside><div class="random-center"><label class="random-check"><input id="noRepeat" type="checkbox" checked> 한 바퀴 돌 때까지 중복 없이 뽑기</label><div class="random-count"><label>인원 <select id="pickCount"><option>1</option><option>2</option><option>3</option><option>4</option><option value="custom">직접 입력</option></select></label><input id="customCount" type="number" min="1" max="200" value="5" aria-label="직접 입력 인원" hidden></div><button id="drawOne">한 명 뽑기</button><button id="drawMany">선택 인원 뽑기</button><div id="pickResult" aria-live="polite"></div><p id="pickStatus" role="status"></p><div class="random-actions"><button id="drawAgain" hidden>다시 뽑기</button><button id="cancelDraw" hidden>뽑기 취소</button><button id="newRound">새 라운드 시작</button></div><section id="groupPicker"><h2>랜덤 모둠 만들기</h2><div class="random-actions"><select id="groupMode" aria-label="모둠 편성 방식"><option value="2">2명씩</option><option value="3">3명씩</option><option value="4">4명씩</option><option value="count">모둠 수 지정</option></select><input id="groupCount" type="number" min="1" max="200" value="3" aria-label="모둠 수" hidden><button id="makeGroups">모둠 만들기</button><button id="shuffleGroups">다시 섞기</button></div><div id="groupResults"></div></section></div><aside><h2>오늘 뽑힌 사람</h2><ol id="pickHistory"></ol><button id="clearHistory">기록 초기화</button></aside></div>`;
 const $=id=>root.querySelector('#'+id);let state,key,date,busy=false,interval,timeout,last=null,lastCount=1;
 const today=()=>Core.dateKey(),classKey=()=>ClassRoster.key();
 function persist(){put('randomPickerSession',{key,date,excluded:state.excluded,history:state.history,noRepeat:state.noRepeat});}
 function savePermanentRoster(){ClassRoster.save(state.students);}
 function sync(){const next=classKey(),d=today();if(next!==key||d!==date){stop();key=next;date=d;
 // Roster migration and storage are shared with the activity tool.
 const session=read('randomPickerSession',{}),same=session.key===key&&session.date===d;
 state={students:ClassRoster.get(),date:d,noRepeat:session.noRepeat!==false,excluded:same?session.excluded||[]:[],history:same?session.history||[]:[]};last=null;persist();render();}}

 function stop(){clearInterval(interval);clearTimeout(timeout);busy=false;}
 const eligible=()=>state.students.filter(s=>!state.excluded.includes(s.id));
 const pool=()=>eligible().filter(s=>!state.noRepeat||!state.history.includes(s.id));
 function shuffle(items){const out=[...items];for(let i=out.length-1;i>0;i--){const limit=Math.floor(4294967296/(i+1))*(i+1);let r;do{r=crypto.getRandomValues(new Uint32Array(1))[0];}while(r>=limit);const j=r%(i+1);[out[i],out[j]]=[out[j],out[i]];}return out;}
 function result(items){$('pickResult').replaceChildren(...items.map((s,i)=>{const el=document.createElement('div');el.textContent=(items.length===1?'🎉 ':`${i+1}. `)+s.name;return el;}));}
 function render(){ $('randomClass').textContent=`${academicYear()}학년도 옥구초등학교 ${settings.grade||'—'}학년 ${settings.classroom||'—'}반`;$('rosterList').replaceChildren(...state.students.map(s=>{const item=document.createElement('div');item.textContent=s.name;return item;}));$('rosterText').value=state.students.map(s=>s.name).join('\n');$('noRepeat').checked=state.noRepeat!==false;$('excludeList').replaceChildren(...state.students.map(s=>{const label=document.createElement('label');label.className='random-check';const box=document.createElement('input');box.type='checkbox';box.checked=state.excluded.includes(s.id);box.onchange=()=>{stop();last=null;state.excluded=box.checked?[...state.excluded,s.id]:state.excluded.filter(id=>id!==s.id);persist();result([]);$('groupResults').replaceChildren();render();};label.append(box,document.createTextNode(s.name));return label;}));$('pickHistory').replaceChildren(...state.history.map(id=>{const li=document.createElement('li');li.textContent=state.students.find(s=>s.id===id)?.name||'';return li;}));$('pickStatus').textContent=!state.students.length?'먼저 학생 명단을 등록해 주세요.':!eligible().length?'모든 학생이 오늘 제외되어 있습니다.':state.noRepeat&&!pool().length?'모두 한 번씩 뽑았습니다.':'';$('drawAgain').hidden=!last;$('cancelDraw').hidden=!last&&!busy;}
 function draw(n){sync();if(busy)return;if(!Number.isInteger(n)||n<1){$('pickStatus').textContent='1 이상의 정수를 입력해 주세요.';return;}const candidates=pool();if(candidates.length<n){$('pickStatus').textContent=`뽑을 수 있는 학생은 ${candidates.length}명입니다. 인원을 줄이거나 새 라운드를 시작해 주세요.`;return;}busy=true;last=null;lastCount=n;$('cancelDraw').hidden=false;$('drawAgain').hidden=true;$('pickStatus').textContent='뽑는 중…';const startKey=key,startDate=date;interval=setInterval(()=>{ $('pickResult').textContent=candidates[Math.floor(Math.random()*candidates.length)].name;},85);timeout=setTimeout(()=>{stop();if(classKey()!==startKey||today()!==startDate){sync();return;}const chosen=shuffle(candidates).slice(0,n);last={before:[...state.history],chosen};state.history.push(...chosen.map(s=>s.id));persist();render();result(chosen);},1500);}
 $('drawOne').onclick=()=>draw(1);$('drawMany').onclick=()=>draw(Number($('pickCount').value==='custom'?$('customCount').value:$('pickCount').value));$('drawAgain').onclick=()=>draw(lastCount);$('cancelDraw').onclick=()=>{stop();if(last)state.history=last.before;last=null;persist();result([]);render();};
 function reset(){stop();state.history=[];last=null;persist();result([]);render();}
 $('newRound').onclick=reset;$('clearHistory').onclick=reset;
 $('noRepeat').onchange=()=>{stop();state.noRepeat=$('noRepeat').checked;last=null;persist();result([]);render();};
 $('saveRoster').onclick=()=>{sync();const names=$('rosterText').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);if(names.length>200){$('pickStatus').textContent='명단은 200명 이하로 입력해 주세요.';return;}if(state.students.length&&!confirm('명단을 저장하면 현재 뽑기 기록이 초기화됩니다. 저장할까요?'))return;const old=[...state.students];state.students=names.map(name=>{const index=old.findIndex(s=>s.name===name);return index>=0?old.splice(index,1)[0]:{id:crypto.randomUUID(),name};});savePermanentRoster();state.excluded=state.excluded.filter(id=>state.students.some(s=>s.id===id));$('groupResults').replaceChildren();reset();$('rosterEditor').open=false;};
 $('includeAll').onclick=()=>{stop();state.excluded=[];last=null;persist();result([]);$('groupResults').replaceChildren();render();};
 $('pickCount').onchange=()=>$('customCount').hidden=$('pickCount').value!=='custom';$('groupMode').onchange=()=>$('groupCount').hidden=$('groupMode').value!=='count';
 function groups(){sync();const students=shuffle(eligible());const n=$('groupMode').value==='count'?Number($('groupCount').value):Math.ceil(students.length/Number($('groupMode').value));if(!Number.isInteger(n)||n<1||n>students.length){$('pickStatus').textContent='모둠 수는 참여 학생 수 이내의 양의 정수여야 합니다.';return;}const groups=Array.from({length:n},()=>[]);students.forEach((s,i)=>groups[i%n].push(s));$('groupResults').replaceChildren(...groups.map((g,i)=>{const el=document.createElement('div');const title=document.createElement('h3');title.textContent=`${i+1}모둠`;const members=document.createElement('p');members.textContent=g.map(s=>s.name).join(' / ');el.append(title,members);return el;}));}
 $('makeGroups').onclick=groups;$('shuffleGroups').onclick=groups;
 document.addEventListener('keydown',e=>{if(root.hidden||e.code!=='Space'||e.repeat||document.querySelector('dialog[open]')||e.target.closest('input,textarea,select,button,summary,[contenteditable="true"]'))return;e.preventDefault();draw(1);});
 // Fit each column independently, keeping every control and name on screen.
 const panels=[...root.querySelector('.random-layout').children];
 const contents=panels.map(panel=>{const content=document.createElement('div');content.className='random-fit-content';content.append(...panel.childNodes);panel.append(content);return content;});
 let fitFrame;
 function fit(){
  cancelAnimationFrame(fitFrame);
  fitFrame=requestAnimationFrame(()=>{
   if(root.hidden)return;
   contents.forEach((content,i)=>{
    const panel=panels[i],style=getComputedStyle(panel);
    const height=panel.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
    const width=panel.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
    const fits=scale=>{content.style.zoom=scale;const rect=content.getBoundingClientRect();return rect.height<=height-2&&content.scrollWidth*scale<=width+1;};
    let low=.01,high=1;
    if(!fits(1)){for(let n=0;n<12;n++){const mid=(low+high)/2;if(fits(mid))low=mid;else high=mid;}fits(low);} 
   });
  });
 }
 new ResizeObserver(fit).observe(root);
 new MutationObserver(fit).observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','open']});
 root.addEventListener('toggle',fit,true);
 document.fonts.ready.then(fit);
 setInterval(()=>{if(!root.hidden)sync();},1000);
 return {drawOne:()=>draw(1),setNoRepeat(value){sync();$('noRepeat').checked=value===true;$('noRepeat').onchange();},snapshot(){sync();return {key,result:$('pickResult').textContent,remaining:pool().length,noRepeat:state.noRepeat!==false,busy,status:$('pickStatus').textContent};},activate(active){root.hidden=!active;if(active){sync();if(!state.students.length)$('rosterEditor').open=true;}else{if(state)render();}}};
};
