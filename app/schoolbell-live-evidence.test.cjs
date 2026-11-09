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
function postDOM({id='200',tooltip='2026. 11. 9. PM 2:49:20',duplicates=false,search=''}={}){
 let card;const wrapper={getAttribute:()=>id,querySelectorAll:()=>[card]};
 card={closest:()=>wrapper,querySelectorAll:s=>s==='app-translation-viewer'?[{textContent:'synthetic target'}]:[{getAttribute:()=> 'date-proof'}]};
 const cards=duplicates?[card,card]:[card],root={querySelectorAll:s=>s==='app-letter-item-long'?cards:[]};
 return {querySelectorAll:s=>s==='input[placeholder="검색"]'?[{value:search}]:[root],getElementById:()=>({textContent:tooltip})};
}
test('observed post ID and tooltip date do not claim virtual list coverage',()=>{
 const result=readPostIndex(postDOM(),'synthetic target');
 assert.deepEqual(result.matches,[{id:'200',date:'2026-11-09'}]);assert.equal(result.complete,false);
 assert.equal(result.unfiltered,true);assert.equal(readPostIndex(postDOM({search:'filtered'}),'synthetic target').unfiltered,false);
 assert.equal(readPostIndex(postDOM({duplicates:true}),'synthetic target').known,false);
 assert.equal(readPostIndex(postDOM({id:'unknown'}),'synthetic target').known,false);
 for(const tooltip of ['2026. 2. 30. AM 3:00:00','2026. 11. 9. PM 13:00:00','오늘','2026-11-09'])assert.equal(readPostIndex(postDOM({tooltip}),'synthetic target').matches[0].date,null);
});
test('missing list-end coverage cannot establish a baseline or enable result readback',async()=>{
 let url=board,readerDestroyed=false,readCount=0;
 const session={},wc={isDestroyed:()=>false,getURL:()=>url,session,loadURL:async u=>{url=u;},executeJavaScriptInIsolatedWorld:async()=>{readCount++;return {known:true,unfiltered:true,ids:['200'],matches:[],viewport:{top:0,height:200,total:400,end:false}};}};
 let readerURL;const reader={isDestroyed:()=>readerDestroyed,destroy:()=>{readerDestroyed=true;},loadURL:async u=>{readerURL=u;},webContents:{...wc,getURL:()=>readerURL,loadURL:async u=>{readerURL=u;}}};
 const provider=createLivePostProvider({target:{schoolId:'fixture',classKey:'2026:6:1'},timeoutMs:10,getWebContents:()=>wc,createReader:async s=>{assert.equal(s,session);return reader;}});
 await assert.rejects(()=>provider.readBaseline({note:{title:'synthetic target'},stillPermitted:()=>true}),/baseline-unverified/);
 assert.equal(readerDestroyed,true);assert.equal(url,board);
 const before=readCount;
 await assert.rejects(()=>provider.readPublishedMetadata({binding:{boardId:'100'},note:{title:'synthetic target'},stillPermitted:()=>true}),/publication-unverified/);
 assert.equal(readCount,before);assert.equal(provider.close(),true);
});
test('empty unfiltered send-target table verifies no student/parent targets but cannot authorize administrator notifications',()=>{
 const result=summarizeContext({recipients:{known:true,unfiltered:true,empty:true,mandatoryAdministrator:true}},{grade:'6',classroom:'1'});
 assert.equal(result.students,0);assert.equal(result.parents,0);assert.equal(result.mandatoryAdministrator,true);
 assert.equal(result.blockers.includes('membership-unverified'),false);assert.equal(result.blockers.includes('notification-policy-unverified'),true);
 assert.equal(result.recipientsVerified,false);assert.equal(result.authorityVerified,false);
});
