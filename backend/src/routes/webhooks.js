const express = require('express');
const { body } = require('express-validator');
const webhooksController = require('../controllers/webhooksController');
const { apiKeyAuth } = require('../middleware/auth');

const router = express.Router();

// Webhook routes - some require API key auth, others are public for provider callbacks

// Public webhook endpoints for payment providers
router.post('/mpesa/c2b/confirmation', webhooksController.mpesaC2BConfirmation);
router.post('/mpesa/c2b/validation', webhooksController.mpesaC2BValidation);
router.post('/mpesa/b2c/result', webhooksController.mpesaB2CResult);
router.post('/mpesa/b2c/timeout', webhooksController.mpesaB2CTimeout);

// Card payment webhooks
router.post('/stripe/webhook', webhooksController.stripeWebhook);
router.post('/flutterwave/webhook', webhooksController.flutterwaveWebhook);

// Bank transfer webhooks
router.post('/bank/confirmation', webhooksController.bankConfirmation);

// User webhook management (requires authentication)
router.use('/manage', apiKeyAuth);

const webhookValidation = [
  body('url')
    .isURL()
    .withMessage('Valid webhook URL required'),
  body('events')
    .isArray({ min: 1 })
    .withMessage('At least one event required'),
  body('events.*')
    .isIn(['transaction.completed', 'transaction.failed', 'escrow.locked', 'escrow.released', 'wallet.funded', 'wallet.debited', 'kyc.submitted', 'kyc.approved', 'kyc.rejected'])
    .withMessage('Invalid event type')
];

router.post('/manage', webhookValidation, webhooksController.createWebhook);
router.get('/manage', webhooksController.getWebhooks);
router.put('/manage/:webhook_id', webhookValidation, webhooksController.updateWebhook);
router.delete('/manage/:webhook_id', webhooksController.deleteWebhook);
router.post('/manage/:webhook_id/test', webhooksController.testWebhook);

module.exports = router;
