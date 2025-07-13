const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const logger = require('../utils/logger');
const schema = require('../models/schema');

// Use the provided PostgreSQL URL
const DATABASE_URL = process.env.DATABASE_URL;

let pool;
let db;

async function initializeDatabase() {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  try {
    logger.info('Initializing database connection...');
    
    // Create connection pool
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: {
        rejectUnauthorized: false // Required for Render PostgreSQL
      },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Test connection with timeout
    const testResult = await Promise.race([
      pool.query('SELECT NOW()'),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database connection timeout')), 5000)
      )
    ]);
    
    logger.info('Database connected successfully:', testResult.rows[0]);
    
    // Initialize Drizzle ORM
    db = drizzle(pool, { schema });
    
    // Create tables if they don't exist
    await createTables();
    
    logger.info('Database connection established successfully');
  } catch (error) {
    logger.error('Database initialization failed:', error);
    throw error;
  }
}

async function createTables() {
  try {
    // Create tables using raw SQL since we don't have migrations
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        mobile_number VARCHAR(15) UNIQUE NOT NULL,
        name VARCHAR(100),
        email VARCHAR(100),
        password_hash VARCHAR(255),
        subscription_tier VARCHAR(20) DEFAULT 'basic',
        stripe_customer_id VARCHAR(100),
        stripe_subscription_id VARCHAR(100),
        daily_usage_count INTEGER DEFAULT 0,
        last_usage_reset DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS otps (
        id SERIAL PRIMARY KEY,
        mobile_number VARCHAR(15) NOT NULL,
        otp VARCHAR(6) NOT NULL,
        purpose VARCHAR(20) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS chatrooms (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        chatroom_id INTEGER REFERENCES chatrooms(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        message_type VARCHAR(20) DEFAULT 'user',
        gemini_response TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        stripe_subscription_id VARCHAR(100) UNIQUE,
        status VARCHAR(20) NOT NULL,
        tier VARCHAR(20) NOT NULL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_mobile_number ON users(mobile_number);
      CREATE INDEX IF NOT EXISTS idx_otps_mobile_number ON otps(mobile_number);
      CREATE INDEX IF NOT EXISTS idx_chatrooms_user_id ON chatrooms(user_id);
      CREATE INDEX IF NOT EXISTS idx_messages_chatroom_id ON messages(chatroom_id);
      CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
    `);

    logger.info('Database tables created successfully');
  } catch (error) {
    logger.error('Failed to create tables:', error);
    throw error;
  }
}

function getPool() {
  if (!pool) {
    throw new Error('Database pool not initialized');
  }
  return pool;
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

module.exports = {
  initializeDatabase,
  getPool,
  getDb
};
