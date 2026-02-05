const express = require('express');
const { body } = require('express-validator');
const collectionsController = require('../controllers/collectionsController');
const { apiKeyAuth, requireLiveMode } = require('../middleware/auth');

const router = express.Router();

// All collection routes require API key authentication
router.use(apiKeyAuth);

// Validation rules
const createCollectionValidation = [
  body('amount')
    .isFloat({ gt: 0 })
    .withMessage('Amount must be greater than 0'),
  body('currency')
    .optional()
    .isIn(['KES', 'USD', 'EUR'])
    .withMessage('Invalid currency'),
  body('payment_method')
    .isIn(['mpesa', 'card', 'bank'])
    .withMessage('Valid payment method required'),
  body('customer_email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid customer email required'),
  body('customer_phone')
    .isMobilePhone()
    .withMessage('Valid customer phone number required'),
  body('customer_name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Customer name must be between 2 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),
  body('webhook_url')
    .optional()
    .isURL()
    .withMessage('Valid webhook URL required'),
  body('reference')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Reference must not exceed 100 characters')
];

// Routes
router.post('/create', createCollectionValidation, collectionsController.createCollection);
router.get('/:transaction_id', collectionsController.getCollection);
router.get('/', collectionsController.getCollections);
router.post('/:transaction_id/verify', collectionsController.verifyCollection);
router.post('/:transaction_id/cancel', collectionsController.cancelCollection);

module.exports = router;
