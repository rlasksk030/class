'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {createObservedComposerBridge,officialPage}=require('./schoolbell-observed-composer.cjs');
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
 const doc={querySelectorAll:key=>key==='app-boards-write'?[root]:[]};
 const calls=[];let href=URL;
 const wc={getURL:()=>href,isDestroyed:()=>false,executeJavaScript:src=>{
  calls.push(src);return Promise.resolve(vm.runInNewContext(src,{document:doc,HTMLInputElement:Input,Event:class Event{constructor(type){this.type=type;}}}));
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
 const f=fixture(),bridge=createObservedComposerBridge({getWebContents:()=>f.wc,authorize:allow});
 const info=await bridge.readStructure(null);assert.equal(info.structureMatched,true);assert.equal(info.title.count,1);
 assert.equal(info.publishReady,false);assert.deepEqual({...await bridge.readFields()}, {title:'',body:''});
 f.table['button.btn-with-description'].push(f.send);
 await assert.rejects(()=>bridge.readFields(),/structure-unverified/);
});
test('title and body text are passed as inert JSON, never HTML or source interpolation',async()=>{
 const f=fixture(),bridge=createObservedComposerBridge({getWebContents:()=>f.wc,authorize:allow});
 await bridge.writeTitle({...payload,value:'제목 \\" }); evil(); //'});
 await bridge.writeBodyText(payload);
 assert.equal(f.title.value,'제목 \\" }); evil(); //');
 assert.equal(f.body.innerText,payload.value);
 assert.ok(f.title.events.includes('input')&&f.body.events.includes('input'));
 assert.deepEqual({...await bridge.readFields()}, {title:f.title.value,body:payload.value});
});
test('denies disallowed binding, revoked permission, navigation, aborted signal',async()=>{
 const f=fixture();let permitted=true;
 const bridge=createObservedComposerBridge({getWebContents:()=>f.wc,authorize:({action,target})=>permitted&&action!=='body'&&!!target?.classKey});
 await assert.rejects(()=>bridge.writeBodyText(payload),/permission-unverified/);
 assert.equal(f.calls.length,0);
 await bridge.writeTitle(payload);
 const controller=new AbortController();controller.abort();
 await assert.rejects(()=>bridge.writeTitle(payload,controller.signal),/permission-unverified/);
 permitted=false;await assert.rejects(()=>bridge.writeTitle(payload),/permission-unverified/);
 f.changeUrl('https://example.org');await assert.rejects(()=>bridge.writeTitle(payload),/site-unverified/);
});
