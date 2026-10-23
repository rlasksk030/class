// Offline HTTPS protocol fixture only. Selectors below describe this fixture, NOT the live service.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{_electron}=require('playwright-core');
const ROOT=path.resolve(__dirname,'../..'),PROFILE=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'class-photo-submit-'));
let app,count=0;const pass=s=>{count++;console.log('PASS '+s);};
(async()=>{try{
 app=await _electron.launch({executablePath:require('electron'),args:[path.join(ROOT,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:PROFILE}});await (await app.firstWindow()).waitForLoadState('domcontentloaded');
 await app.evaluate(async({app,BrowserWindow,session,nativeImage},root)=>{
  const path=process.mainModule.require('node:path');globalThis.store=process.mainModule.require(path.join(root,'app/media.cjs')).current();globalThis.adapter=process.mainModule.require(path.join(root,'app/hiclass-adapter.cjs'));globalThis.photoFlow=process.mainModule.require(path.join(root,'app/hiclass-photos.cjs'));
  const refs=[];for(const n of [80,150]){const b=Buffer.alloc(12*6*4,n);refs.push(await store.add(nativeImage.createFromBitmap(b,{width:12,height:6}).toPNG(),'fixture.png'));}
  globalThis.payload={classKey:'offline',date:'2026-10-23',title:'fixture title',body:'fixture body',parents:true,students:false,photos:refs};globalThis.link={url:'https://classroom-photo-test.invalid/main/clazzes/fixture/note/fixture',title:'옥구초등학교 6학년 1반'};
  const s=session.fromPartition('photo-offline');s.protocol.handle('https',()=>new Response(globalThis.fixtureHTML,{headers:{'content-type':'text/html;charset=utf-8'}}));globalThis.w=new BrowserWindow({show:false,webPreferences:{session:s,contextIsolation:true,sandbox:true}});
  w.webContents.debugger.attach('1.3');globalThis.mediaDir=path.join(app.getPath('userData'),'media');
 },ROOT);
 async function run(config={}){return app.evaluate(async(_,config)=>{
  const path=process.mainModule.require('node:path');
  globalThis.fixtureHTML=`<!doctype html><meta charset="utf-8"><strong>${link.title}</strong><button id="write">게시글 쓰기</button><div role="dialog" id="editor" hidden><textarea placeholder="제목을 입력하세요."></textarea><div class="fr-element fr-view" contenteditable="true"></div><label><input id="parents" type="checkbox" checked>학부모</label><label><input id="students" type="checkbox">학생</label><input type="file" id="photo"><div id="attachments"></div><button id="register">등록</button></div><script>
  const config=${JSON.stringify(config)};window.uploads=[];window.finalClicks=0;window.registerClicks=0;window.failed=false;
  write.onclick=()=>editor.hidden=false;
  photo.onchange=async()=>{const file=photo.files[0];const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());const id=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')+'.png';if(config.partial&&uploads.length===1){window.failed=true;return;}uploads.push(id);const img=document.createElement('img');img.src=URL.createObjectURL(file);img.dataset.contentId=id;attachments.append(img);};
  register.onclick=()=>{window.registerClicks++;if(config.changed)attachments.lastChild.remove();const wrap=document.createElement('div');wrap.setAttribute('role','dialog');wrap.setAttribute('aria-modal','true');wrap.innerHTML='<p>작성한 내용을 지금 클래스 구성원들에게 보내시겠습니까?</p><button id="cancel">취소</button><button id="confirm">확인</button>';document.body.append(wrap);wrap.querySelector('#cancel').onclick=()=>wrap.remove();wrap.querySelector('#confirm').onclick=()=>{window.finalClicks++;const a=document.createElement('article');a.id='new-post';const strong=document.createElement('strong');strong.textContent=document.querySelector('textarea').value;a.append(strong,document.createTextNode(document.querySelector('.fr-element').innerText));for(const img of [...attachments.children].slice(0,config.missing?1:undefined))a.append(img.cloneNode(true));document.body.append(a);editor.remove();wrap.remove();};};
  </script>`;
  const query=code=>w.webContents.executeJavaScript(code);
  const driver={
   upload:async(ref,index)=>{
    const {root}=await w.webContents.debugger.sendCommand('DOM.getDocument');const {nodeId}=await w.webContents.debugger.sendCommand('DOM.querySelector',{nodeId:root.nodeId,selector:'#photo'});await w.webContents.debugger.sendCommand('DOM.setFileInputFiles',{nodeId,files:[path.join(mediaDir,ref.id)]});
    for(let i=0;i<60;i++){const state=await query('({uploads:window.uploads,failed:window.failed,ready:[...document.querySelectorAll("#attachments img")].filter(i=>i.complete&&i.naturalWidth>0).length})');if(state.failed)return {complete:false};if(state.uploads.length>index&&state.ready>index)return {contentId:state.uploads[index],remoteId:'offline-'+index,complete:true};await new Promise(r=>setTimeout(r,25));}throw Error('offline upload timeout');
   },
   editor:()=>query('[...document.querySelectorAll("#attachments img")].filter(i=>i.complete&&i.naturalWidth>0).map(i=>i.dataset.contentId)'),
   published:()=>query('[...document.querySelectorAll("article#new-post img")].filter(i=>i.complete&&i.naturalWidth>0).map(i=>i.dataset.contentId)')
  };
  let result;try{const before=await adapter.prepare(w,link,payload,{attachmentDriver:driver});const status=await adapter.submit(w,payload,before,link,{popupTimeout:1000,resultTimeout:1000});result={status};}catch(e){result={error:e.message,safeToRetry:e.safeToRetry};}
  return {...result,finalClicks:await query('window.finalClicks'),registerClicks:await query('window.registerClicks')};
 },config);}
 let r=await run();assert.equal(r.status,'success',JSON.stringify(r));assert.equal(r.finalClicks,1);pass('offline full adapter: real file inputs + upload receipt + ordered editor photos + body + confirmed article photos');
 r=await run({partial:true});assert.ok(r.error);assert.equal(r.finalClicks,0);assert.equal(r.registerClicks,0);pass('partial photo upload stops before register, never body-only publication');
 r=await run({changed:true});assert.ok(r.error);assert.equal(r.finalClicks,0);assert.equal(r.safeToRetry,true);pass('photo removed after popup blocks final confirmation and proves cancellation');
 r=await run({missing:true});assert.ok(r.error);assert.equal(r.finalClicks,1);assert.equal(r.safeToRetry,false);pass('published body without every photo is uncertain, never success or automatic retry');
 console.log(`${count}/${count} passed`);
}finally{if(app)await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
