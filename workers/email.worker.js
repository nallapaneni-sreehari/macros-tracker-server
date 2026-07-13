// Standalone email worker — run with: node workers/email.worker.js
// Consumes jobs from the 'macrotracker:email' BullMQ queue and sends emails via SMTP.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { Worker } = require('bullmq');
const logger = require('../config/logger');
const { sendMail } = require('../services/mailer.service');
const { getOtpTemplate } = require('../templates/email-templates');

function redisConnectionOptions() {
  const url = new URL(process.env.REDIS_URL || 'redis://localhost:6379');
  const opts = {
    host: url.hostname || 'localhost',
    port: parseInt(url.port || '6379'),
  };
  if (url.password) opts.password = decodeURIComponent(url.password);
  return opts;
}

const worker = new Worker(
  'macrotracker:email',
  async (job) => {
    if (job.name === 'send-otp') {
      const { to, otp } = job.data;
      await sendMail({
        from: `"MacroTracker" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to,
        subject: 'Your MacroTracker login code',
        html: getOtpTemplate(otp),
      });
      logger.info({ to }, 'OTP email sent');
      return { to, sentAt: new Date().toISOString() };
    }
    throw new Error(`Unknown job name: ${job.name}`);
  },
  { connection: redisConnectionOptions() }
);

worker.on('completed', (job, result) => {
  logger.info({ jobId: job.id, name: job.name, to: result?.to }, 'Email job completed');
});

worker.on('failed', (job, err) => {
  logger.error(
    { jobId: job?.id, name: job?.name, attempt: job?.attemptsMade, maxAttempts: job?.opts?.attempts, err },
    'Email job failed'
  );
});

worker.on('error', (err) => {
  logger.error({ err }, 'Worker error');
});

logger.info('Email worker started — listening on macrotracker:email queue');
