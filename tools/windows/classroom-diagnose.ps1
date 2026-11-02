# 우리 교실 설치·데이터 진단 (읽기 전용)
# - 아무것도 삭제하거나 제거(uninstall)하지 않습니다.
# - 저장 내용은 출력하지 않고 경로, 파일 수, 날짜, 저장 키 이름만 보여 줍니다.
# - -Backup 을 붙이면 찾은 사용자 데이터 폴더를 문서\우리교실-데이터백업\<시각>\ 아래로 "복사"만 합니다.
#   (앱을 모두 닫은 뒤 실행하세요. 하이클래스 로그인 세션 폴더(Partitions)는 복사하지 않습니다.)
# 사용: PowerShell 에서  powershell -ExecutionPolicy Bypass -File .\classroom-diagnose.ps1 [-Backup]
param([switch]$Backup)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'SilentlyContinue'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$report = New-Object System.Collections.Generic.List[string]
function Say($t) { Write-Host $t; $report.Add($t) }

$guids = [ordered]@{ 'v1.7.x (org.school.classroomdashboard)' = 'd78eedc4-9833-5771-9f01-d94e51e1b797'; 'v1.8.x (kr.classroom.dashboard)' = '80d89bea-829d-5beb-a731-910f2523db96' }
Say "== 우리 교실 진단  $(Get-Date)  사용자: $env:USERNAME"
Say ""
Say "[1] 설치 등록 정보 (제어판 '설치된 앱')"
$installDirs = @()
foreach ($label in $guids.Keys) {
  $g = $guids[$label]
  foreach ($hive in 'HKCU:', 'HKLM:') {
    $u = Get-ItemProperty "$hive\Software\Microsoft\Windows\CurrentVersion\Uninstall\$g"
    if ($u) {
      $loc = (Get-ItemProperty "$hive\Software\$g").InstallLocation
      if (-not $loc -and $u.UninstallString -match '^"([^"]+)"') { $loc = Split-Path $Matches[1] }
      Say ("  {0} {1}: {2} / 버전 {3} / 설치 폴더 {4}" -f $hive, $label, $u.DisplayName, $u.DisplayVersion, $loc)
      if ($loc) { $installDirs += $loc }
    }
  }
}
Say ""
Say "[2] 설치 폴더의 실행 파일"
foreach ($d in ($installDirs + "$env:LOCALAPPDATA\Programs\classroom-dashboard", "$env:ProgramFiles\classroom-dashboard") | Sort-Object -Unique) {
  $exe = Join-Path $d '우리 교실.exe'
  if (Test-Path $exe) { $asar = Join-Path $d 'resources\app.asar'; Say ("  {0}  (수정 {1}, app.asar {2:N0} bytes)" -f $exe, (Get-Item $exe).LastWriteTime, (Get-Item $asar).Length) }
}
Say ""
Say "[3] 바로가기와 대상"
$sh = New-Object -ComObject Shell.Application
foreach ($dir in [Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('CommonDesktopDirectory'), [Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('CommonPrograms')) {
  Get-ChildItem $dir -Recurse -Filter *.lnk | Where-Object { $_.Name -like '*교실*' } | ForEach-Object { Say ("  {0} -> {1}" -f $_.FullName, $sh.Namespace($_.DirectoryName).ParseName($_.Name).GetLink.Path) }
}
Say ""
Say "[4] Windows 시작 시 자동 실행"
(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run').PSObject.Properties | Where-Object { $_.Name -match 'classroom' -or "$($_.Value)" -match '교실' } | ForEach-Object { Say ("  {0} = {1}" -f $_.Name, $_.Value) }
Say ""
Say "[5] 실행 중인 우리 교실"
Get-CimInstance Win32_Process -Filter "Name='우리 교실.exe'" | ForEach-Object { $o = Invoke-CimMethod -InputObject $_ -MethodName GetOwner; Say ("  PID {0}  {1}  사용자 {2}" -f $_.ProcessId, $_.ExecutablePath, $o.User) }
Say ""
Say "[6] 사용자 데이터 폴더 (모든 앱 버전이 %APPDATA%\classroom-dashboard 를 사용)"
$profiles = @("$env:APPDATA\classroom-dashboard") + (Get-ChildItem 'C:\Users' -Directory | ForEach-Object { Join-Path $_.FullName 'AppData\Roaming\classroom-dashboard' }) | Sort-Object -Unique
$found = @()
foreach ($p in $profiles) {
  if (-not (Test-Path $p)) { continue }
  $found += $p
  $ls = Join-Path $p 'Local Storage\leveldb'
  $files = Get-ChildItem $ls -File
  Say ("  {0}" -f $p)
  Say ("    Local Storage: 파일 {0}개, 합계 {1:N0} bytes, 최근 수정 {2}" -f $files.Count, ($files | Measure-Object Length -Sum).Sum, ($files | Sort-Object LastWriteTime | Select-Object -Last 1).LastWriteTime)
  foreach ($f in 'desktop-settings.json', 'hiclass-links.json') { if (Test-Path (Join-Path $p $f)) { Say "    $f 있음" } }
  Get-ChildItem (Join-Path $p 'update-recovery') -Directory | Sort-Object Name | ForEach-Object {
    $j = Join-Path $_.FullName 'local-storage-backup.json'
    if (Test-Path $j) { $keys = ((Get-Content $j -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties.Name) -join ', '; Say ("    업데이트 직전 자동 백업 {0}: 키 {1}" -f $_.Name, $keys) }
  }
  Get-ChildItem (Join-Path $p 'backups') -Filter *.json | ForEach-Object { Say ("    복원 직전 보관본 {0}" -f $_.Name) }
}
if (-not $found) { Say "  찾은 데이터 폴더 없음" }
if ($Backup -and $found) {
  if (Get-Process -Name '우리 교실') { Say ""; Say "※ 우리 교실이 실행 중입니다. 모두 닫은 뒤 -Backup 으로 다시 실행해 주세요. 백업하지 않았습니다." }
  else {
    $dest = Join-Path ([Environment]::GetFolderPath('MyDocuments')) "우리교실-데이터백업\$stamp"
    foreach ($p in $found) {
      $name = ($p -replace '[:\\]', '_')
      $to = Join-Path $dest $name
      New-Item -ItemType Directory -Force $to | Out-Null
      foreach ($item in 'Local Storage', 'update-recovery', 'backups', 'desktop-settings.json', 'hiclass-links.json') { $src = Join-Path $p $item; if (Test-Path $src) { Copy-Item $src $to -Recurse -Force } }
    }
    Say ""; Say "백업(복사) 완료: $dest"
  }
}
$out = Join-Path ([Environment]::GetFolderPath('Desktop')) "우리교실-진단-$stamp.txt"
$report | Set-Content $out -Encoding UTF8
Write-Host ""; Write-Host "진단 결과 저장: $out"
