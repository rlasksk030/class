(() => {
 if(!window.desktop?.openPip)return;
 const startupLabel=document.createElement('label');startupLabel.className='check desktop-startup';
 const startup=document.createElement('input');startup.type='checkbox';startup.id='windowsStartup';startup.disabled=true;startupLabel.append(startup,document.createTextNode('Windows를 켜면 학급 대시보드 자동 실행'));
 $('settingsForm').querySelector('.actions').before(startupLabel);
 const startupStatus=document.createElement('p');startupStatus.role='status';startupLabel.after(startupStatus);
 window.desktop.settings().then(s=>{startup.checked=s.startupEnabled===true;settings.startup=startup.checked;startupStatus.textContent=s.startupWarning||'';startup.disabled=false;}).catch(()=>{startup.disabled=true;startupStatus.textContent='자동 실행 설정을 읽지 못했습니다.';});
 startup.onchange=async()=>{startup.disabled=true;try{const enabled=await window.desktop.startup(startup.checked);settings.startup=enabled;put('settings',settings);const current=await window.desktop.settings();startupStatus.textContent=current.startupWarning||(enabled?'Windows 로그인 후 자동으로 실행됩니다.':'자동 실행이 꺼져 있습니다.');}catch{startup.checked=!startup.checked;startupStatus.textContent='자동 실행 설정을 저장하지 못했습니다. 전체 사용자 등록 또는 접근 권한을 확인해 주세요.';}finally{startup.disabled=false;}};
 const savedPipOptions=read('dashboardPipOptions',{}),pipOptions={};
 const pipSettings=document.createElement('fieldset');pipSettings.className='dashboard-pip-settings';const legend=document.createElement('legend');legend.textContent='우리교실 PIP에 표시할 내용';pipSettings.append(legend);
 for(const [key,label]of [['currentPeriod','현재 교시'],['currentSubject','현재 과목'],['nextPeriod','다음 교시'],['nextSubject','다음 과목'],['time','현재 시각'],['timer','타이머']]){
  pipOptions[key]=savedPipOptions?.[key]!==false;const row=document.createElement('label'),input=document.createElement('input');row.className='check';input.type='checkbox';input.checked=pipOptions[key];input.dataset.pipOption=key;
  input.onchange=()=>{pipOptions[key]=input.checked;put('dashboardPipOptions',pipOptions);publish();};row.append(input,document.createTextNode(label));pipSettings.append(row);
 }
 $('settingsForm').querySelector('.actions').before(pipSettings);
 for(const [kind,selector]of [['dashboard','header nav'],['random','.random-heading'],['whiteboard','.whiteboard-toolbar'],['activity','.activity-heading']]){
  const button=document.createElement('button');button.type='button';button.className='pip-open';button.textContent='PIP로 보기';button.dataset.pip=kind;
  button.onclick=()=>window.desktop.openPip(kind).catch(()=>{button.textContent='PIP 다시 열기'});document.querySelector(selector).append(button);
 }
 const tools=window.classroomTools;
 function snapshot(){
  const now=new Date(),time=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(now),minutes=ExtrasCore.minute(time);
  const lessons=Core.display(overrides[Core.dataKey(settings,day,'timetable')],cache[Core.dataKey(settings,day,'timetable')])||[];
  const rows=tools.schedule().filter(r=>lessons.some(l=>String(l.period)===String(r.period)));
  const current=rows.find(r=>ExtrasCore.minute(r.start)<=minutes&&minutes<ExtrasCore.minute(r.end));
  const next=rows.find(r=>ExtrasCore.minute(r.start)>minutes);
  const label=row=>row?`${row.period}교시 · ${lessons.find(l=>String(l.period)===String(row.period))?.subject||''}`:null;
  const timer=tools.timer();const seconds=Math.ceil(ExtrasCore.timerRemaining(timer,Date.now())/1000);
  const subject=row=>row?lessons.find(l=>String(l.period)===String(row.period))?.subject||'':null;
  return {dashboard:{options:pipOptions,time,current:label(current),next:label(next),currentPeriod:current?String(current.period):null,currentSubject:subject(current),nextPeriod:next?String(next.period):null,nextSubject:subject(next),scheduleSet:rows.length>0,timer:timer.state==='running'||timer.state==='paused'?`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`:null,timerState:timer.state},activity:tools.activity.snapshot(),random:tools.random.snapshot(),whiteboard:tools.whiteboard.snapshot()};
 }
 let previous='';function publish(){const state=snapshot(),json=JSON.stringify(state);if(json!==previous){previous=json;window.desktop.publishPip(state);}}
 window.desktop.onPipCommand(command=>{
  if(command.type==='activity-title'&&command.key===ClassRoster.key()&&typeof command.value==='string')tools.activity.setTitle(command.value);
  else if(command.type==='activity-toggle'&&command.key===ClassRoster.key())tools.activity.toggle(command.id);
  else if(command.type==='random-draw'&&command.key===ClassRoster.key())tools.random.drawOne();
  else if(command.type==='random-repeat'&&command.key===ClassRoster.key())tools.random.setNoRepeat(command.value);
  else if(command.type==='whiteboard-edit')tools.whiteboard.editText(command.change);
  else if(command.type==='expand')tools.screen(['dashboard','whiteboard','random','activity'].indexOf(command.kind));
  else if(command.type==='timer')$('timerButton').click();
  publish();
 });
 setInterval(publish,120);publish();
})();
