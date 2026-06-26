$base = 'http://localhost:3000'

# 1. Login
$loginBody = @{ username = 'admin'; password = 'admin123'; next = '/' } | ConvertTo-Json
$loginResp = Invoke-WebRequest -Uri "$base/auth/login" -Method POST -Body $loginBody -ContentType 'application/json' -SessionVariable sess -UseBasicParsing
Write-Output "LOGIN STATUS: $($loginResp.StatusCode)"
Write-Output $loginResp.Content
Write-Output "Cookies after login:"
Write-Output $sess.Cookies.GetCookies("$base/")
Write-Output '---'

# 2. Build multipart/form-data manually (PS 5.1 has no -Form support)
$filePath = 'D:\Web\TEMP\Imgbb\test-upload.jpg'
$fileBytes = [System.IO.File]::ReadAllBytes($filePath)
$fileEnc = [System.Text.Encoding]::GetEncoding('ISO-8859-1').GetString($fileBytes)
$boundary = [System.Guid]::NewGuid().ToString()
$LF = "`r`n"

$bodyLines = (
  "--$boundary",
  "Content-Disposition: form-data; name=`"quality`"$LF",
  "85",
  "--$boundary",
  "Content-Disposition: form-data; name=`"file`"; filename=`"test-upload.jpg`"",
  "Content-Type: image/jpeg$LF",
  $fileEnc,
  "--$boundary--$LF"
) -join $LF

try {
  $uploadResp = Invoke-WebRequest -Uri "$base/api/uploads" -Method POST -Body $bodyLines -ContentType "multipart/form-data; boundary=`"$boundary`"" -WebSession $sess -UseBasicParsing
  Write-Output "UPLOAD STATUS: $($uploadResp.StatusCode)"
  Write-Output $uploadResp.Content
} catch {
  Write-Output "UPLOAD FAILED: $($_.Exception.Response.StatusCode.value__)"
  $stream = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($stream)
  Write-Output $reader.ReadToEnd()
}
