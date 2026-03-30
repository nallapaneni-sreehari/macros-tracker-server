const getOtpTemplate = (otp) => {
  return `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0f0e1a;color:#e2e0ff;border-radius:16px;">
          <h2 style="color:#a29bfe;margin:0 0 8px">MacroTracker</h2>
          <p style="color:rgba(226,224,255,0.6);margin:0 0 24px">Your one-time login code:</p>
          <div style="font-size:44px;font-weight:900;letter-spacing:14px;color:#6C5CE7;text-align:center;padding:20px;background:rgba(108,92,231,0.12);border-radius:12px;margin-bottom:24px;">${otp}</div>
          <p style="color:rgba(226,224,255,0.4);font-size:13px;margin:0">Expires in 10 minutes. Never share this code.</p>
        </div>
      `;
};

module.exports = { getOtpTemplate };
