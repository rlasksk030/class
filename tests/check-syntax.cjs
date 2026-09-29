// Syntax check for every app and test script (the project has no linter/typecheck configured).
const {execFileSync}=require('child_process'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const files=[...['app','tests/e2e','tests/windows','tests'].flatMap(d=>fs.readdirSync(path.join(root,d)).filter(f=>/\.(c?js)$/.test(f)).map(f=>path.join(d,f)))];
let failed=0;for(const f of files){try{execFileSync(process.execPath,['--check',path.join(root,f)],{stdio:'pipe'});}catch(e){failed++;console.error('FAIL',f,String(e.stderr));}}
console.log(`${files.length-failed}/${files.length} files parse`);process.exit(failed?1:0);
