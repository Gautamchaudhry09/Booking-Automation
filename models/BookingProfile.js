const mongoose = require('mongoose');

const bookingProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  profileName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  username: {
    type: String,
    required: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  date: {
    type: String,
    required: true
  },
  courtNumber: {
    type: String,
    required: true,
    enum: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15']
  },
  timeSlot: {
    type: String,
    required: true,
    enum: ['19', '20', '21']
  },
  useChromeProfile: {
    type: Boolean,
    default: true
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  lastUsed: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index to ensure unique profile names per user
bookingProfileSchema.index({ userId: 1, profileName: 1 }, { unique: true });

// Update lastUsed when profile is accessed
bookingProfileSchema.methods.updateLastUsed = function() {
  this.lastUsed = new Date();
  return this.save();
};

// Virtual for time slot display
bookingProfileSchema.virtual('timeSlotDisplay').get(function() {
  const timeSlotMap = {
    '19': '6:40 - 7:20',
    '20': '7:20 - 8:00',
    '21': '8:00 - 8:40'
  };
  return timeSlotMap[this.timeSlot] || this.timeSlot;
});

// Virtual for court display
bookingProfileSchema.virtual('courtDisplay').get(function() {
  return `Court ${this.courtNumber}`;
});

module.exports = mongoose.model('BookingProfile', bookingProfileSchema);
