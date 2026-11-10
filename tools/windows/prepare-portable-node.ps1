#Requires -Version 5.1
# Portable, hash-pinned Node for isolated Windows validation.
# Nothing is installed system-wide; no administrator rights, cloud CI or billing.
# This script does NOT install/upgrade the application or run product tests.
[CmdletBinding()]
param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT' -or -not [Environment]::Is64BitOperatingSystem) {
  throw 'This helper requires Windows x64.'
}
if (-not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA is unavailable; refusing to write.' }
$version = '22.14.0'
$package = "node-v$version-win-x64"
$expectedSha256 = '55b639295920b219bb2acbcfa00f90393a2789095b7323f79475c9f34795f217'
$root = Join-Path $env:LOCALAPPDATA 'classroom-dashboard-validation-tools'
$destination = Join-Path $root $package
$node = Join-Path $destination 'node.exe'
$npm = Join-Path $destination 'npm.cmd'

if (-not (Test-Path -LiteralPath $node)) {
  if ($CheckOnly) {
    Write-Output "MISSING portable Node v$version. No download performed."
    return
  }
  New-Item -ItemType Directory -Path $root -Force | Out-Null
  $archive = Join-Path $root "$package.zip"
  if (-not (Test-Path -LiteralPath $archive)) {
    $uri = "https://nodejs.org/dist/v$version/$package.zip"
    Invoke-WebRequest -Uri $uri -OutFile $archive -UseBasicParsing
  }
  $sha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($sha256 -ne $expectedSha256) {
    throw "Node archive hash mismatch. File was not executed or deleted: $archive"
  }
  $staging = Join-Path $root ("unpack-" + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $staging | Out-Null
  Expand-Archive -LiteralPath $archive -DestinationPath $staging
  $extracted = Join-Path $staging $package
  if (-not (Test-Path -LiteralPath (Join-Path $extracted 'node.exe'))) {
    throw 'Verified archive did not contain the expected Node executable.'
  }
  if (Test-Path -LiteralPath $destination) {
    throw "Destination already exists; refusing to overwrite: $destination"
  }
  Move-Item -LiteralPath $extracted -Destination $destination
  Remove-Item -LiteralPath $staging -Recurse -Force
}
if (-not (Test-Path -LiteralPath $npm)) { throw 'npm.cmd is missing in the portable Node folder.' }
$actualVersion = (& $node --version | Out-String).Trim()
if ($actualVersion -ne "v$version") { throw "Unexpected Node version $actualVersion; expected v$version" }
Write-Output "Portable Node ready: $node"
Write-Output "Portable npm ready: $npm"
$env:PATH = $destination + [IO.Path]::PathSeparator + $env:PATH
Write-Output 'Portable Node is on this process PATH only; no user or system PATH was changed.'
Write-Output 'For local validation, run the following commands from the repository root:'
Write-Output ('  & "' + $npm + '" ci')
Write-Output ('  & "' + $npm + '" run check')
Write-Output ('  & "' + $npm + '" test')
Write-Output ('  & "' + $npm + '" run test:e2e')
Write-Output ('  & "' + $npm + '" run dist:win')
Write-Output 'Then run the full existing Windows installer/update scenarios on the actual baseline installer.'
