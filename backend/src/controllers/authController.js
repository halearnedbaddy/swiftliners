const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');
const { emailService } = require('../services/emailService');

// Generate JWT tokens
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
  
  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );
  
  return { accessToken, refreshToken };
};

// Register new user
const register = async (req, res) => {
  try {
    console.log('📝 Registration request received:', req.body);
    
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { business_name, email, phone, password, use_case, website } = req.body;

    // Mock user creation (without database for testing)
    console.log('✅ Creating mock user account...');
    
    // Generate mock API keys
    const mockUserId = 'user_' + Date.now();
    const publicTestKey = 'pk_test_' + Math.random().toString(36).substring(2, 15);
    const secretTestKey = 'sk_test_' + Math.random().toString(36).substring(2, 15);
    
    // Generate JWT tokens
    const accessToken = jwt.sign(
      { 
        userId: mockUserId, 
        email, 
        business_name,
        role: 'user'
      },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '15m' }
    );
    
    const refreshToken = jwt.sign(
      { userId: mockUserId },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '30d' }
    );

    // Mock email verification
    console.log('📧 Sending mock verification email...');

    res.status(201).json({
      success: true,
      message: 'Account created successfully! Please check your email for verification.',
      account_id: mockUserId,
      business_name,
      email,
      phone,
      use_case,
      website,
      status: 'pending_approval',
      kyc_verified: false,
      live_mode_enabled: false,
      test_keys: {
        public_test: publicTestKey,
        secret_test: secretTestKey
      },
      live_keys: {
        public_live: null,
        secret_live: null
      },
      email_verification: {
        token: 'mock_token_' + Date.now(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        verified: false
      },
      tokens: {
        accessToken,
        refreshToken
      },
      created_at: new Date()
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: 'Unable to create account'
    });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    // Update last login
    user.metadata.last_login = new Date();
    await user.save();

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    logger.info(`User logged in: ${email}`);

    res.json({
      message: 'Login successful',
      user: {
        id: user._id,
        business_name: user.business_name,
        email: user.email,
        phone: user.phone,
        use_case: user.use_case,
        status: user.status,
        mode: user.mode,
        kyc_status: user.kyc_status,
        trust_score: user.trust_score
      },
      tokens: {
        accessToken,
        refreshToken
      },
      api_keys: user.api_keys
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: 'Unable to authenticate user'
    });
  }
};

// Refresh token
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        error: 'Refresh token required'
      });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        error: 'Invalid refresh token'
      });
    }

    const tokens = generateTokens(user._id);

    res.json({
      message: 'Token refreshed successfully',
      tokens
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(401).json({
      error: 'Invalid refresh token'
    });
  }
};

// Get user profile
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    res.json({
      user: {
        id: user._id,
        business_name: user.business_name,
        email: user.email,
        phone: user.phone,
        use_case: user.use_case,
        website: user.website,
        status: user.status,
        mode: user.mode,
        kyc_status: user.kyc_status,
        trust_score: user.trust_score,
        created_at: user.created_at,
        metadata: user.metadata
      }
    });
  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({
      error: 'Failed to fetch profile'
    });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { business_name, phone, website } = req.body;
    
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Update allowed fields
    if (business_name) user.business_name = business_name;
    if (phone) user.phone = phone;
    if (website) user.website = website;

    await user.save();

    logger.info(`Profile updated: ${user.email}`);

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        business_name: user.business_name,
        email: user.email,
        phone: user.phone,
        use_case: user.use_case,
        website: user.website,
        status: user.status,
        mode: user.mode,
        kyc_status: user.kyc_status
      }
    });
  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({
      error: 'Failed to update profile'
    });
  }
};

// Verify email
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    // Find user with valid verification token
    const user = await User.findOne({
      'email_verification.token': token,
      'email_verification.expires_at': { $gt: new Date() },
      'email_verification.verified': false
    });

    if (!user) {
      return res.status(400).json({ 
        error: 'Invalid or expired verification token' 
      });
    }

    // Update account
    user.email_verification.verified = true;
    if (user.status === 'pending') {
      user.status = 'active';
    }
    await user.save();

    logger.info(`Email verified: ${user.email}`);

    res.json({
      success: true,
      message: 'Email verified successfully!',
      redirect: '/dashboard'
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({ error: 'Verification failed' });
  }
};

// Submit KYC (Request Live Mode)
const submitKYC = async (req, res) => {
  try {
    const {
      company_registration_url,
      tax_certificate_url,
      business_permit_url,
      owner_id_url,
      owner_selfie_url,
      bank_statement_url,
      owner_name,
      owner_national_id
    } = req.body;

    const userId = req.user.userId;

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create KYC submission
    user.kyc_documents = {
      company_registration: company_registration_url,
      tax_certificate: tax_certificate_url,
      business_permit: business_permit_url,
      owner_id: owner_id_url,
      owner_selfie: owner_selfie_url,
      bank_statement: bank_statement_url
    };

    user.kyc_info = {
      owner_name,
      owner_national_id
    };

    user.kyc_status = 'pending';
    user.kyc_submitted_at = new Date();
    user.status = 'kyc_pending';

    await user.save();

    logger.info(`KYC submitted for user: ${userId}`);

    res.json({
      success: true,
      kyc_id: user._id,
      status: 'pending',
      message: 'KYC documents submitted. We\'ll review within 48 hours.',
      estimated_review_time: '24-48 hours'
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({ error: 'Failed to submit KYC' });
  }
};

// Admin: Get pending approvals
const getPendingAccounts = async (req, res) => {
  try {
    const users = await User.find({
      status: { $in: ['pending', 'kyc_pending'] }
    }).sort({ created_at: -1 });

    res.json({
      success: true,
      count: users.length,
      accounts: users.map(user => ({
        account_id: user._id,
        business_name: user.business_name,
        email: user.email,
        phone: user.phone,
        status: user.status,
        kyc_status: user.kyc_status,
        created_at: user.created_at,
        kyc_submitted_at: user.kyc_submitted_at,
        metadata: user.metadata
      }))
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({ error: 'Failed to retrieve pending accounts' });
  }
};

// Admin: Approve account
const approveAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { approve_live_mode = false } = req.body;

    const user = await User.findById(accountId);
    if (!user) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Update account status
    user.status = 'active';
    user.kyc_verified = approve_live_mode;
    user.live_mode_enabled = approve_live_mode;
    user.kyc_status = 'approved';
    user.kyc_reviewed_at = new Date();

    // If approving live mode, generate live keys
    let liveKeys = null;
    if (approve_live_mode) {
      user.generateAPIKeys('live');
      liveKeys = {
        public_live: user.api_keys.public_live,
        secret_live: user.api_keys.secret_live
      };
    }

    await user.save();

    logger.info(`Account approved: ${accountId}, Live mode: ${approve_live_mode}`);

    // Send approval email
    try {
      if (approve_live_mode) {
        await emailService.sendLiveModeApprovedEmail(user.email, {
          business_name: user.business_name,
          public_key: liveKeys.public_live,
          secret_key: liveKeys.secret_live
        });
      } else {
        await emailService.sendTestModeApprovedEmail(user.email, {
          business_name: user.business_name
        });
      }
    } catch (emailError) {
      logger.error('Failed to send approval email:', emailError);
    }

    res.json({
      success: true,
      account_id: accountId,
      status: 'approved',
      live_mode_enabled: approve_live_mode,
      live_keys: liveKeys,
      message: 'Account approved successfully'
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({ error: 'Failed to approve account' });
  }
};

// Admin: Reject account
const rejectAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { reason } = req.body;

    const user = await User.findById(accountId);
    if (!user) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Update account status
    user.status = 'rejected';
    user.kyc_status = 'rejected';
    user.kyc_rejection_reason = reason;
    user.kyc_reviewed_at = new Date();

    await user.save();

    logger.info(`Account rejected: ${accountId}`);

    // Send rejection email
    try {
      await emailService.sendAccountRejectedEmail(user.email, {
        business_name: user.business_name,
        reason: reason
      });
    } catch (emailError) {
      logger.error('Failed to send rejection email:', emailError);
    }

    res.json({
      success: true,
      account_id: accountId,
      status: 'rejected',
      message: 'Account rejected'
    });

  } catch (error) {
    logger.logApiError(error, req);
    res.status(500).json({ error: 'Failed to reject account' });
  }
};

module.exports = {
  register,
  login,
  refreshToken,
  getProfile,
  updateProfile,
  verifyEmail,
  submitKYC,
  getPendingAccounts,
  approveAccount,
  rejectAccount
};
