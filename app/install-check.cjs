const {ipcMain}=require('electron');
const {execFile}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
// Read-only check for another "우리 교실" copy on this PC (for example a v1.8.1 "all users" copy in Program Files).
// Its shortcuts and the Windows start-up entry can open that older copy instead of this one. Nothing is removed here.
module.exports=function setupInstallCheck(getMain){
 const GUIDS=['d78eedc4-9833-5771-9f01-d94e51e1b797','80d89bea-829d-5beb-a731-910f2523db96'];
 const query=(key,value)=>new Promise(resolve=>{
  if(process.platform!=='win32')return resolve(null);
  execFile('reg',['query',key,...(value?['/v',value]:[])],{windowsHide:true,timeout:5000},(error,out)=>resolve(error?null:String(out)));
 });
 const field=(text,name)=>(String(text||'').match(new RegExp('^\\s+'+name+'\\s+REG_\\w+\\s+(.*)$','m'))||[])[1]?.trim();
 ipcMain.handle('install:others',async e=>{
  if(e.sender!==getMain()?.webContents)throw Error('허용되지 않은 요청');
  const here=path.resolve(path.dirname(process.execPath)).toLowerCase(),exe=path.basename(process.execPath),found=[];
  for(const hive of ['HKCU','HKLM'])for(const guid of GUIDS){
   const entry=await query(`${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${guid}`);if(!entry)continue;
   const uninstall=(field(entry,'UninstallString')||'').match(/^"([^"]+)"/)?.[1];
   const dir=field(entry,'InstallLocation')||field(await query(`${hive}\\Software\\${guid}`,'InstallLocation'),'InstallLocation')||(uninstall&&path.dirname(uninstall));
   if(dir&&path.resolve(dir).toLowerCase()!==here&&fs.existsSync(path.join(dir,exe)))found.push({dir,version:field(entry,'DisplayVersion')||'',allUsers:hive==='HKLM'});
  }
  return found;
 });
};
