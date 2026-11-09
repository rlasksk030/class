'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createLivePostProvider}=require('./schoolbell-live-posts.cjs');
const board='https://schoolbell-e.com/ko/main/group/100/boards/classnews',write=board.replace('/boards/','/boards/write/');
test('readback waits for the service result screen before refreshing the composer',async()=>{
 let url=write,serviceCompleted=false,refreshes=0;
 const sample=after=>({known:true,unfiltered:true,ids:after?['200','201']:['200'],matches:after?[{id:'201',date:'2026-11-09'}]:[],viewport:{top:0,height:500,total:500,end:true}});
 const owner={isDestroyed:()=>false,getURL:()=>url,session:{},async loadURL(next){assert.equal(serviceCompleted,true,'refresh must never cancel an in-flight publish');refreshes++;url=next;},async executeJavaScriptInIsolatedWorld(_world,scripts){return scripts[0].code.includes('function readPostIndex')?sample(true):serviceCompleted;}};
 const reader={isDestroyed:()=>false,destroy(){},async loadURL(){},webContents:{isDestroyed:()=>false,getURL:()=>board,async executeJavaScriptInIsolatedWorld(){return sample(false);}}};
 const p=createLivePostProvider({getWebContents:()=>owner,createReader:()=>reader,target:{schoolId:'synthetic',classKey:'2026:6:1'},timeoutMs:2000});
 await p.readBaseline({note:{title:'synthetic'},stillPermitted:()=>true});
 const pending=p.readPublishedMetadata({binding:{boardId:'100'},note:{title:'synthetic'},stillPermitted:()=>true});
 await new Promise(r=>setTimeout(r,150));assert.equal(refreshes,0);
 serviceCompleted=true;url=board.replace('/classnews','/schoolnews');
 const result=await pending;assert.equal(result.id,'201');assert.equal(result.refreshed,true);assert.equal(refreshes,2);p.close();
});
