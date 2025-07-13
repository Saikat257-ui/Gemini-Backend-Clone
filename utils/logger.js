const winston = require('winston');

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'gemini-chat-api' },
  transports: [
    // Write all logs with importance level of `error` or less to `error.log`
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    
    // Write all logs with importance level of `info` or less to `combined.log`
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// If we're not in production, also log to the console
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Add custom methods for different log levels
logger.debug = (message, meta = {}) => {
  logger.log('debug', message, meta);
};

logger.info = (message, meta = {}) => {
  logger.log('info', message, meta);
};

logger.warn = (message, meta = {}) => {
  logger.log('warn', message, meta);
};

logger.error = (message, meta = {}) => {
  logger.log('error', message, meta);
};

module.exports = logger;
