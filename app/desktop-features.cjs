const {app,BrowserWindow,ipcMain,screen}=require('electron');
const fs=require('node:fs'),path=require('node:path');const {safeBounds}=require('./window-bounds.cjs');
module.exports=function setupDesktop(getMain){
 const file=path.join(app.getPath('userData'),'desktop-settings.json');let preferences={startupEnabled:true,pipBounds:{}};
 try{preferences={...preferences,...JSON.parse(fs.readFileSync(file,'utf8'))};}catch{}
 if(!preferences.pipBounds||typeof preferences.pipBounds!=='object')preferences.pipBounds={};
 function save(){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(preferences));fs.renameSync(tmp,file);}
 const startupName=process.env.CLASSROOM_TEST_PROFILE?'classroom-dashboard-test':'classroom-dashboard';
 function startup(enabled){if(process.platform==='win32')app.setLoginItemSettings({openAtLogin:enabled===true,name:startupName,path:process.execPath,args:[]});preferences.startupEnabled=enabled===true;save();return preferences.startupEnabled;}
 startup(preferences.startupEnabled===true);
 let pip=null,kind='dashboard',lastState=null,saveTimer;
 const validKind=k=>['dashboard','whiteboard','random','activity'].includes(k);
 const fromMain=e=>e.sender===getMain()?.webContents;
 const fromPip=e=>e.sender===pip?.webContents;
 function focusMain(){const w=getMain();if(!w||w.isDestroyed())return;if(w.isMinimized())w.restore();w.show();w.focus();}
 function bounds(k){return safeBounds(preferences.pipBounds[k],screen.getAllDisplays().map(d=>d.workArea),screen.getPrimaryDisplay().workArea,k);}
 function remember(){clearTimeout(saveTimer);if(!pip||pip.isDestroyed())return;preferences.pipBounds[kind]=pip.getNormalBounds();save();}
 function update(){if(pip&&!pip.isDestroyed())pip.webContents.send('pip:state',{kind,state:lastState});}
 function open(next){
  if(!validKind(next))throw Error('지원하지 않는 PIP 화면');
  if(pip&&!pip.isDestroyed()){remember();kind=next;pip.setBounds(bounds(next));pip.setTitle('우리 교실 · '+({dashboard:'우리교실',random:'랜덤 뽑기',activity:'활동완료',whiteboard:'화이트보드'})[kind]);update();pip.show();pip.focus();return;}
  kind=next;pip=new BrowserWindow({...bounds(kind),minWidth:320,minHeight:220,alwaysOnTop:true,title:'우리 교실 PIP',show:!process.env.CLASSROOM_TEST_HIDDEN,backgroundColor:'#ffffff',webPreferences:{preload:path.join(__dirname,'pip-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  pip.removeMenu();pip.webContents.setWindowOpenHandler(()=>({action:'deny'}));pip.webContents.on('will-navigate',e=>e.preventDefault());
  pip.webContents.on('did-finish-load',update);pip.loadFile(path.join(__dirname,'pip.html'));
  for(const event of ['move','resize'])pip.on(event,()=>{clearTimeout(saveTimer);saveTimer=setTimeout(remember,180)});
  pip.on('close',remember);pip.on('closed',()=>{pip=null;getMain()?.webContents.send('pip:closed')});
 }
 for(const event of ['display-removed','display-metrics-changed'])screen.on(event,()=>{if(pip&&!pip.isDestroyed()){pip.setBounds(safeBounds(pip.getBounds(),screen.getAllDisplays().map(d=>d.workArea),screen.getPrimaryDisplay().workArea,kind));remember();}});
 ipcMain.handle('desktop:settings',e=>{if(!fromMain(e))throw Error('허용되지 않은 요청');return {startupEnabled:preferences.startupEnabled===true};});
 ipcMain.handle('startup',(e,on)=>{if(!fromMain(e))throw Error('허용되지 않은 요청');return startup(on===true);});
 ipcMain.handle('pip:open',(e,next)=>{if(!fromMain(e))throw Error('허용되지 않은 요청');open(next);return true;});
 ipcMain.on('pip:publish',(e,state)=>{if(!fromMain(e))return;lastState=state;update();});
 ipcMain.handle('pip:get',e=>{if(!fromPip(e))throw Error('허용되지 않은 요청');return {kind,state:lastState};});
 ipcMain.on('input:focus',e=>{if(!fromMain(e)&&!fromPip(e))return;const w=BrowserWindow.fromWebContents(e.sender);if(w&&!w.isDestroyed()){w.focus();w.webContents.focus();}});
 const actions=new Set(['activity-title','activity-toggle','random-draw','random-repeat','whiteboard-edit','expand','timer']);
 ipcMain.on('pip:command',(e,command)=>{if(!fromPip(e)||!actions.has(command?.type))return;
  const permitted={ 'activity-title':'activity','activity-toggle':'activity','random-draw':'random','random-repeat':'random','whiteboard-edit':'whiteboard'};
  if(permitted[command.type]&&kind!==permitted[command.type])return;
  if(command.type==='expand'||command.type==='timer')focusMain();
  getMain()?.webContents.send('pip:command',{...command,kind});
  if(command.type==='expand')pip?.close();
 });
 return {focusMain,close(){if(pip&&!pip.isDestroyed()){remember();pip.destroy();pip=null;}},preferences};
};
