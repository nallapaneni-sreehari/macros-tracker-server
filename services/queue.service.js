const { Queue } = require('bullmq');
const logger = require('../config/logger');

// Parse REDIS_URL into ioredis connection options required by BullMQ.
// BullMQ creates multiple internal connections so it needs options, not a shared client.
function redisConnectionOptions() {
  const url = new URL(process.env.REDIS_URL || 'redis://localhost:6379');
  const opts = {
    host: url.hostname || 'localhost',
    port: parseInt(url.port || '6379'),
  };
  if (url.password) opts.password = decodeURIComponent(url.password);
  return opts;
}

const emailQueue = new Queue('macrotracker:email', {
  connection: redisConnectionOptions(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100, // keep last 100 completed jobs for inspection
    removeOnFail: 200,     // keep last 200 failed jobs for debugging
  },
});

emailQueue.on('error', (err) => {
  logger.error({ err }, '[QUEUE] emailQueue error');
});

module.exports = { emailQueue };
