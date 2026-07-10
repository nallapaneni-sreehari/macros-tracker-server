const { getDb } = require('../db');

const FEEDBACK_COLLECTION = 'feedback_store';
const ALLOWED_CATEGORIES = ['general', 'bug', 'feature', 'ai', 'performance'];

async function submitFeedback({ name, email, category, rating, message }) {
  const db = getDb();
  const resolvedCategory = ALLOWED_CATEGORIES.includes(category) ? category : 'general';
  const resolvedRating = Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;

  const doc = {
    name: (name || 'Anonymous').trim().slice(0, 80),
    email: email ? email.trim().toLowerCase().slice(0, 120) : null,
    category: resolvedCategory,
    rating: resolvedRating,
    message: message.trim(),
    createdAt: new Date(),
  };

  await db.collection(FEEDBACK_COLLECTION).insertOne(doc);
  console.log(`[FEEDBACK] New submission — category=${resolvedCategory} rating=${resolvedRating}`);
  return { success: true };
}

async function getFeedback(category) {
  const db = getDb();
  const query = category && ALLOWED_CATEGORIES.includes(category) ? { category } : {};

  const feedback = await db.collection(FEEDBACK_COLLECTION)
    .find(query, { projection: { _id: 0, name: 1, email: 1, category: 1, rating: 1, message: 1, createdAt: 1 } })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();

  const total = await db.collection(FEEDBACK_COLLECTION).countDocuments(query);
  return { feedback, total };
}

module.exports = { submitFeedback, getFeedback, ALLOWED_CATEGORIES };
