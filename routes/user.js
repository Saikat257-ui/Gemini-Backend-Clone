const express = require('express');
const { getPool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// GET /user/me - Get current user details
router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const pool = getPool();
    const userId = req.user.id;

    // Get user details with subscription info
    const userResult = await pool.query(`
      SELECT 
        u.id, 
        u.mobile_number, 
        u.name, 
        u.email, 
        u.subscription_tier, 
        u.daily_usage_count, 
        u.last_usage_reset,
        u.created_at,
        s.status as subscription_status,
        s.started_at as subscription_started_at,
        s.ended_at as subscription_ended_at
      FROM users u
      LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
      WHERE u.id = $1
    `, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: 'User not found' 
      });
    }

    const user = userResult.rows[0];

    // Get chatroom count
    const chatroomResult = await pool.query(
      'SELECT COUNT(*) as chatroom_count FROM chatrooms WHERE user_id = $1',
      [userId]
    );

    // Get total messages count
    const messageResult = await pool.query(
      'SELECT COUNT(*) as message_count FROM messages WHERE user_id = $1',
      [userId]
    );

    res.json({
      user: {
        id: user.id,
        mobile_number: user.mobile_number,
        name: user.name,
        email: user.email,
        subscription_tier: user.subscription_tier,
        daily_usage_count: user.daily_usage_count,
        last_usage_reset: user.last_usage_reset,
        created_at: user.created_at,
        subscription_status: user.subscription_status,
        subscription_started_at: user.subscription_started_at,
        subscription_ended_at: user.subscription_ended_at,
        stats: {
          chatroom_count: parseInt(chatroomResult.rows[0].chatroom_count),
          message_count: parseInt(messageResult.rows[0].message_count)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// PUT /user/me - Update user profile
router.put('/me', authenticateToken, async (req, res, next) => {
  try {
    const { name, email } = req.body;
    const pool = getPool();
    const userId = req.user.id;

    // Validate input
    if (!name && !email) {
      return res.status(400).json({ 
        error: 'Validation Error', 
        message: 'At least one field (name or email) must be provided' 
      });
    }

    // Build update query dynamically
    const updateFields = [];
    const values = [];
    let valueIndex = 1;

    if (name) {
      updateFields.push(`name = $${valueIndex}`);
      values.push(name);
      valueIndex++;
    }

    if (email) {
      updateFields.push(`email = $${valueIndex}`);
      values.push(email);
      valueIndex++;
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(userId);

    const updateQuery = `
      UPDATE users 
      SET ${updateFields.join(', ')} 
      WHERE id = $${valueIndex}
      RETURNING id, mobile_number, name, email, subscription_tier, created_at, updated_at
    `;

    const result = await pool.query(updateQuery, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: 'User not found' 
      });
    }

    const user = result.rows[0];

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user.id,
        mobile_number: user.mobile_number,
        name: user.name,
        email: user.email,
        subscription_tier: user.subscription_tier,
        created_at: user.created_at,
        updated_at: user.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
