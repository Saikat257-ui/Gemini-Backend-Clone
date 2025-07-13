require('dotenv').config();
const Redis = require('ioredis');

async function testRedis() {
  try {
    console.log('Testing Redis connection with direct configuration...');
    
    const redis = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times) => {
        console.log(`Retry attempt ${times}`);
        return times > 3 ? false : Math.min(times * 100, 2000);
      }
    });

    redis.on('error', (err) => {
      console.error('Redis Error:', {
        message: err.message,
        code: err.code,
        command: err.command
      });
    });

    redis.on('connect', () => {
      console.log('Connected to Redis!');
    });

    console.log('Waiting for connection...');
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    console.log('Attempting PING...');
    const result = await redis.ping();
    console.log('PING result:', result);
    
    await redis.quit();
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

testRedis();
