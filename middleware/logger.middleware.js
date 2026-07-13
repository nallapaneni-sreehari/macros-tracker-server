const pinoHttp = require('pino-http');
const logger = require('../config/logger');

const httpLogger = pinoHttp({
  logger,

  // Map HTTP status codes to log levels
  customLogLevel(req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },

  // Mask sensitive fields in request body
  customProps(req) {
    const body = req.body;
    if (!body || !Object.keys(body).length) return {};
    return {
      reqBody: {
        ...body,
        otp: body.otp ? '***' : undefined,
        email: body.email
          ? body.email.replace(/(?<=.{3}).(?=.*@)/g, '*')
          : undefined,
      },
    };
  },

  // Skip logging for static asset requests
  autoLogging: {
    ignore: (req) =>
      req.url?.startsWith('/web-app') ||
      req.url?.startsWith('/assets') ||
      req.url === '/favicon.ico',
  },
});

module.exports = { httpLogger };
