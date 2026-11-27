// 알림장 칠판 모드 (작업 지시서 — 알림장 칠판 모드, 디자인 지시서 4-1 H05–H10).
// Shows the notice being written (the editor's current values) on a green board, as large as fits.
// It only displays: drafts, registration and the editor font size are never touched.
// Saved: diaryChalkPreferences = {fontScale: null (auto fit) | number, showDate: boolean}.
(() => {
 const diary=document.getElementById('diaryScreen'),C=window.DiaryChalkCore;
 if(!diary||!C)return;
 const $=id=>document.getElementById(id);
 const make=(tag,props={},parent)=>{const el=document.createElement(tag);Object.assign(el,props);if(parent)parent.append(el);return el;};
 const icon=name=>make('span',{className:'uc-ico uc-ico--'+name});
 let prefs=C.preferences(read('diaryChalkPreferences',null));
 const savePrefs=()=>put('diaryChalkPreferences',prefs);

 // ---------- [칠판 모드] in the sending card: its own group "교실에 띄우기" above "보내기" ----------
 const footer=diary.querySelector('.diary-footer');
 const group=make('section',{className:'diary-chalk-group'});group.setAttribute('aria-labelledby','diaryChalkTitle');
 make('h2',{id:'diaryChalkTitle',className:'diary-chalk-group__title',textContent:'교실에 띄우기'},group);
 const open=make('button',{id:'diaryChalk',type:'button',className:'diary-chalk-button'},group);
 open.append(icon('chalkboard'),document.createTextNode('칠판 모드'));
 const hint=make('p',{id:'diaryChalkHint',className:'diary-chalk-hint'},group);
 footer.prepend(group);
 // The sending card: everything above the register buttons scrolls when the window is very low, so
 // [하이클래스 등록]/[학교종이 등록] always stays on screen.
 const sendMain=make('div',{className:'diary-send-main'});footer.prepend(sendMain);
 sendMain.append(group,...footer.querySelectorAll(':scope>.diary-send-title,:scope>.diary-recipients'));
 const body=()=>$('diaryBody').value,title=()=>$('diaryTitle').value.trim();
 function refreshButton(){
  const empty=!body().trim();open.disabled=empty;
  hint.textContent=empty?'알림장 내용을 먼저 적어 주세요':'쓴 알림장을 초록 칠판에 크게 띄웁니다';hint.classList.toggle('is-warning',empty);
 }
 $('diaryBody').addEventListener('input',refreshButton);$('diaryDate').addEventListener('change',()=>setTimeout(refreshButton));
 // The editor is also filled by code (date change, 대시보드 내용 불러오기, restore): check while it is shown.
 setInterval(()=>{if(!diary.hidden)refreshButton();},600);
 refreshButton();

 // ---------- The board ----------
 const board=make('section',{id:'diaryChalkboard',className:'chalkboard',hidden:true,tabIndex:-1},document.body);
 board.setAttribute('role','dialog');board.setAttribute('aria-modal','true');board.setAttribute('aria-label','칠판 모드');
 const sheet=make('div',{className:'chalkboard__sheet'},board);
 const dateLine=make('p',{className:'chalkboard__date'},sheet),titleLine=make('h2',{className:'chalkboard__title'},sheet),text=make('div',{className:'chalkboard__body'},sheet);
 const bar=make('div',{className:'chalkboard__bar',role:'toolbar'},board);bar.setAttribute('aria-label','칠판 도구');
 const btn=(id,label,aria)=>{const b=make('button',{id,type:'button',className:'chalkboard__button',textContent:label},bar);if(aria)b.setAttribute('aria-label',aria);return b;};
 const sep=()=>make('span',{className:'chalkboard__sep','aria-hidden':'true'},bar);
 const smaller=btn('chalkSmaller','가−','글씨 작게'),bigger=btn('chalkBigger','가+','글씨 크게'),autoFit=btn('chalkFit','맞춤','글씨를 화면에 맞추기');
 sep();const dateToggle=btn('chalkDate','날짜 숨기기');
 const pageSep=sep();const prev=btn('chalkPrev','이전','이전 쪽'),pageLabel=make('span',{id:'chalkPage',className:'chalkboard__page','aria-live':'polite'},bar),next=btn('chalkNext','다음','다음 쪽');
 sep();const full=btn('chalkFull','전체 화면'),close=btn('chalkClose','닫기','칠판 닫기');close.classList.add('chalkboard__button--close');

 let content=null,layout=null,page=0,returnFocus=null,selection=null,ownFullscreen=false,barTimer=0,frame=0;
 const pen=document.createElement('canvas').getContext('2d');
 const longDate=value=>{const d=/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(value+'T00:00:00+09:00'):new Date();return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'long'}).format(d);};
 // Body size range: 28px up to min(12vh, 120px); a manual size is fontScale × that maximum.
 const maxSize=()=>Math.max(28,Math.min(innerHeight*.12,120));
 function measure(){
  const cs=getComputedStyle(sheet),width=sheet.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight),height=sheet.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
  const family=getComputedStyle(text).fontFamily;
  // A small safety margin: the browser's own line breaking can be a little wider than the estimate.
  return {width:width*.97,height:height-2,measureAt:(s,size)=>{pen.font=`700 ${size}px ${family}`;return pen.measureText(s).width;}};
 }
 function compute(){
  const m=measure(),manual=prefs.fontScale===null?null:Math.max(20,Math.min(240,prefs.fontScale*maxSize()));
  layout=C.fit({...m,min:28,max:maxSize(),manual,showDate:prefs.showDate,date:content.date,title:content.title,body:content.body});
  page=Math.min(page,layout.pages.length-1);
 }
 function paint(){
  board.style.setProperty('--chalk-fs',layout.size+'px');
  dateLine.hidden=!prefs.showDate;dateLine.textContent=content.date;
  titleLine.hidden=!content.title;titleLine.textContent=content.title;
  text.textContent=layout.pages[page].join('\n');
  const many=layout.pages.length>1;
  for(const el of [pageSep,prev,pageLabel,next])el.hidden=!many;
  pageLabel.textContent=`${page+1} / ${layout.pages.length}`;prev.disabled=page===0;next.disabled=page===layout.pages.length-1;
  dateToggle.textContent=prefs.showDate?'날짜 숨기기':'날짜 보이기';dateToggle.setAttribute('aria-pressed',String(!prefs.showDate));
  autoFit.setAttribute('aria-pressed',String(prefs.fontScale===null));
  full.textContent=document.fullscreenElement?'전체 화면 끄기':'전체 화면';
 }
 // Lay out, then check the real page: if the browser wrapped more than estimated, shrink (auto) or
 // move to more pages (manual) until nothing is cut off.
 function render(){
  if(board.hidden||!content)return;
  compute();paint();
  for(let i=0;i<24&&sheet.scrollHeight>sheet.clientHeight+1;i++){
   if(prefs.fontScale===null&&layout.size>28){const size=Math.max(28,layout.size-2);layout=C.fit({...measure(),min:28,max:size,showDate:prefs.showDate,date:content.date,title:content.title,body:content.body});}
   else{const m=measure();layout=C.fit({...m,height:m.height-layout.size*C.LINE_HEIGHT*(i+1),min:28,max:maxSize(),manual:layout.size,showDate:prefs.showDate,date:content.date,title:content.title,body:content.body});}
   page=Math.min(page,layout.pages.length-1);paint();
  }
 }
 const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(render);};
 new ResizeObserver(schedule).observe(board);

 // ---------- Tool bar: hides after 3 s without movement; the first tap only brings it back ----------
 function showBar(){board.classList.remove('bar-hidden');clearTimeout(barTimer);barTimer=setTimeout(()=>{if(!board.hidden&&!bar.contains(document.activeElement))board.classList.add('bar-hidden');},3000);}
 // A mouse that moves just before pressing has only brought the bar back: that press does not turn pages either.
 let revealedAt=0;
 board.addEventListener('pointermove',()=>{if(board.classList.contains('bar-hidden'))revealedAt=Date.now();showBar();});
 board.addEventListener('pointerdown',e=>{
  const wasHidden=board.classList.contains('bar-hidden')||Date.now()-revealedAt<600;showBar();
  if(wasHidden||bar.contains(e.target)||layout?.pages.length<2)return;
  // A tap on the board turns pages: left half back, right half forward.
  turn(e.clientX<innerWidth/2?-1:1);
 });
 function turn(step){if(!layout)return;const to=Math.max(0,Math.min(layout.pages.length-1,page+step));if(to!==page){page=to;paint();}}
 board.addEventListener('keydown',e=>{
  showBar();
  if(e.key==='Escape'){e.preventDefault();hide();}
  else if(e.key==='ArrowRight'||e.key==='PageDown'){e.preventDefault();turn(1);}
  else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();turn(-1);}
 });

 // ---------- Buttons ----------
 const setSize=size=>{prefs={...prefs,fontScale:Math.max(C.SCALE_MIN,Math.min(C.SCALE_MAX,size/maxSize()))};savePrefs();page=0;render();};
 smaller.onclick=()=>setSize(Math.max(20,Math.round(layout.size/1.08)));
 bigger.onclick=()=>setSize(Math.min(240,Math.round(layout.size*1.08)));
 autoFit.onclick=()=>{prefs={...prefs,fontScale:null};savePrefs();page=0;render();};
 dateToggle.onclick=()=>{prefs={...prefs,showDate:!prefs.showDate};savePrefs();render();};
 prev.onclick=()=>turn(-1);next.onclick=()=>turn(1);
 full.onclick=async()=>{try{if(document.fullscreenElement){await document.exitFullscreen();ownFullscreen=false;}else{await document.documentElement.requestFullscreen();ownFullscreen=true;}}catch{}paint();};
 document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)ownFullscreen=false;if(!board.hidden)paint();});
 close.onclick=()=>hide();

 // ---------- Open / close ----------
 function show(){
  if(open.disabled||!body().trim())return;
  // What the board shows is fixed when it opens; edit, close and open again to show the change.
  content={date:longDate($('diaryDate').value),title:title(),body:body()};
  returnFocus=document.activeElement;selection=returnFocus&&'selectionStart' in returnFocus?[returnFocus.selectionStart,returnFocus.selectionEnd]:null;
  prefs=C.preferences(read('diaryChalkPreferences',null));page=0;
  board.hidden=false;document.body.classList.add('chalk-open');
  document.fonts.ready.then(()=>{render();showBar();board.focus({preventScroll:true});});
  render();showBar();board.focus({preventScroll:true});
 }
 function hide(){
  if(board.hidden)return;
  board.hidden=true;document.body.classList.remove('chalk-open');clearTimeout(barTimer);
  if(ownFullscreen&&document.fullscreenElement)document.exitFullscreen().catch(()=>{});ownFullscreen=false;
  // Back to the editor exactly as it was, including the cursor.
  if(returnFocus&&document.contains(returnFocus)){returnFocus.focus({preventScroll:true});if(selection)try{returnFocus.setSelectionRange(...selection);}catch{}}
 }
 open.onclick=show;
 // Leaving the diary tab closes the board.
 new MutationObserver(()=>{if(diary.hidden)hide();}).observe(diary,{attributes:true,attributeFilter:['hidden']});
 window.diaryChalkboard={open:show,close:hide,state:()=>({open:!board.hidden,size:layout?.size,pages:layout?.pages.length,page,prefs:{...prefs}})};
})();
