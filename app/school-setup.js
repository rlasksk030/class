// The first step also remains available from Settings after onboarding.
function createSchoolSetup({desktop,context,onSchool}){
 const byId=id=>document.getElementById(id);
 const status=byId('schoolStatus'),options=byId('schoolResults');
 let selected=null,sequence=0,choices=[];
 function show(school){
  selected=school;
  byId('schoolSelected').textContent=school?`${school.SCHUL_NM} · ${school.ATPT_OFCDC_SC_NM||school.ATPT_OFCDC_SC_CODE} · ${school.SD_SCHUL_CODE}`:'학교를 선택해 주세요.';
  byId('grade').disabled=!school;byId('classroom').disabled=!school;
  onSchool(school);
 }
 function results(rows){
  choices=rows;options.replaceChildren(new Option('검색 결과에서 선택',''));
  for(const [i,s] of rows.entries())options.add(new Option([s.SCHUL_NM,s.ORG_RDNMA||s.ATPT_OFCDC_SC_NM,s.SD_SCHUL_CODE].join(' · '),String(i)));
  options.disabled=!rows.length;
 }
 function saved(active){
  sequence++;const list=new Map(context.schools.map(s=>[Schools.id(s),s]));
  if(active)list.set(Schools.id(active),active);
  results([...list.values()]);show(active);
  status.textContent=list.size?'사용한 학교를 선택하거나 다른 학교를 검색하세요.':'학교 이름을 입력한 뒤 검색하세요.';
  byId('neisGuide').open=!active&&!context.hasKey;
  byId('schoolChooser').open=!active;
 }
 options.onchange=()=>{if(options.value!=='')show(choices[Number(options.value)]);};
 async function search(){
  const q=byId('schoolName').value.trim(),office=byId('schoolOffice').value;
  const run=++sequence;
  if(q.length<2){status.textContent='학교 이름을 두 글자 이상 입력해 주세요.';return;}
  results([]);status.textContent='초등학교를 찾고 있습니다…';
  try{
   const url=new URL('https://open.neis.go.kr/hub/schoolInfo');
   url.search=new URLSearchParams({Type:'json',pIndex:'1',pSize:'100',SCHUL_NM:q,SCHUL_KND_SC_NM:'초등학교',...(office?{ATPT_OFCDC_SC_CODE:office}:{})});
   const json=await desktop.fetch(url.href);if(run!==sequence)return;
   const found=Core.rows(json,'schoolInfo').filter(s=>s.SCHUL_KND_SC_NM==='초등학교'&&s.SCHUL_NM.includes(q)&&(!office||s.ATPT_OFCDC_SC_CODE===office)).map(Schools.normalize);
   const total=json.schoolInfo?.[0]?.head?.[0]?.list_total_count||0;
   results(found);
   status.textContent=found.length?`${found.length}개 학교를 표시합니다. 주소와 학교코드를 확인해 선택하세요.`+(total>found.length?' 결과가 더 있습니다. 지역이나 전체 학교명으로 좁혀 주세요.':''):'일치하는 초등학교가 없습니다. 이름과 지역을 확인해 주세요.';
  }catch{if(run===sequence)status.textContent='학교 검색에 연결하지 못했습니다. 저장한 학교를 다시 열거나 학교코드로 직접 입력할 수 있습니다.';}
 }
 byId('schoolSearch').onclick=search;
 byId('schoolName').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();search();}};
 byId('schoolManualApply').onclick=()=>{
  try{const office=byId('schoolOffice'),school=Schools.normalize({ATPT_OFCDC_SC_CODE:office.value,ATPT_OFCDC_SC_NM:office.selectedOptions[0].textContent,SD_SCHUL_CODE:byId('schoolCode').value.trim(),SCHUL_NM:byId('schoolName').value.trim(),SCHUL_KND_SC_NM:'초등학교'});
   sequence++;show(school);status.textContent='입력한 학교를 선택했습니다. 학교코드를 한 번 더 확인해 주세요.';
  }catch{status.textContent='학교명, 소속 교육청, 일곱 자리 표준학교코드를 모두 입력해 주세요.';}
 };
 byId('neisHome').onclick=()=>desktop.openNeisPortal('home');
 byId('neisApply').onclick=()=>desktop.openNeisPortal('apply');
 byId('neisTest').onclick=async()=>{
  const button=byId('neisTest'),input=byId('neisKey');button.disabled=true;
  try{await desktop.testNeisKey(input.value);input.value='';context.hasKey=true;byId('neisStatus').textContent='연결 성공 · 인증키를 이 PC에 암호화해 저장했습니다.';}
  catch{byId('neisStatus').textContent='연결하지 못했습니다. 입력한 인증키와 인터넷 연결을 확인해 주세요. 기존 인증키는 유지됩니다.';}
  finally{button.disabled=false;}
 };
 byId('neisSkip').onclick=()=>{byId('neisGuide').open=false;byId('schoolChooser').open=true;byId('schoolName').focus();};
 byId('neisStatus').textContent=context.hasKey?'이 PC에 인증키가 저장되어 있습니다.':'인증키 없이도 학교 검색과 수동 학급 운영이 가능합니다.';
 return {saved,get selected(){return selected;}};
}
