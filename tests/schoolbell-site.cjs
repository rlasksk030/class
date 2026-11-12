// Synthetic Schoolbell site for offline tests. It copies the structure observed on the real
// service (tests/validation/2026-11-12-schoolbell-autopost.md): Angular-style element names,
// the composer controls, the recipient dialog, the send dropdown and the board cards.
// It also reproduces three observed behaviours that matter to the app:
//  - a scripted click on 보내기 does nothing; only a trusted click sends;
//  - the recipient dialog and the loading cover are animated, so they finish only when the
//    page really produces frames;
//  - after sending, the page may land on schoolnews although the post is saved in classnews.
// No real network, account or student data is involved.
const html = String.raw`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>학교종이</title>
<style>
 body{font-family:sans-serif;margin:0}
 .ng-busy-backdrop{position:fixed;inset:0;background:rgba(255,255,255,.6);z-index:50}
 mat-dialog-container,.dialog{position:fixed;left:200px;top:120px;width:520px;background:#fff;border:1px solid #888;padding:16px;z-index:60;display:block}
 app-boards-write,app-group-board{display:block;padding:16px}
 .fr-element{min-height:120px;border:1px solid #ccc;padding:8px}
 [hidden]{display:none!important}
 input[placeholder]{display:block;width:400px;margin:8px 0}
</style></head><body><div id="app"></div>
<script>
(async()=>{
 const el=source=>{const t=document.createElement('template');t.innerHTML=source.trim();return t.content.firstElementChild;};
 const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const api=(path,body)=>fetch(path,body?{method:'POST',body:JSON.stringify(body)}:undefined).then(r=>r.json());
 const app=document.getElementById('app');
 const go=path=>{history.pushState({},'',path);render();};
 // Finishes only when the page really produces frames.
 const fade=(node,from,to,done)=>{node.style.opacity=from;const a=node.animate([{opacity:from},{opacity:to}],{duration:150});a.onfinish=()=>{node.style.opacity=to;done&&done();};};
 const NAMES={administrator:'관리자',guardian1:'보호자1',guardian2:'보호자2',student:'학생'};
 async function render(){
  const state=await api('/api/state'),config=state.config,path=location.pathname;let m;
  app.replaceChildren();document.querySelectorAll('mat-dialog-container,.dialog,.ng-busy-backdrop').forEach(n=>n.remove());
  if(/\/gate\/login$/.test(path)){
   app.append(el('<form id="login"><h1>로그인</h1><input type="password" id="pw"><button id="loginButton">로그인</button></form>'));
   document.getElementById('login').onsubmit=async e=>{e.preventDefault();await api('/api/login',{});location.href='https://schoolbell-e.com/ko/main';};
   return;
  }
  if(path==='/ko/main'){
   app.append(el(state.loggedIn?'<main><h1>내 학급</h1><a href="/ko/main/group/100/boards/classnews">6학년 1반</a></main>':
    '<main><h1>학교종이</h1><a id="toLogin" href="https://v4.schoolbell-e.com/ko/gate/login?return_uri=https://schoolbell-e.com/ko/main">로그인</a></main>'));
   return;
  }
  if(!state.loggedIn){location.href='https://v4.schoolbell-e.com/ko/gate/login?return_uri=https://schoolbell-e.com/ko/main';return;}
  if((m=path.match(/^\/ko\/main\/group\/(\d+)\/settings\/groupinfo$/))){
   const page=el('<app-settings-groupinfo><app-name-and-address><span class="group-type-icon class"></span><input placeholder="기관이름을 입력해주세요."></app-name-and-address></app-settings-groupinfo>');
   app.append(page);
   if(!config.noGroupName)setTimeout(()=>{page.querySelector('input').value=state.groupNames[m[1]]||'';},200);
   return;
  }
  if((m=path.match(/^\/ko\/main\/group\/(\d+)\/boards\/(classnews|schoolnews)(?:\/posts\/\d+)?$/))){
   const board=el('<app-group-board><input placeholder="검색"><button id="write">작성하기</button><virtual-scroller><div class="document-wrapper"></div></virtual-scroller></app-group-board>');
   if(config.noWriteButton)board.querySelector('#write').remove();
   const list=board.querySelector('.document-wrapper');
   for(const p of state.posts.filter(p=>p.groupId===m[1]&&m[2]==='classnews')){
    const files=p.files.map(name=>{const dot=name.lastIndexOf('.');return '<div class="file-item"><span class="text-truncate">'+esc(name.slice(0,dot))+'</span><span class="text-nowrap">'+esc(name.slice(dot))+'</span><span class="text-nowrap file-item-size">(1 KB)</span></div>';}).join('');
    list.append(el('<div class="notification-post"'+(config.noPostIds?'':' data-letter-id="'+p.id+'"')+'><app-letter-item-long><p class="text-muted small mb-1">관리자</p><app-translation-viewer>'+esc(p.title)+'</app-translation-viewer><app-text-viewer><div class="fr-view">'+p.html+'</div></app-text-viewer><app-letter-filelist><div class="d-flex align-items-center cursor-pointer"><span>첨부파일 ('+p.files.length+')</span></div>'+files+'</app-letter-filelist><app-media-browser></app-media-browser></app-letter-item-long></div>'));
   }
   list.append(el('<app-infinite-list-info><p>더이상 글이 없습니다.</p></app-infinite-list-info>'));
   app.append(board);
   const write=board.querySelector('#write');if(write)write.onclick=()=>go('/ko/main/group/'+m[1]+'/boards/write/classnews');
   return;
  }
  if((m=path.match(/^\/ko\/main\/group\/(\d+)\/boards\/write\/classnews$/))){
   const root=el('<app-boards-write>'+
    '<div><button id="change">변경</button><app-letter-simplified-target-text></app-letter-simplified-target-text></div>'+
    '<input placeholder="'+(config.changedStructure?'제목':'제목을 입력해 주세요.')+'">'+
    '<div class="fr-box"><div class="fr-element fr-view" contenteditable="true"><p><br></p></div></div>'+
    '<input type="file" multiple accept=".jpg,.jpeg,.png,.heic">'+
    '<app-letter-write-file-list></app-letter-write-file-list>'+
    '<button id="save">임시저장</button>'+
    '<div class="btn-group"><button id="send" class="btn-with-description" disabled>보내기 <small>즉시발행</small></button><button id="toggle" aria-label="드롭다운 토글">▾</button></div>'+
    '<app-mobile-preview style="display:none"></app-mobile-preview></app-boards-write>');
   app.append(root);
   const title=root.querySelector('input[placeholder]'),body=root.querySelector('.fr-element'),file=root.querySelector('input[type=file]');
   const fileList=root.querySelector('app-letter-write-file-list'),send=root.querySelector('#send'),label=root.querySelector('app-letter-simplified-target-text');
   const roles={administrator:true,guardian1:true,guardian2:true,student:config.studentOffByDefault?false:true},uploaded=[];
   const paintLabel=()=>{label.textContent=Object.keys(NAMES).filter(k=>roles[k]).map(k=>NAMES[k]).join(', ');};
   setTimeout(paintLabel,250);
   title.oninput=()=>{send.disabled=!title.value.trim();};
   if(config.existingDraft){title.value='작성 중이던 글';send.disabled=false;}
   // Loading cover: removed by an animation, as on the service.
   const cover=el('<div class="ng-busy-backdrop"></div>');document.body.append(cover);setTimeout(()=>fade(cover,1,0,()=>cover.remove()),300);
   if(config.restoreDialog)setTimeout(()=>{const d=el('<mat-dialog-container><p>임시저장된 글이 있습니다. 불러오시겠습니까?</p><button>취소</button><button>확인</button></mat-dialog-container>');document.body.append(d);fade(d,0,1);},350);
   file.onchange=async()=>{
    const picked=[...file.files],progress=el('<app-file-upload-list>업로드 중</app-file-upload-list>');root.append(progress);
    for(const f of picked){
     if(config.uploadFail){progress.remove();document.body.append(el('<mat-dialog-container><p>파일 업로드에 실패했습니다.</p><button>확인</button></mat-dialog-container>'));return;}
     const bytes=new Uint8Array(await f.arrayBuffer());let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
     const saved=await api('/api/upload',{name:f.name,base64:btoa(binary)});
     await new Promise(r=>setTimeout(r,120));
     uploaded.push({name:f.name,sha:saved.sha});
     const dot=f.name.lastIndexOf('.');
     fileList.append(el('<app-file-row><app-file-name-text><span class="text-truncate">'+esc(f.name.slice(0,dot))+'</span><span class="flex-shrink-0">'+esc(f.name.slice(dot))+'</span><span class="flex-shrink-0 small">(1 KB)</span></app-file-name-text></app-file-row>'));
    }
    progress.remove();
   };
   root.querySelector('#change').onclick=()=>{
    if(document.querySelector('mat-dialog-container'))return;
    const d=el('<mat-dialog-container><app-select-letter-targets><div>'+
     Object.keys(NAMES).map(k=>'<label><input type="checkbox" data-role="'+k+'"'+(roles[k]?' checked':'')+(k==='administrator'?' disabled':'')+'>'+NAMES[k]+'</label>').join('')+'</div>'+
     '<app-table-search><input placeholder="학생명 또는 전화번호"></app-table-search>'+
     '<table><thead><tr><th>번호</th><th>이름</th><th>보호자 휴대폰1</th><th>보호자 휴대폰2</th><th>학생 휴대폰</th></tr></thead><tbody><tr><td colspan="5">구성원이 없습니다.</td></tr></tbody></table>'+
     '<button id="closeTargets">닫기</button>'+(config.targetsApplyLive?'':'<button id="applyTargets">확인</button>')+'</app-select-letter-targets></mat-dialog-container>');
    document.body.append(d);fade(d,0,1);
    const chosen={...roles};
    d.querySelectorAll('input[type=checkbox]').forEach(c=>{c.onchange=()=>{chosen[c.dataset.role]=c.checked;if(config.targetsApplyLive){Object.assign(roles,chosen);paintLabel();}};});
    d.querySelector('#closeTargets').onclick=()=>fade(d,1,0,()=>d.remove());
    const apply=d.querySelector('#applyTargets');
    if(apply)apply.onclick=()=>{if(!config.targetsIgnored){Object.assign(roles,chosen);paintLabel();}fade(d,1,0,()=>d.remove());};
   };
   // Send dropdown. With modeOnlyWhenOpen the radios exist only while the menu is open.
   let mode=config.scheduledDefault?'later':'now';
   const menu=el('<div class="dropdown-menu"><label><input type="radio" name="mode" value="now">즉시발행하기</label><label><input type="radio" name="mode" value="later">예약발행하기</label></div>');
   const group=root.querySelector('.btn-group');
   const sync=()=>{menu.querySelectorAll('input').forEach(r=>{r.checked=r.value===mode;r.onchange=()=>{if(r.checked)mode=r.value;};});};
   sync();
   if(config.modeOnlyWhenOpen)root.querySelector('#toggle').onclick=()=>{if(menu.isConnected)menu.remove();else{group.append(menu);sync();}};
   else{menu.hidden=true;group.append(menu);root.querySelector('#toggle').onclick=()=>{menu.hidden=!menu.hidden;};}
   let sending=false;
   send.addEventListener('click',async e=>{
    await api('/api/click',{trusted:e.isTrusted});
    if(!e.isTrusted||sending)return;
    const proceed=async()=>{
     sending=true;
     await api('/api/publish',{groupId:m[1],title:title.value,html:body.innerHTML,files:uploaded,roles,mode});
     if(config.swallow)return;
     go('/ko/main/group/'+m[1]+'/boards/'+(config.landSchoolnews?'schoolnews':'classnews'));
    };
    if(config.confirm||config.unknownDialog){
     const d=el('<mat-dialog-container><p>'+(config.unknownDialog?'수신 대상이 없습니다.':'알림장을 보내시겠습니까?')+'</p><button id="no">취소</button><button id="yes">확인</button></mat-dialog-container>');
     document.body.append(d);fade(d,0,1);
     d.querySelector('#no').onclick=()=>d.remove();
     d.querySelector('#yes').addEventListener('click',async ev=>{await api('/api/click',{trusted:ev.isTrusted,dialog:true});if(!ev.isTrusted)return;d.remove();if(!config.unknownDialog)proceed();});
     return;
    }
    if(config.nativeConfirm&&!confirm('보내시겠습니까?'))return;
    proceed();
   });
   return;
  }
  app.append(el('<main><h1>학급페이지</h1></main>'));
 }
 window.addEventListener('popstate',render);
 render();
})();
</script></body></html>`;

// Runs in the Electron main process (app.evaluate). Serves the page above for every HTTPS request
// in every session and keeps the fake server state in globalThis.sb.
function install({app, session}, page) {
 const crypto = process.mainModule.require('node:crypto');
 const sb = globalThis.sb = {loggedIn: false, posts: [], config: {}, publishes: 0, scheduled: 0, clicks: [], requests: 0, lastPublish: null,
  groupNames: {'100': '6학년 1반', '200': '5학년 2반'}};
 const json = value => new Response(JSON.stringify(value), {headers: {'content-type': 'application/json'}});
 const handler = async request => {
  const u = new URL(request.url); sb.requests++;
  if (!['schoolbell-e.com', 'www.schoolbell-e.com', 'v4.schoolbell-e.com'].includes(u.hostname)) return new Response('blocked', {status: 403});
  if (sb.offline) throw Error('offline fixture');
  if (u.pathname === '/api/state') return json({loggedIn: sb.loggedIn, config: sb.config, posts: sb.posts, groupNames: sb.groupNames});
  if (u.pathname === '/api/login') { sb.loggedIn = true; return json({ok: true}); }
  if (u.pathname === '/api/click') { sb.clicks.push(await request.json()); return json({ok: true}); }
  if (u.pathname === '/api/upload') {
   const body = await request.json();
   return json({sha: crypto.createHash('sha256').update(Buffer.from(body.base64, 'base64')).digest('hex')});
  }
  if (u.pathname === '/api/publish') {
   const body = await request.json(); sb.publishes++; sb.lastPublish = body;
   if (body.mode !== 'now') { sb.scheduled++; return json({ok: true}); }
   if (!sb.config.postMissing) sb.posts.unshift({id: String(Math.max(600, ...sb.posts.map(p => Number(p.id))) + 1), groupId: body.groupId, title: body.title,
    html: sb.config.postAltered ? '<p>다른 내용</p>' : body.html, files: body.files.map(f => f.name), hashes: body.files.map(f => f.sha), roles: body.roles});
   return json({ok: true});
  }
  return new Response(page, {headers: {'content-type': 'text/html; charset=utf-8'}});
 };
 const hooked = new WeakSet(), hook = s => { if (hooked.has(s)) return; hooked.add(s); s.protocol.handle('https', handler); };
 hook(session.defaultSession); app.on('session-created', hook);
}
module.exports = {html, install};
