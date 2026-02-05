const express = require('express');
const { body } = require('express-validator');
const {
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
} = require('../controllers/authController');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Validation rules
const registerValidation = [
  body('business_name')
    .trim()
    .notEmpty()
    .withMessage('Business name is required'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('use_case')
    .optional()
    .isIn(['marketplace', 'freelance', 'saas', 'fintech', 'other'])
    .withMessage('Invalid use case')
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

const kycValidation = [
  body('company_registration_url')
    .isURL()
    .withMessage('Valid company registration document URL required'),
  body('tax_certificate_url')
    .isURL()
    .withMessage('Valid tax certificate URL required'),
  body('business_permit_url')
    .isURL()
    .withMessage('Valid business permit URL required'),
  body('owner_id_url')
    .isURL()
    .withMessage('Valid owner ID URL required'),
  body('owner_selfie_url')
    .isURL()
    .withMessage('Valid owner selfie URL required'),
  body('bank_statement_url')
    .isURL()
    .withMessage('Valid bank statement URL required'),
  body('owner_name')
    .trim()
    .notEmpty()
    .withMessage('Owner name is required'),
  body('owner_national_id')
    .trim()
    .notEmpty()
    .withMessage('Owner national ID is required')
];

const updateProfileValidation = [
  body('business_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Business name must be between 2 and 100 characters'),
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Valid phone number required'),
  body('website')
    .optional()
    .isURL()
    .withMessage('Valid website URL required')
];

// Public routes
router.post('/signup', registerValidation, register);
router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.post('/refresh', refreshToken);

// Protected routes
router.get('/profile', auth, getProfile);
router.put('/profile', auth, updateProfileValidation, updateProfile);
router.get('/verify-email/:token', verifyEmail);
router.post('/kyc/submit', kycValidation, submitKYC);

// Admin routes
router.get('/admin/pending-accounts', getPendingAccounts);
router.post('/admin/approve/:accountId', approveAccount);
router.post('/admin/reject/:accountId', rejectAccount);

module.exports = router;
