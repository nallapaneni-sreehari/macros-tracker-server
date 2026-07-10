const conversationService = require('../services/conversation.service');

async function getConversation(req, res, next) {
  try {
    const messages = await conversationService.getMessages(req.params.userId);
    res.json({ messages });
  } catch (err) {
    next(err);
  }
}

async function deleteConversation(req, res, next) {
  try {
    await conversationService.deleteConversation(req.params.userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { getConversation, deleteConversation };
