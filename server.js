const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: __dirname + '/.env' });

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI;
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
