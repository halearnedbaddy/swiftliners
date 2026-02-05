const { v4: uuidv4 } = require('uuid');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');
const { processMpesaPayment } = require('../services/paymentService');
const { webhookService } = require('../services/webhookService');

// Create wallet
const createWallet = async (req, res) => {
  try {
    const {
      currency = 'KES',
      wallet_type = 'business',
      description
    } = req.body;

    const wallet_id = `wal_${uuidv4().replace(/-/g, '')}`;

    // Check if user already has a wallet of this type/currency
    const existingWallet = await Wallet.findOne({
      owner_id: req.user.userId,
      currency,
      wallet_type
    });

    if (existingWallet) {
      return res.status(400).json({
        error: 'Wallet already exists',
        wallet_id: existingWallet.wallet_id
      });
    }

    // Create wallet
    const wallet = new Wallet({
      wallet_id,
      owner_id: req.user.userId,
      currency,
      wallet_type,
      balances: {
        available: 0,
        locked: 0,
        total: 0
      },
      metadata: {
        description,
        created_by: 'user'
      }
    });

    await wallet.save();

    logger.info(`Wallet created: ${wallet_id}`);

    res.status(201).json({
      message: 'Wallet created successfully',
      wallet: {
        wallet_id: wallet.wallet_id,
        currency: wallet.currency,
        wallet_type: wallet.wallet_type,
        balances: wallet.balances,
        status: wallet.status,
        created_at: wallet.created_at
      }
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to create wallet'
    });
  }
};

// Get user's wallets
const getWallets = async (req, res) => {
  try {
    const { page = 1, limit = 20, currency, wallet_type } = req.query;

    const query = { owner_id: req.user.userId };
    
    if (currency) query.currency = currency;
    if (wallet_type) query.wallet_type = wallet_type;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [wallets, total] = await Promise.all([
      Wallet.find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('-__v'),
      Wallet.countDocuments(query)
    ]);

    res.json({
      wallets: wallets.map(wallet => ({
        wallet_id: wallet.wallet_id,
        currency: wallet.currency,
        wallet_type: wallet.wallet_type,
        balances: wallet.balances,
        status: wallet.status,
        metadata: wallet.metadata,
        created_at: wallet.created_at,
        updated_at: wallet.updated_at
      })),
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(total / parseInt(limit)),
        total_records: total,
        has_next: skip + wallets.length < total,
        has_prev: page > 1
      }
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to fetch wallets'
    });
  }
};

// Get specific wallet
const getWallet = async (req, res) => {
  try {
    const { wallet_id } = req.params;

    const wallet = await Wallet.findOne({
      wallet_id,
      owner_id: req.user.userId
    });

    if (!wallet) {
      return res.status(404).json({
        error: 'Wallet not found'
      });
    }

    res.json({
      wallet: {
        wallet_id: wallet.wallet_id,
        currency: wallet.currency,
        wallet_type: wallet.wallet_type,
        balances: wallet.balances,
        status: wallet.status,
        metadata: wallet.metadata,
        created_at: wallet.created_at,
        updated_at: wallet.updated_at
      }
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to fetch wallet'
    });
  }
};

// Get wallet balance
const getWalletBalance = async (req, res) => {
  try {
    const { wallet_id } = req.params;

    const wallet = await Wallet.findOne({
      wallet_id,
      owner_id: req.user.userId
    });

    if (!wallet) {
      return res.status(404).json({
        error: 'Wallet not found'
      });
    }

    res.json({
      wallet_id: wallet.wallet_id,
      currency: wallet.currency,
      balances: wallet.balances,
      last_updated: wallet.updated_at
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to fetch wallet balance'
    });
  }
};

// Fund wallet
const fundWallet = async (req, res) => {
  try {
    const { wallet_id } = req.params;
    const {
      amount,
      currency = 'KES',
      payment_method,
      reference,
      webhook_url
    } = req.body;

    const wallet = await Wallet.findOne({
      wallet_id,
      owner_id: req.user.userId
    });

    if (!wallet) {
      return res.status(404).json({
        error: 'Wallet not found'
      });
    }

    if (wallet.currency !== currency) {
      return res.status(400).json({
        error: 'Currency mismatch',
        wallet_currency: wallet.currency,
        requested_currency: currency
      });
    }

    // Calculate fees (1.5% for funding)
    const processing_fee = amount * 0.015;
    const platform_fee = 0;
    const total_fee = processing_fee + platform_fee;
    const total_amount = amount + total_fee;
    const net_amount = amount;

    // Create funding transaction
    const transaction = new Transaction({
      transaction_id: `fund_${uuidv4().replace(/-/g, '')}`,
      type: 'wallet_funding',
      amount: total_amount,
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
          reference
        }
      },
      destination: {
        wallet_id,
        payment_method: 'wallet'
      },
      metadata: {
        description: `Wallet funding: ${wallet_id}`,
        reference,
        webhook_url,
        user_id: req.user.userId
      },
      processing: {
        initiated_at: new Date()
      },
      status: 'pending'
    });

    await transaction.save();

    // Process payment based on method
    let paymentResponse;
    try {
      switch (payment_method) {
        case 'mpesa':
          paymentResponse = await processMpesaPayment({
            amount: total_amount,
            phone_number: req.body.phone_number,
            reference: transaction.transaction_id,
            description: `Fund wallet ${wallet_id}`
          });
          break;
        
        case 'card':
          // Process card payment (mock)
          paymentResponse = { status: 'completed', reference: transaction.transaction_id };
          break;
        
        case 'bank':
          // Process bank transfer (mock)
          paymentResponse = { status: 'pending', reference: transaction.transaction_id };
          break;
        
        default:
          throw new Error('Unsupported payment method');
      }

      // Update transaction status
      if (paymentResponse.status === 'completed') {
        transaction.status = 'completed';
        transaction.processing.completed_at = new Date();
        
        // Add funds to wallet
        await wallet.addFunds(net_amount);
        
        logger.logTransaction({
          transaction_id: transaction.transaction_id,
          type: 'wallet_funding',
          amount,
          currency,
          status: 'completed',
          user_id: req.user.userId
        });
      } else {
        transaction.status = 'processing';
      }
      
      await transaction.save();

    } catch (paymentError) {
      transaction.status = 'failed';
      transaction.processing.failed_at = new Date();
      transaction.processing.failure_reason = paymentError.message;
      await transaction.save();

      logger.logApiError(paymentError, req, { transaction_id: transaction.transaction_id });
      
      return res.status(400).json({
        error: 'Payment processing failed',
        message: paymentError.message,
        transaction_id: transaction.transaction_id
      });
    }

    // Send webhook if provided
    if (webhook_url && transaction.status === 'completed') {
      try {
        await webhookService.sendWalletWebhook(wallet, 'funded', {
          transaction_id: transaction.transaction_id,
          amount: net_amount
        });
      } catch (webhookError) {
        logger.error('Wallet funding webhook failed:', webhookError);
      }
    }

    logger.info(`Wallet funded: ${wallet_id}, amount: ${net_amount}`);

    res.status(201).json({
      message: 'Wallet funding initiated',
      transaction: {
        transaction_id: transaction.transaction_id,
        amount: amount,
        currency: transaction.currency,
        fees: transaction.fees,
        total_amount: transaction.amount,
        net_amount: transaction.net_amount,
        status: transaction.status,
        payment_method,
        wallet_id,
        payment_details: paymentResponse,
        created_at: transaction.created_at
      }
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to fund wallet'
    });
  }
};

// Withdraw from wallet
const withdrawFromWallet = async (req, res) => {
  try {
    const { wallet_id } = req.params;
    const {
      amount,
      payment_method,
      recipient_details,
      description,
      reference
    } = req.body;

    const wallet = await Wallet.findOne({
      wallet_id,
      owner_id: req.user.userId
    });

    if (!wallet) {
      return res.status(404).json({
        error: 'Wallet not found'
      });
    }

    // Check sufficient balance
    if (!wallet.hasSufficientFunds(amount)) {
      return res.status(400).json({
        error: 'Insufficient balance',
        available_balance: wallet.balances.available,
        requested_amount: amount
      });
    }

    // Calculate fees (1.5% for withdrawal)
    const processing_fee = amount * 0.015;
    const platform_fee = 0;
    const total_fee = processing_fee + platform_fee;
    const total_amount = amount + total_fee;
    const net_amount = amount;

    // Create withdrawal transaction
    const transaction = new Transaction({
      transaction_id: `withdraw_${uuidv4().replace(/-/g, '')}`,
      type: 'wallet_withdrawal',
      amount: total_amount,
      currency: wallet.currency,
      fees: {
        processing_fee,
        platform_fee,
        total_fee
      },
      net_amount,
      source: {
        wallet_id,
        payment_method: 'wallet'
      },
      destination: {
        payment_method,
        payment_details: recipient_details
      },
      metadata: {
        description: description || `Withdrawal from ${wallet_id}`,
        reference,
        user_id: req.user.userId
      },
      processing: {
        initiated_at: new Date()
      },
      status: 'pending'
    });

    await transaction.save();

    // Deduct funds from wallet
    await wallet.deductFunds(total_amount);

    // Process withdrawal (mock for now)
    const withdrawalResponse = {
      status: 'processing',
      reference: transaction.transaction_id,
      estimated_completion: '2-5 business days'
    };

    // Update transaction
    transaction.status = 'processing';
    await transaction.save();

    logger.info(`Wallet withdrawal: ${wallet_id}, amount: ${net_amount}`);

    res.status(201).json({
      message: 'Withdrawal initiated',
      transaction: {
        transaction_id: transaction.transaction_id,
        amount: amount,
        currency: transaction.currency,
        fees: transaction.fees,
        total_amount: transaction.amount,
        net_amount: transaction.net_amount,
        status: transaction.status,
        payment_method,
        wallet_id,
        withdrawal_details: withdrawalResponse,
        created_at: transaction.created_at
      }
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to process withdrawal'
    });
  }
};

// Transfer funds between wallets
const transferFunds = async (req, res) => {
  try {
    const {
      amount,
      recipient_wallet_id,
      currency,
      description
    } = req.body;

    // Get source wallet (user's wallet)
    const sourceWallet = await Wallet.findOne({
      owner_id: req.user.userId,
      currency: currency || 'KES'
    });

    if (!sourceWallet) {
      return res.status(404).json({
        error: 'Source wallet not found'
      });
    }

    // Get recipient wallet
    const recipientWallet = await Wallet.findOne({
      wallet_id: recipient_wallet_id
    });

    if (!recipientWallet) {
      return res.status(404).json({
        error: 'Recipient wallet not found'
      });
    }

    if (sourceWallet.currency !== recipientWallet.currency) {
      return res.status(400).json({
        error: 'Currency mismatch between wallets'
      });
    }

    // Check sufficient balance
    if (!sourceWallet.hasSufficientFunds(amount)) {
      return res.status(400).json({
        error: 'Insufficient balance',
        available_balance: sourceWallet.balances.available,
        requested_amount: amount
      });
    }

    // Calculate transfer fee (0.5% for internal transfers)
    const transfer_fee = amount * 0.005;
    const total_amount = amount + transfer_fee;
    const net_amount = amount;

    // Create transfer transaction
    const transaction = new Transaction({
      transaction_id: `transfer_${uuidv4().replace(/-/g, '')}`,
      type: 'wallet_transfer',
      amount: total_amount,
      currency: sourceWallet.currency,
      fees: {
        processing_fee: 0,
        platform_fee: transfer_fee,
        total_fee: transfer_fee
      },
      net_amount,
      source: {
        wallet_id: sourceWallet.wallet_id,
        payment_method: 'wallet'
      },
      destination: {
        wallet_id: recipient_wallet_id,
        payment_method: 'wallet'
      },
      metadata: {
        description: description || `Transfer to ${recipient_wallet_id}`,
        user_id: req.user.userId,
        recipient_wallet_id
      },
      processing: {
        initiated_at: new Date(),
        completed_at: new Date()
      },
      status: 'completed'
    });

    await transaction.save();

    // Process transfer
    await sourceWallet.deductFunds(total_amount);
    await recipientWallet.addFunds(net_amount);

    logger.logTransaction({
      transaction_id: transaction.transaction_id,
      type: 'wallet_transfer',
      amount,
      currency: sourceWallet.currency,
      status: 'completed',
      user_id: req.user.userId
    });

    // Send webhooks
    try {
      await webhookService.sendWalletWebhook(sourceWallet, 'debit', {
        transaction_id: transaction.transaction_id,
        amount: total_amount
      });
      
      await webhookService.sendWalletWebhook(recipientWallet, 'credit', {
        transaction_id: transaction.transaction_id,
        amount: net_amount
      });
    } catch (webhookError) {
      logger.error('Transfer webhook failed:', webhookError);
    }

    logger.info(`Wallet transfer: ${sourceWallet.wallet_id} → ${recipient_wallet_id}, amount: ${net_amount}`);

    res.status(201).json({
      message: 'Transfer completed successfully',
      transaction: {
        transaction_id: transaction.transaction_id,
        amount: amount,
        currency: transaction.currency,
        fees: transaction.fees,
        total_amount: transaction.amount,
        net_amount: transaction.net_amount,
        status: transaction.status,
        source_wallet_id: sourceWallet.wallet_id,
        recipient_wallet_id: recipient_wallet_id,
        created_at: transaction.created_at
      }
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to process transfer'
    });
  }
};

// Get wallet transactions
const getWalletTransactions = async (req, res) => {
  try {
    const { wallet_id } = req.params;
    const { 
      page = 1, 
      limit = 20, 
      type, 
      status, 
      from_date, 
      to_date 
    } = req.query;

    // Verify wallet ownership
    const wallet = await Wallet.findOne({
      wallet_id,
      owner_id: req.user.userId
    });

    if (!wallet) {
      return res.status(404).json({
        error: 'Wallet not found'
      });
    }

    const query = {
      $or: [
        { 'source.wallet_id': wallet_id },
        { 'destination.wallet_id': wallet_id }
      ]
    };

    // Add filters
    if (type) query.type = type;
    if (status) query.status = status;
    
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
      wallet_id,
      transactions: transactions.map(tx => ({
        transaction_id: tx.transaction_id,
        type: tx.type,
        amount: tx.amount,
        currency: tx.currency,
        net_amount: tx.net_amount,
        status: tx.status,
        fees: tx.fees,
        source: tx.source,
        destination: tx.destination,
        created_at: tx.created_at,
        direction: tx.source.wallet_id === wallet_id ? 'outgoing' : 'incoming'
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
      error: 'Failed to fetch wallet transactions'
    });
  }
};

// Get specific transaction
const getTransaction = async (req, res) => {
  try {
    const { wallet_id, transaction_id } = req.params;

    // Verify wallet ownership
    const wallet = await Wallet.findOne({
      wallet_id,
      owner_id: req.user.userId
    });

    if (!wallet) {
      return res.status(404).json({
        error: 'Wallet not found'
      });
    }

    const transaction = await Transaction.findOne({
      transaction_id,
      $or: [
        { 'source.wallet_id': wallet_id },
        { 'destination.wallet_id': wallet_id }
      ]
    });

    if (!transaction) {
      return res.status(404).json({
        error: 'Transaction not found'
      });
    }

    res.json({
      transaction: {
        transaction_id: transaction.transaction_id,
        type: transaction.type,
        amount: transaction.amount,
        currency: transaction.currency,
        net_amount: transaction.net_amount,
        status: transaction.status,
        fees: transaction.fees,
        source: transaction.source,
        destination: transaction.destination,
        metadata: transaction.metadata,
        processing: transaction.processing,
        created_at: transaction.created_at,
        updated_at: transaction.updated_at,
        direction: transaction.source.wallet_id === wallet_id ? 'outgoing' : 'incoming'
      }
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to fetch transaction'
    });
  }
};

module.exports = {
  createWallet,
  getWallets,
  getWallet,
  getWalletBalance,
  fundWallet,
  withdrawFromWallet,
  transferFunds,
  getWalletTransactions,
  getTransaction
};
