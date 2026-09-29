const {app,dialog,ipcMain}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');
// Save/open dialogs for the settings backup. Files are written atomically; nothing else in userData is touched.
module.exports=function setupBackup(getMain){
 const allowed=e=>e.sender===getMain()?.webContents;
 const MAX_BYTES=20*1024*1024,filters=[{name:'학급 대시보드 백업',extensions:['json']}];
 async function write(file,text){const temp=file+'.'+process.pid+'.tmp';await fs.writeFile(temp,text,'utf8');try{await fs.rename(temp,file);}catch(e){await fs.rm(temp,{force:true});throw e;}}
 ipcMain.handle('backup:save',async(e,{name,text}={})=>{
  if(!allowed(e)||typeof text!=='string'||typeof name!=='string')throw Error('허용되지 않은 요청');
  const result=await dialog.showSaveDialog(getMain(),{title:'백업 파일 저장',defaultPath:path.join(app.getPath('documents'),path.basename(name)),filters});
  if(result.canceled||!result.filePath)return {canceled:true};
  await write(result.filePath,text);return {saved:true,name:path.basename(result.filePath)};
 });
 ipcMain.handle('backup:open',async e=>{
  if(!allowed(e))throw Error('허용되지 않은 요청');
  const result=await dialog.showOpenDialog(getMain(),{title:'복원할 백업 파일 선택',defaultPath:app.getPath('documents'),properties:['openFile'],filters:[...filters,{name:'모든 파일',extensions:['*']}]});
  if(result.canceled||!result.filePaths[0])return {canceled:true};
  const stat=await fs.stat(result.filePaths[0]);if(!stat.isFile()||stat.size>MAX_BYTES)return {text:''};
  return {text:await fs.readFile(result.filePaths[0],'utf8'),name:path.basename(result.filePaths[0])};
 });
 // A copy of the current data is kept before every restore, so a restore can always be undone by hand.
 ipcMain.handle('backup:keep',async(e,text)=>{
  if(!allowed(e)||typeof text!=='string')throw Error('허용되지 않은 요청');
  const dir=path.join(app.getPath('userData'),'backups');await fs.mkdir(dir,{recursive:true});
  const file=path.join(dir,'before-restore-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');await write(file,text);
  const old=(await fs.readdir(dir)).filter(f=>f.startsWith('before-restore-')).sort();for(const f of old.slice(0,Math.max(0,old.length-5)))await fs.rm(path.join(dir,f),{force:true});
  return true;
 });
};
