const test=require('node:test'),assert=require('node:assert/strict'),C=require('./diary-chalk-core.js');
// Every character is 1em wide (Hangul-like), a space .3em: widths in px at font size s.
const measureAt=(text,size)=>Array.from(text).reduce((w,ch)=>w+(ch===' '?.3:1)*size,0);
const board={width:1200,height:600,showDate:true,date:'11월 13일 금요일',title:'11월 13일 알림장',measureAt,min:28,max:108};

test('a short notice (3 lines) gets a large size on one page',()=>{
 const r=C.fit({...board,body:'1. 체육복 챙기기\n2. 우유 급식 신청서 금요일까지 제출\n3. 다음 주 수요일 현장체험학습'});
 assert.equal(r.pages.length,1);assert.ok(r.size>=60,'size '+r.size);assert.ok(r.size<=board.max);
 // One size up would not fit any more (it is the largest that fits).
 const bigger=C.fit({...board,body:r.lines.join('\n'),manual:r.size+1});
 assert.ok(bigger.pages.length>1||r.size===board.max);
});

test('a long notice (30 lines) uses the minimum size and several pages; no page starts with an empty line',()=>{
 const body=Array.from({length:30},(_,i)=>i%6===5?'':`${i+1}. 오늘 준비물과 숙제를 확인하기`).join('\n');
 const r=C.fit({...board,body});
 assert.equal(r.size,board.min);assert.ok(r.pages.length>=2,'pages '+r.pages.length);
 assert.ok(r.pages.slice(1).every(p=>p.length&&p[0].trim()!==''));
 // Every written line except dropped leading blanks is on some page, in order.
 const shown=r.pages.flat();assert.deepEqual(shown.filter(l=>l.trim()),body.split('\n').filter(l=>l.trim()));
});

test('empty lines stay as one row each; trailing empty lines are ignored',()=>{
 assert.equal(C.wrap('',500,s=>s.length*10),1);
 const r=C.fit({...board,body:'첫째 줄\n\n셋째 줄\n\n\n'});
 assert.deepEqual(r.lines,['첫째 줄','','셋째 줄']);assert.equal(r.pages.length,1);
});

test('a very long single line wraps by words (keep-all) and breaks an over-long word',()=>{
 const m=s=>Array.from(s).length*10;
 assert.equal(C.wrap('가나다 라마바',60,m),2,'two words, one per row');
 assert.equal(C.wrap('가나다라마바사아자차',40,m),3,'a 10-letter word breaks into rows of 4');
 const r=C.fit({...board,body:'아주 '.repeat(200).trim()});
 assert.ok(r.size>=board.min&&r.size<=board.max);
});

test('without a title (and with the date hidden) the body gets more room',()=>{
 const body='1. 체육복 챙기기\n2. 우유 급식 신청서 금요일까지 제출\n3. 다음 주 수요일 현장체험학습\n4. 독서 기록장 쓰기\n5. 알림장 확인';
 const withTitle=C.fit({...board,body,max:200});
 const noTitle=C.fit({...board,body,title:'',max:200});
 const noHead=C.fit({...board,body,title:'',showDate:false,max:200});
 assert.ok(noTitle.size>=withTitle.size&&noHead.size>=noTitle.size,[withTitle.size,noTitle.size,noHead.size].join('<'));
 assert.equal(C.headHeight({...board,size:40,title:'',showDate:false}),0);
});

test('a manual size is kept even when it needs pages',()=>{
 const r=C.fit({...board,body:Array.from({length:8},(_,i)=>`${i+1}. 준비물`).join('\n'),manual:150});
 assert.equal(r.size,150);assert.ok(r.pages.length>1);
});

test('saved preferences: odd values fall back to the defaults',()=>{
 assert.deepEqual(C.preferences(undefined),{fontScale:null,showDate:true});
 assert.deepEqual(C.preferences({fontScale:.8,showDate:false}),{fontScale:.8,showDate:false});
 assert.deepEqual(C.preferences({fontScale:'big',showDate:'no'}),{fontScale:null,showDate:true});
 assert.deepEqual(C.preferences({fontScale:99}),{fontScale:null,showDate:true});
 assert.ok(C.validPreferences({fontScale:null,showDate:true})&&C.validPreferences({fontScale:1.2,showDate:false}));
 for(const bad of [null,[],{fontScale:'1',showDate:true},{fontScale:null},{fontScale:9,showDate:true}])assert.ok(!C.validPreferences(bad));
});
