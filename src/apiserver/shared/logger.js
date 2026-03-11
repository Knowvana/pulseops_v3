// ============================================================================
// Logger — PulseOps V2 API
//
// PURPOSE: Structured logging using Winston. All log messages MUST come from
// APIMessages.json or APIErrors.json — no inline strings.
//
// FEATURES:
//   - JSON structured output for production (K8s log aggregation)
//   - Colorized console output for development
//   - Request ID and service metadata in every log entry
//   - Error stack trace capture
//
// USAGE:
//   import { logger } from '../shared/logger.js';
//   logger.info(messages.success.dbConnected, { requestId: req.requestId });
//   logger.error(errors.errors.dbConnectionFailed, { error: err.message });
// ============================================================================
import winston from 'winston';
import SettingsService from '#core/services/settingsService.js';

const nodeEnv = process.env.NODE_ENV || 'development';

/**
 * Get initial log level from database config, fallback to environment or default
 */
async function getInitialLogLevel() {
  // If LOG_LEVEL is explicitly set via environment, use it
  if (process.env.LOG_LEVEL) {
    return process.env.LOG_LEVEL;
  }
  
  // Try to get from database config
  try {
    const logsConfig = await SettingsService.get('logs_config');
    if (logsConfig && logsConfig.defaultLevel) {
      return logsConfig.defaultLevel;
    }
  } catch (err) {
    // Database not available, will use fallback
  }
  
  // Fallback to environment-based default
  return nodeEnv === 'production' ? 'info' : 'debug';
}

/**
 * Format a Date to IST (Asia/Kolkata) string.
 * @param {Date} date
 * @returns {string} IST formatted timestamp
 */
function toIST(date) {
  return (date || new Date()).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

const istTimestamp = winston.format((info) => {
  info.timestamp = toIST(new Date());
  return info;
});

// Create logger with default level, will be updated after DB read
let logger = winston.createLogger({
  level: nodeEnv === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    istTimestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      // Extract module, filename, and function from metadata or defaults
      const source = meta.service?.includes('pulseops') ? 'API' : meta.source || 'Unknown';
      const module = meta.module || 'Core';
      const filename = meta.fileName || meta.filename || 'unknown';
      const functionName = meta.functionName || meta.function || 'unknown';
      
      // Clean up the message
      const cleanMessage = typeof message === 'string' ? message : JSON.stringify(message);
      
      // Format: [date][level][source][module][filename][function] message
      return `[${timestamp}][${level.toUpperCase()}][${source}][${module}][${filename}][${functionName}] ${cleanMessage}`;
    })
  ),
  defaultMeta: { 
    service: 'pulseops-v2-api',
    module: 'Core',
    fileName: 'logger.js',
    functionName: 'log'
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          // Extract module, filename, and function from metadata or defaults
          const source = meta.service?.includes('pulseops') ? 'API' : meta.source || 'Unknown';
          const module = meta.module || 'Core';
          const filename = meta.fileName || meta.filename || 'unknown';
          const functionName = meta.functionName || meta.function || 'unknown';
          
          // Clean up the message
          const cleanMessage = typeof message === 'string' ? message : JSON.stringify(message);
          
          // Format: [date][level][source][module][filename][function] message
          return `${timestamp} [${level.toUpperCase()}][${source}][${module}][${filename}][${functionName}] ${cleanMessage}`;
        })
      ),
    }),
  ],
});

let currentLogLevel = null;
let reloadInterval = null;

/**
 * Check and update logger level if it changed in database
 */
async function checkLogLevelChange() {
  try {
    const logsConfig = await SettingsService.get('logs_config');
    const newLevel = logsConfig?.defaultLevel;
    
    if (newLevel && newLevel !== currentLogLevel) {
      currentLogLevel = newLevel;
      logger.level = newLevel;
      logger.info(`Logger level hot-reloaded to: ${newLevel} (without restart)`);
    }
  } catch (err) {
    // Silent fail - don't log errors to avoid infinite loops
  }
}

/**
 * Start hot-reload monitoring for log level changes
 */
function startLogLevelHotReload() {
  // Check every 5 seconds for log level changes
  reloadInterval = setInterval(checkLogLevelChange, 5000);
}

/**
 * Stop hot-reload monitoring
 */
function stopLogLevelHotReload() {
  if (reloadInterval) {
    clearInterval(reloadInterval);
    reloadInterval = null;
  }
}

/**
 * Initialize logger level from database configuration
 */
async function initializeLogger() {
  const initialLevel = await getInitialLogLevel();
  currentLogLevel = initialLevel;
  logger.level = initialLevel;
  logger.info(`Logger initialized with level: ${initialLevel}`);
  
  // Start hot-reload monitoring
  startLogLevelHotReload();
}

/**
 * Dynamically update logger level (for runtime configuration changes)
 * @param {string} newLevel - 'debug', 'info', 'warn', or 'error'
 */
export function updateLoggerLevel(newLevel) {
  if (['debug', 'info', 'warn', 'error'].includes(newLevel)) {
    currentLogLevel = newLevel;
    logger.level = newLevel;
    logger.info(`Logger level updated to: ${newLevel}`);
  }
}

// Initialize logger asynchronously
initializeLogger().catch(err => {
  console.error('Failed to initialize logger from database:', err);
});

// Cleanup on process exit
process.on('SIGINT', () => {
  stopLogLevelHotReload();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopLogLevelHotReload();
  process.exit(0);
});

export { logger };
