$text = Get-Content -Raw "$PSScriptRoot/../fixtures/test.execute.aliases.json"
$body = [System.Text.Encoding]::UTF8.GetBytes($text)
try {
  $r = Invoke-WebRequest -Uri http://localhost:3000/execute -Method POST -ContentType 'application/json; charset=utf-8' -Body $body -UseBasicParsing
  Write-Output $r.Content
} catch {
  Write-Output "STATUS: $($_.Exception.Response.StatusCode.value__)"
  $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
  Write-Output $reader.ReadToEnd()
}
