const express = require('express');
const { getPool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { rateLimiter, incrementUsage } = require('../middleware/rateLimiter');
const { getCachedChatrooms, setCachedChatrooms, clearChatroomCache } = require('../services/cacheService');
const { addGeminiJob } = require('../jobs/geminiQueue');
const logger = require('../utils/logger');

const router = express.Router();

// POST /chatroom - Create a new chatroom
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const { title, description } = req.body;
    const pool = getPool();
    const userId = req.user.id;

    // Validate input
    if (!title || title.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Validation Error', 
        message: 'Title is required' 
      });
    }

    if (title.length > 200) {
      return res.status(400).json({ 
        error: 'Validation Error', 
        message: 'Title must be less than 200 characters' 
      });
    }

    // Create chatroom
    const result = await pool.query(
      'INSERT INTO chatrooms (user_id, title, description) VALUES ($1, $2, $3) RETURNING id, title, description, created_at, updated_at',
      [userId, title.trim(), description?.trim() || null]
    );

    const chatroom = result.rows[0];

    // Clear cache for this user
    await clearChatroomCache(userId);

    res.status(201).json({
      message: 'Chatroom created successfully',
      chatroom: {
        id: chatroom.id,
        title: chatroom.title,
        description: chatroom.description,
        created_at: chatroom.created_at,
        updated_at: chatroom.updated_at,
        message_count: 0
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /chatroom - List all chatrooms for the user (with caching)
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Try to get from cache first
    const cachedChatrooms = await getCachedChatrooms(userId);
    if (cachedChatrooms) {
      return res.json({
        chatrooms: cachedChatrooms,
        cached: true
      });
    }

    // If not in cache, fetch from database
    const pool = getPool();
    const result = await pool.query(`
      SELECT 
        c.id,
        c.title,
        c.description,
        c.created_at,
        c.updated_at,
        COUNT(m.id) as message_count,
        MAX(m.created_at) as last_message_at
      FROM chatrooms c
      LEFT JOIN messages m ON c.id = m.chatroom_id
      WHERE c.user_id = $1
      GROUP BY c.id, c.title, c.description, c.created_at, c.updated_at
      ORDER BY c.updated_at DESC
    `, [userId]);

    const chatrooms = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      created_at: row.created_at,
      updated_at: row.updated_at,
      message_count: parseInt(row.message_count),
      last_message_at: row.last_message_at
    }));

    // Cache the result for 5 minutes
    await setCachedChatrooms(userId, chatrooms, 300);

    res.json({
      chatrooms: chatrooms,
      cached: false
    });
  } catch (error) {
    next(error);
  }
});

// GET /chatroom/:id - Get detailed information about a specific chatroom
router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const chatroomId = parseInt(req.params.id);
    const userId = req.user.id;

    if (isNaN(chatroomId)) {
      return res.status(400).json({ 
        error: 'Validation Error', 
        message: 'Invalid chatroom ID' 
      });
    }

    const pool = getPool();

    // Get chatroom details with message count
    const chatroomResult = await pool.query(`
      SELECT 
        c.id,
        c.title,
        c.description,
        c.created_at,
        c.updated_at,
        COUNT(m.id) as message_count
      FROM chatrooms c
      LEFT JOIN messages m ON c.id = m.chatroom_id
      WHERE c.id = $1 AND c.user_id = $2
      GROUP BY c.id, c.title, c.description, c.created_at, c.updated_at
    `, [chatroomId, userId]);

    if (chatroomResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: 'Chatroom not found' 
      });
    }

    const chatroom = chatroomResult.rows[0];

    // Get recent messages
    const messagesResult = await pool.query(`
      SELECT 
        id,
        content,
        message_type,
        gemini_response,
        status,
        created_at
      FROM messages
      WHERE chatroom_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `, [chatroomId]);

    const messages = messagesResult.rows.reverse(); // Reverse to get chronological order

    res.json({
      chatroom: {
        id: chatroom.id,
        title: chatroom.title,
        description: chatroom.description,
        created_at: chatroom.created_at,
        updated_at: chatroom.updated_at,
        message_count: parseInt(chatroom.message_count),
        messages: messages
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /chatroom/:id/message - Send a message and get Gemini response
router.post('/:id/message', authenticateToken, rateLimiter, async (req, res, next) => {
  try {
    const chatroomId = parseInt(req.params.id);
    const userId = req.user.id;
    const { content } = req.body;

    if (isNaN(chatroomId)) {
      return res.status(400).json({ 
        error: 'Validation Error', 
        message: 'Invalid chatroom ID' 
      });
    }

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Validation Error', 
        message: 'Message content is required' 
      });
    }

    const pool = getPool();

    // Verify chatroom exists and belongs to user
    const chatroomResult = await pool.query(
      'SELECT id FROM chatrooms WHERE id = $1 AND user_id = $2',
      [chatroomId, userId]
    );

    if (chatroomResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: 'Chatroom not found' 
      });
    }

    // Save user message
    const messageResult = await pool.query(
      'INSERT INTO messages (chatroom_id, user_id, content, message_type, status) VALUES ($1, $2, $3, $4, $5) RETURNING id, content, created_at',
      [chatroomId, userId, content.trim(), 'user', 'completed']
    );

    const userMessage = messageResult.rows[0];

    // Create AI response message placeholder
    const aiMessageResult = await pool.query(
      'INSERT INTO messages (chatroom_id, user_id, content, message_type, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [chatroomId, userId, 'Processing your request...', 'ai', 'pending']
    );

    const aiMessageId = aiMessageResult.rows[0].id;

    // Add job to Gemini queue
    await addGeminiJob({
      messageId: aiMessageId,
      chatroomId: chatroomId,
      userId: userId,
      userMessage: content.trim()
    });

    // Update chatroom's updated_at timestamp
    await pool.query(
      'UPDATE chatrooms SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [chatroomId]
    );

    // Clear cache for this user
    await clearChatroomCache(userId);

    res.status(201).json({
      message: 'Message sent successfully',
      user_message: {
        id: userMessage.id,
        content: userMessage.content,
        message_type: 'user',
        created_at: userMessage.created_at
      },
      ai_message: {
        id: aiMessageId,
        content: 'Processing your request...',
        message_type: 'ai',
        status: 'pending'
      }
    });

    // Increment usage count after successful response
    if (req.user.subscription_tier === 'basic') {
      await pool.query(
        'UPDATE users SET daily_usage_count = daily_usage_count + 1 WHERE id = $1',
        [userId]
      );
    }
  } catch (error) {
    next(error);
  }
});

// PUT /chatroom/:id - Update chatroom details
router.put('/:id', authenticateToken, async (req, res, next) => {
  try {
    const chatroomId = parseInt(req.params.id);
    const userId = req.user.id;
    const { title, description } = req.body;

    if (isNaN(chatroomId)) {
      return res.status(400).json({ 
        error: 'Validation Error', 
        message: 'Invalid chatroom ID' 
      });
    }

    if (!title || title.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Validation Error', 
        message: 'Title is required' 
      });
    }

    const pool = getPool();

    // Update chatroom
    const result = await pool.query(
      'UPDATE chatrooms SET title = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND user_id = $4 RETURNING id, title, description, updated_at',
      [title.trim(), description?.trim() || null, chatroomId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: 'Chatroom not found' 
      });
    }

    const chatroom = result.rows[0];

    // Clear cache for this user
    await clearChatroomCache(userId);

    res.json({
      message: 'Chatroom updated successfully',
      chatroom: {
        id: chatroom.id,
        title: chatroom.title,
        description: chatroom.description,
        updated_at: chatroom.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /chatroom/:id - Delete a chatroom
router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const chatroomId = parseInt(req.params.id);
    const userId = req.user.id;

    if (isNaN(chatroomId)) {
      return res.status(400).json({ 
        error: 'Validation Error', 
        message: 'Invalid chatroom ID' 
      });
    }

    const pool = getPool();

    // Delete chatroom (messages will be deleted via CASCADE)
    const result = await pool.query(
      'DELETE FROM chatrooms WHERE id = $1 AND user_id = $2 RETURNING id',
      [chatroomId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: 'Chatroom not found' 
      });
    }

    // Clear cache for this user
    await clearChatroomCache(userId);

    res.json({
      message: 'Chatroom deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
