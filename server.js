const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: __dirname + '/.env' });

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DB_NAME = 'macro_tracker';
const COLLECTION = 'kv_store';

let db;

async function connectDB() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(DB_NAME);
  await db.collection(COLLECTION).createIndex({ key: 1 }, { unique: true });
  console.log('Connected to MongoDB');
}

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
