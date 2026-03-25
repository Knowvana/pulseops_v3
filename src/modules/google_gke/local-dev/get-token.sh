#!/bin/bash
# Get service account token from local Kind cluster for PulseOps configuration

echo "Getting service account token from local Kind cluster..."
echo ""

# Get the token
TOKEN=$(kubectl get secret $(kubectl get secret -n default -o jsonpath='{.items[0].metadata.name}') -n default -o jsonpath='{.data.token}' | base64 --decode)

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to get token. Make sure:"
  echo "   1. Kind cluster is running: kind get clusters"
  echo "   2. kubectl is configured: kubectl cluster-info"
  echo "   3. You have access to the cluster"
  exit 1
fi

echo "✅ Token retrieved successfully!"
echo ""
echo "Copy this token and paste it into the 'Service Account Token' field in Settings → Connection:"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "$TOKEN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Or run this to update ClusterConfig.json automatically:"
echo "  bash get-token.sh | grep -A1 '━━━' | tail -1 > token.txt"
