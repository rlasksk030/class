// Retain the whiteboard tab and storage key; migrate the old note into one positioned block.
window.createClassWhiteboard=function({read,put}){
 const el=document.createElement('section');el.id='whiteboardScreen';el.hidden=true;el.setAttribute('role','tabpanel');el.setAttribute('aria-labelledby','whiteboardTab');
 el.innerHTML=`<div class="whiteboard-toolbar"><strong>화이트보드</strong><button id="whiteboardPen">펜</button><button id="whiteboardEraser">지우개</button><input type="color" id="whiteboardColor" value="#262b33" aria-label="펜 색상"><button id="whiteboardTyping">글자 입력 / 선택</button><button id="whiteboardPhotoAdd">사진 추가</button><input id="whiteboardPhotoFiles" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" multiple hidden><button id="whiteboardFontMinus" aria-label="화이트보드 글자 작게">A−</button><output id="whiteboardFontSize"></output><button id="whiteboardFontPlus" aria-label="화이트보드 글자 크게">A+</button><button id="whiteboardUndo" aria-label="실행 취소 (Ctrl+Z)">↶ 실행 취소</button><button id="whiteboardRedo" aria-label="다시 실행 (Ctrl+Y)">↷ 다시 실행</button><button id="whiteboardClear">전체 지우기</button></div><div id="whiteboardPhotoStatus" role="status"></div><div class="whiteboard-surface"><canvas id="whiteboardCanvas" aria-label="판서 화면"></canvas><div id="whiteboardTextLayer" aria-label="클릭한 위치에서 글쓰기"></div></div>`;
 document.body.append(el);const $=id=>el.querySelector('#'+id),canvas=$('whiteboardCanvas'),layer=$('whiteboardTextLayer'),ctx=canvas.getContext('2d');
 let board=read('whiteboardContents',{strokes:[],text:''});if(!board||typeof board!=='object')board={};if(!Array.isArray(board.strokes))board.strokes=[];
 const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));board.fontSize=Number.isFinite(board.fontSize)?clamp(board.fontSize,18,96):36;
 if(!Array.isArray(board.blocks))board.blocks=typeof board.text==='string'&&board.text?[{id:crypto.randomUUID(),x:.025,y:.04,width:.7,text:board.text,fontSize:board.fontSize}]:[];
 board.blocks=board.blocks.filter(b=>b&&typeof b.id==='string').map(b=>({...b,x:clamp(Number(b.x)||0,0,.95),y:clamp(Number(b.y)||0,0,.95),width:clamp(Number(b.width)||.35,b.type==='image'?.001:.1,1),text:typeof b.text==='string'?b.text:'',fontSize:clamp(Number(b.fontSize)||36,18,96)}));
 let mode='text',selected=null,ink=null,drag=null,unsaved=false;const nodes=new Map();
 const save=()=>{const ok=put('whiteboardContents',board);unsaved=!ok;if(!ok)$('whiteboardPhotoStatus').textContent='저장하지 못했습니다. 화면의 사진과 글씨는 유지됩니다. 저장 공간을 확인해 주세요.';return ok;};
 // Undo/redo keeps whole-board snapshots. Finished strokes are never mutated, so snapshots share them.
 const HISTORY_LIMIT=50,TEXT_PAUSE=1000,undoStack=[],redoStack=[];let textTimer=null;
 const capture=()=>({fontSize:board.fontSize,strokes:board.strokes.slice(),blocks:board.blocks.map(b=>({...b}))});
 const signature=s=>JSON.stringify([s.fontSize,s.strokes.length,s.strokes.at(-1)?.points.length,s.blocks]);
 let committed=capture(),committedSig=signature(committed);
 function historyUI(){$('whiteboardUndo').disabled=!undoStack.length&&!textTimer;$('whiteboardRedo').disabled=!redoStack.length;}
 function commit(){
  clearTimeout(textTimer);textTimer=null;
  const next=capture(),sig=signature(next);
  if(sig!==committedSig){undoStack.push(committed);if(undoStack.length>HISTORY_LIMIT)undoStack.shift();redoStack.length=0;committed=next;committedSig=sig;}
  historyUI();
 }
 // Typing is grouped: one undo step per pause in typing (or when the box loses focus).
 function commitTextLater(){clearTimeout(textTimer);textTimer=setTimeout(commit,TEXT_PAUSE);historyUI();}
 function restore(state){
  board.fontSize=state.fontSize;board.strokes=state.strokes.slice();board.blocks=state.blocks.map(b=>({...b}));
  const keep=board.blocks.some(b=>b.id===selected)?selected:null;
  layer.replaceChildren();nodes.clear();board.blocks.forEach(renderBlock);select(keep);save();redraw();
 }
 function undo(){if(ink||drag)return;commit();if(!undoStack.length)return;redoStack.push(committed);committed=undoStack.pop();committedSig=signature(committed);restore(committed);historyUI();}
 function redo(){if(ink||drag)return;commit();if(!redoStack.length)return;undoStack.push(committed);committed=redoStack.pop();committedSig=signature(committed);restore(committed);historyUI();}
 function fontUI(){const n=board.blocks.find(b=>b.id===selected)?.fontSize||board.fontSize;$('whiteboardFontSize').textContent=n+'px';$('whiteboardFontMinus').disabled=n<=18;$('whiteboardFontPlus').disabled=n>=96;}
 function select(id){selected=id;for(const [key,node]of nodes)node.classList.toggle('selected',key===id);fontUI();}
 function layoutBlock(b){const node=nodes.get(b.id);if(!node||!layer.clientWidth||!layer.clientHeight)return;const w=layer.clientWidth,h=layer.clientHeight;if(b.type==='image'){const ratio=b.photo.width/b.photo.height;const width=Math.max(1,Math.min(b.width*w,w,h*ratio));const height=width/ratio;node.style.width=width+'px';node.style.height=height+'px';node.style.left=clamp(b.x*w,0,w-width)+'px';node.style.top=clamp(b.y*h,0,h-height)+'px';return;}const x=clamp(b.x*w,0,Math.max(0,w-100)),y=clamp(b.y*h,0,Math.max(0,h-70));node.style.left=x+'px';node.style.top=y+'px';node.style.width=clamp(b.width*w,100,w-x)+'px';const t=node.querySelector('textarea');t.style.fontSize=b.fontSize+'px';t.style.height='1px';t.style.height=Math.min(Math.max(b.fontSize*1.5,t.scrollHeight+2),h-y)+'px';}
 function renderBlock(b){if(b.type==='image')return renderImage(b);const node=document.createElement('div');node.className='whiteboard-block';node.dataset.blockId=b.id;node.innerHTML='<div class="textblock-tools"><button class="textblock-move" aria-label="텍스트 이동">↔ 이동</button><button class="textblock-delete" aria-label="텍스트 삭제">삭제</button></div><textarea aria-label="화이트보드 글상자" spellcheck="false"></textarea><button class="textblock-width" aria-label="텍스트 폭 조절">↔</button>';layer.append(node);nodes.set(b.id,node);const input=node.querySelector('textarea');input.value=b.text;
  input.onpointerdown=e=>{e.stopPropagation();select(b.id);};input.onfocus=()=>select(b.id);input.oninput=()=>{b.text=input.value;layoutBlock(b);save();commitTextLater();};input.addEventListener('blur',()=>{if(textTimer)commit();});
  node.querySelector('.textblock-delete').onclick=e=>{e.stopPropagation();board.blocks=board.blocks.filter(x=>x.id!==b.id);node.remove();nodes.delete(b.id);select(null);save();commit();};
  for(const [selector,kind]of [['.textblock-move','move'],['.textblock-width','width']]){const handle=node.querySelector(selector);handle.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();select(b.id);handle.setPointerCapture(e.pointerId);drag={id:b.id,pointer:e.pointerId,kind,startX:e.clientX,startY:e.clientY,x:b.x,y:b.y,width:b.width};};handle.onpointermove=e=>{if(!drag||drag.id!==b.id||drag.pointer!==e.pointerId)return;const w=layer.clientWidth,h=layer.clientHeight;if(kind==='move'){b.x=clamp(drag.x+(e.clientX-drag.startX)/w,0,Math.max(0,1-node.offsetWidth/w));b.y=clamp(drag.y+(e.clientY-drag.startY)/h,0,Math.max(0,1-node.offsetHeight/h));}else b.width=clamp(drag.width+(e.clientX-drag.startX)/w,100/w,1-b.x);layoutBlock(b);};handle.onpointerup=handle.onpointercancel=handle.onlostpointercapture=()=>{if(drag){drag=null;save();commit();}};}
  node.addEventListener('pointerdown',e=>e.stopPropagation());layoutBlock(b);return input;
 }

 function renderImage(b){
  const node=document.createElement('div');node.className='whiteboard-block whiteboard-image';node.dataset.blockId=b.id;node.tabIndex=0;
  node.innerHTML='<div class="textblock-tools"><button class="textblock-move" aria-label="사진 이동">↔ 이동</button><button class="textblock-delete" aria-label="사진 삭제">삭제</button></div><img draggable="false" alt="화이트보드 사진"><button class="textblock-width" aria-label="사진 비율 유지 크기 조절">↘</button>';
  layer.append(node);nodes.set(b.id,node);ClassPhotos.preview(node.querySelector('img'),b.photo);node.onfocus=()=>select(b.id);
  function remove(){board.blocks=board.blocks.filter(x=>x.id!==b.id);node.remove();nodes.delete(b.id);select(null);save();commit();}
  node.querySelector('.textblock-delete').onclick=e=>{e.stopPropagation();remove();};node.onkeydown=e=>{if(e.target===node&&['Delete','Backspace'].includes(e.key)){e.preventDefault();remove();}};
  for(const [handle,kind] of [[node.querySelector('img'),'move'],[node.querySelector('.textblock-move'),'move'],[node.querySelector('.textblock-width'),'width']]){
   handle.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();select(b.id);node.focus({preventScroll:true});handle.setPointerCapture(e.pointerId);drag={id:b.id,pointer:e.pointerId,kind,startX:e.clientX,startY:e.clientY,x:parseFloat(node.style.left)/layer.clientWidth,y:parseFloat(node.style.top)/layer.clientHeight,width:node.offsetWidth/layer.clientWidth};};
   handle.onpointermove=e=>{if(!drag||drag.id!==b.id||drag.pointer!==e.pointerId)return;const w=layer.clientWidth,h=layer.clientHeight,ratio=b.photo.width/b.photo.height;if(kind==='move'){b.x=clamp(drag.x+(e.clientX-drag.startX)/w,0,Math.max(0,1-node.offsetWidth/w));b.y=clamp(drag.y+(e.clientY-drag.startY)/h,0,Math.max(0,1-node.offsetHeight/h));}else{b.x=drag.x;b.y=drag.y;const max=Math.min(1-b.x,(1-b.y)*h*ratio/w);b.width=clamp(drag.width+(e.clientX-drag.startX)/w,Math.min(40/w,max),max);}layoutBlock(b);};
   handle.onpointerup=handle.onpointercancel=handle.onlostpointercapture=()=>{if(drag){drag=null;save();commit();}};
  }
  node.addEventListener('pointerdown',e=>{e.stopPropagation();select(b.id);});layoutBlock(b);return node;
 }
 $('whiteboardPhotoStatus').textContent=ClassPhotos.help+' · 보드당 50장 · 글자 입력 / 선택 모드에서 이동·크기 조절';
 let imageQueue=Promise.resolve(),pendingImages=0;
 function addImages(files){
  if(!files.length)return;if(board.blocks.filter(b=>b.type==='image').length+pendingImages+files.length>50){$('whiteboardPhotoStatus').textContent='보드 사진은 최대 50장입니다. 이번 선택은 추가하지 않았습니다.';return;}
  // Capture board size at paste time, even if a tab is hidden before decoding finishes.
  const w=layer.clientWidth||900,h=layer.clientHeight||500;pendingImages+=files.length;
  imageQueue=imageQueue.then(async()=>{let errors=[];for(const f of files){try{const photo=await ClassPhotos.add(f);const width=Math.min(photo.width,w*.65,h*.65*photo.width/photo.height)/w;const b={id:crypto.randomUUID(),type:'image',photo,x:.04,y:.04,width,text:'',fontSize:board.fontSize};board.blocks.push(b);renderBlock(b);select(b.id);if(!save())errors.push('사진 배치 저장 실패: 화면은 유지됩니다.');commit();}catch(e){errors.push(ClassPhotos.message(e));}finally{pendingImages--;}}
   $('whiteboardPhotoStatus').textContent=errors.length?errors.join(' / '):'사진 저장됨 · 글자 입력 / 선택에서 사진을 드래그하거나 오른쪽 아래 손잡이로 크기를 조절하세요.';
  });
 }
 $('whiteboardPhotoAdd').onclick=()=>$('whiteboardPhotoFiles').click();$('whiteboardPhotoFiles').onchange=e=>{addImages([...e.target.files]);e.target.value='';};
 document.addEventListener('paste',e=>{if(el.hidden||e.defaultPrevented||document.querySelector('dialog[open]'))return;const target=document.activeElement;if(target&&target!==document.body&&!el.contains(target)&&target.id!=='whiteboardTab')return;const files=ClassPhotos.files(e);if(!files.length)return;e.preventDefault();addImages(files);});

 board.blocks.forEach(renderBlock);
 layer.onpointerdown=e=>{if(mode!=='text'||e.target!==layer||e.button!==0)return;e.preventDefault();const r=layer.getBoundingClientRect(),x=clamp((e.clientX-r.left)/r.width,0,1-110/r.width),y=clamp((e.clientY-r.top)/r.height,0,1-75/r.height);const b={id:crypto.randomUUID(),x,y,width:Math.min(.4,1-x),text:'',fontSize:board.fontSize};board.blocks.push(b);commit();const input=renderBlock(b);select(b.id);input.focus();save();commit();};
 function redraw(){if(el.hidden)return;const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;const dpr=devicePixelRatio||1;canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);for(const s of board.strokes){ctx.globalCompositeOperation=s.erase?'destination-out':'source-over';ctx.strokeStyle=s.color;ctx.lineWidth=s.erase?26:3;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();s.points.forEach((p,i)=>{if(i)ctx.lineTo(p.x*r.width,p.y*r.height);else ctx.moveTo(p.x*r.width,p.y*r.height);});if(s.points.length===1){const p=s.points[0];ctx.lineTo(p.x*r.width+.1,p.y*r.height+.1);}ctx.stroke();}ctx.globalCompositeOperation='source-over';board.blocks.forEach(layoutBlock);}
 function point(e){if(!ink)return;const r=canvas.getBoundingClientRect();ink.points.push({x:clamp((e.clientX-r.x)/r.width,0,1),y:clamp((e.clientY-r.y)/r.height,0,1)});redraw();}
 canvas.onpointerdown=e=>{if(mode==='text'||e.button!==0)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);ink={erase:mode==='erase',color:$('whiteboardColor').value,points:[]};board.strokes.push(ink);point(e);};canvas.onpointermove=point;const finish=()=>{if(ink||drag){ink=null;drag=null;save();commit();}};canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=finish;
 function tool(next){finish();mode=next;layer.classList.toggle('ink-mode',mode!=='text');canvas.style.pointerEvents=mode==='text'?'none':'auto';for(const [id,m]of [['whiteboardPen','pen'],['whiteboardEraser','erase'],['whiteboardTyping','text']])$(id).setAttribute('aria-pressed',String(m===mode));if(mode!=='text')select(null);}
 $('whiteboardPen').onclick=()=>tool('pen');$('whiteboardEraser').onclick=()=>tool('erase');$('whiteboardTyping').onclick=()=>tool('text');
 function changeFont(delta){const b=board.blocks.find(b=>b.id===selected);const size=clamp((b?.fontSize||board.fontSize)+delta,18,96);board.fontSize=size;if(b&&b.type!=='image'){b.fontSize=size;layoutBlock(b);}fontUI();save();commit();}
 $('whiteboardFontMinus').onclick=()=>changeFont(-4);$('whiteboardFontPlus').onclick=()=>changeFont(4);
 $('whiteboardUndo').onclick=undo;$('whiteboardRedo').onclick=redo;
 // Shortcuts only while the whiteboard is shown and focus is on it (or on nothing in particular).
 document.addEventListener('keydown',e=>{
  if(el.hidden||e.isComposing||!(e.ctrlKey||e.metaKey)||e.altKey||document.querySelector('dialog[open]'))return;
  const target=document.activeElement;if(target&&target!==document.body&&!el.contains(target))return;
  const key=e.key.toLowerCase();
  if(key==='z'&&!e.shiftKey){e.preventDefault();undo();}
  else if(key==='y'||(key==='z'&&e.shiftKey)){e.preventDefault();redo();}
 });
 $('whiteboardClear').onclick=()=>{if(!confirm('화이트보드의 모든 사진·글상자와 판서를 지울까요?'))return;commit();board.blocks=[];board.strokes=[];board.text='';layer.replaceChildren();nodes.clear();select(null);save();redraw();commit();};
 window.addEventListener('beforeunload',e=>{if(unsaved||pendingImages){e.preventDefault();e.returnValue='';$('whiteboardPhotoStatus').textContent='사진 처리 또는 보드 저장이 끝나지 않아 창을 유지합니다. 저장 공간을 확인해 주세요.';}});
 window.addEventListener('pagehide',save);new ResizeObserver(redraw).observe(el.querySelector('.whiteboard-surface'));tool('text');fontUI();historyUI();save();
 function editText(change){
  if(!change||typeof change.id!=='string'||typeof change.text!=='string')return;
  let b=board.blocks.find(b=>b.id===change.id);
  if(!b){if(!Number.isFinite(change.x)||!Number.isFinite(change.y))return;b={id:change.id,x:clamp(change.x,0,.95),y:clamp(change.y,0,.95),width:Math.min(.4,1-clamp(change.x,0,.95)),text:'',fontSize:board.fontSize};board.blocks.push(b);renderBlock(b);}
  if(b.type==='image')return;
  b.text=change.text;const input=nodes.get(b.id).querySelector('textarea');if(input.value!==b.text)input.value=b.text;layoutBlock(b);save();commitTextLater();
 }
 return {element:el,editText,snapshot:()=>board,activate(active){finish();el.hidden=!active;if(active){tool('text');requestAnimationFrame(redraw);}save();}};
};
