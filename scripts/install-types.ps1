Set-Location "D:\Web\TEMP\Imgbb"
Write-Host "Installing @types packages..." -ForegroundColor Cyan
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" install --save-dev "@types/express-session@1.18.1" "@types/bcryptjs@2.4.6"
Write-Host "Done installing." -ForegroundColor Green
