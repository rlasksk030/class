// Automatic release helper for .github/workflows/release.yml (same file in both editions).
// The edition comes from electron-builder.json: provider github = 옥구초판 (Release marked Latest),
// provider generic = 전국판 (Release not Latest, then nationwide2.yml on downloads/nationwide).
//   node scripts/release-publish.cjs info            -> edition/version/tag/title/latest lines for $GITHUB_OUTPUT
//   node scripts/release-publish.cjs prepare         -> checks dist/ and writes out/ (assets, SHA256SUMS, validation, notes)
//   node scripts/release-publish.cjs check-public    -> downloads every Release asset without a login and compares SHA-256
//   node scripts/release-publish.cjs downloads <dir> -> writes the nationwide feed files and README into a downloads checkout
//   node scripts/release-publish.cjs check-feed      -> waits until the public nationwide2.yml shows this version
//   node scripts/release-publish.cjs e2e             -> runs every file of npm run test:e2e and fails at the end if any failed
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {spawnSync} = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const REPO = 'rlasksk030/class';
const MAX_BYTES = 100 * 1024 * 1024; // GitHub refuses larger files in a push; keep the same limit for Release assets.
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sha512 = bytes => createHash('sha512').update(bytes).digest('base64');

function context() {
  const builder = JSON.parse(read('electron-builder.json'));
  const publish = builder.publish?.[0] || builder.publish;
  const config = JSON.parse(read('app/update-config.json'));
  const version = JSON.parse(read('app/package.json')).version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('app/package.json version is not x.y.z: ' + version);
  const okgu = publish?.provider === 'github';
  if (!okgu && publish?.provider !== 'generic') throw Error('Unknown publish provider');
  if (config.provider !== publish.provider) throw Error('update-config.json and electron-builder.json disagree');
  if (!okgu && config.channel !== 'nationwide2') throw Error('Nationwide update-config.json must use channel nationwide2');
  const edition = okgu ? 'okgu' : 'nationwide';
  const installer = builder.nsis.artifactName.replace('${version}', version);
  const feed = okgu ? 'latest.yml' : 'nationwide2.yml';
  const tag = okgu ? `v${version}` : `nationwide-v${version}`;
  const {NOTES} = require(path.join(ROOT, 'app/whats-new.js'));
  const notes = NOTES[version];
  if (!notes) throw Error(`app/whats-new.js has no NOTES for ${version}`);
  const name = okgu ? '옥구초 전용' : '전국용';
  return {edition, okgu, version, installer, feed, tag, notes, title: `우리 교실 ${name} v${version} — ${notes.title}`};
}

function info() {
  const c = context();
  const branch = process.env.GITHUB_REF_NAME;
  if (branch && branch !== `release/${c.edition}-v${c.version}`)
    throw Error(`Branch ${branch} does not match release/${c.edition}-v${c.version} (edition and version must agree)`);
  for (const [k, v] of Object.entries({edition: c.edition, version: c.version, tag: c.tag, title: c.title, latest: String(c.okgu)}))
    console.log(`${k}=${v}`);
}

// Accepts only the shape electron-builder writes for one NSIS installer.
function parseFeed(text) {
  const t = String(text).replace(/\r\n/g, '\n');
  const pick = re => (re.exec(t) || [])[1];
  return {version: pick(/^version: (\S+)$/m), url: pick(/^  - url: (\S+)$/m), sha512: pick(/^    sha512: (\S+)$/m),
    size: Number(pick(/^    size: (\d+)$/m)), path: pick(/^path: (\S+)$/m), topSha512: pick(/^sha512: (\S+)$/m)};
}

function prepare() {
  const c = context(), dist = path.join(ROOT, 'dist'), out = path.join(ROOT, 'out');
  const exe = fs.readFileSync(path.join(dist, c.installer));
  const blockmap = path.join(dist, c.installer + '.blockmap');
  if (exe.length >= MAX_BYTES) throw Error(`Installer is ${exe.length} bytes (limit ${MAX_BYTES})`);
  if (!fs.existsSync(blockmap)) throw Error('blockmap missing');
  const feed = parseFeed(fs.readFileSync(path.join(dist, c.feed), 'utf8'));
  const expectedUrl = c.okgu ? c.installer : `https://github.com/${REPO}/releases/download/${c.tag}/${c.installer}`;
  if (feed.version !== c.version) throw Error(`${c.feed} version ${feed.version} != ${c.version}`);
  if (feed.url !== expectedUrl || feed.path !== expectedUrl) throw Error(`${c.feed} url ${feed.url} != ${expectedUrl}`);
  if (feed.size !== exe.length || feed.sha512 !== sha512(exe) || feed.topSha512 !== feed.sha512) throw Error(`${c.feed} size/sha512 do not match the installer`);
  if (!c.okgu && fs.existsSync(path.join(dist, 'nationwide.yml'))) throw Error('nationwide.yml must stay frozen at 1.8.16');
  // The packaged app must carry this edition's own update channel.
  const asar = require('@electron/asar'), unpacked = path.join(dist, 'win-unpacked', 'resources');
  const packaged = JSON.parse(asar.extractFile(path.join(unpacked, 'app.asar'), 'update-config.json').toString('utf8'));
  if (JSON.stringify(packaged) !== JSON.stringify(JSON.parse(read('app/update-config.json')))) throw Error('Packaged update-config.json differs from app/update-config.json');
  if (JSON.parse(asar.extractFile(path.join(unpacked, 'app.asar'), 'package.json').toString('utf8')).version !== c.version) throw Error('Packaged version differs');
  const appUpdate = fs.readFileSync(path.join(unpacked, 'app-update.yml'), 'utf8');
  if (!appUpdate.includes(`provider: ${c.okgu ? 'github' : 'generic'}`) || (!c.okgu && !appUpdate.includes('channel: nationwide2'))) throw Error('app-update.yml has the wrong channel');

  fs.rmSync(out, {recursive: true, force: true});
  fs.mkdirSync(out);
  const assets = [c.installer, c.installer + '.blockmap', c.feed];
  for (const a of assets) fs.copyFileSync(path.join(dist, a), path.join(out, a));
  const files = assets.map(a => {const b = fs.readFileSync(path.join(out, a)); return {name: a, bytes: b.length, sha256: sha256(b)};});
  fs.writeFileSync(path.join(out, 'SHA256SUMS.txt'), files.map(f => `${f.sha256}  ${f.name}`).join('\n') + '\n');
  const validation = {
    source: process.env.GITHUB_SHA || '', branch: process.env.GITHUB_REF_NAME || '', version: c.version, edition: c.edition,
    appId: 'org.school.classroomdashboard', validationBuild: false,
    builtOn: `GitHub Actions windows-latest, npm run dist:win (run ${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${REPO}/actions/runs/${process.env.GITHUB_RUN_ID || ''})`,
    updateChannel: JSON.parse(read('app/update-config.json')),
    artifacts: files,
    checks: {syntax: 'PASS (npm run check)', unit: 'PASS (npm test)', e2eAll: 'PASS (npm run test:e2e on Windows)',
      installerUnder100MiB: 'PASS', feedMatchesInstaller: 'PASS', packagedUpdateChannel: 'PASS',
      windowsInstallUpdateReboot: 'NOT RUN'},
    releaseTag: c.tag, releaseLatest: c.okgu
  };
  fs.writeFileSync(path.join(out, 'release-validation.json'), JSON.stringify(validation, null, 1) + '\n');
  const lines = ['**업데이트 전에 설정 → 백업을 한 번 해 두세요.**', '', `### ${c.notes.title}`, ...c.notes.items.map(i => `- ${i}`), '',
    c.okgu ? '앱의 **설정 → 업데이트 → 업데이트 확인**에서 받을 수 있습니다.' :
      '앱의 **설정 → 업데이트 → 업데이트 확인**에서 받을 수 있습니다. v1.8.9~v1.8.15는 먼저 v1.8.16을 받은 뒤 이어서 받습니다.',
    '', `빌드·시험: GitHub Actions(Windows)에서 \`npm run check\` · \`npm test\` · \`npm run test:e2e\` 통과 후 자동 배포. Windows 설치·업데이트 실기 확인은 아직 하지 않았습니다(NOT RUN).`,
    `소스: ${process.env.GITHUB_SHA || ''}`];
  fs.writeFileSync(path.join(out, 'release-notes.md'), lines.join('\n') + '\n');
  console.log(files.map(f => `${f.sha256}  ${f.bytes}  ${f.name}`).join('\n'));
}

async function fetchBytes(url) {
  for (let i = 0; i < 6; i++) {
    const res = await fetch(url, {redirect: 'follow', headers: {'user-agent': 'classroom-release-check'}});
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    await new Promise(r => setTimeout(r, 10000));
  }
  throw Error('Could not download ' + url);
}

async function checkPublic() {
  const c = context(), out = path.join(ROOT, 'out');
  for (const line of fs.readFileSync(path.join(out, 'SHA256SUMS.txt'), 'utf8').trim().split('\n')) {
    const [hash, name] = line.split(/\s+/);
    const bytes = await fetchBytes(`https://github.com/${REPO}/releases/download/${c.tag}/${name}`);
    if (sha256(bytes) !== hash) throw Error(`Public ${name} differs from the build`);
    console.log(`public OK  ${name}  ${bytes.length}`);
  }
  const latest = await (await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {headers: {'user-agent': 'classroom-release-check'}})).json();
  if (c.okgu && latest.tag_name !== c.tag) throw Error(`releases/latest is ${latest.tag_name}, expected ${c.tag}`);
  if (!c.okgu && !/^v\d/.test(latest.tag_name || '')) throw Error(`releases/latest is ${latest.tag_name}; it must stay on an 옥구초 tag`);
  console.log(`releases/latest = ${latest.tag_name}`);
}

function downloads(dir) {
  const c = context(), out = path.join(ROOT, 'out');
  if (c.okgu) throw Error('downloads/nationwide is only for the nationwide edition');
  fs.copyFileSync(path.join(out, 'nationwide2.yml'), path.join(dir, 'nationwide2.yml'));
  fs.copyFileSync(path.join(out, 'SHA256SUMS.txt'), path.join(dir, `v${c.version}-SHA256SUMS.txt`));
  fs.copyFileSync(path.join(out, 'release-notes.md'), path.join(dir, `v${c.version}-release-notes.md`));
  fs.copyFileSync(path.join(out, 'release-validation.json'), path.join(dir, `v${c.version}-release-validation.json`));
  const readmePath = path.join(dir, 'README.md');
  let readme = fs.readFileSync(readmePath, 'utf8');
  const link = `https://github.com/${REPO}/releases/download/${c.tag}/${c.installer}`;
  readme = readme.replace(/^\[v\d+\.\d+\.\d+ 다운로드\]\(https:\/\/github\.com\/[^)]+\)$/m, `[v${c.version} 다운로드](${link})`);
  if (!readme.includes(`[v${c.version} 다운로드]`)) throw Error('README download link line not found');
  if (!readme.includes(`## v${c.version} `)) {
    const section = [`## v${c.version} ${c.notes.title}`, '', '**업데이트 전에 설정 → 백업을 한 번 해 두세요.**', '',
      ...c.notes.items.map(i => `- ${i}`), '',
      `[Release 및 SHA-256](https://github.com/${REPO}/releases/tag/${c.tag}) · [검증 범위](v${c.version}-release-validation.json) · [릴리스 안내](v${c.version}-release-notes.md)`, '',
      'GitHub Actions(Windows)에서 시험·빌드 후 자동 배포했습니다. Windows 설치·업데이트 실기 확인은 아직 하지 않았습니다(NOT RUN).', '', ''].join('\n');
    const at = readme.search(/^## v\d/m);
    if (at < 0) throw Error('README has no version section to insert before');
    readme = readme.slice(0, at) + section + readme.slice(at);
  }
  fs.writeFileSync(readmePath, readme);
  console.log('downloads/nationwide files written for ' + c.version);
}

async function checkFeed() {
  const c = context(), want = fs.readFileSync(path.join(ROOT, 'out', 'nationwide2.yml'), 'utf8');
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`https://raw.githubusercontent.com/${REPO}/refs/heads/downloads/nationwide/nationwide2.yml?t=${Date.now()}`, {headers: {'cache-control': 'no-cache'}});
    const text = res.ok ? await res.text() : '';
    if (text.replace(/\r\n/g, '\n') === want.replace(/\r\n/g, '\n')) { console.log(`public nationwide2.yml = ${c.version}`); return; }
    await new Promise(r => setTimeout(r, 20000));
  }
  throw Error('public nationwide2.yml did not update within 10 minutes');
}

// Same files as `npm run test:e2e`, but one failure does not hide the results of the files after it.
function e2e() {
  const scripts = JSON.parse(read('package.json')).scripts;
  const expand = line => line.split('&&').map(x => x.trim()).flatMap(x => {const m = /^npm run (\S+)$/.exec(x); return m ? expand(scripts[m[1]]) : [x];});
  const failed = [];
  for (const command of expand(scripts['test:e2e'])) {
    console.log(`::group::${command}`);
    const r = spawnSync(command, {shell: true, stdio: 'inherit', cwd: ROOT});
    console.log('::endgroup::');
    if (r.status !== 0) { failed.push(command); console.log(`::error::E2E failed: ${command}`); }
  }
  if (failed.length) throw Error(`E2E failed (${failed.length}):\n${failed.join('\n')}`);
  console.log('E2E: all files passed');
}

const [cmd, arg] = process.argv.slice(2);
const run = {info, prepare, 'check-public': checkPublic, downloads: () => downloads(path.resolve(arg)), 'check-feed': checkFeed, e2e}[cmd];
if (!run) { console.error('usage: info | prepare | check-public | downloads <dir> | check-feed | e2e'); process.exit(2); }
Promise.resolve(run()).catch(e => { console.error(e.message); process.exit(1); });
