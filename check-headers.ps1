$base = 'http://localhost:3000'
$loginBody = @{ username = 'admin'; password = 'admin123'; next = '/' } | ConvertTo-Json
$loginResp = Invoke-WebRequest -Uri "$base/auth/login" -Method POST -Body $loginBody -ContentType 'application/json' -UseBasicParsing
Write-Output "STATUS: $($loginResp.StatusCode)"
Write-Output "HEADERS:"
$loginResp.Headers
