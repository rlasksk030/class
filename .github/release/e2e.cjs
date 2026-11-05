// Keep the entire existing E2E suite; run timer and regression first, once each.
const assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const scripts=JSON.parse(fs.readFileSync('package.json','utf8')).scripts;
function expand(name){return scripts[name].split(/\s*&&\s*/).flatMap(command=>{
 let m=/^node (tests\/e2e\/[\w.-]+\.cjs)$/.exec(command);if(m)return[m[1]];
 m=/^npm run ([\w:-]+)$/.exec(command);assert.ok(m,'Unrecognized test command: '+command);return expand(m[1]);
});}
const all=expand('test:e2e');assert.equal(new Set(all).size,all.length);
const priority=['tests/e2e/timer-startup.e2e.cjs','tests/e2e/regression.e2e.cjs'];
for(const file of priority)assert.ok(all.includes(file));
for(const file of [...priority,...all.filter(f=>!priority.includes(f))]){console.log('\nRUN '+file);execFileSync(process.execPath,[file],{stdio:'inherit'});}
console.log('PASS entire existing Electron suite: '+all.length+' scripts, no duplicates');
