const { getRedis } = require('../config/redis');
const logger = require('../utils/logger');

// Cache keys
const CHATROOM_CACHE_KEY = 'chatrooms:user:';
const CACHE_TTL = 300; // 5 minutes

// Get cached chatrooms for a user
async function getCachedChatrooms(userId) {
  try {
    const redis = getRedis();
    const key = `${CHATROOM_CACHE_KEY}${userId}`;
    
    const cachedData = await redis.get(key);
    if (cachedData) {
      logger.info(`Cache hit for user ${userId} chatrooms`);
      return JSON.parse(cachedData);
    }
    
    logger.info(`Cache miss for user ${userId} chatrooms`);
    return null;
  } catch (error) {
    logger.error('Error getting cached chatrooms:', error);
    return null; // Return null on error to fallback to database
  }
}

// Set cached chatrooms for a user
async function setCachedChatrooms(userId, chatrooms, ttl = CACHE_TTL) {
  try {
    const redis = getRedis();
    const key = `${CHATROOM_CACHE_KEY}${userId}`;
    
    await redis.setex(key, ttl, JSON.stringify(chatrooms));
    logger.info(`Cached chatrooms for user ${userId} with TTL ${ttl}s`);
  } catch (error) {
    logger.error('Error setting cached chatrooms:', error);
    // Don't throw error, just log it since caching is not critical
  }
}

// Clear cached chatrooms for a user
async function clearChatroomCache(userId) {
  try {
    const redis = getRedis();
    const key = `${CHATROOM_CACHE_KEY}${userId}`;
    
    await redis.del(key);
    logger.info(`Cleared chatroom cache for user ${userId}`);
  } catch (error) {
    logger.error('Error clearing chatroom cache:', error);
    // Don't throw error, just log it
  }
}

// Clear all cached chatrooms
async function clearAllChatroomCache() {
  try {
    const redis = getRedis();
    const keys = await redis.keys(`${CHATROOM_CACHE_KEY}*`);
    
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info(`Cleared ${keys.length} chatroom cache entries`);
    }
  } catch (error) {
    logger.error('Error clearing all chatroom cache:', error);
  }
}

// Get cached user session data
async function getCachedUserSession(userId) {
  try {
    const redis = getRedis();
    const key = `session:user:${userId}`;
    
    const cachedData = await redis.get(key);
    if (cachedData) {
      return JSON.parse(cachedData);
    }
    
    return null;
  } catch (error) {
    logger.error('Error getting cached user session:', error);
    return null;
  }
}

// Set cached user session data
async function setCachedUserSession(userId, sessionData, ttl = 3600) {
  try {
    const redis = getRedis();
    const key = `session:user:${userId}`;
    
    await redis.setex(key, ttl, JSON.stringify(sessionData));
    logger.info(`Cached user session for user ${userId}`);
  } catch (error) {
    logger.error('Error setting cached user session:', error);
  }
}

// Clear cached user session
async function clearUserSessionCache(userId) {
  try {
    const redis = getRedis();
    const key = `session:user:${userId}`;
    
    await redis.del(key);
    logger.info(`Cleared user session cache for user ${userId}`);
  } catch (error) {
    logger.error('Error clearing user session cache:', error);
  }
}

// Cache daily usage count
async function getCachedDailyUsage(userId) {
  try {
    const redis = getRedis();
    const key = `usage:daily:${userId}`;
    
    const cachedData = await redis.get(key);
    if (cachedData) {
      return JSON.parse(cachedData);
    }
    
    return null;
  } catch (error) {
    logger.error('Error getting cached daily usage:', error);
    return null;
  }
}

// Set cached daily usage count
async function setCachedDailyUsage(userId, usageData, ttl = 86400) {
  try {
    const redis = getRedis();
    const key = `usage:daily:${userId}`;
    
    await redis.setex(key, ttl, JSON.stringify(usageData));
  } catch (error) {
    logger.error('Error setting cached daily usage:', error);
  }
}

module.exports = {
  getCachedChatrooms,
  setCachedChatrooms,
  clearChatroomCache,
  clearAllChatroomCache,
  getCachedUserSession,
  setCachedUserSession,
  clearUserSessionCache,
  getCachedDailyUsage,
  setCachedDailyUsage
};
