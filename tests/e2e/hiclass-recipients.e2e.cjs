// Real Electron DOM fixtures, served offline. No genuine HiClass session or registration.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron}=require('playwright-core');
const ROOT=path.resolve(__dirname,'../..'),PROFILE=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'classroom-recipients-'));
const R=require('../../app/hiclass-recipients.cjs');let app,count=0;
const pass=n=>{count++;console.log('PASS '+n);};
const native=(id,label,hidden=false)=>`<input ${hidden?'style="display:none"':''} type="checkbox" id="${id}" checked onclick="window.clicks++"><label for="${id}">${label}</label>`;
const role=(label,attrs='',delay=0)=>`<div role="checkbox" aria-checked="true" ${attrs} onclick="window.clicks++;const el=this;setTimeout(()=>{el.setAttribute('aria-checked',String(el.getAttribute('aria-checked')!=='true'));},${delay})">${label}</div>`;
const fixtures={
 '기존 ID':native('target-parents-check','학부모')+native('target-student-check','학생'),
 'label for':native('arbitrary-parent','학부모',true)+native('arbitrary-student','학생',true),
 'nested label':'<label><input type="checkbox" checked onclick="window.clicks++">학부모</label><label><input type="checkbox" checked onclick="window.clicks++">학생</label>',
 '실제 custom checkbox':role('<div></div><div>학부모</div>')+role('<div></div><div>학생</div>'),
 'aria-label':role('','aria-label="학부모"')+role('','aria-label="학생"'),
 'aria-labelledby':'<span id="p-label">학부모</span>'+role('','aria-labelledby="p-label"')+'<span id="s-label">학생</span>'+role('','aria-labelledby="s-label"'),
 'nearby text':'<div><input type="checkbox" checked onclick="window.clicks++"><span>학부모</span></div><div><input type="checkbox" checked onclick="window.clicks++"><span>학생</span></div>',
 'native/custom wrapper dedup':'<label role="checkbox"><input type="checkbox" checked onclick="window.clicks++">학부모</label><label role="checkbox"><input type="checkbox" checked onclick="window.clicks++">학생</label>'
};
const fixture=html=>app.evaluate(async({BrowserWindow,session},html)=>{
 if(!globalThis.fixtureWindow){const s=session.fromPartition('recipients-offline');s.protocol.handle('https',()=>new Response(globalThis.fixtureHTML,{headers:{'content-type':'text/html; charset=utf-8'}}));globalThis.fixtureWindow=new BrowserWindow({show:false,webPreferences:{session:s}});}
 globalThis.fixtureHTML=`<!doctype html><meta charset="utf-8"><style>[role=checkbox]{display:inline-block;padding:4px}label{display:inline-block}</style><strong>옥구초등학교 6학년 1반</strong><script>window.clicks=0;window.finalClicks=0</script>${html}`;
 await fixtureWindow.loadURL('https://www.hiclass.net/main/clazzes/test/note/test');
},html);
const call=(method,payload)=>app.evaluate(async(_,arg)=>{const r=process.mainModule.require(arg.module);try{await r[arg.method](fixtureWindow,arg.payload);return {ok:true};}catch(e){return {error:e.message};}},{module:path.join(ROOT,'app/hiclass-recipients.cjs'),method,payload});
const states=()=>app.evaluate(async()=>fixtureWindow.webContents.executeJavaScript('({clicks:window.clicks,finalClicks:window.finalClicks})'));
(async()=>{try{
 app=await _electron.launch({executablePath:require('electron'),args:[path.join(ROOT,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:PROFILE}});
 const main=await app.firstWindow();await main.waitForLoadState('domcontentloaded');
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('fetch');ipcMain.handle('fetch',async()=>{throw Error('offline');});});
 const noTarget=await main.evaluate(()=>window.desktop.diaryPublish({classKey:'x',title:'test',body:'test',parents:false,students:false}));
 assert.equal(noTarget.message,'학부모 또는 학생 중 한 곳 이상을 수신대상으로 선택해 주세요.');
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);pass('both OFF: main blocks before opening/navigation');
 await main.evaluate(()=>{localStorage.setItem('settings',JSON.stringify({grade:'6',classroom:'1'}));localStorage.setItem('dashboardLocked','false');});await main.reload();await main.click('#diaryTab');
 await app.evaluate(({ipcMain})=>{globalThis.publishCalls=0;ipcMain.removeHandler('diary:publish');ipcMain.handle('diary:publish',async()=>{globalThis.publishCalls++;return {status:'error'};});});
 await main.fill('#diaryTitle','test');await main.fill('#diaryBody','test');await main.uncheck('#diaryParents');await main.uncheck('#diaryStudents');await main.click('#diaryPublish');
 assert.equal(await app.evaluate(()=>publishCalls),0);assert.equal(await main.textContent('#diaryStatus'),noTarget.message);pass('both OFF: UI blocks IPC and retains draft');
 for(const [name,html] of Object.entries(fixtures)){
  for(const [parents,students] of [[true,true],[true,false],[false,true]]){
   await fixture(html);const target={parents,students};assert.deepEqual(await call('setRecipients',target),{ok:true});assert.deepEqual(await call('verifyRecipients',target),{ok:true});
   assert.equal((await states()).clicks,Number(!parents)+Number(!students));pass(`${name}: parents ${parents} / students ${students}`);
  }
 }
 await fixture(role('학부모','',250)+role('학생','',250));assert.deepEqual(await call('setRecipients',{parents:false,students:true}),{ok:true});assert.equal((await states()).clicks,1);pass('delayed framework update re-read without duplicate click');
 await fixture(`<div role="checkbox" aria-checked="true" onclick="window.clicks++;const old=this;setTimeout(()=>{const n=old.cloneNode(true);n.setAttribute('aria-checked','false');old.replaceWith(n)},250)">학부모</div>`+role('학생'));
 assert.deepEqual(await call('setRecipients',{parents:false,students:true}),{ok:true});assert.equal((await states()).clicks,1);pass('framework replaces checkbox: re-find actual state');
 for(const html of [fixtures['기존 ID']+role('학생'),role('학부모','aria-label="학생"')+role('학생'),role('학부모','aria-checked="mixed"')+role('학생')]){
  await fixture(html);if(html.includes('mixed'))await app.evaluate(async()=>fixtureWindow.webContents.executeJavaScript(`document.querySelector('[role=checkbox]').setAttribute('aria-checked','mixed')`));
  assert.equal((await call('setRecipients',{parents:true,students:false})).error,R.messages.ambiguous);assert.equal((await states()).clicks,0);pass('ambiguous/contradictory checkbox blocks before clicks');
 }
 await fixture(role('학부모'));assert.equal((await call('verifyRecipients',{parents:true,students:true})).error,R.messages.missing);pass('missing control has distinct error');
 await fixture(role('학부모','aria-disabled="true"')+role('학생'));assert.equal((await call('setRecipients',{parents:false,students:true})).error,R.messages.change);assert.equal((await states()).clicks,0);pass('disabled control change blocked');
 await fixture('<div role="checkbox" aria-checked="true" onclick="window.clicks++">학부모</div>'+role('학생'));assert.equal((await call('setRecipients',{parents:false,students:true})).error,R.messages.change);assert.equal((await states()).clicks,1);pass('click without state change fails safely');
 await fixture(fixtures['실제 custom checkbox']);assert.equal((await call('verifyRecipients',{parents:true,students:false})).error,R.messages.mismatch);pass('recipient mismatch has distinct error');
 // Production submit must check recipients both before the initial register click and final site confirmation.
 const button=`<button onclick="window.registerClicks=(window.registerClicks||0)+1;document.querySelector('[role=checkbox]').setAttribute('aria-checked','false');const d=document.createElement('div');d.className='swal2-popup';d.setAttribute('role','dialog');d.innerHTML='<div class=swal2-html-container>작성한 내용을 지금 클래스 구성원들에게 보내시겠습니까?</div><button class=swal2-confirm onclick=window.finalClicks++>확인</button>';document.body.append(d)">등록</button>`;
 const submit=()=>app.evaluate(async(_,module)=>{try{await process.mainModule.require(module).submit(fixtureWindow,{parents:true,students:true},[],{url:'https://www.hiclass.net/main/clazzes/test/note/test',title:'옥구초등학교 6학년 1반'});return {ok:true};}catch(e){return {error:e.message};}},path.join(ROOT,'app/hiclass-adapter.cjs'));
 await fixture(fixtures['실제 custom checkbox']+button);assert.equal((await submit()).error,R.messages.mismatch);assert.equal((await states()).finalClicks,0);pass('recipient changed in confirmation: final registration blocked');
 await fixture(role('학부모')+`<div role="checkbox" aria-checked="false">학생</div>`+button);assert.equal((await submit()).error,R.messages.mismatch);assert.equal(await app.evaluate(async()=>fixtureWindow.webContents.executeJavaScript('window.registerClicks||0')),0);pass('recipient mismatch: initial register blocked');
 await fixture(fixtures['실제 custom checkbox']+button);const wrong=await app.evaluate(async(_,module)=>{try{await process.mainModule.require(module).submit(fixtureWindow,{parents:true,students:true},[],{url:'https://www.hiclass.net/main/clazzes/other/note/test',title:'옥구초등학교 6학년 1반'});}catch(e){return e.message;}},path.join(ROOT,'app/hiclass-adapter.cjs'));
 assert.match(wrong,/학급이 달라/);assert.equal((await states()).finalClicks,0);pass('class mismatch still blocks');
 console.log(`${count}/${count} passed`);
}finally{if(app)await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
