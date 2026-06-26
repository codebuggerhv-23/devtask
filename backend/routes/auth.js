const express = require('express');
const router = express.Router();
const { register, login, getProfile, getLeaderboard } = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.get('/profile', authMiddleware, getProfile);
router.get('/leaderboard', authMiddleware, getLeaderboard);

module.exports = router;