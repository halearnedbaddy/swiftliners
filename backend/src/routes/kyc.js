const express = require('express');
const { body } = require('express-validator');
const kycController = require('../controllers/kycController');
const { apiKeyAuth } = require('../middleware/auth');

const router = express.Router();

// All KYC routes require API key authentication
router.use(apiKeyAuth);

// Validation rules
const kycSubmissionValidation = [
  body('business_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Business name must be between 2 and 100 characters'),
  body('business_description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Business description must not exceed 500 characters'),
  body('physical_address')
    .trim()
    .notEmpty()
    .withMessage('Physical address is required'),
  body('business_type')
    .isIn(['sole_proprietor', 'partnership', 'private_limited', 'public_limited', 'ngo', 'other'])
    .withMessage('Valid business type required'),
  body('registration_number')
    .trim()
    .notEmpty()
    .withMessage('Business registration number is required'),
  body('tax_pin')
    .trim()
    .notEmpty()
    .withMessage('Tax PIN is required'),
  body('contact_person')
    .trim()
    .notEmpty()
    .withMessage('Contact person name is required'),
  body('contact_person_phone')
    .isMobilePhone()
    .withMessage('Valid contact person phone number required'),
  body('contact_person_email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid contact person email required'),
  body('expected_monthly_volume')
    .isFloat({ gt: 0 })
    .withMessage('Expected monthly volume must be greater than 0')
];

// Routes
router.post('/submit', kycSubmissionValidation, kycController.submitKYC);
router.get('/status', kycController.getKYCStatus);
router.post('/documents/upload', kycController.uploadDocuments);
router.get('/documents', kycController.getDocuments);
router.put('/documents/:documentId', kycController.updateDocument);
router.delete('/documents/:documentId', kycController.deleteDocument);

module.exports = router;
