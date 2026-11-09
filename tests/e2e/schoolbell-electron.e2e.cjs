// Runs the production Electron transport against an entirely intercepted local fixture.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{_electron}=require('playwright-core');
const root=path.resolve(__dirname,'../..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'schoolbell-electron-'));
const entry=path.join(dir,'main.cjs');
fs.writeFileSync(entry,`const {app}=require('electron');app.setPath('userData',${JSON.stringify(dir)});app.commandLine.appendSwitch('disable-background-networking');require(${JSON.stringify(path.join(root,'tests/schoolbell-electron-fixture.cjs'))});`);
(async()=>{let app;try{
 app=await _electron.launch({executablePath:require('electron'),args:['--no-sandbox',entry]});
 await app.evaluate(async()=>{if(!global.schoolbellFixtureReady)await new Promise(r=>require('electron').app.whenReady().then(r));});
 const results=await app.evaluate(async()=>global.runSchoolbellElectronTests());
 results.forEach(s=>console.log('PASS '+s));console.log(results.length+'/'+results.length+' passed (local Electron; live Schoolbell NOT RUN)');
}finally{if(app){const child=app.process();if(child.exitCode===null&&child.signalCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill('SIGKILL');await exited;}}}
})().catch(e=>{console.error(e);process.exitCode=1;});
