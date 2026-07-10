const aiService = require('../services/ai.service');

async function parseRecipe(req, res, next) {
  try {
    const items = await aiService.parseRecipe(req.body.text);
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

async function chat(req, res, next) {
  try {
    const { userId, message, context } = req.body;
    const reply = await aiService.chat(userId, message, context);
    res.json({ reply });
  } catch (err) {
    next(err);
  }
}

module.exports = { parseRecipe, chat };
