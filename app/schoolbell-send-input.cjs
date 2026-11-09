'use strict';
// One physical-input sequence. No DOM-click fallback and no retry. Geometry is
// selected by the guarded renderer, then checked again at each native event.
function armSend(document,send,state,validate){
 if(state.sendAttempt)throw Error('publication-unverified');
 send.scrollIntoView({block:'center',inline:'nearest'});
 const rect=send.getBoundingClientRect(),x=(Math.max(0,rect.left)+Math.min(innerWidth,rect.right))/2,
  y=(Math.max(0,rect.top)+Math.min(innerHeight,rect.bottom))/2;
 const hit=(px,py)=>{const e=document.elementFromPoint(px,py);return e===send||send.contains(e);};
 if(!Number.isFinite(x)||!Number.isFinite(y)||rect.width<=0||rect.height<=0||!hit(x,y)||!validate())throw Error('publication-unverified');
 const a=state.sendAttempt={token:crypto.randomUUID(),x,y,expires:Date.now()+2000,events:[],clicked:false,blocked:false,reason:null};
 const names=['pointerdown','mousedown','pointerup','mouseup','click'];
 const cleanup=()=>{for(const name of names)window.removeEventListener(name,onEvent,true);clearTimeout(timer);};
 const onEvent=e=>{
  try{
   if(a.blocked||a.clicked||Date.now()>=a.expires||!e.isTrusted||e.button!==0||
      !(e.target===send||send.contains(e.target))||!hit(e.clientX,e.clientY)||
      Math.abs(e.clientX-x)>2||Math.abs(e.clientY-y)>2||!send.isConnected||
      send.disabled||send.matches(':disabled')||send.getAttribute('aria-disabled')==='true'||!validate())throw Error('click-target-changed');
   a.events.push(e.type);
   if(e.type==='click'){
    if(JSON.stringify(a.events)!==JSON.stringify(names))throw Error('click-sequence');
    a.clicked=true;cleanup();
   }
  }catch(error){
   e.preventDefault();e.stopImmediatePropagation();a.blocked=true;
   a.reason=error.guardFailure||(error.message==='click-sequence'?'click-sequence':'click-target-changed');
  }
 };
 for(const name of names)window.addEventListener(name,onEvent,true);
 const timer=setTimeout(cleanup,2000);
 a.cleanup=cleanup;
 globalThis.__classroomSchoolbellLastSend=a;
 return {armed:true,token:a.token,x,y};
}
async function focusForSend(wc){
 const win=require('electron').BrowserWindow.fromWebContents(wc);
 if(!win||win.isDestroyed())throw Error('publication-unverified');
 if(win.isMinimized())win.restore();win.show();win.focus();
 const until=Date.now()+1500;
 while(!win.isFocused()&&Date.now()<until)await new Promise(r=>setTimeout(r,25));
 if(!win.isFocused())throw Error('publication-unverified');wc.focus();
 return ()=>!win.isDestroyed()&&win.isFocused()&&!wc.isDestroyed()&&wc.isFocused();
}
async function deliverSend(wc,armed,{focused,permitted,readResult,diagnostic=()=>{}}){
 if(!armed?.armed||typeof armed.token!=='string'||!Number.isFinite(armed.x)||!Number.isFinite(armed.y))throw Error('publication-unverified');
 if(!focused()||!await permitted())throw Error('permission-unverified');
 const zoom=wc.getZoomFactor(),x=Math.round(armed.x*zoom),y=Math.round(armed.y*zoom);
 // Mouse move is unnecessary; exactly one down/up pair is emitted.
 wc.sendInputEvent({type:'mouseDown',button:'left',x,y,clickCount:1});
 wc.sendInputEvent({type:'mouseUp',button:'left',x,y,clickCount:1});
 const until=Date.now()+1500;
 while(Date.now()<until){
  const result=await readResult(armed.token);
  if(result?.blocked){diagnostic({step:'native-send',state:'blocked',reason:result.reason,events:result.events});throw Error('publication-unverified');}
  if(result?.clicked){diagnostic({step:'native-send',state:'delivered',trusted:true,events:result.events});return {clicked:true};}
  await new Promise(r=>setTimeout(r,25));
 }
 diagnostic({step:'native-send',state:'unconfirmed'});throw Error('publication-unverified');
}
// Only structural state and fixed classifications leave the page. Never record
// account text, arbitrary error strings, body content or identifiers.
function readSendOutcome(document){
 const roots=document.querySelectorAll('app-boards-write'),root=roots.length===1?roots[0]:null;
 const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
 const notices=Array.from(document.querySelectorAll('[role="alert"],[role="alertdialog"],[aria-live]')).filter(visible);
 const text=notices.map(e=>e.textContent).join(' ');
 const buttons=root?Array.from(root.querySelectorAll('button.btn-with-description')):[];
 return {composer:!!root,sendCount:buttons.length,sendDisabled:buttons.length===1?buttons[0].matches(':disabled')||buttons[0].getAttribute('aria-disabled')==='true':null,
  invalidFields:root?Array.from(root.querySelectorAll('input:invalid,textarea:invalid,[aria-invalid="true"]')).filter(visible).length:0,
  alerts:notices.length,dialogs:Array.from(document.querySelectorAll('[role="dialog"]')).filter(visible).length,
  messageKinds:['입력','내용','수신','첨부','실패','오류','완료'].filter(word=>text.includes(word)),
  resultBoard:document.querySelectorAll('app-group-board').length===1&&!root};
}
module.exports={armSend,focusForSend,deliverSend,readSendOutcome};
