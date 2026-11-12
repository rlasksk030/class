// Dashboard layout editing. The four boards are placed on a 12x6 grid from the saved
// 'boardLayout'; [배치 편집] moves, swaps, resizes, hides and re-shows them. Contents stay as they are.
(() => {
 const L=LayoutCore,main=document.querySelector('main');
 const names={timetable:'시간표',morning:'아침활동',notices:'안내사항',meal:'급식'};
 const cards=Object.fromEntries(L.IDS.map(id=>[id,main.querySelector(':scope>.'+id)]));
 const idOf=card=>L.IDS.find(id=>cards[id]===card);
 const make=(tag,props={},parent)=>{const el=document.createElement(tag);Object.assign(el,props);if(parent)parent.append(el);return el;};
 const HELP='칸 제목 줄을 끌어 옮기고, 오른쪽·아래 손잡이를 끌어 크기를 바꿉니다. 다른 칸 위에 놓으면 자리를 맞바꿉니다. 키보드: Tab 칸 선택 · 방향키 이동 · Shift+방향키 크기 · Esc 취소';

 // A missing value carries the old settings over once; broken JSON counts as broken.
 function stored(){let raw=null;try{raw=localStorage.getItem('boardLayout');}catch{}if(raw===null)return undefined;try{return JSON.parse(raw);}catch{return '';}}
 const initial=L.resolve(stored(),{sizes:read('boardSizes',null),preferences:read('boardPreferences',null)});
 let saved=initial.layout,layout=L.clone(saved),editing=false,drag=null,weatherBefore=null,titleFrame=0;
 if(initial.source!=='saved')put('boardLayout',saved);

 // Bottom-left entry point (the old [크기 조절] spot keeps its .size-controls placement rules).
 const controls=make('div',{className:'size-controls'},document.body);
 const toggle=make('button',{id:'layoutToggle',type:'button',textContent:'배치 편집'},controls);
 toggle.setAttribute('aria-pressed','false');

 const bar=make('div',{id:'layoutToolbar',className:'layout-toolbar',hidden:true},document.body);
 bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','배치 편집');
 make('strong',{className:'layout-heading',textContent:'배치 편집'},bar);
 const tray=make('div',{id:'layoutTray',className:'layout-tray'},bar);tray.setAttribute('aria-label','숨긴 칸');
 const actions=make('div',{className:'layout-actions'},bar);
 const fillButton=make('button',{id:'layoutFill',type:'button',textContent:'빈 칸 채우기'},actions);
 const resetButton=make('button',{id:'layoutReset',type:'button',textContent:'기본 배치로'},actions);
 const cancelButton=make('button',{id:'layoutCancel',type:'button',textContent:'취소'},actions);
 const doneButton=make('button',{id:'layoutDone',type:'button',className:'primary',textContent:'완료'},actions);
 const message=make('p',{id:'layoutMessage',className:'layout-message'},bar);message.setAttribute('role','status');
 const say=text=>{message.textContent=text||HELP;};
 // Keep the weather card (and its size handles) uncovered when there is room beside it.
 function positionBar(){
  const weather=document.querySelector('header>.weather'),box=weather?.getBoundingClientRect();
  const room=box&&box.width?box.left-16-12:0;
  bar.style.maxWidth=room>=460?room+'px':'';
 }

 // Grid lines, empty-slot marks and the drop preview are grid items, so they line up with
 // the real tracks; they are only displayed while editing.
 for(let y=1;y<=L.ROWS;y++)for(let x=1;x<=L.COLUMNS;x++){
  const cell=make('div',{className:'layout-cell'},main);cell.style.gridArea=`${y} / ${x}`;cell.setAttribute('aria-hidden','true');
 }
 const preview=make('div',{className:'layout-preview',hidden:true},main);preview.setAttribute('aria-hidden','true');
 const area=r=>`${r.y} / ${r.x} / span ${r.h} / span ${r.w}`;
 function showPreview(r,state){preview.hidden=false;preview.style.gridArea=area(r);preview.dataset.state=state;preview.textContent=state==='bad'?'놓을 수 없음':state==='swap'?'자리 맞바꾸기':'';}
 const hidePreview=()=>{preview.hidden=true;};

 for(const id of L.IDS){
  const card=cards[id];
  const hide=make('button',{type:'button',className:'layout-hide',textContent:'숨기기'},card);
  hide.dataset.layoutHide=id;hide.setAttribute('aria-label',names[id]+' 숨기기');
  for(const dir of ['e','s','se']){
   const handle=make('button',{type:'button',className:'layout-resize layout-resize-'+dir,tabIndex:-1},card);
   handle.dataset.layoutResize=dir;handle.setAttribute('aria-label',names[id]+' 크기 조절');handle.title='끌어서 크기 조절 · Shift+방향키로도 됩니다';
  }
 }

 // Each board needs at least its title width. The grid's flexible tracks grow to give it that
 // width; when titles side by side cannot all fit, the width is shared and long titles shrink.
 const pen=document.createElement('canvas').getContext('2d');
 function textWidth(h2){
  const cs=getComputedStyle(h2);pen.font=`${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  pen.letterSpacing=cs.letterSpacing==='normal'?'0px':cs.letterSpacing;
  return pen.measureText(h2.dataset.defaultTitle??h2.textContent).width;
 }
 function minimumWidth(card){
  const head=card.querySelector('.cardhead'),hs=getComputedStyle(head),cs=getComputedStyle(card);
  const parts=[...head.children].filter(el=>!el.hidden&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).position!=='absolute');
  let need=parseFloat(hs.paddingLeft)+parseFloat(hs.paddingRight)+parseFloat(cs.borderLeftWidth)+parseFloat(cs.borderRightWidth)+Math.max(0,parts.length-1)*(parseFloat(hs.columnGap)||0);
  for(const el of parts)need+=el.matches('h2')?textWidth(el):el.getBoundingClientRect().width;
  return Math.ceil(need)+4;
 }
 function fitTitles(){
  const shown=L.IDS.filter(id=>layout.items[id].visible).map(id=>cards[id]);
  main.classList.remove('layout-tight');
  for(const card of shown){
   const h2=card.querySelector('.cardhead h2');if(h2)h2.style.removeProperty('font-size');
   // While a title is being typed the header holds an input; keep the last measurement.
   if(!card.querySelector('.cardhead.title-editing')||!card.dataset.minWidth)card.dataset.minWidth=minimumWidth(card);
   card.style.minWidth=card.dataset.minWidth+'px';
  }
  if(main.scrollWidth<=main.clientWidth+1)return;
  main.classList.add('layout-tight');
  for(const card of shown){
   card.style.minWidth='';
   const h2=card.querySelector('.cardhead h2');if(!h2)continue;
   let size=parseFloat(getComputedStyle(h2).fontSize);
   while(size>14&&h2.scrollWidth>h2.clientWidth+1){size-=1;h2.style.fontSize=size+'px';}
  }
 }
 const scheduleTitles=()=>{cancelAnimationFrame(titleFrame);titleFrame=requestAnimationFrame(fitTitles);};

 function place(){
  for(const id of L.IDS){
   const r=layout.items[id],card=cards[id];
   card.style.gridArea=area(r);
   card.classList.toggle('layout-hidden',!r.visible);
   if(r.visible)card.removeAttribute('aria-hidden');else card.setAttribute('aria-hidden','true');
  }
 }
 function drawEmpty(){
  main.querySelectorAll(':scope>.layout-empty').forEach(el=>el.remove());
  if(!editing)return;
  for(const r of L.emptyRegions(layout)){const el=make('div',{className:'layout-empty',textContent:'빈 칸'},main);el.style.gridArea=area(r);el.setAttribute('aria-hidden','true');}
 }
 function drawTray(){
  tray.replaceChildren();
  make('span',{className:'layout-tray-label',textContent:'숨긴 칸'},tray);
  const hidden=L.IDS.filter(id=>!layout.items[id].visible);
  if(!hidden.length){make('span',{className:'layout-tray-empty',textContent:'없음'},tray);return;}
  for(const id of hidden){
   const chip=make('div',{className:'layout-chip',title:'빈 칸으로 끌어다 놓거나 [다시 표시]를 누르세요'},tray);chip.dataset.board=id;
   make('span',{textContent:names[id]},chip);
   const back=make('button',{type:'button',textContent:'다시 표시'},chip);back.dataset.layoutShow=id;back.setAttribute('aria-label',names[id]+' 다시 표시');
  }
 }
 function render(){
  place();fitTitles();drawEmpty();if(editing)drawTray();
  fitContents();
  document.dispatchEvent(new CustomEvent('board-layout-change',{detail:{editing}}));
 }
 // Apply an operation result; refused operations leave the layout as it was.
 function use(result,done,refused){
  if(!result.ok){say(refused);return false;}
  layout=result.layout;render();say(done);return true;
 }

 function begin(){
  if(editing||window.dashboardLocked===true)return;
  editing=true;layout=L.clone(saved);weatherBefore=window.weatherSize?.get()||null;
  document.body.classList.add('layout-editing');bar.hidden=false;toggle.hidden=true;toggle.setAttribute('aria-pressed','true');
  for(const id of L.IDS){cards[id].tabIndex=0;cards[id].setAttribute('aria-roledescription','옮길 수 있는 칸');cards[id].setAttribute('aria-label',names[id]+' 칸');}
  window.weatherSize?.enable(true);
  say();render();positionBar();
 }
 function end(commit){
  if(!editing)return;
  cancelDrag();
  if(commit){saved=L.clone(layout);put('boardLayout',saved);}
  else{layout=L.clone(saved);if(weatherBefore)window.weatherSize?.set(weatherBefore);}
  editing=false;
  document.body.classList.remove('layout-editing');bar.hidden=true;toggle.hidden=false;toggle.setAttribute('aria-pressed','false');
  for(const id of L.IDS){cards[id].removeAttribute('tabindex');cards[id].removeAttribute('aria-roledescription');cards[id].removeAttribute('aria-label');}
  window.weatherSize?.enable(false);
  render();
  if(bar.contains(document.activeElement)||main.contains(document.activeElement))toggle.focus({preventScroll:true});
 }

 toggle.onclick=begin;
 doneButton.onclick=()=>end(true);
 cancelButton.onclick=()=>end(false);
 fillButton.onclick=()=>{const r=L.fill(layout);if(!r.changed){say('이웃 칸이 늘어나 채울 수 있는 빈 칸이 없습니다.');return;}use(r,'빈 칸을 이웃 칸으로 채웠습니다. [완료]를 눌러야 저장됩니다.');};
 resetButton.onclick=()=>{layout=L.defaults();window.weatherSize?.reset();render();say('기본 배치로 되돌렸습니다. [완료]를 눌러야 저장됩니다.');};
 main.addEventListener('click',e=>{
  const hide=e.target.closest('.layout-hide');
  if(editing&&hide){use(L.hide(layout,hide.dataset.layoutHide),`${names[hide.dataset.layoutHide]} 칸을 숨겼습니다. 위 '숨긴 칸'에서 다시 꺼낼 수 있습니다.`);return;}
  // Board buttons ([수정], [작성], title pencil) must not fire while boards are being arranged.
  if(editing&&e.target.closest('main>.card')){e.preventDefault();e.stopImmediatePropagation();}
 },true);
 main.addEventListener('dblclick',e=>{if(editing&&e.target.closest('main>.card')){e.preventDefault();e.stopImmediatePropagation();}},true);
 tray.addEventListener('click',e=>{
  const back=e.target.closest('[data-layout-show]');if(!back||!editing)return;
  const id=back.dataset.layoutShow;
  use(L.show(layout,id),`${names[id]} 칸을 다시 표시했습니다.`,`빈 자리가 없어 ${names[id]} 칸을 다시 표시하지 못했습니다. 다른 칸을 줄여 2×2 이상 비운 뒤 다시 시도하세요.`);
 });

 // ---------- Pointer dragging (mouse, pen and touch) ----------
 function tracks(){
  const cs=getComputedStyle(main),box=main.getBoundingClientRect();
  const edges=(list,gap,start)=>{let pos=start;return list.split(' ').map(parseFloat).map(size=>{const edge=[pos,pos+size];pos+=size+gap;return edge;});};
  return {cols:edges(cs.gridTemplateColumns,parseFloat(cs.columnGap)||0,box.left),rows:edges(cs.gridTemplateRows,parseFloat(cs.rowGap)||0,box.top)};
 }
 const index=(edges,p)=>{for(let i=0;i<edges.length-1;i++)if(p<(edges[i][1]+edges[i+1][0])/2)return i+1;return edges.length;};
 const cellAt=(x,y)=>{const t=tracks();return {x:index(t.cols,x),y:index(t.rows,y)};};
 const overGrid=(x,y)=>{const b=main.getBoundingClientRect();return x>=b.left&&x<=b.right&&y>=b.top&&y<=b.bottom;};
 let ghost=null;

 function startDrag(e,next){
  e.preventDefault();
  drag={...next,pointerId:e.pointerId,element:e.target,result:null,start:L.clone(layout)};
  try{drag.element.setPointerCapture(e.pointerId);}catch{}
  document.body.classList.add('layout-dragging-active');
 }
 main.addEventListener('pointerdown',e=>{
  if(!editing||drag||(e.pointerType==='mouse'&&e.button!==0)||e.target.closest('.layout-hide'))return;
  const card=e.target.closest('main>.card');if(!card)return;
  const id=idOf(card),handle=e.target.closest('.layout-resize');
  if(!handle&&!e.target.closest('.cardhead'))return;
  card.focus({preventScroll:true});
  const c=cellAt(e.clientX,e.clientY),r=layout.items[id];
  startDrag(e,{kind:handle?'resize':'move',dir:handle?.dataset.layoutResize,id,grab:{x:c.x-r.x,y:c.y-r.y}});
  card.classList.add('layout-dragging');
 });
 tray.addEventListener('pointerdown',e=>{
  const chip=e.target.closest('.layout-chip');
  if(!editing||drag||!chip||e.target.closest('button')||(e.pointerType==='mouse'&&e.button!==0))return;
  startDrag(e,{kind:'place',id:chip.dataset.board});
  ghost=make('div',{className:'layout-ghost',textContent:names[chip.dataset.board]},document.body);
  ghost.style.left=e.clientX+'px';ghost.style.top=e.clientY+'px';
 });
 document.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.pointerId)return;
  const c=cellAt(e.clientX,e.clientY);
  if(drag.kind==='move'){
   const r=layout.items[drag.id];
   const x=Math.min(Math.max(c.x-drag.grab.x,1),L.COLUMNS-r.w+1),y=Math.min(Math.max(c.y-drag.grab.y,1),L.ROWS-r.h+1);
   drag.result=L.drop(layout,drag.id,x,y,c);
   const res=drag.result;
   showPreview(res.ok?res.layout.items[drag.id]:res.target||{x,y,w:r.w,h:r.h},res.ok?(res.swap?'swap':'ok'):'bad');
  }else if(drag.kind==='resize'){
   const r=drag.start.items[drag.id];
   const w=drag.dir==='s'?r.w:Math.min(c.x-r.x+1,L.COLUMNS-r.x+1),h=drag.dir==='e'?r.h:Math.min(c.y-r.y+1,L.ROWS-r.y+1);
   const res=L.resize(drag.start,drag.id,Math.max(w,1),Math.max(h,1));
   if(res.ok){hidePreview();if(!L.equal(res.layout,layout)){layout=res.layout;render();}}
   else showPreview(res.target,'bad');
  }else if(drag.kind==='place'){
   ghost.style.left=e.clientX+'px';ghost.style.top=e.clientY+'px';
   if(overGrid(e.clientX,e.clientY)){
    drag.result=L.placeAt(layout,drag.id,c.x,c.y);
    showPreview(drag.result.ok?drag.result.target:{x:Math.min(c.x,L.COLUMNS-1),y:Math.min(c.y,L.ROWS-1),w:2,h:2},drag.result.ok?'ok':'bad');
   }else{drag.result=null;hidePreview();}
  }
 });
 function release(){
  const d=drag;drag=null;
  try{if(d.element.hasPointerCapture(d.pointerId))d.element.releasePointerCapture(d.pointerId);}catch{}
  document.body.classList.remove('layout-dragging-active');
  Object.values(cards).forEach(card=>card.classList.remove('layout-dragging'));
  ghost?.remove();ghost=null;hidePreview();
  return d;
 }
 function finishDrag(e){
  if(!drag||e.pointerId!==drag.pointerId)return;
  const d=release(),res=d.result,name=names[d.id];
  if(d.kind==='move'&&res){
   if(res.ok&&!L.equal(res.layout,layout))use(res,res.swap?`${name} 칸과 ${names[res.swap]} 칸의 자리를 맞바꿨습니다.`:`${name} 칸을 옮겼습니다.`);
   else if(!res.ok)say('그 자리에는 놓을 수 없습니다. 칸 두 개 이상에 걸치면 옮길 수 없습니다.');
  }else if(d.kind==='place'&&res)use(res,`${name} 칸을 다시 표시했습니다.`,'그 자리는 비어 있는 공간이 2×2보다 작아 놓을 수 없습니다.');
  else if(d.kind==='resize')render();
 }
 function cancelDrag(){
  if(!drag)return;
  const d=release();
  if(d.kind==='resize'){layout=d.start;render();}
 }
 document.addEventListener('pointerup',finishDrag);
 document.addEventListener('pointercancel',e=>{if(drag&&e.pointerId===drag.pointerId)cancelDrag();});
 window.addEventListener('blur',cancelDrag);

 // ---------- Keyboard ----------
 const arrows={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
 document.addEventListener('keydown',e=>{
  if(!editing||document.querySelector('dialog[open]'))return;
  if(e.key==='Escape'){e.preventDefault();if(drag)cancelDrag();else end(false);return;}
  const step=arrows[e.key],id=idOf(e.target);
  if(!step||!id)return;
  e.preventDefault();
  const r=layout.items[id];
  if(e.shiftKey)use(L.resize(layout,id,r.w+step[0],r.h+step[1]),`${names[id]} 칸 크기: ${r.w+step[0]}칸 × ${r.h+step[1]}줄`,'더 늘이거나 줄일 수 없습니다. (최소 2×2, 다른 칸과 겹칠 수 없음)');
  else{const res=L.nudge(layout,id,step[0],step[1]);use(res,res.swap?`${names[id]} 칸과 ${names[res.swap]} 칸의 자리를 맞바꿨습니다.`:`${names[id]} 칸을 옮겼습니다.`,'그쪽으로는 더 옮길 수 없습니다.');}
  cards[id].focus({preventScroll:true});
 });

 // Boards are re-measured whenever their own size changes (track changes do not resize <main>).
 const observer=new ResizeObserver(fitContents);
 Object.values(cards).forEach(card=>observer.observe(card));
 window.addEventListener('resize',()=>{scheduleTitles();if(editing)positionBar();});
 // Title text, the title editor and lock state change header widths; watch only the headers so
 // this code's own class and style changes never trigger it again.
 const titleWatcher=new MutationObserver(scheduleTitles);
 Object.values(cards).forEach(card=>titleWatcher.observe(card.querySelector('.cardhead'),{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','hidden']}));
 titleWatcher.observe(document.body,{attributes:true,attributeFilter:['class']}); // e.g. screen lock hides the title pencil
 document.fonts?.ready.then(scheduleTitles);

 window.boardLayout={
  editing:()=>editing,
  get:()=>L.clone(layout),
  isVisible:id=>layout.items[id]?.visible===true,
  // The "○○ 표시" checks in 화면 설정 use the same saved layout as [배치 편집].
  setVisible(id,visible){
   if(!layout.items[id])return {ok:false,message:''};
   const r=visible?L.show(layout,id):L.hide(layout,id);
   if(!r.ok)return {ok:false,message:`빈 자리가 없어 ${names[id]} 칸을 표시하지 못했습니다. [배치 편집]에서 다른 칸을 줄인 뒤 다시 표시하세요.`};
   layout=r.layout;if(!editing){saved=L.clone(layout);put('boardLayout',saved);}
   render();return {ok:true};
  },
  begin,finish:()=>end(true),cancel:()=>end(false)
 };
 render();
})();
