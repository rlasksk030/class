const {app,ipcMain,dialog}=require('electron');
const rawFs=require('original-fs').promises;
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
module.exports=function setupUpdates(getMain){
 const config=require('./update-config.json');
 let status={phase:'idle',currentVersion:app.getVersion()},updater,busy=false,checking=false;
 async function check(){
  if(!updater||busy||checking)return status;
  checking=true;emit({phase:'checking',version:null,message:''});
  try{await updater.checkForUpdates();}catch{emit({phase:'check-error',message:'업데이트를 확인하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.'});}
  finally{checking=false;}return status;
 }
 const emit=patch=>{status={...status,...patch};const w=getMain();if(w&&!w.isDestroyed())w.webContents.send('update:state',status);};
 const allowed=e=>e.sender===getMain()?.webContents;
 ipcMain.handle('update:state',e=>{if(!allowed(e))throw Error('허용되지 않은 요청');return status;});
 ipcMain.handle('update:check',e=>{if(!allowed(e))throw Error('허용되지 않은 요청');return check();});
 ipcMain.handle('update:start',async e=>{
  if(!allowed(e)||!updater||busy||!['available','error'].includes(status.phase))return false;
  const answer=await dialog.showMessageBox(getMain(),{type:'question',buttons:['업데이트','취소'],defaultId:1,cancelId:1,title:'우리 교실 업데이트',message:'새 버전을 다운로드하고 앱을 다시 시작할까요?',detail:'수업 중에는 취소해 주세요. 학급 명단과 설정은 유지됩니다.'});
  if(answer.response!==0)return false;
  busy=true;emit({phase:'downloading',percent:0});
  try{
   const files=await updater.downloadUpdate();const installer=files.find(f=>f.toLowerCase().endsWith('.exe'));if(!installer)throw Error('설치 파일이 없습니다.');
   emit({phase:'preparing'});
   const w=getMain();w.webContents.send('update:flush');await new Promise(r=>setTimeout(r,150));w.webContents.session.flushStorageData();
   const local=await w.webContents.executeJavaScript('JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)])))');
   const recoveryRoot=path.join(app.getPath('userData'),'update-recovery',Date.now().toString());await fs.mkdir(recoveryRoot,{recursive:true});
   await fs.writeFile(path.join(recoveryRoot,'local-storage-backup.json'),local,'utf8');
   const installDir=path.dirname(process.execPath),backupDir=path.join(recoveryRoot,'previous-app');
   // Never remove the running version. A full verified copy remains available for rollback.
   await rawFs.cp(installDir,backupDir,{recursive:true,filter:src=>!src.startsWith(app.getPath('userData')+path.sep)});
   const helper=path.join(recoveryRoot,'UpdateRecovery.exe');await fs.copyFile(path.join(__dirname,'UpdateRecovery.exe'),helper);
   const cfg={stage:'prepared',appPid:process.pid,installDir,backupDir,exeName:path.basename(process.execPath),installer,targetVersion:status.version,healthFile:path.join(recoveryRoot,'healthy'),readyFile:path.join(recoveryRoot,'ready')};
   const configFile=path.join(recoveryRoot,'recovery.json');await fs.writeFile(configFile,JSON.stringify(cfg));
   const child=spawn(helper,[configFile],{detached:true,stdio:'ignore',windowsHide:true});let spawnError;child.once('error',err=>spawnError=err);child.unref();
   let ready=false;for(let i=0;i<1200;i++){try{await fs.access(configFile+'.error.txt');throw Error('설치 권한 승인이 취소되었거나 복구 도우미를 실행하지 못했습니다.');}catch(e){if(e.code!=='ENOENT')throw e;}if(spawnError)throw spawnError;try{await fs.access(cfg.readyFile);ready=true;break;}catch{}await new Promise(r=>setTimeout(r,100));}
   if(!ready)throw Error('복구 준비를 완료하지 못했습니다.');
   emit({phase:'installing'});app.quit();return true;
  }catch(error){busy=false;const detail=String(error?.message||error);await fs.appendFile(path.join(app.getPath('userData'),'update-error.log'),new Date().toISOString()+' '+String(error?.stack||detail)+'\n').catch(()=>{});emit({phase:'error',message:'업데이트하지 못했습니다. 현재 버전을 계속 사용할 수 있습니다. 원인: '+detail});return false;}
 });
 if(!config.owner||!config.repo){emit({phase:'unconfigured'});return;}
 updater=require('./updater-bundle.cjs');updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.allowDowngrade=false;updater.disableDifferentialDownload=true;
 updater.setFeedURL({provider:'github',owner:config.owner,repo:config.repo,private:false});
 updater.on('update-not-available',()=>emit({phase:'current',version:null}));
 updater.on('update-available',info=>emit({phase:'available',version:info.version}));
 updater.on('download-progress',progress=>emit({phase:'downloading',percent:Math.round(progress.percent)}));
 updater.on('error',()=>{if(busy)emit({phase:'error',message:'업데이트하지 못했습니다. 현재 버전을 계속 사용할 수 있습니다.'});});
 setTimeout(()=>{if(status.phase==='idle')check();},5000).unref();
};
