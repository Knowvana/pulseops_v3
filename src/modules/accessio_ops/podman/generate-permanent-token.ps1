# Generate Permanent Token for Accessio Service
# This script creates a non-expiring service account token

Write-Host "Creating permanent token secret for accessio-service..." -ForegroundColor Green

# Create YAML file first
$yaml = @"
apiVersion: v1
kind: Secret
metadata:
  name: accessio-service-permanent-token
  namespace: default
  annotations:
    kubernetes.io/service-account.name: accessio-service
type: kubernetes.io/service-account-token
"@

# Save to temp file and apply
$tempFile = "temp-secret.yaml"
$yaml | Out-File -FilePath $tempFile -Encoding utf8
kubectl apply -f $tempFile
Remove-Item $tempFile

Write-Host "Waiting for token to be created..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Get the token
Write-Host "Extracting permanent token..." -ForegroundColor Green
$encodedToken = kubectl get secret accessio-service-permanent-token -o jsonpath='{.data.token}'
$token = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($encodedToken))

Write-Host "`n=== PERMANENT TOKEN GENERATED ===" -ForegroundColor Cyan
Write-Host $token
Write-Host "`n=================================" -ForegroundColor Cyan

Write-Host "`nUpdate your ClusterConfig.json with this token:" -ForegroundColor Yellow
Write-Host "serviceAccountToken: $token"

Write-Host "`nToken saved to clipboard..." -ForegroundColor Green
$token | Set-Clipboard

Write-Host "`nDone! You can now paste the token into your ClusterConfig.json file." -ForegroundColor Green
