const express = require('express');
const bcrypt = require('bcryptjs');
const { getPool } = require('../config/database');
const { generateToken, authenticateToken } = require('../middleware/auth');
const { generateOTP, verifyOTP } = require('../services/otpService');
const { validateSignup, validateSendOTP, validateVerifyOTP } = require('../utils/validators');
const logger = require('../utils/logger');

const router = express.Router();

// POST /auth/signup - Register a new user
router.post('/signup', async (req, res, next) => {
  try {
    const { error, value } = validateSignup(req.body);
    if (error) {
      return res.status(400).json({ error: 'Validation Error', message: error.details[0].message });
    }

    const { mobile_number, name, email, password } = value;
    const pool = getPool();

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE mobile_number = $1',
      [mobile_number]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Conflict', 
        message: 'User with this mobile number already exists' 
      });
    }

    // Hash password if provided
    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 12);
    }

    // Create user
    const result = await pool.query(
      'INSERT INTO users (mobile_number, name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, mobile_number, name, email, subscription_tier, created_at',
      [mobile_number, name, email, passwordHash]
    );

    const user = result.rows[0];

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        mobile_number: user.mobile_number,
        name: user.name,
        email: user.email,
        subscription_tier: user.subscription_tier,
        created_at: user.created_at
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /auth/send-otp - Send OTP to mobile number
router.post('/send-otp', async (req, res, next) => {
  try {
    const { error, value } = validateSendOTP(req.body);
    if (error) {
      return res.status(400).json({ error: 'Validation Error', message: error.details[0].message });
    }

    const { mobile_number, purpose } = value;
    const pool = getPool();

    // Check if user exists
    const userResult = await pool.query(
      'SELECT id FROM users WHERE mobile_number = $1',
      [mobile_number]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: 'User with this mobile number not found' 
      });
    }

    // Generate and store OTP
    const otp = await generateOTP(mobile_number, purpose || 'login');

    res.json({
      message: 'OTP sent successfully',
      otp: otp, // In production, this would be sent via SMS
      mobile_number: mobile_number,
      purpose: purpose || 'login',
      expires_in: 300 // 5 minutes
    });
  } catch (error) {
    next(error);
  }
});

// POST /auth/verify-otp - Verify OTP and return JWT token
router.post('/verify-otp', async (req, res, next) => {
  try {
    const { error, value } = validateVerifyOTP(req.body);
    if (error) {
      return res.status(400).json({ error: 'Validation Error', message: error.details[0].message });
    }

    const { mobile_number, otp, purpose } = value;
    const pool = getPool();

    // Verify OTP
    const isValid = await verifyOTP(mobile_number, otp, purpose || 'login');
    if (!isValid) {
      return res.status(400).json({ 
        error: 'Invalid OTP', 
        message: 'The provided OTP is invalid or expired' 
      });
    }

    // Get user details
    const userResult = await pool.query(
      'SELECT id, mobile_number, name, email, subscription_tier, daily_usage_count, last_usage_reset FROM users WHERE mobile_number = $1',
      [mobile_number]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: 'User not found' 
      });
    }

    const user = userResult.rows[0];

    // Generate JWT token
    const token = generateToken(user.id);

    res.json({
      message: 'OTP verified successfully',
      token: token,
      user: {
        id: user.id,
        mobile_number: user.mobile_number,
        name: user.name,
        email: user.email,
        subscription_tier: user.subscription_tier,
        daily_usage_count: user.daily_usage_count,
        last_usage_reset: user.last_usage_reset
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /auth/forgot-password - Send OTP for password reset
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { error, value } = validateSendOTP(req.body);
    if (error) {
      return res.status(400).json({ error: 'Validation Error', message: error.details[0].message });
    }

    const { mobile_number } = value;
    const pool = getPool();

    // Check if user exists
    const userResult = await pool.query(
      'SELECT id FROM users WHERE mobile_number = $1',
      [mobile_number]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: 'User with this mobile number not found' 
      });
    }

    // Generate and store OTP for password reset
    const otp = await generateOTP(mobile_number, 'password_reset');

    res.json({
      message: 'Password reset OTP sent successfully',
      otp: otp, // In production, this would be sent via SMS
      mobile_number: mobile_number,
      purpose: 'password_reset',
      expires_in: 300 // 5 minutes
    });
  } catch (error) {
    next(error);
  }
});

// POST /auth/change-password - Change password (requires authentication)
router.post('/change-password', authenticateToken, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ 
        error: 'Validation Error', 
        message: 'Current password and new password are required' 
      });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ 
        error: 'Validation Error', 
        message: 'New password must be at least 6 characters long' 
      });
    }

    const pool = getPool();
    const userId = req.user.id;

    // Get current password hash
    const userResult = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: 'User not found' 
      });
    }

    const user = userResult.rows[0];

    // Verify current password
    if (!user.password_hash) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'No password set. Please use OTP login.' 
      });
    }

    const isCurrentPasswordValid = await bcrypt.compare(current_password, user.password_hash);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ 
        error: 'Invalid Password', 
        message: 'Current password is incorrect' 
      });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(new_password, 12);

    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, userId]
    );

    res.json({
      message: 'Password changed successfully'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
