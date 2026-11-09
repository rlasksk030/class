'use strict';
// Only the changed final input transport. All URLs are intercepted locally;
// no login, real classroom, photo upload or external publishing occurs.
const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'schoolbell-send-input-')));
app.commandLine.appendSwitch('disable-background-networking');
const {createObservedComposerBridge}=require('../app/schoolbell-observed-composer.cjs');
const {readSendOutcome}=require('../app/schoolbell-send-input.cjs');
const url='https://schoolbell-e.com/ko/main/group/100/boards/write/classnews';
const html=`<meta charset="utf-8"><style>button{padding:20px}body{margin:20px}</style><app-boards-write>
<input placeholder="제목을 입력해 주세요." value="합성 마지막 클릭"><div class="fr-element fr-view" contenteditable="true">합성 본문</div>
<input type="file" multiple accept=".png,.jpg"><app-letter-write-file-list></app-letter-write-file-list>
<button class="btn-with-description">보내기</button><button>임시저장</button></app-boards-write>
<script>window.events=[];window.sends=0;const send=document.querySelector('.btn-with-description');
for(const name of ['pointerdown','mousedown','pointerup','mouseup','click'])send.addEventListener(name,e=>events.push({name,trusted:e.isTrusted}));
send.addEventListener('click',e=>{if(events.some(e=>e.name==='mousedown'&&e.trusted)&&e.isTrusted)sends++;});</script>`;
let win;
app.whenReady().then(async()=>{
 const ses=session.fromPartition('schoolbell-native-send-local');
 ses.protocol.handle('https',()=>new Response(html,{headers:{'Content-Type':'text/html;charset=utf-8'}}));
 ses.webRequest.onBeforeRequest((r,done)=>done({cancel:!r.url.startsWith('https://schoolbell-e.com/')}));
 win=new BrowserWindow({show:true,width:1000,height:700,webPreferences:{session:ses,contextIsolation:true,nodeIntegration:false,sandbox:true}});
 const wc=win.webContents,diagnostics=[];
 async function setup(){await win.loadURL(url);return createObservedComposerBridge({getWebContents:()=>wc,authorize:()=>true,domGuard:()=>true,diagnostic:e=>diagnostics.push(e)});}
 async function submit(bridge){const fields=await bridge.readFields();return bridge.commitOnce({revision:fields.revision,note:{title:fields.title,body:fields.body},photos:[],finalAction:'single-send',stillPermitted:()=>true});}
 let bridge=await setup();
 await wc.executeJavaScript('document.querySelector(".btn-with-description").click()');
 assert.deepEqual(await wc.executeJavaScript('events'),[{name:'click',trusted:false}]);assert.equal(await wc.executeJavaScript('sends'),0);
 await bridge.close();console.log('PASS DOM click has no trusted mouse-down/up sequence (local comparison only)');
 bridge=await setup();wc.setZoomFactor(1.25);await submit(bridge);
 assert.equal(await wc.executeJavaScript('sends'),1);assert.deepEqual(await wc.executeJavaScript('events.map(e=>e.name)'),['pointerdown','mousedown','pointerup','mouseup','click']);
 assert.equal((await wc.executeJavaScript('events')).every(e=>e.trusted),true);
 await assert.rejects(submit(bridge));assert.equal(await wc.executeJavaScript('sends'),1);await bridge.close();
 console.log('PASS focused native down/up at 125% zoom, trusted click delivered exactly once; repeat denied');
 bridge=await setup();await wc.executeJavaScript('document.querySelector(".btn-with-description").addEventListener("mousedown",()=>document.querySelector(".fr-element").textContent="changed")');
 await assert.rejects(submit(bridge));assert.equal(await wc.executeJavaScript('sends'),0);await bridge.close();
 console.log('PASS content mutation between native down/up blocks final click');
 bridge=await setup();await wc.executeJavaScript('const cover=document.createElement("div");cover.style="position:fixed;inset:0;z-index:999;background:white";document.body.append(cover)');
 await assert.rejects(submit(bridge));assert.equal(await wc.executeJavaScript('events.length'),0);await bridge.close();
 console.log('PASS occluded target blocks all mouse input');
 bridge=await setup();await wc.executeJavaScript('(()=>{const fieldset=document.createElement("fieldset");fieldset.disabled=true;const send=document.querySelector(".btn-with-description");send.replaceWith(fieldset);fieldset.append(send)})()');
 await assert.rejects(submit(bridge));assert.equal(await wc.executeJavaScript('events.length'),0);await bridge.close();
 console.log('PASS inherited disabled state blocks input');
 bridge=await setup();await wc.executeJavaScript('(()=>{const alert=document.createElement("div");alert.role="alert";alert.textContent="합성 오류: 입력 내용을 확인";document.body.append(alert)})()');
 const outcome=await wc.executeJavaScript('('+readSendOutcome.toString()+')(document)');assert.equal(outcome.alerts,1);assert.deepEqual(outcome.messageKinds,['입력','내용','오류']);assert.equal(JSON.stringify(outcome).includes('합성'),false);await bridge.close();
 console.log('PASS post-click UI diagnostics contain only structure and fixed error categories');
 console.log('6 focused checks PASS; real service publication NOT RUN by this fixture');
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{if(win&&!win.isDestroyed())win.destroy();app.exit(process.exitCode||0);});
