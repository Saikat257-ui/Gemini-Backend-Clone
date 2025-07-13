const express = require('express');
const { getPool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { createStripeCheckoutSession, handleStripeWebhook } = require('../services/stripeService');
const logger = require('../utils/logger');

const router = express.Router();

// POST /subscribe/pro - Initiate Pro subscription via Stripe
router.post('/pro', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email || `user${userId}@example.com`;
    const pool = getPool();

    // Check if user already has an active subscription
    const existingSubscription = await pool.query(
      'SELECT * FROM subscriptions WHERE user_id = $1 AND status = $2',
      [userId, 'active']
    );

    if (existingSubscription.rows.length > 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'User already has an active subscription'
      });
    }

    // Create Stripe checkout session
    const session = await createStripeCheckoutSession({
      userId: userId,
      userEmail: userEmail,
      priceId: process.env.STRIPE_PRICE_ID, // This would be set in production
      successUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/subscription/success`,
      cancelUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/subscription/cancel`
    });

    res.json({
      message: 'Checkout session created successfully',
      checkout_url: session.url,
      session_id: session.id
    });
  } catch (error) {
    next(error);
  }
});

// GET /subscription/status - Check user's current subscription status
router.get('/status', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const pool = getPool();

    // Get current subscription
    const subscriptionResult = await pool.query(`
      SELECT 
        s.id,
        s.stripe_subscription_id,
        s.status,
        s.tier,
        s.started_at,
        s.ended_at,
        u.subscription_tier,
        u.daily_usage_count,
        u.last_usage_reset
      FROM subscriptions s
      RIGHT JOIN users u ON s.user_id = u.id
      WHERE u.id = $1
      ORDER BY s.created_at DESC
      LIMIT 1
    `, [userId]);

    const result = subscriptionResult.rows[0];

    // Calculate usage limits
    const usageInfo = {
      daily_usage_count: result.daily_usage_count || 0,
      last_usage_reset: result.last_usage_reset,
      tier: result.subscription_tier || 'basic'
    };

    if (result.subscription_tier === 'basic') {
      usageInfo.daily_limit = 5;
      usageInfo.remaining = Math.max(0, 5 - (result.daily_usage_count || 0));
    } else {
      usageInfo.daily_limit = 'unlimited';
      usageInfo.remaining = 'unlimited';
    }

    const response = {
      subscription: {
        tier: result.subscription_tier || 'basic',
        status: result.status || 'inactive',
        started_at: result.started_at,
        ended_at: result.ended_at,
        stripe_subscription_id: result.stripe_subscription_id
      },
      usage: usageInfo,
      features: {
        basic: {
          daily_prompts: 5,
          chatrooms: 'unlimited',
          support: 'community'
        },
        pro: {
          daily_prompts: 'unlimited',
          chatrooms: 'unlimited',
          support: 'priority',
          advanced_features: true
        }
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// POST /webhook/stripe - Handle Stripe webhook events
router.post('/stripe', async (req, res) => {
  try {
    // Event was already verified in the middleware
    const event = req.stripeEvent;
    const pool = getPool();

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object, pool);
        break;
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object, pool);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object, pool);
        break;
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object, pool);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object, pool);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object, pool);
        break;
      default:
        logger.info(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Stripe webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /subscription/history - Get subscription history
router.get('/history', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const pool = getPool();

    const historyResult = await pool.query(`
      SELECT 
        id,
        stripe_subscription_id,
        status,
        tier,
        started_at,
        ended_at,
        created_at
      FROM subscriptions
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);

    res.json({
      subscription_history: historyResult.rows
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
