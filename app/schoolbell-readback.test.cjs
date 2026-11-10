const {test}=require('node:test'),assert=require('node:assert/strict');
const {summarizeReadback,readbackMessage}=require('./schoolbell-readback.cjs');
const {hash}=require('./media-store.cjs');
test('read-only report compares downloaded bytes and order without exposing bodies or post identifiers',()=>{
 const files=[Buffer.from('first original'),Buffer.from('second original')];
 const note={title:'synthetic title',body:'synthetic\nbody',photos:files.map(b=>({sha256:hash(b),bytes:b.length}))};
 const data={complete:true,refreshed:true,ids:['private-id'],filter:{title:note.title},posts:[{kind:'published',title:note.title,body:note.body,date:'2026-11-09',
  attachments:{complete:true,items:files.map(bytes=>({state:'complete',source:'original-download',bytes}))}}]};
 const report=summarizeReadback(data,note);
 assert.equal(report.posts[0].photosMatch,true);assert.equal(report.posts[0].bodyMatches,true);
 assert.ok(!JSON.stringify(report).includes('private-id'));assert.ok(!JSON.stringify(report).includes(note.body));
 assert.match(readbackMessage({...report,draftDate:'2026-11-09'}),/중복 등록/);
 note.photos.reverse();assert.equal(summarizeReadback(data,note).posts[0].photosMatch,false);
 data.complete=false;assert.throws(()=>summarizeReadback(data,note),/baseline-unverified/);
 data.complete=true;data.posts[0].attachments.items[0].source='thumbnail';
 assert.throws(()=>summarizeReadback(data,note),/publication-unverified/);
});
