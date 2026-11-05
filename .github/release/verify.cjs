// Run inside a checked-out edition after its native Windows build.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=process.cwd(),load=name=>require(require.resolve(name,{paths:[root]}));
const edition=process.argv[2],version='1.8.10',dir=path.resolve(process.argv[3]||'dist');
assert.ok(['nationwide','okgu'].includes(edition));
const file=edition==='nationwide'?`classroom-dashboard-nationwide-setup-${version}-x64.exe`:`classroom-dashboard-setup-${version}.exe`;
const manifest=edition==='nationwide'?'nationwide.yml':'latest.yml';
const names=[file,file+'.blockmap',manifest],hash=(data,kind,encoding='hex')=>crypto.createHash(kind).update(data).digest(encoding);
const data=load('js-yaml').load(fs.readFileSync(path.join(dir,manifest),'utf8')),bytes=fs.readFileSync(path.join(dir,file));
assert.equal(data.version,version);assert.equal(data.files.length,1);assert.equal(data.files[0].url,file);assert.equal(data.path,file);
assert.equal(data.files[0].size,bytes.length);assert.equal(data.files[0].sha512,hash(bytes,'sha512','base64'));assert.equal(data.sha512,data.files[0].sha512);
assert.ok(!data.packages);assert.ok(bytes.length<100*1024*1024,'Installer must fit existing Git distribution');
const expected=edition==='nationwide'?{provider:'generic',url:'https://raw.githubusercontent.com/rlasksk030/class/refs/heads/downloads/nationwide/',channel:'nationwide'}:{provider:'github',owner:'rlasksk030',repo:'class'};
let sourceFiles=0;
if(process.argv[4]!=='download'){
 const asar=load('@electron/asar'),archive=path.join(dir,'win-unpacked/resources/app.asar');
 function walk(rel=''){for(const item of fs.readdirSync(path.join(root,'app',rel),{withFileTypes:true})){
  const name=path.join(rel,item.name);if(item.isDirectory())walk(name);else if(name!=='package-lock.json'){
   assert.deepEqual(asar.extractFile(archive,name),fs.readFileSync(path.join(root,'app',name)),name+' source mismatch');sourceFiles++;
  }
 }}walk();
 assert.deepEqual(JSON.parse(asar.extractFile(archive,'update-config.json')),expected);
 const config=load('js-yaml').load(fs.readFileSync(path.join(dir,'win-unpacked/resources/app-update.yml'),'utf8'));
 for(const [key,value]of Object.entries(expected))assert.equal(config[key],value);
 assert.equal(JSON.parse(asar.extractFile(archive,'package.json')).version,version);
 assert.ok(!asar.listPackage(archive).some(p=>/node_modules|\.profile|Cookies|Local Storage/.test(p)));
}
const report={edition,version,source:process.env.SOURCE_SHA,run:`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,sourceFiles,files:names.map(name=>{const b=fs.readFileSync(path.join(dir,name));return{name,size:b.length,sha256:hash(b,'sha256'),sha512:hash(b,'sha512','base64')};})};
if(process.argv[4]==='download'){
 const saved=JSON.parse(fs.readFileSync(path.join(dir,'release-artifacts.json'),'utf8'));
 assert.deepEqual(report.files,saved.files);assert.equal(saved.source,process.env.SOURCE_SHA);
}else fs.writeFileSync(path.join(dir,'release-artifacts.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
