// Standalone email worker — run with: node workers/email.worker.js
// Consumes jobs from the 'macrotracker:email' BullMQ queue and sends emails via SMTP.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { Worker } = require('bullmq');
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
      console.log(`[EMAIL-WORKER] OTP email sent to ${to}`);
      return { to, sentAt: new Date().toISOString() };
    }
    throw new Error(`Unknown job name: ${job.name}`);
  },
  { connection: redisConnectionOptions() }
);

worker.on('completed', (job, result) => {
  console.log(`[EMAIL-WORKER] Job ${job.id} (${job.name}) completed — sent to ${result?.to}`);
});

worker.on('failed', (job, err) => {
  const attempt = job?.attemptsMade ?? '?';
  const maxAttempts = job?.opts?.attempts ?? '?';
  console.error(`[EMAIL-WORKER] Job ${job?.id} (${job?.name}) failed [${attempt}/${maxAttempts}]: ${err.message}`);
});

worker.on('error', (err) => {
  console.error('[EMAIL-WORKER] Worker error:', err.message);
});

console.log('[EMAIL-WORKER] Started — listening for email jobs on macrotracker:email queue...');
