# Generate permanent token for accessio-service
# This creates a token that doesn't expire

kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: accessio-service-permanent-token
  namespace: default
  annotations:
    kubernetes.io/service-account.name: accessio-service
type: kubernetes.io/service-account-token
EOF

echo "Waiting for token to be created..."
sleep 2

echo "Getting permanent token..."
TOKEN=$(kubectl get secret accessio-service-permanent-token -o jsonpath='{.data.token}' | base64 -w 0)

echo "Permanent token:"
echo $TOKEN

echo ""
echo "Update your ClusterConfig.json with this token:"
echo "serviceAccountToken: $TOKEN"
