const { getAuthToken } = require('../services/redis.service');

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = header.slice(7).trim();
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const payload = await getAuthToken(token);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    }
    req.user = payload;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAuth };
