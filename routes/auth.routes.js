const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { validateBody } = require('../middleware/validate.middleware');

const router = Router();

router.post('/send-otp',
  validateBody({
    email: (v) => (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) ? 'Valid email required' : null,
  }),
  authController.sendOtp
);

router.post('/verify-otp',
  validateBody({
    email: (v) => !v ? 'Email is required' : null,
    otp: (v) => !v ? 'OTP is required' : null,
  }),
  authController.verifyOtp
);

router.post('/logout', requireAuth, authController.logout);

module.exports = router;
