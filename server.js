const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient } = require('mongodb');
const nodemailer = require('nodemailer');
const { getOtpTemplate } = require('./templates/email-templates');
require('dotenv').config({ path: __dirname + '/.env' });

const app = express();
app.use(cors());
app.use(express.json());

// ── Request logger ──
app.use((req, res, next) => {
  const start = Date.now();
  const { method, url, body } = req;

  // Mask sensitive fields before logging
  const safeBody = body && Object.keys(body).length
    ? JSON.stringify({ ...body, otp: body.otp ? '***' : undefined, email: body.email ? body.email.replace(/(?<=.{3}).(?=.*@)/g, '*') : undefined })
    : '';

  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    console.log(`[${level}] ${method} ${url} → ${res.statusCode} (${ms}ms)${safeBody ? ' body=' + safeBody : ''}`);
  });
  next();
});

const MONGO_URI = process.env.MONGO_URI;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DB_NAME = 'macro_tracker';
const COLLECTION = 'kv_store';
const OTP_COLLECTION = 'otp_store';
const CHAT_COLLECTION = 'chat_store';

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

function healthCheck(req, res) {
  res.json({ status: 'ok', timestamp: new Date() });
}

let db;

async function connectDB() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(DB_NAME);
  await db.collection(COLLECTION).createIndex({ key: 1 }, { unique: true });
  // TTL index: MongoDB auto-deletes expired OTPs
  await db.collection(OTP_COLLECTION).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  // Index for fast per-user conversation lookups
  await db.collection(CHAT_COLLECTION).createIndex({ userId: 1 }, { unique: true });
  console.log('Connected to MongoDB');
}

// Serve static assets from views/ (logo, images, etc.)
app.use(express.static(path.join(__dirname, 'views')));

// Serve Angular app at /web-app (all static assets under /web-app/*)
app.use('/web-app', express.static(path.join(__dirname, 'www')));

// GET / — serve landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/index.html'));
});

// GET /privacy — serve privacy policy
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/privacy.html'));
});

// GET /web-app/* — catch-all for Angular deep links (client-side routing)
app.get('/web-app/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'www/index.html'));
});

// GET /api/health — simple health check endpoint
app.get('/api/health', healthCheck);

// Demo account for Google Play / app store reviewers
const DEMO_EMAIL = (process.env.DEMO_EMAIL || '').trim().toLowerCase();
const DEMO_OTP   = (process.env.DEMO_OTP   || '').trim();

// POST /api/auth/send-otp — generate & email a 6-digit OTP
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    const normalizedEmail = email.trim().toLowerCase();

    // Demo account: skip email sending, accept fixed OTP
    if (DEMO_EMAIL && DEMO_OTP && normalizedEmail === DEMO_EMAIL) {
      console.log(`[AUTH] Demo account OTP bypass for ${normalizedEmail}`);
      return res.json({ success: true });
    }

    // Rate-limit: block repeated requests within 60 seconds
    const recent = await db.collection(OTP_COLLECTION).findOne({
      email: normalizedEmail,
      createdAt: { $gt: new Date(Date.now() - 60 * 1000) },
    });
    if (recent) {
      console.log(`[AUTH] send-otp blocked (rate-limit) for ${normalizedEmail}`);
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
      html: getOtpTemplate(otp),
    });
    console.log(`[AUTH] OTP sent to ${normalizedEmail}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[AUTH] send-otp error:', err.message);
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

    // Demo account: accept fixed OTP without DB lookup
    if (DEMO_EMAIL && DEMO_OTP && normalizedEmail === DEMO_EMAIL && otp.trim() === DEMO_OTP) {
      console.log(`[AUTH] Demo account verified for ${normalizedEmail}`);
      return res.json({ success: true });
    }

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
    console.log(`[AUTH] OTP verified for ${normalizedEmail}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[AUTH] verify-otp error:', err.message);
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

// POST /api/ai/chat — Milo nutrition assistant (context-aware, persistent memory)
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { userId, message, context } = req.body;
    if (!userId || !message?.trim()) {
      return res.status(400).json({ error: 'userId and message are required' });
    }

    // Load stored conversation history (last 20 messages for context window)
    const convDoc = await db.collection(CHAT_COLLECTION).findOne(
      { userId },
      { projection: { messages: { $slice: -20 }, _id: 0 } },
    );
    const history = convDoc?.messages || [];

    // Build a rich system prompt using the user's profile, goals, and today's log
    const profile = context?.profile || {};
    const goals = context?.goals || {};
    const todayLog = context?.todayLog || {};

    const profileLines = [];
    if (profile.name) profileLines.push(`Name: ${profile.name}`);
    if (profile.age) profileLines.push(`Age: ${profile.age}`);
    if (profile.gender) profileLines.push(`Gender: ${profile.gender}`);
    if (profile.weight && profile.weightUnit) profileLines.push(`Weight: ${profile.weight} ${profile.weightUnit}`);
    if (profile.height && profile.heightUnit) profileLines.push(`Height: ${profile.height} ${profile.heightUnit}`);
    if (profile.activityLevel) profileLines.push(`Activity level: ${profile.activityLevel}`);

    const goalLines = [];
    if (goals.calories) goalLines.push(`Calorie goal: ${goals.calories} kcal`);
    if (goals.protein) goalLines.push(`Protein goal: ${goals.protein}g`);
    if (goals.carbs) goalLines.push(`Carbs goal: ${goals.carbs}g`);
    if (goals.fat) goalLines.push(`Fat goal: ${goals.fat}g`);
    if (goals.fiber) goalLines.push(`Fiber goal: ${goals.fiber}g`);

    const logLines = [];
    if (todayLog.meals?.length) {
      const totalCals = todayLog.meals.reduce((sum, m) =>
        sum + m.items.reduce((s, i) => s + (i.macros?.calories || 0), 0), 0);
      const totalProtein = todayLog.meals.reduce((sum, m) =>
        sum + m.items.reduce((s, i) => s + (i.macros?.protein || 0), 0), 0);
      logLines.push(`Calories logged today: ${Math.round(totalCals)} kcal`);
      logLines.push(`Protein logged today: ${Math.round(totalProtein)}g`);
      logLines.push(`Meals logged: ${todayLog.meals.map(m => m.name).join(', ')}`);
    }
    if (todayLog.waterIntake) logLines.push(`Water today: ${todayLog.waterIntake}L`);

    const systemPrompt = `You are Milo, a friendly and knowledgeable AI nutrition and fitness assistant built into the MacroTracker app. Your goal is to help users understand their nutrition, fitness progress, and health metrics in a clear and motivating way.

    ${profileLines.length ? `User profile:\n${profileLines.join('\n')}` : ''}
    ${goalLines.length ? `\nUser goals:\n${goalLines.join('\n')}` : ''}
    ${logLines.length ? `\nToday's data:\n${logLines.join('\n')}` : ''}

    Guidelines:
    - Be conversational, warm, and encouraging
    - Give personalized answers based on the user's profile and data above
    - Calculate BMI, TDEE, macro ratios, and other metrics on request using the provided data
    - If profile data is missing for a calculation, politely ask for it
    - Keep responses concise (2-4 sentences) unless a detailed explanation is needed
    - Use numbers and specifics wherever possible
    - Never give medical diagnoses — always recommend consulting a healthcare professional for medical concerns`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 400,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: message.trim() },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(502).json({ error: 'OpenAI API error', details: err });
    }

    const data = await response.json();
    const reply = data.choices[0].message.content.trim();

    // Append new turn to the user's conversation (cap at 100 messages)
    await db.collection(CHAT_COLLECTION).updateOne(
      { userId },
      {
        $push: {
          messages: {
            $each: [
              { role: 'user', content: message.trim() },
              { role: 'assistant', content: reply },
            ],
            $slice: -100,
          },
        },
        $set: { updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );

    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/conversations/:userId — retrieve stored messages to restore chat UI
app.get('/api/conversations/:userId', async (req, res) => {
  try {
    const doc = await db.collection(CHAT_COLLECTION).findOne(
      { userId: req.params.userId },
      { projection: { messages: 1, _id: 0 } },
    );
    res.json({ messages: doc?.messages || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/conversations/:userId — clear conversation history
app.delete('/api/conversations/:userId', async (req, res) => {
  try {
    await db.collection(CHAT_COLLECTION).deleteOne({ userId: req.params.userId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/storage/:userId/:key — get value by key for a user
app.get('/api/storage/:userId/:key', async (req, res) => {
  try {
    const compositeKey = `${req.params.userId}:${req.params.key}`;
    const doc = await db.collection(COLLECTION).findOne({ key: compositeKey });
    const found = doc && doc.value !== null && doc.value !== undefined;
    console.log(`[STORAGE] GET ${compositeKey} → ${found ? 'hit' : 'miss'}`);
    res.json({ value: doc ? doc.value : null });
  } catch (err) {
    console.error(`[STORAGE] GET error for ${req.params.userId}:${req.params.key}:`, err.message);
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
    console.log(`[STORAGE] PUT ${compositeKey} → ok`);
    res.json({ success: true });
  } catch (err) {
    console.error(`[STORAGE] PUT error for ${req.params.userId}:${req.params.key}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/storage/:userId/:key — remove value by key for a user
app.delete('/api/storage/:userId/:key', async (req, res) => {
  try {
    const compositeKey = `${req.params.userId}:${req.params.key}`;
    await db.collection(COLLECTION).deleteOne({ key: compositeKey });
    console.log(`[STORAGE] DELETE ${compositeKey} → ok`);
    res.json({ success: true });
  } catch (err) {
    console.error(`[STORAGE] DELETE error for ${req.params.userId}:${req.params.key}:`, err.message);
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
