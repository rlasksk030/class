// Local-only verification. Does not invoke git push, GitHub Actions or packaging/release commands.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base=path.join(root,'tests/e2e/.out');fs.mkdirSync(base,{recursive:true});
const out=fs.mkdtempSync(path.join(base,'photo-validation-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'));
process.env.CLASSROOM_TEST_OUTPUT=out;console.log('Evidence: '+out);
const report={time:new Date().toISOString(),platform:process.platform,arch:process.arch,node:process.version,electron:require('../node_modules/electron/package.json').version,base:spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim(),checks:[]};
for(const [name,args]of [['syntax',['run','check']],['unit',['test']],['e2e',['run','test:e2e']],['migration',['run','test:migration']]]){
 console.log('START '+name);const log=path.join(out,name+'.log'),fd=fs.openSync(log,'wx');const r=spawnSync(process.platform==='win32'?'npm.cmd':'npm',args,{cwd:root,stdio:['ignore',fd,fd],timeout:15*60*1000});fs.closeSync(fd);const skipped=/^SKIP:/m.test(fs.readFileSync(log,'utf8'));report.checks.push({name,status:skipped?'skipped':r.status===0?'passed':'failed',exitCode:r.status,signal:r.signal,error:r.error?.message,log});console.log((skipped?'SKIP ':r.status===0?'PASS ':'FAIL ')+name);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
}
process.exitCode=report.checks.some(c=>c.exitCode!==0)?1:0;
