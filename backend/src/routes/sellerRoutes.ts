import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import {
  getSellerOrders,
  getOrderDetails,
  acceptOrder,
  rejectOrder,
  addShippingInfo,
  getSellerStats,
} from '../controllers/sellerController';

const router = Router();

// All seller routes require authentication and SELLER role
router.use(authenticate);
router.use(requireRole('SELLER', 'ADMIN'));

/**
 * GET /api/v1/seller/orders
 * Get seller's orders
 */
router.get('/orders', getSellerOrders);

/**
 * GET /api/v1/seller/orders/:id
 * Get specific order details
 */
router.get('/orders/:id', getOrderDetails);

/**
 * POST /api/v1/seller/orders/:id/accept
 * Accept an order
 */
router.post('/orders/:id/accept', acceptOrder);

/**
 * POST /api/v1/seller/orders/:id/reject
 * Reject an order
 */
router.post('/orders/:id/reject', rejectOrder);

/**
 * POST /api/v1/seller/orders/:id/shipping
 * Add shipping information
 */
router.post('/orders/:id/shipping', addShippingInfo);

/**
 * GET /api/v1/seller/stats
 * Get seller statistics
 */
router.get('/stats', getSellerStats);

export default router;
