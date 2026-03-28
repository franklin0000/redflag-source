/**
 * emailService.js — Transactional email via Nodemailer.
 *
 * Priority order:
 *   1. SMTP_* env vars  → real SMTP (Gmail, Brevo, etc.)
 *   2. No credentials   → Ethereal test account (dev) + console log
 *
 * Required env vars for production:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 *   SMTP_FROM  (optional, defaults to noreply@redflag.app)
 */

const nodemailer = require('nodemailer');

let transporter = null;
let testAccount = null;

async function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || '587'),
      secure: parseInt(SMTP_PORT || '587') === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    return transporter;
  }

  // Development fallback: Ethereal disposable SMTP (captures emails, nothing delivered)
  if (!testAccount) {
    testAccount = await nodemailer.createTestAccount();
    console.info('[Email] No SMTP config found — using Ethereal test account');
    console.info('[Email] Ethereal user:', testAccount.user);
  }
  transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });
  return transporter;
}

/**
 * Sends a password-reset email to the given address.
 * @param {string} toEmail
 * @param {string} resetToken
 * @param {string} appBaseUrl  e.g. "https://redflag-source.onrender.com"
 */
async function sendPasswordResetEmail(toEmail, resetToken, appBaseUrl) {
  const resetUrl = `${appBaseUrl}/#/reset-password?token=${resetToken}`;
  const from = process.env.SMTP_FROM || 'RedFlag <noreply@redflag.app>';

  const mailOptions = {
    from,
    to: toEmail,
    subject: 'Reset your RedFlag password',
    text: [
      'You requested a password reset for your RedFlag account.',
      '',
      'Click the link below to reset your password (valid for 1 hour):',
      resetUrl,
      '',
      'If you did not request this, you can safely ignore this email.',
    ].join('\n'),
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#d411b4;margin-bottom:8px">Reset your password</h2>
        <p style="color:#555">You requested a password reset for your <strong>RedFlag</strong> account.</p>
        <a href="${resetUrl}"
           style="display:inline-block;margin:16px 0;padding:12px 24px;background:#d411b4;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">
          Reset Password
        </a>
        <p style="color:#888;font-size:12px">This link expires in 1 hour.<br>
        If you did not request this, ignore this email.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="color:#aaa;font-size:11px">RedFlag — Protecting your relationships</p>
      </div>
    `,
  };

  const transport = await getTransporter();
  const info = await transport.sendMail(mailOptions);

  // Always log the reset URL for admin visibility
  console.info('[Email] Password reset requested for:', toEmail);
  console.info('[Email] Reset URL:', resetUrl);

  // In dev (Ethereal), log the preview URL so the developer can view the email
  if (info.messageId && nodemailer.getTestMessageUrl(info)) {
    console.info('[Email] Preview URL:', nodemailer.getTestMessageUrl(info));
  }

  return { ok: true, messageId: info.messageId };
}

module.exports = { sendPasswordResetEmail };
