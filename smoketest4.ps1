$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = @{ username = $env:AUTH_USERNAME; password = "irrelevant" } | ConvertTo-Json
# We don't know the real password, so instead let's just hit settings unauthenticated first is pointless (401).
# Print whether a session cookie mechanism needs a real login - skip, and just call settings directly after forging session via cookie is not possible.
Write-Output "placeholder"
