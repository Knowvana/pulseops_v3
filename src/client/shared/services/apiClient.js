// ============================================================================
// ApiClient — PulseOps V2
//
// PURPOSE: Centralized HTTP client for all frontend API calls. Handles
// base URL, JSON serialization, and error formatting.
// SECURITY: Auth is handled via HttpOnly cookies (credentials: 'include').
// No JWT tokens are stored in JavaScript memory to prevent XSS attacks.
//
// USAGE:
//   import { ApiClient } from '@shared';
//   const response = await ApiClient.get(urls.auth.me);
// ============================================================================

const API_BASE = '';

class ApiClientClass {
  constructor() {
    this._explorerSessionId = null;
  }

  /**
   * Start an API Explorer session with a dedicated transaction ID.
   * All requests made through ApiClient will carry this ID until the session ends.
   */
  startExplorerSession() {
    this._explorerSessionId = `exp-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 8)}`;
    return this._explorerSessionId;
  }

  /**
   * End the API Explorer session and revert to the global session transaction ID.
   */
  endExplorerSession() {
    const id = this._explorerSessionId;
    this._explorerSessionId = null;
    return id;
  }

  /**
   * Get current explorer session ID (null if no active explorer session)
   */
  getExplorerSessionId() {
    return this._explorerSessionId;
  }

  _buildHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    // Attach transaction ID: explorer session takes priority, else global session
    if (this._explorerSessionId) {
      headers['X-Transaction-Id'] = this._explorerSessionId;
    }
    return headers;
  }

  async _request(method, url, body = null) {
    const options = {
      method,
      headers: this._buildHeaders(),
      credentials: 'include', // HttpOnly cookie sent automatically by browser
    };
    if (body) {
      options.body = JSON.stringify(body);
    }
    try {
      const response = await fetch(`${API_BASE}${url}`, options);
      
      // Check if response is ok before attempting to parse JSON
      if (!response.ok) {
        // Try to parse error response, but handle cases where server returns non-JSON
        let errorMessage = `Server error: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData?.error?.message || errorMessage;
        } catch {
          // If JSON parsing fails, use the default error message
        }
        return { success: false, error: { message: errorMessage } };
      }
      
      // Parse successful response
      try {
        const data = await response.json();
        return data;
      } catch {
        return { success: false, error: { message: 'Invalid response from server' } };
      }
    } catch (err) {
      // Network error (server unreachable)
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        return { success: false, error: { message: 'Unable to connect to the server. Please ensure the API server is running.' } };
      }
      return { success: false, error: { message: err.message } };
    }
  }

  get(url) { return this._request('GET', url); }
  post(url, body) { return this._request('POST', url, body); }
  put(url, body) { return this._request('PUT', url, body); }
  patch(url, body) { return this._request('PATCH', url, body); }
  delete(url, body) { return this._request('DELETE', url, body); }
}

const ApiClient = new ApiClientClass();
export default ApiClient;
