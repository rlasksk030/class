const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('./schoolbell-flow.cjs');
const S='https://schoolbell-e.com',BOARD=S+'/ko/main/group/100/boards/classnews';
test('page state: login, home, class page, class notice board',()=>{
 for(const url of ['https://v4.schoolbell-e.com/ko/gate/login?return_uri=https://schoolbell-e.com/ko/main',S+'/ko/login','https://auth.whalespace.io/oauth2/v1.1/authorize','http://schoolbell-e.com/ko/main','not a url',''])
  assert.equal(F.classify({url}).state,'login',url);
 assert.equal(F.classify({url:BOARD,board:true,login:true}).state,'login');
 const home=F.classify({url:S+'/ko/main'});assert.equal(home.state,'home');assert.equal(home.step,2);assert.equal(home.message,F.GUIDE);
 for(const url of [S+'/ko/main/group/100/settings/studentlist',S+'/ko/main/group/100',S+'/ko/main/group/100/boards/schoolnews',S+'/ko/main/group/100/boards/write/classnews']){
  const c=F.classify({url,board:true});assert.equal(c.state,'class',url);assert.equal(c.url,undefined);assert.match(c.message,/이 학급의 알림장을 열어 주세요/);
 }
 // The address alone is not enough: the board itself must be on the page.
 assert.equal(F.classify({url:BOARD,board:false}).state,'class');
 const board=F.classify({url:BOARD+'/posts/77',board:true});
 assert.deepEqual({state:board.state,step:board.step,groupId:board.groupId,url:board.url},{state:'board',step:3,groupId:'100',url:BOARD});
});
test('routes: composer, result screens of the same group, other hosts',()=>{
 assert.deepEqual(F.route(S+'/ko/main/group/100/boards/write/classnews'),{kind:'composer',groupId:'100',origin:S});
 assert.equal(F.route(S+'/ko/main/group/100/boards/schoolnews').kind,'result');
 assert.equal(F.route(S+'/ko/main/group/100/boards/schoolnews/posts/5').groupId,'100');
 assert.equal(F.route(BOARD).boardUrl,BOARD);
 for(const url of ['https://schoolbell-e.com.evil.org/ko/main/group/100/boards/classnews','https://user:pw@schoolbell-e.com/ko/main','https://schoolbell-e.com:8443/ko/main','file:///etc/passwd'])
  assert.equal(F.route(url).kind,'outside',url);
});
test('only the plain board address can be saved as a link',()=>{
 assert.deepEqual(F.boardLink(BOARD),{url:BOARD,groupId:'100'});
 for(const url of [BOARD+'?x=1',BOARD+'#y',BOARD+'/posts/7',S+'/ko/main/group/100/boards/schoolnews',S+'/ko/main/group/100/boards/write/classnews',S+'/ko/main','https://v4.schoolbell-e.com/ko/gate/login'])
  assert.equal(F.boardLink(url),null,url);
});
test('class name against the app grade and class',()=>{
 assert.deepEqual(F.classOf('옥구초등학교 6학년 1반'),{grade:'6',classroom:'1'});
 assert.deepEqual(F.classOf('2026 3학년 사랑반'),{grade:'3',classroom:'사랑'});
 assert.equal(F.classOf('우리반'),null);
 assert.equal(F.titleMatches('6학년 1반','6','1'),true);assert.equal(F.titleMatches('6학년1반','6','1'),true);
 assert.equal(F.titleMatches('5학년 1반','6','1'),false);assert.equal(F.titleMatches('6학년 2반','6','1'),false);
 assert.equal(F.titleMatches('3학년 사랑반','3','사랑'),true);assert.equal(F.titleMatches('3학년 사랑반','3','소망'),false);
 // A name without a grade/class is not a mismatch (no warning); the teacher still confirms once.
 assert.equal(F.titleMatches('우리반','6','1'),true);assert.equal(F.titleMatches('','6','1'),true);
});
test('upload names keep the draft order',()=>{
 assert.deepEqual(F.uploadNames([{id:'a'.repeat(64)+'.jpg'},{id:'b'.repeat(64)+'.png'}]),['사진01.jpg','사진02.png']);
 assert.equal(F.uploadNames(Array.from({length:12},()=>({id:'c'.repeat(64)+'.png'})))[11],'사진12.png');
 assert.equal(F.sameNames(['사진01.jpg'],['사진01.jpg'.normalize('NFD')]),true);
 assert.equal(F.sameNames(['사진02.png','사진01.jpg'],['사진01.jpg','사진02.png']),false);
 assert.equal(F.sameNames(['사진01.jpg'],['사진01.jpg','사진02.png']),false);
 assert.equal(F.sameNames([null],['사진01.jpg']),false);
});
test('body comparison ignores only what the service changes by itself',()=>{
 const text='첫 줄\n\n  들여쓴 줄\n끝';
 assert.equal(F.sameBody('첫 줄\r\n\r\n  들여쓴 줄  \n끝\n\n',text),true);
 assert.equal(F.sameBody('\n'+text,text),true);
 assert.equal(F.sameBody('첫 줄\n들여쓴 줄\n끝',text),false);        // a lost blank line or indent is a difference
 assert.equal(F.sameBody('첫 줄\n\n  들여쓴 줄\n끝!',text),false);
 assert.equal(F.sameBody('',''),true);assert.equal(F.sameBody('',' \n'),true);
 // innerText fallback (unknown markup in the posted body): blank-line counts are not comparable.
 assert.equal(F.sameBody('첫 줄\n\n\n\n  들여쓴 줄\n\n끝',text,true),true);
 assert.equal(F.sameBody('첫 줄\n다른 줄\n끝',text,true),false);
});
const expected={title:'11월 12일 알림장',body:'준비물: 실내화\n\n내일 만나요',files:['사진01.png','사진02.jpg']};
const card=(id,over={})=>({id,body:expected.body,files:[...expected.files],approximate:false,...over});
test('result: exactly one new post equal to what was sent',()=>{
 assert.deepEqual(F.judge({ids:['5','4'],matching:0},{matches:[card('6')]},expected),{status:'success',postId:'6'});
 // An older post with the same title but another body does not disturb the decision.
 assert.equal(F.judge({ids:['5'],matching:0},{matches:[card('6'),card('5',{body:'어제 내용'})]},expected).postId,'6');
 // No post IDs on the board: the content alone decides, and the ID is simply not recorded.
 assert.deepEqual(F.judge({ids:[],matching:0},{matches:[card('')]},expected),{status:'success',postId:null});
 assert.equal(F.judge({ids:[],matching:0},{matches:[card(''),card('',{body:'어제 내용'})]},expected).status,'success');
});
test('result: anything else is not a success',()=>{
 assert.equal(F.judge({ids:['5'],matching:0},{matches:[]},expected).status,'missing');
 assert.equal(F.judge({ids:['5'],matching:0},{matches:[card('5')]},expected).status,'missing');             // the post already existed
 assert.equal(F.judge({ids:['5'],matching:0},{matches:[card('6',{body:'다른 본문'})]},expected).status,'mismatch');
 assert.equal(F.judge({ids:['5'],matching:0},{matches:[card('6',{files:['사진02.jpg','사진01.png']})]},expected).status,'mismatch');   // order
 assert.equal(F.judge({ids:['5'],matching:0},{matches:[card('6',{files:['사진01.png']})]},expected).status,'mismatch');              // count
 assert.equal(F.judge({ids:['5'],matching:0},{matches:[card('6',{files:[null,'사진02.jpg']})]},expected).status,'mismatch');
 assert.equal(F.judge({ids:['5'],matching:0},{matches:[card('6'),card('7')]},expected).status,'ambiguous');
 assert.notEqual(F.judge({ids:[],matching:1},{matches:[card('')]},expected).status,'success');                // an equal post was there before
 assert.equal(F.judge(null,null,expected).status,'missing');
});
test('a result that is not a success says why without any text of the post',()=>{
 const shape={lists:1,items:0,unread:0,media:1,sketch:['div.media','m:img.thumb']};
 const r=F.judge({ids:['5'],matching:0},{matches:[card('6',{files:[],shape})]},expected);
 assert.equal(r.status,'mismatch');
 assert.deepEqual(r.detail,{fresh:1,titled:1,expected:2,body:true,names:false,files:0,approximate:false,...shape});
 assert.deepEqual(F.judge({ids:['5'],matching:0},{matches:[card('5')]},expected).detail,{fresh:0,titled:1,expected:2});
 assert.ok(!JSON.stringify(r).includes('준비물'));
});
test('service dialog after 보내기: only a plain send question with one affirmative button is confirmed',()=>{
 assert.deepEqual(F.confirmDialog({text:'알림장을 보내시겠습니까?',buttons:['취소','확인']}),{action:'confirm',button:1});
 assert.deepEqual(F.confirmDialog({text:' 지금  발행하시겠습니까? ',buttons:['보내기','닫기']}),{action:'confirm',button:0});
 for(const dialog of [{text:'수신 대상이 없습니다.',buttons:['확인']},{text:'임시저장하시겠습니까?',buttons:['취소','확인']},
  {text:'예약발행으로 보내시겠습니까?',buttons:['취소','확인']},{text:'글을 삭제하시겠습니까?',buttons:['취소','확인']},
  {text:'보내기에 실패했습니다.',buttons:['확인']},{text:'보내시겠습니까?',buttons:['확인','예']},{text:'보내시겠습니까?',buttons:['취소']},
  {text:'페이지에서 나가시겠습니까?',buttons:['취소','확인']},{text:'',buttons:['확인']},{}])
  assert.equal(F.confirmDialog(dialog).action,'unknown',JSON.stringify(dialog));
});
test('progress steps cover the whole registration',()=>{assert.equal(F.STEPS.length,7);assert.match(F.STEPS[5],/보내기/);assert.match(F.STEPS[6],/결과/);});
