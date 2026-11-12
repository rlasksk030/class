// Nationwide update feed rule (nationwide2.yml, from v1.8.16).
// The feed must name exactly one installer at its own GitHub Release asset URL.
// The comparison is a plain string match, so http, another host, repository or tag,
// a query string and the old file-name-only form are all rejected.
const RELEASES = 'https://github.com/rlasksk030/class/releases/download/';
const installerName = version => `classroom-dashboard-nationwide-setup-${version}-x64.exe`;
const releaseAssetUrl = version => `${RELEASES}nationwide-v${version}/${installerName(version)}`;

function nationwideFeedOk(info) {
  const version = info?.version;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) return false;
  const expected = releaseAssetUrl(version);
  const files = info.files;
  return Array.isArray(files) && files.length === 1 && files[0]?.url === expected &&
    (!info.path || info.path === expected) && !info.packages;
}

module.exports = {installerName, releaseAssetUrl, nationwideFeedOk};
