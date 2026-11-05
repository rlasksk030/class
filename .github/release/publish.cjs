// Runs only after every native Windows gate succeeds; no force push or old asset deletion.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const gh=(...args)=>execFileSync('gh',args,{encoding:'utf8',stdio:['ignore','pipe','inherit']}).trim();
const feed=path.resolve('../feed'),git=(...args)=>execFileSync('git',args,{cwd:feed,encoding:'utf8',stdio:['ignore','pipe','inherit']}).trim();
assert.equal(process.env.GITHUB_REPOSITORY,'rlasksk030/class');
assert.equal(git('rev-parse','HEAD'),'2357510cc93c2059264660178c78f770ee4a2f1b','Distribution branch changed; inspect before release');
const records={};
for(const edition of ['nationwide','okgu']){
 const tag=edition==='nationwide'?'timer-pip-nationwide-v1.8.11':'v1.8.11',source=process.env[edition==='nationwide'?'NATIONAL_SHA':'OKGU_SHA'];
 const release=JSON.parse(gh('release','view',tag,'--json','isDraft,targetCommitish,assets'));
 assert.equal(release.isDraft,true,'Never replace a published release');assert.equal(release.targetCommitish,source);
 const dir=path.resolve('staged',edition);fs.mkdirSync(dir,{recursive:true});
 gh('release','download',tag,'--pattern','*.exe','--pattern','*.blockmap','--pattern',edition==='nationwide'?'nationwide.yml':'latest.yml','--pattern','release-artifacts.json','--dir',dir);
 execFileSync(process.execPath,['.github/release/verify.cjs',edition,dir,'download'],{env:{...process.env,SOURCE_SHA:source},stdio:'inherit'});
 records[edition]=JSON.parse(fs.readFileSync(path.join(dir,'release-artifacts.json')));
}
const run=`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
const evidence={version:'1.8.11',run,nationwideBuildRun:run,windows:{syntax:'PASS',unit:'PASS',electronRegression:'PASS',installerScenarios:['A','B','C','D','E','F','G','H','I'],previousEditionUpgrades:'PASS',packagedTimerPip:'PASS',updateChannels:'PASS'},artifacts:records};
fs.writeFileSync('release-validation.json',JSON.stringify(evidence,null,2)+'\n');
const national=path.resolve('staged/nationwide'),names=records.nationwide.files.map(f=>f.name);
for(const name of names){assert.equal(path.basename(name),name);fs.copyFileSync(path.join(national,name),path.join(feed,name));}
const readme=fs.readFileSync(path.join(feed,'README.md'),'utf8').replaceAll('1.8.10','1.8.11').replace('전국용 v1.8.9 사용자는','전국용 v1.8.9 이상 사용자는');
fs.writeFileSync(path.join(feed,'README.md'),readme+'\n이번 v1.8.11은 v1.8.10과 기능이 같은 재배포본입니다.\n');
names.push('README.md');
const audit='v1.8.11-release-validation.json';fs.copyFileSync('release-validation.json',path.join(feed,audit));
git('config','user.name','Classroom Dashboard Release');git('config','user.email','rlasksk030@users.noreply.github.com');
git('add','--',...names,audit);git('commit','-m','release: nationwide v1.8.11 timer PIP [skip ci]','-m',`Validated Windows builds and original installer gates: ${run}\nSource: ${process.env.NATIONAL_SHA}`);
git('push','origin','HEAD:refs/heads/downloads/nationwide');
const publishedFeed=git('rev-parse','HEAD');evidence.nationwideCommit=publishedFeed;
for(const file of records.nationwide.files){
 const url=`https://raw.githubusercontent.com/rlasksk030/class/${publishedFeed}/${file.name}`;
 const bytes=execFileSync('curl',['--fail','--location','--silent','--show-error',url],{maxBuffer:110*1024*1024});
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256,'Published nationwide bytes mismatch');
}
const notes=`옥구초 전용 v1.8.11 재배포본입니다. v1.8.10의 기능을 유지하고 새 업데이트로 받을 수 있도록 버전 번호를 올렸습니다.\n\n- 타이머 창에서 PIP를 눌러 항상 위에 표시합니다.\n- PIP에서 시작·일시정지·계속하기·다시 시작·초기화·완료 확인을 조작합니다.\n- PIP를 닫아도 진행 중인 타이머를 유지합니다. 시간 설정을 누르면 본창으로 돌아갑니다.\n- 기존 학급 데이터와 설치 폴더, 옥구초 전용 업데이트 경로를 유지합니다.\n\nWindows x64 전체 회귀 검사, 설치 시나리오 A–I, 두 판의 기존 버전 업그레이드, 설치본 PIP, 업데이트 채널 분리 검사를 통과했습니다.\n검증: ${run}\n소스: ${process.env.OKGU_SHA}\n\n전국용 설치 파일은 downloads/nationwide 브랜치에서 별도로 배포합니다.\n`;
fs.writeFileSync('release-notes.md',notes);fs.writeFileSync('release-validation.json',JSON.stringify(evidence,null,2)+'\n');
gh('release','upload','v1.8.11','release-validation.json');
gh('release','upload','timer-pip-nationwide-v1.8.11','release-validation.json');
gh('release','edit','v1.8.11','--draft=false','--latest','--title','우리 교실 옥구초 전용 v1.8.11 — 타이머 PIP 재배포','--notes-file','release-notes.md');
// Keep the nationwide staging release as a draft so it never enters the Okgu release feed.
console.log(JSON.stringify(evidence,null,2));
