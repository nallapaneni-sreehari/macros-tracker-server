const feedbackService = require('../services/feedback.service');

async function submitFeedback(req, res, next) {
  try {
    const { name, email, category, rating, message } = req.body;
    const result = await feedbackService.submitFeedback({ name, email, category, rating, message });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getFeedback(req, res, next) {
  try {
    const { category } = req.query;
    const result = await feedbackService.getFeedback(category);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { submitFeedback, getFeedback };
