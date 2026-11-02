// Keep every run's synthetic profiles and evidence separate from earlier audits.
const fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'e2e/.out');
fs.mkdirSync(base,{recursive:true});
const output=process.env.CLASSROOM_TEST_OUTPUT?path.resolve(process.env.CLASSROOM_TEST_OUTPUT):fs.mkdtempSync(path.join(base,'run-'));
fs.mkdirSync(output,{recursive:true});
module.exports=output;
