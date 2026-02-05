const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// Import database connection
const connectDB = require('./src/config/database');

// Import routes
const authRoutes = require('./src/routes/auth');
const collectionsRoutes = require('./src/routes/collections');
const escrowRoutes = require('./src/routes/escrow');
const payoutsRoutes = require('./src/routes/payouts');
const walletsRoutes = require('./src/routes/wallets');
const ledgerRoutes = require('./src/routes/ledger');
const kycRoutes = require('./src/routes/kyc');
const webhooksRoutes = require('./src/routes/webhooks');
const adminRoutes = require('./src/routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:8080', 'http://127.0.0.1:5500', 'http://localhost:5500'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files (HTML pages)
app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/collections', collectionsRoutes);
app.use('/api/v1/escrow', escrowRoutes);
app.use('/api/v1/payouts', payoutsRoutes);
app.use('/api/v1/wallets', walletsRoutes);
app.use('/api/v1/ledger', ledgerRoutes);
app.use('/api/v1/kyc', kycRoutes);
app.use('/api/v1/webhooks', webhooksRoutes);
app.use('/api/v1/admin', adminRoutes);

// Dashboard Stats Endpoint
app.get('/api/v1/dashboard/stats', async (req, res) => {
  try {
    const User = require('./src/models/User');
    const Transaction = require('./src/models/Transaction');
    const Wallet = require('./src/models/Wallet');
    const Escrow = require('./src/models/Escrow');
    
    // Get user ID from API key (simplified for now)
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing API key' });
    }
    
    // For demo, return mock data (in production, decode API key to get user)
    const mockStats = {
      collections: 125000,
      escrows: 8,
      payouts: 75000,
      balance: 45000,
      recent_transactions: [
        { id: 'txn_001', type: 'collection', amount: 5000, status: 'success', date: new Date() },
        { id: 'txn_002', type: 'escrow', amount: 25000, status: 'locked', date: new Date() },
        { id: 'txn_003', type: 'payout', amount: 10000, status: 'processing', date: new Date() }
      ]
    };
    
    res.json(mockStats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load dashboard stats' });
  }
});

// Account Keys Endpoint
app.get('/api/v1/account/keys', async (req, res) => {
  try {
    const User = require('./src/models/User');
    
    // Get user ID from JWT token (simplified)
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization' });
    }
    
    // Mock API keys data
    const mockKeys = {
      keys: [
        { type: 'public_test', prefix: 'pk_test', last_4: 'abcd', environment: 'test' },
        { type: 'secret_test', prefix: 'sk_test', last_4: 'efgh', environment: 'test' },
        { type: 'public_live', prefix: 'pk_live', last_4: 'ijkl', environment: 'live' },
        { type: 'secret_live', prefix: 'sk_live', last_4: 'mnop', environment: 'live' }
      ]
    };
    
    res.json(mockKeys);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load API keys' });
  }
});

// Admin KYC Reviews Endpoint  
app.get('/api/v1/admin/kyc-reviews', async (req, res) => {
  try {
    const User = require('./src/models/User');
    
    // Mock KYC reviews data
    const mockKYCReviews = {
      reviews: [
        {
          account_id: 'acc_001',
          business_name: 'ABC Marketplace',
          email: 'admin@abc.com',
          kyc_status: 'pending',
          submitted_at: new Date(),
          documents: {
            company_registration: 'url1',
            tax_certificate: 'url2',
            business_permit: 'url3',
            owner_id: 'url4',
            owner_selfie: 'url5',
            bank_statement: 'url6'
          }
        }
      ]
    };
    
    res.json(mockKYCReviews);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load KYC reviews' });
  }
});

// Webhook Management Endpoint
app.post('/api/v1/webhooks', async (req, res) => {
  try {
    const crypto = require('crypto');
    const { url, events } = req.body;
    
    // Generate webhook secret
    const secret = crypto.randomBytes(32).toString('hex');
    
    // Mock webhook creation
    const webhook = {
      id: 'webhook_' + Date.now(),
      url: url,
      secret: secret,
      events: events,
      status: 'active',
      created_at: new Date()
    };
    
    res.json({
      success: true,
      webhook: webhook,
      message: 'Webhook endpoint created successfully'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create webhook endpoint' });
  }
});

// Get Webhooks Endpoint
app.get('/api/v1/webhooks', async (req, res) => {
  try {
    // Mock webhooks data
    const mockWebhooks = {
      webhooks: [
        {
          id: 'webhook_001',
          url: 'https://myapp.com/webhooks/payloom',
          events: ['collection.success', 'escrow.locked', 'escrow.released', 'payout.success'],
          status: 'active',
          created_at: new Date(),
          last_delivery: new Date()
        }
      ]
    };
    
    res.json(mockWebhooks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch webhooks' });
  }
});

// Test Webhook Endpoint
app.post('/api/v1/webhooks/test', async (req, res) => {
  try {
    const { url, events } = req.body;
    
    // Mock test webhook delivery
    const testPayload = {
      id: 'evt_test_' + Date.now(),
      type: 'test.webhook',
      data: {
        message: 'Test webhook from PayLoom',
        timestamp: new Date()
      },
      created: Date.now()
    };
    
    res.json({
      success: true,
      message: 'Test webhook sent successfully',
      payload: testPayload
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send test webhook' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// Start server
const startServer = async () => {
  try {
    // Connect to database
    await connectDB();
    
    app.listen(PORT, () => {
      console.log(`🚀 PayLoom API Server running on port ${PORT}`);
      console.log(`📚 API Documentation: http://localhost:${PORT}/api/v1/docs`);
      console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
      console.log(`🌐 Frontend Pages:`);
      console.log(`   - Landing: http://localhost:${PORT}/index.html`);
      console.log(`   - Client Onboarding: http://localhost:${PORT}/client-onboarding.html`);
      console.log(`   - Client Dashboard: http://localhost:${PORT}/client-app.html`);
      console.log(`   - Admin Dashboard: http://localhost:${PORT}/admin-app.html`);
      console.log(`📁 Frontend Directory: ${path.join(__dirname, '../frontend')}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
