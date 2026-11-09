'use strict';
const {hash}=require('./media-store.cjs');
// A read-only diagnostic, not a publication receipt or an authorization grant.
// Only the explicitly requested title is opened by the shared baseline reader.
function summarizeReadback(result,note){
 if(result?.complete!==true||result.refreshed!==true||!Array.isArray(result.ids)||
    !Array.isArray(result.posts)||result.filter?.title!==note.title)throw Error('baseline-unverified');
 const posts=result.posts.map(post=>{
  if(post.kind!=='published'||post.title!==note.title||post.attachments?.complete!==true||
     !Array.isArray(post.attachments.items))throw Error('publication-unverified');
  const photos=post.attachments.items.map(item=>{
   if(item.state!=='complete'||item.source!=='original-download'||!Buffer.isBuffer(item.bytes))throw Error('publication-unverified');
   return {sha256:hash(item.bytes),bytes:item.bytes.length};
  });
  return {date:post.date,bodyMatches:post.body.replace(/\r\n?/g,'\n')===note.body.replace(/\r\n?/g,'\n'),photos,
   photosMatch:photos.length===note.photos.length&&photos.every((p,i)=>p.sha256===note.photos[i].sha256&&p.bytes===note.photos[i].bytes)};
 });
 return {complete:true,totalPosts:result.ids.length,matchingTitles:posts.length,posts};
}
function readbackMessage(report){
 const matched=report.posts.filter(p=>p.bodyMatches&&p.photosMatch&&p.date===report.draftDate).length;
 return '게시물 조회 완료 · 전체 '+report.totalPosts+'건, 같은 제목 '+report.matchingTitles+'건. '+
  (report.matchingTitles?'본문 일치 '+report.posts.filter(p=>p.bodyMatches).length+'건, 원본 사진 '+report.posts.reduce((n,p)=>n+p.photos.length,0)+'장 다운로드 확인. ':'')+
  (matched?'날짜·본문·사진 순서까지 같은 게시물 '+matched+'건이 있어 중복 등록을 막아야 합니다. ':'현재 초안 전체와 같은 게시물은 확인되지 않았습니다. ')+
  '조회 결과이며 등록 성공 처리가 아닙니다. 초안과 사진은 유지됩니다.';
}
module.exports={summarizeReadback,readbackMessage};
