const express = require('express');
const { query } = require('express-validator');
const ledgerController = require('../controllers/ledgerController');
const { apiKeyAuth, requireKYC } = require('../middleware/auth');

const router = express.Router();

// All ledger routes require API key authentication
router.use(apiKeyAuth);

// Validation rules
const getEntriesValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('from_date')
    .optional()
    .isISO8601()
    .withMessage('Valid from_date required'),
  query('to_date')
    .optional()
    .isISO8601()
    .withMessage('Valid to_date required'),
  query('entry_type')
    .optional()
    .isIn(['payment', 'refund', 'transfer', 'fee', 'escrow_lock', 'escrow_release'])
    .withMessage('Invalid entry type')
];

// Routes
router.get('/entries', getEntriesValidation, ledgerController.getLedgerEntries);
router.get('/entries/:entry_id', ledgerController.getLedgerEntry);
router.get('/balance', ledgerController.getAccountBalance);
router.get('/summary', ledgerController.getLedgerSummary);
router.get('/transactions/:transaction_id', ledgerController.getTransactionLedger);

module.exports = router;
