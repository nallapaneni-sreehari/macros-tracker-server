const { Router } = require('express');
const feedbackController = require('../controllers/feedback.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { validateBody } = require('../middleware/validate.middleware');

const router = Router();

// Anyone can submit feedback (no auth required)
router.post('/',
  validateBody({
    message: (v) => {
      if (!v || !v.trim()) return 'Message is required';
      if (v.trim().length > 2000) return 'Message must be 2000 characters or fewer';
      return null;
    },
    email: (v) => (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) ? 'Invalid email address' : null,
  }),
  feedbackController.submitFeedback
);

// Viewing feedback requires authentication
router.get('/', requireAuth, feedbackController.getFeedback);

module.exports = router;
