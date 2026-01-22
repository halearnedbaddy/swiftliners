import { Request, Response } from 'express';
import { prisma } from '../config/database';

/**
 * Get buyer's active orders
 */
export const getMyOrders = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { status, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { buyerId: req.user.userId };
    if (status && status !== 'all') {
      where.status = status;
    }

    const [orders, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          seller: {
            select: {
              id: true,
              name: true,
              phone: true,
              sellerProfile: { select: { rating: true, totalReviews: true } },
            },
          },
          dispute: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({
      success: true,
      data: orders,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get buyer orders error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch orders' });
  }
};

/**
 * Get order details
 */
export const getOrderDetails = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { id } = req.params;

    const order = await prisma.transaction.findFirst({
      where: { id, buyerId: req.user.userId },
      include: {
        seller: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            sellerProfile: { select: { businessName: true, rating: true, totalReviews: true } },
          },
        },
        dispute: { include: { messages: true } },
      },
    });

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    console.error('Get order details error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch order details' });
  }
};

/**
 * Get buyer's wallet
 */
export const getWallet = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const wallet = await prisma.wallet.findUnique({
      where: { userId: req.user.userId },
    });

    if (!wallet) {
      return res.status(404).json({ success: false, error: 'Wallet not found' });
    }

    res.json({ success: true, data: wallet });
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch wallet' });
  }
};

/**
 * Confirm delivery for an order
 */
export const confirmDelivery = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { transactionId, deliveryOTP } = req.body;

    if (!transactionId || !deliveryOTP) {
      return res.status(400).json({ success: false, error: 'Missing transactionId or deliveryOTP' });
    }

    const order = await prisma.transaction.findFirst({
      where: { id: transactionId, buyerId: req.user.userId },
    });

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (order.status !== 'SHIPPED') {
      return res.status(400).json({ success: false, error: 'Order is not in SHIPPED status' });
    }

    // Verify OTP (simplified for demo)
    if (deliveryOTP !== '1234') {
      return res.status(401).json({ success: false, error: 'Invalid OTP' });
    }

    const updated = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'DELIVERED',
        deliveredAt: new Date(),
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Confirm delivery error:', error);
    res.status(500).json({ success: false, error: 'Failed to confirm delivery' });
  }
};

/**
 * Open a dispute
 */
export const openDispute = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { transactionId, reason, description } = req.body;

    if (!transactionId || !reason) {
      return res.status(400).json({ success: false, error: 'Missing transactionId or reason' });
    }

    const transaction = await prisma.transaction.findFirst({
      where: { id: transactionId, buyerId: req.user.userId },
    });

    if (!transaction) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    // Check if dispute already exists
    const existingDispute = await prisma.dispute.findUnique({
      where: { transactionId },
    });

    if (existingDispute) {
      return res.status(400).json({ success: false, error: 'Dispute already exists for this order' });
    }

    const dispute = await prisma.dispute.create({
      data: {
        transactionId,
        openedById: req.user.userId,
        reason,
        description,
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    res.json({ success: true, data: dispute });
  } catch (error) {
    console.error('Open dispute error:', error);
    res.status(500).json({ success: false, error: 'Failed to open dispute' });
  }
};

/**
 * Get buyer's disputes
 */
export const getDisputes = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const disputes = await prisma.dispute.findMany({
      where: { openedById: req.user.userId },
      include: {
        transaction: { select: { id: true, itemName: true, amount: true } },
        messages: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: disputes });
  } catch (error) {
    console.error('Get disputes error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch disputes' });
  }
};

/**
 * Add message to dispute
 */
export const addDisputeMessage = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { disputeId, message } = req.body;

    if (!disputeId || !message) {
      return res.status(400).json({ success: false, error: 'Missing disputeId or message' });
    }

    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { transaction: true },
    });

    if (!dispute) {
      return res.status(404).json({ success: false, error: 'Dispute not found' });
    }

    // Check if user is part of this dispute
    if (dispute.openedById !== req.user.userId && dispute.transaction.sellerId !== req.user.userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const msg = await prisma.disputeMessage.create({
      data: {
        disputeId,
        senderId: req.user.userId,
        message,
      },
    });

    res.json({ success: true, data: msg });
  } catch (error) {
    console.error('Add dispute message error:', error);
    res.status(500).json({ success: false, error: 'Failed to add message' });
  }
};

/**
 * Get recommended sellers
 */
export const getRecommendedSellers = async (req: Request, res: Response) => {
  try {
    const sellers = await prisma.user.findMany({
      where: {
        role: 'SELLER',
        isActive: true,
        sellerProfile: { isVerified: true },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        sellerProfile: {
          select: {
            businessName: true,
            rating: true,
            totalReviews: true,
            totalSales: true,
            successRate: true,
          },
        },
      },
      orderBy: {
        sellerProfile: { rating: 'desc' },
      },
      take: 10,
    });

    res.json({ success: true, data: sellers });
  } catch (error) {
    console.error('Get recommended sellers error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch sellers' });
  }
};
