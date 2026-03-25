@echo off
setlocal enabledelayedexpansion

echo Setting up service account for PulseOps...
echo.

REM Create the YAML file inline
(
echo apiVersion: v1
echo kind: ServiceAccount
echo metadata:
echo   name: pulseops
echo   namespace: default
echo ---
echo apiVersion: v1
echo kind: Secret
echo metadata:
echo   name: pulseops-token
echo   namespace: default
echo   annotations:
echo     kubernetes.io/service-account.name: pulseops
echo type: kubernetes.io/service-account-token
echo ---
echo apiVersion: rbac.authorization.k8s.io/v1
echo kind: ClusterRoleBinding
echo metadata:
echo   name: pulseops-admin
echo roleRef:
echo   apiGroup: rbac.authorization.k8s.io
echo   kind: ClusterRole
echo   name: cluster-admin
echo subjects:
echo - kind: ServiceAccount
echo   name: pulseops
echo   namespace: default
) > sa.yaml

echo Applying service account configuration...
kubectl apply -f sa.yaml
if errorlevel 1 (
  echo ERROR: Failed to apply service account configuration
  del sa.yaml
  exit /b 1
)

echo.
echo Waiting for token to be generated...
timeout /t 3 /nobreak

echo.
echo Retrieving token...
kubectl get secret pulseops-token -n default -o jsonpath^=^{.data.token^} > token_base64.txt

if not exist token_base64.txt (
  echo ERROR: Failed to get token
  del sa.yaml
  exit /b 1
)

REM Decode from base64
certutil -decode token_base64.txt token_decoded.txt >nul 2>&1

if exist token_decoded.txt (
  REM Read the decoded token file and display it
  echo.
  echo ================================================================================
  echo SUCCESS: Service account created and token retrieved!
  echo ================================================================================
  echo.
  echo Copy this token and paste it into the 'Service Account Token' field:
  echo.
  type token_decoded.txt
  echo.
  echo Then click 'Test Connection' in Settings ^> Connection
  echo ================================================================================
  
  del token_base64.txt token_decoded.txt sa.yaml >nul 2>&1
) else (
  echo ERROR: Failed to decode token
  del token_base64.txt sa.yaml >nul 2>&1
  exit /b 1
) 
