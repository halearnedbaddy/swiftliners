const express = require('express');
const { body } = require('express-validator');
const escrowController = require('../controllers/escrowController');
const { apiKeyAuth, requireKYC } = require('../middleware/auth');

const router = express.Router();

// All escrow routes require API key authentication
router.use(apiKeyAuth);

// Validation rules
const createEscrowValidation = [
  body('amount')
    .isFloat({ gt: 0 })
    .withMessage('Amount must be greater than 0'),
  body('currency')
    .optional()
    .isIn(['KES', 'USD', 'EUR'])
    .withMessage('Invalid currency'),
  body('payer_wallet_id')
    .notEmpty()
    .withMessage('Payer wallet ID is required'),
  body('payee_wallet_id')
    .notEmpty()
    .withMessage('Payee wallet ID is required'),
  body('conditions')
    .isArray({ min: 1 })
    .withMessage('At least one condition is required'),
  body('conditions.*.type')
    .notEmpty()
    .withMessage('Condition type is required'),
  body('conditions.*.description')
    .notEmpty()
    .withMessage('Condition description is required'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),
  body('auto_release_date')
    .optional()
    .isISO8601()
    .withMessage('Valid auto-release date required'),
  body('reference')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Reference must not exceed 100 characters')
];

const fulfillConditionValidation = [
  body('fulfilled_by')
    .notEmpty()
    .withMessage('Fulfilled by is required'),
  body('evidence')
    .optional()
    .isArray()
    .withMessage('Evidence must be an array')
];

// Routes
router.post('/create', createEscrowValidation, escrowController.createEscrow);
router.get('/:escrow_id', escrowController.getEscrow);
router.get('/', escrowController.getEscrows);
router.post('/:escrow_id/conditions/:condition_id/fulfill', fulfillConditionValidation, escrowController.fulfillCondition);
router.post('/:escrow_id/release', escrowController.releaseEscrow);
router.post('/:escrow_id/refund', escrowController.refundEscrow);
router.post('/:escrow_id/dispute', escrowController.raiseDispute);
router.get('/:escrow_id/disputes', escrowController.getDisputes);
router.post('/:escrow_id/disputes/:dispute_id/evidence', escrowController.addDisputeEvidence);

module.exports = router;
