const express = require('express');
const { body, query } = require('express-validator');
const walletsController = require('../controllers/walletsController');
const { apiKeyAuth, requireKYC } = require('../middleware/auth');

const router = express.Router();

// All wallet routes require API key authentication
router.use(apiKeyAuth);

// Validation rules
const createWalletValidation = [
  body('currency')
    .optional()
    .isIn(['KES', 'USD', 'EUR'])
    .withMessage('Invalid currency'),
  body('wallet_type')
    .optional()
    .isIn(['business', 'personal', 'escrow'])
    .withMessage('Invalid wallet type'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Description must not exceed 200 characters')
];

const fundWalletValidation = [
  body('amount')
    .isFloat({ gt: 0 })
    .withMessage('Amount must be greater than 0'),
  body('currency')
    .optional()
    .isIn(['KES', 'USD', 'EUR'])
    .withMessage('Invalid currency'),
  body('payment_method')
    .isIn(['mpesa', 'card', 'bank', 'wallet'])
    .withMessage('Valid payment method required'),
  body('reference')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Reference must not exceed 100 characters')
];

const transferValidation = [
  body('amount')
    .isFloat({ gt: 0 })
    .withMessage('Amount must be greater than 0'),
  body('recipient_wallet_id')
    .notEmpty()
    .withMessage('Recipient wallet ID is required'),
  body('currency')
    .optional()
    .isIn(['KES', 'USD', 'EUR'])
    .withMessage('Invalid currency'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Description must not exceed 200 characters')
];

// Routes
router.post('/create', createWalletValidation, walletsController.createWallet);
router.get('/', walletsController.getWallets);
router.get('/:wallet_id', walletsController.getWallet);
router.get('/:wallet_id/balance', walletsController.getWalletBalance);
router.post('/:wallet_id/fund', fundWalletValidation, walletsController.fundWallet);
router.post('/:wallet_id/withdraw', walletsController.withdrawFromWallet);
router.post('/transfer', transferValidation, walletsController.transferFunds);
router.get('/:wallet_id/transactions', walletsController.getWalletTransactions);
router.get('/:wallet_id/transactions/:transaction_id', walletsController.getTransaction);

module.exports = router;
