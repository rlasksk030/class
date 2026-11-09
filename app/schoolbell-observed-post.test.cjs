const {test}=require('node:test'),assert=require('node:assert/strict');
const {diaryRoute,postOperation,createObservedPostBridge}=require('./schoolbell-observed-post.cjs');
test('observed diary route is bound to an official origin and class board',()=>{
 const url='https://schoolbell-e.com/ko/main/group/100/boards/classnews';
 assert.deepEqual(diaryRoute(url+'/posts/200'),{groupId:'100',postId:'200',boardURL:url});
 for(const bad of [url.replace('classnews','schoolnews'),url.replace('schoolbell-e.com','schoolbell-e.com.evil.test'),
  url.replace('https:','http:'),url+'/posts/not-an-id',url.replace('/100/','/%31%30%30/')])assert.equal(diaryRoute(bad),null);
});
function fixture(){
 const row=name=>({querySelectorAll:s=>({'span.text-truncate':[{textContent:name}],
  'span.text-nowrap:not(.file-item-size)':[{textContent:'.png'}]}[s]||[])});
 const rows=[row('synthetic-1'),row('synthetic-2')],body={textContent:'한글\n\n둘째 줄'};
 const entries={'app-translation-viewer':[{textContent:'합성 제목'}],'app-text-viewer .fr-view':[body],
  'app-letter-filelist':[{querySelectorAll:()=>rows}],'app-media-browser':[{querySelectorAll:()=>[]}]};
 const card={querySelectorAll:s=>entries[s]||[]},cards=[card];
 return {cards,entries,document:{querySelectorAll:()=>cards},request:{note:{title:'합성 제목',body:body.textContent}},rows};
}
test('reads only the unique requested post and keeps file order without size labels',()=>{
 const f=fixture(),result=postOperation(f.document,f.request,n=>n.textContent);
 assert.deepEqual(result.names,['synthetic-1.png','synthetic-2.png']);
 assert.equal(result.dateVerified,false);assert.equal(result.postIdVerified,false);assert.equal(result.originalsVerified,false);
 for(const change of [g=>g.cards.push(g.cards[0]),g=>g.request.note.body='다름',
  g=>g.request.names=['synthetic-2.png','synthetic-1.png'],g=>g.entries['app-text-viewer .fr-view']=[],
  g=>g.entries['app-media-browser']=[{querySelectorAll:()=>[{}]}]]){
  const g=fixture();change(g);assert.throws(()=>postOperation(g.document,g.request,n=>n.textContent),/publication-unverified/);
 }
});
test('post reader cannot inspect without permission or move to another board',async()=>{
 let calls=0,url='https://schoolbell-e.com/ko/main/group/100/boards/classnews';
 const wc={isDestroyed:()=>false,getURL:()=>url,executeJavaScriptInIsolatedWorld:()=>{calls++;return {ok:true};}};
 const reader=createObservedPostBridge({getWebContents:()=>wc});
 await assert.rejects(()=>reader.readFields({boardURL:url,note:{title:'합성',body:''}}),/permission-unverified/);
 url=url.replace('classnews','schoolnews');
 await assert.rejects(()=>reader.readFields({boardURL:url,note:{title:'합성',body:''}}),/publication-unverified/);
 assert.equal(calls,0);assert.equal(reader.close(),true);
});
test('file readiness does not become true until asynchronous expansion exposes every original',()=>{
 const f=fixture();let visible=false,downloads=0;
 f.rows.forEach(r=>{r.getClientRects=()=>visible?[{}]:[];r.click=()=>downloads++;
  r.ownerDocument={defaultView:{getComputedStyle:()=>({display:visible?'block':'none',visibility:'visible'})}};});
 const request={...f.request,action:'ready',names:['synthetic-1.png','synthetic-2.png']};
 assert.equal(postOperation(f.document,request,n=>n.textContent).filesVisible,false);
 assert.throws(()=>postOperation(f.document,{...request,action:'download',index:0},n=>n.textContent),/hidden/);
 assert.equal(downloads,0);visible=true;
 assert.equal(postOperation(f.document,request,n=>n.textContent).filesVisible,true);
 postOperation(f.document,{...request,action:'download',index:0},n=>n.textContent);assert.equal(downloads,1);
});
test('expand clicks the observed attachment label rather than its layout parent',()=>{
 const f=fixture();let labelClicks=0;
 f.rows.forEach(r=>{r.getClientRects=()=>[];});
 const label={textContent:'첨부파일 (2)',children:[],click:()=>labelClicks++};
 const wrapper={textContent:'첨부파일 (2)',children:[label],querySelectorAll:()=>[label],click:()=>assert.fail('layout container must not be clicked')};
 f.entries['app-letter-filelist']=[{querySelectorAll:s=>s==='.file-item'?f.rows:[wrapper]}];
 postOperation(f.document,{...f.request,action:'expand'},n=>n.textContent);assert.equal(labelClicks,1);
});
