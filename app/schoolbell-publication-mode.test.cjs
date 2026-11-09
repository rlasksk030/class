const {test}=require('node:test'),assert=require('node:assert/strict');
const {readPublicationMode}=require('./schoolbell-publication-mode.cjs');
const {publicationDate}=require('./schoolbell-final-guard.cjs');
test('observed radio labels must be unique and exclusive; lack of HTML name does not invent a date field',()=>{
 const rows=[{labels:[{textContent:'즉시발행하기'}],checked:true,disabled:false},{labels:[{textContent:'예약발행하기'}],checked:false,disabled:false}];
 const doc={querySelectorAll:s=>s==='app-boards-write'?[{}]:rows};
 assert.deepEqual(readPublicationMode(doc),{known:true,mode:'immediate',dateSelectable:false});
 rows[1].checked=true;assert.equal(readPublicationMode(doc).known,false);
 rows[0].checked=false;assert.equal(readPublicationMode(doc).mode,'scheduled');
 rows.push(rows[0]);assert.equal(readPublicationMode(doc).known,false);
});
test('an observed immediate mode has no pre-send server date and still requires fresh bound evidence',()=>{
 const target={schoolId:'synthetic',schoolName:'합성',year:'2026',grade:'6',classroom:'1',classKey:'2026:6:1'};
 const binding={boardId:'1',contextId:'2',actorKey:'3'},now=Date.now();
 const e={verified:true,source:'observed-service-ui',meaning:'publication-mode',mode:'immediate',value:null,writable:false,scope:{...target,...binding},observedAt:now};
 const options={target,binding,note:{date:'2026-11-01'},now};assert.equal(publicationDate(e,options),null);
 for(const patch of [{value:'2026-11-01'},{mode:'scheduled'},{verified:false},{observedAt:now-15001},{scope:{...e.scope,boardId:'other'}}])assert.throws(()=>publicationDate({...e,...patch},options),/date-unverified/);
});
