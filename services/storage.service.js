const { getDb } = require('../db');

const COLLECTION = 'kv_store';

async function getValue(userId, key) {
  const db = getDb();
  const compositeKey = `${userId}:${key}`;
  const doc = await db.collection(COLLECTION).findOne({ key: compositeKey });
  const found = doc && doc.value !== null && doc.value !== undefined;
  console.log(`[STORAGE] GET ${compositeKey} → ${found ? 'hit' : 'miss'}`);
  return doc ? doc.value : null;
}

async function setValue(userId, key, value) {
  const db = getDb();
  const compositeKey = `${userId}:${key}`;
  await db.collection(COLLECTION).updateOne(
    { key: compositeKey },
    { $set: { key: compositeKey, userId, value } },
    { upsert: true }
  );
  console.log(`[STORAGE] PUT ${compositeKey} → ok`);
}

async function deleteValue(userId, key) {
  const db = getDb();
  const compositeKey = `${userId}:${key}`;
  await db.collection(COLLECTION).deleteOne({ key: compositeKey });
  console.log(`[STORAGE] DELETE ${compositeKey} → ok`);
}

async function listKeys(userId) {
  const db = getDb();
  const prefix = `${userId}:`;
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const docs = await db.collection(COLLECTION)
    .find({ key: { $regex: `^${escapedPrefix}` } }, { projection: { key: 1, _id: 0 } })
    .toArray();
  return docs.map(d => d.key.replace(prefix, ''));
}

module.exports = { getValue, setValue, deleteValue, listKeys };
