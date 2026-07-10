const { Router } = require('express');
const aiController = require('../controllers/ai.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { validateBody } = require('../middleware/validate.middleware');

const router = Router();

router.post('/parse-recipe',
  requireAuth,
  validateBody({
    text: (v) => (!v || !v.trim()) ? 'Recipe text is required' : null,
  }),
  aiController.parseRecipe
);

router.post('/chat',
  requireAuth,
  validateBody({
    userId: (v) => !v ? 'userId is required' : null,
    message: (v) => (!v || !v.trim()) ? 'message is required' : null,
  }),
  aiController.chat
);

module.exports = router;
