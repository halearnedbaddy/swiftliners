const { v4: uuidv4 } = require('uuid');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const logger = require('../utils/logger');
const { processMpesaPayment, processCardPayment, processBankPayment } = require('../services/paymentService');
const { sendWebhook } = require('../services/webhookService');

// Create a new collection
const createCollection = async (req, res) => {
  try {
    const {
      amount,
      currency = 'KES',
      payment_method,
      customer_email,
      customer_phone,
      customer_name,
      description,
      webhook_url,
      reference
    } = req.body;

    const transaction_id = `col_${uuidv4().replace(/-/g, '')}`;

    // Calculate fees (2.5% for collections)
    const processing_fee = amount * 0.025;
    const platform_fee = 0; // No platform fee for collections
    const total_fee = processing_fee + platform_fee;
    const net_amount = amount - total_fee;

    // Create transaction record
    const transaction = new Transaction({
      transaction_id,
      type: 'collection',
      amount,
      currency,
      fees: {
        processing_fee,
        platform_fee,
        total_fee
      },
      net_amount,
      source: {
        payment_method,
        payment_details: {
          phone_number: payment_method === 'mpesa' ? customer_phone : null,
          email: customer_email
        }
      },
      metadata: {
        description,
        reference,
        customer_email,
        customer_name,
        webhook_url,
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      },
      processing: {
        initiated_at: new Date()
      }
    });

    await transaction.save();

    // Process payment based on method
    let paymentResponse;
    try {
      switch (payment_method) {
        case 'mpesa':
          paymentResponse = await processMpesaPayment({
            transaction_id,
            amount,
            phone_number: customer_phone,
            customer_name,
            description: description || `Payment for ${reference || transaction_id}`
          });
          break;
        
        case 'card':
          paymentResponse = await processCardPayment({
            transaction_id,
            amount,
            customer_email,
            customer_name,
            description: description || `Payment for ${reference || transaction_id}`
          });
          break;
        
        case 'bank':
          paymentResponse = await processBankPayment({
            transaction_id,
            amount,
            customer_email,
            customer_name,
            description: description || `Payment for ${reference || transaction_id}`
          });
          break;
        
        default:
          throw new Error('Unsupported payment method');
      }

      // Update transaction with payment response
      transaction.source.payment_details.transaction_ref = paymentResponse.reference;
      transaction.status = paymentResponse.status;
      
      if (paymentResponse.status === 'completed') {
        transaction.processing.completed_at = new Date();
        
        // Create or find user's wallet and credit it
        const wallet = await findOrCreateWallet(req.user.userId, 'user');
        await wallet.addFunds(net_amount);
        
        logger.logTransaction({
          transaction_id,
          type: 'collection',
          amount,
          currency,
          status: 'completed',
          user_id: req.user.userId
        });
      }
      
      await transaction.save();

    } catch (paymentError) {
      // Mark transaction as failed
      transaction.status = 'failed';
      transaction.processing.failed_at = new Date();
      transaction.processing.failure_reason = paymentError.message;
      await transaction.save();

      logger.logApiError(paymentError, req, { transaction_id });
      
      return res.status(400).json({
        error: 'Payment processing failed',
        message: paymentError.message,
        transaction_id
      });
    }

    // Send webhook if provided
    if (webhook_url && transaction.status === 'completed') {
      try {
        await sendWebhook(webhook_url, {
          event: 'collection.completed',
          data: {
            transaction_id,
            amount,
            currency,
            status: transaction.status,
            customer_email,
            customer_name,
            net_amount,
            fees: transaction.fees,
            created_at: transaction.created_at
          }
        });
      } catch (webhookError) {
        logger.error('Webhook delivery failed:', webhookError);
      }
    }

    logger.info(`Collection created: ${transaction_id}`);

    res.status(201).json({
      message: 'Collection initiated successfully',
      transaction: {
        transaction_id,
        type: transaction.type,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
        fees: transaction.fees,
        net_amount: transaction.net_amount,
        customer: {
          email: customer_email,
          name: customer_name,
          phone: customer_phone
        },
        payment_details: paymentResponse,
        created_at: transaction.created_at
      }
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to create collection',
      message: 'Unable to process payment request'
    });
  }
};

// Get collection details
const getCollection = async (req, res) => {
  try {
    const { transaction_id } = req.params;

    const transaction = await Transaction.findOne({ 
      transaction_id,
      type: 'collection',
      'metadata.user_id': req.user.userId 
    });

    if (!transaction) {
      return res.status(404).json({
        error: 'Collection not found',
        message: 'Transaction not found or access denied'
      });
    }

    res.json({
      transaction: {
        transaction_id: transaction.transaction_id,
        type: transaction.type,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
        fees: transaction.fees,
        net_amount: transaction.net_amount,
        source: transaction.source,
        metadata: {
          description: transaction.metadata.description,
          reference: transaction.metadata.reference,
          customer_email: transaction.metadata.customer_email,
          customer_name: transaction.metadata.customer_name
        },
        processing: transaction.processing,
        created_at: transaction.created_at,
        updated_at: transaction.updated_at
      }
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to fetch collection',
      message: 'Unable to retrieve transaction details'
    });
  }
};

// Get all collections for the user
const getCollections = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      from_date, 
      to_date 
    } = req.query;

    const query = { 
      type: 'collection',
      'metadata.user_id': req.user.userId 
    };

    // Add filters
    if (status) {
      query.status = status;
    }
    
    if (from_date || to_date) {
      query.created_at = {};
      if (from_date) query.created_at.$gte = new Date(from_date);
      if (to_date) query.created_at.$lte = new Date(to_date);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('-__v'),
      Transaction.countDocuments(query)
    ]);

    res.json({
      collections: transactions.map(tx => ({
        transaction_id: tx.transaction_id,
        amount: tx.amount,
        currency: tx.currency,
        status: tx.status,
        net_amount: tx.net_amount,
        customer_email: tx.metadata.customer_email,
        customer_name: tx.metadata.customer_name,
        created_at: tx.created_at
      })),
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(total / parseInt(limit)),
        total_records: total,
        has_next: skip + transactions.length < total,
        has_prev: page > 1
      }
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to fetch collections',
      message: 'Unable to retrieve transactions'
    });
  }
};

// Verify collection status
const verifyCollection = async (req, res) => {
  try {
    const { transaction_id } = req.params;

    const transaction = await Transaction.findOne({ 
      transaction_id,
      type: 'collection',
      'metadata.user_id': req.user.userId 
    });

    if (!transaction) {
      return res.status(404).json({
        error: 'Collection not found'
      });
    }

    // Check payment status with payment provider
    let currentStatus = transaction.status;
    try {
      const statusUpdate = await checkPaymentStatus(transaction);
      if (statusUpdate.status !== transaction.status) {
        transaction.status = statusUpdate.status;
        if (statusUpdate.status === 'completed') {
          transaction.processing.completed_at = new Date();
        }
        await transaction.save();
        currentStatus = statusUpdate.status;
      }
    } catch (statusCheckError) {
      logger.error('Payment status check failed:', statusCheckError);
    }

    res.json({
      transaction_id,
      status: currentStatus,
      verified_at: new Date()
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to verify collection',
      message: 'Unable to check payment status'
    });
  }
};

// Cancel collection
const cancelCollection = async (req, res) => {
  try {
    const { transaction_id } = req.params;

    const transaction = await Transaction.findOne({ 
      transaction_id,
      type: 'collection',
      'metadata.user_id': req.user.userId 
    });

    if (!transaction) {
      return res.status(404).json({
        error: 'Collection not found'
      });
    }

    if (transaction.status === 'completed') {
      return res.status(400).json({
        error: 'Cannot cancel completed collection',
        message: 'This transaction has already been completed'
      });
    }

    if (transaction.status === 'cancelled') {
      return res.status(400).json({
        error: 'Collection already cancelled'
      });
    }

    // Cancel with payment provider
    try {
      await cancelPaymentWithProvider(transaction);
    } catch (cancelError) {
      logger.error('Payment cancellation failed:', cancelError);
    }

    transaction.status = 'cancelled';
    await transaction.save();

    logger.info(`Collection cancelled: ${transaction_id}`);

    res.json({
      message: 'Collection cancelled successfully',
      transaction_id,
      status: 'cancelled'
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to cancel collection',
      message: 'Unable to cancel transaction'
    });
  }
};

// Helper function to find or create wallet
const findOrCreateWallet = async (userId, ownerType) => {
  let wallet = await Wallet.findOne({ owner_id: userId, owner_type: ownerType });
  
  if (!wallet) {
    wallet = new Wallet({
      wallet_id: `wallet_${uuidv4().replace(/-/g, '')}`,
      owner_type: ownerType,
      owner_id: userId,
      ownerModel: ownerType === 'user' ? 'User' : 'Business',
      currency: 'KES'
    });
    await wallet.save();
  }
  
  return wallet;
};

module.exports = {
  createCollection,
  getCollection,
  getCollections,
  verifyCollection,
  cancelCollection
};
