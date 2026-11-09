'use strict';
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
// Draft dates identify local work. Immediate publication has no requested
// server date: obtain that date from the new, independently reread post.
function immediateEvidence(d){return d?.verified===true&&d.source==='observed-service-ui'&&
 d.meaning==='publication-mode'&&d.mode==='immediate'&&d.value===null&&d.writable===false;}
function contentDateMatches(actual,note,mode='fixed',published=false){
 if(mode!=='immediate')return actual?.date===note.date;
 return actual?.publicationMode==='immediate'&&actual.draftDate===note.date&&
  (published?validDate(actual.date)&&actual.dateSource==='observed-service-ui':actual.date===null);
}
module.exports={validDate,immediateEvidence,contentDateMatches};
