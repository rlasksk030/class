const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {watch,describe,load}=require('./schoolbell-window.cjs');
const {HOME}=require('./diary-services.cjs');
function fixture(){
 const wc=new EventEmitter();let url='about:blank',loading=false;
 wc.getURL=()=>url;wc.isLoadingMainFrame=()=>loading;wc.stop=()=>{loading=false;};
 const w={webContents:wc,isDestroyed:()=>false,async loadURL(to){url=to;wc.emit('did-start-navigation',{},to,false,true);wc.emit('did-finish-load');}};
 return {w,wc,change(to,busy=false){url=to;loading=busy;},watched:watch(w)};
}
test('permitted scripted login redirect is not misreported as a network failure',async()=>{
 const f=fixture();f.w.loadURL=async()=>{
  f.change('https://v4.schoolbell-e.com/ko/gate/login?return_uri='+encodeURIComponent(HOME));
  f.wc.emit('did-finish-load');throw Object.assign(Error('aborted'),{code:'ERR_ABORTED'});
 };
 await load(f.w,HOME);assert.equal(describe(f.w).state,'login-required');assert.equal(f.w.schoolbellLoadFailed,false);
});
test('SPA class navigation does not leave the connection status stuck loading',()=>{
 const f=fixture();f.change('https://schoolbell-e.com/ko/main/group/123/boards/classnews');
 f.wc.emit('did-start-navigation',{},f.wc.getURL(),true,true);
 assert.equal(describe(f.w).state,'class-page-open');
});
test('network failure, denied redirect and timeout report safe causes; deliberate retry recovers',async()=>{
 const f=fixture(),success=f.w.loadURL;
 f.w.loadURL=async()=>{throw Error('private URL and secret must not escape');};
 await assert.rejects(load(f.w,HOME),e=>!e.schoolbellUserMessage.includes('secret')&&/서버/.test(e.schoolbellUserMessage));
 f.w.loadURL=async()=>{f.watched.block('http://schoolbell-e.com/en/main?secret=value');throw Error('aborted');};
 await assert.rejects(load(f.w,HOME),e=>/허용되지/.test(e.schoolbellUserMessage)&&!e.schoolbellUserMessage.includes('secret'));
 f.w.loadURL=()=>new Promise(()=>{});await assert.rejects(load(f.w,HOME,5),e=>/시간이 초과/.test(e.schoolbellUserMessage));
 f.w.loadURL=success;await load(f.w,HOME);assert.equal(describe(f.w).state,'page-open');
 f.change('https://schoolbell-e.com/ko/main/group/123/boards/classnews');assert.equal(describe(f.w).state,'class-page-open');
 assert.doesNotMatch(JSON.stringify(describe(f.w)),/123|authenticated|verified/);
});
