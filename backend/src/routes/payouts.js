const express = require('express');
const { body } = require('express-validator');
const payoutsController = require('../controllers/payoutsController');
const { apiKeyAuth, requireKYC } = require('../middleware/auth');

const router = express.Router();

// All payouts routes require API key authentication
router.use(apiKeyAuth);

// Validation rules
const createPayoutValidation = [
  body('amount')
    .isFloat({ gt: 0 })
    .withMessage('Amount must be greater than 0'),
  body('currency')
    .optional()
    .isIn(['KES', 'USD', 'EUR'])
    .withMessage('Invalid currency'),
  body('payment_method')
    .isIn(['mpesa', 'bank', 'wallet'])
    .withMessage('Valid payment method required'),
  body('recipient_name')
    .trim()
    .notEmpty()
    .withMessage('Recipient name is required'),
  body('recipient_phone')
    .if(body('payment_method').equals('mpesa'))
    .isMobilePhone()
    .withMessage('Valid recipient phone number required for M-Pesa'),
  body('recipient_bank_account')
    .if(body('payment_method').equals('bank'))
    .notEmpty()
    .withMessage('Bank account details required for bank transfers'),
  body('recipient_wallet_id')
    .if(body('payment_method').equals('wallet'))
    .notEmpty()
    .withMessage('Wallet ID required for wallet transfers'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),
  body('reference')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Reference must not exceed 100 characters'),
  body('webhook_url')
    .optional()
    .isURL()
    .withMessage('Valid webhook URL required')
];

const bulkPayoutValidation = [
  body('payouts')
    .isArray({ min: 1, max: 100 })
    .withMessage('Payouts array must have 1-100 items'),
  body('payouts.*.amount')
    .isFloat({ gt: 0 })
    .withMessage('Each payout amount must be greater than 0'),
  body('payouts.*.payment_method')
    .isIn(['mpesa', 'bank', 'wallet'])
    .withMessage('Valid payment method required for each payout'),
  body('payouts.*.recipient_name')
    .trim()
    .notEmpty()
    .withMessage('Recipient name required for each payout')
];

// Routes
router.post('/create', createPayoutValidation, payoutsController.createPayout);
router.post('/bulk', bulkPayoutValidation, payoutsController.createBulkPayouts);
router.get('/:payout_id', payoutsController.getPayout);
router.get('/', payoutsController.getPayouts);
router.post('/:payout_id/retry', payoutsController.retryPayout);
router.post('/:payout_id/cancel', payoutsController.cancelPayout);
router.get('/status/:reference', payoutsController.getPayoutStatus);

module.exports = router;
