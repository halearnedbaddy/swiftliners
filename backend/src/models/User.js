const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  business_name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  use_case: {
    type: String,
    required: true,
    enum: ['e-commerce', 'marketplace', 'freelance', 'payment-gateway', 'other']
  },
  website: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'suspended'],
    default: 'pending'
  },
  mode: {
    type: String,
    enum: ['test', 'live'],
    default: 'test'
  },
  api_keys: {
    public_test: String,
    secret_test: String,
    public_live: String,
    secret_live: String
  },
  kyc_status: {
    type: String,
    enum: ['not_submitted', 'pending', 'approved', 'rejected'],
    default: 'not_submitted'
  },
  kyc_documents: {
    company_registration: String,
    tax_certificate: String,
    business_permit: String,
    owner_id: String,
    owner_selfie: String,
    bank_statement: String
  },
  trust_score: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  metadata: {
    ip_address: String,
    user_agent: String,
    last_login: Date
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Generate API keys
userSchema.methods.generateAPIKeys = function() {
  const { v4: uuidv4 } = require('uuid');
  
  this.api_keys = {
    public_test: `pk_test_${uuidv4().replace(/-/g, '')}`,
    secret_test: `sk_test_${uuidv4().replace(/-/g, '')}`,
    public_live: this.mode === 'live' ? `pk_live_${uuidv4().replace(/-/g, '')}` : null,
    secret_live: this.mode === 'live' ? `sk_live_${uuidv4().replace(/-/g, '')}` : null
  };
  
  return this.api_keys;
};

module.exports = mongoose.model('User', userSchema);
