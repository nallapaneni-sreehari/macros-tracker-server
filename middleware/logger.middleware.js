function logger(req, res, next) {
  const start = Date.now();
  const { method, url, body } = req;

  // Mask sensitive fields before logging
  const safeBody = body && Object.keys(body).length
    ? JSON.stringify({
        ...body,
        otp: body.otp ? '***' : undefined,
        email: body.email ? body.email.replace(/(?<=.{3}).(?=.*@)/g, '*') : undefined,
      })
    : '';

  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    console.log(`[${level}] ${method} ${url} → ${res.statusCode} (${ms}ms)${safeBody ? ' body=' + safeBody : ''}`);
  });

  next();
}

module.exports = { logger };
