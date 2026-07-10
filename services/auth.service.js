const crypto = require('crypto');
const { getDb } = require('../db');
const { setAuthToken, deleteAuthToken, TOKEN_TTL } = require('./redis.service');
const { emailQueue } = require('./queue.service');

const OTP_COLLECTION = 'otp_store';
const DEMO_EMAIL = (process.env.DEMO_EMAIL || '').trim().toLowerCase();
const DEMO_OTP = (process.env.DEMO_OTP || '').trim();

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function sendOtp(email) {
  const normalizedEmail = email.trim().toLowerCase();

  // Demo account: skip email sending, accept fixed OTP
  if (DEMO_EMAIL && DEMO_OTP && normalizedEmail === DEMO_EMAIL) {
    console.log(`[AUTH] Demo account OTP bypass for ${normalizedEmail}`);
    return { success: true };
  }

  const db = getDb();

  // Rate-limit: block repeated requests within 60 seconds
  const recent = await db.collection(OTP_COLLECTION).findOne({
    email: normalizedEmail,
    createdAt: { $gt: new Date(Date.now() - 60 * 1000) },
  });
  if (recent) {
    console.log(`[AUTH] send-otp blocked (rate-limit) for ${normalizedEmail}`);
    const err = new Error('Please wait a moment before requesting another OTP.');
    err.status = 429;
    throw err;
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await db.collection(OTP_COLLECTION).updateOne(
    { email: normalizedEmail },
    { $set: { email: normalizedEmail, otp, expiresAt, createdAt: new Date() } },
    { upsert: true }
  );

  await emailQueue.add('send-otp', { to: normalizedEmail, otp });

  console.log(`[AUTH] OTP email enqueued for ${normalizedEmail}`);
  return { success: true };
}

async function verifyOtp(email, otp) {
  const normalizedEmail = email.trim().toLowerCase();

  // Demo account: accept fixed OTP without DB lookup
  if (DEMO_EMAIL && DEMO_OTP && normalizedEmail === DEMO_EMAIL && otp.trim() === DEMO_OTP) {
    console.log(`[AUTH] Demo account verified for ${normalizedEmail}`);
    const token = generateToken();
    await setAuthToken(token, { email: normalizedEmail });
    return { success: true, token, expiresIn: TOKEN_TTL };
  }

  const db = getDb();
  const record = await db.collection(OTP_COLLECTION).findOne({ email: normalizedEmail });

  if (!record) {
    const err = new Error('No OTP found. Please request a new one.');
    err.status = 400;
    throw err;
  }
  if (new Date() > record.expiresAt) {
    await db.collection(OTP_COLLECTION).deleteOne({ email: normalizedEmail });
    const err = new Error('OTP expired. Please request a new one.');
    err.status = 400;
    throw err;
  }
  if (record.otp !== otp.trim()) {
    const err = new Error('Incorrect OTP. Please try again.');
    err.status = 400;
    throw err;
  }

  await db.collection(OTP_COLLECTION).deleteOne({ email: normalizedEmail });

  const token = generateToken();
  await setAuthToken(token, { email: normalizedEmail });
  console.log(`[AUTH] OTP verified for ${normalizedEmail}`);
  return { success: true, token, expiresIn: TOKEN_TTL };
}

async function logout(token) {
  await deleteAuthToken(token);
}

module.exports = { sendOtp, verifyOtp, logout };
