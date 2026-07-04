$body = Get-Content -Raw "$PSScriptRoot/../fixtures/test.execute.invoice.json"
try {
  $r = Invoke-WebRequest -Uri http://localhost:3000/execute -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing
  Write-Output $r.Content
} catch {
  Write-Output "STATUS: $($_.Exception.Response.StatusCode.value__)"
  $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
  Write-Output $reader.ReadToEnd()
}
