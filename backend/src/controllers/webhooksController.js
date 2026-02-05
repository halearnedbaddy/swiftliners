const crypto = require('crypto');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const Escrow = require('../models/Escrow');
const logger = require('../utils/logger');
const { webhookService } = require('../services/webhookService');

// M-Pesa C2B Confirmation
const mpesaC2BConfirmation = async (req, res) => {
  try {
    const { 
      TransactionType, 
      TransID, 
      TransTime, 
      TransAmount, 
      BusinessShortCode, 
      BillRefNumber,
      MSISDN,
      FirstName 
    } = req.body;

    logger.info('M-Pesa C2B Confirmation received:', { TransID, TransAmount, BillRefNumber });

    // Find the transaction
    const transaction = await Transaction.findOne({
      transaction_id: BillRefNumber,
      type: 'collection',
      status: 'pending'
    });

    if (!transaction) {
      logger.warn('Transaction not found for M-Pesa confirmation:', BillRefNumber);
      return res.json({ ResultCode: 0, ResultDesc: 'Success' });
    }

    // Update transaction status
    transaction.status = 'completed';
    transaction.processing.completed_at = new Date();
    transaction.source.payment_details.mpesa_transaction_id = TransID;
    transaction.source.payment_details.mpesa_phone = MSISDN;
    await transaction.save();

    // Credit destination wallet
    if (transaction.destination.wallet_id) {
      const wallet = await Wallet.findOne({ wallet_id: transaction.destination.wallet_id });
      if (wallet) {
        await wallet.addFunds(transaction.net_amount);
      }
    }

    // Send webhook to client
    if (transaction.metadata.webhook_url) {
      try {
        await webhookService.sendTransactionWebhook(transaction, 'collection.completed');
      } catch (webhookError) {
        logger.error('Collection webhook failed:', webhookError);
      }
    }

    logger.logTransaction({
      transaction_id: transaction.transaction_id,
      type: 'collection',
      amount: parseFloat(TransAmount),
      currency: transaction.currency,
      status: 'completed',
      provider: 'mpesa',
      provider_transaction_id: TransID
    });

    res.json({ ResultCode: 0, ResultDesc: 'Success' });

  } catch (error) {
    logger.error('M-Pesa C2B confirmation error:', error);
    res.json({ ResultCode: 1, ResultDesc: 'Failed' });
  }
};

// M-Pesa C2B Validation
const mpesaC2BValidation = async (req, res) => {
  try {
    const { TransID, TransAmount, MSISDN, BillRefNumber } = req.body;

    logger.info('M-Pesa C2B Validation received:', { TransID, TransAmount, BillRefNumber });

    // Validate the transaction exists and amount matches
    const transaction = await Transaction.findOne({
      transaction_id: BillRefNumber,
      type: 'collection',
      status: 'pending'
    });

    if (!transaction) {
      return res.json({ ResultCode: 1, ResultDesc: 'Transaction not found' });
    }

    // Validate amount
    if (parseFloat(TransAmount) !== transaction.amount) {
      return res.json({ ResultCode: 1, ResultDesc: 'Amount mismatch' });
    }

    // Accept the transaction
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  } catch (error) {
    logger.error('M-Pesa C2B validation error:', error);
    res.json({ ResultCode: 1, ResultDesc: 'Validation failed' });
  }
};

// M-Pesa B2C Result
const mpesaB2CResult = async (req, res) => {
  try {
    const { Result } = req.body;
    
    logger.info('M-Pesa B2C Result received:', Result);

    const { 
      ConversationID, 
      TransactionID, 
      ResultCode, 
      ResultDesc,
      OriginatorConversationID,
      ResultParameters 
    } = Result;

    // Find the payout transaction
    const transaction = await Transaction.findOne({
      transaction_id: { $regex: OriginatorConversationID },
      type: 'payout',
      status: { $in: ['pending', 'processing'] }
    });

    if (!transaction) {
      logger.warn('Payout transaction not found for B2C result:', OriginatorConversationID);
      return res.json({ ResultCode: 0, ResultDesc: 'Success' });
    }

    if (ResultCode === 0) {
      // Success
      transaction.status = 'completed';
      transaction.processing.completed_at = new Date();
      transaction.destination.payment_details.mpesa_transaction_id = TransactionID;
      
      logger.info('Payout completed:', { transaction_id: transaction.transaction_id, TransactionID });
    } else {
      // Failed
      transaction.status = 'failed';
      transaction.processing.failed_at = new Date();
      transaction.processing.failure_reason = ResultDesc;
      
      // Refund if source wallet was used
      if (transaction.source.wallet_id) {
        const sourceWallet = await Wallet.findOne({ wallet_id: transaction.source.wallet_id });
        if (sourceWallet) {
          await sourceWallet.addFunds(transaction.amount);
        }
      }
      
      logger.error('Payout failed:', { transaction_id: transaction.transaction_id, ResultDesc });
    }

    await transaction.save();

    // Send webhook
    if (transaction.metadata.webhook_url) {
      try {
        await webhookService.sendTransactionWebhook(transaction, `payout.${transaction.status}`);
      } catch (webhookError) {
        logger.error('Payout webhook failed:', webhookError);
      }
    }

    res.json({ ResultCode: 0, ResultDesc: 'Success' });

  } catch (error) {
    logger.error('M-Pesa B2C result error:', error);
    res.json({ ResultCode: 1, ResultDesc: 'Failed' });
  }
};

// M-Pesa B2C Timeout
const mpesaB2CTimeout = async (req, res) => {
  try {
    const { OriginatorConversationID } = req.body;

    logger.warn('M-Pesa B2C Timeout received:', { OriginatorConversationID });

    // Find and mark transaction as failed
    const transaction = await Transaction.findOne({
      transaction_id: { $regex: OriginatorConversationID },
      type: 'payout',
      status: { $in: ['pending', 'processing'] }
    });

    if (transaction) {
      transaction.status = 'failed';
      transaction.processing.failed_at = new Date();
      transaction.processing.failure_reason = 'B2C timeout';
      await transaction.save();

      // Refund if source wallet was used
      if (transaction.source.wallet_id) {
        const sourceWallet = await Wallet.findOne({ wallet_id: transaction.source.wallet_id });
        if (sourceWallet) {
          await sourceWallet.addFunds(transaction.amount);
        }
      }
    }

    res.json({ ResultCode: 0, ResultDesc: 'Success' });

  } catch (error) {
    logger.error('M-Pesa B2C timeout error:', error);
    res.json({ ResultCode: 1, ResultDesc: 'Failed' });
  }
};

// Stripe Webhook
const stripeWebhook = async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      return res.status(400).json({ error: 'Stripe webhook configuration missing' });
    }

    // Verify webhook signature
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      logger.error('Stripe webhook signature verification failed:', err);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Handle different event types
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handleStripePaymentSuccess(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await handleStripePaymentFailure(event.data.object);
        break;
      default:
        logger.info('Unhandled Stripe event:', event.type);
    }

    res.json({ received: true });

  } catch (error) {
    logger.error('Stripe webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

// Flutterwave Webhook
const flutterwaveWebhook = async (req, res) => {
  try {
    const signature = req.headers['verif-hash'];
    const secretHash = process.env.FLUTTERWAVE_WEBHOOK_HASH;

    if (!signature || signature !== secretHash) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const { event, data } = req.body;

    switch (event) {
      case 'charge.completed':
        await handleFlutterwavePaymentSuccess(data);
        break;
      case 'charge.failed':
        await handleFlutterwavePaymentFailure(data);
        break;
      default:
        logger.info('Unhandled Flutterwave event:', event);
    }

    res.json({ status: 'success' });

  } catch (error) {
    logger.error('Flutterwave webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

// Bank Confirmation
const bankConfirmation = async (req, res) => {
  try {
    const { transaction_id, status, amount, reference } = req.body;

    logger.info('Bank confirmation received:', { transaction_id, status, amount });

    // Find and update transaction
    const transaction = await Transaction.findOne({
      transaction_id,
      status: { $in: ['pending', 'processing'] }
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (status === 'completed') {
      transaction.status = 'completed';
      transaction.processing.completed_at = new Date();
      
      // Credit destination wallet
      if (transaction.destination.wallet_id) {
        const wallet = await Wallet.findOne({ wallet_id: transaction.destination.wallet_id });
        if (wallet) {
          await wallet.addFunds(transaction.net_amount);
        }
      }
    } else {
      transaction.status = 'failed';
      transaction.processing.failed_at = new Date();
      transaction.processing.failure_reason = 'Bank transfer failed';
    }

    await transaction.save();

    res.json({ status: 'success' });

  } catch (error) {
    logger.error('Bank confirmation error:', error);
    res.status(500).json({ error: 'Processing failed' });
  }
};

// Create webhook for user
const createWebhook = async (req, res) => {
  try {
    const { url, events, secret } = req.body;

    // Validate webhook URL (ping test)
    const testResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'test', timestamp: new Date().toISOString() })
    });

    if (!testResponse.ok) {
      return res.status(400).json({
        error: 'Webhook URL validation failed',
        status: testResponse.status
      });
    }

    const webhook_id = `wh_${crypto.randomBytes(16).toString('hex')}`;
    const webhook_secret = secret || crypto.randomBytes(32).toString('hex');

    // Store webhook configuration (in production, save to database)
    const webhookConfig = {
      webhook_id,
      user_id: req.user.userId,
      url,
      events,
      secret: webhook_secret,
      active: true,
      created_at: new Date()
    };

    // For now, store in memory (in production, use database)
    if (!global.webhooks) global.webhooks = {};
    global.webhooks[webhook_id] = webhookConfig;

    logger.info(`Webhook created: ${webhook_id} for user: ${req.user.userId}`);

    res.status(201).json({
      message: 'Webhook created successfully',
      webhook: {
        webhook_id,
        url,
        events,
        secret: webhook_secret,
        active: true,
        created_at: webhookConfig.created_at
      }
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to create webhook'
    });
  }
};

// Get user's webhooks
const getWebhooks = async (req, res) => {
  try {
    // In production, fetch from database
    const userWebhooks = Object.values(global.webhooks || {})
      .filter(webhook => webhook.user_id === req.user.userId)
      .map(webhook => ({
        webhook_id: webhook.webhook_id,
        url: webhook.url,
        events: webhook.events,
        active: webhook.active,
        created_at: webhook.created_at
      }));

    res.json({
      webhooks: userWebhooks
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to fetch webhooks'
    });
  }
};

// Update webhook
const updateWebhook = async (req, res) => {
  try {
    const { webhook_id } = req.params;
    const { url, events, active } = req.body;

    const webhook = global.webhooks?.[webhook_id];
    
    if (!webhook || webhook.user_id !== req.user.userId) {
      return res.status(404).json({
        error: 'Webhook not found'
      });
    }

    // Update webhook
    if (url) webhook.url = url;
    if (events) webhook.events = events;
    if (active !== undefined) webhook.active = active;
    webhook.updated_at = new Date();

    res.json({
      message: 'Webhook updated successfully',
      webhook: {
        webhook_id,
        url: webhook.url,
        events: webhook.events,
        active: webhook.active,
        updated_at: webhook.updated_at
      }
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to update webhook'
    });
  }
};

// Delete webhook
const deleteWebhook = async (req, res) => {
  try {
    const { webhook_id } = req.params;

    const webhook = global.webhooks?.[webhook_id];
    
    if (!webhook || webhook.user_id !== req.user.userId) {
      return res.status(404).json({
        error: 'Webhook not found'
      });
    }

    delete global.webhooks[webhook_id];

    logger.info(`Webhook deleted: ${webhook_id}`);

    res.json({
      message: 'Webhook deleted successfully'
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to delete webhook'
    });
  }
};

// Test webhook
const testWebhook = async (req, res) => {
  try {
    const { webhook_id } = req.params;

    const webhook = global.webhooks?.[webhook_id];
    
    if (!webhook || webhook.user_id !== req.user.userId) {
      return res.status(404).json({
        error: 'Webhook not found'
      });
    }

    // Send test webhook
    const testPayload = {
      type: 'test',
      webhook_id,
      timestamp: new Date().toISOString(),
      user_id: req.user.userId
    };

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    });

    const success = response.ok;

    res.json({
      message: success ? 'Test webhook sent successfully' : 'Test webhook failed',
      success,
      status: response.status,
      payload: testPayload
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to test webhook'
    });
  }
};

// Helper functions for payment providers
async function handleStripePaymentSuccess(paymentIntent) {
  // Handle successful Stripe payment
  logger.info('Stripe payment success:', paymentIntent.id);
}

async function handleStripePaymentFailure(paymentIntent) {
  // Handle failed Stripe payment
  logger.error('Stripe payment failure:', paymentIntent.id);
}

async function handleFlutterwavePaymentSuccess(data) {
  // Handle successful Flutterwave payment
  logger.info('Flutterwave payment success:', data.id);
}

async function handleFlutterwavePaymentFailure(data) {
  // Handle failed Flutterwave payment
  logger.error('Flutterwave payment failure:', data.id);
}

module.exports = {
  mpesaC2BConfirmation,
  mpesaC2BValidation,
  mpesaB2CResult,
  mpesaB2CTimeout,
  stripeWebhook,
  flutterwaveWebhook,
  bankConfirmation,
  createWebhook,
  getWebhooks,
  updateWebhook,
  deleteWebhook,
  testWebhook
};
