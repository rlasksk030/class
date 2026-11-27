'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'build-identity.cjs'),'utf8');
function load(metadata){const context={module:{exports:{}},require:name=>name==='node:path'?path:metadata};vm.runInNewContext(source,context);return context.module.exports;}
test('validation metadata isolates data even when a production test-profile override is supplied',()=>{
 const ordinary=load({}),validation=load({classroomValidation:true});
 assert.equal(ordinary.userData('/appdata'),path.join('/appdata','classroom-dashboard'));
 assert.equal(ordinary.userData('/appdata','/synthetic-test'),'/synthetic-test');
 assert.equal(validation.userData('/appdata','/appdata/classroom-dashboard'),path.join('/appdata','classroom-dashboard-validation'));
 assert.equal(load({classroomValidation:'true'}).validation,false);
});
test('validation updater registers read-only status but never loads the network updater or installs',async()=>{
 const handlers={},sender={},app={getVersion:()=> '1.8.11-validation.local'},context={module:{exports:{}},setTimeout(){throw Error('background updater timer');},require(name){
  if(name==='electron')return {app,ipcMain:{handle:(k,v)=>handlers[k]=v},dialog:{}};
  if(name==='original-fs')return {promises:{}};
  if(name==='./build-identity.cjs')return {validation:true};
  if(name==='./update-config.json')return {};
  if(name==='./updater-bundle.cjs')throw Error('production updater imported');
  return require(name);
 }};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'updates.cjs'),'utf8'),context);
 const idle=context.module.exports(()=>({webContents:sender}));assert.equal(idle(),true);
 assert.equal(handlers['update:state']({sender}).phase,'disabled');
 assert.equal((await handlers['update:check']({sender})).phase,'disabled');
 assert.equal(await handlers['update:start']({sender}),false);
});

test('packaged validation startup never inventories or changes production login entries',async()=>{
 const context={module:{exports:{}},process,require:name=>name==='./build-identity.cjs'?{validation:true}:name==='./startup-policy.cjs'?{}:require(name)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'startup-manager.cjs'),'utf8'),context);
 const run=context.module.exports.create({app:{isPackaged:true,setLoginItemSettings(){throw Error('login registration');}},platform:'win32',env:{},inspect(){throw Error('production inventory');},removeEntries(){throw Error('production removal');}});
 assert.equal((await run(true,true)).enabled,false);assert.equal((await run(false,true)).enabled,false);
});
