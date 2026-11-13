const root=document.getElementById('content'),title=document.getElementById('pipTitle');
let kind=null,state=null,signature='',boardNodes=new Map(),pendingText=new Map(),boardCanvas,boardLayer;
let pipScale=1,activityTitleKey=null,pendingActivityTitle=null,composingActivityTitle=false;
function resizeContent(){const base={dashboard:[400,240],random:[440,340],activity:[680,520],whiteboard:[720,500],timer:[400,300]}[kind]||[400,240];pipScale=Math.max(.35,Math.min(2,innerWidth/base[0],innerHeight/base[1]));document.documentElement.style.fontSize=(16*pipScale)+'px';if(kind==='whiteboard'&&boardLayer&&state)renderBoard(state.whiteboard,false);}
window.addEventListener('resize',resizeContent);
const command=value=>window.pip.command(value);
document.getElementById('expand').onclick=()=>command({type:'expand'});
function el(tag,text,parent){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(parent)parent.append(node);return node;}
function button(text,parent,action){const node=el('button',text,parent);node.type='button';node.onclick=action;return node;}
function update(data){if(!data?.state)return;const changed=kind!==data.kind;kind=data.kind;state=data.state;const relevant=state[kind],next=JSON.stringify(relevant);if(!changed&&signature===next)return;signature=next;
 if(changed)resizeContent();
 title.textContent={dashboard:'우리 교실',activity:'활동완료',random:'랜덤 뽑기',whiteboard:'화이트보드',timer:'타이머'}[kind];document.body.dataset.kind=kind;document.getElementById('pipBarInfo').textContent='';
 document.getElementById('expand').textContent=kind==='timer'?'시간 설정':'크게 보기';
 if(kind==='whiteboard'){renderBoard(relevant,changed);return;}
 if(changed){root.replaceChildren();document.getElementById('pipActivityTitle')?.remove();}else if(!['dashboard','activity','timer'].includes(kind))root.replaceChildren();boardLayer=null;boardNodes.clear();
 if(kind==='dashboard'){
  if(!root.querySelector('.current')){el('div','',root).className='current';const foot=el('div','',root);foot.className='pip-foot';el('div','',foot).className='clock';}
  const options=relevant.options||{},visible=key=>options[key]!==false;
  const lesson=(which)=>[visible(which+'Period')&&relevant[which+'Period']?relevant[which+'Period']+'교시':'',visible(which+'Subject')?relevant[which+'Subject']:''].filter(Boolean).join(' · ');
  const clock=root.querySelector('.clock'),current=root.querySelector('.current'),foot=root.querySelector('.pip-foot');
  clock.hidden=!visible('time');clock.textContent=relevant.time;
  current.hidden=!visible('currentPeriod')&&!visible('currentSubject');current.textContent=lesson('current')||(relevant.scheduleSet?'지금은 쉬는 시간':'교시 시간을 설정해 주세요');
  let timer=root.querySelector('.pip-timer');if(relevant.timer&&visible('timer')){if(!timer){timer=button('',foot,()=>command({type:'timer'}));timer.className='pip-timer';}timer.textContent=relevant.timer+(relevant.timerState==='paused'?' · 일시정지':'');timer.setAttribute('aria-label','타이머 '+timer.textContent);}else timer?.remove();
  foot.hidden=clock.hidden&&!root.querySelector('.pip-timer');
 }else if(kind==='timer'){
  let wrap=root.querySelector('.timer-pip');
  if(!wrap){
   wrap=el('section',undefined,root);wrap.className='timer-pip';
   const display=el('div','',wrap);display.id='pipTimerDisplay';display.setAttribute('role','timer');display.setAttribute('aria-label','남은 시간');
   const message=el('div','',wrap);message.id='pipTimerMessage';message.setAttribute('role','status');
   const controls=el('div',undefined,wrap);controls.className='pip-timer-controls';
   for(const [action,label]of [['start','시작'],['pause','일시정지'],['restart','다시 시작'],['reset','초기화']]){
    const b=button(label,controls,()=>command({type:'timer-action',action}));b.dataset.timerAction=action;
   }
   const dismiss=button('확인',controls,()=>command({type:'timer-action',action:'dismiss'}));dismiss.id='pipTimerDismiss';
  }
  const seconds=relevant.seconds;
  wrap.dataset.state=relevant.state;
  wrap.querySelector('#pipTimerDisplay').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  const message=wrap.querySelector('#pipTimerMessage'),label={idle:'시작을 눌러 주세요',running:'진행 중',paused:'일시정지',finished:'시간이 다 되었습니다!'}[relevant.state];
  if(message.textContent!==label)message.textContent=label;
  const start=wrap.querySelector('[data-timer-action="start"]');start.disabled=relevant.state==='running';start.classList.toggle('primary',relevant.state!=='running');wrap.querySelector('[data-timer-action="pause"]').classList.toggle('primary',relevant.state==='running');start.textContent=relevant.state==='paused'?'계속하기':'시작';
  wrap.querySelector('[data-timer-action="pause"]').disabled=relevant.state!=='running';
  wrap.querySelector('[data-timer-action="pause"]').hidden=relevant.state==='finished';
  wrap.querySelector('#pipTimerDismiss').hidden=relevant.state!=='finished';
 }else if(kind==='activity'){
  let wrap=root.querySelector('.pip-activity');
  if(!wrap){wrap=el('div',undefined,root);wrap.className='pip-activity';const input=el('input',undefined,wrap);input.id='pipActivityTitle';input.type='text';input.maxLength=160;input.placeholder='활동명을 입력하세요';input.setAttribute('aria-label','활동명');
   const sendTitle=()=>{pendingActivityTitle=input.value;command({type:'activity-title',key:activityTitleKey,value:input.value});};
   input.onpointerdown=()=>{window.pip.focusInput();input.focus({preventScroll:true});};
   input.oncompositionstart=()=>{composingActivityTitle=true;};input.oncompositionend=()=>{composingActivityTitle=false;sendTitle();};
   input.oninput=()=>{if(!composingActivityTitle)sendTitle();};
   input.onblur=()=>{if(composingActivityTitle){composingActivityTitle=false;sendTitle();}};
   el('div',undefined,wrap).className='pip-activity-body';
   // J04: the activity name sits in the title bar (still editable, as before).
   document.getElementById('pipBarInfo').before(input);
  }
  const input=document.getElementById('pipActivityTitle');
  if(activityTitleKey!==relevant.key){activityTitleKey=relevant.key;pendingActivityTitle=null;composingActivityTitle=false;input.value=relevant.title||'';}
  if(pendingActivityTitle===relevant.title)pendingActivityTitle=null;
  if(!composingActivityTitle&&pendingActivityTitle===null&&input.value!==relevant.title)input.value=relevant.title||'';
  wrap=wrap.querySelector('.pip-activity-body');wrap.replaceChildren();
  const done=new Set(relevant.done),count=relevant.students.filter(s=>done.has(s.id)).length;
  const info=document.getElementById('pipBarInfo');info.replaceChildren();if(relevant.students.length){el('b',String(count),info);info.append(` / ${relevant.students.length}명`);}
  if(relevant.students.length&&count===relevant.students.length)el('div','✓ 모두 완료했어요!',wrap).className='all-done';
  if(!relevant.students.length)el('p','랜덤 뽑기에서 학급 명단을 등록해 주세요.',wrap).className='hint';
  // Pressing a name never moves it: the roster order stays, only its look changes.
  const cards=el('div',undefined,wrap);cards.className='pip-cards';
  for(const student of relevant.students){const finished=done.has(student.id),b=button(student.name,cards,()=>command({type:'activity-toggle',id:student.id,key:relevant.key}));b.dataset.studentId=student.id;b.classList.toggle('is-done',finished);b.setAttribute('aria-pressed',String(finished));}
 }else if(kind==='random'){
  const wrap=el('div',undefined,root);wrap.className='random-pip';el('div',relevant.result||'누가 뽑힐까요?',wrap).className='random-result';
  el('p',`남은 학생 ${relevant.remaining}명`,wrap).className='random-left';
  el('p',relevant.status,wrap).className='hint';
  const row=el('div',undefined,wrap);row.className='random-pip-row';
  const repeat=button(relevant.noRepeat?'✓ 중복 없이':'중복 없이',row,()=>command({type:'random-repeat',key:relevant.key,value:!relevant.noRepeat}));repeat.className='random-repeat';repeat.setAttribute('aria-pressed',String(relevant.noRepeat));repeat.setAttribute('aria-label','한 바퀴 돌 때까지 중복 없이 뽑기 '+(relevant.noRepeat?'켜짐':'꺼짐'));
  const draw=button('한 명 뽑기',row,()=>command({type:'random-draw',key:relevant.key}));draw.className='primary';draw.disabled=relevant.busy||!relevant.remaining;
 }
}
function renderBoard(board,reset){
 if(reset||!boardLayer){root.replaceChildren();boardNodes.clear();pendingText.clear();boardLayer=el('div',undefined,root);boardLayer.className='pip-board';boardCanvas=el('canvas',undefined,boardLayer);
  boardLayer.onpointerdown=e=>{if(e.target!==boardLayer||e.button!==0)return;e.preventDefault();const r=boardLayer.getBoundingClientRect(),b={id:crypto.randomUUID(),x:Math.max(0,Math.min(.85,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(.85,(e.clientY-r.top)/r.height)),width:.4,fontSize:board.fontSize||36,text:''};const input=createBlock(b);layoutBlock(input,b);input.focus();pendingText.set(b.id,'');command({type:'whiteboard-edit',change:b});};
  new ResizeObserver(()=>{if(kind==='whiteboard'&&state)renderBoard(state.whiteboard,false)}).observe(boardLayer);
 }
 const ids=new Set(board.blocks.map(b=>b.id));for(const[id,node]of boardNodes)if(!ids.has(id)&&!pendingText.has(id)){node.remove();boardNodes.delete(id);}
 for(const b of board.blocks){const node=boardNodes.get(b.id)||createBlock(b);if(pendingText.get(b.id)===b.text)pendingText.delete(b.id);if(!pendingText.has(b.id)&&node.value!==b.text)node.value=b.text;layoutBlock(node,b);}
 const r=boardLayer.getBoundingClientRect(),dpr=devicePixelRatio||1;boardCanvas.width=Math.round(r.width*dpr);boardCanvas.height=Math.round(r.height*dpr);const ctx=boardCanvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
 for(const s of board.strokes||[]){ctx.globalCompositeOperation=s.erase?'destination-out':'source-over';ctx.strokeStyle=s.color;ctx.lineWidth=(s.erase?26:3)*pipScale;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();s.points.forEach((p,i)=>{if(i)ctx.lineTo(p.x*r.width,p.y*r.height);else ctx.moveTo(p.x*r.width,p.y*r.height)});ctx.stroke();}ctx.globalCompositeOperation='source-over';
}
function createBlock(b){if(b.type==='image'){const img=el('img',undefined,boardLayer);img.className='pip-block pip-photo';img.alt='화이트보드 사진';img.dataset.blockId=b.id;img.onpointerdown=e=>e.stopPropagation();boardNodes.set(b.id,img);window.pip.photo(b.photo).then(bytes=>{if(!img.isConnected)return;const url=URL.createObjectURL(new Blob([bytes],{type:b.photo.id.endsWith('.png')?'image/png':'image/jpeg'}));img.onload=img.onerror=()=>URL.revokeObjectURL(url);img.src=url;}).catch(()=>img.alt='사진을 읽을 수 없습니다.');return img;}const node=el('textarea',undefined,boardLayer);node.className='pip-block';node.value=b.text;node.dataset.blockId=b.id;node.setAttribute('aria-label','화이트보드 글상자');boardNodes.set(b.id,node);node.onpointerdown=e=>e.stopPropagation();node.oninput=()=>{node.style.height='1px';node.style.height=Math.max(44,node.scrollHeight+2)+'px';pendingText.set(b.id,node.value);command({type:'whiteboard-edit',change:{id:b.id,text:node.value,x:b.x,y:b.y}})};return node;}
function layoutBlock(node,b){const width=boardLayer.clientWidth,height=boardLayer.clientHeight;if(b.type==='image'){const ratio=b.photo.width/b.photo.height,w=Math.min(b.width*width,width,height*ratio),h=w/ratio;node.style.width=w+'px';node.style.height=h+'px';node.style.left=Math.min(b.x*width,width-w)+'px';node.style.top=Math.min(b.y*height,height-h)+'px';return;}node.style.left=(b.x*width)+'px';node.style.top=(b.y*height)+'px';node.style.width=Math.min(width-b.x*width,Math.max(70*pipScale,b.width*width))+'px';node.style.fontSize=(b.fontSize*pipScale)+'px';node.style.height='1px';node.style.height=Math.min(height-b.y*height,Math.max(44*pipScale,node.scrollHeight+2))+'px';}
window.pip.onState(update);window.pip.get().then(update);
