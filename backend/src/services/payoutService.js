const axios = require('axios');
const logger = require('../utils/logger');

// M-Pesa Payout Processing
const processMpesaPayout = async (payoutData) => {
  try {
    const { payout_id, amount, phone_number, recipient_name, description } = payoutData;
    
    // Generate M-Pesa B2C request
    const mpesaResponse = await initiateMpesaB2C({
      amount,
      phone_number,
      recipient_name,
      command_id: 'BusinessPayment', // Can be: SalaryPayment, BusinessPayment, PromotionPayment
      remarks: description || `Payout ${payout_id}`,
      occasion: 'Payment'
    });
    
    logger.info(`M-Pesa payout initiated: ${payout_id}`, {
      conversation_id: mpesaResponse.ConversationID,
      originator_conversation_id: mpesaResponse.OriginatorConversationID
    });
    
    return {
      status: 'pending',
      reference: mpesaResponse.ConversationID,
      originator_conversation_id: mpesaResponse.OriginatorConversationID,
      provider: 'mpesa',
      estimated_completion: '2-5 minutes'
    };
    
  } catch (error) {
    logger.error('M-Pesa payout error:', error);
    throw new Error(`M-Pesa payout failed: ${error.message}`);
  }
};

// Bank Transfer Processing
const processBankPayout = async (payoutData) => {
  try {
    const { payout_id, amount, bank_account, recipient_name, description } = payoutData;
    
    // Simulate bank transfer processing
    // In production, integrate with actual bank APIs like:
    // - Kenya: Equity Bank, KCB, Co-op Bank APIs
    // - Nigeria: Paystack, Flutterwave bank transfers
    // - Ghana: Zeepay, MTN Mobile Money
    
    const bankResponse = await initiateBankTransfer({
      amount,
      account_number: bank_account.account_number,
      account_name: recipient_name,
      bank_code: bank_account.bank_code,
      routing_number: bank_account.routing_number,
      description: description || `Bank transfer ${payout_id}`
    });
    
    logger.info(`Bank payout initiated: ${payout_id}`, {
      transaction_id: bankResponse.transaction_id,
      bank_code: bank_account.bank_code
    });
    
    return {
      status: 'processing',
      reference: bankResponse.transaction_id,
      provider: 'bank',
      estimated_completion: '1-3 business days'
    };
    
  } catch (error) {
    logger.error('Bank payout error:', error);
    throw new Error(`Bank transfer failed: ${error.message}`);
  }
};

// Wallet Transfer Processing
const processWalletPayout = async (payoutData) => {
  try {
    const { payout_id, amount, wallet_id, description } = payoutData;
    
    // Get destination wallet
    const Wallet = require('../models/Wallet');
    const destinationWallet = await Wallet.findOne({ wallet_id });
    
    if (!destinationWallet) {
      throw new Error('Destination wallet not found');
    }
    
    // Process internal wallet transfer
    destinationWallet.balances.available += amount;
    destinationWallet.balances.total += amount;
    await destinationWallet.save();
    
    logger.info(`Wallet payout completed: ${payout_id}`, {
      destination_wallet: wallet_id,
      amount
    });
    
    return {
      status: 'completed',
      reference: payout_id,
      provider: 'wallet',
      completed_at: new Date()
    };
    
  } catch (error) {
    logger.error('Wallet payout error:', error);
    throw new Error(`Wallet transfer failed: ${error.message}`);
  }
};

// M-Pesa B2C API Integration
const initiateMpesaB2C = async (requestData) => {
  const { amount, phone_number, recipient_name, command_id, remarks, occasion } = requestData;
  
  try {
    // Get M-Pesa access token
    const token = await getMpesaAccessToken();
    
    // Prepare B2C request
    const b2cRequest = {
      InitiatorName: process.env.MPESA_INITIATOR_NAME || 'testapi',
      SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL || 'testcredential',
      CommandID: command_id,
      Amount: Math.round(amount), // M-Pesa requires whole numbers
      PartyA: process.env.MPESA_SHORTCODE,
      PartyB: phone_number.replace(/[^0-9]/g, ''), // Clean phone number
      Remarks: remarks,
      QueueTimeOutURL: `${process.env.BASE_URL || 'http://localhost:3000'}/webhooks/mpesa/b2c/timeout`,
      ResultURL: `${process.env.BASE_URL || 'http://localhost:3000'}/webhooks/mpesa/b2c/result`,
      Occasion: occasion
    };
    
    // Make B2C API call
    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest',
      b2cRequest,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data;
    
  } catch (error) {
    logger.error('M-Pesa B2C API error:', error.response?.data || error.message);
    throw error;
  }
};

// Get M-Pesa Access Token
const getMpesaAccessToken = async () => {
  try {
    const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
    
    const response = await axios.get(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      {
        headers: {
          'Authorization': `Basic ${auth}`
        }
      }
    );
    
    return response.data.access_token;
    
  } catch (error) {
    logger.error('M-Pesa auth error:', error.response?.data || error.message);
    throw new Error('Failed to get M-Pesa access token');
  }
};

// Bank Transfer Integration (Mock Implementation)
const initiateBankTransfer = async (requestData) => {
  const { amount, account_number, account_name, bank_code, description } = requestData;
  
  // Mock bank transfer response
  // In production, integrate with actual bank APIs
  return {
    transaction_id: `bank_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    status: 'processing',
    amount,
    account_number,
    bank_code,
    description
  };
};

// Check Payout Status
const checkPayoutStatus = async (payoutData) => {
  const { provider, reference, payout_id } = payoutData;
  
  try {
    switch (provider) {
      case 'mpesa':
        return await checkMpesaStatus(reference);
      
      case 'bank':
        return await checkBankStatus(reference);
      
      case 'wallet':
        return { status: 'completed', reference };
      
      default:
        throw new Error('Unknown payout provider');
    }
    
  } catch (error) {
    logger.error(`Check payout status error (${provider}):`, error);
    throw error;
  }
};

// Check M-Pesa Transaction Status
const checkMpesaStatus = async (conversationId) => {
  try {
    // In production, query M-Pesa transaction status
    // For now, return mock response
    return {
      status: 'completed',
      transaction_id: conversationId,
      completed_at: new Date()
    };
    
  } catch (error) {
    throw new Error(`Failed to check M-Pesa status: ${error.message}`);
  }
};

// Check Bank Transfer Status
const checkBankStatus = async (transactionId) => {
  try {
    // In production, query bank transaction status
    // For now, return mock response
    return {
      status: 'processing',
      transaction_id: transactionId,
      estimated_completion: '1-3 business days'
    };
    
  } catch (error) {
    throw new Error(`Failed to check bank status: ${error.message}`);
  }
};

// Retry Failed Payout
const retryPayout = async (payoutData) => {
  const { payment_method, ...retryData } = payoutData;
  
  try {
    switch (payment_method) {
      case 'mpesa':
        return await processMpesaPayout(retryData);
      
      case 'bank':
        return await processBankPayout(retryData);
      
      case 'wallet':
        return await processWalletPayout(retryData);
      
      default:
        throw new Error('Unsupported payment method for retry');
    }
    
  } catch (error) {
    logger.error('Payout retry error:', error);
    throw error;
  }
};

module.exports = {
  processMpesaPayout,
  processBankPayout,
  processWalletPayout,
  checkPayoutStatus,
  retryPayout
};
