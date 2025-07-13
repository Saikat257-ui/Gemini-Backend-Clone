const Stripe = require('stripe');
const { getPool } = require('../config/database');
const logger = require('../utils/logger');

// Initialize Stripe (use test key for sandbox)
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_51234567890abcdefghijklmnopqrstuvwxyz';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_1234567890abcdef';

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

// Create Stripe checkout session
async function createStripeCheckoutSession({ userId, userEmail, priceId, successUrl, cancelUrl }) {
  try {
    const pool = getPool();

    // Get or create Stripe customer
    let stripeCustomerId;
    const userResult = await pool.query(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows[0]?.stripe_customer_id) {
      stripeCustomerId = userResult.rows[0].stripe_customer_id;
    } else {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: {
          userId: userId.toString()
        }
      });
      
      stripeCustomerId = customer.id;
      
      // Update user with Stripe customer ID
      await pool.query(
        'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
        [stripeCustomerId, userId]
      );
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId: userId.toString()
      }
    });

    logger.info(`Stripe checkout session created for user ${userId}: ${session.id}`);
    return session;
  } catch (error) {
    logger.error('Error creating Stripe checkout session:', error);
    throw error;
  }
}

// Handle Stripe webhook events
async function handleStripeWebhook(payload, signature) {
  try {
    const event = stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
    const pool = getPool();

    logger.info(`Stripe webhook received: ${event.type}`);

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
  } catch (error) {
    logger.error('Error handling Stripe webhook:', error);
    throw error;
  }
}

// Handle checkout session completed
async function handleCheckoutCompleted(session, pool) {
  try {
    const userId = parseInt(session.metadata.userId);
    const subscriptionId = session.subscription;

    logger.info(`Checkout completed for user ${userId}, subscription: ${subscriptionId}`);

    // Update user's subscription tier
    await pool.query(
      'UPDATE users SET subscription_tier = $1, stripe_subscription_id = $2 WHERE id = $3',
      ['pro', subscriptionId, userId]
    );

    // Create subscription record
    await pool.query(
      'INSERT INTO subscriptions (user_id, stripe_subscription_id, status, tier) VALUES ($1, $2, $3, $4)',
      [userId, subscriptionId, 'active', 'pro']
    );

    logger.info(`User ${userId} upgraded to Pro subscription`);
  } catch (error) {
    logger.error('Error handling checkout completed:', error);
    throw error;
  }
}

// Handle payment succeeded
async function handlePaymentSucceeded(invoice, pool) {
  try {
    const subscriptionId = invoice.subscription;
    
    // Update subscription status
    await pool.query(
      'UPDATE subscriptions SET status = $1 WHERE stripe_subscription_id = $2',
      ['active', subscriptionId]
    );

    // Update user tier
    await pool.query(
      'UPDATE users SET subscription_tier = $1 WHERE stripe_subscription_id = $2',
      ['pro', subscriptionId]
    );

    logger.info(`Payment succeeded for subscription: ${subscriptionId}`);
  } catch (error) {
    logger.error('Error handling payment succeeded:', error);
    throw error;
  }
}

// Handle payment failed
async function handlePaymentFailed(invoice, pool) {
  try {
    const subscriptionId = invoice.subscription;
    
    // Update subscription status
    await pool.query(
      'UPDATE subscriptions SET status = $1 WHERE stripe_subscription_id = $2',
      ['past_due', subscriptionId]
    );

    logger.warn(`Payment failed for subscription: ${subscriptionId}`);
  } catch (error) {
    logger.error('Error handling payment failed:', error);
    throw error;
  }
}

// Handle subscription created
async function handleSubscriptionCreated(subscription, pool) {
  try {
    const customerId = subscription.customer;
    const subscriptionId = subscription.id;

    // Get user by customer ID
    const userResult = await pool.query(
      'SELECT id FROM users WHERE stripe_customer_id = $1',
      [customerId]
    );

    if (userResult.rows.length === 0) {
      logger.error(`User not found for customer: ${customerId}`);
      return;
    }

    const userId = userResult.rows[0].id;

    // Update user's subscription
    await pool.query(
      'UPDATE users SET subscription_tier = $1, stripe_subscription_id = $2 WHERE id = $3',
      ['pro', subscriptionId, userId]
    );

    logger.info(`Subscription created for user ${userId}: ${subscriptionId}`);
  } catch (error) {
    logger.error('Error handling subscription created:', error);
    throw error;
  }
}

// Handle subscription updated
async function handleSubscriptionUpdated(subscription, pool) {
  try {
    const subscriptionId = subscription.id;
    const status = subscription.status;

    let dbStatus = 'active';
    let userTier = 'pro';

    if (status === 'canceled' || status === 'unpaid') {
      dbStatus = 'canceled';
      userTier = 'basic';
    } else if (status === 'past_due') {
      dbStatus = 'past_due';
      userTier = 'basic';
    }

    // Update subscription status
    await pool.query(
      'UPDATE subscriptions SET status = $1 WHERE stripe_subscription_id = $2',
      [dbStatus, subscriptionId]
    );

    // Update user tier
    await pool.query(
      'UPDATE users SET subscription_tier = $1 WHERE stripe_subscription_id = $2',
      [userTier, subscriptionId]
    );

    logger.info(`Subscription updated: ${subscriptionId} - Status: ${status}`);
  } catch (error) {
    logger.error('Error handling subscription updated:', error);
    throw error;
  }
}

// Handle subscription deleted
async function handleSubscriptionDeleted(subscription, pool) {
  try {
    const subscriptionId = subscription.id;

    // Update subscription status
    await pool.query(
      'UPDATE subscriptions SET status = $1, ended_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = $2',
      ['canceled', subscriptionId]
    );

    // Downgrade user to basic tier
    await pool.query(
      'UPDATE users SET subscription_tier = $1 WHERE stripe_subscription_id = $2',
      ['basic', subscriptionId]
    );

    logger.info(`Subscription deleted: ${subscriptionId}`);
  } catch (error) {
    logger.error('Error handling subscription deleted:', error);
    throw error;
  }
}

module.exports = {
  createStripeCheckoutSession,
  handleStripeWebhook
};
