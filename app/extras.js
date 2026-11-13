// Optional classroom tools. The dashboard grid and existing data services are retained.
(() => {
 const X=ExtrasCore, ids=['timetable','meal','morning','notices','weather'];
 const names={timetable:'시간표',meal:'급식',morning:'아침활동',notices:'안내사항',weather:'날씨'};
 const card=id=>document.querySelector('.'+id);
 const make=(tag,props={},parent)=>{const el=document.createElement(tag);Object.assign(el,props);if(parent)parent.append(el);return el;};
 function modal(id,title,body){const d=make('dialog',{id,className:'extras-dialog'},document.body);d.innerHTML=`<div class="extras-heading"><h2>${title}</h2><button type="button" class="close-extra uc-icon-btn" aria-label="닫기" title="닫기"><span class="uc-ico uc-ico--close" aria-hidden="true"></span></button></div>${body}`;d.querySelector('.close-extra').onclick=()=>d.close();return d;}
 const appBar=document.querySelector('.app-bar'),barLeft=appBar.querySelector('.app-bar__left'),barRight=appBar.querySelector('.app-bar__right');
 // A tool: line icon on top, short label below. Only the label text changes later.
 const tool=(id,iconName,label,parent)=>{const b=make('button',{id,type:'button',className:'uc-tool'},parent);b.append(ucIcon(iconName));make('span',{className:'uc-tool__label',textContent:label},b);return b;};
 const tabs=make('div',{className:'screen-tabs uc-tabs'},appBar.querySelector('.app-bar__center'));tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','교실 화면');
 const dashboardTab=make('button',{id:'dashboardTab',className:'uc-tab',textContent:'대시보드'},tabs),whiteboardTab=make('button',{id:'whiteboardTab',className:'uc-tab',textContent:'화이트보드'},tabs);
 [dashboardTab,whiteboardTab].forEach(b=>b.setAttribute('role','tab'));
 const timerButton=tool('timerButton','timer','타이머',barRight),timerLabel=timerButton.querySelector('.uc-tool__label');
 const panelButton=tool('screenSettings','display','화면 설정',barLeft);
 const titleLine=make('div',{className:'class-title-line'});
 const classTitle=$('classTitle');classTitle.before(titleLine);titleLine.append(classTitle);
 const dateLine=make('div',{className:'date-dday-line'});
 const dateLabel=$('date');dateLabel.before(dateLine);dateLine.append(dateLabel);
 const ddayBadge=make('div',{id:'ddayBadge'},dateLine);
 const timerBanner=make('div',{id:'timerFinished',hidden:true},document.body);timerBanner.setAttribute('role','alert');make('strong',{textContent:'시간이 다 되었습니다!'},timerBanner);const acknowledge=make('button',{textContent:'확인'},timerBanner);acknowledge.onclick=()=>dismissTimer();

 // Board visibility for the four grid boards lives in the saved layout (layout-ui.js): a hidden
 // board leaves an empty slot other boards can use. Only the weather card's flag stays here.
 let preferences=read('boardPreferences',{});
 if(!preferences||typeof preferences!=='object'||Array.isArray(preferences))preferences={};
 window.boardFontScales={};
 for(const id of ids){const p=preferences[id];preferences[id]={visible:p?.visible!==false,scale:Number.isFinite(p?.scale)?Math.max(.5,Math.min(2,p.scale)):1};window.boardFontScales[id]=preferences[id].scale;}
 const weatherBox=card('weather').getBoundingClientRect();
 card('weather').style.setProperty('--weather-font-width',weatherBox.width+'px');
 card('weather').style.setProperty('--weather-font-height',weatherBox.height+'px');
 const layoutBoard=id=>id!=='weather';
 function applyPreferences(){
  const weatherShown=preferences.weather.visible;
  card('weather').classList.toggle('board-concealed',!weatherShown);card('weather').setAttribute('aria-hidden',String(!weatherShown));
  ids.forEach(id=>{window.boardFontScales[id]=preferences[id].scale;});
  card('weather').classList.toggle('weather-font-custom',preferences.weather.scale!==1);
  fitContents();document.dispatchEvent(new Event('board-font-change'));
 }
 const structureCard=(value,title,desc)=>`<label class="structure-card structure-card--${value.toLowerCase()}"><span class="structure-mini" aria-hidden="true"><i class="mini-info"></i><i class="mini-a"></i><i class="mini-b"></i><i class="mini-c"></i><i class="mini-d"></i></span><span class="structure-choice"><input type="radio" name="layoutStructure" value="${value}">${value} · ${title}</span><span class="structure-desc">${desc}</span></label>`;
 const panel=modal('screenDialog','화면 설정',`<div class="settings-group-head"><strong>화면 구조</strong><span>언제든 바꿀 수 있고, 칸 배치는 구조마다 따로 기억합니다.</span></div><div class="structure-cards" role="radiogroup" aria-label="화면 구조">${structureCard('A','위쪽 머리글','지금처럼 학교 이름 · 날짜 · 날씨 · 시계를 위에 한 줄로. 칸 자리가 가장 넓습니다.')}${structureCard('B','왼쪽 정보 기둥','시계 · 지금 교시 · D-Day · 날씨를 왼쪽에 크게 모읍니다. 가로가 넓은 TV에서 잘 읽힙니다.')}</div><div class="settings-group-head"><strong>칸 표시와 글씨 크기</strong><span>숨긴 칸의 자리는 [배치 편집]에서 다른 칸으로 채울 수 있습니다.</span></div><div id="boardPreferences"></div><p id="boardVisibilityStatus" class="extras-message" role="status"></p><div class="extras-links"><button id="openPeriodSettings" type="button">교시 시간 설정</button><button id="openDdaySettings" type="button">D-Day 관리</button></div>`);
 const structureInputs=[...panel.querySelectorAll('input[name="layoutStructure"]')];
 const showStructure=()=>{const s=window.boardLayout.structure();structureInputs.forEach(i=>{i.checked=i.value===s;i.closest('.structure-card').classList.toggle('is-selected',i.checked);});};
 // Switching applies at once; each structure keeps its own arrangement (layout-ui.js).
 structureInputs.forEach(i=>i.onchange=()=>{if(i.checked){window.boardLayout.setStructure(i.value);showStructure();}});
 document.addEventListener('layout-structure-change',showStructure);showStructure();
 for(const id of ids){const row=make('div',{className:'preference-row'},$('boardPreferences'));const label=make('label',{},row);const check=make('input',{type:'checkbox',checked:layoutBoard(id)?window.boardLayout.isVisible(id):preferences[id].visible},label);check.dataset.boardVisible=id;label.className='check';label.append(document.createTextNode(names[id]+' 표시'));const minus=make('button',{type:'button',textContent:'가−'},row),out=make('output',{textContent:Math.round(preferences[id].scale*100)+'%'},row),plus=make('button',{type:'button',textContent:'가+'},row);
  minus.setAttribute('aria-label',names[id]+' 글자 작게');plus.setAttribute('aria-label',names[id]+' 글자 크게');
  check.onchange=()=>{
   $('boardVisibilityStatus').textContent='';
   if(!layoutBoard(id)){preferences[id].visible=check.checked;put('boardPreferences',preferences);applyPreferences();return;}
   const result=window.boardLayout.setVisible(id,check.checked);
   if(!result.ok){check.checked=!check.checked;$('boardVisibilityStatus').textContent=result.message;}
  };
  const change=delta=>{preferences[id].scale=Math.max(.5,Math.min(2,Math.round((preferences[id].scale+delta)*10)/10));out.textContent=Math.round(preferences[id].scale*100)+'%';minus.disabled=preferences[id].scale<=.5;plus.disabled=preferences[id].scale>=2;put('boardPreferences',preferences);applyPreferences();};
  minus.onclick=()=>change(-.1);plus.onclick=()=>change(.1);
 }
 panelButton.onclick=()=>panel.showModal();
 // [배치 편집] can hide or show boards too; keep the checks in step with the layout.
 document.addEventListener('board-layout-change',()=>{for(const box of panel.querySelectorAll('[data-board-visible]'))if(layoutBoard(box.dataset.boardVisible))box.checked=window.boardLayout.isVisible(box.dataset.boardVisible);});

 // Periods are matched to the rendered timetable, which already includes teacher overrides.
 let schedule=read('periodSchedule',[]);if(!X.validSchedule(schedule))schedule=[];
 let highlightEnabled=read('periodHighlightEnabled',schedule.length>0)===true;
 const periodDialog=modal('periodDialog','교시 시간 설정',`<p>학교의 수업 시작·종료 시간을 한 번 저장해 주세요. 처음 표시되는 시간은 초등학교 예시입니다. 시간을 저장한 뒤 강조 켜기·끄기를 선택하세요.</p><p id="periodHighlightStatus" role="status"></p><form id="periodForm"><div id="periodRows"></div><div class="extras-links"><button type="button" id="addPeriod">교시 추가</button><button type="button" id="enablePeriods">강조 켜기</button><button type="button" id="disablePeriods">강조 끄기</button></div><p id="periodError" class="extras-message" role="status"></p><div class="actions"><button class="primary">시간 저장</button></div></form>`);
 function addPeriodRow(row){const el=make('div',{className:'schedule-row'},$('periodRows'));const p=make('input',{type:'number',min:'1',max:'20',value:row.period,required:true},el);p.setAttribute('aria-label','교시');const a=make('input',{type:'time',value:row.start,required:true},el);a.setAttribute('aria-label','시작');const b=make('input',{type:'time',value:row.end,required:true},el);b.setAttribute('aria-label','종료');make('button',{type:'button',textContent:'삭제',onclick:()=>el.remove()},el);}
 const openPeriods=()=>{if(window.dashboardLocked)return;panel.close();$('periodRows').replaceChildren();const examples=['09:00','09:50','10:40','11:30','13:00','13:50'].map((s,i)=>({period:i+1,start:s,end:`${String(Math.floor((X.minute(s)+40)/60)).padStart(2,'0')}:${String((X.minute(s)+40)%60).padStart(2,'0')}`}));(schedule.length?schedule:examples).forEach(addPeriodRow);$('periodError').textContent='';renderHighlightState();periodDialog.showModal();};
 $('openPeriodSettings').onclick=openPeriods;
 $('addPeriod').onclick=()=>{if($('periodRows').children.length<12)addPeriodRow({period:$('periodRows').children.length+1,start:'',end:''});};
 function renderHighlightState(){
  $('periodHighlightStatus').textContent='현재 강조 상태: '+(highlightEnabled?'켜짐':'꺼짐');
  $('periodHighlightStatus').dataset.enabled=String(highlightEnabled);
  $('enablePeriods').disabled=highlightEnabled;$('disablePeriods').disabled=!highlightEnabled;
 }
 function setHighlight(enabled){highlightEnabled=enabled;put('periodHighlightEnabled',enabled);renderHighlightState();highlight();$('periodError').textContent='강조 상태가 자동 저장되었습니다. 교시 시간은 유지됩니다.';}
 $('enablePeriods').onclick=()=>{if(!schedule.length){$('periodError').textContent='먼저 교시 시간을 저장해 주세요.';return;}setHighlight(true);};
 $('disablePeriods').onclick=()=>setHighlight(false);
 renderHighlightState();
 $('periodForm').onsubmit=e=>{e.preventDefault();const rows=[...$('periodRows').children].map(el=>{const [p,a,b]=el.querySelectorAll('input');return {period:Number(p.value),start:a.value,end:b.value};});if(!X.validSchedule(rows)){$('periodError').textContent='교시 번호가 중복되지 않고, 시간이 겹치지 않도록 시간순으로 입력해 주세요.';return;}schedule=rows;put('periodSchedule',schedule);renderHighlightState();highlight();$('periodError').textContent='교시 시간을 저장했습니다. 강조는 '+(highlightEnabled?'켜짐':'꺼짐')+' 상태입니다.';};
 const nowMinute=()=>X.minute(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()));
 // A start time and the "지금" tag live in each row; app.js rebuilds the rows when the timetable changes.
 function rowParts(r){
  let time=r.querySelector('.lesson-time'),tag=r.querySelector('.lesson-tag');
  if(!time)time=make('small',{className:'lesson-time'},r);
  if(!tag)tag=make('em',{className:'uc-tag-now lesson-tag',textContent:'지금',hidden:true},r);
  return {time,tag};
 }
 function highlight(){
  const rows=[...$('timetable').querySelectorAll('.lesson')],now=nowMinute(),periods=rows.map(r=>r.querySelector('b').textContent);
  const match=X.currentPeriod(highlightEnabled?schedule:[],periods,now),current=match?.state==='current'?match.period:null;
  rows.forEach(r=>{
   const p=r.querySelector('b').textContent,slot=schedule.find(s=>String(s.period)===p),{time,tag}=rowParts(r);
   time.textContent=slot?slot.start:'';
   const isCurrent=p===current,isPast=!isCurrent&&highlightEnabled&&!!slot&&X.minute(slot.end)<=now;
   r.classList.toggle('lesson-current',isCurrent);r.classList.toggle('lesson-past',isPast);tag.hidden=!isCurrent;
   if(isCurrent)r.setAttribute('aria-current','true');else r.removeAttribute('aria-current');
   r.title=isCurrent?'현재 수업':'';
  });
  $('timetable').closest('.card').classList.toggle('has-times',rows.some(r=>r.querySelector('.lesson-time').textContent));
  periodHint.hidden=schedule.length>0||!rows.length;
  drawNow(rows,now);
 }
 // [교시 시간 설정] at the bottom of the timetable (structure A; B has it in the left column).
 const periodHint=make('div',{className:'period-hint',hidden:true});$('timetable').after(periodHint);
 make('span',{textContent:'교시 시간을 넣으면 지금 교시가 강조돼요'},periodHint);
 make('button',{type:'button',className:'period-setup',textContent:'교시 시간 설정',onclick:openPeriods},periodHint);
 // 지금 교시 in the header (A) or the left column (B): only the current period, never the next one.
 const nowBox=$('nowPeriod');let nowKey='';
 function drawNow(rows,now){
  const slot=schedule.find(s=>X.minute(s.start)<=now&&now<X.minute(s.end)&&rows.some(r=>r.querySelector('b').textContent===String(s.period)));
  const subject=slot?rows.find(r=>r.querySelector('b').textContent===String(slot.period)).querySelector('span').textContent:'';
  const state=!schedule.length?'unset':slot?'current':'none',key=state+'|'+(slot?slot.period+'|'+slot.end+'|'+subject:'');
  nowBox.dataset.state=state;
  if(key!==nowKey){
   nowKey=key;nowBox.replaceChildren();
   if(state==='current'){
    make('span',{className:'now-tag',textContent:'지금'},nowBox);make('span',{className:'now-period-no',textContent:slot.period+'교시'},nowBox);
    make('span',{className:'now-subject',textContent:subject},nowBox);make('span',{className:'now-until',textContent:slot.end+'까지'},nowBox);
    make('span',{className:'now-remain'},nowBox);const bar=make('span',{className:'now-progress'},nowBox);make('span',{className:'now-progress__bar'},bar);
   }else if(state==='unset'){
    make('span',{className:'now-unset-title',textContent:'교시 시간 미설정'},nowBox);make('span',{className:'now-unset-hint',textContent:' — 시간표 칸에서 설정'},nowBox);
    make('span',{className:'now-unset-desc',textContent:'교시 시간을 넣으면 지금 교시와 남은 시간이 여기에 크게 나와요.'},nowBox);
    make('button',{type:'button',className:'period-setup now-unset-button',textContent:'교시 시간 설정',onclick:openPeriods},nowBox);
   }
  }
  if(state==='current'){
   const start=X.minute(slot.start),end=X.minute(slot.end),left=Math.max(0,end-now);
   nowBox.querySelector('.now-remain').textContent=`${left}분 남음`;
   nowBox.style.setProperty('--now-progress',String(Math.min(1,Math.max(0,(now-start)/Math.max(1,end-start)))));
  }
 }
 new MutationObserver(highlight).observe($('timetable'),{childList:true});

 // Morning's existing single saved value stays authoritative; this is history only.
 let history=read('morningHistory',{});if(!history||typeof history!=='object'||Array.isArray(history))history={};
 let historyDay=Core.dateKey();
 function archiveMorning(date,value){history[date]=value;put('morningHistory',history);}
 archiveMorning(historyDay,morningText);
 document.addEventListener('morning-saved',e=>archiveMorning(e.detail.date,e.detail.value));
 const yesterdayButton=make('button',{id:'loadYesterday',type:'button',textContent:'어제 내용 불러오기'});
 $('editText').before(yesterdayButton);
 const yesterdayStatus=make('p',{id:'yesterdayStatus',className:'extras-message'});yesterdayButton.after(yesterdayStatus);
 new MutationObserver(()=>{if($('editDialog').open){const supported=['morning','notices'].includes(editing?.kind);yesterdayButton.hidden=!supported;yesterdayStatus.hidden=!supported;yesterdayStatus.textContent='';}}).observe($('editDialog'),{attributes:true,attributeFilter:['open']});
 yesterdayButton.onclick=()=>{if(!editing)return;const prev=X.previousDay(editing.date);const value=editing.kind==='morning'?(Object.hasOwn(history,prev)?history[prev]:notes[prev]?.morning):notes[prev]?.notices;if(typeof value!=='string'){$('yesterdayStatus').textContent='어제 저장된 내용이 없습니다.';return;}if($('editText').value.trim()&&!confirm('현재 편집 중인 내용을 어제 내용으로 바꿀까요? 저장하기 전에는 기존 저장 내용이 유지됩니다.'))return;$('editText').value=value;$('yesterdayStatus').textContent='어제 내용을 복사했습니다. 수정 후 저장해 주세요.';};

 // Small D-Day labels; elapsed dates are retained in management but hidden on the board.
 let events=read('ddayEvents',[]);if(!Array.isArray(events))events=[];
 events=events.filter(e=>e&&typeof e.id==='string'&&typeof e.title==='string'&&typeof e.date==='string');
 let eventId=null;
 const eventDialog=modal('ddayDialog','D-Day 관리',`<form id="ddayForm"><label>제목<input id="ddayTitle" maxlength="40" required></label><label>목표 날짜<input id="ddayDate" type="date" required></label><div class="actions"><button type="button" id="newDday">새 일정</button><button class="primary">저장</button></div></form><div id="ddayList"></div>`);
 for(const settingsDialog of [panel,periodDialog,eventDialog]){
  const navigation=make('div',{className:'settings-navigation'},settingsDialog);
  if(settingsDialog!==panel)make('button',{type:'button',textContent:'← 화면 설정으로',onclick:()=>{settingsDialog.close();panel.showModal();}},navigation);
  make('button',{type:'button',className:'return-dashboard',textContent:'대시보드로 돌아가기',onclick:()=>{settingsDialog.close();screen(0);}},navigation);
 }
 function drawEvents(){ddayBadge.replaceChildren();X.nearestEvents(events,Core.dateKey()).forEach(e=>{const n=X.daysUntil(e.date,Core.dateKey()),pill=make('span',{className:'uc-dday'+(n===0?' uc-dday--today':''),title:`${e.title} · ${e.date}`},ddayBadge);make('b',{className:'uc-dday__title',textContent:e.title},pill);pill.append(' ');make('b',{className:'uc-dday__d',textContent:n===0?'D-Day':'D-'+n},pill);});}
 function editEvent(e){eventId=e?.id||null;$('ddayTitle').value=e?.title||'';$('ddayDate').value=e?.date||'';}
 function listEvents(){$('ddayList').replaceChildren();for(const event of [...events].sort((a,b)=>a.date.localeCompare(b.date))){const row=make('div',{className:'event-row'},$('ddayList'));make('span',{textContent:`${event.title} · ${event.date}${X.daysUntil(event.date,Core.dateKey())<0?' · 완료':''}`},row);make('button',{textContent:'수정',onclick:()=>editEvent(event)},row);make('button',{textContent:'삭제',onclick:()=>{events=events.filter(e=>e.id!==event.id);put('ddayEvents',events);if(eventId===event.id)editEvent(null);listEvents();drawEvents();}},row);}}
 $('openDdaySettings').onclick=()=>{panel.close();editEvent(null);listEvents();eventDialog.showModal();};$('newDday').onclick=()=>editEvent(null);
 $('ddayForm').onsubmit=e=>{e.preventDefault();const title=$('ddayTitle').value.trim(),date=$('ddayDate').value;if(!title||!Number.isFinite(X.daysUntil(date,Core.dateKey())))return;const value={id:eventId||crypto.randomUUID(),title,date};events=events.filter(e=>e.id!==value.id);events.push(value);put('ddayEvents',events);editEvent(null);listEvents();drawEvents();};

 // Deadline-based timer: closing the dialog never pauses time.
 let timer=read('classTimer',null);
 if(!timer||!Number.isFinite(timer.duration)||timer.duration<=0||!Number.isFinite(timer.remaining)||!['idle','running','paused','finished'].includes(timer.state)||(timer.state==='running'&&!Number.isFinite(timer.deadline)))timer={duration:300000,remaining:300000,deadline:null,state:'idle'};
 let sound=read('timerSound',false)===true,audioContext=null;
 const timerDialog=modal('timerDialog','타이머',`<div class="timer-presets">${[1,3,5,10,15].map(n=>`<button data-minutes="${n}">${n}분</button>`).join('')}</div><div class="fields"><label>분<input id="timerMinutes" type="number" min="0" max="180" value="5"></label><label>초<input id="timerSeconds" type="number" min="0" max="59" value="0"></label><button id="timerSet">직접 입력 적용</button></div><div id="timerDisplay" role="timer"></div><div id="timerMessage" role="status" aria-live="polite"></div><div class="actions"><button id="timerStart" class="primary">시작</button><button id="timerPause">일시정지</button><button id="timerRestart">다시 시작</button><button id="timerReset">초기화</button></div><label class="check"><input type="checkbox" id="timerSound">종료 알림음</label>`);
 $('timerSound').checked=sound;
 function unlockAudio(){try{audioContext||=new AudioContext();audioContext.resume().catch(()=>{});}catch{}}
 function beep(){if(!sound||!audioContext)return;try{for(let i=0;i<3;i++){const osc=audioContext.createOscillator(),gain=audioContext.createGain(),t=audioContext.currentTime+i*.35;osc.frequency.value=880;gain.gain.setValueAtTime(.12,t);gain.gain.exponentialRampToValueAtTime(.001,t+.25);osc.connect(gain);gain.connect(audioContext.destination);osc.start(t);osc.stop(t+.26);}}catch{}}
 const format=ms=>{const total=Math.ceil(ms/1000);return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;};
 function drawTimer(){timerBanner.hidden=timer.state!=='finished';const remaining=X.timerRemaining(timer,Date.now());$('timerDisplay').textContent=format(remaining);timerLabel.textContent=timer.state==='idle'?'타이머':timer.state==='finished'?'종료':format(remaining);timerButton.classList.toggle('finished',timer.state==='finished');timerDialog.classList.toggle('finished',timer.state==='finished');$('timerMessage').textContent=timer.state==='finished'?'시간이 다 되었습니다!':timer.state==='paused'?'일시정지':timer.state==='running'?'진행 중':'';$('timerStart').disabled=timer.state==='running';$('timerStart').textContent=timer.state==='paused'?'계속하기':'시작';$('timerPause').disabled=timer.state!=='running';}
 function act(action,duration){if(sound)unlockAudio();timer=X.timerAction(timer,action,Date.now(),duration);put('classTimer',timer);drawTimer();}
 function dismissTimer(){if(timer.state!=='finished')return;act('dismiss');$('timerMinutes').value=Math.floor(timer.duration/60000);$('timerSeconds').value=Math.floor(timer.duration/1000)%60;}
 function controlTimer(action){if(action==='dismiss')dismissTimer();else if(['start','pause','restart','reset'].includes(action))act(action);}
 // All closing paths, including native Escape, share the same state policy.
 timerDialog.addEventListener('close',()=>{dismissTimer();document.body.append(timerBanner);});
 timerButton.onclick=()=>{drawTimer();timerDialog.append(timerBanner);timerDialog.showModal();};
 timerDialog.querySelectorAll('[data-minutes]').forEach(b=>b.onclick=()=>{const n=Number(b.dataset.minutes);$('timerMinutes').value=n;$('timerSeconds').value=0;act('preset',n*60000);});
 $('timerSet').onclick=()=>{const m=Number($('timerMinutes').value),s=Number($('timerSeconds').value);if(!Number.isInteger(m)||!Number.isInteger(s)||m<0||m>180||s<0||s>59||m*60+s<=0){$('timerMessage').textContent='1초 이상, 180분 59초 이하로 입력해 주세요.';return;}act('preset',(m*60+s)*1000);};
 $('timerStart').onclick=()=>act('start');$('timerPause').onclick=()=>act('pause');$('timerRestart').onclick=()=>act('restart');$('timerReset').onclick=()=>act('reset');$('timerSound').onchange=()=>{sound=$('timerSound').checked;put('timerSound',sound);if(sound)unlockAudio();};
 function timerTick(){const next=X.timerAction(timer,'tick',Date.now());if(next.state!==timer.state){timer=next;put('classTimer',timer);beep();}drawTimer();}
 setInterval(timerTick,250);

 // Keep the existing tab entry; only the whiteboard editor changes.
 const whiteboardTool=createClassWhiteboard({read,put});const whiteboard=whiteboardTool.element;
 const randomTool=createRandomPicker({read,put});const randomTab=make('button',{id:'randomTab',className:'uc-tab',textContent:'랜덤 뽑기'},tabs);randomTab.setAttribute('role','tab');randomTab.setAttribute('aria-controls','randomScreen');
 const activityTool=createActivityCompletion({read,put});const activityTab=make('button',{id:'activityTab',className:'uc-tab',textContent:'활동완료'},tabs);activityTab.setAttribute('role','tab');activityTab.setAttribute('aria-controls','activityScreen');
 const diaryTool=createClassDiary({read,put});const diaryTab=make('button',{id:'diaryTab',className:'uc-tab',textContent:'알림장'},tabs);diaryTab.setAttribute('role','tab');diaryTab.setAttribute('aria-controls','diaryScreen');
 const allTabs=[dashboardTab,whiteboardTab,randomTab,activityTab,diaryTab];let activeScreen=0;
 function screen(index){if(index!==0&&window.boardLayout?.editing())window.boardLayout.finish();activeScreen=index;diaryTool.activate(index===4);document.body.classList.toggle('diary-active',index===4);whiteboardTool.activate(index===1);randomTool.activate(index===2);activityTool.activate(index===3);document.body.classList.toggle('whiteboard-active',index===1);document.body.classList.toggle('random-active',index===2);document.body.classList.toggle('activity-active',index===3);allTabs.forEach((b,i)=>{b.setAttribute('aria-selected',String(i===index));b.tabIndex=i===index?0:-1;});for(const el of [document.querySelector('header'),document.querySelector('main'),document.querySelector('footer'),document.querySelector('.app-bar__left')])el.inert=index!==0;}
 allTabs.forEach((b,i)=>b.onclick=()=>screen(i));tabs.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const next=(activeScreen+(e.key==='ArrowRight'?1:allTabs.length-1))%allTabs.length;screen(next);allTabs[next].focus();}};
 dashboardTab.setAttribute('aria-controls','dashboardMain');document.querySelector('main').id='dashboardMain';document.querySelector('main').setAttribute('role','tabpanel');document.querySelector('main').setAttribute('aria-labelledby','dashboardTab');whiteboardTab.setAttribute('aria-controls','whiteboardScreen');
 window.classroomTools={whiteboard:whiteboardTool,random:randomTool,activity:activityTool,screen,schedule:()=>schedule,timer:()=>timer,controlTimer};
 screen(0);applyPreferences();drawEvents();highlight();timerTick();
 setInterval(()=>{highlight();const today=Core.dateKey();if(today!==historyDay){historyDay=today;archiveMorning(today,morningText);drawEvents();}},1000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){highlight();timerTick();drawEvents();}});
})();
