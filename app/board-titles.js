// Editable board titles. Titles live in their own store ('boardTitles'), apart from board content.
(function(root){
 const MAX=30;
 const DEFAULTS={timetable:'오늘 시간표',morning:'아침활동',notices:'안내사항',meal:'오늘의 급식'};
 const normalize=value=>typeof value==='string'?Array.from(value.replace(/\s+/g,' ').trim()).slice(0,MAX).join('').trim():'';
 const resolve=(saved,kind)=>normalize(saved?.[kind])||DEFAULTS[kind];
 const api={MAX,DEFAULTS,normalize,resolve};
 if(typeof module!=='undefined'){module.exports=api;return;}
 root.BoardTitlesCore=api;

 let saved=read('boardTitles',{});
 if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={};
 const boards={};let active=null;
 const locked=()=>window.dashboardLocked===true||document.body.classList.contains('dashboard-locked');
 // Titles are changed only while [배치 편집] is on (the pencil sits in the title chip there);
 // on the normal dashboard each board shows just its [수정]/[작성] button.
 const allowed=()=>!locked()&&window.boardLayout?.editing?.()===true;

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
  if(!allowed()||active)return;
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
  if(b.icon)editor.prepend(Object.assign(b.icon.cloneNode(),{className:b.icon.className+' board-title-icon'}));
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
  // A board may start its title with a line icon (an element, kept in front of the text).
  const original=h2.textContent.trim(),icon=h2.querySelector('.uc-ico');
  // Size limits keep measuring the original title, so a custom title never widens a column.
  h2.dataset.defaultTitle=original;h2.classList.add('board-title');
  const text=document.createElement('span');text.className='board-title-text';
  h2.replaceChildren(...(icon?[icon]:[]),text);
  const edit=document.createElement('button');edit.type='button';edit.className='board-title-edit';edit.append(ucIcon('edit'));
  edit.setAttribute('aria-label',`${DEFAULTS[kind]} 제목 바꾸기`);edit.title='제목 바꾸기';
  h2.after(edit);
  boards[kind]={head,h2,text,icon};show(kind);
  edit.addEventListener('click',()=>begin(kind));
 }
 // Screen lock ends any open edit; the lock keeps its own confirmation for unlocking.
 new MutationObserver(()=>{if(locked())finish(true);}).observe(document.body,{attributes:true,attributeFilter:['class']});
 // Leaving [배치 편집] saves a title that is still being typed.
 document.addEventListener('board-layout-change',e=>{if(!e.detail?.editing)finish(true);});
 fitContents();
})(globalThis);
