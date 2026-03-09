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

const nodeEnv = process.env.NODE_ENV || 'development';

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

const logger = winston.createLogger({
  level: nodeEnv === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    istTimestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'pulseops-v2-api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length > 1 ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      ),
    }),
  ],
});

export { logger };
