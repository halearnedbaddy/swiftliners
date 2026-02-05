const express = require('express');
const { body } = require('express-validator');
const adminController = require('../controllers/adminController');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();

// All admin routes require admin authentication
router.use(adminAuth);

// Get pending accounts for approval
router.get('/pending-accounts', adminController.getPendingAccounts);

// Approve or reject account
router.post('/approve/:userId', adminController.approveAccount);
router.post('/reject/:userId', adminController.rejectAccount);

// Get KYC submissions
router.get('/kyc-submissions', adminController.getKYCSubmissions);

// Approve or reject KYC
router.post('/kyc/approve/:userId', adminController.approveKYC);
router.post('/kyc/reject/:userId', adminController.rejectKYC);

// Get all accounts
router.get('/accounts', adminController.getAllAccounts);

// Get platform statistics
router.get('/stats', adminController.getPlatformStats);

// Get transaction logs
router.get('/transactions', adminController.getTransactions);

// Get API logs
router.get('/api-logs', adminController.getAPILogs);

module.exports = router;
