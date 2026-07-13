const logger = require('../config/logger');

// Centralized error handling middleware — must be registered last in Express.
// All errors thrown or passed via next(err) in routes/controllers land here.
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const meta = { err, method: req.method, url: req.url, status };

  if (status >= 500) {
    logger.error(meta, err.message);
  } else {
    logger.warn(meta, err.message);
  }

  const body = { error: err.message || 'Internal server error' };
  if (err.details) body.details = err.details;
  res.status(status).json(body);
}

module.exports = { errorHandler };
