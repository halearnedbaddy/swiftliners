const mongoose = require('mongoose');

const escrowSchema = new mongoose.Schema({
  escrow_id: {
    type: String,
    required: true,
    unique: true
  },
  transaction_id: {
    type: String,
    required: true,
    ref: 'Transaction'
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
  parties: {
    payer: {
      user_id: String,
      wallet_id: String,
      name: String,
      email: String
    },
    payee: {
      user_id: String,
      wallet_id: String,
      name: String,
      email: String
    }
  },
  conditions: {
    type: [{
      type: String,
      description: String,
      fulfilled: {
        type: Boolean,
        default: false
      },
      fulfilled_at: Date,
      fulfilled_by: String
    }],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'funded', 'active', 'released', 'refunded', 'disputed', 'expired'],
    default: 'pending'
  },
  timeline: {
    created_at: {
      type: Date,
      default: Date.now
    },
    funded_at: Date,
    active_at: Date,
    release_requested_at: Date,
    released_at: Date,
    refunded_at: Date,
    disputed_at: Date,
    expires_at: Date
  },
  release_settings: {
    auto_release: {
      type: Boolean,
      default: false
    },
    auto_release_date: Date,
    require_all_conditions: {
      type: Boolean,
      default: true
    },
  },
  fees: {
    escrow_fee: {
      type: Number,
      default: 0
    },
    processing_fee: {
      type: Number,
      default: 0
    },
    total_fee: {
      type: Number,
      default: 0
    }
  },
  disputes: [{
    dispute_id: String,
    raised_by: String,
    reason: String,
    description: String,
    status: {
      type: String,
      enum: ['open', 'investigating', 'resolved', 'closed'],
      default: 'open'
    },
    raised_at: {
      type: Date,
      default: Date.now
    },
    resolved_at: Date,
    resolution: String,
    evidence: [{
      type: String,
      url: String,
      uploaded_by: String,
      uploaded_at: {
        type: Date,
        default: Date.now
      }
    }]
  }],
  metadata: {
    description: String,
    reference: String,
    contract_url: String,
    tags: [String]
  }
}, {
  timestamps: true
});

// Indexes
escrowSchema.index({ escrow_id: 1 });
escrowSchema.index({ 'parties.payer.user_id': 1 });
escrowSchema.index({ 'parties.payee.user_id': 1 });
escrowSchema.index({ status: 1 });
escrowSchema.index({ 'timeline.expires_at': 1 });

// Virtual to check if all conditions are fulfilled
escrowSchema.virtual('allConditionsFulfilled').get(function() {
  if (this.conditions.length === 0) return true;
  return this.conditions.every(condition => condition.fulfilled);
});

// Method to fund escrow
escrowSchema.methods.fund = function() {
  this.status = 'funded';
  this.timeline.funded_at = new Date();
  return this.save();
};

// Method to activate escrow
escrowSchema.methods.activate = function() {
  this.status = 'active';
  this.timeline.active_at = new Date();
  return this.save();
};

// Method to fulfill condition
escrowSchema.methods.fulfillCondition = function(conditionId, fulfilledBy) {
  const condition = this.conditions.id(conditionId);
  if (!condition) {
    throw new Error('Condition not found');
  }
  
  condition.fulfilled = true;
  condition.fulfilled_at = new Date();
  condition.fulfilled_by = fulfilledBy;
  
  // Check if all conditions are fulfilled and auto-release is enabled
  if (this.allConditionsFulfilled && this.release_settings.auto_release) {
    return this.release();
  }
  
  return this.save();
};

// Method to request release
escrowSchema.methods.requestRelease = function() {
  this.timeline.release_requested_at = new Date();
  
  if (this.allConditionsFulfilled || !this.release_settings.require_all_conditions) {
    return this.release();
  }
  
  return this.save();
};

// Method to release funds
escrowSchema.methods.release = function() {
  this.status = 'released';
  this.timeline.released_at = new Date();
  return this.save();
};

// Method to refund funds
escrowSchema.methods.refund = function(reason) {
  this.status = 'refunded';
  this.timeline.refunded_at = new Date();
  this.metadata.refund_reason = reason;
  return this.save();
};

// Method to raise dispute
escrowSchema.methods.raiseDispute = function(raisedBy, reason, description) {
  const { v4: uuidv4 } = require('uuid');
  
  this.disputes.push({
    dispute_id: uuidv4(),
    raised_by: raisedBy,
    reason: reason,
    description: description,
    status: 'open'
  });
  
  this.status = 'disputed';
  this.timeline.disputed_at = new Date();
  
  return this.save();
};

// Method to check if expired
escrowSchema.methods.isExpired = function() {
  return this.timeline.expires_at && new Date() > this.timeline.expires_at;
};

module.exports = mongoose.model('Escrow', escrowSchema);
