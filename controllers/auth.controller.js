const authService = require('../services/auth.service');

async function sendOtp(req, res, next) {
  try {
    const result = await authService.sendOtp(req.body.email);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function verifyOtp(req, res, next) {
  try {
    const result = await authService.verifyOtp(req.body.email, req.body.otp);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const token = req.headers.authorization.slice(7).trim();
    await authService.logout(token);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { sendOtp, verifyOtp, logout };
