$files = Get-ChildItem "D:\Web\TEMP\Imgbb\public\*.html" | Where-Object { $_.Name -ne "login.html" }
foreach ($f in $files) {
  $content = Get-Content $f.FullName -Raw
  $hasBtn  = if ($content -match 'logout-btn|btn-logout|logout') { "YES" } else { "NO" }
  $hasJS   = if ($content -match 'auth/logout') { "YES" } else { "NO" }
  Write-Host "$($f.Name): button=$hasBtn  JS=/auth/logout=$hasJS"
}
