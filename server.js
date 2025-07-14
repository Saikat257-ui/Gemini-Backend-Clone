const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const Stripe = require('stripe');
require('dotenv').config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const chatroomRoutes = require('./routes/chatroom');
const subscriptionRoutes = require('./routes/subscription');

const app = express();
const PORT = process.env.PORT || 5000;

// Set up the webhook endpoint before any middleware
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

app.post('/webhook/stripe', 
  (req, res, next) => {
    if (req.originalUrl === '/webhook/stripe') {
      express.raw({type: 'application/json'})(req, res, next);
    } else {
      next();
    }
  },
  (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      // Convert the request body to a Buffer if it isn't already
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
      
      event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
      logger.info('Webhook verified:', event.type);

      // Handle the event
      switch (event.type) {
        case 'checkout.session.completed':
        case 'invoice.payment_succeeded':
        case 'invoice.payment_failed':
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          logger.info(`Processing webhook event: ${event.type}`);
          break;
        default:
          logger.info(`Unhandled event type: ${event.type}`);
      }

      // Return a 200 response
      res.status(200).send({received: true});
    } catch (err) {
      logger.error('Webhook Error:', err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
);

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Body parsing middleware for other routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Root route - API documentation
app.get('/', (req, res) => {
  res.json({
    name: 'Gemini Chat API',
    version: '1.0.0',
    description: 'A comprehensive backend system for Gemini-style chat application with OTP authentication, chatroom management, and subscription handling.',
    endpoints: {
      auth: {
        'POST /auth/send-otp': 'Send OTP to mobile number',
        'POST /auth/verify-otp': 'Verify OTP and get JWT token',
        'POST /auth/signup': 'Create new user account'
      },
      user: {
        'GET /user/me': 'Get current user profile and stats'
      },
      chatroom: {
        'GET /chatroom': 'Get all chatrooms for user',
        'POST /chatroom': 'Create new chatroom',
        'GET /chatroom/:id': 'Get specific chatroom with messages',
        'POST /chatroom/:id/message': 'Send message to chatroom'
      },
      subscription: {
        'GET /subscription/status': 'Get subscription status and usage',
        'POST /subscription/create-checkout': 'Create Stripe checkout session',
        'POST /webhook/stripe': 'Handle Stripe webhooks'
      },
      health: {
        'GET /health': 'Health check endpoint'
      }
    },
    features: {
      authentication: 'OTP-based authentication with JWT tokens',
      chatrooms: 'Multi-room conversation management',
      ai_integration: 'Google Gemini API for intelligent responses',
      subscriptions: 'Tier-based system (Basic: 5 prompts/day, Pro: unlimited)',
      caching: 'Redis-based caching for performance optimization',
      rate_limiting: 'API request throttling and usage tracking'
    },
    status: 'Active',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/auth', authRoutes);
app.use('/user', userRoutes);
app.use('/chatroom', chatroomRoutes);
app.use('/subscribe', subscriptionRoutes);
app.use('/subscription', subscriptionRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use(errorHandler);

// // 404 handler
// app.use('*', (req, res) => {
//   res.status(404).json({ 
//     error: 'Route not found',
//     path: req.originalUrl
//   });
// });

// Export the configured Express app
// Server initialization and startup is handled in app.js
module.exports = app;
