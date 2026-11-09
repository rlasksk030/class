'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {classRoute,summarizeContext,createLiveContextProvider}=require('./schoolbell-live-context.cjs');
const {readPostIndex,createLivePostProvider}=require('./schoolbell-live-posts.cjs');
const board='https://schoolbell-e.com/ko/main/group/100/boards/classnews';
test('observed class route excludes school announcements, credentials and other origins',()=>{
 assert.equal(classRoute(board+'/posts/200').groupId,'100');
 for(const bad of [board.replace('classnews','schoolnews'),board+'?token=secret',board.replace('https:','http:'),board.replace('schoolbell-e.com','evil.test')])assert.equal(classRoute(bad),null);
});
test('matching display names and empty slots cannot establish school, year, actor or notification authority',()=>{
 const result=summarizeContext({group:{known:true,groupName:'6학년 1반',admins:[{name:'synthetic',avatar:'default'}],adminFlags:1},account:{name:'synthetic',avatar:'default'},roster:{known:true,empty:true,filled:[0,0,0,0]},invite:{known:true,noInviteTargets:true}},{grade:'6',classroom:'1'});
 assert.equal(result.checks.gradeClass,true);assert.equal(result.checks.adminDisplayMatch,true);
 for(const flag of ['identityVerified','authorityVerified','recipientsVerified'])assert.equal(result[flag],false);
 for(const code of ['school-unverified','year-unverified','actor-unverified','membership-unverified','notification-policy-unverified'])assert.ok(result.blockers.includes(code));
 assert.ok(!JSON.stringify(result).includes('synthetic'));
});
test('cancellation while the context reader is opening destroys only that reader and prevents reads',async()=>{
 let release,destroyed=0,loads=0;const session={};
 const provider=createLiveContextProvider({getWebContents:()=>({isDestroyed:()=>false,getURL:()=>board,session}),createReader:ses=>{assert.equal(ses,session);return new Promise(r=>release=r);}});
 const result=provider.inspect();assert.equal(provider.close(),false);
 release({isDestroyed:()=>destroyed>0,destroy:()=>destroyed++,loadURL:()=>loads++});
 await assert.rejects(result,/cancelled/);assert.equal(destroyed,1);assert.equal(loads,0);assert.equal(provider.close(),true);
});
function postDOM({id='200',tooltip='2026. 11. 9. PM 2:49:20',duplicates=false}={}){
 let card;const wrapper={getAttribute:()=>id,querySelectorAll:()=>[card]};
 card={closest:()=>wrapper,querySelectorAll:s=>s==='app-translation-viewer'?[{textContent:'synthetic target'}]:[{getAttribute:()=> 'date-proof'}]};
 const cards=duplicates?[card,card]:[card],root={querySelectorAll:()=>cards};
 return {querySelectorAll:()=>[root],getElementById:()=>({textContent:tooltip})};
}
test('observed post ID and tooltip date do not claim virtual list coverage',()=>{
 const result=readPostIndex(postDOM(),'synthetic target');
 assert.deepEqual(result.matches,[{id:'200',date:'2026-11-09'}]);assert.equal(result.complete,false);
 assert.equal(readPostIndex(postDOM({duplicates:true}),'synthetic target').known,false);
 assert.equal(readPostIndex(postDOM({id:'unknown'}),'synthetic target').known,false);
 for(const tooltip of ['2026. 2. 30. AM 3:00:00','2026. 11. 9. PM 13:00:00','오늘','2026-11-09'])assert.equal(readPostIndex(postDOM({tooltip}),'synthetic target').matches[0].date,null);
});
test('post provider keeps incomplete baseline blocked and revisits only its pinned class after send',async()=>{
 let url=board,readerDestroyed=false,readCount=0;
 const session={},wc={isDestroyed:()=>false,getURL:()=>url,session,loadURL:async u=>{url=u;},executeJavaScriptInIsolatedWorld:async()=>{readCount++;return {known:true,ids:['200'],matches:[{id:'200',date:'2026-11-09'}],reason:'virtual-list-coverage-unverified'};}};
 let readerURL;const reader={isDestroyed:()=>readerDestroyed,destroy:()=>{readerDestroyed=true;},webContents:{...wc,getURL:()=>readerURL,loadURL:async u=>{readerURL=u;}}};
 const provider=createLivePostProvider({target:{schoolId:'fixture',classKey:'2026:6:1'},getWebContents:()=>wc,createReader:async s=>{assert.equal(s,session);return reader;}});
 const baseline=await provider.readBaseline({note:{title:'synthetic target'}});
 assert.equal(baseline.complete,false);assert.equal(baseline.refreshed,true);assert.equal(readerDestroyed,true);assert.equal(url,board);
 url=board.replace('classnews','schoolnews');
 const result=await provider.readPublishedMetadata({binding:{boardId:'100'},note:{title:'synthetic target'}});
 assert.equal(url,board);assert.equal(result.id,'200');assert.equal(result.date,'2026-11-09');
 const before=readCount;await assert.rejects(()=>provider.readPublishedMetadata({binding:{boardId:'101'},note:{title:'synthetic target'}}),/publication-unverified/);assert.equal(readCount,before);assert.equal(provider.close(),true);
});
