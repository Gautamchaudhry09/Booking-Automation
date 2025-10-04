const mongoose = require('mongoose');

const bookingHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BookingProfile',
    required: true
  },
  automationId: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    required: true,
    enum: ['running', 'completed', 'failed', 'cancelled'],
    default: 'running'
  },
  bookingDetails: {
    username: String,
    date: String,
    courtNumber: String,
    timeSlot: String,
    useChromeProfile: Boolean
  },
  result: {
    success: Boolean,
    paymentUrl: String,
    error: String,
    completedAt: Date
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  },
  duration: {
    type: Number // Duration in milliseconds
  }
}, {
  timestamps: true
});

// Index for efficient queries
bookingHistorySchema.index({ userId: 1, startedAt: -1 });
bookingHistorySchema.index({ automationId: 1 });

// Calculate duration when booking completes
bookingHistorySchema.methods.calculateDuration = function() {
  if (this.completedAt && this.startedAt) {
    this.duration = this.completedAt.getTime() - this.startedAt.getTime();
  }
  return this;
};

// Mark booking as completed
bookingHistorySchema.methods.markCompleted = function(result) {
  this.status = 'completed';
  this.result = result;
  this.completedAt = new Date();
  this.calculateDuration();
  return this.save();
};

// Mark booking as failed
bookingHistorySchema.methods.markFailed = function(error) {
  this.status = 'failed';
  this.result = { success: false, error };
  this.completedAt = new Date();
  this.calculateDuration();
  return this.save();
};

module.exports = mongoose.model('BookingHistory', bookingHistorySchema);
