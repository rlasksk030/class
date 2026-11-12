'use strict';
// Schoolbell page adapter: reads and operates the service page through its ordinary DOM.
// Everything runs in an isolated world (shared DOM only): no site JavaScript, cookies, storage,
// tokens or private API. Selectors are the ones observed on the real composer and class board
// (tests/validation/2026-11-12-schoolbell-autopost.md). A missing or duplicated element is never
// guessed: the operation throws a fixed code and the caller stops.
const {readEditorText}=require('./schoolbell-editor-text.cjs');
const WORLD=17480;

// Serialized into the page. Keep self-contained: only its arguments and DOM globals.
function page(action,arg,readText){
 const fail=code=>{throw Error(code);};
 const shown=e=>{
  if(!e||!e.isConnected)return false;
  const r=e.getBoundingClientRect();if(!(r.width>0&&r.height>0))return false;
  for(let n=e;n&&n.nodeType===1;n=n.parentElement){
   const s=getComputedStyle(n);
   if(n.hidden||s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||Number(s.opacity)===0)return false;
  }
  return true;
 };
 const text=e=>String(e?.textContent||'').replace(/\s+/g,' ').trim();
 const compact=e=>String(e?.textContent||'').replace(/\s/g,'');
 const usable=e=>!e.disabled&&!e.matches(':disabled')&&e.getAttribute('aria-disabled')!=='true';
 // Centre point when it really hits the element (nothing such as a loading backdrop covers it).
 const point=e=>{
  const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
  if(!(r.width>0&&r.height>0)||x<0||y<0||x>=innerWidth||y>=innerHeight)return null;
  const hit=document.elementFromPoint(x,y);
  return hit&&(hit===e||e.contains(hit))?{x,y}:null;
 };
 const store=globalThis.__classroomSchoolbell||(globalThis.__classroomSchoolbell={});
 // The service's own dialogs that are really displayed (outermost only). Limited to its dialog
 // containers so an unrelated widget that merely carries a dialog role is not mistaken for one.
 const dialogs=()=>{
  const all=[...document.querySelectorAll('mat-dialog-container,ngb-modal-window,.swal2-popup')].filter(shown);
  return all.filter(d=>!all.some(o=>o!==d&&o.contains(d)));
 };
 const targetDialogs=()=>dialogs().filter(d=>d.querySelector('app-select-letter-targets'));

 if(action==='inspect'){
  return {url:location.href,login:[...document.querySelectorAll('input[type="password"]')].some(shown),
   board:document.querySelectorAll('app-group-board').length===1,composer:document.querySelectorAll('app-boards-write').length===1};
 }
 // Class settings page: the class name field and the class-type icon.
 if(action==='group'){
  const roots=document.querySelectorAll('app-settings-groupinfo');
  const names=document.querySelectorAll('app-name-and-address input[placeholder="기관이름을 입력해주세요."]');
  if(roots.length!==1||names.length!==1)return {known:false};
  return {known:true,name:names[0].value.trim(),classType:document.querySelectorAll('app-name-and-address .group-type-icon.class').length===1};
 }
 // Class board list. Only cards with the requested title return their body and file names.
 if(action==='board'){
  const boards=document.querySelectorAll('app-group-board');if(boards.length!==1)return {known:false};
  const cards=[...boards[0].querySelectorAll('app-letter-item-long')],ids=[],matches=[];
  for(const card of cards){
   const id=card.closest('div.notification-post[data-letter-id]')?.getAttribute('data-letter-id')||'';
   if(/^\d+$/.test(id))ids.push(id);
   const titles=card.querySelectorAll('app-translation-viewer');if(titles.length!==1)return {known:false};
   if(titles[0].textContent.trim()!==arg.title.trim())continue;
   const bodies=card.querySelectorAll('app-text-viewer .fr-view');if(bodies.length>1)return {known:false};
   let body='',approximate=false;
   if(bodies.length===1){try{body=readText(bodies[0]);}catch{body=bodies[0].innerText;approximate=true;}}
   const lists=card.querySelectorAll('app-letter-filelist');if(lists.length>1)return {known:false};
   const files=lists.length===1?[...lists[0].querySelectorAll('.file-item')].map(row=>{
    const base=row.querySelectorAll('span.text-truncate'),ext=row.querySelectorAll('span.text-nowrap:not(.file-item-size)');
    return base.length===1&&ext.length===1?base[0].textContent.trim()+ext[0].textContent.trim():null;
   }):[];
   matches.push({id:/^\d+$/.test(id)?id:'',body,approximate,files});
  }
  const ended=[...boards[0].querySelectorAll('app-infinite-list-info p')].some(e=>e.textContent.trim()==='더이상 글이 없습니다.');
  return {known:true,count:cards.length,ended,ids,matches};
 }
 // Enter the composer through the board's own 작성하기 button; a write address is never constructed.
 if(action==='open-composer'){
  if(document.querySelectorAll('app-boards-write').length===1)return {ready:true};
  if(document.querySelectorAll('app-group-board').length!==1)return {ready:false};
  const buttons=[...document.querySelectorAll('button')].filter(b=>compact(b)==='작성하기'&&shown(b));
  if(buttons.length!==1||!usable(buttons[0]))return {ready:false,missing:true};
  if(arg.click){buttons[0].click();return {ready:false,clicked:true};}
  return {ready:false};
 }

 // ----- composer -----
 const composer=()=>{
  // The suffix names the control that was not found exactly once; it is a fixed word, never page text.
  const roots=document.querySelectorAll('app-boards-write');if(roots.length!==1)fail('structure:composer-'+roots.length);
  const root=roots[0],one=(s,name)=>{const n=root.querySelectorAll(s);if(n.length!==1)fail('structure:'+name+'-'+n.length);return n[0];};
  const sends=[...root.querySelectorAll('button.btn-with-description')].filter(b=>compact(b).startsWith('보내기'));
  if(sends.length!==1)fail('structure:send-'+sends.length);
  return {root,title:one('input[placeholder="제목을 입력해 주세요."]','title'),body:one('div.fr-element.fr-view[contenteditable="true"]','body'),
   file:one('input[type="file"]','file'),label:one('app-letter-simplified-target-text','label'),send:sends[0]};
 };
 // Uploaded files shown in the composer. The size label next to a name is not part of the name.
 const attachments=root=>{
  const lists=root.querySelectorAll('app-letter-write-file-list');
  const rows=lists.length===1?[...lists[0].querySelectorAll('app-file-row')]:[];
  return {known:lists.length<=1,uploading:!!document.querySelector('app-file-upload-list,app-progress-bar'),
   names:rows.map(row=>{
    const names=row.querySelectorAll('app-file-name-text');if(names.length!==1)return null;
    const base=names[0].querySelectorAll('span.text-truncate'),ext=names[0].querySelectorAll('span.flex-shrink-0:not(.small)');
    return base.length===1&&ext.length===1?base[0].textContent+ext[0].textContent:null;
   })};
 };
 // 즉시발행하기 / 예약발행하기 radios of the send dropdown.
 const mode=()=>{
  const radios=[...document.querySelectorAll('input[type="radio"]')];
  const label=e=>[...(e.labels||[])].map(l=>l.textContent.trim()).join(' ').trim();
  const now=radios.filter(e=>label(e)==='즉시발행하기'),later=radios.filter(e=>label(e)==='예약발행하기');
  if(now.length!==1||later.length!==1||now[0].checked===later[0].checked)return {known:false};
  return {known:true,immediate:now[0].checked,now:now[0]};
 };
 // The editor stores runs of spaces as non-breaking spaces; compare them as ordinary spaces.
 const plain=value=>value.replace(/\u00a0/g,' ');
 const bodyText=c=>{try{return plain(readText(c.body));}catch{return null;}};
 const snapshot=c=>{
  const files=attachments(c.root),m=mode();
  return {title:c.title.value,body:bodyText(c),files:{known:files.known,uploading:files.uploading,names:files.names},
   label:text(c.label),sendEnabled:usable(c.send),sendHit:!!point(c.send),dialogs:dialogs().length,
   mode:m.known?(m.immediate?'immediate':'scheduled'):'unknown',
   // Lengths, counts and element names only (never text): tells why a composer is not blank.
   probe:{title:c.title.value.length,body:bodyText(c)===null?-1:bodyText(c).length,rows:files.names.length,
    uploadList:!!document.querySelector('app-file-upload-list'),progressBar:!!document.querySelector('app-progress-bar'),
    dialogs:dialogs().map(d=>d.localName+(d.querySelector('app-select-letter-targets')?'+targets':'')).slice(0,4)}};
 };
 if(action==='composer')return snapshot(composer());

 if(action==='title'){
  const c=composer();
  if(!usable(c.title)||c.title.readOnly||(c.title.maxLength>0&&arg.value.length>c.title.maxLength))fail('structure');
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  c.title.focus();setter.call(c.title,arg.value);
  c.title.dispatchEvent(new Event('input',{bubbles:true}));c.title.dispatchEvent(new Event('change',{bubbles:true}));
  if(c.title.value!==arg.value)fail('changed');
  return true;
 }
 if(action==='body'){
  // Native Chromium editing commands only, so the editor's own input listeners see the edit.
  // No innerHTML/innerText assignment, pasted HTML or private editor API.
  const c=composer(),body=c.body,lines=arg.lines;
  if(!body.isContentEditable)fail('structure');
  body.focus();
  const selection=document.getSelection(),range=document.createRange();
  range.selectNodeContents(body);selection.removeAllRanges();selection.addRange(range);
  for(let i=0;i<lines.length;i++){
   if(i&&!document.execCommand('insertLineBreak',false))fail('structure');
   if(lines[i]&&!document.execCommand('insertText',false,lines[i]))fail('structure');
  }
  const value=plain(lines.join('\n'));
  // Native editing may keep one terminal line break as a caret placeholder. Remove only that.
  if(bodyText(c)===value+'\n'){
   let last=body.lastChild;while(last?.nodeType===1&&last.nodeName!=='BR'&&last.lastChild)last=last.lastChild;
   if(last?.nodeName==='BR')last.remove();
   else if(last?.nodeType===3&&last.data.endsWith('\n'))last.deleteData(last.length-1,1);
   body.dispatchEvent(new Event('input',{bubbles:true}));
  }
  body.dispatchEvent(new Event('change',{bubbles:true}));
  if(bodyText(c)!==value)fail('changed');
  return true;
 }
 // Photos arrive one per call (no single huge message), then go to the service's own file input
 // in one selection. The upload itself is the service's ordinary pipeline.
 if(action==='file-add'){
  if(arg.index===0)store.files=[];
  if(!Array.isArray(store.files)||store.files.length!==arg.index)fail('upload');
  const binary=atob(arg.base64),bytes=Uint8Array.from(binary,ch=>ch.charCodeAt(0));
  if(bytes.length!==arg.size)fail('upload');
  store.files.push(new File([bytes],arg.name,{type:arg.type}));
  return true;
 }
 if(action==='files'){
  const c=composer(),file=c.file,ready=store.files||[];store.files=null;
  if(!usable(file)||(!file.multiple&&ready.length>1)||file.files.length)fail('structure');
  if(ready.length!==arg.names.length||ready.some((f,i)=>f.name!==arg.names[i]))fail('upload');
  const transfer=new DataTransfer();
  for(const f of ready)transfer.items.add(f);
  file.files=transfer.files;
  if(file.files.length!==ready.length||[...file.files].some((f,i)=>f.size!==ready[i].size))fail('upload');
  file.dispatchEvent(new Event('input',{bubbles:true}));file.dispatchEvent(new Event('change',{bubbles:true}));
  return true;
 }

 // ----- send dropdown (즉시발행) -----
 if(action==='mode-toggle'){
  const c=composer();
  const buttons=[...c.root.querySelectorAll('button')].filter(b=>[b.getAttribute('aria-label'),b.getAttribute('title'),b.textContent.trim()].includes('드롭다운 토글'));
  if(buttons.length!==1||!usable(buttons[0]))fail('mode');
  buttons[0].click();return true;
 }
 if(action==='mode-immediate'){
  composer();const m=mode();if(!m.known)fail('mode');
  if(!m.immediate){if(m.now.disabled)fail('mode');m.now.click();}
  return true;
 }

 // ----- recipients dialog (변경 → 관리자 / 보호자1 / 보호자2 / 학생) -----
 const roles=dialog=>{
  const keys={'관리자':'administrator','보호자1':'guardian1','보호자2':'guardian2','학생':'student'},found={};
  const checks=[...dialog.querySelectorAll('input[type="checkbox"]')];
  for(const check of checks){
   const key=keys[String(check.closest('label')?.textContent||'').replace(/\s/g,'')];
   if(!key||found[key])fail('recipients');
   found[key]=check;
  }
  if(checks.length!==4||Object.keys(found).length!==4)fail('recipients');
  return found;
 };
 const dialogButtons=(dialog,labels)=>[...dialog.querySelectorAll('button')].filter(b=>shown(b)&&labels.includes(compact(b)));
 if(action==='targets-open'){
  const c=composer();
  if(targetDialogs().length)return {open:true};
  const buttons=[...c.root.querySelectorAll('button:has(+ app-letter-simplified-target-text)')];
  if(buttons.length!==1||compact(buttons[0])!=='변경'||!usable(buttons[0]))fail('recipients');
  // A loading cover can still be over the new composer; wait until the button is really reachable.
  buttons[0].scrollIntoView({block:'center',inline:'nearest'});
  if(!point(buttons[0]))return {open:false,covered:true};
  buttons[0].click();return {open:false,clicked:true};
 }
 if(action==='targets'){
  composer();const open=targetDialogs();
  if(!open.length)return {open:false};
  if(open.length!==1||dialogs().length!==1)fail('recipients');
  const found=roles(open[0]),state={};
  for(const key of ['guardian1','guardian2','student']){
   if(arg.set&&found[key].checked!==arg.set[key]){if(found[key].disabled)fail('recipients');found[key].click();}
   state[key]=found[key].checked;
  }
  return {open:true,state,administrator:found.administrator.checked};
 }
 if(action==='targets-close'){
  composer();const open=targetDialogs();if(!open.length)return {open:false};
  if(open.length!==1)fail('recipients');
  // arg.apply: press the dialog's own confirm button when there is exactly one; otherwise 닫기.
  const confirms=arg.apply?dialogButtons(open[0],['확인','적용','저장','완료','선택완료']):[];
  if(confirms.length>1)fail('recipients');
  const closes=dialogButtons(open[0],['닫기']);
  const button=confirms[0]||closes[0];
  if(!button||(!confirms.length&&closes.length!==1)||!usable(button))fail('recipients');
  button.click();return {open:true,applied:!!confirms.length};
 }

 // ----- trusted click target -----
 // Allows only the trusted click sequence on one element for a short time and reports whether it
 // arrived. Any other trusted pointer input in that window is blocked, so a misplaced click
 // cannot press a different control.
 const arm=element=>{
  if(store.armed&&!store.armed.done)store.armed.cleanup();
  element.scrollIntoView({block:'center',inline:'nearest'});
  const at=point(element);if(!at||!usable(element))return null;
  const names=['pointerdown','mousedown','pointerup','mouseup','click'];
  const a=store.armed={token:crypto.randomUUID(),expires:Date.now()+3000,events:[],clicked:false,blocked:false,done:false};
  const onEvent=e=>{
   if(!e.isTrusted)return;
   const on=e.target===element||element.contains(e.target);
   if(a.done||!on||Date.now()>a.expires||!element.isConnected||!usable(element)){e.preventDefault();e.stopImmediatePropagation();a.blocked=true;return;}
   a.events.push(e.type);
   if(e.type==='click'){a.clicked=a.events.join()===names.join();if(!a.clicked){e.preventDefault();e.stopImmediatePropagation();a.blocked=true;}a.cleanup();}
  };
  a.cleanup=()=>{a.done=true;for(const name of names)window.removeEventListener(name,onEvent,true);clearTimeout(timer);};
  for(const name of names)window.addEventListener(name,onEvent,true);
  const timer=setTimeout(a.cleanup,3000);
  return {token:a.token,x:at.x,y:at.y};
 };
 if(action==='arm-send'){
  // Last comparison in the same task as arming: content, files, recipient label, mode and overlays.
  const c=composer(),now=snapshot(c);
  if(now.title!==arg.title||now.body!==arg.body||!now.files.known||(now.files.uploading&&!arg.idleIndicator)||
     JSON.stringify(now.files.names)!==JSON.stringify(arg.names)||now.label!==arg.label)fail('changed');
  if(now.dialogs||now.mode==='scheduled')fail('changed');
  if(!now.sendEnabled)return {ready:false};
  const armed=arm(c.send);
  return armed?{ready:true,...armed}:{ready:false};
 }
 if(action==='arm-dialog'){
  const open=dialogs();if(open.length!==1)fail('dialog');
  const buttons=[...open[0].querySelectorAll('button,[role="button"]')].filter(shown);
  const button=buttons[arg.button];
  if(!button||compact(button)!==arg.label)fail('dialog');
  const armed=arm(button);
  return armed?{ready:true,...armed}:{ready:false};
 }
 if(action==='armed'){
  const a=store.armed;
  return a&&a.token===arg.token?{clicked:a.clicked,blocked:a.blocked,events:a.events.length}:{clicked:false,blocked:false,events:0,unknown:true};
 }
 // After the send click: where the page went and which dialog (if any) is displayed.
 if(action==='outcome'){
  return {url:location.href,board:document.querySelectorAll('app-group-board').length===1,
   composer:document.querySelectorAll('app-boards-write').length===1,
   dialogs:dialogs().map(d=>({text:text(d).slice(0,300),buttons:[...d.querySelectorAll('button,[role="button"]')].filter(shown).map(compact)}))};
 }
 fail('action');
}

// Fixed codes only cross back to the main process; page text never appears in an error.
// "code:word-2" carries a fixed detail word (which control, how many were found).
const CODES=['structure','changed','upload','mode','recipients','dialog','action'];
async function run(wc,action,arg={}){
 if(!wc||wc.isDestroyed())throw Object.assign(Error('closed'),{code:'closed'});
 const code='(()=>{try{return {ok:true,value:('+page.toString()+')('+JSON.stringify(action)+','+JSON.stringify(arg)+',('+readEditorText.toString()+'))};}'+
  'catch(e){return {ok:false,code:String(e&&e.message)};}})()';
 const result=await wc.executeJavaScriptInIsolatedWorld(WORLD,[{code}]);
 if(result?.ok===true)return result.value;
 const [base,detail='']=String(result?.code||'').split(':');
 const known=CODES.includes(base)?base:'structure';
 throw Object.assign(Error(known),{code:known,detail:/^[a-z0-9-]{1,32}$/.test(detail)?action+':'+detail:action});
}
const inspect=wc=>run(wc,'inspect');
module.exports={WORLD,page,run,inspect,CODES};
