import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || 'Capote Eyewear <info@capoteyewear.com>';

/**
 * Send B2B Passcode Email Notification
 * @param {string} toEmail - Recipient email address
 * @param {string} clientName - Client's contact person name
 * @param {string} passcode - The B2B login passcode
 */
export async function sendB2BPasscodeEmail(toEmail, clientName, passcode) {
  const portalUrl = 'https://capoteb2b.com';
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Capote Eyewear B2B Portal Access</title>
      <style>
        body {
          font-family: 'Outfit', 'Inter', -apple-system, sans-serif;
          background-color: #080808;
          color: #f5f5f7;
          margin: 0;
          padding: 0;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #121212;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          overflow: hidden;
          margin-top: 40px;
          margin-bottom: 40px;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
        }
        .header {
          background-color: #080808;
          padding: 40px;
          text-align: center;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .logo {
          font-size: 24px;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: #f5f5f7;
          margin: 0;
          font-weight: 300;
        }
        .logo span {
          color: #d4af37;
        }
        .body {
          padding: 40px;
          line-height: 1.6;
        }
        h2 {
          font-size: 20px;
          color: #f5f5f7;
          font-weight: 400;
          margin-top: 0;
          margin-bottom: 20px;
          letter-spacing: 0.02em;
        }
        p {
          color: #8e8e93;
          font-size: 14px;
          margin-bottom: 24px;
        }
        .credentials-box {
          background-color: #1a1a1a;
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 6px;
          padding: 24px;
          margin-bottom: 30px;
        }
        .cred-row {
          margin-bottom: 12px;
          font-size: 13.5px;
        }
        .cred-row:last-child {
          margin-bottom: 0;
        }
        .cred-label {
          color: #8e8e93;
          display: inline-block;
          width: 140px;
          text-transform: uppercase;
          font-size: 11px;
          letter-spacing: 0.08em;
        }
        .cred-value {
          color: #f5f5f7;
          font-weight: 600;
        }
        .cred-passcode {
          color: #d4af37;
          font-family: monospace;
          font-size: 15px;
          letter-spacing: 0.1em;
          background: #080808;
          padding: 3px 8px;
          border-radius: 4px;
        }
        .btn-container {
          text-align: center;
          margin: 35px 0 15px;
        }
        .btn-portal {
          background-color: #f5f5f7;
          color: #080808 !important;
          text-decoration: none;
          padding: 14px 35px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          display: inline-block;
          transition: background-color 0.2s ease;
        }
        .footer {
          background-color: #080808;
          padding: 24px;
          text-align: center;
          font-size: 11px;
          color: #5e5e62;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 class="logo">Capote <span>B2B</span></h1>
        </div>
        
        <div class="body">
          <h2>Wholesale Portal Access Configured</h2>
          <p>Hello ${clientName || 'B2B Partner'},</p>
          <p>Your access credentials for the Capote B2B Wholesale Portal have been updated. You can now log in to view stock availability in real-time and place purchase orders.</p>
          
          <div class="credentials-box">
            <div class="cred-row">
              <span class="cred-label">Portal URL:</span>
              <span class="cred-value"><a href="${portalUrl}" style="color:#d4af37;text-decoration:none;">capoteb2b.com</a></span>
            </div>
            <div class="cred-row">
              <span class="cred-label">Registered Email:</span>
              <span class="cred-value">${toEmail}</span>
            </div>
            <div class="cred-row">
              <span class="cred-label">B2B Passcode:</span>
              <span class="cred-value"><span class="cred-passcode">${passcode}</span></span>
            </div>
          </div>
          
          <div class="btn-container">
            <a href="${portalUrl}" class="btn-portal">Access Portal</a>
          </div>
        </div>
        
        <div class="footer">
          Capote Eyewear · Barcelona · Ibiza · Tokyo<br>
          This is an automated security email. Please do not share your B2B passcode.
        </div>
      </div>
    </body>
    </html>
  `;

  // 1. If SMTP is not fully configured, log to console for development verification
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log('\n==================================================');
    console.log(`✉️ EMAIL NOT SENT (SMTP credentials missing in .env.local)`);
    console.log(`To: ${toEmail}`);
    console.log(`Subject: Capote Eyewear B2B Portal Access`);
    console.log(`Passcode payload: ${passcode}`);
    console.log('==================================================\n');
    return;
  }

  // 2. Transporter configuration
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for port 465, false for other ports
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  // 3. Send the mail
  const info = await transporter.sendMail({
    from: SMTP_FROM,
    to: toEmail,
    subject: 'Capote Eyewear B2B Portal Access',
    html: htmlContent,
  });

  console.log(`✅ B2B passcode email successfully sent to ${toEmail} (MessageID: ${info.messageId})`);
}
