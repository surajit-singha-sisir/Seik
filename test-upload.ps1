$base = 'http://localhost:3000'

# 1. Login
$loginBody = @{ username = 'admin'; password = 'admin123'; next = '/' } | ConvertTo-Json
$loginResp = Invoke-WebRequest -Uri "$base/auth/login" -Method POST -Body $loginBody -ContentType 'application/json' -SessionVariable sess -UseBasicParsing
Write-Output "LOGIN STATUS: $($loginResp.StatusCode)"
Write-Output $loginResp.Content
Write-Output '---'
