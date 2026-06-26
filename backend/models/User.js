const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
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
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  teamId: {
    type: String,
    default: 'default-team'
  },
  rating: {
    type: Number,
    default: 1000
  },
  tasksCompleted: {
    type: Number,
    default: 0
  },
  tasksCompletedOnTime: {
    type: Number,
    default: 0
  },
  tasksCompletedLate: {
    type: Number,
    default: 0
  },
  totalRatingChange: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);