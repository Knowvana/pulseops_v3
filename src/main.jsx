// ============================================================================
// Main Entry Point — PulseOps V2
//
// PURPOSE: Bootstraps the React application and mounts it to the DOM.
// Imports the global design tokens (index.css) before rendering.
//
// ARCHITECTURE: Wraps App in StrictMode for development checks.
// Initializes UI logger to capture console logs, user interactions, and errors.
// ============================================================================
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@core/App';
import '@src/index.css';
import UILogService from '@shared/services/UILogService';
import TimezoneService from '@shared/services/timezoneService';

// Initialize UI log service to capture console logs, fetch API calls, and UI interactions
UILogService.init();

// Initialize timezone service to load user-configured timezone from general settings
TimezoneService.init();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
