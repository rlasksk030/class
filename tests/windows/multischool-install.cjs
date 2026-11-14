// Run on a disposable Windows account: node multischool-install.cjs <fixtures> <fresh|update|installer>.
// Each mode needs its own clean installer registration or a matching disposable install directory.
// The update case serves the unpublished candidate on loopback.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process'),{_electron}=require('playwright-core');
assert.equal(process.platform,'win32');assert.equal(process.env.CLASSROOM_DISPOSABLE_VM,'yes');
const input=path.resolve(process.argv[2]),root=fs.mkdtempSync(path.join(process.env.TEMP,'class188-')),profile=path.join(root,'profile');
const install=process.env.CLASSROOM_QA_EXISTING_FIXTURE||path.join(root,'app');
if(!path.resolve(install).startsWith(path.join(process.env.TEMP,'class188-'))||path.basename(install)!=='app')throw Error('Unexpected installation fixture path');
// The build writes nationwide2.yml; the v1.8.7 client below reads the same release in the file-name form.
const feed=fs.readFileSync(path.join(input,'nationwide2.yml'),'utf8'),legacyFeed=require('../../scripts/make-nationwide-feeds.cjs').makeFeeds(feed).legacy;
const version=/^version: (\d+\.\d+\.\d+)\s*$/m.exec(feed)[1];
const exe=path.join(install,'우리 교실.exe'),old=path.join(input,'previous.exe'),candidate=`classroom-dashboard-nationwide-setup-${version}-x64.exe`;
const log=[],pass=s=>{log.push(s);console.log('PASS '+s);},sleep=ms=>new Promise(r=>setTimeout(r,ms));
let proc,server;
async function launch(){
 proc=await _electron.launch({executablePath:exe,args:['--no-sandbox','--disable-gpu'],env:{...process.env,CLASSROOM_TEST_PROFILE:profile},timeout:90000});
 const page=await proc.firstWindow();await page.waitForLoadState('domcontentloaded');return page;
}
const installFile=file=>execFileSync(file,['/S','/currentuser','/D='+install],{timeout:180000,windowsHide:true});
const mode=process.argv[3]||'update';
assert.ok(['fresh','update','installer'].includes(mode),'choose fresh, update or installer');
async function main(){
 assert.equal(require('crypto').createHash('sha256').update(fs.readFileSync(old)).digest('hex'),'ffbcd03caf69a63f0b77f0dca164f34b05607dfa568a97ccd7ee33dfe1b81741');
 if(mode==='fresh')return fresh();
 await verifyUpgrade();
}
async function fresh(){
 assert.ok(!fs.existsSync(exe)&&!fs.existsSync(profile),'fresh case requires a new installation directory and user profile');
 installFile(path.join(input,candidate));
 let page=await launch();
 assert.equal(await proc.evaluate(({app})=>app.getVersion()),version);
 assert.ok(await page.locator('#neisGuide[open]').isVisible());assert.equal(await page.locator('#grade').isDisabled(),true);
 pass('fresh x64 NSIS installation opens the first-school wizard');
 // Exercise the encrypted credential and real IPC with a synthetic authenticated response.
 await proc.evaluate(()=>{const previous=globalThis.fetch;globalThis.fetch=async(url,options)=>new URL(url).hostname==='open.neis.go.kr'?new Response(JSON.stringify({schoolInfo:[{row:[{SD_SCHUL_CODE:'8342104'}]}]})):previous(url,options);});
 await page.fill('#neisKey','synthetic-qa-key');await page.click('#neisTest');await page.waitForFunction(()=>document.querySelector('#neisStatus').textContent.includes('연결 성공'));
 const secret=fs.readFileSync(path.join(profile,'neis-key.bin'));assert.ok(!secret.includes('synthetic-qa-key'));
 assert.equal(await page.inputValue('#neisKey'),'');
 assert.ok(!(await page.evaluate(()=>JSON.stringify(localStorage))).includes('synthetic-qa-key'));pass('Windows encrypts the synthetic credential and clears the form');
 await proc.close();proc=null;
}
async function verifyUpgrade(){
 installFile(old);let page=await launch();
 assert.equal(await proc.evaluate(({app})=>app.getVersion()),'1.8.7');
 const photo=await proc.evaluate(async({app,nativeImage,session})=>{
  const store=process.mainModule.require(process.mainModule.require('path').join(app.getAppPath(),'media.cjs')).current();
  const photo=await store.add(nativeImage.createFromBitmap(Buffer.alloc(32*32*4,125),{width:32,height:32}).toPNG(),'synthetic.png');
  const s=session.fromPartition('persist:hiclass-teacher');
  await s.cookies.set({url:'https://classroom.invalid',name:'synthetic',value:'session-marker',expirationDate:Date.now()/1000+86400});await s.cookies.flushStore();
  return photo;
 });
 await page.evaluate(photo=>{const set=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  set('settings',{grade:'6',classroom:'1'});set('classRosters',{'fixture':{students:[{id:'s1',name:'가상 학생'}]}});set('activityCompletion',{fixture:['s1']});set('diaryDrafts',{fixture:{body:'가상 초안',photos:[photo]}});
 },photo);
 fs.writeFileSync(path.join(profile,'hiclass-links.json'),JSON.stringify({links:{fixture:{title:'가상 학급'}},posts:{}}));
 if(process.env.CLASSROOM_QA_LOG){
  const installed=execFileSync('reg.exe',['query','HKCU\\Software\\d78eedc4-9833-5771-9f01-d94e51e1b797','/v','InstallLocation'],{encoding:'utf8'});
  fs.writeFileSync(process.env.CLASSROOM_QA_LOG,'baseline path '+install+'\n'+installed+'\n');
 }
 const before=await page.evaluate(()=>Object.fromEntries(['classRosters','activityCompletion','diaryDrafts'].map(k=>[k,localStorage.getItem(k)])));
 await proc.close();proc=null;
 if(mode==='installer'){
  installFile(path.join(input,candidate));pass('same-directory NSIS upgrade of the closed v1.8.7 installation');
 }else{
  await updateThroughApp();
 }
 page=await launch();assert.equal(await proc.evaluate(({app})=>app.getVersion()),version);
 const after=await page.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)])),Object.keys(before));assert.deepEqual(after,before);
 assert.deepEqual(await page.evaluate(()=>[settings.school.ATPT_OFCDC_SC_CODE,settings.school.SD_SCHUL_CODE,settings.grade,settings.classroom]),['P10','8342104','6','1']);
 assert.ok(fs.existsSync(path.join(profile,'migration-v187','media',photo.id)));assert.ok(fs.existsSync(path.join(profile,'media',photo.id)));
 assert.equal(await page.evaluate(async()=> (await desktop.diaryStatus('fixture')).linked),true);
 assert.equal(await proc.evaluate(async({session})=>(await session.fromPartition('persist:hiclass-teacher').cookies.get({name:'synthetic'}))[0]?.value),'session-marker');
 pass('migration keeps original class, roster, activity, draft, photo, link and login cookie and backs up old media');
}
async function updateThroughApp(){
 const page=await launch();
 server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1);
  if(!['latest.yml',candidate,candidate+'.blockmap'].includes(name)){res.writeHead(404).end();return;}
  // The official legacy client requests latest.yml on this isolated test server.
  if(name==='latest.yml'){res.writeHead(200,{'Content-Length':Buffer.byteLength(legacyFeed),'Content-Type':'application/octet-stream'});res.end(legacyFeed);return;}
  const file=path.join(input,name);res.writeHead(200,{'Content-Length':fs.statSync(file).size,'Content-Type':'application/octet-stream'});fs.createReadStream(file).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const original=await proc.evaluate(({app,dialog},url)=>{
  const load=n=>process.mainModule.require(process.mainModule.require('path').join(app.getAppPath(),n));
  const up=load('updater-bundle.cjs'),cfg=load('update-config.json');if(up.autoDownload||up.autoInstallOnAppQuit)throw Error('manual update policy changed');
  up.setFeedURL({provider:'generic',url});dialog.showMessageBox=async()=>({response:0});return cfg;
 },'http://127.0.0.1:'+server.address().port+'/');
 assert.deepEqual(original,{provider:'github',owner:'rlasksk030',repo:'class'});
 await page.click('#settings');await page.locator('#settingsForm .open-update').click();await page.waitForSelector('#installUpdate:visible');
 await page.click('#checkUpdate');await page.waitForSelector('#installUpdate:visible');await page.click('#installUpdate');
 const until=Date.now()+300000;
 let healthy='';
 while(Date.now()<until){
  const recovery=path.join(profile,'update-recovery');
  for(const dir of fs.existsSync(recovery)?fs.readdirSync(recovery):[]){const errorFile=path.join(recovery,dir,'recovery.json.error.txt');
   if(fs.existsSync(errorFile))throw Error(fs.readFileSync(errorFile,'utf8'));
   const state=path.join(recovery,dir,'recovery.json');if(fs.existsSync(state)){let cfg;try{cfg=JSON.parse(fs.readFileSync(state,'utf8').replace(/^\uFEFF/,''));}catch{}if(cfg?.stage==='rolled-back')throw Error('Update rolled back. '+(cfg.error||'Inspect recovery.json'));}
   const file=path.join(recovery,dir,'healthy');if(fs.existsSync(file))healthy=fs.readFileSync(file,'utf8').trim();}
  if(healthy===version)break;await sleep(500);
 }
 assert.equal(healthy,version,'updated candidate wrote the expected health marker');
 pass('installed v1.8.7 manual updater downloaded the local candidate, installed it and relaunched the nationwide version');
 proc=null;
 // Close only the relaunch in this unique disposable install directory.
 execFileSync('powershell.exe',['-NoProfile','-Command',`Get-Process | Where-Object {$_.Path -eq '${exe.replaceAll("'","''")}'} | ForEach-Object {if($_.MainWindowHandle){$_.CloseMainWindow() | Out-Null}}`]);
 await sleep(2500);
}
main().catch(e=>{console.error(e);console.error('Evidence folder '+root);process.exitCode=1;}).finally(async()=>{if(proc)await proc.close().catch(()=>{});server?.close();console.log(log.length+' Windows checks completed');});
