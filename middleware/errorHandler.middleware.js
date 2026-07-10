// Centralized error handling middleware — must be registered last in Express.
// All errors thrown or passed via next(err) in routes/controllers land here.
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) {
    console.error(`[ERROR] ${req.method} ${req.url}:`, err.message);
  } else {
    console.warn(`[WARN] ${req.method} ${req.url}:`, err.message);
  }
  const body = { error: err.message || 'Internal server error' };
  if (err.details) body.details = err.details;
  res.status(status).json(body);
}

module.exports = { errorHandler };
