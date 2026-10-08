// Real BrowserWindow/IPC/session isolation, mocked adapter outcomes. No real post or credentials.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron}=require('playwright-core'),ROOT=path.resolve(__dirname,'../..'),PROFILE=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'classroom-window-'));let app,count=0;
const pass=s=>{count++;console.log('PASS '+s);};
(async()=>{try{
 app=await _electron.launch({executablePath:require('electron'),args:[path.join(ROOT,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:PROFILE}});const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
 await app.evaluate(({app,BrowserWindow,session},root)=>{
  const fs=process.mainModule.require('node:fs'),path=process.mainModule.require('node:path');globalThis.adapter=process.mainModule.require(path.join(root,'app/hiclass-adapter.cjs'));
  globalThis.originalPrepare=adapter.prepare;globalThis.originalSubmit=adapter.submit;globalThis.events=[];globalThis.outcome='success';globalThis.attempts=0;globalThis.prepareCalls=0;
  for(const method of ['show','hide','focus','setSkipTaskbar']){const original=BrowserWindow.prototype[method];BrowserWindow.prototype[method]=function(...args){events.push({method,id:this.id,args});return original.apply(this,args);};}
  session.fromPartition('persist:hiclass-teacher').protocol.handle('https',()=>new Response(globalThis.publishHTML||'<!doctype html><meta charset="utf-8"><input type="password"><h1>로그인</h1>',{headers:{'content-type':'text/html; charset=utf-8'}}));
  fs.writeFileSync(path.join(app.getPath('userData'),'hiclass-links.json'),JSON.stringify({links:{fixture:{url:'https://www.hiclass.net/main/clazzes/c/note/n',title:'옥구초등학교 6학년 1반'}},posts:{}}));
  adapter.prepare=async w=>{globalThis.prepareCalls++;globalThis.worker=w;await w.loadURL('https://www.hiclass.net/main/clazzes/c/note/n');if(outcome==='expired')throw Error('하이클래스 로그인이 만료되었습니다. 다시 로그인해 주세요.');if(outcome==='popup'){await w.webContents.executeJavaScript("window.open('https://www.hiclass.net/unknown-registration-window');void 0");await new Promise(r=>setTimeout(r,100));}return {matching:0,ids:[]};};
  adapter.submit=async()=>{attempts++;if(outcome==='uncertain')throw Error('result unknown');return 'success';};
 },ROOT);
 let sequence=0;const payload=()=>({classKey:'fixture',date:'2026-10-08',title:'fixture '+(++sequence),body:'offline body',parents:false,students:true});
 const publish=p=>page.evaluate(p=>desktop.diaryPublish(p),p);
 const visibility=()=>app.evaluate(({BrowserWindow})=>({events,visible:BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().includes('hiclass.net')).some(w=>w.isVisible()),attempts,prepareCalls,all:BrowserWindow.getAllWindows().length}));
 let p=payload(),r=await publish(p),v=await visibility();assert.equal(r.status,'success');assert.equal(v.visible,false);assert.ok(!v.events.some(e=>['show','focus'].includes(e.method)));pass('normal mocked publication never shows or focuses a HiClass window');
 r=await publish(p);assert.equal(r.status,'success');assert.equal((await visibility()).attempts,1);assert.equal((await visibility()).prepareCalls,1);pass('duplicate hash blocks a second adapter attempt');
 await page.evaluate(()=>desktop.diaryConnect({classKey:'fixture',label:'6학년 1반',grade:'6',classroom:'1'}));v=await visibility();assert.equal(v.visible,true);assert.ok(v.events.some(e=>e.method==='show'));pass('only explicit connect reveals login window');
 await app.evaluate(()=>{globalThis.events=[];});r=await publish(payload());v=await visibility();assert.equal(r.status,'success');assert.equal(v.visible,false);assert.ok(v.events.some(e=>e.method==='hide'));assert.ok(!v.events.some(e=>['show','focus'].includes(e.method)));pass('an existing visible connection window is hidden before publication');
 await app.evaluate(()=>{globalThis.outcome='expired';globalThis.events=[];});r=await publish(payload());v=await visibility();assert.equal(r.status,'error');assert.match(r.message,/다시 로그인/);assert.equal(v.visible,false);assert.ok(!v.events.some(e=>['show','focus'].includes(e.method)));pass('expired login returns guidance without revealing window');
 await app.evaluate(()=>{globalThis.outcome='popup';globalThis.events=[];});const before=await visibility();r=await publish(payload());v=await visibility();assert.equal(r.status,'error');assert.match(r.message,/별도 창/);assert.equal(v.attempts,before.attempts);assert.equal(v.all,before.all);assert.equal(v.visible,false);pass('background window.open is denied and stops before submit with explanation');
 await app.evaluate(()=>{globalThis.outcome='uncertain';globalThis.events=[];});p=payload();r=await publish(p);assert.equal(r.status,'uncertain');const tries=(await visibility()).attempts;r=await publish(p);assert.equal(r.status,'uncertain');assert.equal((await visibility()).attempts,tries);pass('uncertain result retains ledger and never auto-retries');
 await page.evaluate(()=>desktop.diaryConnect({classKey:'fixture',label:'6학년 1반',grade:'6',classroom:'1'}));
 await app.evaluate(async()=>{await worker.webContents.executeJavaScript("window.open('https://accounts.example.org/oauth/authorize');void 0");});await page.waitForTimeout(300);
 assert.equal((await visibility()).all,before.all+1);pass('explicit authentication may use HTTPS popup instead of blanket blocking it');
 await app.evaluate(()=>{globalThis.outcome='success';globalThis.events=[];});r=await publish(payload());v=await visibility();assert.equal(r.status,'success');const visibleChildren=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>/^https:/.test(w.webContents.getURL())).some(w=>w.isVisible()));assert.equal(visibleChildren,false);assert.ok(!v.events.some(e=>['show','focus'].includes(e.method)));pass('all interactive child windows hidden on background transition');
 await app.evaluate(()=>{globalThis.events=[];});const session=await page.evaluate(()=>desktop.diarySession('fixture'));assert.equal(session.status,'expired');assert.ok(!(await visibility()).events.some(e=>['show','focus'].includes(e.method)));pass('real session inspection recognizes login form without showing a window');

 await app.evaluate(()=>{
  adapter.prepare=originalPrepare;adapter.submit=originalSubmit;globalThis.events=[];
  globalThis.publishHTML=`<!doctype html><meta charset="utf-8"><strong>옥구초등학교 6학년 1반</strong><button id="compose">게시글 쓰기</button><div id="editor" role="dialog" hidden><textarea placeholder="제목을 입력하세요."></textarea><div class="fr-element fr-view" contenteditable="true"></div><div role="checkbox" aria-checked="true" onclick="this.setAttribute('aria-checked',this.getAttribute('aria-checked')==='true'?'false':'true')">학부모</div><div role="checkbox" aria-checked="false" onclick="this.setAttribute('aria-checked',this.getAttribute('aria-checked')==='true'?'false':'true')">학생</div><button id="register">등록</button></div><script>
  compose.onclick=()=>editor.hidden=false;
  register.onclick=()=>{const d=document.createElement('div');d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.innerHTML='<span>작성한 내용을 지금 클래스 구성원들에게 보내시겠습니까?</span><button id="confirm">확인</button><button id="cancel">취소</button>';document.body.append(d);d.querySelector('#cancel').onclick=()=>d.remove();d.querySelector('#confirm').onclick=()=>{const a=document.createElement('article'),title=document.createElement('strong');title.textContent=editor.querySelector('textarea').value;a.append(title,document.createTextNode(editor.querySelector('.fr-element').innerText));a.id='new-note';document.body.append(a);editor.remove();d.remove();};};
  </script>`;
 });
 p=payload();r=await publish(p);v=await visibility();assert.equal(r.status,'success',r.message);assert.equal(v.visible,false);assert.ok(!v.events.some(e=>['show','focus'].includes(e.method)));assert.equal(await app.evaluate(()=>worker.isFocusable()),false);pass('real adapter fills hidden non-focusable editor, verifies recipients/confirmation/article, and records success on fixture only');
 console.log(`${count}/${count} passed`);
}finally{if(app)await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
