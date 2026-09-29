// Optional classroom tools. The dashboard grid and existing data services are retained.
(() => {
 const X=ExtrasCore, ids=['timetable','meal','morning','notices','weather'];
 const names={timetable:'시간표',meal:'급식',morning:'아침활동',notices:'안내사항',weather:'날씨'};
 const card=id=>document.querySelector('.'+id);
 const make=(tag,props={},parent)=>{const el=document.createElement(tag);Object.assign(el,props);if(parent)parent.append(el);return el;};
 function modal(id,title,body){const d=make('dialog',{id,className:'extras-dialog'},document.body);d.innerHTML=`<div class="extras-heading"><h2>${title}</h2><button type="button" class="close-extra">닫기</button></div>${body}`;d.querySelector('.close-extra').onclick=()=>d.close();return d;}
 const dock=make('div',{className:'utility-controls'},document.body);
 const tabs=make('div',{className:'screen-tabs'},dock);tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','교실 화면');
 const dashboardTab=make('button',{id:'dashboardTab',textContent:'대시보드'},tabs),whiteboardTab=make('button',{id:'whiteboardTab',textContent:'화이트보드'},tabs);
 [dashboardTab,whiteboardTab].forEach(b=>b.setAttribute('role','tab'));
 const timerButton=make('button',{id:'timerButton',textContent:'⏱ 타이머'},dock);
 const panelButton=make('button',{id:'screenSettings',textContent:'화면 설정'},dock);
 const titleLine=make('div',{className:'class-title-line'});
 const classTitle=$('classTitle');classTitle.before(titleLine);titleLine.append(classTitle);
 const dateLine=make('div',{className:'date-dday-line'});
 const dateLabel=$('date');dateLabel.before(dateLine);dateLine.append(dateLabel);
 const ddayBadge=make('div',{id:'ddayBadge'},dateLine);
 const timerBanner=make('div',{id:'timerFinished',hidden:true},document.body);timerBanner.setAttribute('role','alert');make('strong',{textContent:'시간이 다 되었습니다!'},timerBanner);const acknowledge=make('button',{textContent:'확인'},timerBanner);let timerAcknowledged=false;acknowledge.onclick=()=>{timerAcknowledged=true;timerBanner.hidden=true;};

 // Board visibility keeps the grid slot reserved so other cards never move.
 let preferences=read('boardPreferences',{});
 if(!preferences||typeof preferences!=='object'||Array.isArray(preferences))preferences={};
 window.boardFontScales={};
 for(const id of ids){const p=preferences[id];preferences[id]={visible:p?.visible!==false,scale:Number.isFinite(p?.scale)?Math.max(.5,Math.min(2,p.scale)):1};window.boardFontScales[id]=preferences[id].scale;}
 const weatherBox=card('weather').getBoundingClientRect();
 card('weather').style.setProperty('--weather-font-width',weatherBox.width+'px');
 card('weather').style.setProperty('--weather-font-height',weatherBox.height+'px');
 function applyPreferences(){
  ids.forEach(id=>{card(id).classList.toggle('board-concealed',!preferences[id].visible);card(id).setAttribute('aria-hidden',String(!preferences[id].visible));window.boardFontScales[id]=preferences[id].scale;});
  card('weather').classList.toggle('weather-font-custom',preferences.weather.scale!==1);
  fitContents();document.dispatchEvent(new Event('board-font-change'));
 }
 const panel=modal('screenDialog','화면 설정',`<p>숨긴 보드의 자리는 유지됩니다. 글씨는 선택한 크기를 기준으로 카드 안에 맞춰집니다.</p><div id="boardPreferences"></div><div class="extras-links"><button id="openPeriodSettings">교시 시간 설정</button><button id="openDdaySettings">D-Day 관리</button></div>`);
 for(const id of ids){const row=make('div',{className:'preference-row'},$('boardPreferences'));const label=make('label',{},row);const check=make('input',{type:'checkbox',checked:preferences[id].visible},label);check.dataset.boardVisible=id;label.append(document.createTextNode(names[id]+' 표시'));const minus=make('button',{textContent:'A−'},row),out=make('output',{textContent:Math.round(preferences[id].scale*100)+'%'},row),plus=make('button',{textContent:'A+'},row);
  minus.setAttribute('aria-label',names[id]+' 글자 작게');plus.setAttribute('aria-label',names[id]+' 글자 크게');
  check.onchange=()=>{preferences[id].visible=check.checked;put('boardPreferences',preferences);applyPreferences();};
  const change=delta=>{preferences[id].scale=Math.max(.5,Math.min(2,Math.round((preferences[id].scale+delta)*10)/10));out.textContent=Math.round(preferences[id].scale*100)+'%';minus.disabled=preferences[id].scale<=.5;plus.disabled=preferences[id].scale>=2;put('boardPreferences',preferences);applyPreferences();};
  minus.onclick=()=>change(-.1);plus.onclick=()=>change(.1);
 }
 panelButton.onclick=()=>panel.showModal();

 // Periods are matched to the rendered timetable, which already includes teacher overrides.
 let schedule=read('periodSchedule',[]);if(!X.validSchedule(schedule))schedule=[];
 let highlightEnabled=read('periodHighlightEnabled',schedule.length>0)===true;
 const periodDialog=modal('periodDialog','교시 시간 설정',`<p>학교의 수업 시작·종료 시간을 한 번 저장해 주세요. 처음 표시되는 시간은 초등학교 예시입니다. 시간을 저장한 뒤 강조 켜기·끄기를 선택하세요.</p><p id="periodHighlightStatus" role="status"></p><form id="periodForm"><div id="periodRows"></div><div class="extras-links"><button type="button" id="addPeriod">교시 추가</button><button type="button" id="enablePeriods">강조 켜기</button><button type="button" id="disablePeriods">강조 끄기</button></div><p id="periodError" class="extras-message" role="status"></p><div class="actions"><button class="primary">시간 저장</button></div></form>`);
 function addPeriodRow(row){const el=make('div',{className:'schedule-row'},$('periodRows'));const p=make('input',{type:'number',min:'1',max:'20',value:row.period,required:true},el);p.setAttribute('aria-label','교시');const a=make('input',{type:'time',value:row.start,required:true},el);a.setAttribute('aria-label','시작');const b=make('input',{type:'time',value:row.end,required:true},el);b.setAttribute('aria-label','종료');make('button',{type:'button',textContent:'삭제',onclick:()=>el.remove()},el);}
 $('openPeriodSettings').onclick=()=>{panel.close();$('periodRows').replaceChildren();const examples=['09:00','09:50','10:40','11:30','13:00','13:50'].map((s,i)=>({period:i+1,start:s,end:`${String(Math.floor((X.minute(s)+40)/60)).padStart(2,'0')}:${String((X.minute(s)+40)%60).padStart(2,'0')}`}));(schedule.length?schedule:examples).forEach(addPeriodRow);$('periodError').textContent='';renderHighlightState();periodDialog.showModal();};
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
 function highlight(){const rows=[...$('timetable').querySelectorAll('.lesson')];const time=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());const match=X.currentPeriod(highlightEnabled?schedule:[],rows.map(r=>r.querySelector('b').textContent),X.minute(time));rows.forEach(r=>{const p=r.querySelector('b').textContent,state=match?.period===p?match.state:null;r.classList.toggle('lesson-current',state==='current');r.classList.toggle('lesson-next',state==='next');if(state==='current')r.setAttribute('aria-current','true');else r.removeAttribute('aria-current');r.title=state==='current'?'현재 수업':state==='next'?'다음 수업':'';});}
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
 function drawEvents(){ddayBadge.replaceChildren();X.nearestEvents(events,Core.dateKey()).forEach(e=>{const n=X.daysUntil(e.date,Core.dateKey());make('span',{textContent:`${e.title} ${n===0?'D-Day':'D-'+n}`,title:`${e.title} · ${e.date}`},ddayBadge);});}
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
 function drawTimer(){timerBanner.hidden=timer.state!=='finished'||timerAcknowledged;const remaining=X.timerRemaining(timer,Date.now());$('timerDisplay').textContent=format(remaining);timerButton.textContent=timer.state==='idle'?'⏱ 타이머':timer.state==='finished'?'⏱ 종료':`⏱ ${format(remaining)}`;timerButton.classList.toggle('finished',timer.state==='finished');timerDialog.classList.toggle('finished',timer.state==='finished');$('timerMessage').textContent=timer.state==='finished'?'시간이 다 되었습니다!':timer.state==='paused'?'일시정지':timer.state==='running'?'진행 중':'';$('timerStart').disabled=timer.state==='running';$('timerStart').textContent=timer.state==='paused'?'계속하기':'시작';$('timerPause').disabled=timer.state!=='running';}
 function act(action,duration){timerAcknowledged=false;if(sound)unlockAudio();timer=X.timerAction(timer,action,Date.now(),duration);put('classTimer',timer);drawTimer();}
 timerButton.onclick=()=>{drawTimer();timerDialog.showModal();};
 timerDialog.querySelectorAll('[data-minutes]').forEach(b=>b.onclick=()=>{const n=Number(b.dataset.minutes);$('timerMinutes').value=n;$('timerSeconds').value=0;act('preset',n*60000);});
 $('timerSet').onclick=()=>{const m=Number($('timerMinutes').value),s=Number($('timerSeconds').value);if(!Number.isInteger(m)||!Number.isInteger(s)||m<0||m>180||s<0||s>59||m*60+s<=0){$('timerMessage').textContent='1초 이상, 180분 59초 이하로 입력해 주세요.';return;}act('preset',(m*60+s)*1000);};
 $('timerStart').onclick=()=>act('start');$('timerPause').onclick=()=>act('pause');$('timerRestart').onclick=()=>act('restart');$('timerReset').onclick=()=>act('reset');$('timerSound').onchange=()=>{sound=$('timerSound').checked;put('timerSound',sound);if(sound)unlockAudio();};
 function timerTick(){const next=X.timerAction(timer,'tick',Date.now());if(next.state!==timer.state){timer=next;put('classTimer',timer);beep();}drawTimer();}
 setInterval(timerTick,250);

 // Keep the existing tab entry; only the whiteboard editor changes.
 const whiteboardTool=createClassWhiteboard({read,put});const whiteboard=whiteboardTool.element;
 const randomTool=createRandomPicker({read,put});const randomTab=make('button',{id:'randomTab',textContent:'랜덤 뽑기'},tabs);randomTab.setAttribute('role','tab');randomTab.setAttribute('aria-controls','randomScreen');
 const activityTool=createActivityCompletion({read,put});const activityTab=make('button',{id:'activityTab',textContent:'활동완료'},tabs);activityTab.setAttribute('role','tab');activityTab.setAttribute('aria-controls','activityScreen');
 const diaryTool=createClassDiary({read,put});const diaryTab=make('button',{id:'diaryTab',textContent:'알림장'},tabs);diaryTab.setAttribute('role','tab');diaryTab.setAttribute('aria-controls','diaryScreen');
 const allTabs=[dashboardTab,whiteboardTab,randomTab,activityTab,diaryTab];let activeScreen=0;
 function screen(index){activeScreen=index;diaryTool.activate(index===4);document.body.classList.toggle('diary-active',index===4);whiteboardTool.activate(index===1);randomTool.activate(index===2);activityTool.activate(index===3);document.body.classList.toggle('whiteboard-active',index===1);document.body.classList.toggle('random-active',index===2);document.body.classList.toggle('activity-active',index===3);allTabs.forEach((b,i)=>{b.setAttribute('aria-selected',String(i===index));b.tabIndex=i===index?0:-1;});for(const el of [document.querySelector('header'),document.querySelector('main'),document.querySelector('footer'),document.querySelector('.size-controls')])el.inert=index!==0;}
 allTabs.forEach((b,i)=>b.onclick=()=>screen(i));tabs.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const next=(activeScreen+(e.key==='ArrowRight'?1:allTabs.length-1))%allTabs.length;screen(next);allTabs[next].focus();}};
 dashboardTab.setAttribute('aria-controls','dashboardMain');document.querySelector('main').id='dashboardMain';document.querySelector('main').setAttribute('role','tabpanel');document.querySelector('main').setAttribute('aria-labelledby','dashboardTab');whiteboardTab.setAttribute('aria-controls','whiteboardScreen');
 window.classroomTools={whiteboard:whiteboardTool,random:randomTool,activity:activityTool,screen,schedule:()=>schedule,timer:()=>timer};
 screen(0);applyPreferences();drawEvents();highlight();timerTick();
 setInterval(()=>{highlight();const today=Core.dateKey();if(today!==historyDay){historyDay=today;archiveMorning(today,morningText);drawEvents();}},1000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){highlight();timerTick();drawEvents();}});
})();
