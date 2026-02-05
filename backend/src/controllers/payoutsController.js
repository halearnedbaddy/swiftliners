const { v4: uuidv4 } = require('uuid');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const logger = require('../utils/logger');
const { 
  processMpesaPayout, 
  processBankPayout, 
  processWalletPayout 
} = require('../services/payoutService');
const { webhookService } = require('../services/webhookService');

// Payment rail selection function
function selectPaymentRail(destination, amount, currency) {
  if (destination.type === 'wallet') {
    return {
      rail: 'internal',
      fee: 0,
      instant: true
    };
  }
  
  if (destination.type === 'mpesa') {
    if (amount <= 250000) {
      return {
        rail: 'mpesa_b2c',
        fee: amount * 0.015, // 1.5%
        instant: true
      };
    } else {
      return {
        rail: 'mpesa_corporate',
        fee: 100,
        instant: false
      };
    }
  }
  
  if (destination.type === 'bank') {
    if (currency === 'KES' && amount < 999999) {
      return {
        rail: 'pesalink',
        fee: 50,
        instant: true
      };
    } else {
      return {
        rail: 'rtgs',
        fee: 150,
        instant: false
      };
    }
  }
  
  return {
    rail: 'unknown',
    fee: 0,
    instant: false
  };
}

// Create single payout
const createPayout = async (req, res) => {
  try {
    const {
      source_wallet_id,
      destination,
      amount,
      currency = 'KES',
      reference,
      metadata,
      webhook_url
    } = req.body;

    // Validation
    if (!source_wallet_id || !destination || !amount) {
      return res.status(400).json({ 
        error: 'source_wallet_id, destination, and amount required' 
      });
    }
    
    if (!destination.type || !['mpesa', 'bank', 'wallet'].includes(destination.type)) {
      return res.status(400).json({ 
        error: 'Invalid destination type',
        allowed: ['mpesa', 'bank', 'wallet']
      });
    }

    // Get source wallet
    const sourceWallet = await Wallet.findOne({ 
      wallet_id: source_wallet_id,
      owner_id: req.user.userId 
    });
    
    if (!sourceWallet) {
      return res.status(404).json({ error: 'Source wallet not found' });
    }

    // Select payment rail and calculate fees
    const routing = selectPaymentRail(destination, amount, currency);
    const fees = routing.fee;
    const netAmount = amount - fees;
    const totalAmount = amount + fees;

    // Check sufficient balance
    if (!sourceWallet.hasSufficientFunds(totalAmount)) {
      return res.status(400).json({ 
        error: 'Insufficient balance',
        required: totalAmount,
        available: sourceWallet.balances.available
      });
    }

    const payout_id = `payout_${uuidv4().replace(/-/g, '')}`;

    // Create transaction record
    const transaction = new Transaction({
      transaction_id: payout_id,
      type: 'payout',
      amount: totalAmount,
      currency,
      fees: {
        processing_fee: fees,
        platform_fee: 0,
        total_fee: fees
      },
      net_amount: netAmount,
      source: {
        wallet_id: source_wallet_id,
        payment_method: 'wallet'
      },
      destination: {
        payment_method: destination.type,
        payment_details: {
          phone_number: destination.phone,
          bank_account: destination.bank_account,
          wallet_id: destination.wallet_id,
          recipient_name: destination.recipient_name
        }
      },
      metadata: {
        description: `Payout to ${destination.type}`,
        reference,
        webhook_url,
        user_id: req.user.userId,
        rail_used: routing.rail,
        destination_details: destination,
        instant: routing.instant
      },
      processing: {
        initiated_at: new Date()
      },
      status: 'pending'
    });

    await transaction.save();

    // Deduct funds from source wallet
    await sourceWallet.deductFunds(totalAmount);

    // Execute payout based on type
    let providerReference = null;
    let payoutStatus = 'processing';
    
    try {
      switch (destination.type) {
        case 'wallet':
          const walletResult = await processWalletPayout({
            payout_id,
            amount: netAmount,
            wallet_id: destination.wallet_id,
            description: `Internal transfer: ${reference || payout_id}`
          });
          providerReference = walletResult.reference;
          payoutStatus = walletResult.status;
          break;
        
        case 'mpesa':
          const mpesaResult = await processMpesaPayout({
            payout_id,
            amount: netAmount,
            phone_number: destination.phone,
            recipient_name: destination.recipient_name,
            description: `M-Pesa payout: ${reference || payout_id}`
          });
          providerReference = mpesaResult.reference;
          payoutStatus = mpesaResult.status;
          break;
        
        case 'bank':
          const bankResult = await processBankPayout({
            payout_id,
            amount: netAmount,
            bank_account: destination.bank_account,
            recipient_name: destination.recipient_name,
            description: `Bank transfer: ${reference || payout_id}`
          });
          providerReference = bankResult.reference;
          payoutStatus = bankResult.status;
          break;
        
        default:
          throw new Error('Unsupported destination type');
      }

      // Update transaction with provider reference
      transaction.destination.payment_details.provider_reference = providerReference;
      transaction.status = payoutStatus;
      
      if (payoutStatus === 'completed') {
        transaction.processing.completed_at = new Date();
      }
      
      await transaction.save();

    } catch (payoutError) {
      // Mark transaction as failed
      transaction.status = 'failed';
      transaction.processing.failed_at = new Date();
      transaction.processing.failure_reason = payoutError.message;
      await transaction.save();

      // Refund if source wallet was used
      await sourceWallet.addFunds(totalAmount);

      logger.logApiError(payoutError, req, { payout_id });
      
      return res.status(400).json({
        error: 'Payout processing failed',
        message: payoutError.message,
        payout_id
      });
    }

    // Send webhook if provided
    if (webhook_url && transaction.status === 'completed') {
      try {
        await webhookService.sendTransactionWebhook(transaction, 'payout.completed');
      } catch (webhookError) {
        logger.error('Payout webhook failed:', webhookError);
      }
    }

    logger.info(`Payout created: ${payout_id}, status: ${payoutStatus}`);

    res.status(201).json({
      success: true,
      payout_id: transaction.transaction_id,
      status: payoutStatus,
      amount: amount,
      fees: fees,
      net_amount: netAmount,
      total_amount: totalAmount,
      destination: destination,
      provider_reference: providerReference,
      rail_used: routing.rail,
      instant: routing.instant,
      estimated_arrival: routing.instant ? new Date() : new Date(Date.now() + 3600000),
      created_at: transaction.created_at
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to create payout'
    });
  }
};

// Create bulk payouts
const createBulkPayouts = async (req, res) => {
  try {
    const { payouts } = req.body;

    if (payouts.length > 100) {
      return res.status(400).json({
        error: 'Maximum 100 payouts allowed per bulk request'
      });
    }

    const bulk_id = 'bulk_' + uuidv4().replace(/-/g, '');
    const results = [];
    let total_amount = 0;
    let total_fees = 0;

    // Process each payout
    for (let i = 0; i < payouts.length; i++) {
      const payoutData = payouts[i];
      
      try {
        // Create individual payout
        const payoutResponse = await createPayoutInternal({
          ...payoutData,
          bulk_id,
          user_id: req.user.userId,
          index: i
        });
        
        results.push({
          index: i,
          success: true,
          payout_id: payoutResponse.payout_id,
          status: payoutResponse.status
        });
        
        total_amount += payoutResponse.total_amount;
        total_fees += payoutResponse.fees.total_fee;
        
      } catch (error) {
        results.push({
          index: i,
          success: false,
          error: error.message
        });
      }
    }

    const successful_count = results.filter(r => r.success).length;
    const failed_count = results.length - successful_count;

    logger.info(`Bulk payout processed: ${bulk_id}, successful: ${successful_count}, failed: ${failed_count}`);

    res.status(201).json({
      message: 'Bulk payout processed',
      bulk_id,
      summary: {
        total_payouts: payouts.length,
        successful_count,
        failed_count,
        total_amount,
        total_fees
      },
      results
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to process bulk payouts'
    });
  }
};

// Internal function to create individual payout (used by bulk payouts)
const createPayoutInternal = async (payoutData) => {
  const {
    amount,
    currency = 'KES',
    payment_method,
    recipient_name,
    recipient_phone,
    recipient_bank_account,
    recipient_wallet_id,
    description,
    reference,
    webhook_url,
    source_wallet_id,
    bulk_id,
    user_id,
    index
  } = payoutData;

  const payout_id = bulk_id + '_' + index + '_' + uuidv4().replace(/-/g, '').substring(0, 8);

  // Calculate fees
  const processing_fee = amount * 0.015;
  const platform_fee = 0;
  const total_fee = processing_fee + platform_fee;
  const total_amount = amount + total_fee;
  const net_amount = amount;

  // Create transaction
  const transaction = new Transaction({
    transaction_id: payout_id,
    type: 'payout',
    amount: total_amount,
    currency,
    fees: {
      processing_fee,
      platform_fee,
      total_fee
    },
    net_amount,
    source: source_wallet_id ? {
      wallet_id: source_wallet_id,
      payment_method: 'wallet'
    } : {
      payment_method: 'external'
    },
    destination: {
      payment_method,
      payment_details: {
        recipient_name,
        phone_number: recipient_phone,
        bank_account: recipient_bank_account,
        wallet_id: recipient_wallet_id
      }
    },
    metadata: {
      description,
      reference,
      webhook_url,
      user_id,
      bulk_id,
      recipient_name,
      recipient_phone,
      recipient_bank_account,
      recipient_wallet_id
    },
    processing: {
      initiated_at: new Date()
    },
    status: 'pending'
  });

  await transaction.save();

  // Process payout (simplified for bulk processing)
  let status = 'processing';
  try {
    // Add payout processing logic here
    status = 'processing'; // Default to processing for bulk
  } catch (error) {
    status = 'failed';
    transaction.processing.failure_reason = error.message;
  }

  transaction.status = status;
  await transaction.save();

  return {
    payout_id: transaction.transaction_id,
    status,
    total_amount: transaction.amount,
    fees: transaction.fees
  };
};

// Get payout details
const getPayout = async (req, res) => {
  try {
    const { payout_id } = req.params;

    const transaction = await Transaction.findOne({ 
      transaction_id: payout_id,
      type: 'payout',
      'metadata.user_id': req.user.userId 
    });

    if (!transaction) {
      return res.status(404).json({
        error: 'Payout not found'
      });
    }

    res.json({
      payout: {
        payout_id: transaction.transaction_id,
        type: transaction.type,
        amount: transaction.amount,
        currency: transaction.currency,
        fees: transaction.fees,
        net_amount: transaction.net_amount,
        status: transaction.status,
        source: transaction.source,
        destination: transaction.destination,
        metadata: {
          description: transaction.metadata.description,
          reference: transaction.metadata.reference,
          recipient_name: transaction.metadata.recipient_name,
          recipient_phone: transaction.metadata.recipient_phone || null,
          recipient_bank_account: transaction.metadata.recipient_bank_account || null,
          recipient_wallet_id: transaction.metadata.recipient_wallet_id || null
        },
        processing: transaction.processing,
        created_at: transaction.created_at,
        updated_at: transaction.updated_at
      }
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to fetch payout'
    });
  }
};

// Get user's payouts
const getPayouts = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      payment_method, 
      from_date, 
      to_date 
    } = req.query;

    const query = { 
      type: 'payout',
      'metadata.user_id': req.user.userId 
    };

    // Add filters
    if (status) query.status = status;
    if (payment_method) query['destination.payment_method'] = payment_method;
    
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
      payouts: transactions.map(tx => ({
        payout_id: tx.transaction_id,
        amount: tx.amount,
        currency: tx.currency,
        status: tx.status,
        net_amount: tx.net_amount,
        payment_method: tx.destination.payment_method,
        recipient_name: tx.metadata.recipient_name,
        recipient_phone: tx.metadata.recipient_phone,
        fees: tx.fees,
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
      error: 'Failed to fetch payouts'
    });
  }
};

// Retry failed payout
const retryPayout = async (req, res) => {
  try {
    const { payout_id } = req.params;

    const transaction = await Transaction.findOne({ 
      transaction_id: payout_id,
      type: 'payout',
      'metadata.user_id': req.user.userId 
    });

    if (!transaction) {
      return res.status(404).json({
        error: 'Payout not found'
      });
    }

    if (transaction.status !== 'failed') {
      return res.status(400).json({
        error: 'Only failed payouts can be retried',
        current_status: transaction.status
      });
    }

    // Check retry limit
    if (transaction.processing.retry_count >= 3) {
      return res.status(400).json({
        error: 'Maximum retry attempts exceeded'
      });
    }

    // Schedule retry
    await transaction.scheduleRetry();

    logger.info(`Payout retry scheduled: ${payout_id}, attempt: ${transaction.processing.retry_count}`);

    res.json({
      message: 'Payout retry scheduled',
      payout_id,
      retry_count: transaction.processing.retry_count,
      next_retry_at: transaction.processing.next_retry_at
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to retry payout'
    });
  }
};

// Cancel payout
const cancelPayout = async (req, res) => {
  try {
    const { payout_id } = req.params;

    const transaction = await Transaction.findOne({ 
      transaction_id: payout_id,
      type: 'payout',
      'metadata.user_id': req.user.userId 
    });

    if (!transaction) {
      return res.status(404).json({
        error: 'Payout not found'
      });
    }

    if (!['pending', 'processing'].includes(transaction.status)) {
      return res.status(400).json({
        error: 'Payout cannot be cancelled',
        current_status: transaction.status
      });
    }

    // Cancel payout
    transaction.status = 'cancelled';
    await transaction.save();

    // Refund if source wallet was used
    if (transaction.source.wallet_id) {
      const sourceWallet = await Wallet.findOne({ wallet_id: transaction.source.wallet_id });
      if (sourceWallet) {
        await sourceWallet.addFunds(transaction.amount);
      }
    }

    logger.info(`Payout cancelled: ${payout_id}`);

    res.json({
      message: 'Payout cancelled successfully',
      payout_id,
      status: 'cancelled'
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to cancel payout'
    });
  }
};

// Get payout status by reference
const getPayoutStatus = async (req, res) => {
  try {
    const { reference } = req.params;

    const transaction = await Transaction.findOne({ 
      'metadata.reference': reference,
      type: 'payout',
      'metadata.user_id': req.user.userId 
    });

    if (!transaction) {
      return res.status(404).json({
        error: 'Payout not found for this reference'
      });
    }

    res.json({
      reference,
      payout_id: transaction.transaction_id,
      status: transaction.status,
      amount: transaction.amount,
      currency: transaction.currency,
      created_at: transaction.created_at,
      updated_at: transaction.updated_at
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to fetch payout status'
    });
  }
};

module.exports = {
  createPayout,
  createBulkPayouts,
  getPayout,
  getPayouts,
  retryPayout,
  cancelPayout,
  getPayoutStatus
};
