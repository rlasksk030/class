'use strict';
// Focused local Electron test. All HTTPS is intercepted; no Schoolbell IO.
const {app,BrowserWindow,session}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {runNonpublishingCheck,NOTE,syntheticPhoto}=require('../app/schoolbell-nonpublishing.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'schoolbell-nonpublishing-'));
app.setPath('userData',dir);app.commandLine.appendSwitch('disable-background-networking');
const url='https://schoolbell-e.com/ko/main/group/100/boards/write/classnews';
const html=`<!doctype html><meta charset="utf-8"><app-boards-write>
<input placeholder="제목을 입력해 주세요."><div class="fr-element fr-view" contenteditable="true"></div>
<input type="file" multiple accept=".png"><app-letter-simplified-target-text>synthetic audience</app-letter-simplified-target-text>
<app-letter-write-file-list></app-letter-write-file-list><button class="btn-with-description">보내기</button><button id="save">임시저장</button>
</app-boards-write><script>
window.model={title:'',inputEvents:0,send:0,save:0};
const q=s=>document.querySelector(s);
q('input[placeholder]').oninput=e=>{model.title=e.target.value;if(window.changeAudience)q('app-letter-simplified-target-text').textContent='changed';};
q('[contenteditable]').oninput=()=>model.inputEvents++;
q('.btn-with-description').onclick=()=>model.send++;q('#save').onclick=()=>model.save++;
q('[type=file]').onchange=()=>{for(const f of q('[type=file]').files){const row=document.createElement('app-file-row'),name=document.createElement('app-file-name-text');
const a=document.createElement('span'),b=document.createElement('span');a.className='text-truncate';b.className='flex-shrink-0';
const i=f.name.lastIndexOf('.');a.textContent=f.name.slice(0,i);b.textContent=f.name.slice(i);name.append(a,b);row.append(name);q('app-letter-write-file-list').append(row);}};
</script>`;
let win;
app.whenReady().then(async()=>{
 const ses=session.fromPartition('nonpublishing-local-only');
 await ses.protocol.handle('https',request=>new Response(request.url===url?html:'blocked',{status:request.url===url?200:403,headers:{'content-type':'text/html'}}));
 win=new BrowserWindow({show:false,width:1000,height:700,webPreferences:{session:ses,contextIsolation:true,nodeIntegration:false,sandbox:true}});
 const context={boardId:'100',checks:{classPage:true,gradeClass:true},accountObservationDigest:'synthetic-only',publicationMode:{known:true,mode:'immediate'},
  recipientEvidence:{known:true,unfiltered:true,empty:false,visibleRows:2,targetLabel:'synthetic audience',
   roles:Object.fromEntries(['administrator','guardian1','guardian2','student'].map(k=>[k,{checked:true,disabled:k==='administrator'}]))}};
 const run=confirm=>runNonpublishingCheck({webContents:win.webContents,target:{classKey:'2026:1:2'},canUse:()=>true,
  inspectContext:async()=>context,confirm,readOriginals:async()=>({complete:true,items:[{state:'complete',source:'original-download',bytes:syntheticPhoto().bytes}]})});
 await win.loadURL(url);let r=await run(async()=>true);
 assert.equal(r.status,'nonpublishing-verified',JSON.stringify(r));
 let model=await win.webContents.executeJavaScript('model');assert.equal(model.title,NOTE.title);assert.ok(model.inputEvents>0);assert.equal(model.send+model.save,0);
 assert.equal(r.steps.original,true);console.log('PASS existing native title/body/file transport in nonpublishing-only flow; no send/save');
 await win.loadURL(url);r=await run(async()=>{await win.webContents.executeJavaScript('document.querySelector("input[placeholder]").value="existing teacher draft"');return true;});
 assert.equal(r.reason,'existing-content');assert.equal(await win.webContents.executeJavaScript('document.querySelector("input[placeholder]").value'),'existing teacher draft');
 console.log('PASS draft appearing during consent is preserved');
 await win.loadURL(url);await win.webContents.executeJavaScript('window.changeAudience=true');r=await run(async()=>true);
 assert.equal(r.status,'blocked');assert.equal(r.stage,'body');assert.equal(r.steps.upload,false);
 model=await win.webContents.executeJavaScript('model');assert.equal(model.send+model.save,0);
 console.log('PASS recipient-label change blocks further input and upload');
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{win?.destroy();app.exit(process.exitCode||0);});
