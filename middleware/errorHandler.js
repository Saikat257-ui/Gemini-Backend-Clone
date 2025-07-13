const logger = require('../utils/logger');

function errorHandler(error, req, res, next) {
  logger.error('Error occurred:', {
    error: error.message,
    stack: error.stack,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  // Handle specific error types
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: error.message,
      details: error.details || null
    });
  }

  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Authentication Error',
      message: 'Invalid token'
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Authentication Error',
      message: 'Token expired'
    });
  }

  if (error.code === '23505') { // PostgreSQL unique constraint violation
    return res.status(409).json({
      error: 'Conflict',
      message: 'Resource already exists'
    });
  }

  if (error.code === '23503') { // PostgreSQL foreign key constraint violation
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Referenced resource does not exist'
    });
  }

  // Handle Stripe errors
  if (error.type && error.type.startsWith('Stripe')) {
    return res.status(400).json({
      error: 'Payment Error',
      message: error.message
    });
  }

  // Default error response
  const statusCode = error.statusCode || error.status || 500;
  const message = error.message || 'Internal Server Error';

  res.status(statusCode).json({
    error: statusCode === 500 ? 'Internal Server Error' : error.name || 'Error',
    message: statusCode === 500 ? 'Something went wrong' : message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
}

module.exports = errorHandler;
