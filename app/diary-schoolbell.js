// Common editor owns draft snapshots/completion. Production capability remains code-gated.
window.createDiaryServices = function({root,readNote,save,target,isBusy,status,photoHelp,onHiclass,onAutomaticPublish,onAutomaticVerify}) {
 const $ = id=>root.querySelector('#'+id);
 const selector=document.createElement('label');
 selector.className='diary-service-selector';
 selector.innerHTML='<span>발행 서비스</span><select id="diaryService"><option value="hiclass">하이클래스</option><option value="schoolbell">학교종이</option></select>';
 $('diaryHiclass').before(selector);
 const panel=document.createElement('section'); panel.id='diarySchoolbell'; panel.hidden=true;
 panel.innerHTML='<div class="diary-hiclass-line schoolbell-connect-line"><strong>학교종이</strong><button id="schoolbellOpen" class="primary">학교종이 연결하기</button><button id="schoolbellInspect">연결 상태 확인</button></div>'+
  '<p id="schoolbellState" role="status"></p><p id="schoolbellExpected"></p>'+
  '<p id="schoolbellAutomaticState" role="status">자동 등록 잠김 · 허용 여부 및 실제 게시 검증 대기</p>'+
  '<p>연결하기 → 앱 전용 창에서 직접 로그인 → 담당 학급의 알림장을 여세요. 외부 브라우저 로그인 정보는 가져오지 않습니다.</p>'+
  '<p>학교종이는 즉시발행으로 연결합니다. 앱 작성일은 초안 구분용이며 학교종이 게시 날짜를 지정하지 않습니다. 실제 발행일은 게시 후 확인합니다.</p>'+
  '<details><summary>기존 게시물 조회 확인</summary><p>현재 초안과 같은 제목의 게시물만 열어 본문과 첨부 원본을 비교합니다. 새 게시물은 만들지 않습니다.</p><button id="schoolbellCheckPosts">현재 초안으로 게시물 조회</button></details>'+
  '<details id="schoolbellDevelopment" hidden><summary>개발 시험 · 사용자 승인</summary><p>운영 잠금과 분리된 1회 시험입니다. 실제 학급·빈 수신자 상태를 확인하고 학교 설정 연결 및 관리자 본인 여부를 사용자 확인 기록으로 남깁니다.</p><button id="schoolbellAuthorizeTest">현재 테스트 학급 연결 승인</button><p>이미 작성 화면에 올린 시험 사진만 확인하려면 아래 검사를 사용하세요.</p><button id="schoolbellCheckUploads">첨부 원본 확인 (게시 안 함)</button></details>'+
  '<details id="schoolbellManual"><summary>수동 발행 도우미 (임시 대체 기능)</summary>'+
  '<p>이 기능은 자동 등록과 별개입니다. 로그인·학급 일치·게시 결과를 학교종이에서 직접 확인합니다.</p>'+
  '<details id="schoolbellConnection"><summary>담당 학급 직접 확인</summary>'+
  '<p>학교종이에서 담당 학급 → 알림장을 연 뒤, 그 화면에 표시된 학교·학년도·학년·반을 입력하세요.</p>'+
  '<div class="schoolbell-match"><label>화면의 학교명 <input id="schoolbellSchool" autocomplete="off"></label>'+
  '<label>학년도 <input id="schoolbellYear" inputmode="numeric" size="4"></label>'+
  '<label>학년 <input id="schoolbellGrade" inputmode="numeric" size="2"></label>'+
  '<label>반 <input id="schoolbellClass" size="5"></label><button id="schoolbellLink">담당 학급 직접 확인</button></div></details>'+
  '<div class="diary-actions"><button id="schoolbellPrepare">수동 발행 준비</button><button id="schoolbellCopyTitle">제목 복사</button>'+
  '<button id="schoolbellCopyBody">본문 복사</button><button id="schoolbellPhotos">사진 순서대로 저장</button>'+
  '</div>'+
  '<p>복사 후 학교종이 알림장 [작성하기]에 붙여넣고 사진을 직접 첨부하세요. 날짜·학급·사진을 확인한 뒤 직접 발행합니다.</p>'+
  '<details><summary>수동 발행 결과 및 기록</summary><p>결과를 모르면 다시 준비하지 말고 학교종이의 게시물을 먼저 확인하세요.</p><div id="schoolbellHistory"></div></details></details>'+
  '<details><summary>자동 등록 시도 기록</summary><p>미확인 시도는 자동 재전송하지 않습니다. 사용자 확인은 자동 검증 성공과 별도로 보관합니다.</p><div id="schoolbellAutoHistory"></div></details>';
 $('diaryHiclass').after(panel);
 const autoButton=document.createElement('button');autoButton.id='schoolbellPublish';autoButton.textContent='학교종이 등록';autoButton.disabled=true;autoButton.hidden=true;
 autoButton.title='공식 허용 방식과 실제 게시 검증 대기';$('diaryPublish').after(autoButton);
 let service='hiclass',busy=false,loading=false,generation=0,currentKey='',automaticEnabled=false;
 const controls=()=>[...panel.querySelectorAll('button:not([title])')];
 function paint(data) {
  service=data.service||'hiclass'; $('diaryService').value=service;
  const manual=service==='schoolbell';
  $('diaryHiclass').hidden=manual;panel.hidden=!manual;
  root.querySelector('.diary-recipients').hidden=manual;$('diaryPublish').hidden=manual;
  const trial=data.developmentTrial?.enabled===true;
  automaticEnabled=data.capability?.enabled===true||trial;
  $('schoolbellDevelopment').hidden=data.developmentChecks!==true;
  autoButton.hidden=!manual;autoButton.disabled=!automaticEnabled||busy;
  autoButton.title=trial?data.developmentTrial.message:data.capability?.message||'자동 등록 연결 확인 필요';
  autoButton.setAttribute('aria-describedby','schoolbellAutomaticState');
  $('schoolbellAutomaticState').textContent=trial?data.developmentTrial.message:data.capability?.message||'자동 등록 잠김 · 연결 정보를 확인할 수 없습니다.';
  photoHelp.textContent=manual?(trial?'개발 시험: 등록 버튼으로 사진을 자동 첨부하고 원본·순서를 대조합니다. 게시 직전에 다시 확인합니다.':'사진은 초안에 보관됩니다. 번호순으로 저장한 파일을 학교종이에 직접 첨부하고 개수와 순서를 확인하세요.'):'사진은 표시된 순서로 하이클래스에 첨부됩니다. 업로드와 등록 확인이 끝날 때까지 초안을 보존합니다.';
  $('schoolbellState').textContent=data.connection?.message||'앱 전용 창에서 직접 로그인해 주세요.';
  const to=target();$('schoolbellExpected').textContent='우리 교실 설정: '+(settings.school?.SCHUL_NM||'옥구초등학교')+' '+to.label;
  $('schoolbellHistory').replaceChildren(...(data.posts||[]).slice().reverse().map(post=>{
   const row=document.createElement('div');row.className='schoolbell-history-row';
   const label=document.createElement('span');
   label.textContent=post.date+' · 사진 '+post.photoCount+'장 · '+({'manual-pending':'게시 결과 미확인','manual-confirmed':'수동 게시 · 사용자 확인','manual-not-posted':'미게시 · 사용자 확인'}[post.status]||'확인 필요');
   row.append(label);
   if(post.status==='manual-pending') for(const [text,outcome] of [['실제 게시 확인','manual-confirmed'],['게시 안 됨 확인','manual-not-posted']]){
    const button=document.createElement('button');button.textContent=text;
    button.onclick=()=>run(()=>desktop.schoolbellResolve({classKey:currentKey,hash:post.hash,outcome}));
    row.append(button);
   }
   return row;
  }));
  $('schoolbellAutoHistory').replaceChildren(...(data.automaticPosts||[]).slice().reverse().map(post=>{
   const row=document.createElement('div');row.className='schoolbell-history-row';
   const label=document.createElement('span');label.textContent=(post.publication?.executionMode==='development-test'?'개발 시험 · ':'')+(post.publication?.dateMode==='immediate'?'작성일 '+post.date+' · 발행일 '+post.publication.publishedDate:post.date)+' · 사진 '+post.photoCount+'장 · '+({
    'auto-pending':'자동 시도 · 결과 미확인','auto-uncertain':'자동 시도 · 결과 불확실',
    'auto-success':'자동 게시 · 결과 검증됨','auto-user-confirmed':'자동 시도 후 게시 · 사용자 확인',
    'auto-user-not-posted':'자동 시도 후 미게시 · 사용자 확인'}[post.status]||'확인 필요')+(post.reconciliation?' · 재전송 없이 재검증':'');row.append(label);
   if(data.developmentChecks&&post.status==='auto-uncertain'&&post.stage==='verifying'&&typeof onAutomaticVerify==='function'){
    const verify=document.createElement('button');verify.textContent='게시 결과 재검증 (재전송 없음)';
    verify.onclick=()=>run(()=>onAutomaticVerify(post.id));row.append(verify);
   }
   if(['auto-pending','auto-uncertain'].includes(post.status))for(const [text,outcome] of [['실제 게시 확인','auto-user-confirmed'],['게시 안 됨 확인','auto-user-not-posted']]){
    const button=document.createElement('button');button.textContent=text;button.onclick=()=>run(()=>desktop.schoolbellResolveAutomatic({classKey:currentKey,id:post.id,outcome}));row.append(button);
   }
   return row;
  }));
  $('schoolbellCopyTitle').disabled=$('schoolbellCopyBody').disabled=$('schoolbellPhotos').disabled=!(data.posts||[]).some(p=>p.status==='manual-pending');
 }
 async function refresh() {
  const id=++generation,to=target();currentKey=to.classKey;
  loading=true;automaticEnabled=false;autoButton.disabled=true;$('diaryService').disabled=true;
  try {
   const data=await desktop.diaryServiceStatus(to.classKey);
   if(id!==generation||to.classKey!==target().classKey)return;
   if(data.status)throw Error();
   paint(data);
   loading=false;$('diaryService').disabled=false;$('diaryPublish').disabled=isBusy();
  } catch { if(id!==generation||to.classKey!==target().classKey)return;loading=false;service='unavailable';status('발행 서비스 설정을 읽지 못했습니다. 다시 알림장을 열어 주세요.');$('diaryService').disabled=true;$('diaryPublish').disabled=true; }
 }
 async function run(action) {
  if(busy||loading||isBusy()||!save())return;
  const origin=target().classKey;busy=true;autoButton.disabled=true;$('diaryService').disabled=true;
  for(const b of controls())b.disabled=true;
  try { const result=await action();if(origin===target().classKey)status(result?.message||'작업 결과를 확인해 주세요.');return result; }
  catch { if(origin===target().classKey)status('학교종이 작업을 마치지 못했습니다. 초안과 사진은 유지됩니다.'); }
  finally {busy=false;$('diaryService').disabled=false;for(const b of controls())b.disabled=false;await refresh();}
 }
 $('diaryService').onchange=async()=>{
  const next=$('diaryService').value;
  if(busy||loading||isBusy()||!save()){$('diaryService').value=service;return;}
  await run(async()=>{
   const closed=await desktop.diaryClose();
   if(!closed.closed){$('diaryService').value=service;return closed;}
   const result=await desktop.diaryServiceSelect({classKey:target().classKey,service:next});
   if(!result.status){if(next==='hiclass')onHiclass();return {...result,message:'발행 서비스를 저장했습니다. 공통 초안과 사진은 유지됩니다.'};}
   return result;
  });
 };
 const to=()=>({...target(),year:target().classKey.split(':')[0]});
 $('schoolbellOpen').onclick=()=>run(()=>desktop.schoolbellOpen(to()));
 $('schoolbellInspect').onclick=()=>run(()=>desktop.schoolbellInspect(to()));
 $('schoolbellCheckPosts').onclick=()=>run(()=>desktop.schoolbellCheckPosts({target:to(),note:readNote()}));
 $('schoolbellCheckUploads').onclick=()=>run(()=>desktop.schoolbellCheckUploads({target:to(),note:readNote()}));
 $('schoolbellAuthorizeTest').onclick=()=>run(()=>desktop.schoolbellAuthorizeTest(to()));
 $('schoolbellLink').onclick=()=>run(()=>desktop.schoolbellLink({...to(),observed:{schoolName:$('schoolbellSchool').value,year:$('schoolbellYear').value,grade:$('schoolbellGrade').value,classroom:$('schoolbellClass').value}}));
 $('schoolbellPrepare').onclick=()=>run(async()=>{
  return desktop.schoolbellPrepare(readNote());
 });
 for(const part of ['Title','Body'])$('schoolbellCopy'+part).onclick=()=>run(()=>desktop.schoolbellCopy({note:readNote(),part:part.toLowerCase()}));
 $('schoolbellPhotos').onclick=()=>run(()=>desktop.schoolbellPhotos(readNote()));
 autoButton.onclick=()=>{
  if(service!=='schoolbell'||!automaticEnabled||typeof onAutomaticPublish!=='function')return;
  return run(onAutomaticPublish);
 };
 // Returning from the app-owned login window refreshes only sanitized window
 // state. A loaded page is never promoted to authenticated/authorized status.
 window.addEventListener('focus',()=>{if(!root.hidden&&!busy&&!loading&&!isBusy())void refresh();});
 return {refresh,busy:()=>busy||loading,service:()=>service};
};
