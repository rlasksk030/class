const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {EventEmitter}=require('node:events'),X=require('./extras-core.js');
const source=name=>fs.readFileSync(path.join(__dirname,name),'utf8');

// Exercise the real desktop IPC handlers without registering OS startup entries.
async function desktop(t){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'timer-pip-unit-'));
 const handlers=new Map(),ipcMain=new EventEmitter();ipcMain.handle=(key,handler)=>handlers.set(key,handler);
 const windows=[];
 class Window extends EventEmitter{
  constructor(options={}){super();this.options=options;this.bounds={...options};this.messages=[];this.destroyed=false;this.focusCount=0;this.webContents=new EventEmitter();this.webContents.send=(...m)=>this.messages.push(m);this.webContents.setWindowOpenHandler=()=>{};this.webContents.focus=()=>{};windows.push(this);}
  isDestroyed(){return this.destroyed;} isMinimized(){return this.minimized;}
  restore(){this.minimized=false;} show(){this.shown=true;} focus(){this.focusCount++;}
  removeMenu(){} loadFile(){} getNormalBounds(){return this.bounds;} getBounds(){return this.bounds;}
  setBounds(b){this.bounds=b;} setTitle(s){this.title=s;}
  close(){this.emit('close');this.destroyed=true;this.emit('closed');} destroy(){this.destroyed=true;this.emit('closed');}
 }
 const main=new Window(),area={x:0,y:0,width:1920,height:1080},screen=new EventEmitter();
 screen.getAllDisplays=()=>[{workArea:area}];screen.getPrimaryDisplay=()=>({workArea:area});
 const electron={app:{getPath:()=>profile},BrowserWindow:Window,ipcMain,screen,shell:{}};
 const module={exports:{}};
 vm.runInNewContext(source('desktop-features.cjs'),{module,__dirname,process,setTimeout,clearTimeout,require:name=>name==='electron'?electron:name==='./startup-manager.cjs'?{create:()=>async enabled=>({enabled,warning:''})}:require(name)});
 const api=module.exports(()=>main),event=w=>({sender:w.webContents});
 await handlers.get('desktop:settings')(event(main));
 t.after(()=>{api.close();fs.rmSync(profile,{recursive:true,force:true});});
 return {main,windows,api,handlers,ipcMain,event,open:kind=>handlers.get('pip:open')(event(main),kind),publish:state=>ipcMain.emit('pip:publish',event(main),state),send:(w,c)=>ipcMain.emit('pip:command',event(w),c)};
}

test('timer PIP reuses one always-on-top window and remembers separate bounds across reopen',async t=>{
 const d=await desktop(t),state={timer:{state:'running',seconds:60}};
 d.publish(state);assert.equal(d.open('timer'),true);const pip=d.windows[1];pip.webContents.emit('did-finish-load');
 assert.equal(pip.options.alwaysOnTop,true);assert.equal(pip.options.title,'우리 교실 · 타이머');
 assert.equal(pip.options.webPreferences.sandbox,true);assert.equal(pip.options.webPreferences.contextIsolation,true);
 assert.equal(pip.options.width,400);assert.equal(pip.options.height,340);
 assert.equal(pip.messages.at(-1)[1].state,state);
 pip.setBounds({x:100,y:80,width:500,height:380});d.open('dashboard');d.open('timer');
 assert.equal(d.windows.length,2);assert.equal(pip.title,'우리 교실 · 타이머');assert.equal(pip.bounds.width,500);
 pip.close();assert.equal(d.main.messages.filter(m=>m[0]==='pip:command').length,0,'closing never resets or pauses timer');
 d.open('timer');const reopened=d.windows[2];reopened.webContents.emit('did-finish-load');
 assert.equal(reopened.bounds.width,500);assert.equal(reopened.messages.at(-1)[1].state,state);
 assert.throws(()=>d.open('unknown'),/지원하지/);
 assert.throws(()=>d.handlers.get('pip:open')(d.event(reopened),'timer'),/허용되지/);
});

test('timer actions require the current timer PIP sender, kind and a supported action',async t=>{
 const d=await desktop(t);d.open('timer');const pip=d.windows[1];
 const commands=()=>d.main.messages.filter(m=>m[0]==='pip:command');
 for(const action of ['start','pause','restart','reset','dismiss'])d.send(pip,{type:'timer-action',action});
 assert.equal(commands().length,5);assert.ok(commands().every(m=>m[1].kind==='timer'));assert.equal(d.main.focusCount,0);
 for(const action of ['preset','tick',null,{},'__proto__'])d.send(pip,{type:'timer-action',action});
 d.send(d.main,{type:'timer-action',action:'start'});assert.equal(commands().length,5);
 d.open('dashboard');d.send(pip,{type:'timer-action',action:'reset'});assert.equal(commands().length,5);
 d.open('timer');d.main.minimized=true;d.send(pip,{type:'expand',kind:'dashboard'});
 assert.equal(commands().at(-1)[1].kind,'timer');assert.equal(d.main.minimized,false);assert.equal(d.main.focusCount,1);assert.equal(pip.destroyed,true);
 d.send(pip,{type:'timer-action',action:'start'});assert.equal(commands().length,6,'closed renderer cannot send commands');
});

// Small DOM adapter for renderer behavior; actual layout/native-window checks live in E2E.
class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.style={};this.attributes={};this.textContent='';const el=this,names=()=>(el.className||'').split(' ').filter(Boolean);this.classList={contains:c=>names().includes(c),add:c=>{if(!names().includes(c))el.className=[...names(),c].join(' ');},remove:c=>{el.className=names().filter(n=>n!==c).join(' ');},toggle:(c,on=!names().includes(c))=>{on?el.classList.add(c):el.classList.remove(c);return on;}};}
 append(...nodes){for(const n of nodes){this.children.push(n);if(typeof n==='object')n.parent=this;}}
 before(){} after(){} setAttribute(k,v){this.attributes[k]=v;}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
 matches(q){if(q.startsWith('#'))return this.id===q.slice(1);if(q.startsWith('.'))return (this.className||'').split(' ').includes(q.slice(1));const m=q.match(/^\[data-timer-action="(.*)"\]$/);return m?this.dataset.timerAction===m[1]:false;}
 querySelector(q){for(const n of this.children){if(typeof n!=='object')continue;if(n.matches(q))return n;const found=n.querySelector(q);if(found)return found;}return null;}
 click(){if(!this.disabled)this.onclick?.();}
}
function pipRenderer(){
 // pip.html: title bar (title, bar info, [크게 보기]) and the content area; body carries data-kind.
 const nodes=Object.fromEntries(['content','pipTitle','pipBarInfo','expand'].map(id=>[id,Object.assign(new Element(),{id})]));
 const commands=[];let listener;
 const document={getElementById:id=>nodes[id],createElement:tag=>new Element(tag),documentElement:new Element(),body:new Element()};
 const window={addEventListener(){},pip:{command:c=>commands.push(c),onState:fn=>listener=fn,get:()=>Promise.resolve(null)}};
 vm.runInNewContext(source('pip.js'),{document,window,innerWidth:400,innerHeight:300});
 return {nodes,commands,update:(state,seconds=60)=>listener({kind:'timer',state:{timer:{state,seconds}}}),listener:()=>listener};
}

test('timer PIP renders all states, preserves buttons during ticks and sends controls',()=>{
 const p=pipRenderer();p.update('idle');const root=p.nodes.content;
 const find0=q=>{const walk=n=>n.matches?.(q)?n:(n.children||[]).map(walk).find(Boolean);return walk(root);};
 assert.ok(find0('[data-timer-action="start"]').classList.contains('primary')&&!find0('[data-timer-action="pause"]').classList.contains('primary'));
 const find=q=>root.querySelector(q),start=find('[data-timer-action="start"]');
 assert.equal(p.nodes.pipTitle.textContent,'타이머');assert.equal(p.nodes.expand.textContent,'시간 설정');
 assert.equal(find('#pipTimerDisplay').textContent,'01:00');assert.equal(find('[data-timer-action="pause"]').disabled,true);
 start.click();assert.equal(p.commands.at(-1).action,'start');
 p.update('running',59);p.update('running',58);assert.equal(find('[data-timer-action="start"]'),start,'tick must not replace focused buttons');
 assert.equal(start.disabled,true);assert.equal(find('#pipTimerDisplay').textContent,'00:58');
 find('[data-timer-action="pause"]').click();assert.equal(p.commands.at(-1).action,'pause');
 p.update('paused',58);assert.equal(start.textContent,'계속하기');assert.equal(start.disabled,false);
 for(const action of ['start','restart','reset']){find(`[data-timer-action="${action}"]`).click();assert.equal(p.commands.at(-1).action,action);}
 p.update('finished',0);assert.equal(find('#pipTimerDisplay').textContent,'00:00');assert.equal(find('#pipTimerMessage').textContent,'시간이 다 되었습니다!');
 assert.equal(find('#pipTimerDismiss').hidden,false);assert.equal(find('[data-timer-action="pause"]').hidden,true);find('#pipTimerDismiss').click();assert.equal(p.commands.at(-1).action,'dismiss');
 p.update('idle',10859);assert.equal(find('#pipTimerDisplay').textContent,'180:59');assert.equal(find('#pipTimerDismiss').hidden,true);
 p.nodes.expand.click();assert.equal(p.commands.at(-1).type,'expand');
 p.listener()({kind:'dashboard',state:{dashboard:{options:{},time:'12:00'}}});assert.equal(root.querySelector('.timer-pip'),null);assert.equal(p.nodes.expand.textContent,'크게 보기');
 p.update('paused',9);assert.equal(find('#pipTimerDisplay').textContent,'00:09');
});

test('main renderer publishes the same timer to both PIPs and routes expand to the timer dialog',()=>{
 const forms=new Element(),actions=Object.assign(new Element(),{className:'actions'});forms.append(actions);
 const timerButton=new Element();let openedTimer=0;timerButton.onclick=()=>openedTimer++;
 const targets=Object.fromEntries(['.app-bar__right','.random-heading','.whiteboard-toolbar','.activity-heading','#timerDialog .extras-heading'].map(q=>[q,new Element()]));
 const document={createElement:t=>new Element(t),createTextNode:s=>s,querySelector:q=>targets[q]};
 const published=[],opened=[],screenCalls=[],calls=[];let onCommand,timer=X.timerAction({},'preset',0,65000);
 const tools={schedule:()=>[],timer:()=>timer,activity:{snapshot:()=>({})},random:{snapshot:()=>({})},whiteboard:{snapshot:()=>({})},screen:i=>screenCalls.push(i),controlTimer:action=>{calls.push(action);timer=X.timerAction(timer,action,Date.now());}};
 const window={classroomTools:tools,desktop:{settings:async()=>({startupEnabled:false}),openPip:async kind=>opened.push(kind),publishPip:s=>published.push(s),onPipCommand:fn=>onCommand=fn}};
 vm.runInNewContext(source('desktop-ui.js'),{document,window,$:id=>id==='settingsForm'?forms:timerButton,settings:{},read:()=>({}),put(){},overrides:{},cache:{},day:'2026-11-05',Core:{dataKey:()=>'',display:()=>[]},ExtrasCore:X,ClassRoster:{key:()=>''},setInterval(){},Intl,Date});
 targets['#timerDialog .extras-heading'].children[0].click();assert.equal(opened[0],'timer');assert.equal(published.at(-1).timer.seconds,65);
 onCommand({type:'timer-action',kind:'timer',action:'start'});assert.equal(timer.state,'running');assert.equal(published.at(-1).dashboard.timer,'01:05');
 onCommand({type:'timer-action',kind:'timer',action:'pause'});assert.equal(timer.state,'paused');assert.equal(published.at(-1).timer.state,'paused');
 onCommand({type:'timer-action',kind:'dashboard',action:'reset'});assert.equal(timer.state,'paused');assert.deepEqual(calls,['start','pause']);
 onCommand({type:'expand',kind:'timer'});assert.equal(openedTimer,1);assert.deepEqual(screenCalls,[]);
 onCommand({type:'expand',kind:'dashboard'});assert.deepEqual(screenCalls,[0]);
});

test('main renderer publishes PIP state before a nationwide school is selected',()=>{
 const forms=new Element(),actions=Object.assign(new Element(),{className:'actions'});forms.append(actions);
 const targets=Object.fromEntries(['.app-bar__right','.random-heading','.whiteboard-toolbar','.activity-heading','#timerDialog .extras-heading'].map(q=>[q,new Element()]));
 const document={createElement:t=>new Element(t),createTextNode:s=>s,querySelector:q=>targets[q]};
 const published=[];let keyCalls=0;
 const tools={schedule:()=>[{period:'1',start:'09:00',end:'09:40'}],timer:()=>X.timerAction({},'preset',0,60000),activity:{snapshot:()=>({})},random:{snapshot:()=>({})},whiteboard:{snapshot:()=>({})}};
 const window={classroomTools:tools,desktop:{settings:async()=>({startupEnabled:false}),openPip:async()=>{},publishPip:s=>published.push(s),onPipCommand(){}}};
 // Core.schoolKey reads school codes, so a missing school must never reach it.
 const Core={dataKey:s=>{keyCalls++;return s.school.ATPT_OFCDC_SC_CODE;},display:()=>[]};
 vm.runInNewContext(source('desktop-ui.js'),{document,window,$:()=>forms,settings:{school:null},read:()=>({}),put(){},overrides:{},cache:{},day:'2026-11-05',Core,ExtrasCore:X,ClassRoster:{key:()=>''},setInterval(){},Intl,Date});
 assert.equal(keyCalls,0);assert.equal(published.length,1);
 assert.equal(published[0].dashboard.scheduleSet,false);assert.equal(published[0].dashboard.current,null);assert.equal(published[0].timer.seconds,60);
});

test('timer bounds recover from removed monitors and clamp to the available work area',()=>{
 const {safeBounds}=require('./window-bounds.cjs'),area={x:0,y:0,width:800,height:600};
 const b=safeBounds({x:5000,y:2000,width:900,height:700},[area],area,'timer');
 assert.deepEqual(b,{x:0,y:0,width:800,height:600});
 assert.deepEqual(safeBounds(null,[area],area,'timer'),{x:40,y:40,width:400,height:340});
});
