(function(root){
 const legacy=Object.freeze({ATPT_OFCDC_SC_CODE:'P10',ATPT_OFCDC_SC_NM:'전북특별자치도교육청',SD_SCHUL_CODE:'8342104',SCHUL_NM:'옥구초등학교',SCHUL_KND_SC_NM:'초등학교',LCTN_SC_NM:'전북특별자치도',ORG_RDNMA:'전북특별자치도 군산시 옥구읍 옥구로 50'});
 const fields=Object.keys(legacy);
 function normalize(row){
  if(!row||row.SCHUL_KND_SC_NM!=='초등학교'||!/^([A-Z][0-9]{2})$/.test(row.ATPT_OFCDC_SC_CODE)||!/^\d{7}$/.test(row.SD_SCHUL_CODE)||!String(row.SCHUL_NM||'').trim())throw Error('초등학교 이름과 교육청·학교 코드를 확인해 주세요.');
  return Object.fromEntries(fields.map(key=>[key,String(row[key]||'').trim().slice(0,240)]));
 }
 function id(row){const s=normalize(row);return s.ATPT_OFCDC_SC_CODE+'-'+s.SD_SCHUL_CODE;}
 const api={legacy,normalize,id};
 if(typeof module!=='undefined')module.exports=api;else root.Schools=api;
})(globalThis);
