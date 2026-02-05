const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const logger = require('../utils/logger');

// Get ledger entries
const getLedgerEntries = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      entry_type, 
      from_date, 
      to_date 
    } = req.query;

    const query = { 'metadata.user_id': req.user.userId };

    // Add filters
    if (entry_type) query.type = entry_type;
    
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
        .select('transaction_id type amount currency fees net_amount status source destination metadata created_at'),
      Transaction.countDocuments(query)
    ]);

    res.json({
      entries: transactions.map(tx => ({
        entry_id: tx.transaction_id,
        entry_type: tx.type,
        amount: tx.amount,
        currency: tx.currency,
        net_amount: tx.net_amount,
        fees: tx.fees,
        status: tx.status,
        source: tx.source,
        destination: tx.destination,
        description: tx.metadata.description,
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
      error: 'Failed to fetch ledger entries'
    });
  }
};

// Get specific ledger entry
const getLedgerEntry = async (req, res) => {
  try {
    const { entry_id } = req.params;

    const transaction = await Transaction.findOne({
      transaction_id: entry_id,
      'metadata.user_id': req.user.userId
    });

    if (!transaction) {
      return res.status(404).json({
        error: 'Ledger entry not found'
      });
    }

    res.json({
      entry: {
        entry_id: transaction.transaction_id,
        entry_type: transaction.type,
        amount: transaction.amount,
        currency: transaction.currency,
        net_amount: transaction.net_amount,
        fees: transaction.fees,
        status: transaction.status,
        source: transaction.source,
        destination: transaction.destination,
        metadata: transaction.metadata,
        processing: transaction.processing,
        created_at: transaction.created_at,
        updated_at: transaction.updated_at
      }
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to fetch ledger entry'
    });
  }
};

// Get account balance summary
const getAccountBalance = async (req, res) => {
  try {
    const { currency } = req.query;

    const walletQuery = { owner_id: req.user.userId };
    if (currency) walletQuery.currency = currency;

    const wallets = await Wallet.find(walletQuery);

    const balanceSummary = {
      total_balance: 0,
      available_balance: 0,
      locked_balance: 0,
      currencies: {}
    };

    wallets.forEach(wallet => {
      const currencyKey = wallet.currency;
      
      if (!balanceSummary.currencies[currencyKey]) {
        balanceSummary.currencies[currencyKey] = {
          available: 0,
          locked: 0,
          total: 0,
          wallet_count: 0
        };
      }

      balanceSummary.currencies[currencyKey].available += wallet.balances.available;
      balanceSummary.currencies[currencyKey].locked += wallet.balances.locked;
      balanceSummary.currencies[currencyKey].total += wallet.balances.total;
      balanceSummary.currencies[currencyKey].wallet_count += 1;

      // Convert to base currency (simplified - in production, use real exchange rates)
      const conversionRate = currencyKey === 'USD' ? 100 : (currencyKey === 'EUR' ? 110 : 1);
      balanceSummary.total_balance += wallet.balances.total * conversionRate;
      balanceSummary.available_balance += wallet.balances.available * conversionRate;
      balanceSummary.locked_balance += wallet.balances.locked * conversionRate;
    });

    res.json({
      balance_summary: balanceSummary,
      wallet_count: wallets.length,
      last_updated: new Date()
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to fetch account balance'
    });
  }
};

// Get ledger summary
const getLedgerSummary = async (req, res) => {
  try {
    const { from_date, to_date } = req.query;

    const dateFilter = {};
    if (from_date) dateFilter.$gte = new Date(from_date);
    if (to_date) dateFilter.$lte = new Date(to_date);

    const query = {
      'metadata.user_id': req.user.userId,
      ...(Object.keys(dateFilter).length > 0 && { created_at: dateFilter })
    };

    // Aggregate transaction data
    const summary = await Transaction.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            type: '$type',
            status: '$status',
            currency: '$currency'
          },
          count: { $sum: 1 },
          total_amount: { $sum: '$amount' },
          total_fees: { $sum: '$fees.total_fee' },
          net_amount: { $sum: '$net_amount' }
        }
      },
      {
        $group: {
          _id: {
            type: '$_id.type',
            currency: '$_id.currency'
          },
          transactions: {
            $push: {
              status: '$_id.status',
              count: '$count',
              total_amount: '$total_amount',
              total_fees: '$total_fees',
              net_amount: '$net_amount'
            }
          },
          total_count: { $sum: '$count' },
          total_amount: { $sum: '$total_amount' },
          total_fees: { $sum: '$total_fees' },
          net_amount: { $sum: '$net_amount' }
        }
      }
    ]);

    // Format response
    const formattedSummary = {
      period: {
        from: from_date || 'all time',
        to: to_date || 'now'
      },
      transaction_types: {},
      total_transactions: 0,
      total_volume: 0,
      total_fees: 0
    };

    summary.forEach(item => {
      const typeKey = item._id.type;
      const currencyKey = item._id.currency;

      if (!formattedSummary.transaction_types[typeKey]) {
        formattedSummary.transaction_types[typeKey] = {};
      }

      formattedSummary.transaction_types[typeKey][currencyKey] = {
        total_count: item.total_count,
        total_amount: item.total_amount,
        total_fees: item.total_fees,
        net_amount: item.net_amount,
        breakdown: item.transactions
      };

      formattedSummary.total_transactions += item.total_count;
      formattedSummary.total_volume += item.total_amount;
      formattedSummary.total_fees += item.total_fees;
    });

    res.json({
      ledger_summary: formattedSummary
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to fetch ledger summary'
    });
  }
};

// Get transaction ledger entries
const getTransactionLedger = async (req, res) => {
  try {
    const { transaction_id } = req.params;

    const transaction = await Transaction.findOne({
      transaction_id,
      'metadata.user_id': req.user.userId
    });

    if (!transaction) {
      return res.status(404).json({
        error: 'Transaction not found'
      });
    }

    // Get related wallet transactions
    const walletTransactions = await Transaction.find({
      $or: [
        { 'source.wallet_id': { $in: [transaction.source.wallet_id, transaction.destination.wallet_id] } },
        { 'destination.wallet_id': { $in: [transaction.source.wallet_id, transaction.destination.wallet_id] } }
      ],
      transaction_id: { $ne: transaction_id },
      created_at: {
        $gte: new Date(transaction.created_at.getTime() - 24 * 60 * 60 * 1000), // 24 hours before
        $lte: new Date(transaction.created_at.getTime() + 24 * 60 * 60 * 1000)  // 24 hours after
      }
    }).sort({ created_at: -1 });

    res.json({
      main_transaction: {
        transaction_id: transaction.transaction_id,
        type: transaction.type,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
        created_at: transaction.created_at
      },
      related_transactions: walletTransactions.map(tx => ({
        transaction_id: tx.transaction_id,
        type: tx.type,
        amount: tx.amount,
        currency: tx.currency,
        status: tx.status,
        relation: tx.source.wallet_id === transaction.source.wallet_id ? 'same_source' : 'related_wallet',
        created_at: tx.created_at
      }))
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to fetch transaction ledger'
    });
  }
};

module.exports = {
  getLedgerEntries,
  getLedgerEntry,
  getAccountBalance,
  getLedgerSummary,
  getTransactionLedger
};
