const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  wallet_id: {
    type: String,
    required: true,
    unique: true
  },
  owner_type: {
    type: String,
    required: true,
    enum: ['user', 'business', 'system']
  },
  owner_id: {
    type: String,
    required: true,
    refPath: 'ownerModel'
  },
  ownerModel: {
    type: String,
    required: true,
    enum: ['User', 'Business']
  },
  currency: {
    type: String,
    required: true,
    default: 'KES',
    uppercase: true
  },
  balances: {
    available: {
      type: Number,
      default: 0,
      min: 0
    },
    locked: {
      type: Number,
      default: 0,
      min: 0
    },
    pending: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'frozen', 'closed'],
    default: 'active'
  },
  metadata: {
    description: String,
    tags: [String]
  }
}, {
  timestamps: true
});

// Indexes for performance
walletSchema.index({ owner_id: 1, owner_type: 1 });
walletSchema.index({ wallet_id: 1 });
walletSchema.index({ status: 1 });

// Method to check if wallet has sufficient funds
walletSchema.methods.hasSufficientFunds = function(amount, includeLocked = false) {
  if (includeLocked) {
    return (this.balances.available + this.balances.locked) >= amount;
  }
  return this.balances.available >= amount;
};

// Method to lock funds
walletSchema.methods.lockFunds = function(amount) {
  if (!this.hasSufficientFunds(amount)) {
    throw new Error('Insufficient funds');
  }
  
  this.balances.available -= amount;
  this.balances.locked += amount;
  return this.save();
};

// Method to unlock funds
walletSchema.methods.unlockFunds = function(amount) {
  if (this.balances.locked < amount) {
    throw new Error('Insufficient locked funds');
  }
  
  this.balances.locked -= amount;
  this.balances.available += amount;
  return this.save();
};

// Method to release funds (move from locked to available)
walletSchema.methods.releaseFunds = function(amount) {
  if (this.balances.locked < amount) {
    throw new Error('Insufficient locked funds');
  }
  
  this.balances.locked -= amount;
  this.balances.available += amount;
  return this.save();
};

// Method to deduct funds
walletSchema.methods.deductFunds = function(amount) {
  if (this.balances.available < amount) {
    throw new Error('Insufficient available funds');
  }
  
  this.balances.available -= amount;
  return this.save();
};

// Method to add funds
walletSchema.methods.addFunds = function(amount) {
  this.balances.available += amount;
  return this.save();
};

module.exports = mongoose.model('Wallet', walletSchema);
