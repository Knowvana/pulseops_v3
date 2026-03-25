@echo off
REM Get service account token from local Kind cluster for PulseOps configuration

echo Getting service account token from local Kind cluster...
echo.

REM Check if cluster is accessible
kubectl cluster-info >nul 2>&1
if errorlevel 1 (
  echo ERROR: Cluster not accessible. Make sure:
  echo    1. Kind cluster is running: kind get clusters
  echo    2. kubectl is configured: kubectl cluster-info
  exit /b 1
)

REM Get the default service account secret from kube-system namespace
REM This is the most reliable way for Kind clusters
for /f "tokens=*" %%A in ('kubectl get secret -n kube-system -o name ^| findstr "default-token"') do set "secretFullName=%%A"

if not defined secretFullName (
  echo ERROR: No default service account token found in kube-system namespace.
  echo.
  echo Available secrets in kube-system:
  kubectl get secret -n kube-system
  echo.
  echo Try creating a service account:
  echo   kubectl create serviceaccount pulseops -n default
  echo   kubectl create clusterrolebinding pulseops-admin --clusterrole=cluster-admin --serviceaccount=default:pulseops
  exit /b 1
)

REM Extract just the secret name from the full name (e.g., "secret/default-token-xyz" -> "default-token-xyz")
for /f "tokens=2 delims=/" %%A in ('echo %secretFullName%') do set "secretName=%%A"

REM Get the token (base64 encoded in the secret)
for /f "tokens=*" %%A in ('kubectl get secret %secretName% -n kube-system -o jsonpath="{.data.token}" 2^>nul') do set "tokenBase64=%%A"

if not defined tokenBase64 (
  echo ERROR: Failed to get token from secret: %secretName%
  exit /b 1
)

REM Decode from base64 using certutil
setlocal enabledelayedexpansion
(
  echo %tokenBase64%
) > token_encoded.txt

certutil -decode token_encoded.txt token_decoded.txt >nul 2>&1

if exist token_decoded.txt (
  REM Read the decoded token, skipping the first line (certutil header)
  set "lineCount=0"
  for /f "tokens=*" %%A in (token_decoded.txt) do (
    set /a lineCount+=1
    if !lineCount! gtr 1 (
      set "token=%%A"
    )
  )
  del token_encoded.txt token_decoded.txt >nul 2>&1
) else (
  echo ERROR: Failed to decode token
  del token_encoded.txt >nul 2>&1
  exit /b 1
)

echo SUCCESS: Token retrieved!
echo Secret: %secretName%
echo.
echo Copy this token and paste it into the 'Service Account Token' field in Settings ^> Connection:
echo.
echo ================================================================================
echo %token%
echo ================================================================================
echo.
echo Then click 'Test Connection' to verify the connection works.
