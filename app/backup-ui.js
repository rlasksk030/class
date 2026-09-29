// Backup and restore inside the existing settings dialog. Login sessions are never part of a backup.
(() => {
 const form=document.getElementById('settingsForm');if(!form||!window.BackupCore)return;
 const box=document.createElement('fieldset');box.className='backup-settings';
 box.innerHTML='<legend>백업 / 복원</legend><p>학급 설정과 작성한 내용을 파일 하나로 보관하거나 다른 PC로 옮깁니다. 하이클래스 로그인 정보는 포함되지 않습니다.</p><div class="backup-actions"><button type="button" id="backupCreate">백업 파일 만들기</button><button type="button" id="backupRestore">백업 파일로 복원</button></div><p id="backupStatus" role="status"></p>';
 form.querySelector('.actions').before(box);
 const confirmDialog=document.createElement('dialog');confirmDialog.id='backupConfirmDialog';
 confirmDialog.innerHTML='<form method="dialog"><h2>백업 복원</h2><p id="backupConfirmInfo"></p><p>백업 내용을 복원하면 현재 설정과 작성 내용 일부가 변경됩니다.<br>계속하시겠습니까?</p><div class="actions"><button value="cancel">취소</button><button value="restore" class="primary">복원</button></div></form>';
 document.body.append(confirmDialog);
 const $=id=>document.getElementById(id),status=text=>{$('backupStatus').textContent=text;};
 let busy=false;
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
  if(busy||window.dashboardLocked)return;busy=true;$('backupCreate').disabled=$('backupRestore').disabled=true;
  try{await task();}finally{busy=false;$('backupCreate').disabled=$('backupRestore').disabled=false;}
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
  $('backupConfirmInfo').textContent=`${Number.isNaN(made.getTime())?'':made.toLocaleString('ko-KR')+' · '}${b.grade&&b.classroom?`${b.grade}학년 ${b.classroom}반`:'학년·반 정보 없음'}${b.appVersion?' · 앱 '+b.appVersion:''}`;
  confirmDialog.returnValue='';confirmDialog.showModal();
  const answer=await new Promise(resolve=>confirmDialog.addEventListener('close',()=>resolve(confirmDialog.returnValue),{once:true}));
  if(answer!=='restore'||window.dashboardLocked){status('복원을 취소했습니다.');return;}
  try{
   if(window.desktop?.backupKeep)await window.desktop.backupKeep(JSON.stringify(await snapshot()));
   window.dashboardRestoring=true; // stop in-memory state from being written back while the page reloads
   BackupCore.apply(localStorage,parsed.entries);
  }catch{window.dashboardRestoring=false;status('복원하지 못했습니다. 기존 데이터는 그대로 유지됩니다.');return;}
  status('복원이 완료되었습니다. 화면을 다시 불러옵니다…');
  setTimeout(()=>location.reload(),600);
 });
})();
