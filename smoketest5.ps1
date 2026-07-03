$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

$regBody = @{
  username = "debugtester1"
  email = "debugtester1@example.com"
  password = "debugpassword123"
  imgbbApiKey = "0b5cd39ad8950e226850b4f60343d37c"
  neonDatabaseUrl = "postgresql://neondb_owner:npg_x2vueRciz7fT@ep-icy-unit-aokqmspv-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
} | ConvertTo-Json

try {
  $r1 = Invoke-WebRequest -Uri http://localhost:3000/auth/register -Method POST -ContentType "application/json" -Body $regBody -WebSession $session -UseBasicParsing
  Write-Output ("register: " + $r1.StatusCode + " " + $r1.Content)
} catch {
  Write-Output ("register FAILED: " + $_.Exception.Response.StatusCode.value__ + " " + $_.ErrorDetails.Message)
}

try {
  $r2 = Invoke-WebRequest -Uri http://localhost:3000/api/settings -WebSession $session -UseBasicParsing
  Write-Output ("settings: " + $r2.StatusCode + " " + $r2.Content)
} catch {
  Write-Output ("settings FAILED: " + $_.Exception.Response.StatusCode.value__ + " " + $_.ErrorDetails.Message)
}
