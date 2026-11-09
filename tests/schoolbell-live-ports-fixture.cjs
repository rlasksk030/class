// Focused native test of newly connected UI ports. No publication, real login,
// external requests or old A/B/C transaction replay.
const {app,BrowserWindow,session,nativeImage}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {createLivePostProvider}=require('../app/schoolbell-live-posts.cjs');
const {createPreviewOriginals}=require('../app/schoolbell-preview-originals.cjs');
const {openObservedComposer}=require('../app/schoolbell-composer-entry.cjs');
const {hash}=require('../app/media-store.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'schoolbell-live-ports-'));app.setPath('userData',dir);
const board='https://schoolbell-e.com/ko/main/group/100/boards/classnews',title='합성 대상';
let owner;const windows=[];
const makeWindow=ses=>{const w=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false}});windows.push(w);return w;};
app.whenReady().then(async()=>{
 const original=n=>nativeImage.createFromBitmap(Buffer.from([n,40,80,255]),{width:1,height:1}).toPNG();
 const photos=[original(20),original(80)],names=['01-fixture.png','02-fixture.png'];
 const rows=[{id:'200',title,body:'본문',photo:0},{id:'201',title,body:'본문',photo:1},{id:'202',title:'다른 제목',body:'읽을 필요 없는 합성 본문',photo:0}];
 const html=`<!doctype html><meta charset="utf-8"><style>.document-wrapper{height:200px;overflow:auto}virtual-scroller{display:block;overflow:visible}app-letter-item-long{display:block;min-height:280px}app-mobile-preview{position:fixed;inset:10px;background:white}iframe{width:700px;height:500px}</style>
 <input placeholder="검색"><div class="document-wrapper"><app-boards-write><button id="preview">미리보기</button><app-letter-write-file-list>${names.map(n=>`<app-file-row><app-file-name-text><span class="text-truncate">${n.slice(0,-4)}</span><span class="flex-shrink-0">.png</span></app-file-name-text></app-file-row>`).join('')}</app-letter-write-file-list></app-boards-write>
 <app-group-board><virtual-scroller><div class="scrollable-content"><div class="letter-list-container">${rows.map(r=>`<div class="notification-post" data-letter-id="${r.id}"><app-letter-item-long><app-translation-viewer>${r.title}</app-translation-viewer><p class="text-muted small mb-1"><span class="mat-mdc-tooltip-trigger" aria-describedby="date-${r.id}">발행</span></p><app-text-viewer><div class="fr-view">${r.body}</div></app-text-viewer><app-media-browser></app-media-browser><app-letter-filelist><div class="file-item" data-file="${r.photo}"><span class="text-truncate">fixture</span><span class="text-nowrap">.png</span></div></app-letter-filelist></app-letter-item-long></div><div id="date-${r.id}" hidden>2026. 11. 9. PM 2:49:20</div>`).join('')}</div><app-infinite-list-info><p>더이상 글이 없습니다.</p></app-infinite-list-info></div></virtual-scroller></app-group-board></div>
 <script>document.querySelectorAll('.file-item').forEach(e=>e.onclick=()=>{const a=document.createElement('a');a.href='/download/'+e.dataset.file;a.click();});document.querySelector('#preview').onclick=()=>{const p=document.createElement('app-mobile-preview');const f=document.createElement('iframe');f.src='https://v5.schoolbell-e.com/preview';p.append(f);document.body.append(p);};document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelector('app-mobile-preview')?.remove();});</script>`;
 const preview=`<!doctype html><app-group-board-letter-detail-preview><app-files-list>${names.map((n,i)=>`<ion-item class="file-item" data-file="${i}">${n} (1.00 KB)</ion-item>`).join('')}</app-files-list></app-group-board-letter-detail-preview><script>document.querySelectorAll('ion-item').forEach(e=>{const s=e.attachShadow({mode:'open'});const b=document.createElement('button');b.className='item-native';b.textContent=e.textContent;b.onclick=()=>{const a=document.createElement('a');a.href='/download/'+e.dataset.file;a.click();};s.append(b);});</script>`;
 const entryHTML=`<!doctype html><app-group-board><button>작성하기</button></app-group-board><script>document.querySelector('button').onclick=()=>{history.pushState({},'','/ko/main/group/101/boards/write/classnews');document.querySelector('app-group-board').replaceWith(document.createElement('app-boards-write'));};</script>`;
 const ses=session.fromPartition('schoolbell-new-ports-fixture');
 ses.protocol.handle('https',req=>{const u=new URL(req.url);if(!['schoolbell-e.com','v5.schoolbell-e.com'].includes(u.hostname))return new Response('',{status:403});
  if(u.pathname.startsWith('/download/'))return new Response(photos[Number(u.pathname.split('/').pop())],{headers:{'content-type':'image/png','content-disposition':'attachment; filename="fixture.png"'}});
  if(u.pathname.includes('/group/101/'))return new Response(entryHTML,{headers:{'content-type':'text/html;charset=utf-8'}});
  return new Response(u.hostname==='v5.schoolbell-e.com'?preview:html,{headers:{'content-type':'text/html;charset=utf-8'}});
 });
 ses.webRequest.onBeforeRequest((d,done)=>done({cancel:!['schoolbell-e.com','v5.schoolbell-e.com'].includes(new URL(d.url).hostname)}));
 owner=makeWindow(ses);await owner.loadURL(board);
 const target={schoolId:'fixture-school',classKey:'2026:6:1'};
 const provider=createLivePostProvider({getWebContents:()=>owner.webContents,createReader:makeWindow,target,tempRoot:dir,timeoutMs:6000});
 const baseline=await provider.readBaseline({note:{title},stillPermitted:()=>true});
 assert.equal(baseline.complete,true);assert.deepEqual(baseline.ids,['200','201','202']);assert.equal(baseline.posts.length,2);
 assert.equal(hash(baseline.posts[0].attachments.items[0].bytes),hash(photos[0]));assert.equal(hash(baseline.posts[1].attachments.items[0].bytes),hash(photos[1]));assert.equal(owner.webContents.getURL(),board);
 console.log('PASS new baseline port walks to observed end, retains every ID, reads only title candidates and compares independent original bytes');
 assert.equal(provider.close(),true);
 await owner.loadURL(board.replace('/100/','/101/'));
 await assert.rejects(()=>openObservedComposer(owner.webContents,{groupId:'100',allowed:()=>true}),/context-unverified/);
 await openObservedComposer(owner.webContents,{groupId:'101',allowed:()=>true});
 assert.equal(new URL(owner.webContents.getURL()).pathname,'/ko/main/group/101/boards/write/classnews');
 await openObservedComposer(owner.webContents,{groupId:'101',allowed:()=>true});
 console.log('PASS observed class-list entry opens once, preserves an existing composer and rejects a different class');
 await owner.loadURL(board);
 const uploads=createPreviewOriginals({getWebContents:()=>owner.webContents,tempRoot:dir,timeoutMs:3000});
 const expectedPhotos=photos.map(b=>({sha256:hash(b),bytes:b.length}));
 const proof=await uploads.readUploads({expectedNames:names,expectedPhotos,stillPermitted:()=>true});
 assert.deepEqual(proof.items.map(x=>hash(x.bytes)),photos.map(hash));
 console.log('PASS new prepublication port uses app-owned iframe file controls and checks both original hashes in order');
 await assert.rejects(()=>uploads.readUploads({expectedNames:names,expectedPhotos:[expectedPhotos[1],expectedPhotos[0]],stillPermitted:()=>true}),/upload-unverified/);
 assert.equal(fs.readdirSync(dir).some(n=>n.startsWith('schoolbell-upload-verify-')),false);
 console.log('PASS original mismatch blocks and cleans only verification files; no publication code invoked');
 uploads.close();
 console.log('4/4 focused native checks; actual app login and live original download NOT RUN');
}).catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const w of windows)if(!w.isDestroyed())w.destroy();app.exit(process.exitCode||0);});
