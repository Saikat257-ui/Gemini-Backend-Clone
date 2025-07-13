const { getPool } = require('../config/database');
const logger = require('../utils/logger');

// Rate limiter middleware for daily usage
async function rateLimiter(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const pool = getPool();
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    // Check if user is on basic tier
    if (req.user.subscription_tier === 'basic') {
      // Reset daily usage count if it's a new day
      if (req.user.last_usage_reset !== today) {
        await pool.query(
          'UPDATE users SET daily_usage_count = 0, last_usage_reset = $1 WHERE id = $2',
          [today, userId]
        );
        req.user.daily_usage_count = 0;
        req.user.last_usage_reset = today;
      }

      // Check if user has exceeded daily limit
      if (req.user.daily_usage_count >= 5) {
        return res.status(429).json({ 
          error: 'Daily usage limit exceeded',
          message: 'Basic tier users are limited to 5 prompts per day. Please upgrade to Pro for unlimited usage.',
          dailyUsageCount: req.user.daily_usage_count,
          limit: 5,
          tier: 'basic'
        });
      }
    }

    next();
  } catch (error) {
    logger.error('Rate limiter error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Increment usage count after successful request
async function incrementUsage(req, res, next) {
  try {
    if (!req.user) {
      return next();
    }

    const pool = getPool();
    const userId = req.user.id;

    // Only increment for basic tier users
    if (req.user.subscription_tier === 'basic') {
      await pool.query(
        'UPDATE users SET daily_usage_count = daily_usage_count + 1 WHERE id = $1',
        [userId]
      );
    }

    next();
  } catch (error) {
    logger.error('Usage increment error:', error);
    next();
  }
}

module.exports = {
  rateLimiter,
  incrementUsage
};
