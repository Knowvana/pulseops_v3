# Base64 encode a string value
$stringValue = "your string here"
$bytes = [System.Text.Encoding]::UTF8.GetBytes($stringValue)
$base64 = [Convert]::ToBase64String($bytes)
Write-Host $base64
