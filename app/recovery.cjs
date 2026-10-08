const {app,BrowserWindow,dialog,ipcMain}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');
// Finds earlier copies of the teacher's data. Read-only for every source: an original folder is never changed;
// another profile's "Local Storage" is copied into a temporary partition, read by the app, and the copy removed.
module.exports=function setupRecovery(getMain){
 const allowed=e=>e.sender===getMain()?.webContents;
 const userData=()=>app.getPath('userData');
 const exists=p=>fs.access(p).then(()=>true,()=>false);
 async function snapshots(){
  const out=[];
  const updates=path.join(userData(),'update-recovery');
  for(const name of await fs.readdir(updates).catch(()=>[])){
   const file=path.join(updates,name,'local-storage-backup.json');
   if(await exists(file))out.push({id:'update:'+name,kind:'update',label:'업데이트 직전 자동 백업',time:Number(name)||(await fs.stat(file)).mtimeMs});
  }
  const backups=path.join(userData(),'backups');
  for(const name of await fs.readdir(backups).catch(()=>[])){
   if(!/^before-restore-.*\.json$/.test(name))continue;
   out.push({id:'restore:'+name,kind:'restore',label:'복원 직전 보관본',time:(await fs.stat(path.join(backups,name))).mtimeMs});
  }
  return out.sort((a,b)=>b.time-a.time);
 }
 // Returns {format:'raw',data:{key:rawString}} or {format:'backup',text}.
 async function readSnapshot(id){
  const [kind,name]=String(id).split(/:(.*)/s);
  if(!name||name.includes('..')||/[\\/]/.test(name))throw Error('잘못된 요청');
  if(kind==='update'){const raw=JSON.parse(await fs.readFile(path.join(userData(),'update-recovery',name,'local-storage-backup.json'),'utf8'));return {format:'raw',data:raw};}
  if(kind==='restore')return {format:'backup',text:await fs.readFile(path.join(userData(),'backups',name),'utf8')};
  throw Error('잘못된 요청');
 }
 async function localStorageDir(dir){
  for(const candidate of [path.join(dir,'Local Storage'),dir])if(await exists(path.join(candidate,'leveldb')))return candidate;
  return null;
 }
 async function readFolder(dir){
  const source=await localStorageDir(dir);if(!source)return {error:'선택한 폴더에서 우리 교실 데이터(Local Storage)를 찾지 못했습니다.'};
  if(path.resolve(source)===path.resolve(path.join(userData(),'Local Storage')))return {error:'지금 사용 중인 데이터 폴더입니다. 다른 폴더를 선택해 주세요.'};
  const name='recovery-'+Date.now(),temp=path.join(userData(),'Partitions',name);
  await fs.mkdir(temp,{recursive:true});
  await fs.cp(source,path.join(temp,'Local Storage'),{recursive:true,filter:src=>!/[\\/]LOCK$/.test(src)});
  const w=new BrowserWindow({show:false,webPreferences:{partition:'persist:'+name,sandbox:true,contextIsolation:true,nodeIntegration:false}});
  try{
   await w.loadFile(path.join(__dirname,'recovery-read.html'));
   const data=JSON.parse(await w.webContents.executeJavaScript('JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])))'));
   return {format:'raw',data,source};
  }finally{w.destroy();setTimeout(()=>fs.rm(temp,{recursive:true,force:true}).catch(()=>{}),1500);}
 }
 // Temporary read copies stay locked by the session while the app runs (Windows); remove leftovers at startup,
 // before any of those sessions is opened. Only our own "recovery-*" copies are touched.
 const partitions=path.join(userData(),'Partitions');
 fs.readdir(partitions).then(names=>Promise.all(names.filter(n=>/^recovery-\d+$/.test(n)).map(n=>fs.rm(path.join(partitions,n),{recursive:true,force:true}).catch(()=>{})))).catch(()=>{});
 ipcMain.handle('recovery:scan',async e=>{if(!allowed(e))throw Error('허용되지 않은 요청');return snapshots();});
 ipcMain.handle('recovery:read',async(e,id)=>{if(!allowed(e))throw Error('허용되지 않은 요청');return readSnapshot(id);});
 ipcMain.handle('recovery:folder',async e=>{
  if(!allowed(e))throw Error('허용되지 않은 요청');
  const r=await dialog.showOpenDialog(getMain(),{title:'이전 우리 교실 데이터 폴더 선택 (classroom-dashboard 또는 Local Storage 폴더)',defaultPath:path.dirname(userData()),properties:['openDirectory']});
  if(r.canceled||!r.filePaths[0])return {canceled:true};
  return readFolder(r.filePaths[0]);
 });
 return {snapshots,readSnapshot,readFolder};
};
