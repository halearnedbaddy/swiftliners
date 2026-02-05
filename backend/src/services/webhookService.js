const crypto = require('crypto');
const axios = require('axios');
const logger = require('../utils/logger');

class WebhookService {
  constructor() {
    this.webhookSecret = process.env.WEBHOOK_SECRET || 'default_webhook_secret';
    this.maxRetries = 3;
    this.retryDelays = [5000, 15000, 45000]; // 5s, 15s, 45s
  }

  // Generate webhook signature
  generateSignature(payload) {
    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  // Verify webhook signature
  verifySignature(payload, signature) {
    const expectedSignature = this.generateSignature(payload);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  // Send webhook with retry logic
  async sendWebhook(url, payload, options = {}) {
    const signature = this.generateSignature(payload);
    const webhookId = `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const webhookData = {
      id: webhookId,
      event: payload.event,
      data: payload.data,
      timestamp: new Date().toISOString(),
      signature
    };

    let attempt = 0;
    let lastError = null;

    while (attempt < this.maxRetries) {
      try {
        const startTime = Date.now();
        
        const response = await axios.post(url, webhookData, {
          timeout: 30000, // 30 seconds timeout
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'PayLoom-Webhooks/1.0',
            'X-PayLoom-Webhook-ID': webhookId,
            'X-PayLoom-Webhook-Signature': signature
          },
          ...options
        });

        const duration = Date.now() - startTime;

        logger.info('Webhook delivered successfully', {
          webhookId,
          url,
          event: payload.event,
          attempt: attempt + 1,
          duration: `${duration}ms`,
          status: response.status
        });

        return {
          success: true,
          webhookId,
          attempt: attempt + 1,
          duration,
          status: response.status
        };

      } catch (error) {
        lastError = error;
        attempt++;

        logger.warn('Webhook delivery failed, retrying', {
          webhookId,
          url,
          event: payload.event,
          attempt,
          error: error.message,
          nextRetryIn: attempt < this.maxRetries ? this.retryDelays[attempt - 1] : null
        });

        // Wait before retry (except for the last attempt)
        if (attempt < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelays[attempt - 1]));
        }
      }
    }

    // All attempts failed
    logger.error('Webhook delivery failed after all retries', {
      webhookId,
      url,
      event: payload.event,
      totalAttempts: attempt,
      finalError: lastError.message
    });

    return {
      success: false,
      webhookId,
      totalAttempts: attempt,
      error: lastError.message
    };
  }

  // Queue webhook for background processing
  queueWebhook(url, payload, priority = 'normal') {
    // In production, this would use a proper queue system like Redis or Bull
    // For now, we'll use setTimeout for background processing
    const delay = priority === 'high' ? 0 : 1000;
    
    setTimeout(async () => {
      try {
        await this.sendWebhook(url, payload);
      } catch (error) {
        logger.error('Queued webhook processing failed:', error);
      }
    }, delay);

    return {
      queued: true,
      priority,
      estimatedDelivery: Date.now() + delay
    };
  }

  // Send webhook for transaction events
  async sendTransactionWebhook(transaction, eventType) {
    if (!transaction.metadata.webhook_url) {
      return { skipped: true, reason: 'No webhook URL configured' };
    }

    const payload = {
      event: `transaction.${eventType}`,
      data: {
        transaction_id: transaction.transaction_id,
        type: transaction.type,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
        fees: transaction.fees,
        net_amount: transaction.net_amount,
        customer: {
          email: transaction.metadata.customer_email,
          name: transaction.metadata.customer_name
        },
        created_at: transaction.created_at,
        updated_at: transaction.updated_at
      }
    };

    return await this.sendWebhook(transaction.metadata.webhook_url, payload);
  }

  // Send webhook for escrow events
  async sendEscrowWebhook(escrow, eventType) {
    // Get webhook URL from one of the parties
    const webhookUrl = escrow.metadata.webhook_url;
    if (!webhookUrl) {
      return { skipped: true, reason: 'No webhook URL configured' };
    }

    const payload = {
      event: `escrow.${eventType}`,
      data: {
        escrow_id: escrow.escrow_id,
        transaction_id: escrow.transaction_id,
        amount: escrow.amount,
        currency: escrow.currency,
        status: escrow.status,
        parties: escrow.parties,
        conditions: escrow.conditions,
        timeline: escrow.timeline,
        created_at: escrow.created_at,
        updated_at: escrow.updated_at
      }
    };

    return await this.sendWebhook(webhookUrl, payload);
  }

  // Send webhook for wallet events
  async sendWalletWebhook(wallet, eventType, additionalData = {}) {
    // In a real implementation, you'd get webhook URL from user's settings
    const webhookUrl = wallet.metadata.webhook_url;
    if (!webhookUrl) {
      return { skipped: true, reason: 'No webhook URL configured' };
    }

    const payload = {
      event: `wallet.${eventType}`,
      data: {
        wallet_id: wallet.wallet_id,
        owner_type: wallet.owner_type,
        owner_id: wallet.owner_id,
        currency: wallet.currency,
        balances: wallet.balances,
        status: wallet.status,
        ...additionalData,
        timestamp: new Date().toISOString()
      }
    };

    return await this.sendWebhook(webhookUrl, payload);
  }

  // Send webhook for KYC events
  async sendKYCWebhook(user, eventType) {
    // Get webhook URL from user's metadata or settings
    const webhookUrl = user.metadata.webhook_url;
    if (!webhookUrl) {
      return { skipped: true, reason: 'No webhook URL configured' };
    }

    const payload = {
      event: `kyc.${eventType}`,
      data: {
        user_id: user._id,
        business_name: user.business_name,
        email: user.email,
        kyc_status: user.kyc_status,
        trust_score: user.trust_score,
        status: user.status,
        mode: user.mode,
        timestamp: new Date().toISOString()
      }
    };

    return await this.sendWebhook(webhookUrl, payload);
  }

  // Batch send multiple webhooks
  async sendBatchWebhooks(webhooks) {
    const results = await Promise.allSettled(
      webhooks.map(({ url, payload, priority }) => 
        this.sendWebhook(url, payload, { priority })
      )
    );

    return results.map((result, index) => ({
      index,
      success: result.status === 'fulfilled',
      data: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason.message : null
    }));
  }

  // Get webhook delivery statistics
  getWebhookStats(timeframe = '24h') {
    // In a real implementation, this would query a database
    // For now, return mock statistics
    return {
      timeframe,
      total_sent: 1250,
      total_delivered: 1187,
      total_failed: 63,
      delivery_rate: 0.9496,
      average_delivery_time: '2.3s',
      failed_by_reason: {
        'timeout': 28,
        'connection_error': 19,
        '5xx_error': 12,
        '4xx_error': 4
      }
    };
  }
}

// Create singleton instance
const webhookService = new WebhookService();

// Export main functions for backward compatibility
const sendWebhook = (url, payload, options) => webhookService.sendWebhook(url, payload, options);
const verifyWebhookSignature = (payload, signature) => webhookService.verifySignature(payload, signature);

module.exports = {
  WebhookService,
  webhookService,
  sendWebhook,
  verifyWebhookSignature
};
