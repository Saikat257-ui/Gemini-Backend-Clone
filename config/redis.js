const Redis = require('ioredis');
const logger = require('../utils/logger');

let redis;
let redisSubscriber;

async function initializeRedis() {
  try {
    logger.info('Starting Redis initialization...');
    
    // Redis Cloud connection options
    const options = {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times) => {
        logger.info(`Redis retry attempt ${times}`);
        return times > 3 ? null : Math.min(times * 50, 2000);
      },
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
      connectTimeout: 10000,
      disconnectTimeout: 2000,
      commandTimeout: 5000,
      lazyConnect: true,
      tls: false,
      reconnectOnError: function(err) {
        logger.error('Redis reconnect on error:', err);
        return true;
      }
    };

    logger.info('Creating Redis clients...');
    
    // Create main client
    redis = new Redis(options);
    
    // Create subscriber client
    redisSubscriber = new Redis(options);

    // Add event handlers for main client
    redis.on('error', (err) => {
      logger.error('Redis client error:', {
        message: err.message,
        code: err.code,
        command: err.command,
        stack: err.stack
      });
    });

    redis.on('connect', () => {
      logger.info('Redis client connected');
    });

    redis.on('ready', () => {
      logger.info('Redis client ready');
    });

    redis.on('reconnecting', () => {
      logger.info('Redis client reconnecting...');
    });

    redis.on('close', () => {
      logger.warn('Redis client connection closed');
    });

    redis.on('end', () => {
      logger.warn('Redis client connection ended');
    });

    // Add event handlers for subscriber client
    redisSubscriber.on('error', (err) => {
      logger.error('Redis subscriber error:', {
        message: err.message,
        code: err.code
      });
    });

    redisSubscriber.on('connect', () => {
      logger.info('Redis subscriber connected');
    });

    redisSubscriber.on('ready', () => {
      logger.info('Redis subscriber ready');
    });

    // Test connection with timeout
    logger.info('Testing Redis connection...');
    try {
      const pingPromise = redis.ping();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis ping timeout')), 5000)
      );
      
      const pingResult = await Promise.race([pingPromise, timeoutPromise]);
      logger.info('Redis connection test successful:', pingResult);
      
      if (pingResult !== 'PONG') {
        throw new Error(`Unexpected ping response: ${pingResult}`);
      }
      
      return true;
    } catch (error) {
      logger.error('Redis connection test failed:', error);
      throw error;
    }
  } catch (error) {
    logger.error('Redis initialization failed:', error);
    throw error;
  }
}

function getRedis() {
  if (!redis) {
    throw new Error('Redis not initialized');
  }
  return redis;
}

function getRedisSubscriber() {
  if (!redisSubscriber) {
    throw new Error('Redis subscriber not initialized');
  }
  return redisSubscriber;
}

module.exports = {
  initializeRedis,
  getRedis,
  getRedisSubscriber
};
