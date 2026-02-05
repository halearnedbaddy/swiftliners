const { v4: uuidv4 } = require('uuid');
const Escrow = require('../models/Escrow');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const logger = require('../utils/logger');
const { webhookService } = require('../services/webhookService');

// Create escrow
const createEscrow = async (req, res) => {
  try {
    const {
      amount,
      currency = 'KES',
      payer_wallet_id,
      payee_wallet_id,
      conditions,
      description,
      auto_release_date,
      reference,
      webhook_url
    } = req.body;

    const escrow_id = `esc_${uuidv4().replace(/-/g, '')}`;

    // Validate wallets exist
    const [payerWallet, payeeWallet] = await Promise.all([
      Wallet.findOne({ wallet_id: payer_wallet_id }),
      Wallet.findOne({ wallet_id: payee_wallet_id })
    ]);

    if (!payerWallet || !payeeWallet) {
      return res.status(404).json({
        error: 'One or both wallets not found'
      });
    }

    // Check if payer has sufficient funds
    if (!payerWallet.hasSufficientFunds(amount)) {
      return res.status(400).json({
        error: 'Insufficient funds in payer wallet',
        available_balance: payerWallet.balances.available,
        required_amount: amount
      });
    }

    // Calculate fees (2% for escrow)
    const escrow_fee = amount * 0.02;
    const processing_fee = 0;
    const total_fee = escrow_fee + processing_fee;

    // Create transaction record
    const transaction = new Transaction({
      transaction_id: `txn_${uuidv4().replace(/-/g, '')}`,
      type: 'escrow_hold',
      amount,
      currency,
      fees: {
        processing_fee,
        platform_fee: escrow_fee,
        total_fee
      },
      net_amount: amount - total_fee,
      source: {
        wallet_id: payer_wallet_id,
        payment_method: 'wallet'
      },
      destination: {
        wallet_id: escrow_id, // Escrow acts as destination
        payment_method: 'escrow'
      },
      escrow_details: {
        escrow_id,
        release_conditions: conditions.map(c => c.description),
        parties: {
          payer: payerWallet.owner_id,
          payee: payeeWallet.owner_id
        }
      },
      metadata: {
        description,
        reference,
        webhook_url,
        user_id: req.user.userId
      },
      processing: {
        initiated_at: new Date()
      }
    });

    await transaction.save();

    // Lock funds in payer wallet
    await payerWallet.lockFunds(amount);

    // Create escrow record
    const escrow = new Escrow({
      escrow_id,
      transaction_id: transaction.transaction_id,
      amount,
      currency,
      parties: {
        payer: {
          user_id: payerWallet.owner_id,
          wallet_id: payer_wallet_id,
          name: 'Payer', // Would be populated from user data
          email: 'payer@example.com' // Would be populated from user data
        },
        payee: {
          user_id: payeeWallet.owner_id,
          wallet_id: payee_wallet_id,
          name: 'Payee', // Would be populated from user data
          email: 'payee@example.com' // Would be populated from user data
        }
      },
      conditions: conditions.map(condition => ({
        type: condition.type,
        description: condition.description,
        fulfilled: false
      })),
      release_settings: {
        auto_release: !!auto_release_date,
        auto_release_date: auto_release_date ? new Date(auto_release_date) : null,
        require_all_conditions: true
      },
      fees: {
        escrow_fee,
        processing_fee,
        total_fee
      },
      metadata: {
        description,
        reference,
        webhook_url
      }
    });

    await escrow.save();

    // Update transaction status
    transaction.status = 'completed';
    transaction.processing.completed_at = new Date();
    await transaction.save();

    // Fund and activate escrow
    await escrow.fund();
    await escrow.activate();

    // Send webhook notification
    if (webhook_url) {
      try {
        await webhookService.sendEscrowWebhook(escrow, 'created');
      } catch (webhookError) {
        logger.error('Escrow webhook failed:', webhookError);
      }
    }

    logger.info(`Escrow created: ${escrow_id}`);

    res.status(201).json({
      message: 'Escrow created successfully',
      escrow: {
        escrow_id: escrow.escrow_id,
        transaction_id: escrow.transaction_id,
        amount: escrow.amount,
        currency: escrow.currency,
        status: escrow.status,
        parties: escrow.parties,
        conditions: escrow.conditions,
        fees: escrow.fees,
        timeline: escrow.timeline,
        created_at: escrow.created_at
      }
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to create escrow'
    });
  }
};

// Get escrow details
const getEscrow = async (req, res) => {
  try {
    const { escrow_id } = req.params;

    const escrow = await Escrow.findOne({ escrow_id });
    if (!escrow) {
      return res.status(404).json({
        error: 'Escrow not found'
      });
    }

    // Check if user is party to this escrow
    const userWallets = await Wallet.find({ owner_id: req.user.userId });
    const userWalletIds = userWallets.map(w => w.wallet_id);
    
    const isParty = userWalletIds.includes(escrow.parties.payer.wallet_id) || 
                   userWalletIds.includes(escrow.parties.payee.wallet_id);

    if (!isParty) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You are not a party to this escrow'
      });
    }

    res.json({
      escrow: {
        escrow_id: escrow.escrow_id,
        transaction_id: escrow.transaction_id,
        amount: escrow.amount,
        currency: escrow.currency,
        status: escrow.status,
        parties: escrow.parties,
        conditions: escrow.conditions,
        timeline: escrow.timeline,
        fees: escrow.fees,
        disputes: escrow.disputes,
        metadata: escrow.metadata,
        created_at: escrow.created_at,
        updated_at: escrow.updated_at
      }
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to fetch escrow'
    });
  }
};

// Get user's escrows
const getEscrows = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    // Get user's wallets
    const userWallets = await Wallet.find({ owner_id: req.user.userId });
    const userWalletIds = userWallets.map(w => w.wallet_id);

    const query = {
      $or: [
        { 'parties.payer.wallet_id': { $in: userWalletIds } },
        { 'parties.payee.wallet_id': { $in: userWalletIds } }
      ]
    };

    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [escrows, total] = await Promise.all([
      Escrow.find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Escrow.countDocuments(query)
    ]);

    res.json({
      escrows: escrows.map(escrow => ({
        escrow_id: escrow.escrow_id,
        amount: escrow.amount,
        currency: escrow.currency,
        status: escrow.status,
        parties: escrow.parties,
        conditions: escrow.conditions,
        timeline: escrow.timeline,
        created_at: escrow.created_at
      })),
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(total / parseInt(limit)),
        total_records: total
      }
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to fetch escrows'
    });
  }
};

// Fulfill escrow condition
const fulfillCondition = async (req, res) => {
  try {
    const { escrow_id, condition_id } = req.params;
    const { fulfilled_by, evidence } = req.body;

    const escrow = await Escrow.findOne({ escrow_id });
    if (!escrow) {
      return res.status(404).json({
        error: 'Escrow not found'
      });
    }

    // Check if user is payee (typically the one who fulfills conditions)
    const userWallets = await Wallet.find({ owner_id: req.user.userId });
    const userWalletIds = userWallets.map(w => w.wallet_id);
    
    const isPayee = userWalletIds.includes(escrow.parties.payee.wallet_id);
    if (!isPayee) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only the payee can fulfill conditions'
      });
    }

    if (escrow.status !== 'active') {
      return res.status(400).json({
        error: 'Escrow is not active',
        status: escrow.status
      });
    }

    // Fulfill the condition
    await escrow.fulfillCondition(condition_id, fulfilled_by);

    // Add evidence if provided
    if (evidence && Array.isArray(evidence)) {
      const condition = escrow.conditions.id(condition_id);
      if (condition) {
        evidence.forEach(item => {
          condition.evidence.push({
            type: item.type,
            url: item.url,
            uploaded_by: fulfilled_by,
            uploaded_at: new Date()
          });
        });
        await escrow.save();
      }
    }

    logger.info(`Condition fulfilled: ${escrow_id}, condition: ${condition_id}`);

    res.json({
      message: 'Condition fulfilled successfully',
      escrow_id: escrow.escrow_id,
      condition_id: condition_id,
      status: escrow.status,
      all_conditions_fulfilled: escrow.allConditionsFulfilled
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to fulfill condition'
    });
  }
};

// Release escrow funds
const releaseEscrow = async (req, res) => {
  try {
    const { escrow_id } = req.params;

    const escrow = await Escrow.findOne({ escrow_id });
    if (!escrow) {
      return res.status(404).json({
        error: 'Escrow not found'
      });
    }

    // Check if user is payer (typically the one who releases funds)
    const userWallets = await Wallet.find({ owner_id: req.user.userId });
    const userWalletIds = userWallets.map(w => w.wallet_id);
    
    const isPayer = userWalletIds.includes(escrow.parties.payer.wallet_id);
    if (!isPayer) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only the payer can release funds'
      });
    }

    if (escrow.status !== 'active') {
      return res.status(400).json({
        error: 'Escrow is not active',
        status: escrow.status
      });
    }

    // Check if all conditions are fulfilled
    if (!escrow.allConditionsFulfilled && escrow.release_settings.require_all_conditions) {
      return res.status(400).json({
        error: 'Not all conditions fulfilled',
        pending_conditions: escrow.conditions.filter(c => !c.fulfilled).length
      });
    }

    // Get payee wallet
    const payeeWallet = await Wallet.findOne({ wallet_id: escrow.parties.payee.wallet_id });
    if (!payeeWallet) {
      return res.status(404).json({
        error: 'Payee wallet not found'
      });
    }

    // Get the original transaction
    const transaction = await Transaction.findOne({ transaction_id: escrow.transaction_id });
    if (!transaction) {
      return res.status(404).json({
        error: 'Original transaction not found'
      });
    }

    // Get payer wallet to unlock funds
    const payerWallet = await Wallet.findOne({ wallet_id: escrow.parties.payer.wallet_id });
    if (!payerWallet) {
      return res.status(404).json({
        error: 'Payer wallet not found'
      });
    }

    // Release funds from escrow
    await escrow.release();

    // Unlock funds from payer wallet and transfer to payee
    await payerWallet.unlockFunds(escrow.amount);
    await payerWallet.deductFunds(escrow.amount);
    await payeeWallet.addFunds(transaction.net_amount);

    // Create release transaction
    const releaseTransaction = new Transaction({
      transaction_id: `rel_${uuidv4().replace(/-/g, '')}`,
      type: 'escrow_release',
      amount: escrow.amount,
      currency: escrow.currency,
      fees: escrow.fees,
      net_amount: transaction.net_amount,
      source: {
        wallet_id: escrow.parties.payer.wallet_id,
        payment_method: 'wallet'
      },
      destination: {
        wallet_id: escrow.parties.payee.wallet_id,
        payment_method: 'wallet'
      },
      escrow_details: {
        escrow_id: escrow.escrow_id,
        parties: escrow.parties
      },
      metadata: {
        description: `Escrow release: ${escrow.metadata.description}`,
        user_id: req.user.userId
      },
      processing: {
        initiated_at: new Date(),
        completed_at: new Date()
      },
      status: 'completed'
    });

    await releaseTransaction.save();

    // Send webhook notification
    if (escrow.metadata.webhook_url) {
      try {
        await webhookService.sendEscrowWebhook(escrow, 'released');
      } catch (webhookError) {
        logger.error('Escrow release webhook failed:', webhookError);
      }
    }

    logger.info(`Escrow released: ${escrow_id}`);

    res.json({
      message: 'Escrow funds released successfully',
      escrow_id: escrow.escrow_id,
      status: escrow.status,
      released_amount: transaction.net_amount,
      released_at: escrow.timeline.released_at,
      transaction_id: releaseTransaction.transaction_id
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to release escrow funds'
    });
  }
};

// Refund escrow
const refundEscrow = async (req, res) => {
  try {
    const { escrow_id } = req.params;
    const { reason } = req.body;

    const escrow = await Escrow.findOne({ escrow_id });
    if (!escrow) {
      return res.status(404).json({
        error: 'Escrow not found'
      });
    }

    // Check if user is payer (typically the one who requests refunds)
    const userWallets = await Wallet.find({ owner_id: req.user.userId });
    const userWalletIds = userWallets.map(w => w.wallet_id);
    
    const isPayer = userWalletIds.includes(escrow.parties.payer.wallet_id);
    if (!isPayer) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only the payer can request refunds'
      });
    }

    if (!['active', 'disputed'].includes(escrow.status)) {
      return res.status(400).json({
        error: 'Escrow cannot be refunded',
        status: escrow.status
      });
    }

    // Get payer wallet
    const payerWallet = await Wallet.findOne({ wallet_id: escrow.parties.payer.wallet_id });
    if (!payerWallet) {
      return res.status(404).json({
        error: 'Payer wallet not found'
      });
    }

    // Get the original transaction
    const transaction = await Transaction.findOne({ transaction_id: escrow.transaction_id });
    if (!transaction) {
      return res.status(404).json({
        error: 'Original transaction not found'
      });
    }

    // Refund escrow
    await escrow.refund(reason);

    // Unlock and refund funds to payer
    await payerWallet.unlockFunds(escrow.amount);
    await payerWallet.addFunds(transaction.amount); // Full refund including fees

    // Create refund transaction
    const refundTransaction = new Transaction({
      transaction_id: `ref_${uuidv4().replace(/-/g, '')}`,
      type: 'refund',
      amount: escrow.amount,
      currency: escrow.currency,
      fees: { processing_fee: 0, platform_fee: 0, total_fee: 0 },
      net_amount: escrow.amount,
      source: {
        wallet_id: escrow.escrow_id,
        payment_method: 'escrow'
      },
      destination: {
        wallet_id: escrow.parties.payer.wallet_id,
        payment_method: 'wallet'
      },
      escrow_details: {
        escrow_id: escrow.escrow_id,
        parties: escrow.parties
      },
      metadata: {
        description: `Escrow refund: ${reason}`,
        user_id: req.user.userId
      },
      processing: {
        initiated_at: new Date(),
        completed_at: new Date()
      },
      status: 'completed'
    });

    await refundTransaction.save();

    // Send webhook notification
    if (escrow.metadata.webhook_url) {
      try {
        await webhookService.sendEscrowWebhook(escrow, 'refunded');
      } catch (webhookError) {
        logger.error('Escrow refund webhook failed:', webhookError);
      }
    }

    logger.info(`Escrow refunded: ${escrow_id}, reason: ${reason}`);

    res.json({
      message: 'Escrow refunded successfully',
      escrow_id: escrow.escrow_id,
      status: escrow.status,
      refunded_amount: escrow.amount,
      refunded_at: escrow.timeline.refunded_at,
      transaction_id: refundTransaction.transaction_id
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to refund escrow'
    });
  }
};

// Raise dispute
const raiseDispute = async (req, res) => {
  try {
    const { escrow_id } = req.params;
    const { reason, description } = req.body;

    const escrow = await Escrow.findOne({ escrow_id });
    if (!escrow) {
      return res.status(404).json({
        error: 'Escrow not found'
      });
    }

    // Check if user is a party to the escrow
    const userWallets = await Wallet.find({ owner_id: req.user.userId });
    const userWalletIds = userWallets.map(w => w.wallet_id);
    
    const isParty = userWalletIds.includes(escrow.parties.payer.wallet_id) || 
                   userWalletIds.includes(escrow.parties.payee.wallet_id);

    if (!isParty) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You are not a party to this escrow'
      });
    }

    if (escrow.status !== 'active') {
      return res.status(400).json({
        error: 'Escrow is not active',
        status: escrow.status
      });
    }

    // Raise dispute
    await escrow.raiseDispute(req.user.userId, reason, description);

    // Send webhook notification
    if (escrow.metadata.webhook_url) {
      try {
        await webhookService.sendEscrowWebhook(escrow, 'disputed');
      } catch (webhookError) {
        logger.error('Escrow dispute webhook failed:', webhookError);
      }
    }

    logger.info(`Dispute raised: ${escrow_id}, by: ${req.user.userId}`);

    res.json({
      message: 'Dispute raised successfully',
      escrow_id: escrow.escrow_id,
      status: escrow.status,
      dispute_id: escrow.disputes[escrow.disputes.length - 1].dispute_id,
      disputed_at: escrow.timeline.disputed_at
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to raise dispute'
    });
  }
};

// Get disputes
const getDisputes = async (req, res) => {
  try {
    const { escrow_id } = req.params;

    const escrow = await Escrow.findOne({ escrow_id });
    if (!escrow) {
      return res.status(404).json({
        error: 'Escrow not found'
      });
    }

    // Check if user is a party to the escrow
    const userWallets = await Wallet.find({ owner_id: req.user.userId });
    const userWalletIds = userWallets.map(w => w.wallet_id);
    
    const isParty = userWalletIds.includes(escrow.parties.payer.wallet_id) || 
                   userWalletIds.includes(escrow.parties.payee.wallet_id);

    if (!isParty) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You are not a party to this escrow'
      });
    }

    res.json({
      escrow_id: escrow.escrow_id,
      disputes: escrow.disputes.map(dispute => ({
        dispute_id: dispute.dispute_id,
        raised_by: dispute.raised_by,
        reason: dispute.reason,
        description: dispute.description,
        status: dispute.status,
        raised_at: dispute.raised_at,
        resolved_at: dispute.resolved_at,
        resolution: dispute.resolution,
        evidence_count: dispute.evidence.length
      }))
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to fetch disputes'
    });
  }
};

// Add dispute evidence
const addDisputeEvidence = async (req, res) => {
  try {
    const { escrow_id, dispute_id } = req.params;
    const { evidence } = req.body; // Array of evidence items

    const escrow = await Escrow.findOne({ escrow_id });
    if (!escrow) {
      return res.status(404).json({
        error: 'Escrow not found'
      });
    }

    // Check if user is a party to the escrow
    const userWallets = await Wallet.find({ owner_id: req.user.userId });
    const userWalletIds = userWallets.map(w => w.wallet_id);
    
    const isParty = userWalletIds.includes(escrow.parties.payer.wallet_id) || 
                   userWalletIds.includes(escrow.parties.payee.wallet_id);

    if (!isParty) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You are not a party to this escrow'
      });
    }

    // Find the dispute
    const dispute = escrow.disputes.id(dispute_id);
    if (!dispute) {
      return res.status(404).json({
        error: 'Dispute not found'
      });
    }

    // Add evidence
    if (evidence && Array.isArray(evidence)) {
      evidence.forEach(item => {
        dispute.evidence.push({
          type: item.type,
          url: item.url,
          uploaded_by: req.user.userId,
          uploaded_at: new Date()
        });
      });
      await escrow.save();
    }

    logger.info(`Evidence added to dispute: ${escrow_id}, dispute: ${dispute_id}`);

    res.json({
      message: 'Evidence added successfully',
      escrow_id: escrow.escrow_id,
      dispute_id: dispute_id,
      evidence_count: dispute.evidence.length
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to add dispute evidence'
    });
  }
};

module.exports = {
  createEscrow,
  getEscrow,
  getEscrows,
  fulfillCondition,
  releaseEscrow,
  refundEscrow,
  raiseDispute,
  getDisputes,
  addDisputeEvidence
};
