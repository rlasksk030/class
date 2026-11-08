// LOCAL SYNTHETIC WEBSITE ONLY. No real Schoolbell selectors, accounts, APIs or posting.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {_electron}=require('playwright-core'),services=require('../../app/diary-services.cjs'),{createPublisher}=require('../../app/schoolbell-publish.cjs');
const ROOT=path.resolve(__dirname,'../..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'schoolbell-auto-e2e-'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');let app,remote,count=0,posts=[],mode='normal',requests=0;
const pass=s=>{count++;console.log('PASS '+s);};
const pageHTML=`<!doctype html><meta charset="utf-8"><h1>Local synthetic classroom</h1>
<button id="login">Synthetic teacher login</button><select id="class"><option>2026:6:1</option><option>2026:6:2</option></select><button id="write">Write</button>
<form hidden><input id="date" type="date"><input id="title"><textarea id="body"></textarea><input id="photos" type="file" multiple><button id="publish" type="button">Publish to local fixture</button></form><section id="posts"></section>
<script>
document.documentElement.dataset.auth='false';
document.querySelector('#login').onclick=()=>document.documentElement.dataset.auth='true';
document.querySelector('#write').onclick=()=>document.querySelector('form').hidden=false;
const readFiles=()=>Promise.all([...document.querySelector('#photos').files].map(async f=>({bytes:[...new Uint8Array(await f.arrayBuffer())]})));
window.readFiles=readFiles;
document.querySelector('#publish').onclick=async()=>{
 const q=id=>document.querySelector('#'+id).value;
 await fetch('/posts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:q('title'),body:q('body'),date:q('date'),classKey:q('class'),photos:await readFiles()})});
 document.querySelector('form').hidden=true;
};
fetch('/posts').then(r=>r.json()).then(items=>{for(const item of items){const p=document.createElement('article');p.textContent=JSON.stringify(item);document.querySelector('#posts').append(p);}document.documentElement.dataset.loaded='true';});
</script>`;
const server=http.createServer(async(req,res)=>{
 if(req.url==='/posts'&&req.method==='POST'){
  let data='';for await(const b of req)data+=b;const post=JSON.parse(data);requests++;
  if(mode==='partial')post.photos.pop();posts.push({...post,id:'local-'+requests});
  res.writeHead(200,{'content-type':'application/json'});res.end('{}');
 }else if(req.url==='/posts'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(posts));}
 else{res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(pageHTML);}
});
(async()=>{try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/';
 app=await _electron.launch({executablePath:require('electron'),args:['--no-sandbox',path.join(ROOT,'app')],env:{...process.env,CLASSROOM_TEST_PROFILE:path.join(dir,'app')}});
 await (await app.firstWindow()).waitForLoadState('domcontentloaded');
 const next=app.waitForEvent('window');
 await app.evaluate(({BrowserWindow},url)=>{
  const w=new BrowserWindow({show:false,webPreferences:{partition:'synthetic-schoolbell-auto',sandbox:true,contextIsolation:true,nodeIntegration:false}});
  w.webContents.session.webRequest.onBeforeRequest((details,done)=>done({cancel:!details.url.startsWith(url)}));
  return w.loadURL(url);
 },url);remote=await next;
 await remote.waitForFunction(()=>document.documentElement.dataset.loaded==='true');
 await remote.click('#login');
 const bytes=await app.evaluate(({nativeImage})=>[1,2].map(n=>[...nativeImage.createFromBitmap(Buffer.from([n*60,100,150,255]),{width:1,height:1}).toPNG()]));
 const originals=bytes.map(b=>Buffer.from(b)),profile={id:'SYNTHETIC-SCHOOL',dir},store=services.createStore(profile);
 const note={classKey:'2026:6:1',date:'2026-11-07',title:'합성 제목 😊',body:'첫 번째 줄\n\n두 번째 줄  공백',photos:originals.map(b=>({id:hash(b)+'.png'}))};
 store.select(note.classKey,'schoolbell');
 const identity=async()=>({service:'schoolbell',schoolId:profile.id,classKey:await remote.inputValue('#class'),boardId:'synthetic-diary',scopeType:'class',board:'diary',authenticated:await remote.evaluate(()=>document.documentElement.dataset.auth==='true'),teacher:true});
 const summarize=photos=>photos.map(p=>({sha256:hash(Buffer.from(p.bytes)),bytes:p.bytes.length}));
 const driver={
  inspect:identity,
  async snapshot({note}){const all=await remote.locator('article').allTextContents();const rows=all.map(JSON.parse);return {ids:rows.map(p=>p.id),matching:rows.filter(p=>p.title===note.title&&p.body===note.body).length};},
  async openComposer(){assert.equal(Object.values(store.get(note.classKey).automaticPosts).at(-1).status,'auto-pending');await remote.click('#write');},
  async fill(input){await remote.fill('#title',input.title);await remote.fill('#body',input.body);await remote.fill('#date',input.date);},
  async attach(files){await remote.locator('#photos').setInputFiles(files.map((f,i)=>({name:(i+1)+'.png',mimeType:'image/png',buffer:f.bytes})));},
  async readComposer(){return {title:await remote.inputValue('#title'),body:await remote.inputValue('#body'),date:await remote.inputValue('#date'),photos:summarize(await remote.evaluate(()=>window.readFiles()))};},
  async submit(expected,signal){
   assert.equal(signal.aborted,false);assert.equal((await identity()).classKey,expected.scope.classKey);
   const current=await this.readComposer();assert.equal(current.title,expected.note.title);assert.equal(current.body,expected.note.body);assert.deepEqual(current.photos,expected.photos);
   await remote.click('#publish');await remote.waitForFunction(()=>document.querySelector('form').hidden);
  },
  async readPublished(){
   await remote.reload();await remote.waitForFunction(()=>document.documentElement.dataset.loaded==='true');await remote.click('#login');
   const row=JSON.parse(await remote.locator('article').last().textContent());
   return {...row,kind:'published',refreshed:true,scope:await identity(),photos:summarize(row.photos)};
  },
  async close(){return true;}
 };
 const publisher=createPublisher({profile,store,driver,readPhoto:ref=>originals[note.photos.findIndex(p=>p.id===ref.id)],review:({scope,note})=>scope.classKey===note.classKey,gate:()=>({enabled:true}),timeoutMs:10000});
 const snapshot=JSON.stringify(note),one={...note,photos:note.photos.slice(0,1)};
 const none={...note,title:'합성 사진 없음',photos:[]};
 assert.equal((await publisher.publish(none)).status,'success');assert.equal(posts[0].photos.length,0);
 assert.equal(posts[0].body,note.body);pass('no-photo synthetic post is reloaded and verified before success');
 assert.equal((await publisher.publish(one)).status,'success');assert.equal(posts[1].photos.length,1);
 assert.deepEqual(Buffer.from(posts[1].photos[0].bytes),originals[0]);pass('synthetic UI fills title/body and uploads one original photo, then verifies newly reloaded result');
 const several={...note,title:'합성 여러 사진'};assert.equal((await publisher.publish(several)).status,'success');
 assert.equal(posts[2].title,several.title);assert.equal(posts[2].body,several.body);assert.deepEqual(posts[2].photos.map(p=>Buffer.from(p.bytes)),originals);pass('multiple real file-input attachments preserve byte content, order, Unicode and line breaks');
 assert.equal((await publisher.publish(several)).status,'blocked');assert.equal(requests,3);pass('existing publication blocks duplicate submit');
 await remote.selectOption('#class','2026:6:2');assert.equal((await publisher.publish({...note,title:'wrong class'})).status,'blocked');assert.equal(requests,3);pass('different visible class blocks input and submit');
 await remote.selectOption('#class','2026:6:1');mode='partial';
 assert.equal((await publisher.publish({...note,title:'partial result'})).status,'uncertain');assert.equal(requests,4);
 assert.equal(JSON.stringify(note),snapshot);assert.equal((await publisher.publish({...note,title:'edited after uncertain'})).status,'blocked');assert.equal(requests,4);
 pass('partial persisted photo result is uncertain, keeps draft and blocks changed-content retry');
 const restarted=services.createStore(profile);assert.equal(Object.values(restarted.get(note.classKey).automaticPosts).at(-1).status,'auto-uncertain');pass('disk-backed unresolved attempt survives coordinator restart');
 console.log(count+'/'+count+' passed (synthetic website only)');
}finally{
 // This suite verifies posting, not app shutdown. Terminate its own disposable fixture process
 // instead of waiting on a hidden-window beforeunload/inspector shutdown handshake.
 if(app){const child=app.process();if(child.exitCode===null&&child.signalCode===null){
  const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGKILL');await exited;
 }}
 server.closeAllConnections();server.close();
}})().catch(e=>{console.error(e);process.exitCode=1;});
