// Global error handlers first
process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
  process.exit(1);
});

// Then import dependencies
const app = require('./server');
const logger = require('./utils/logger');
const { initializeDatabase } = require('./config/database');
const { initializeRedis } = require('./config/redis');
const { initializeGeminiQueue } = require('./jobs/geminiQueue');

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', {
    error: error.message,
    stack: error.stack,
    code: error.code
  });
  // Keep the process running in development
  if (process.env.NODE_ENV !== 'production') {
    console.error('Application continuing in development mode...');
  } else {
    process.exit(1);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', {
    reason: reason?.message || reason,
    stack: reason?.stack
  });
  // Keep the process running in development
  if (process.env.NODE_ENV !== 'production') {
    console.error('Application continuing in development mode...');
  } else {
    process.exit(1);
  }
});

// Initialize services
async function startServer() {
  try {
    console.log('Starting server initialization...');

    // Initialize Database first
    console.log('Initializing Database...');
    await initializeDatabase();
    console.log('Database initialized successfully');
    
    // Initialize Redis next
    console.log('Initializing Redis...');
    await initializeRedis();
    console.log('Redis initialized successfully');

    // Initialize BullMQ queue
    console.log('Initializing Queue...');
    await initializeGeminiQueue();
    console.log('Queue initialized successfully');

    // Start the server
    const port = process.env.PORT || 5000;
    app.listen(port, () => {
      console.log('=================================');
      console.log(`🚀 Server is running on port ${port}`);
      console.log('=================================');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
logger.info('Starting server initialization...');

// Add handlers before starting
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM signal. Performing graceful shutdown...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT signal. Performing graceful shutdown...');
  process.exit(0);
});

startServer().catch(error => {
  logger.error('Failed to start server:', {
    error: error.message,
    stack: error.stack,
    code: error.code
  });
  process.exit(1);
});
