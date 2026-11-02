const fs=require('node:fs'),path=require('node:path'),{execFile}=require('node:child_process');
const P=require('./startup-policy.cjs');
const ps=script=>new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from("[Console]::OutputEncoding=[Text.UTF8Encoding]::new();$ErrorActionPreference='Stop';"+script,'utf16le').toString('base64')],{windowsHide:true,timeout:15000,encoding:'utf8'},(e,out)=>e?reject(Error('Windows 자동 실행 항목을 읽거나 변경하지 못했습니다.')):resolve(out.trim())));
function identity(exe){
 if(path.basename(exe).toLowerCase()!=='우리 교실.exe'||!fs.existsSync(exe))return null;
 for(const folder of ['app.asar','app'])try{const p=JSON.parse(fs.readFileSync(path.join(path.dirname(exe),'resources',folder,'package.json'),'utf8'));if(p.name==='classroom-dashboard'&&/^\d+\.\d+\.\d+$/.test(p.version))return {path:exe,version:p.version};}catch{}
 return null;
}
function testEntry(e){
 if(e.name!=='classroom-dashboard-test'||e.args||path.basename(e.path).toLowerCase()!=='electron.exe')return false;
 try{return JSON.parse(fs.readFileSync(path.resolve(path.dirname(e.path),'../../../app/package.json'),'utf8')).name==='classroom-dashboard';}catch{return false;}
}
async function inventory(shell,env){
 const rows=JSON.parse(await ps(fs.readFileSync(path.join(__dirname,'startup-read.ps1'),'utf8')));
 const entries=[];
 for(const r of rows.filter(r=>r.kind==='run')){const c=P.command(r.value);if(!c){if(r.name===P.NAME)entries.push({...r,path:'',args:'',owned:false});continue;}const e={...r,...c};e.owned=!!identity(e.path)||testEntry(e);entries.push(e);}
 for(const [scope,base] of [['user',env.APPDATA],['machine',env.ProgramData]]){
  if(!base)continue;const dir=path.join(base,'Microsoft/Windows/Start Menu/Programs/Startup');if(!fs.existsSync(dir))continue;
  for(const name of fs.readdirSync(dir).filter(n=>n.toLowerCase().endsWith('.lnk'))){const file=path.join(dir,name);let s;try{s=shell.readShortcutLink(file);}catch{continue;}if(!identity(s.target))continue;entries.push({scope,kind:'shortcut',name,file,path:s.target,args:s.args||'',owned:true,enabled:rows.find(r=>r.kind==='shortcut-approval'&&r.scope===scope&&r.name.toLowerCase()===name.toLowerCase())?.enabled!==false});}
 }
 return entries;
}
async function remove(entries,shell){
 const run=entries.filter(e=>e.kind==='run');
 if(run.length){
  const data=Buffer.from(JSON.stringify(run)).toString('base64');
  // Compare the value again before removal. HKLM is never a writable target here.
  await ps(`$items=ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${data}')));foreach($e in $items){if($e.scope -ne 'user' -or $e.key -notin @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run','HKCU:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run')){throw 'Unexpected registry scope'};$k=Get-Item -LiteralPath $e.key;if([string]$k.GetValue($e.name) -cne $e.value){throw 'Startup item changed'};Remove-ItemProperty -LiteralPath $e.key -Name $e.name}`);
 }
 for(const e of entries.filter(e=>e.kind==='shortcut')){
  const startupFolder=path.join(process.env.APPDATA,'Microsoft/Windows/Start Menu/Programs/Startup');
  if(e.scope!=='user'||!P.same(path.dirname(e.file),startupFolder))throw Error('현재 사용자 시작프로그램 폴더 밖의 바로가기는 변경하지 않습니다.');
  const now=shell.readShortcutLink(e.file);if(!P.same(now.target,e.path)||(now.args||'')!==e.args)throw Error('시작프로그램 바로가기가 변경되어 정리하지 않았습니다.');
  const dest=e.file+'.disabled-by-classroom';if(fs.existsSync(dest))throw Error('기존 시작프로그램 보관본을 확인해 주세요.');fs.renameSync(e.file,dest);
 }
}
function create({app,shell,env=process.env,platform=process.platform,inspect=inventory,removeEntries=remove}){
 return async(enabled,explicit=false)=>{
  // Development and every isolated test profile must never register a real Windows login item.
  if(platform!=='win32'||!app.isPackaged||env.CLASSROOM_TEST_PROFILE)return {enabled,warning:''};
  const entries=await inspect(shell,env),current=process.execPath;
  const programFiles=path.join(env.ProgramFiles||'C:\\Program Files','classroom-dashboard','우리 교실.exe');
  const candidates=[current,programFiles,path.join(env.LOCALAPPDATA||'','Programs/classroom-dashboard/우리 교실.exe'),...entries.filter(e=>e.owned).map(e=>e.path)].map(identity).filter(Boolean);
  const target=P.latest(candidates,current,programFiles),next=P.plan(entries,target,enabled,explicit);
  if(next.remove.length){const dir=path.join(app.getPath('userData'),'startup-registration-backups');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,Date.now()+'.json'),JSON.stringify(next.remove,null,2));await removeEntries(next.remove,shell);}
  if(next.register)app.setLoginItemSettings({openAtLogin:true,enabled:true,name:P.NAME,path:target,args:[]});
  if(next.remove.length||next.register){
   const after=await inspect(shell,env),remaining=after.filter(e=>e.owned&&e.enabled!==false);
   if(next.enabled?(remaining.length!==1||!P.same(remaining[0].path,target)):remaining.length!==0)throw Error('자동 실행 등록을 확인하지 못했습니다. 설정을 다시 확인해 주세요.');
  }
  return {enabled:next.enabled,warning:next.warning};
 };
}
module.exports={create,inventory,identity};
