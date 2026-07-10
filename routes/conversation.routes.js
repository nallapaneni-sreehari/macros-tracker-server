const { Router } = require('express');
const conversationController = require('../controllers/conversation.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = Router();

router.get('/:userId', requireAuth, conversationController.getConversation);
router.delete('/:userId', requireAuth, conversationController.deleteConversation);

module.exports = router;
