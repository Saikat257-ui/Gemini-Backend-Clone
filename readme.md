# Gemini Chat API System

## Overview

This is a comprehensive backend system for a Gemini-style chat application that enables users to create personalized chatrooms, authenticate via OTP, engage in AI-powered conversations through Google Gemini API, and manage subscriptions via Stripe. The system is built with Node.js/Express and uses PostgreSQL for data persistence, Redis for caching and job queues, and implements asynchronous message processing.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Backend Framework
- **Express.js**: RESTful API server with middleware-based architecture
- **Node.js**: Runtime environment for server-side JavaScript execution
- **PostgreSQL**: Primary database for persistent data storage
- **Redis**: In-memory data store for caching and job queue management
- **Drizzle ORM**: Type-safe SQL query builder for database operations

### Security & Authentication
- **JWT (JSON Web Tokens)**: Stateless authentication mechanism
- **bcryptjs**: Password hashing for security
- **Helmet**: HTTP security headers middleware
- **CORS**: Cross-origin resource sharing configuration
- **Rate Limiting**: API request throttling and daily usage limits

### Third-Party Integrations
- **Google Gemini API**: AI conversation generation
- **Stripe**: Payment processing and subscription management
- **BullMQ**: Redis-based job queue for asynchronous processing

## Key Components

### Authentication System
- **OTP-based Login**: Mobile number authentication without external SMS service
- **JWT Token Management**: Secure token generation and validation
- **Password Support**: Optional password-based authentication
- **Session Management**: Stateless authentication with token expiration

### Chatroom Management
- **Multi-room Support**: Users can create and manage multiple chatrooms
- **Message Threading**: Conversation history tracking per chatroom
- **Asynchronous Processing**: AI responses handled via job queues
- **Context Awareness**: Conversation history included in AI prompts

### Subscription System
- **Tier-based Access**: Basic (free, 5 prompts/day) vs Pro (unlimited)
- **Stripe Integration**: Secure payment processing
- **Webhook Handling**: Real-time subscription status updates
- **Usage Tracking**: Daily usage limits and reset mechanisms

### Caching Strategy
- **Query Caching**: Chatroom list caching with Redis (5-minute TTL)
- **Cache Invalidation**: Automatic cache clearing on data updates
- **Performance Optimization**: Reduces database load for frequently accessed data

### Queue System
- **BullMQ Integration**: Asynchronous job processing
- **Retry Logic**: Exponential backoff for failed jobs
- **Concurrency Control**: Multiple workers for parallel processing
- **Job Monitoring**: Success/failure tracking and logging

## Data Flow

### User Authentication Flow
1. User provides mobile number for OTP generation
2. OTP stored in database with 5-minute expiration
3. User verifies OTP and receives JWT token
4. Token used for subsequent API authentication

### Chat Message Flow
1. User sends message to chatroom endpoint
2. Rate limiting check based on subscription tier
3. Message queued for Gemini API processing
4. AI response generated with conversation context
5. Response stored and returned to user
6. Usage count incremented for basic tier users

### Subscription Flow
1. User initiates Pro subscription via Stripe
2. Checkout session created with customer details
3. Stripe webhook processes payment events
4. User tier updated in database
5. Usage limits adjusted based on new tier

## External Dependencies

### Required Services
- **PostgreSQL Database**: Primary data storage
- **Redis Server**: Caching and job queue backend
- **Google Gemini API**: AI conversation generation
- **Stripe Account**: Payment processing (sandbox mode)

### Environment Variables
- Database connection strings
- Redis configuration
- API keys for external services
- JWT secret key
- Stripe webhook secrets

### NPM Dependencies
- Express.js ecosystem (express, cors, helmet, morgan)
- Authentication (jsonwebtoken, bcryptjs)
- Database (drizzle-orm, pg)
- Queue system (bullmq, ioredis)
- Validation (joi)
- Payment processing (stripe)
- AI integration (@google/generative-ai)

## Deployment Strategy

### Development Environment
- Local PostgreSQL and Redis instances
- Environment variables via .env file
- File-based logging for development
- Console logging for debugging

### Production Considerations
- Containerized deployment with Docker
- Managed database services (AWS RDS, Google Cloud SQL)
- Redis cluster for high availability
- Load balancing for multiple app instances
- Environment-specific configuration management
- Centralized logging and monitoring

### Scalability Features
- Connection pooling for database efficiency
- Redis clustering for cache distribution
- Horizontal scaling via load balancers
- Async processing for CPU-intensive tasks
- Rate limiting to prevent abuse

The system is designed to handle concurrent users while maintaining data consistency and providing a responsive user experience through caching and asynchronous processing.

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- PostgreSQL
- Redis
- Stripe account (for subscription features)
- Google Cloud Project with Gemini API enabled

### Installation Steps

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Set up environment variables in `.env`:

- Check `.env.example` as a reference for required variables
- Create a `.env` file in the root directory and fill in the values

4. Start the server:

- For starting the server in development mode: Set `NODE_ENV=development` in `.env` and the run the following
```bash
npm start
```

- For starting the server in production mode: Set `NODE_ENV=production` in `.env` and the run the following
```bash
npm start
```

- For starting the server with debugging enabled run the following
```bash
$env:DEBUG='ioredis:*'; npm start
```

## Testing Features

### 1. Health Check
```bash
curl http://localhost:5000/health
```
Expected response:
```json
{
  "status": "OK",
  "timestamp": "2025-07-13T10:00:00.000Z"
}
```

### 2. Authentication Flow

- Install the `rest-client` extension in your code editor (e.g., VSCode).
- Checkout the app.rest.template file for detailed API requests.
- Create a app.rest file in the root directory and copy the contents from app.rest.template.
- Or, check out the postman collection file for the authentication flow.

### 3. Chatroom Operations

- Install the `rest-client` extension in your code editor (e.g., VSCode).
- Checkout the app.rest.template file for detailed API requests.
- Create a app.rest file in the root directory and copy the contents from app.rest.template.
- Or, check out the postman collection file for the authentication flow.

### 4. Subscription Management

- Install the `rest-client` extension in your code editor (e.g., VSCode).
- Checkout the app.rest.template file for detailed API requests.
- Create a app.rest file in the root directory and copy the contents from app.rest.template.
- Or, check out the postman collection file for the authentication flow.

## Troubleshooting

### Redis Connection Issues
If Redis connection fails:
1. Verify Redis credentials in .env
2. Check if Redis server is running
3. Test connection using:
```bash
node redis-test-direct.js
```

### Database Connection Issues
If database connection fails:
1. Verify DATABASE_URL in .env
2. Ensure PostgreSQL is running
3. Check database logs for errors

### Rate Limiting
- Default: 100 requests per 15 minutes
- Adjust RATE_LIMIT_* variables in .env if needed
- Test rate limiting:
```bash
for i in {1..110}; do curl http://localhost:5000/health; done
```

## Monitoring

### Logs
- Application logs: `combined.log`
- Error logs: `error.log`
- Use `tail -f combined.log` to watch logs in real-time