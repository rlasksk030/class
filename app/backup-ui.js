// Backup and restore inside the existing settings dialog. Login sessions are never part of a backup.
(() => {
 const form=document.getElementById('settingsForm');if(!form||!window.BackupCore)return;
 const box=document.createElement('fieldset');box.className='backup-settings';
 box.innerHTML='<legend>백업 / 복원</legend><p>학급 설정과 작성한 내용을 파일 하나로 보관하거나 다른 PC로 옮깁니다. 하이클래스 로그인 정보는 포함되지 않습니다.</p><div class="backup-actions"><button type="button" id="backupCreate">백업 파일 만들기</button><button type="button" id="backupRestore">백업 파일로 복원</button><button type="button" id="recoveryFind">이전 데이터 찾기</button></div><p id="backupStatus" role="status"></p>';
 form.querySelector('.actions').before(box);
 const confirmDialog=document.createElement('dialog');confirmDialog.id='backupConfirmDialog';
 confirmDialog.innerHTML='<form method="dialog"><h2>백업 복원</h2><p id="backupConfirmInfo"></p><p>백업 내용을 복원하면 현재 설정과 작성 내용 일부가 변경됩니다.<br>계속하시겠습니까?</p><div class="actions"><button value="cancel">취소</button><button value="restore" class="primary">복원</button></div></form>';
 document.body.append(confirmDialog);
 const recoveryDialog=document.createElement('dialog');recoveryDialog.id='recoveryDialog';recoveryDialog.className='recovery-dialog';
 recoveryDialog.innerHTML='<h2>이전 데이터 찾기</h2><p>업데이트 직전 자동 백업, 복원 직전 보관본, 또는 다른 위치의 우리 교실 데이터 폴더에서 이전 내용을 가져옵니다. 원본은 바꾸지 않으며, 복원 전에 지금 데이터를 자동으로 보관합니다.</p><div id="recoveryList"></div><p id="recoveryStatus" role="status"></p><div class="actions"><button type="button" id="recoveryFolder">다른 폴더에서 찾기</button><button type="button" id="recoveryClose">닫기</button></div>';
 document.body.append(recoveryDialog);
 const $=id=>document.getElementById(id),status=text=>{$('backupStatus').textContent=text;};
 let busy=false;
 const reload=()=>window.desktop?.reloadAfterRestore?window.desktop.reloadAfterRestore():location.reload();
 const current=()=>BackupCore.collect(key=>localStorage.getItem(key));
 async function appVersion(){try{return (await window.desktop?.updateState?.())?.currentVersion||'';}catch{return '';}}
 async function snapshot(){return BackupCore.create(key=>localStorage.getItem(key),{appVersion:await appVersion(),school:OKGU_SCHOOL.SCHUL_NM,academicYear:academicYear()});}
 async function saveFile(name,text){
  if(window.desktop?.backupSave)return window.desktop.backupSave({name,text});
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);return {saved:true,name};
 }
 function openFile(){
  if(window.desktop?.backupOpen)return window.desktop.backupOpen();
  return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.onchange=async()=>{const f=input.files[0];resolve(f?{text:f.size>20*1024*1024?'':await f.text(),name:f.name}:{canceled:true});};input.oncancel=()=>resolve({canceled:true});input.click();});
 }
 async function guarded(task){
  if(busy||window.dashboardLocked)return;busy=true;$('backupCreate').disabled=$('backupRestore').disabled=$('recoveryFind').disabled=true;
  try{await task();}finally{busy=false;$('backupCreate').disabled=$('backupRestore').disabled=$('recoveryFind').disabled=false;}
 }
 $('backupCreate').onclick=()=>guarded(async()=>{
  status('백업 파일을 만드는 중입니다…');
  try{
   const backup=await snapshot(),text=JSON.stringify(backup,null,1);
   await BackupCore.parse(text); // the file must pass the same checks a restore will run
   const result=await saveFile(BackupCore.fileName(),text);
   status(result?.saved?`백업이 완료되었습니다. (${result.name})`:'백업을 취소했습니다.');
  }catch{status('백업 파일을 만들지 못했습니다. 현재 데이터는 그대로 유지됩니다.');}
 });
 $('backupRestore').onclick=()=>guarded(async()=>{
  let parsed;
  try{const file=await openFile();if(file?.canceled){status('');return;}status('백업 파일을 확인하는 중입니다…');parsed=await BackupCore.parse(file?.text);}
  catch(e){status(e?.message||BackupCore.INVALID);return;}
  const b=parsed.backup,made=new Date(b.createdAt);
  await confirmAndRestore(parsed.entries,`${Number.isNaN(made.getTime())?'':made.toLocaleString('ko-KR')+' · '}${b.grade&&b.classroom?`${b.grade}학년 ${b.classroom}반`:'학년·반 정보 없음'}${b.appVersion?' · 앱 '+b.appVersion:''}`,status);
 });
 async function restoreEntries(entries){
  if(window.desktop?.backupKeep)await window.desktop.backupKeep(JSON.stringify(await snapshot()));
  window.dashboardRestoring=true; // stop in-memory state from being written back while the page reloads
  try{BackupCore.apply(localStorage,entries);}catch(e){window.dashboardRestoring=false;throw e;}
 }
 async function confirmAndRestore(entries,info,report){
  $('backupConfirmInfo').textContent=info;
  confirmDialog.returnValue='';confirmDialog.showModal();
  const answer=await new Promise(resolve=>confirmDialog.addEventListener('close',()=>resolve(confirmDialog.returnValue),{once:true}));
  if(answer!=='restore'||window.dashboardLocked){report('복원을 취소했습니다.');return false;}
  try{await restoreEntries(entries);}catch{report('복원하지 못했습니다. 기존 데이터는 그대로 유지됩니다.');return false;}
  report('복원이 완료되었습니다. 화면을 다시 불러옵니다…');
  setTimeout(reload,600);return true;
 }
 // ---------- Earlier data: updater snapshots, pre-restore copies, another profile folder ----------
 const describe=s=>[s.grade&&s.classroom?`${s.grade}학년 ${s.classroom}반`:'학년·반 없음',s.morning?`아침활동 "${s.morning}"`:'',s.students?`학생 ${s.students}명`:'',s.ddays?`D-Day ${s.ddays}개`:'',s.whiteboard?`화이트보드 글상자 ${s.whiteboard}개`:''].filter(Boolean).join(' · ');
 async function load(source){
  if(source.format==='raw')return BackupCore.fromRaw(source.data);
  const parsed=await BackupCore.parse(source.text);const data={};for(const [k,v] of parsed.entries)data[k]=JSON.parse(v);return {data,entries:parsed.entries};
 }
 function addItem(title,when,loaded){
  const row=document.createElement('div');row.className='recovery-item';
  const text=document.createElement('div'),strong=document.createElement('strong'),small=document.createElement('span');
  strong.textContent=`${title}${when?' · '+when:''}`;small.textContent=BackupCore.hasUserData(loaded.data)?describe(BackupCore.summary(loaded.data)):'사용자 데이터 없음';text.append(strong,small);
  const button=document.createElement('button');button.type='button';button.textContent='이 데이터로 복원';button.disabled=!BackupCore.hasUserData(loaded.data);
  button.onclick=async()=>{recoveryDialog.close();await confirmAndRestore(loaded.entries,`${title}${when?' · '+when:''} · ${describe(BackupCore.summary(loaded.data))}`,status);};
  row.append(text,button);$('recoveryList').append(row);
 }
 $('recoveryFind').onclick=()=>guarded(async()=>{
  $('recoveryList').replaceChildren();$('recoveryStatus').textContent='찾는 중입니다…';recoveryDialog.showModal();
  let found=0;
  try{for(const s of await window.desktop.recoveryScan()){try{addItem(s.label,new Date(s.time).toLocaleString('ko-KR'),await load(await window.desktop.recoveryRead(s.id)));found++;}catch{}}}catch{}
  $('recoveryStatus').textContent=found?'':'이 PC의 우리 교실 데이터 폴더에서 이전 백업을 찾지 못했습니다. 다른 폴더에서 찾을 수 있습니다.';
 });
 $('recoveryFolder').onclick=async()=>{
  $('recoveryStatus').textContent='폴더를 확인하는 중입니다…';
  try{const r=await window.desktop.recoveryFolder();if(r?.canceled){$('recoveryStatus').textContent='';return;}if(r?.error){$('recoveryStatus').textContent=r.error;return;}addItem('선택한 폴더',r.source,await load(r));$('recoveryStatus').textContent='';}
  catch{$('recoveryStatus').textContent='선택한 폴더의 데이터를 읽지 못했습니다. 원본은 바뀌지 않았습니다.';}
 };
 $('recoveryClose').onclick=()=>recoveryDialog.close();
 // One-time automatic recovery: only when this profile holds no teacher data at all and the updater left a
 // snapshot with data (e.g. storage lost during an update). Never overwrites existing data.
 (async()=>{
  try{
   const note=sessionStorage.getItem('recoveryNotice');if(note){sessionStorage.removeItem('recoveryNotice');$('globalStatus').textContent=note;}
   if(!window.desktop?.recoveryScan||BackupCore.hasUserData(current()))return;
   for(const s of (await window.desktop.recoveryScan()).filter(x=>x.kind==='update')){
    const loaded=await load(await window.desktop.recoveryRead(s.id));
    if(!BackupCore.hasUserData(loaded.data))continue;
    await restoreEntries(loaded.entries);
    sessionStorage.setItem('recoveryNotice',`이전 데이터를 복구했습니다 (업데이트 직전 자동 백업 ${new Date(s.time).toLocaleString('ko-KR')}).`);
    setTimeout(reload,300);return;
   }
  }catch{window.dashboardRestoring=false;}
 })();
})();
