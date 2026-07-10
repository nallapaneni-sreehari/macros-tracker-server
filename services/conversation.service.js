const { getDb } = require('../db');

const CHAT_COLLECTION = 'chat_store';

async function getMessages(userId) {
  const db = getDb();
  const doc = await db.collection(CHAT_COLLECTION).findOne(
    { userId },
    { projection: { messages: 1, _id: 0 } },
  );
  return doc?.messages || [];
}

async function deleteConversation(userId) {
  const db = getDb();
  await db.collection(CHAT_COLLECTION).deleteOne({ userId });
}

module.exports = { getMessages, deleteConversation };
