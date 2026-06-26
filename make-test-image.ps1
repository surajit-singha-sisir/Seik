Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap(200, 200)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::SeaGreen)
$bmp.Save('D:\Web\TEMP\Imgbb\test-upload.jpg', [System.Drawing.Imaging.ImageFormat]::Jpeg)
Write-Output 'done'
