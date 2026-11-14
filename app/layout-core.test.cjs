const test=require('node:test'),assert=require('node:assert/strict'),L=require('./layout-core.js');
const at=(layout,id)=>{const r=layout.items[id];return [r.x,r.y,r.w,r.h,r.visible];};
// The operation tests below run on the board that was the default until v1.8.16 (3:7:2 columns);
// the new defaults of structures A and B are checked separately.
const OLD={timetable:{x:1,y:1,w:3,h:6},morning:{x:4,y:1,w:7,h:4},notices:{x:4,y:5,w:7,h:2},meal:{x:11,y:1,w:2,h:6}};
const base=()=>{const l=L.defaults();for(const [id,r] of Object.entries(OLD))Object.assign(l.items[id],r);return l;};
const withItems=items=>{const l=base();for(const [id,r] of Object.entries(items))Object.assign(l.items[id],r);return l;};

test('default layout (structure A) is valid and covers the whole 12x6 grid without overlap',()=>{
 const l=L.defaults();
 assert.deepEqual(L.validate(l),[]);
 assert.deepEqual(L.emptyRegions(l),[]);
 assert.deepEqual(at(l,'timetable'),[1,1,3,6,true]);
 assert.deepEqual(at(l,'morning'),[4,1,6,4,true]);
 assert.deepEqual(at(l,'notices'),[4,5,6,2,true]);
 assert.deepEqual(at(l,'meal'),[10,1,3,6,true]);
 assert.ok(L.equal(L.defaults('A'),l)&&L.equal(L.defaults('x'),l));
 assert.equal(L.validate(base()).length,0,'the previous default stays a valid saved layout');
});

test('structure B has its own default; hiding meal and filling widens the other boards',()=>{
 const b=L.defaults('B');
 assert.deepEqual(L.validate(b),[]);assert.deepEqual(L.emptyRegions(b),[]);
 assert.deepEqual(at(b,'timetable'),[1,1,3,6,true]);
 assert.deepEqual(at(b,'morning'),[4,1,9,3,true]);
 assert.deepEqual(at(b,'notices'),[4,4,5,3,true]);
 assert.deepEqual(at(b,'meal'),[9,4,4,3,true]);
 const a=L.fill(L.hide(L.defaults('A'),'meal').layout).layout;
 assert.deepEqual([at(a,'morning'),at(a,'notices')],[[4,1,9,4,true],[4,5,9,2,true]]);
 const bf=L.fill(L.hide(b,'meal').layout).layout;
 assert.deepEqual(L.emptyRegions(bf),[]);assert.equal(bf.items.meal.visible,false);
});

test('structure names: only A and B, anything else is A; each has its own storage key',()=>{
 assert.deepEqual(L.STRUCTURES,['A','B']);
 for(const [v,s] of [['A','A'],['B','B'],[undefined,'A'],[null,'A'],['b','A'],['C','A'],[2,'A']])assert.equal(L.structureOf(v),s);
 assert.deepEqual(L.STORAGE,{A:'boardLayout',B:'boardLayoutB'});
});

test('validation rejects out-of-range, too-small, overlapping and malformed layouts',()=>{
 assert.ok(!L.isValid(null)&&!L.isValid([])&&!L.isValid('x'));
 assert.ok(!L.isValid({...base(),version:2}));
 assert.ok(!L.isValid({...base(),columns:3}));
 assert.ok(!L.isValid(withItems({meal:{x:12,w:2}})),'past the right edge');
 assert.ok(!L.isValid(withItems({meal:{y:0}})),'zero row');
 assert.ok(!L.isValid(withItems({notices:{h:1}})),'below the 2x2 minimum');
 assert.ok(!L.isValid(withItems({meal:{x:10.5}})),'fractional cell');
 assert.ok(!L.isValid(withItems({meal:{visible:'no'}})));
 const missing=base();delete missing.items.meal;assert.ok(!L.isValid(missing));
 assert.deepEqual(L.validate(withItems({meal:{x:10,w:3}})),['overlap:morning:meal','overlap:notices:meal']);
 // A hidden board may overlap: it takes no space until it is shown again.
 assert.ok(L.isValid(withItems({meal:{visible:false},morning:{w:9},notices:{w:9}})));
});

test('moving onto empty cells moves; the input layout is never changed',()=>{
 const l=withItems({meal:{visible:false}}),before=JSON.stringify(l);
 const r=L.move(l,'notices',6,5);
 assert.ok(r.ok);assert.deepEqual(at(r.layout,'notices'),[6,5,7,2,true]);assert.equal(r.swap,undefined);
 assert.equal(JSON.stringify(l),before);
});

test('releasing over another board swaps the two rectangles, even of different sizes',()=>{
 // Timetable (3 wide) dragged over meal (2 wide): its footprint would also cover two other
 // boards, but the board under the pointer decides.
 const r=L.drop(base(),'timetable',10,1,{x:12,y:3});
 assert.ok(r.ok);assert.equal(r.swap,'meal');
 assert.deepEqual(at(r.layout,'timetable'),[11,1,2,6,true]);
 assert.deepEqual(at(r.layout,'meal'),[1,1,3,6,true]);
 const big=L.drop(base(),'notices',4,3,{x:6,y:2});
 assert.ok(big.ok);assert.equal(big.swap,'morning');assert.ok(L.isValid(big.layout));
 const stacked=L.move(base(),'notices',4,1);
 assert.ok(stacked.ok);assert.equal(stacked.swap,'morning');
 assert.deepEqual(at(stacked.layout,'notices'),[4,1,7,4,true]);
 assert.deepEqual(at(stacked.layout,'morning'),[4,5,7,2,true]);
 assert.ok(L.isValid(stacked.layout));
});

test('a move that covers two boards or leaves the grid is refused',()=>{
 const two=L.move(base(),'timetable',4,1); // 3x6 at column 4 covers morning and notices
 assert.equal(two.ok,false);assert.equal(two.reason,'occupied');assert.deepEqual(two.target,{x:4,y:1,w:3,h:6});
 const out=L.move(base(),'meal',12,1);
 assert.equal(out.ok,false);assert.equal(out.reason,'bounds');
 assert.equal(L.move(withItems({meal:{visible:false}}),'meal',11,1).reason,'hidden');
 const empty=L.drop(withItems({meal:{visible:false}}),'timetable',10,1,{x:11,y:2});
 assert.equal(empty.ok,false,'over an empty cell the footprint still must fit');assert.equal(empty.reason,'occupied');
});

test('keyboard nudges move into empty cells or swap with the neighbour on that side',()=>{
 const noMeal=withItems({meal:{visible:false}});
 const right=L.nudge(noMeal,'notices',1,0);
 assert.ok(right.ok);assert.deepEqual(at(right.layout,'notices'),[5,5,7,2,true]);assert.equal(right.swap,undefined);
 const swap=L.nudge(base(),'timetable',1,0);
 assert.ok(swap.ok);assert.equal(swap.swap,'morning','first row neighbour on the right');
 const meal=L.nudge(base(),'meal',-1,0);
 assert.equal(meal.swap,'morning');
 const down=L.nudge(base(),'morning',0,1);
 assert.equal(down.swap,'notices');assert.deepEqual(at(down.layout,'morning'),[4,5,7,2,true]);
 assert.equal(L.nudge(base(),'timetable',-1,0).reason,'bounds');
});

test('resizing is limited by the grid, the 2x2 minimum and other boards',()=>{
 const free=withItems({meal:{visible:false}});
 const wide=L.resize(free,'notices',9,2);
 assert.ok(wide.ok);assert.deepEqual(at(wide.layout,'notices'),[4,5,9,2,true]);
 assert.equal(L.resize(free,'notices',10,2).reason,'bounds');
 assert.equal(L.resize(free,'notices',1,2).reason,'minimum');
 assert.equal(L.resize(free,'notices',7,1).reason,'minimum');
 assert.equal(L.resize(base(),'notices',8,2).reason,'occupied');
 assert.equal(L.resize(base(),'morning',7,5).reason,'occupied');
 const smaller=L.resize(base(),'morning',5,3);
 assert.ok(smaller.ok);assert.deepEqual(at(smaller.layout,'morning'),[4,1,5,3,true]);
});

test('hiding frees the cells; showing returns to the old place when it is still empty',()=>{
 const hidden=L.hide(base(),'meal').layout;
 assert.deepEqual(at(hidden,'meal'),[11,1,2,6,false]);
 assert.deepEqual(L.emptyRegions(hidden),[{x:11,y:1,w:2,h:6}]);
 const back=L.show(hidden,'meal');
 assert.ok(back.ok);assert.deepEqual(at(back.layout,'meal'),[11,1,2,6,true]);
});

test('showing finds the largest empty space when the old place is taken, or refuses',()=>{
 const taken=L.resize(L.hide(base(),'meal').layout,'morning',8,4).layout; // column 11 rows 1-4 now used
 const back=L.show(taken,'meal');
 assert.ok(back.ok);assert.deepEqual(at(back.layout,'meal'),[11,5,2,2,true]);assert.ok(L.isValid(back.layout));
 const full=L.fill(L.hide(base(),'meal').layout).layout;
 const none=L.show(full,'meal');
 assert.equal(none.ok,false);assert.equal(none.reason,'no-space');assert.equal(none.layout.items.meal.visible,false);
});

test('dropping a hidden board takes the largest empty rectangle covering the cell',()=>{
 const hidden=L.hide(base(),'meal').layout;
 const r=L.placeAt(hidden,'meal',12,6);
 assert.ok(r.ok);assert.deepEqual(at(r.layout,'meal'),[11,1,2,6,true]);
 const occupied=L.placeAt(hidden,'meal',5,2);
 assert.equal(occupied.ok,false);assert.equal(occupied.reason,'no-space');
});

test('filling empty space grows the neighbouring boards',()=>{
 const noMeal=L.fill(L.hide(base(),'meal').layout);
 assert.ok(noMeal.changed);
 assert.deepEqual(at(noMeal.layout,'morning'),[4,1,9,4,true]);
 assert.deepEqual(at(noMeal.layout,'notices'),[4,5,9,2,true]);
 assert.deepEqual(L.emptyRegions(noMeal.layout),[]);
 const noMorning=L.fill(L.hide(base(),'morning').layout).layout;
 assert.deepEqual(at(noMorning,'notices'),[4,1,7,6,true]);
 const noTimetable=L.fill(L.hide(base(),'timetable').layout).layout;
 assert.deepEqual(at(noTimetable,'morning'),[1,1,10,4,true]);
 assert.equal(L.fill(base()).changed,false);
 assert.ok(L.isValid(noMeal.layout)&&L.isValid(noMorning)&&L.isValid(noTimetable));
});

test('old size and visibility settings migrate to the nearest grid',()=>{
 assert.ok(L.equal(L.migrate(),L.defaults()));
 assert.ok(L.equal(L.migrate({sizes:{columns:[.21,.61,.18],row:.69}}),base()),'previous default ratios keep the previous board');
 const wide=L.migrate({sizes:{columns:[100,300,200],row:.5},preferences:{meal:{visible:false,scale:1.2},morning:{visible:true}}});
 assert.deepEqual(at(wide,'timetable'),[1,1,2,6,true]);
 assert.deepEqual(at(wide,'morning'),[3,1,6,3,true]);
 assert.deepEqual(at(wide,'notices'),[3,4,6,3,true]);
 assert.deepEqual(at(wide,'meal'),[9,1,4,6,false]);
 const extreme=L.migrate({sizes:{columns:[.9,.05,.05],row:.95}});
 assert.ok(L.isValid(extreme));assert.ok(extreme.items.morning.w>=2&&extreme.items.notices.h>=2);
 const odd=L.migrate({sizes:{columns:[1,'x',2],row:'top'},preferences:'bad'});
 assert.ok(L.equal(odd,L.defaults()));
});

test('saved, missing and broken values resolve to a usable layout',()=>{
 const saved=L.move(base(),'timetable',11,1).layout;
 assert.equal(L.resolve(saved).source,'saved');assert.ok(L.equal(L.resolve(saved).layout,saved));
 const migrated=L.resolve(null,{preferences:{notices:{visible:false}}});
 assert.equal(migrated.source,'migrated');assert.equal(migrated.layout.items.notices.visible,false);
 for(const broken of ['{"x":',{version:1},withItems({meal:{x:9,w:4}}),withItems({timetable:{w:0}})]){
  const r=L.resolve(broken,{preferences:{meal:{visible:false}}});
  assert.equal(r.source,'invalid');assert.ok(L.equal(r.layout,L.defaults()));
  const rb=L.resolve(broken,{preferences:{meal:{visible:false}}},'B');
  assert.equal(rb.source,'invalid');assert.ok(L.equal(rb.layout,L.defaults('B')));
 }
 // Structure B starts from its own default; the old settings only ever described structure A.
 const fresh=L.resolve(null,{preferences:{notices:{visible:false}}},'B');
 assert.equal(fresh.source,'default');assert.ok(L.equal(fresh.layout,L.defaults('B')));
 assert.equal(L.resolve(saved,null,'B').source,'saved');assert.ok(L.equal(L.resolve(saved,null,'B').layout,saved));
});
