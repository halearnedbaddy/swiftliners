const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  transaction_id: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    required: true,
    enum: ['collection', 'payout', 'escrow_hold', 'escrow_release', 'refund', 'fee', 'transfer']
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'reversed'],
    default: 'pending'
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    default: 'KES',
    uppercase: true
  },
  fees: {
    processing_fee: {
      type: Number,
      default: 0
    },
    platform_fee: {
      type: Number,
      default: 0
    },
    total_fee: {
      type: Number,
      default: 0
    }
  },
  net_amount: {
    type: Number,
    required: true
  },
  source: {
    wallet_id: String,
    payment_method: {
      type: String,
      enum: ['mpesa', 'card', 'bank', 'wallet']
    },
    payment_details: {
      phone_number: String,
      card_last4: String,
      bank_account: String,
      transaction_ref: String
    }
  },
  destination: {
    wallet_id: String,
    payment_method: {
      type: String,
      enum: ['mpesa', 'card', 'bank', 'wallet']
    },
    payment_details: {
      phone_number: String,
      card_last4: String,
      bank_account: String,
      transaction_ref: String
    }
  },
  escrow_details: {
    escrow_id: String,
    release_conditions: [String],
    auto_release_date: Date,
    parties: {
      payer: String,
      payee: String
    }
  },
  metadata: {
    description: String,
    reference: String,
    customer_email: String,
    customer_name: String,
    ip_address: String,
    user_agent: String,
    webhook_url: String
  },
  processing: {
    initiated_at: Date,
    completed_at: Date,
    failed_at: Date,
    failure_reason: String,
    retry_count: {
      type: Number,
      default: 0
    },
    next_retry_at: Date
  },
  webhooks: {
    delivered: {
      type: Boolean,
      default: false
    },
    delivery_attempts: {
      type: Number,
      default: 0
    },
    last_delivery_at: Date
  }
}, {
  timestamps: true
});

// Indexes for performance
transactionSchema.index({ transaction_id: 1 });
transactionSchema.index({ type: 1, status: 1 });
transactionSchema.index({ 'source.wallet_id': 1 });
transactionSchema.index({ 'destination.wallet_id': 1 });
transactionSchema.index({ created_at: -1 });
transactionSchema.index({ 'escrow_details.escrow_id': 1 });

// Pre-save middleware to calculate net amount
transactionSchema.pre('save', function(next) {
  if (this.isModified('fees')) {
    this.fees.total_fee = this.fees.processing_fee + this.fees.platform_fee;
    this.net_amount = this.amount - this.fees.total_fee;
  }
  next();
});

// Method to mark as completed
transactionSchema.methods.markCompleted = function() {
  this.status = 'completed';
  this.processing.completed_at = new Date();
  return this.save();
};

// Method to mark as failed
transactionSchema.methods.markFailed = function(reason) {
  this.status = 'failed';
  this.processing.failed_at = new Date();
  this.processing.failure_reason = reason;
  return this.save();
};

// Method to schedule retry
transactionSchema.methods.scheduleRetry = function(delayMinutes = 5) {
  this.processing.retry_count += 1;
  this.processing.next_retry_at = new Date(Date.now() + delayMinutes * 60 * 1000);
  return this.save();
};

module.exports = mongoose.model('Transaction', transactionSchema);
