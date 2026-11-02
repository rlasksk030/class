(function(root){
 const dateKey=(d=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
 const schoolKey=s=>[s.school.ATPT_OFCDC_SC_CODE,s.school.SD_SCHUL_CODE,s.grade,s.classroom].join(':');
 const dataKey=(s,date,kind)=>`${schoolKey(s)}:${date}:${kind}`;
 const display=(override,cache)=>override!==undefined?override:cache?.data;
 function rows(json,endpoint){if(json.RESULT){if(json.RESULT.CODE==='INFO-200')return [];throw Error(json.RESULT.MESSAGE||'학교 서버 오류');}const group=json[endpoint];if(!group)throw Error('응답 형식 오류');return group.find(x=>x.row)?.row||[];}
 function schoolRows(json,endpoint,school){
  const result=rows(json,endpoint);
  for(const row of result){
   if((row.ATPT_OFCDC_SC_CODE&&row.ATPT_OFCDC_SC_CODE!==school.ATPT_OFCDC_SC_CODE)||
      (row.SD_SCHUL_CODE&&row.SD_SCHUL_CODE!==school.SD_SCHUL_CODE))throw Error('선택한 학교와 다른 NEIS 응답입니다.');
  }
  return result;
 }
 function morningDefault(saved,notes,today){
  if(typeof saved==='string')return saved;
  const latest=Object.keys(notes).filter(d=>d<=today&&typeof notes[d]?.morning==='string').sort().pop();
  return latest?notes[latest].morning:'';
 }
 const api={dateKey,schoolKey,dataKey,display,rows,schoolRows,morningDefault};if(typeof module!=='undefined')module.exports=api;else root.Core=api;
})(globalThis);
