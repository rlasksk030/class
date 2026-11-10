'use strict';
// Local Chromium only: delayed/hidden/overlapping target dialogs, no service IO.
const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {inspectRecipients,recipientDialogs,probeRecipients,recipientControl}=require('../app/schoolbell-recipients.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'schoolbell-recipient-lifecycle-'));
app.setPath('userData',dir);app.commandLine.appendSwitch('disable-background-networking');
const dialog=`<mat-dialog-container><app-select-letter-targets><app-table-search><input placeholder="학생명 또는 전화번호"></app-table-search>
<table><thead><tr>${['번호','이름','보호자 휴대폰1','보호자 휴대폰2','학생 휴대폰'].map(s=>'<th>'+s+'</th>').join('')}</tr></thead><tbody><tr><td colspan="5">구성원이 없습니다.</td></tr></tbody></table>
${['관리자','보호자1','보호자2','학생'].map((s,i)=>'<label><input type="checkbox" checked '+(i===0?'disabled':'')+'>'+s+'</label>').join('')}
<button class="close">닫기</button></app-select-letter-targets></mat-dialog-container>`;
let win;
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:1100,height:700,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
 const wc=win.webContents;
 wc.session.webRequest.onBeforeRequest((r,done)=>done({cancel:!r.url.startsWith('data:')}));
 async function reset(){await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<style>
 body{margin:20px}button{padding:10px}mat-dialog-container{display:block;position:fixed;left:150px;top:100px;width:700px;height:260px;background:white;z-index:2}
 app-select-letter-targets{display:block}td,th{padding:8px}#backdrop{position:fixed;inset:0;background:white;z-index:10}
 </style><app-boards-write><button id="change">변경</button><app-letter-simplified-target-text>합성 빈 수신대상</app-letter-simplified-target-text></app-boards-write>
 <div id="host"></div><script>window.opens=0;window.template=${JSON.stringify(dialog)};
 window.addDialog=()=>{host.insertAdjacentHTML('beforeend',template);const d=host.lastElementChild;d.querySelector('.close').onclick=()=>{d.style.opacity='0';setTimeout(()=>{d.style.display='none'},150)};return d;};
 change.onclick=()=>{opens++;setTimeout(addDialog,150)};</script>`));}
 const evaluate=(fn,action)=>wc.executeJavaScriptInIsolatedWorld(17486,[{code:'('+fn.toString()+')(document,'+JSON.stringify(action)+',('+recipientDialogs.toString()+'))'}]);
 await reset();
 await wc.executeJavaScript(`addDialog().style.display='none';const cover=document.createElement('div');cover.id='backdrop';document.body.append(cover);setTimeout(()=>cover.remove(),150)`);
 const result=await inspectRecipients(wc,null,{timeoutMs:2000});
 assert.equal(result.known,true);assert.equal(result.empty,true);assert.equal(result.students,0);assert.equal(result.parents,0);assert.equal(result.mandatoryAdministrator,true);
 assert.equal(result.totalCount,2);assert.equal(result.dialogCount,1);assert.equal(result.hiddenCount,1);assert.equal(await wc.executeJavaScript('opens'),1);
 assert.equal((await evaluate(recipientControl,'read')).dialogOpen,false);
 console.log('PASS loading cover + delayed creation + hidden remnant: one open, verified empty recipients, asynchronous close');
 await reset();await wc.executeJavaScript('addDialog();addDialog()');
 const multiple=await inspectRecipients(wc,null,{timeoutMs:300});assert.equal(multiple.known,false);assert.equal(multiple.dialogCount,2);assert.equal(await wc.executeJavaScript('opens'),0);
 console.log('PASS two rendered target dialogs are blocked even when one covers the other');
 await reset();await wc.executeJavaScript('addDialog()');
 for(const css of ['display:none','visibility:hidden','opacity:0']){
  await wc.executeJavaScript('host.style.cssText='+JSON.stringify(css));const hidden=await evaluate(probeRecipients,null);assert.equal(hidden.known,false);assert.equal(hidden.dialogCount,0);assert.equal(hidden.hiddenCount,1);
 }
 await wc.executeJavaScript('host.style.cssText="";host.inert=true');assert.equal((await evaluate(probeRecipients,null)).known,false);
 await wc.executeJavaScript('host.inert=false;host.setAttribute("aria-hidden","true")');assert.equal((await evaluate(probeRecipients,null)).known,false);
 console.log('PASS display/visibility/opacity/inert/aria-hidden ancestors cannot establish recipient evidence');
 await reset();await wc.executeJavaScript('addDialog();const cover=document.createElement("div");cover.id="backdrop";document.body.append(cover)');
 assert.equal((await evaluate(probeRecipients,null)).reason,'dialog-covered');
 console.log('PASS loading cover over the only dialog remains unknown');
 await reset();await wc.executeJavaScript('addDialog();document.querySelector("app-table-search input").value="filtered"');
 assert.equal((await evaluate(probeRecipients,null)).reason,'table-or-filter');
 await wc.executeJavaScript('document.querySelector("app-table-search input").value="";document.querySelector("tbody td").textContent="synthetic member"');
 assert.equal((await evaluate(probeRecipients,null)).empty,false);
 console.log('PASS filtered and populated tables never pass empty-recipient validation');
 console.log('5/5 focused local lifecycle checks PASS; no live upload or send');
}).catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{if(win&&!win.isDestroyed())win.destroy();app.exit(process.exitCode||0);});
