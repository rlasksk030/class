'use strict';
// Only the new default final guard integration. Reuse the existing local DOM;
// do not run the previous suite or send requests to a real service.
const {app,BrowserWindow,session,nativeImage}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'schoolbell-final-integration-'));app.setPath('userData',dir);
app.commandLine.appendSwitch('disable-background-networking');
const {html:oldHTML}=require('./schoolbell-electron-fixture.cjs');
const {createElectronDriver}=require('../app/schoolbell-electron-driver.cjs');
const {createObservedComposerBridge}=require('../app/schoolbell-observed-composer.cjs');
const {createPublisher}=require('../app/schoolbell-publish.cjs');
const services=require('../app/diary-services.cjs'),media=require('../app/media-store.cjs');
const target={schoolId:'SYNTHETIC',schoolName:'합성 학교',year:'2026',grade:'6',classroom:'1',classKey:'2026:6:1'};
const binding={boardId:'100',contextId:'local-context',actorKey:'local-teacher'};
const scope={service:'schoolbell',schoolId:target.schoolId,classKey:target.classKey,boardId:'100',scopeType:'class',board:'diary',authenticated:true,teacher:true};
const origin='https://schoolbell-e.com',boardURL=origin+'/ko/main/group/100/boards/classnews',writeURL=origin+'/ko/main/group/100/boards/write/classnews';
const html=oldHTML.replace('<app-boards-write>','<app-boards-write><app-letter-simplified-target-text>합성 대상</app-letter-simplified-target-text><label><input type="radio" name="mode" id="now" checked>즉시발행하기</label><label><input type="radio" name="mode" id="later">예약발행하기</label>');
let win,clicks=0,posts=[],uploads=[],reviews=[];
async function wait(expression){for(let n=0;n<150;n++){if(await win.webContents.executeJavaScript(expression))return;await new Promise(r=>setTimeout(r,10));}throw Error('local fixture not ready');}
async function originals(){
 await wait('document.querySelector("main").dataset.uploadState==="complete"');
 const links=await win.webContents.executeJavaScript('[...document.querySelectorAll("#uploads a")].map(a=>a.href)');
 const items=[];for(const url of links){assert.equal(new URL(url).origin,origin);
  const response=await win.webContents.session.fetch(url);items.push({state:'complete',source:'original-download',bytes:Buffer.from(await response.arrayBuffer())});}
 return {complete:true,items};
}
app.whenReady().then(async()=>{
 const ses=session.fromPartition('schoolbell-final-integration-local-only');
 ses.protocol.handle('https',async request=>{
  const u=new URL(request.url);if(u.origin!==origin)return new Response('',{status:403});
  const json=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}});
  if(u.pathname==='/upload')return json((await request.json()).map(f=>{uploads.push(Buffer.from(f.bytes));return uploads.length-1;}));
  if(u.pathname.startsWith('/original/')||u.pathname.startsWith('/download/'))return new Response(uploads[Number(u.pathname.split('/').pop())],{headers:{'Content-Type':'image/png','Content-Disposition':'attachment; filename="local.png"'}});
  if(u.pathname==='/publish'){clicks++;posts.push({...await request.json(),id:String(200+clicks)});return json({});}
  if(u.pathname==='/posts')return json(posts);
  return new Response(html,{headers:{'Content-Type':'text/html;charset=utf-8'}});
 });
 ses.webRequest.onBeforeRequest((r,done)=>done({cancel:!r.url.startsWith(origin+'/')}));
 win=new BrowserWindow({show:false,webPreferences:{session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false}});
 const grant={official:true,method:'electron-ui',schoolId:target.schoolId,classKey:target.classKey,approvedTestClass:true,evidenceRef:'LOCAL-ONLY-NOT-SERVICE-PERMISSION',actions:['read','input','attachments','submit']};
 async function attempt(changeAudience,changeMode=false){
  await win.loadURL(writeURL);await wait('document.querySelector("main")?.dataset.ready==="yes"');
  const profile={id:target.schoolId,dir:path.join(dir,changeAudience?'blocked':changeMode?'mode-blocked':'verified')};fs.mkdirSync(profile.dir);
  const store=services.createStore(profile);store.select(target.classKey,'schoolbell');
  const images=media.createStore(profile.dir,b=>nativeImage.createFromBuffer(b).getSize());
  const png=nativeImage.createFromBitmap(Buffer.from([30,90,150,255]),{width:1,height:1}).toPNG();
  const ref=await images.add(png,'local.png');
  const note={classKey:target.classKey,date:'2026-11-08',title:changeAudience?'합성 변경 차단':'합성 최종 연결',body:'새 최종 검증 연결 확인',photos:[ref]};
  const evidence={finalAction:'single-send',publicationMode:'immediate',
   // These missing live identity/date facts are deliberately local test ports.
   // No custom guardDOM is supplied: use the production default proof + guard.
   readContext:async()=>({...target,...scope,...binding,identityVerified:true,authorityVerified:true,classApproved:true,testClassApproved:true,
    recipientsVerified:true,students:0,parents:0,externalNotifications:false,observedAt:Date.now(),
    recipientEvidence:{known:true,unfiltered:true,empty:true,mandatoryAdministrator:false,targetLabel:'합성 대상'}}),
   readDate:async()=>({verified:true,source:'observed-service-ui',meaning:'publication-mode',mode:'immediate',value:null,writable:false,scope:{...target,...binding},observedAt:Date.now()}),
   readBaseline:async()=>({complete:true,refreshed:true,ids:posts.map(p=>p.id),filter:{title:note.title},posts:[]}),
   readUploads:originals,
   async readPublishedMetadata(){await wait('document.querySelector("main").dataset.sent==="yes"');await win.loadURL(boardURL);await wait('document.querySelector("main")?.dataset.ready==="yes"');return {complete:true,refreshed:true,boardURL,id:posts.at(-1).id,date:'2026-11-09',dateSource:'observed-service-ui',scope};}
  };
  const driver=createElectronDriver({target,getWebContents:()=>win.webContents,permission:()=>grant,evidence,tempRoot:profile.dir});
  const publisher=createPublisher({profile,store,driver,readPhoto:r=>images.read(r),gate:()=>({enabled:true}),timeoutMs:8000,
   review:async r=>{reviews.push(r.phase);if(r.phase==='submit'){
    if(changeAudience)await win.webContents.executeJavaScript('document.querySelector("app-letter-simplified-target-text").textContent="다른 대상"');
    else if(changeMode)await win.webContents.executeJavaScript('document.querySelector("#later").checked=true');
    else await win.webContents.executeJavaScript('document.querySelector("app-boards-write").append(document.createElement("div"))');
   }return true;}});
  const result=await publisher.publish(note);return {result,store,profile,ref};
 }
 const blocked=await attempt(true);assert.equal(blocked.result.status,'uncertain');assert.equal(clicks,0);
 assert.equal(Object.values(blocked.store.get(target.classKey).automaticPosts)[0].status,'auto-uncertain');
 console.log('PASS final native DOM target change blocks send; durable uncertain receipt preserves the attempt');
 const modeBlocked=await attempt(false,true);assert.equal(modeBlocked.result.status,'uncertain');assert.equal(clicks,0);
 console.log('PASS atomic DOM guard rejects scheduled mode despite stale immediate evidence; sends zero times');
 const ok=await attempt(false);assert.equal(ok.result.status,'success',JSON.stringify(ok.result));assert.equal(clicks,1);
 assert.equal(ok.result.publication.photos[0].sha256,ok.ref.id.split('.')[0]);
 const reloaded=services.createStore(ok.profile).get(target.classKey).automaticPosts[ok.result.attemptId];
 assert.equal(reloaded.status,'auto-success');assert.equal(reloaded.publication.postId,posts[0].id);
 assert.equal(reloaded.publication.draftDate,'2026-11-08');assert.equal(reloaded.publication.publishedDate,'2026-11-09');
 assert.deepEqual(reviews,['prepare','submit','prepare','submit','prepare','submit']);
 console.log('PASS presentation-only DOM change preserves revision -> single local send -> original download -> distinct draft/server dates in durable receipt');
 const reader=createObservedComposerBridge({getWebContents:()=>win.webContents,authorize:()=>true});
 const before=await reader.readFields();await win.loadURL(boardURL);await wait('document.querySelector("main")?.dataset.ready==="yes"');
 const after=await reader.readFields();assert.notEqual(before.revision,after.revision);await reader.close();
 console.log('PASS same-URL document replacement changes the revision identity');
 console.log('4 focused native integration checks; live app publication and draft completion NOT RUN');
}).catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{if(win&&!win.isDestroyed())win.destroy();app.exit(process.exitCode||0);});
