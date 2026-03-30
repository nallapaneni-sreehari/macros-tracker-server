const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: __dirname + '/.env' });

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DB_NAME = 'macro_tracker';
const COLLECTION = 'kv_store';
const OTP_COLLECTION = 'otp_store';

// Nodemailer transporter (lazy)
let _transporter;
function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: parseInt(process.env.SMTP_PORT || '587') === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return _transporter;
}

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

let db;

async function connectDB() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(DB_NAME);
  await db.collection(COLLECTION).createIndex({ key: 1 }, { unique: true });
  // TTL index: MongoDB auto-deletes expired OTPs
  await db.collection(OTP_COLLECTION).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  console.log('Connected to MongoDB');
}

// Serve static assets from views/ (logo, images, etc.)
app.use(express.static(path.join(__dirname, 'views')));

// GET / — serve landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/index.html'));
});

// POST /api/auth/send-otp — generate & email a 6-digit OTP
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    const normalizedEmail = email.trim().toLowerCase();

    // Rate-limit: block repeated requests within 60 seconds
    const recent = await db.collection(OTP_COLLECTION).findOne({
      email: normalizedEmail,
      createdAt: { $gt: new Date(Date.now() - 60 * 1000) },
    });
    if (recent) {
      return res.status(429).json({ error: 'Please wait a moment before requesting another OTP.' });
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db.collection(OTP_COLLECTION).updateOne(
      { email: normalizedEmail },
      { $set: { email: normalizedEmail, otp, expiresAt, createdAt: new Date() } },
      { upsert: true }
    );

    await getTransporter().sendMail({
      from: `"MacroTracker" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: normalizedEmail,
      subject: 'Your MacroTracker login code',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0f0e1a;color:#e2e0ff;border-radius:16px;">
          <h2 style="color:#a29bfe;margin:0 0 8px">MacroTracker</h2>
          <p style="color:rgba(226,224,255,0.6);margin:0 0 24px">Your one-time login code:</p>
          <div style="font-size:44px;font-weight:900;letter-spacing:14px;color:#6C5CE7;text-align:center;padding:20px;background:rgba(108,92,231,0.12);border-radius:12px;margin-bottom:24px;">${otp}</div>
          <p style="color:rgba(226,224,255,0.4);font-size:13px;margin:0">Expires in 10 minutes. Never share this code.</p>
        </div>
      `,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/verify-otp — verify and consume the OTP
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const record = await db.collection(OTP_COLLECTION).findOne({ email: normalizedEmail });

    if (!record) {
      return res.status(400).json({ error: 'No OTP found. Please request a new one.' });
    }
    if (new Date() > record.expiresAt) {
      await db.collection(OTP_COLLECTION).deleteOne({ email: normalizedEmail });
      return res.status(400).json({ error: 'OTP expired. Please request a new one.' });
    }
    if (record.otp !== otp.trim()) {
      return res.status(400).json({ error: 'Incorrect OTP. Please try again.' });
    }

    await db.collection(OTP_COLLECTION).deleteOne({ email: normalizedEmail });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/parse-recipe — parse recipe text into food items with macros
app.post('/api/ai/parse-recipe', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Recipe text is required' });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: `You are a nutrition expert. Parse the user's recipe/food description into individual food items with accurate macros. Return ONLY valid JSON array with no markdown. Each item must have: name (string), servingSize (number), servingUnit (string: g/ml/piece/cup/tbsp/tsp/oz/serving), calories (number), protein (number in grams), carbs (number in grams), fat (number in grams), fiber (number in grams), sugar (number in grams), sodium (number in mg). Be accurate with Indian foods, common recipes, and standard nutritional values. Always return realistic macro estimates.`
          },
          {
            role: 'user',
            content: text.trim()
          }
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(502).json({ error: 'OpenAI API error', details: err });
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();

    // Parse the JSON from the response, stripping markdown fences if present
    const jsonStr = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const items = JSON.parse(jsonStr);

    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/storage/:userId/:key — get value by key for a user
app.get('/api/storage/:userId/:key', async (req, res) => {
  try {
    const compositeKey = `${req.params.userId}:${req.params.key}`;
    const doc = await db.collection(COLLECTION).findOne({ key: compositeKey });
    res.json({ value: doc ? doc.value : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/storage/:userId/:key — set value by key for a user
app.put('/api/storage/:userId/:key', async (req, res) => {
  try {
    const compositeKey = `${req.params.userId}:${req.params.key}`;
    await db.collection(COLLECTION).updateOne(
      { key: compositeKey },
      { $set: { key: compositeKey, userId: req.params.userId, value: req.body.value } },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/storage/:userId/:key — remove value by key for a user
app.delete('/api/storage/:userId/:key', async (req, res) => {
  try {
    const compositeKey = `${req.params.userId}:${req.params.key}`;
    await db.collection(COLLECTION).deleteOne({ key: compositeKey });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/storage/:userId — get all keys for a user
app.get('/api/storage/:userId', async (req, res) => {
  try {
    const prefix = `${req.params.userId}:`;
    const docs = await db.collection(COLLECTION)
      .find({ key: { $regex: `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } }, { projection: { key: 1, _id: 0 } })
      .toArray();
    res.json({ keys: docs.map(d => d.key.replace(prefix, '')) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch(err => {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});
