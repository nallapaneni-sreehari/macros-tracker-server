const { MongoClient } = require('mongodb');

const DB_NAME = 'macro_tracker';
const COLLECTION = 'kv_store';
const OTP_COLLECTION = 'otp_store';
const CHAT_COLLECTION = 'chat_store';
const FEEDBACK_COLLECTION = 'feedback_store';

let db;

async function connectDB() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  db = client.db(DB_NAME);

  await db.collection(COLLECTION).createIndex({ key: 1 }, { unique: true });
  // TTL index: MongoDB auto-deletes expired OTPs
  await db.collection(OTP_COLLECTION).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  // Index for fast per-user conversation lookups
  await db.collection(CHAT_COLLECTION).createIndex({ userId: 1 }, { unique: true });
  // Index for feedback filtering by category and creation time
  await db.collection(FEEDBACK_COLLECTION).createIndex({ category: 1, createdAt: -1 });
  await db.collection(FEEDBACK_COLLECTION).createIndex({ createdAt: -1 });

  console.log('Connected to MongoDB');
}

function getDb() {
  return db;
}

module.exports = { connectDB, getDb };
