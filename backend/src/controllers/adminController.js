const User = require('../models/User');
const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');
const { sendEmail } = require('../services/emailService');

// Get pending accounts for approval
const getPendingAccounts = async (req, res) => {
  try {
    const pendingAccounts = await User.find({ 
      status: 'pending' 
    }).select('-password -api_keys.secret_test -api_keys.secret_live')
      .sort({ created_at: -1 });

    res.json({
      accounts: pendingAccounts.map(user => ({
        id: user._id,
        business_name: user.business_name,
        email: user.email,
        phone: user.phone,
        use_case: user.use_case,
        website: user.website,
        created_at: user.created_at,
        metadata: user.metadata
      }))
    });
  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to fetch pending accounts'
    });
  }
};

// Approve account (test mode)
const approveAccount = async (req, res) => {
  try {
    const { userId } = req.params;
    const { approve_live_mode = false } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    if (user.status !== 'pending') {
      return res.status(400).json({
        error: 'Account already processed',
        status: user.status
      });
    }

    // Update user status
    user.status = 'approved';
    
    // If approving live mode, check KYC first
    if (approve_live_mode) {
      if (user.kyc_status !== 'approved') {
        return res.status(400).json({
          error: 'KYC must be approved before enabling live mode'
        });
      }
      user.mode = 'live';
      user.generateAPIKeys(); // Generate live keys
    }

    await user.save();

    // Send approval email
    try {
      await sendEmail({
        to: user.email,
        subject: approve_live_mode ? '🎉 PayLoom Live Mode Enabled!' : '✅ PayLoom Account Approved!',
        template: approve_live_mode ? 'live-mode-approved' : 'test-mode-approved',
        data: {
          business_name: user.business_name,
          email: user.email,
          api_keys: user.api_keys,
          mode: user.mode
        }
      });
    } catch (emailError) {
      logger.error('Failed to send approval email:', emailError);
    }

    logger.info(`Account approved: ${user.email}, mode: ${user.mode}`);

    res.json({
      message: approve_live_mode ? 'Live mode enabled successfully' : 'Account approved successfully',
      user: {
        id: user._id,
        business_name: user.business_name,
        email: user.email,
        status: user.status,
        mode: user.mode,
        kyc_status: user.kyc_status
      }
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to approve account'
    });
  }
};

// Reject account
const rejectAccount = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        error: 'Rejection reason is required'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    if (user.status !== 'pending') {
      return res.status(400).json({
        error: 'Account already processed',
        status: user.status
      });
    }

    user.status = 'rejected';
    await user.save();

    // Send rejection email
    try {
      await sendEmail({
        to: user.email,
        subject: 'PayLoom Account Update',
        template: 'account-rejected',
        data: {
          business_name: user.business_name,
          reason: reason
        }
      });
    } catch (emailError) {
      logger.error('Failed to send rejection email:', emailError);
    }

    logger.info(`Account rejected: ${user.email}, reason: ${reason}`);

    res.json({
      message: 'Account rejected successfully'
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to reject account'
    });
  }
};

// Get KYC submissions
const getKYCSubmissions = async (req, res) => {
  try {
    const kycSubmissions = await User.find({ 
      kyc_status: 'pending',
      status: 'approved' // Only show KYC for approved accounts
    }).select('-password -api_keys')
      .sort({ updated_at: -1 });

    res.json({
      submissions: kycSubmissions.map(user => ({
        id: user._id,
        business_name: user.business_name,
        email: user.email,
        phone: user.phone,
        kyc_documents: user.kyc_documents,
        submitted_at: user.updated_at,
        trust_score: user.trust_score
      }))
    });
  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to fetch KYC submissions'
    });
  }
};

// Approve KYC (enables live mode)
const approveKYC = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    if (user.kyc_status !== 'pending') {
      return res.status(400).json({
        error: 'KYC already processed',
        kyc_status: user.kyc_status
      });
    }

    // Update KYC status and enable live mode
    user.kyc_status = 'approved';
    user.mode = 'live';
    user.trust_score = 85; // Set initial trust score
    user.generateAPIKeys(); // Generate live API keys

    await user.save();

    // Send KYC approval email with live keys
    try {
      await sendEmail({
        to: user.email,
        subject: '🎉 PayLoom Live Mode Enabled!',
        template: 'kyc-approved-live-mode',
        data: {
          business_name: user.business_name,
          email: user.email,
          api_keys: user.api_keys,
          trust_score: user.trust_score
        }
      });
    } catch (emailError) {
      logger.error('Failed to send KYC approval email:', emailError);
    }

    logger.info(`KYC approved and live mode enabled: ${user.email}`);

    res.json({
      message: 'KYC approved and live mode enabled successfully',
      user: {
        id: user._id,
        business_name: user.business_name,
        email: user.email,
        kyc_status: user.kyc_status,
        mode: user.mode,
        trust_score: user.trust_score,
        api_keys: {
          public_live: user.api_keys.public_live,
          secret_live: user.api_keys.secret_live
        }
      }
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to approve KYC'
    });
  }
};

// Reject KYC
const rejectKYC = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        error: 'Rejection reason is required'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    if (user.kyc_status !== 'pending') {
      return res.status(400).json({
        error: 'KYC already processed',
        kyc_status: user.kyc_status
      });
    }

    user.kyc_status = 'rejected';
    await user.save();

    // Send KYC rejection email
    try {
      await sendEmail({
        to: user.email,
        subject: 'PayLoom KYC Update',
        template: 'kyc-rejected',
        data: {
          business_name: user.business_name,
          reason: reason
        }
      });
    } catch (emailError) {
      logger.error('Failed to send KYC rejection email:', emailError);
    }

    logger.info(`KYC rejected: ${user.email}, reason: ${reason}`);

    res.json({
      message: 'KYC rejected successfully'
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to reject KYC'
    });
  }
};

// Get all accounts
const getAllAccounts = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    
    const query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { business_name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [accounts, total] = await Promise.all([
      User.find(query)
        .select('-password -api_keys.secret_test -api_keys.secret_live')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(query)
    ]);

    res.json({
      accounts: accounts.map(user => ({
        id: user._id,
        business_name: user.business_name,
        email: user.email,
        phone: user.phone,
        use_case: user.use_case,
        status: user.status,
        mode: user.mode,
        kyc_status: user.kyc_status,
        trust_score: user.trust_score,
        created_at: user.created_at,
        last_login: user.metadata.last_login
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
      error: 'Failed to fetch accounts'
    });
  }
};

// Get platform statistics
const getPlatformStats = async (req, res) => {
  try {
    const [
      totalUsers,
      pendingUsers,
      approvedUsers,
      liveModeUsers,
      kycPending,
      kycApproved,
      totalTransactions,
      totalVolume
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: 'pending' }),
      User.countDocuments({ status: 'approved' }),
      User.countDocuments({ mode: 'live' }),
      User.countDocuments({ kyc_status: 'pending' }),
      User.countDocuments({ kyc_status: 'approved' }),
      Transaction.countDocuments(),
      Transaction.aggregate([
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    // Calculate revenue (2.5% of total volume)
    const totalRevenue = totalVolume.length > 0 ? totalVolume[0].total * 0.025 : 0;

    res.json({
      stats: {
        users: {
          total: totalUsers,
          pending: pendingUsers,
          approved: approvedUsers,
          live_mode: liveModeUsers
        },
        kyc: {
          pending: kycPending,
          approved: kycApproved
        },
        transactions: {
          total: totalTransactions,
          volume: totalVolume.length > 0 ? totalVolume[0].total : 0,
          revenue: totalRevenue
        }
      }
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to fetch platform statistics'
    });
  }
};

// Get transactions
const getTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type, from_date, to_date } = req.query;
    
    const query = {};
    
    if (status) query.status = status;
    if (type) query.type = type;
    
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
        .limit(parseInt(limit)),
      Transaction.countDocuments(query)
    ]);

    res.json({
      transactions: transactions.map(tx => ({
        transaction_id: tx.transaction_id,
        type: tx.type,
        amount: tx.amount,
        currency: tx.currency,
        status: tx.status,
        fees: tx.fees,
        net_amount: tx.net_amount,
        customer_email: tx.metadata.customer_email,
        created_at: tx.created_at
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
      error: 'Failed to fetch transactions'
    });
  }
};

// Get API logs (mock implementation)
const getAPILogs = async (req, res) => {
  try {
    const { page = 1, limit = 20, method, status, from_date, to_date } = req.query;
    
    // Mock data for API logs
    const mockLogs = [
      {
        id: 'log_1',
        method: 'POST',
        endpoint: '/api/v1/collections/create',
        status: 200,
        response_time: 245,
        ip_address: '192.168.1.100',
        user_agent: 'PayLoom-Client/1.0',
        timestamp: new Date(Date.now() - 5 * 60 * 1000),
        user_id: 'user_123'
      },
      {
        id: 'log_2',
        method: 'GET',
        endpoint: '/api/v1/wallets/balance',
        status: 200,
        response_time: 89,
        ip_address: '192.168.1.100',
        user_agent: 'PayLoom-Client/1.0',
        timestamp: new Date(Date.now() - 10 * 60 * 1000),
        user_id: 'user_123'
      }
    ];

    res.json({
      logs: mockLogs,
      pagination: {
        current_page: parseInt(page),
        total_pages: 1,
        total_records: mockLogs.length
      }
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({
      error: 'Failed to fetch API logs'
    });
  }
};

module.exports = {
  getPendingAccounts,
  approveAccount,
  rejectAccount,
  getKYCSubmissions,
  approveKYC,
  rejectKYC,
  getAllAccounts,
  getPlatformStats,
  getTransactions,
  getAPILogs
};
