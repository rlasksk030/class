// Editable board titles. Titles live in their own store ('boardTitles'), apart from board content.
(function(root){
 const MAX=30;
 const DEFAULTS={morning:'아침활동',notices:'안내사항'};
 const normalize=value=>typeof value==='string'?Array.from(value.replace(/\s+/g,' ').trim()).slice(0,MAX).join('').trim():'';
 const resolve=(saved,kind)=>normalize(saved?.[kind])||DEFAULTS[kind];
 const api={MAX,DEFAULTS,normalize,resolve};
 if(typeof module!=='undefined'){module.exports=api;return;}
 root.BoardTitlesCore=api;

 let saved=read('boardTitles',{});
 if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={};
 const boards={};let active=null;
 const locked=()=>window.dashboardLocked===true||document.body.classList.contains('dashboard-locked');
 const pencil='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20h4L19 9l-4-4L4 16v4z M13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>';

 function show(kind){const b=boards[kind],title=resolve(saved,kind);b.text.textContent=title;b.h2.title=title;}
 function store(kind,value){
  const title=normalize(value);
  if(!title||title===DEFAULTS[kind])delete saved[kind];else saved[kind]=title;
  put('boardTitles',saved);show(kind);
 }
 function finish(save){
  if(!active)return;
  const {kind,editor,input}=active,b=boards[kind];active=null;
  document.removeEventListener('pointerdown',outside,true);
  if(save)store(kind,input.value);
  editor.remove();b.h2.hidden=false;b.head.classList.remove('title-editing');
 }
 function outside(e){if(active&&!active.editor.contains(e.target))finish(true);}
 function begin(kind){
  if(locked()||active)return;
  const b=boards[kind],h2=b.h2,cs=getComputedStyle(h2),hs=getComputedStyle(b.head);
  // Fill the existing header height exactly, so the board body never shifts while editing.
  const height=Math.max(h2.getBoundingClientRect().height,b.head.clientHeight-parseFloat(hs.paddingTop)-parseFloat(hs.paddingBottom));
  const editor=document.createElement('div');editor.className='board-title-editor';
  for(const p of ['fontSize','fontWeight','letterSpacing'])editor.style[p]=cs[p];
  const input=document.createElement('input');input.type='text';input.maxLength=MAX;input.value=resolve(saved,kind);input.enterKeyHint='done';input.autocomplete='off';input.spellcheck=false;
  input.setAttribute('aria-label',`${DEFAULTS[kind]} 제목 (최대 ${MAX}자)`);
  input.style.height=height+'px';
  const reset=document.createElement('button');reset.type='button';reset.className='board-title-reset';reset.textContent='기본 제목으로';
  editor.append(input,reset);
  if(b.icon)editor.prepend(Object.assign(document.createElement('span'),{className:'board-title-icon',textContent:b.icon}));
  h2.hidden=true;h2.after(editor);b.head.classList.add('title-editing');
  active={kind,editor,input};
  input.addEventListener('keydown',e=>{
   if(e.isComposing||e.keyCode===229)return;
   if(e.key==='Enter'){e.preventDefault();finish(true);}
   else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(false);}
  });
  // Keep editing when the window itself loses focus (e.g. an on-screen keyboard); save when focus moves elsewhere in the app.
  editor.addEventListener('focusout',e=>{if(editor.contains(e.relatedTarget))return;setTimeout(()=>{if(active?.editor===editor&&document.hasFocus()&&!editor.contains(document.activeElement))finish(true);});});
  reset.addEventListener('pointerdown',e=>e.preventDefault());
  reset.addEventListener('click',()=>{if(active?.editor!==editor)return;input.value=DEFAULTS[kind];finish(true);});
  document.addEventListener('pointerdown',outside,true);
  window.desktop?.focusInput?.();
  input.focus({preventScroll:true});input.select();
 }

 for(const kind of Object.keys(DEFAULTS)){
  const head=document.querySelector(`.${kind} .cardhead`),h2=head?.querySelector('h2');
  if(!h2)continue;
  const original=h2.textContent,at=original.lastIndexOf(DEFAULTS[kind]),icon=at>0?original.slice(0,at):'';
  // Size limits keep measuring the original title, so a custom title never widens a column.
  h2.dataset.defaultTitle=original;h2.classList.add('board-title');
  const text=document.createElement('span');text.className='board-title-text';
  h2.replaceChildren(...(icon?[icon]:[]),text);
  const edit=document.createElement('button');edit.type='button';edit.className='board-title-edit';edit.innerHTML=pencil;
  edit.setAttribute('aria-label',`${DEFAULTS[kind]} 제목 바꾸기`);edit.title='제목 바꾸기 · 제목을 두 번 누르거나 길게 눌러도 됩니다';
  h2.after(edit);
  boards[kind]={head,h2,text,icon};show(kind);
  edit.addEventListener('click',()=>begin(kind));
  h2.addEventListener('dblclick',e=>{if(locked())return;e.preventDefault();begin(kind);});
  let press=null,started=false;
  const cancel=()=>{if(press){clearTimeout(press.timer);press=null;}};
  h2.addEventListener('pointerdown',e=>{
   if(e.pointerType==='mouse'||locked()||active)return;
   cancel();press={x:e.clientX,y:e.clientY,id:e.pointerId,timer:setTimeout(()=>{press=null;started=true;begin(kind);},550)};
  });
  h2.addEventListener('pointermove',e=>{if(press&&e.pointerId===press.id&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>10)cancel();});
  for(const type of ['pointerup','pointercancel','pointerleave'])h2.addEventListener(type,cancel);
  // Releasing a long press must not pull focus away from the new title field.
  h2.addEventListener('touchend',e=>{if(!started)return;started=false;e.preventDefault();active?.input.focus({preventScroll:true});});
  h2.addEventListener('contextmenu',e=>{if(!locked())e.preventDefault();});
 }
 // Screen lock ends any open edit; the lock keeps its own confirmation for unlocking.
 new MutationObserver(()=>{if(locked())finish(true);}).observe(document.body,{attributes:true,attributeFilter:['class']});
 fitContents();
})(globalThis);
