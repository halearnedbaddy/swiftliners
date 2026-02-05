const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

// M-Pesa Service
class MpesaService {
  constructor() {
    this.consumerKey = process.env.MPESA_CONSUMER_KEY;
    this.consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    this.passkey = process.env.MPESA_PASSKEY;
    this.shortcode = process.env.MPESA_SHORTCODE;
    this.baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://api.safaricom.co.ke' 
      : 'https://sandbox.safaricom.co.ke';
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async getAccessToken() {
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
      
      const response = await axios.get(
        `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
        {
          headers: {
            'Authorization': `Basic ${auth}`
          }
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = new Date(Date.now() + 3500 * 1000); // Token expires in ~1 hour

      return this.accessToken;
    } catch (error) {
      logger.error('M-Pesa token generation failed:', error);
      throw new Error('Failed to generate M-Pesa access token');
    }
  }

  async initiateSTKPush(paymentData) {
    try {
      const token = await this.getAccessToken();
      const timestamp = new Date().getFullYear() + 
        String(new Date().getMonth() + 1).padStart(2, '0') +
        String(new Date().getDate()).padStart(2, '0') +
        String(new Date().getHours()).padStart(2, '0') +
        String(new Date().getMinutes()).padStart(2, '0') +
        String(new Date().getSeconds()).padStart(2, '0');

      const password = crypto.createHash('sha256')
        .update(this.shortcode + this.passkey + timestamp)
        .digest('base64');

      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
        {
          BusinessShortCode: this.shortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: 'CustomerPayBillOnline',
          Amount: paymentData.amount,
          PartyA: paymentData.phone_number.replace('+', ''),
          PartyB: this.shortcode,
          PhoneNumber: paymentData.phone_number.replace('+', ''),
          CallBackURL: `${process.env.BASE_URL}/api/v1/webhooks/mpesa/callback`,
          AccountReference: paymentData.transaction_id.substring(0, 12),
          TransactionDesc: paymentData.description || 'Payment'
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        status: 'pending',
        reference: response.data.CheckoutRequestID,
        merchant_request_id: response.data.MerchantRequestID,
        customer_message: response.data.CustomerMessage
      };

    } catch (error) {
      logger.error('M-Pesa STK Push failed:', error.response?.data || error.message);
      throw new Error('M-Pesa payment initiation failed');
    }
  }

  async queryTransactionStatus(checkoutRequestID) {
    try {
      const token = await this.getAccessToken();
      const timestamp = new Date().getFullYear() + 
        String(new Date().getMonth() + 1).padStart(2, '0') +
        String(new Date().getDate()).padStart(2, '0') +
        String(new Date().getHours()).padStart(2, '0') +
        String(new Date().getMinutes()).padStart(2, '0') +
        String(new Date().getSeconds()).padStart(2, '0');

      const password = crypto.createHash('sha256')
        .update(this.shortcode + this.passkey + timestamp)
        .digest('base64');

      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpushquery/v1/query`,
        {
          BusinessShortCode: this.shortcode,
          Password: password,
          Timestamp: timestamp,
          CheckoutRequestID: checkoutRequestID
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const result = response.data;
      
      if (result.ResultCode === 0) {
        return {
          status: 'completed',
          mpesa_receipt: result.ResultParameters?.find(p => p.Key === 'MpesaReceiptNumber')?.Value,
          phone_number: result.ResultParameters?.find(p => p.Key === 'PhoneNumber')?.Value,
          amount: result.ResultParameters?.find(p => p.Key === 'Amount')?.Value,
          transaction_date: result.ResultParameters?.find(p => p.Key === 'TransactionDate')?.Value
        };
      } else if (result.ResultCode === 1032) {
        return {
          status: 'pending',
          message: 'Transaction cancelled by user'
        };
      } else {
        return {
          status: 'failed',
          error: result.ResultDesc
        };
      }

    } catch (error) {
      logger.error('M-Pesa status query failed:', error.response?.data || error.message);
      throw new Error('Failed to query M-Pesa transaction status');
    }
  }
}

// Card Payment Service (Stripe Integration)
class CardService {
  constructor() {
    this.secretKey = process.env.STRIPE_SECRET_KEY;
    this.publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  }

  async createPaymentIntent(paymentData) {
    try {
      // For demo purposes, return mock response
      // In production, integrate with actual Stripe API
      const paymentIntentId = `pi_${crypto.randomBytes(16).toString('hex')}`;
      
      return {
        status: 'pending',
        reference: paymentIntentId,
        client_secret: `${paymentIntentId}_secret_${crypto.randomBytes(16).toString('hex')}`,
        amount: paymentData.amount,
        currency: paymentData.currency.toLowerCase()
      };

    } catch (error) {
      logger.error('Card payment creation failed:', error);
      throw new Error('Failed to create card payment');
    }
  }

  async confirmPayment(paymentIntentId) {
    try {
      // Mock implementation
      return {
        status: 'completed',
        reference: paymentIntentId,
        paid: true,
        amount: 0 // Would be populated from actual Stripe response
      };

    } catch (error) {
      logger.error('Card payment confirmation failed:', error);
      throw new Error('Failed to confirm card payment');
    }
  }
}

// Bank Transfer Service
class BankService {
  async initiateTransfer(paymentData) {
    try {
      // Mock implementation for bank transfers
      const transferId = `bank_${crypto.randomBytes(16).toString('hex')}`;
      
      return {
        status: 'pending',
        reference: transferId,
        bank_reference: `BRF${Date.now()}`,
        estimated_arrival: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) // 2 days
      };

    } catch (error) {
      logger.error('Bank transfer initiation failed:', error);
      throw new Error('Failed to initiate bank transfer');
    }
  }

  async queryTransferStatus(transferId) {
    try {
      // Mock implementation
      return {
        status: 'completed',
        reference: transferId,
        settled_at: new Date()
      };

    } catch (error) {
      logger.error('Bank transfer status query failed:', error);
      throw new Error('Failed to query bank transfer status');
    }
  }
}

// Initialize services
const mpesaService = new MpesaService();
const cardService = new CardService();
const bankService = new BankService();

// Main payment processing functions
const processMpesaPayment = async (paymentData) => {
  return await mpesaService.initiateSTKPush(paymentData);
};

const processCardPayment = async (paymentData) => {
  return await cardService.createPaymentIntent(paymentData);
};

const processBankPayment = async (paymentData) => {
  return await bankService.initiateTransfer(paymentData);
};

const checkPaymentStatus = async (transaction) => {
  try {
    switch (transaction.source.payment_method) {
      case 'mpesa':
        return await mpesaService.queryTransactionStatus(
          transaction.source.payment_details.transaction_ref
        );
      
      case 'card':
        return await cardService.confirmPayment(
          transaction.source.payment_details.transaction_ref
        );
      
      case 'bank':
        return await bankService.queryTransferStatus(
          transaction.source.payment_details.transaction_ref
        );
      
      default:
        throw new Error('Unsupported payment method');
    }
  } catch (error) {
    logger.error('Payment status check failed:', error);
    return { status: 'failed', error: error.message };
  }
};

const cancelPaymentWithProvider = async (transaction) => {
  try {
    // Implementation would depend on the payment provider
    logger.info(`Cancelling payment: ${transaction.transaction_id}`);
    
    // Mock cancellation
    return { cancelled: true };
    
  } catch (error) {
    logger.error('Payment cancellation failed:', error);
    throw new Error('Failed to cancel payment');
  }
};

module.exports = {
  processMpesaPayment,
  processCardPayment,
  processBankPayment,
  checkPaymentStatus,
  cancelPaymentWithProvider,
  MpesaService,
  CardService,
  BankService
};
