function validateBody(rules) {
  return (req, res, next) => {
    for (const [field, check] of Object.entries(rules)) {
      const msg = check(req.body[field], req.body);
      if (msg) return res.status(400).json({ error: msg });
    }
    next();
  };
}

module.exports = { validateBody };
