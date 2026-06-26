Set-Location "D:\Web\TEMP\Imgbb"

Write-Host "=== Checking dist/middleware ===" -ForegroundColor Cyan
$mw = Get-Item "D:\Web\TEMP\Imgbb\dist\middleware" -ErrorAction SilentlyContinue
if ($mw) {
    Get-ChildItem "D:\Web\TEMP\Imgbb\dist\middleware" | ForEach-Object { Write-Host "  $($_.Name)  $($_.LastWriteTime)" }
} else {
    Write-Host "  dist\middleware\ does NOT exist yet" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Checking node_modules for auth packages ===" -ForegroundColor Cyan
$pkgs = @("express-session","bcryptjs","@types/express-session","@types/bcryptjs")
foreach ($p in $pkgs) {
    $path = "D:\Web\TEMP\Imgbb\node_modules\$p"
    if (Test-Path $path) {
        Write-Host "  [OK] $p" -ForegroundColor Green
    } else {
        Write-Host "  [MISSING] $p" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== package.json deps ===" -ForegroundColor Cyan
$pkg = Get-Content "D:\Web\TEMP\Imgbb\package.json" | ConvertFrom-Json
$pkg.dependencies.PSObject.Properties | Where-Object { $_.Name -match "session|bcrypt" } | ForEach-Object { Write-Host "  dep: $($_.Name) = $($_.Value)" -ForegroundColor Green }
$pkg.devDependencies.PSObject.Properties | Where-Object { $_.Name -match "session|bcrypt" } | ForEach-Object { Write-Host "  dev: $($_.Name) = $($_.Value)" -ForegroundColor Green }
