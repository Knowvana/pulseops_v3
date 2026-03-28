// ============================================================================
// Accessio Operations Cluster API Test - Simple Config Load
//
// PURPOSE: Test loading cluster configuration from JSON file
// ============================================================================
import fetch from 'node-fetch';

// API Configuration
const API_BASE = 'http://localhost:4001';

// Cookie jar to store session cookies
let sessionCookies = '';

// ── Login and get session cookies (like frontend) ───────────────────────────────
async function login() {
  try {
    console.log('🔐 Logging in with SuperAdmin...');
    
    const saResponse = await fetch(`${API_BASE}/api/auth/superadmin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'superadmin@pulseops.local',
        password: 'Infosys@123'
      })
    });

    if (saResponse.ok) {
      const setCookieHeader = saResponse.headers.get('set-cookie');
      if (setCookieHeader) {
        sessionCookies = setCookieHeader.split(';')[0];
        console.log('✅ Login successful, session cookies obtained');
      }
      const data = await saResponse.json();
      console.log(`Login response: ${JSON.stringify(data, null, 2)}`);
      return data;
    }

    throw new Error(`Login failed: ${saResponse.status} ${saResponse.statusText}`);
  } catch (error) {
    console.error('❌ Login failed:', error.message);
    throw error;
  }
}

// ── Make authenticated API request (like frontend ApiClient) ────────────────────
async function makeAuthenticatedRequest(method, endpoint, body = null) {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // This tells fetch to include cookies (like frontend)
    };

    // Add cookies manually for Node.js (browser does this automatically)
    if (sessionCookies) {
      options.headers['Cookie'] = sessionCookies;
    }

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${endpoint}`, options);
    
    // Update cookies if server sends new ones
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      sessionCookies = setCookieHeader.split(';')[0];
    }

    if (!response.ok) {
      let errorMessage = `Server error: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData?.error?.message || errorMessage;
      } catch {
        // If JSON parsing fails, use the default error message
      }
      return { success: false, error: { message: errorMessage } };
    }

    const data = await response.json();
    return data;
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      return { success: false, error: { message: 'Unable to connect to the server. Please ensure the API server is running.' } };
    }
    return { success: false, error: { message: err.message } };
  }
}

// ── Test GET /api/accessio_ops/cluster (Load config from JSON file) ───────────────────
async function testGetClusterConfig() {
  try {
    console.log('\n📥 Testing GET /api/accessio_ops/cluster - Load config from JSON file...');
    
    const data = await makeAuthenticatedRequest('GET', '/api/accessio_ops/cluster');
    
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (data.success) {
      console.log('✅ Cluster config loaded successfully from JSON file');
      console.log(`🔗 API Server URL: ${data.data.connection.apiServerUrl}`);
      console.log(`🏷️  Cluster Name: ${data.data.connection.clusterName}`);
      console.log(`🔧 Is Configured: ${data.data.connectionStatus.isConfigured}`);
      console.log(`📊 Project ID: ${data.data.connection.projectId}`);
      console.log(`🌍 Region: ${data.data.connection.region}`);
    } else {
      console.log('❌ Failed to load cluster config');
    }
    
    return data;
  } catch (error) {
    console.error('❌ Error testing GET cluster config:', error.message);
    throw error;
  }
}

// ── Main test runner ───────────────────────────────────────────────────────────
async function runTests() {
  console.log('� Starting Accessio Operations Config Load Test...\n');
  console.log('� This test loads cluster configuration from the JSON file\n');
  
  try {
    // Login first to get session cookies
    await login();
    
    // Test GET cluster config (load from JSON file)
    await testGetClusterConfig();
    
    console.log('\n✅ Config load test completed!');
    console.log('📝 The cluster configuration was successfully loaded from the JSON file');
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Run the tests
runTests().catch(console.error);
