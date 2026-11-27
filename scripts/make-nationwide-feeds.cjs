// Writes the nationwide update feeds from electron-builder's dist/nationwide2.yml.
//   nationwide2.yml  url/path = the version's GitHub Release asset URL (read by v1.8.16 and later)
//   nationwide.yml   url/path = the installer file name (read by v1.8.8–v1.8.15)
// nationwide.yml is frozen at the bridge version: it is written only for BRIDGE_VERSION and never again.
// Usage: node scripts/make-nationwide-feeds.cjs [distDir]
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {installerName, releaseAssetUrl} = require('../app/update-feed-check.cjs');

const BRIDGE_VERSION = '1.8.16';
const LINES = [
  /^version: (\d+\.\d+\.\d+)$/,
  /^files:$/,
  /^  - url: (\S+)$/,
  /^    sha512: ([A-Za-z0-9+/]{86}==)$/,
  /^    size: (\d+)$/,
  /^path: (\S+)$/,
  /^sha512: ([A-Za-z0-9+/]{86}==)$/,
  /^releaseDate: '(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)'$/
];

// Accepts only the exact shape electron-builder writes for one NSIS installer (or this script's own output).
function parseFeed(text) {
  const lines = String(text).replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  if (lines.length !== LINES.length) throw Error('Unexpected feed layout: ' + lines.length + ' lines');
  const m = lines.map((line, i) => LINES[i].exec(line) || (() => { throw Error('Unexpected feed line ' + (i + 1) + ': ' + line); })());
  const [version, url, sha512, size, pathValue, topSha512, releaseDate] = [m[0][1], m[2][1], m[3][1], Number(m[4][1]), m[5][1], m[6][1], m[7][1]];
  if (![installerName(version), releaseAssetUrl(version)].includes(url)) throw Error('Unexpected installer URL: ' + url);
  if (pathValue !== url) throw Error('path does not match files[0].url');
  if (topSha512 !== sha512) throw Error('sha512 does not match files[0].sha512');
  if (!Number.isSafeInteger(size) || size <= 0) throw Error('Invalid size');
  return {version, sha512, size, releaseDate};
}

function renderFeed({version, sha512, size, releaseDate}, url) {
  return [`version: ${version}`, 'files:', `  - url: ${url}`, `    sha512: ${sha512}`, `    size: ${size}`,
    `path: ${url}`, `sha512: ${sha512}`, `releaseDate: '${releaseDate}'`, ''].join('\n');
}

// Same version, sha512, size and date; only url/path differ.
function makeFeeds(builderText) {
  const info = parseFeed(builderText);
  return {info, legacy: renderFeed(info, installerName(info.version)), current: renderFeed(info, releaseAssetUrl(info.version))};
}

function main(distDir) {
  const source = path.join(distDir, 'nationwide2.yml');
  const {info, legacy, current} = makeFeeds(fs.readFileSync(source, 'utf8'));
  const installer = path.join(distDir, installerName(info.version));
  const bytes = fs.readFileSync(installer);
  if (bytes.length !== info.size) throw Error(`Installer size ${bytes.length} does not match the feed (${info.size})`);
  if (createHash('sha512').update(bytes).digest('base64') !== info.sha512) throw Error('Installer sha512 does not match the feed');
  fs.writeFileSync(source, current);
  const legacyFile = path.join(distDir, 'nationwide.yml');
  if (info.version === BRIDGE_VERSION) fs.writeFileSync(legacyFile, legacy);
  else if (fs.existsSync(legacyFile)) fs.rmSync(legacyFile);
  console.log(`nationwide2.yml ${info.version} -> ${releaseAssetUrl(info.version)}`);
  console.log(info.version === BRIDGE_VERSION
    ? `nationwide.yml ${info.version} -> ${installerName(info.version)} (bridge for v1.8.8–v1.8.15)`
    : `nationwide.yml not written: it stays frozen at ${BRIDGE_VERSION}`);
}

if (require.main === module) main(path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist')));
module.exports = {BRIDGE_VERSION, parseFeed, renderFeed, makeFeeds, main};
