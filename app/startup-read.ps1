$rows = @()
foreach ($hive in @('HKCU', 'HKLM')) {
    $scope = if ($hive -eq 'HKCU') { 'user' } else { 'machine' }
    foreach ($suffix in @('Software\Microsoft\Windows\CurrentVersion\Run', 'Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run')) {
        $key = $hive + ':\' + $suffix
        if (-not (Test-Path -LiteralPath $key)) { continue }
        $item = Get-Item -LiteralPath $key
        foreach ($name in $item.GetValueNames()) {
            $value = [string]$item.GetValue($name)
            if ($name -notmatch 'classroom|우리.?교실' -and $value -notmatch 'classroom-dashboard|우리 교실.exe') { continue }
            $leaf = if ($suffix -like '*WOW6432Node*') { 'Run32' } else { 'Run' }
            $approval = $hive + ':\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\' + $leaf
            $enabled = $true
            if (Test-Path -LiteralPath $approval) {
                $bytes = (Get-Item -LiteralPath $approval).GetValue($name)
                if ($bytes -and ($bytes[0] -eq 3 -or $bytes[0] -eq 7)) { $enabled = $false }
            }
            $rows += @{ scope=$scope; kind='run'; key=$key; name=$name; value=$value; enabled=$enabled }
        }
    }
    $approval = $hive + ':\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder'
    if (Test-Path -LiteralPath $approval) {
        $item = Get-Item -LiteralPath $approval
        foreach ($name in $item.GetValueNames()) {
            $bytes = $item.GetValue($name)
            $rows += @{ scope=$scope; kind='shortcut-approval'; name=$name; enabled=($bytes[0] -ne 3 -and $bytes[0] -ne 7) }
        }
    }
}
ConvertTo-Json -InputObject @($rows) -Compress
