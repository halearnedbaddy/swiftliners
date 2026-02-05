const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

// Authentication middleware
const auth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'Authorization token required'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'User not found'
      });
    }

    if (user.status !== 'approved') {
      return res.status(403).json({
        error: 'Account not approved',
        message: 'Your account is pending approval or has been suspended'
      });
    }

    req.user = {
      userId: user._id,
      email: user.email,
      business_name: user.business_name,
      mode: user.mode,
      kyc_status: user.kyc_status
    };

    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Token is malformed or expired'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Please login again'
      });
    }

    res.status(500).json({
      error: 'Authentication failed',
      message: 'Unable to verify token'
    });
  }
};

// API Key authentication middleware
const apiKeyAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'API key required'
      });
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Check if it's a test or live key
    const isTestKey = apiKey.startsWith('pk_test_') || apiKey.startsWith('sk_test_');
    const isLiveKey = apiKey.startsWith('pk_live_') || apiKey.startsWith('sk_live_');

    if (!isTestKey && !isLiveKey) {
      return res.status(401).json({
        error: 'Invalid API key format'
      });
    }

    // Find user by API key
    const user = await User.findOne({
      $or: [
        { 'api_keys.public_test': apiKey },
        { 'api_keys.secret_test': apiKey },
        { 'api_keys.public_live': apiKey },
        { 'api_keys.secret_live': apiKey }
      ]
    }).select('-password');

    if (!user) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: 'API key not found'
      });
    }

    // Check if user is approved
    if (user.status !== 'approved') {
      return res.status(403).json({
        error: 'Account not approved',
        message: 'Your account is pending approval or has been suspended'
      });
    }

    // Check mode compatibility
    if (isLiveKey && user.mode !== 'live') {
      return res.status(403).json({
        error: 'Live mode not enabled',
        message: 'Complete KYC verification to enable live mode'
      });
    }

    req.user = {
      userId: user._id,
      email: user.email,
      business_name: user.business_name,
      mode: isLiveKey ? 'live' : 'test',
      kyc_status: user.kyc_status,
      apiKey: apiKey
    };

    next();
  } catch (error) {
    logger.error('API Key auth middleware error:', error);
    res.status(500).json({
      error: 'Authentication failed',
      message: 'Unable to verify API key'
    });
  }
};

// Admin authentication middleware
const adminAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'Admin token required'
      });
    }

    const token = authHeader.substring(7);

    // For demo purposes, check if it's the admin token
    // In production, you'd have a separate admin users table
    if (token !== process.env.ADMIN_TOKEN && token !== 'admin_demo_token') {
      return res.status(401).json({
        error: 'Invalid admin token'
      });
    }

    req.admin = {
      id: 'admin',
      email: process.env.ADMIN_EMAIL || 'admin@payloom.com'
    };

    next();
  } catch (error) {
    logger.error('Admin auth middleware error:', error);
    res.status(500).json({
      error: 'Admin authentication failed'
    });
  }
};

// Live mode requirement middleware
const requireLiveMode = (req, res, next) => {
  if (req.user.mode !== 'live') {
    return res.status(403).json({
      error: 'Live mode required',
      message: 'This operation is only available in live mode'
    });
  }
  next();
};

// KYC verification requirement middleware
const requireKYC = (req, res, next) => {
  if (req.user.kyc_status !== 'approved') {
    return res.status(403).json({
      error: 'KYC verification required',
      message: 'Complete KYC verification to access this feature'
    });
  }
  next();
};

module.exports = {
  auth,
  apiKeyAuth,
  adminAuth,
  requireLiveMode,
  requireKYC
};
