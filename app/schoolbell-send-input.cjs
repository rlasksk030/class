'use strict';
// One physical-input sequence. No DOM-click fallback and no retry. Geometry is
// selected by the guarded renderer, then checked again at each native event.
function inspectSendTarget(document,send){
 if(typeof send.getBoundingClientRect!=='function'||typeof document.elementFromPoint!=='function')return {available:false};
 const r=send.getBoundingClientRect(),x=(Math.max(0,r.left)+Math.min(innerWidth,r.right))/2,
  y=(Math.max(0,r.top)+Math.min(innerHeight,r.bottom))/2;
 const hit=document.elementFromPoint(x,y),centerHitsButton=!!hit&&(hit===send||send.contains(hit));
 const points=[];
 for(const fx of [.5,.25,.75])for(const fy of [.5,.25,.75]){
  const px=r.left+r.width*fx,py=r.top+r.height*fy,e=document.elementFromPoint(px,py);
  if(e&&(e===send||send.contains(e)))points.push({x:px,y:py});
 }
 return {visible:r.width>0&&r.height>0,enabled:!send.disabled&&!send.matches(':disabled')&&send.getAttribute('aria-disabled')!=='true',
  centerHitsButton,visiblePoints:points.length,hitTag:['BUTTON','DIV','SPAN','IFRAME','HTML','BODY'].includes(hit?.tagName)?hit.tagName:'other',
  hitDropdown:hit?.closest('button')?.getAttribute('aria-label')==='드롭다운 토글',
  hitContainsButton:!!hit?.contains(send),hitIsParent:hit===send.parentElement,
  pointerEvents:getComputedStyle(send).pointerEvents==='none'?'none':'enabled',
  hitIsBackdrop:!!hit&&(hit.classList.contains('modal-backdrop')||hit.classList.contains('cdk-overlay-backdrop')||hit.classList.contains('dropdown-backdrop')),
  hitSurfaceClasses:hit?Array.from(hit.classList).filter(s=>/^(modal|cdk-|dropdown|overlay|ng-|position-|btn-|w-|h-|d-)[a-zA-Z0-9_-]{0,60}$/.test(s)).slice(0,8):[],
  point:{x,y}};
}
function armSend(document,send,state,validate,inspect){
 const deny=reason=>{const e=Error('publication-unverified');e.nativeFailure=reason;throw e;};
 if(state.sendAttempt)deny('already-armed');
 send.scrollIntoView({block:'center',inline:'nearest'});
 const target=inspect(document,send);if(!target.point)deny('geometry');const {x,y}=target.point;
 const hit=(px,py)=>{const e=document.elementFromPoint(px,py);return e===send||send.contains(e);};
 if(!Number.isFinite(x)||!Number.isFinite(y)||!target.visible)deny('geometry');
 if(!target.enabled)deny('disabled');
 if(!target.centerHitsButton)deny('occluded');
 if(!validate())deny('validation');
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
async function focusForSend(wc,diagnostic=()=>{}){
 const win=require('electron').BrowserWindow.fromWebContents(wc);
 if(!win||win.isDestroyed()){diagnostic({step:'native-send-focus',state:'missing-window'});throw Error('publication-unverified');}
 if(win.isMinimized())win.restore();win.show();win.focus();
 const until=Date.now()+1500;
 while(!win.isFocused()&&Date.now()<until)await new Promise(r=>setTimeout(r,25));
 if(!win.isFocused()){diagnostic({step:'native-send-focus',state:'failed'});throw Error('publication-unverified');}wc.focus();
 diagnostic({step:'native-send-focus',state:'focused'});
 return ()=>!win.isDestroyed()&&win.isFocused()&&!wc.isDestroyed()&&wc.isFocused();
}
async function waitForSendTarget(wc,{permitted,diagnostic=()=>{}}){
 const until=Date.now()+2000;let consecutive=0,last=null;
 while(Date.now()<until){
  if(!await permitted())throw Error('permission-unverified');
  const sample=await wc.executeJavaScriptInIsolatedWorld(17481,[{code:'(()=>{const roots=document.querySelectorAll("app-boards-write"),buttons=roots.length===1?roots[0].querySelectorAll("button.btn-with-description"):[];if(buttons.length!==1)return {available:false};buttons[0].scrollIntoView({block:"center",inline:"nearest"});const {point,...target}=('+inspectSendTarget.toString()+')(document,buttons[0]);return target;})()'}]);
  last=sample;
  if(sample.visible===true&&sample.enabled===true&&sample.centerHitsButton===true){
   if(++consecutive===2){diagnostic({step:'native-send-target',state:'ready',target:sample});return;}
  }else consecutive=0;
  await new Promise(resolve=>setTimeout(resolve,80));
 }
 diagnostic({step:'native-send-target',state:'blocked',target:last});throw Error('publication-unverified');
}
async function deliverSend(wc,armed,{focused,permitted,readResult,diagnostic=()=>{}}){
 if(!armed?.armed||typeof armed.token!=='string'||!Number.isFinite(armed.x)||!Number.isFinite(armed.y))throw Error('publication-unverified');
 if(!focused()||!await permitted())throw Error('permission-unverified');
 const zoom=wc.getZoomFactor(),x=Math.round(armed.x*zoom),y=Math.round(armed.y*zoom);
 // Mouse move is unnecessary; exactly one down/up pair is emitted.
 diagnostic({step:'native-send',state:'dispatching'});
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
module.exports={inspectSendTarget,armSend,focusForSend,waitForSendTarget,deliverSend,readSendOutcome};
