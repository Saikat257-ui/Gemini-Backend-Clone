const { Queue, Worker } = require('bullmq');
const { getRedis } = require('../config/redis');
const { getPool } = require('../config/database');
const { generateResponseWithContext } = require('../services/geminiService');
const logger = require('../utils/logger');

let geminiQueue;
let geminiWorker;

// Initialize Gemini queue
async function initializeGeminiQueue() {
  try {
    // Get Redis connection
    const redis = getRedis();
    
    if (!redis) {
      throw new Error('Redis connection not available');
    }

    // Test Redis connection
    try {
      const pingResult = await redis.ping();
      if (pingResult !== 'PONG') {
        throw new Error('Redis ping failed');
      }
    } catch (error) {
      logger.error('Redis ping failed:', error);
      throw error;
    }

    // Create connection configuration for BullMQ
    const connection = {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      disconnectTimeout: 5000,
      keepAlive: 5000,
      retryStrategy: (times) => {
        return Math.min(times * 100, 3000);
      }
    };

    // Initialize queue with optimized settings
    geminiQueue = new Queue('gemini-responses', {
      connection,
      defaultJobOptions: {
        removeOnComplete: 100, // Keep more job history
        removeOnFail: 50,      // Keep more failed jobs for debugging
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        },
        timeout: 30000,        // 30 second timeout
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    // Initialize worker with optimized settings
    geminiWorker = new Worker('gemini-responses', processGeminiJob, {
      connection,
      concurrency: 2,               // Reduce concurrent jobs
      lockDuration: 30000,          // 30 second lock
      stalledInterval: 15000,       // Check for stalled jobs every 15 seconds
      maxStalledCount: 2,           // Retry stalled jobs twice
      lockRenewTime: 15000,         // Renew locks every 15 seconds
      drainDelay: 5000,             // Wait 5 seconds between drain checks
    });

    // Add comprehensive event listeners
    geminiQueue.on('error', (error) => {
      logger.error('Gemini queue error:', {
        message: error.message,
        stack: error.stack
      });
    });

    geminiWorker.on('completed', (job) => {
      logger.info(`Gemini job completed: ${job.id}`, {
        timestamp: new Date().toISOString()
      });
    });

    geminiWorker.on('failed', (job, error) => {
      logger.error(`Gemini job failed: ${job.id}`, {
        error: error.message,
        stack: error.stack,
        attempts: job.attemptsMade
      });
    });

    geminiWorker.on('error', (error) => {
      logger.error('Gemini worker error:', error);
    });

    logger.info('Gemini queue initialized successfully with Redis');
  } catch (error) {
    logger.warn('Error initializing Gemini queue, falling back to mock:', error.message);
    createMockQueue();
  }
}

// Create mock queue for development
function createMockQueue() {
  geminiQueue = {
    add: async (name, data, options) => {
      logger.info(`Mock queue: processing job ${name} immediately`);
      // Process immediately in development
      try {
        await processGeminiJob({ data });
        return { id: Date.now().toString(), data };
      } catch (error) {
        logger.error('Mock queue job failed:', error);
        throw error;
      }
    },
    getWaiting: async () => [],
    getActive: async () => [],
    getCompleted: async () => [],
    getFailed: async () => [],
    clean: async () => {},
    close: async () => {},
    on: () => {},
  };
  
  geminiWorker = {
    close: async () => {},
    on: () => {},
  };
  
  logger.info('Mock Gemini queue created for development');
}

// Process Gemini job
async function processGeminiJob(job) {
  const { messageId, chatroomId, userId, userMessage } = job.data;
  
  try {
    logger.info(`Processing Gemini job for message ${messageId}`);
    
    const pool = getPool();
    
    // Update message status to processing
    await pool.query(
      'UPDATE messages SET status = $1 WHERE id = $2',
      ['processing', messageId]
    );

    // Generate response using Gemini API
    const geminiResponse = await generateResponseWithContext(userMessage, chatroomId, pool);

    // Update message with Gemini response
    await pool.query(
      'UPDATE messages SET gemini_response = $1, content = $2, status = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
      [geminiResponse, geminiResponse, 'completed', messageId]
    );

    logger.info(`Gemini response generated for message ${messageId}`);
    
    return {
      success: true,
      messageId,
      response: geminiResponse
    };
  } catch (error) {
    logger.error(`Error processing Gemini job for message ${messageId}:`, error);
    
    // Update message status to failed
    const pool = getPool();
    await pool.query(
      'UPDATE messages SET status = $1, content = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      ['failed', 'Sorry, I encountered an error processing your request. Please try again.', messageId]
    );

    throw error;
  }
}

// Add job to Gemini queue
async function addGeminiJob(jobData) {
  try {
    if (!geminiQueue) {
      throw new Error('Gemini queue not initialized');
    }

    const job = await geminiQueue.add('process-message', jobData, {
      priority: 1,
      delay: 0,
    });

    logger.info(`Added Gemini job to queue: ${job.id}`);
    return job;
  } catch (error) {
    logger.error('Error adding Gemini job to queue:', error);
    throw error;
  }
}

// Get queue statistics
async function getQueueStats() {
  try {
    if (!geminiQueue) {
      throw new Error('Gemini queue not initialized');
    }

    const waiting = await geminiQueue.getWaiting();
    const active = await geminiQueue.getActive();
    const completed = await geminiQueue.getCompleted();
    const failed = await geminiQueue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length
    };
  } catch (error) {
    logger.error('Error getting queue stats:', error);
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      total: 0
    };
  }
}

// Clean up completed and failed jobs
async function cleanupQueue() {
  try {
    if (!geminiQueue) {
      return;
    }

    await geminiQueue.clean(24 * 60 * 60 * 1000, 100, 'completed'); // Clean completed jobs older than 24 hours
    await geminiQueue.clean(24 * 60 * 60 * 1000, 50, 'failed'); // Clean failed jobs older than 24 hours
    
    logger.info('Queue cleanup completed');
  } catch (error) {
    logger.error('Error cleaning up queue:', error);
  }
}

// Graceful shutdown
async function shutdown() {
  try {
    if (geminiWorker) {
      await geminiWorker.close();
      logger.info('Gemini worker closed');
    }
    
    if (geminiQueue) {
      await geminiQueue.close();
      logger.info('Gemini queue closed');
    }
  } catch (error) {
    logger.error('Error shutting down Gemini queue:', error);
  }
}

// Handle process signals for graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = {
  initializeGeminiQueue,
  addGeminiJob,
  getQueueStats,
  cleanupQueue,
  shutdown
};
