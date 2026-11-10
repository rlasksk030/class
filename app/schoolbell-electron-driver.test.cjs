const {test}=require('node:test'),assert=require('node:assert/strict');
const {createRuntimeDriver,createElectronDriver,requirePermission}=require('./schoolbell-electron-driver.cjs');
const {encodeFiles}=require('./schoolbell-observed-composer.cjs');
const {hash}=require('./media-store.cjs');
const target={schoolId:'SYNTHETIC',schoolName:'합성 학교',year:'2026',grade:'6',classroom:'1',classKey:'2026:6:1'};
const grant={official:true,method:'electron-ui',evidenceRef:'SYNTHETIC-ONLY',schoolId:target.schoolId,classKey:target.classKey,approvedTestClass:true,actions:['read','input','attachments','submit']};
test('runtime denies before opening a window without a code-owned official grant',async()=>{
 let opened=0;const driver=createRuntimeDriver({profile:{id:target.schoolId,config:{active:{school:{SCHUL_NM:target.schoolName}}}},openClass:()=>opened++});
 await assert.rejects(()=>driver.inspect({schoolId:target.schoolId,classKey:target.classKey}),e=>e.code==='permission-unverified');
 assert.equal(opened,0);assert.equal(await driver.close(),true);
});
test('an official grant does not substitute for UI identity evidence',async()=>{
 let touched=0;const driver=createElectronDriver({target,permission:()=>grant,getWebContents:()=>{touched++;}});
 await assert.rejects(()=>driver.inspect({schoolId:target.schoolId,classKey:target.classKey}),e=>e.code==='context-unverified');
 assert.equal(touched,0);assert.equal(await driver.close(),true);
});
test('permission is tied to method, target, approved test class and requested action',()=>{
 for(const change of [{official:false},{method:'api'},{classKey:'2026:6:2'},{schoolId:'OTHER'},{approvedTestClass:false},{actions:['read']},{evidenceRef:''}])
  assert.throws(()=>requirePermission(()=>({...grant,...change}),target,'submit'),e=>e.code==='permission-unverified');
 assert.doesNotThrow(()=>requirePermission(()=>grant,target,'submit'));
});
test('file transport rejects paths, hash mismatch, malformed bytes and limits before DOM access',()=>{
 const b=Buffer.from('not an image'),id=hash(b)+'.png';
 for(const files of [[],new Array(21).fill({id,bytes:b}),[{id:'../secret.png',bytes:b}],[{id:'0'.repeat(64)+'.png',bytes:b}],[{id,bytes:b}]])
  assert.throws(()=>encodeFiles(files));
});

test('cancellation during window opening closes the pending class window',async()=>{
 let release,closed=0;const abort=new AbortController();
 const driver=createRuntimeDriver({profile:{id:target.schoolId,config:{active:{school:{SCHUL_NM:target.schoolName}}}},permission:()=>grant,
  openClass:()=>new Promise(r=>{release=r;}),closeClass:()=>{closed++;return true;}});
 const pending=driver.inspect({schoolId:target.schoolId,classKey:target.classKey},abort.signal);abort.abort();
 assert.equal(await driver.close(),true);release({});await assert.rejects(()=>pending,e=>e.code==='driver-state');assert.ok(closed>=1);
});

test('same-URL navigation invalidates an in-flight identity read and releases session listeners',async()=>{
 const wc=new (require('node:events').EventEmitter)();wc.getURL=()=> 'https://schoolbell-e.com/ko/main/group/100/boards/classnews';wc.isDestroyed=()=>false;
 let release;
 const driver=createElectronDriver({target,permission:()=>grant,getWebContents:()=>wc,evidence:{readContext:()=>new Promise(r=>release=r)}});
 const pending=driver.inspect({schoolId:target.schoolId,classKey:target.classKey});
 wc.emit('did-start-navigation',{},wc.getURL(),false,true);release({});
 await assert.rejects(()=>pending,e=>e.code==='context-unverified');
 assert.equal(await driver.close(),true);assert.equal(wc.listenerCount('did-start-navigation'),0);assert.equal(wc.listenerCount('destroyed'),0);
});
