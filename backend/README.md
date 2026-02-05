# PayLoom Instants Backend API

Complete payment infrastructure for Africa with built-in escrow functionality.

## 🚀 Features

- **Collections API** - Accept payments via M-Pesa, cards, and bank transfers
- **Escrow API** - Hold funds securely until conditions are met
- **Payouts API** - Send money to M-Pesa, bank accounts, or internal wallets
- **Wallet API** - Manage user balances with available and locked funds tracking
- **Ledger API** - Double-entry bookkeeping with automatic reconciliation
- **KYC API** - Identity verification with trust scoring and compliance
- **Webhooks API** - Real-time event notifications with retry logic

## 📋 Prerequisites

- Node.js 16+ 
- MongoDB 4.4+
- Redis (optional, for caching)
- AWS S3 (optional, for document storage)

## 🛠️ Installation

1. Clone the repository
```bash
git clone <repository-url>
cd payloom-instants/backend
```

2. Install dependencies
```bash
npm install
```

3. Copy environment variables
```bash
cp .env.example .env
```

4. Update `.env` with your configuration
```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/payloom_instants
JWT_SECRET=your_super_secret_jwt_key
MPESA_CONSUMER_KEY=your_mpesa_consumer_key
MPESA_CONSUMER_SECRET=your_mpesa_consumer_secret
```

5. Start the server
```bash
# Development
npm run dev

# Production
npm start
```

## 📚 API Documentation

### Base URL
```
http://localhost:3000/api/v1
```

### Authentication

#### Register Business
```http
POST /auth/register
Content-Type: application/json

{
  "business_name": "ABC Marketplace",
  "email": "admin@abc.com",
  "phone": "+254712345678",
  "password": "securepassword",
  "use_case": "marketplace",
  "website": "https://abc.com"
}
```

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin@abc.com",
  "password": "securepassword"
}
```

#### API Key Authentication
```http
Authorization: Bearer pk_test_your_api_key_here
```

### Collections

#### Create Payment Request
```http
POST /collections/create
Authorization: Bearer pk_test_your_api_key
Content-Type: application/json

{
  "amount": 25000,
  "currency": "KES",
  "payment_method": "mpesa",
  "customer_email": "customer@example.com",
  "customer_phone": "+254712345678",
  "customer_name": "John Doe",
  "description": "Payment for order #123",
  "reference": "ORDER-123"
}
```

#### Get Collection Details
```http
GET /collections/col_abc123def456
Authorization: Bearer pk_test_your_api_key
```

#### List Collections
```http
GET /collections?page=1&limit=20&status=completed
Authorization: Bearer pk_test_your_api_key
```

### Escrow

#### Create Escrow
```http
POST /escrow/create
Authorization: Bearer pk_test_your_api_key
Content-Type: application/json

{
  "amount": 25000,
  "currency": "KES",
  "payer_wallet_id": "wallet_abc123",
  "payee_wallet_id": "wallet_def456",
  "conditions": [
    {
      "type": "delivery_confirmation",
      "description": "Goods delivered successfully"
    }
  ],
  "description": "Escrow for order #123"
}
```

#### Fulfill Condition
```http
POST /escrow/esc_abc123/conditions/cond_def456/fulfill
Authorization: Bearer pk_test_your_api_key
```

#### Release Funds
```http
POST /escrow/esc_abc123/release
Authorization: Bearer pk_test_your_api_key
```

### Payouts

#### Send Money
```http
POST /payouts/create
Authorization: Bearer pk_test_your_api_key
Content-Type: application/json

{
  "amount": 24375,
  "currency": "KES",
  "payment_method": "mpesa",
  "recipient_phone": "+254712345678",
  "recipient_name": "John Doe",
  "description": "Payout for completed work"
}
```

### Wallets

#### Create Wallet
```http
POST /wallets/create
Authorization: Bearer pk_test_your_api_key
Content-Type: application/json

{
  "owner_type": "user",
  "owner_id": "user_abc123",
  "currency": "KES",
  "description": "Main business wallet"
}
```

#### Get Wallet Balance
```http
GET /wallets/wallet_abc123/balance
Authorization: Bearer pk_test_your_api_key
```

## 🔧 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ENV` | Environment (development/production) | Yes |
| `PORT` | Server port | Yes |
| `MONGODB_URI` | MongoDB connection string | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `MPESA_CONSUMER_KEY` | M-Pesa API consumer key | Yes |
| `MPESA_CONSUMER_SECRET` | M-Pesa API consumer secret | Yes |
| `MPESA_PASSKEY` | M-Pesa passkey | Yes |
| `MPESA_SHORTCODE` | M-Pesa shortcode | Yes |
| `WEBHOOK_SECRET` | Webhook signing secret | Yes |
| `REDIS_URL` | Redis connection URL | Optional |

## 🏗️ Project Structure

```
backend/
├── src/
│   ├── config/          # Database and app configuration
│   ├── controllers/     # Route controllers
│   ├── middleware/      # Authentication and validation
│   ├── models/          # MongoDB models
│   ├── routes/          # API routes
│   ├── services/        # Business logic services
│   └── utils/           # Utility functions
├── logs/                # Application logs
├── tests/               # Test files
├── .env.example         # Environment variables template
├── package.json         # Dependencies and scripts
└── server.js            # Application entry point
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- auth.test.js
```

## 📊 Monitoring & Logging

- **Winston** for structured logging
- **Request logging** with response times
- **Error tracking** with stack traces
- **Security event logging** for audit trails
- **Transaction logging** for financial records

Log files are stored in the `logs/` directory:
- `combined.log` - All application logs
- `error.log` - Error logs only
- `exceptions.log` - Uncaught exceptions

## 🔒 Security Features

- **JWT authentication** for dashboard access
- **API key authentication** for API endpoints
- **Rate limiting** to prevent abuse
- **Request validation** with express-validator
- **Helmet.js** for security headers
- **CORS** configuration
- **Input sanitization** and validation

## 🚀 Deployment

### Docker Deployment
```bash
# Build image
docker build -t payloom-backend .

# Run container
docker run -p 3000:3000 --env-file .env payloom-backend
```

### PM2 Deployment
```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start server.js --name payloom-api

# Monitor
pm2 monit
```

## 📞 Support

- **Documentation**: [API Docs](http://localhost:3000/api/v1/docs)
- **Health Check**: [Health Endpoint](http://localhost:3000/health)
- **Support Email**: support@payloom.com

## 📄 License

MIT License - see LICENSE file for details.

---

Built with ❤️ for Africa's payment ecosystem
