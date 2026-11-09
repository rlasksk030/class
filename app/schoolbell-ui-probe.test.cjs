// New probe contract checks only; these are not live input/upload/publishing tests.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {probeComposer}=require('./schoolbell-ui-probe.cjs');
function node(attrs={},text='') {
 const n={hasAttribute:k=>Object.hasOwn(attrs,k),getAttribute:k=>attrs[k]??null,textContent:text};
 for(const key of ['value','innerHTML','files'])Object.defineProperty(n,key,{get(){throw Error('private field read');}});
 return n;
}
function fixture() {
 const send=node({disabled:''},'보내기'),save=node({},'임시저장');
 const entries={
  'input[placeholder="제목을 입력해 주세요."]':[node()],
  'div.fr-element.fr-view[contenteditable="true"]':[node()],
  'input[type="file"]':[node({accept:'.JPG,.jpeg,.PNG,.HEIC,.pdf',multiple:''})],
  'button.btn-with-description':[send],'button':[send,save]
 };
 Object.defineProperty(entries['div.fr-element.fr-view[contenteditable="true"]'][0],'textContent',{get(){throw Error('body read');}});
 const root={querySelectorAll:s=>entries[s]||[]};
 return {entries,document:{querySelectorAll:s=>s==='app-boards-write'?[root]:[]},root};
}
test('probe returns structure only and never treats available controls as permission or publication',()=>{
 const f=fixture(),r=probeComposer(f.document);
 assert.equal(r.structureMatched,true);assert.equal(r.send.enabled,false);assert.equal(r.photos.multiple,true);
 assert.deepEqual(r.photos.accepts,{jpeg:true,png:true,heic:true});
 for(const key of ['identity','teacherPermission','recipients','date'])assert.equal(r[key],'unverified');
 assert.equal(r.publishReady,false);assert.equal(r.attachmentsVerified,false);
 assert.equal(JSON.stringify(r).includes('제목을 입력해 주세요.'),false);
});
test('missing or ambiguous composer never selects the first match',()=>{
 const f=fixture();
 for(const roots of [[],[f.root,f.root]]){
  const r=probeComposer({querySelectorAll:()=>roots});
  assert.equal(r.structureMatched,false);assert.equal(r.title.count,0);assert.equal(r.title.enabled,null);
 }
 f.entries['input[placeholder="제목을 입력해 주세요."]'].push(node());
 const r=probeComposer(f.document);assert.equal(r.structureMatched,false);assert.equal(r.title.enabled,null);
});
test('unsupported file formats and aria-disabled send controls cannot imply readiness',()=>{
 const f=fixture();f.entries['input[type="file"]']=[node({accept:'.pdf'})];
 f.entries['button.btn-with-description']=[node({'aria-disabled':'true'},'보내기')];
 const r=probeComposer(f.document);assert.deepEqual(r.photos.accepts,{jpeg:false,png:false,heic:false});
 assert.equal(r.photos.multiple,false);assert.equal(r.send.enabled,false);assert.equal(r.publishReady,false);
});
