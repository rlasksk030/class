'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {previewRoute,samePreviewURL,previewFiles}=require('./schoolbell-preview-originals.cjs');
test('live preview route pins the class and board after bootstrap; URL encoding does not change its identity',()=>{
 const owner='https://schoolbell-e.com/ko/main/group/100/boards/write/classnews';
 const url='https://v5.schoolbell-e.com/mobile/groups/0:100/boards/classnews/posts/preview?state=synthetic&origin=https%3A%2F%2Fschoolbell-e.com';
 assert.equal(previewRoute(url,owner),true);
 assert.equal(previewRoute(url.replace('0:100','0%3A100'),owner),true);
 assert.equal(samePreviewURL(url,url.replace('0:100','0%3A100').replace('https%3A%2F%2Fschoolbell-e.com','https://schoolbell-e.com')),true);
 for(const other of [url.replace('0:100','0:101'),url.replace('classnews','schoolnews'),url.replace('/preview?','/200?'),url+'&state=other',url.replace('v5.schoolbell-e.com','example.invalid'),url.replace('origin=https%3A%2F%2Fschoolbell-e.com','origin=https%3A%2F%2Fother.invalid'),url+'#other'])
  assert.equal(previewRoute(other,owner),false);
 assert.equal(previewRoute('https://v5.schoolbell-e.com/',owner),false);
 assert.equal(samePreviewURL(url,url.replace('state=synthetic','state=changed')),false);
});
test('preview file labels accept the observed byte unit but still require exact count and order before one click',()=>{
 let clicks=0;const button={disabled:false,click:()=>clicks++};
 const rows=['01-first .png (97.00 bytes)','02-second.png (1.00 KB)'].map(textContent=>({textContent,getClientRects:()=>[{}],shadowRoot:{querySelectorAll:()=>[button]}}));
 const doc={querySelectorAll:()=>[{querySelectorAll:()=>rows}]};
 assert.deepEqual(previewFiles(doc,['01-first.png','02-second.png'],null),{count:2});assert.equal(clicks,0);
 assert.throws(()=>previewFiles(doc,['02-second.png','01-first.png'],0),/preview-name-mismatch/);assert.equal(clicks,0);
 previewFiles(doc,['01-first.png','02-second.png'],0);assert.equal(clicks,1);
});
