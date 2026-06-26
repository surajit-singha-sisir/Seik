$dir = "D:\Web\TEMP\Imgbb\public"
$files = Get-ChildItem $dir -Filter "*.html" | Where-Object { $_.Name -ne "login.html" }

$oldFoot  = '<div class="sidebar-foot mono" id="api-status">'
$newFoot  = '<button class="sidebar-logout" id="logout-btn" title="Sign out"><i class="fa-solid fa-right-from-bracket"></i> Sign out</button>' + "`n      " + $oldFoot

$oldScript = '</body>'
$newScript = @'
<script>
(function(){
  const btn = document.getElementById('logout-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    await fetch('/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  });
})();
</script>
</body>
'@

foreach ($f in $files) {
  $content = Get-Content $f.FullName -Raw -Encoding UTF8
  $changed = $false

  if ($content -notmatch 'sidebar-logout') {
    $content = $content -replace [regex]::Escape($oldFoot), $newFoot
    $changed = $true
  }

  if ($content -notmatch 'auth/logout') {
    $content = $content -replace [regex]::Escape('</body>'), $newScript
    $changed = $true
  }

  if ($changed) {
    [System.IO.File]::WriteAllText($f.FullName, $content, [System.Text.Encoding]::UTF8)
    Write-Host "Patched: $($f.Name)"
  }
}
Write-Host "Done."
