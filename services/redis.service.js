const Redis = require('ioredis');

let client;

const TOKEN_TTL = parseInt(process.env.AUTH_TOKEN_TTL || String(7 * 24 * 3600)); // default: 7 days

function getRedis() {
  if (!client) {
    client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    client.on('connect', () => console.log('Connected to Redis'));
    client.on('error', (err) => console.error('[REDIS] Connection error:', err.message));
  }
  return client;
}

async function setAuthToken(token, payload) {
  await getRedis().set(`auth:token:${token}`, JSON.stringify(payload), 'EX', TOKEN_TTL);
}

async function getAuthToken(token) {
  const data = await getRedis().get(`auth:token:${token}`);
  return data ? JSON.parse(data) : null;
}

async function deleteAuthToken(token) {
  await getRedis().del(`auth:token:${token}`);
}

module.exports = { getRedis, setAuthToken, getAuthToken, deleteAuthToken, TOKEN_TTL };
