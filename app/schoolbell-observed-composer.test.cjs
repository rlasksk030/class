'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {createObservedComposerBridge,officialPage,compareCommit}=require('./schoolbell-observed-composer.cjs');
const URL='https://v4.schoolbell-e.com/ko/boards/write';
function fixture() {
 class Input {
   constructor(attrs={}){this.attrs=attrs;this._value='';this.textContent='';this.events=[];}
   get value(){return this._value;}
   set value(v){this._value=v;}
   getAttribute(k){return this.attrs[k]??null;}
   hasAttribute(k){return Object.hasOwn(this.attrs,k);}
   focus(){this.focused=true;}
   dispatchEvent(e){this.events.push(e.type);return true;}
 }
 class Box extends Input {
   constructor(attrs){super(attrs);this.innerText='';}
   get childNodes(){return [{nodeType:3,textContent:this.innerText}];}
   replaceChildren(){this.innerText='';}
 }
 const title=new Input({placeholder:'제목을 입력해 주세요.'}),
  body=new Box({contenteditable:'true'}),
  file=new Input({type:'file',multiple:'',accept:'.jpg,.jpeg,.png'}),
  send=new Input({class:'btn-with-description',disabled:''}),
  draft=new Input({});
 send.textContent='보내기';draft.textContent='임시저장';
 const table={
  'input[placeholder="제목을 입력해 주세요."]':[title],
  'div.fr-element.fr-view[contenteditable="true"]':[body],
  'input[type="file"]':[file],
  'button.btn-with-description':[send],
  'button':[send,draft]
 };
 const root={querySelectorAll:key=>table[key]||[]};
 root.addEventListener=()=>{};body.isContentEditable=true;
 const doc={querySelector:()=>null,querySelectorAll:key=>key==='app-boards-write'?[root]:[],
  getSelection:()=>({removeAllRanges(){},addRange(){}}),createRange:()=>({selectNodeContents(){}}),
  execCommand:(command,_ui,value)=>{body.innerText=command==='delete'?'':body.innerText+(command==='insertLineBreak'?'\n':value);body.dispatchEvent({type:'input'});return true;}};
 const calls=[];let href=URL;
 const context=vm.createContext({document:doc,crypto:require('node:crypto').webcrypto,HTMLInputElement:Input,Event:class Event{constructor(type){this.type=type;}},
  MutationObserver:class {observe(){}takeRecords(){return [];}}});
 const wc={getURL:()=>href,isDestroyed:()=>false,executeJavaScriptInIsolatedWorld:(_world,scripts)=>{
  calls.push(scripts[0].code);return Promise.resolve(vm.runInContext(scripts[0].code,context));
 }};
 return {wc,calls,title,body,file,send,draft,table,changeUrl:url=>href=url};
}
const allow=()=>true;
const payload={target:{classKey:'2026:6:1'},binding:{contextId:'fixture'},stillPermitted:()=>true,value:'한글 확인 <script>\n둘째 줄'};
test('only official HTTPS hosts may be used',()=>{
 assert.equal(officialPage(URL),true);
 for(const url of ['https://schoolbell-e.com.evil.test','https://evil.test','file:///etc/passwd','http://schoolbell-e.com','https://id:pw@schoolbell-e.com','https://schoolbell-e.com:4444'])assert.equal(officialPage(url),false,url);
});
test('defaults deny before DOM inspection or mutation',async()=>{
 const f=fixture(),bridge=createObservedComposerBridge({getWebContents:()=>f.wc});
 await assert.rejects(()=>bridge.readStructure(null),/permission-unverified/);
 await assert.rejects(()=>bridge.writeTitle(payload),/permission-unverified/);
 assert.equal(f.calls.length,0);
});
test('reads match only unique observed controls without private account data',async()=>{
 const f=fixture(),bridge=createObservedComposerBridge({getWebContents:()=>f.wc,authorize:allow,domGuard:()=>true});
 const info=await bridge.readStructure(null);assert.equal(info.structureMatched,true);assert.equal(info.title.count,1);
 assert.equal(info.publishReady,false);const fields=await bridge.readFields();assert.equal(fields.title,'');assert.equal(fields.body,'');assert.match(fields.revision,/^[a-f0-9-]{36}:0$/);
 f.table['button.btn-with-description'].push(f.send);
 await assert.rejects(()=>bridge.readFields(),/structure-unverified/);
});
test('title and body text are passed as inert JSON, never HTML or source interpolation',async()=>{
 const f=fixture(),bridge=createObservedComposerBridge({getWebContents:()=>f.wc,authorize:allow,domGuard:()=>true});
 await bridge.writeTitle({...payload,value:'제목 \\" }); evil(); //'});
 await bridge.writeBodyText(payload);
 assert.equal(f.title.value,'제목 \\" }); evil(); //');
 assert.equal(f.body.innerText,payload.value);
 assert.ok(f.title.events.includes('input')&&f.body.events.includes('input'));
 const fields=await bridge.readFields();assert.equal(fields.title,f.title.value);assert.equal(fields.body,payload.value);assert.match(fields.revision,/^[a-f0-9-]{36}:0$/);
});
test('denies disallowed binding, revoked permission, navigation, aborted signal',async()=>{
 const f=fixture();let permitted=true;
 const bridge=createObservedComposerBridge({getWebContents:()=>f.wc,authorize:({action,target})=>permitted&&action!=='body'&&!!target?.classKey,domGuard:()=>true});
 await assert.rejects(()=>bridge.writeBodyText(payload),/permission-unverified/);
 assert.equal(f.calls.length,0);
 await bridge.writeTitle(payload);
 const controller=new AbortController();controller.abort();
 await assert.rejects(()=>bridge.writeTitle(payload,controller.signal),/permission-unverified/);
 permitted=false;await assert.rejects(()=>bridge.writeTitle(payload),/permission-unverified/);
 f.changeUrl('https://example.org');await assert.rejects(()=>bridge.writeTitle(payload),/site-unverified/);
});

test('a main-process grant alone cannot replace atomic DOM identity evidence',async()=>{
 const f=fixture(),bridge=createObservedComposerBridge({getWebContents:()=>f.wc,authorize:allow});
 await assert.rejects(()=>bridge.writeTitle(payload),/context-unverified/);assert.equal(f.title.value,'');
});
test('closed or overlapping transports never queue stale input',async()=>{
 const f=fixture();let release;
 const bridge=createObservedComposerBridge({getWebContents:()=>f.wc,domGuard:()=>true,authorize:()=>new Promise(r=>{release=r;})});
 const pending=bridge.writeTitle(payload);
 await assert.rejects(()=>bridge.writeTitle(payload),/driver-state/);
 const closing=bridge.close();release(true);await assert.rejects(()=>pending,/permission-unverified/);
 assert.equal(await closing,true);assert.equal(f.title.value,'');
 await assert.rejects(()=>bridge.writeTitle(payload),/driver-state/);
});

test('commit comparison has separate fixed codes, including title/body mismatch and cosmetic revision eligibility',()=>{
 const current={title:'synthetic',body:'line1\nline2',revision:'document:4',semanticRevision:2};
 const payload={note:{title:'synthetic',body:'line1\r\nline2'},revision:'document:4',semanticRevision:2,finalAction:'single-send'};
 const state={submitted:false};assert.equal(compareCommit(current,payload,state,true).failure,null);
 for(const [code,c,p,st,enabled] of [
  ['commit-already-submitted',current,payload,{submitted:true},true],
  ['commit-send-disabled',current,payload,state,false],
  ['commit-action-mismatch',current,{...payload,finalAction:'other'},state,true],
  ['commit-revision-mismatch',{...current,revision:'document:5'},payload,state,true],
  ['commit-title-mismatch',{...current,title:'changed'},payload,state,true],
  ['commit-body-mismatch',{...current,body:'changed'},payload,state,true]
 ]){const r=compareCommit(c,p,st,enabled);assert.equal(r.failure,code);assert.ok(Object.values(r.checks).every(v=>typeof v==='boolean'));assert.equal(JSON.stringify(r).includes('synthetic'),false);}
 const changed=compareCommit({...current,revision:'document:5',semanticRevision:3},payload,state,true);
 assert.equal(changed.checks.semanticRevisionMatch,false);assert.equal(compareCommit({...current,revision:'replacement:4'},payload,state,true).checks.sameDocument,false);
});
test('unclassified renderer exception never exposes the exception text or becomes a content mismatch',async()=>{
 const f=fixture();f.send.hasAttribute=()=>{throw Error('PRIVATE_RENDERER_VALUE');};
 const bridge=createObservedComposerBridge({getWebContents:()=>f.wc,authorize:allow,domGuard:()=>true});
 await assert.rejects(()=>bridge.readStructure(null),e=>e.message==='renderer-unclassified'&&!JSON.stringify(e).includes('PRIVATE_RENDERER_VALUE'));
});
