'use strict';
// Produces a local, separately installed test artifact. Never writes a channel,
// version/tag/release, dependency tree, existing profile or production installer.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),config=require('../electron-builder.json');
const sha=cp.execFileSync('git',['rev-parse','--short=12','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const output=path.join(root,'.out','windows-validation-'+sha);
const manifest=require('../app/package.json');
const next={...config,appId:'org.school.classroomdashboard.validation',productName:'우리 교실 검증용',
 directories:{...config.directories,output},publish:null,
 extraMetadata:{name:'classroom-dashboard-validation',productName:'우리 교실 검증용',version:manifest.version+'-validation.'+sha,classroomValidation:true},
 nsis:{...config.nsis,allowElevation:false,allowToChangeInstallationDirectory:false,include:'build/validation-installer.nsh',
  artifactName:'classroom-dashboard-validation-${version}-x64.exe'}};
fs.mkdirSync(output,{recursive:true});
const file=path.join(output,'builder.json');fs.writeFileSync(file,JSON.stringify(next,null,2)+'\n');
console.log(file);
