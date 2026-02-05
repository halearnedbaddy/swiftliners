const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    try {
      // Check if email credentials are configured
      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        logger.warn('Email credentials not configured. Using mock email service.');
        this.transporter = {
          sendMail: async (options) => {
            logger.info('📧 MOCK EMAIL SENT:', {
              to: options.to,
              subject: options.subject,
              text: options.text?.substring(0, 100) + '...',
              html: options.html ? 'HTML content' : undefined
            });
            return { messageId: 'mock-' + Date.now() };
          }
        };
        return;
      }

      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    } catch (error) {
      logger.error('Failed to initialize email transporter:', error);
    }
  }

  async sendEmail({ to, subject, template, data }) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const emailBody = this.generateEmailBody(template, data);
      
      const mailOptions = {
        from: `"PayLoom Instants" <${process.env.SMTP_USER}>`,
        to,
        subject,
        html: emailBody
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      logger.info('Email sent successfully', {
        to,
        subject,
        template,
        messageId: info.messageId
      });

      return {
        success: true,
        messageId: info.messageId
      };

    } catch (error) {
      logger.error('Failed to send email:', error);
      throw new Error(`Email delivery failed: ${error.message}`);
    }
  }

  generateEmailBody(template, data) {
    const templates = {
      'test-mode-approved': `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>PayLoom Account Approved</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
            .logo { font-size: 2rem; margin-bottom: 10px; }
            .content { padding: 30px 0; }
            .api-keys { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .api-key { margin: 10px 0; padding: 10px; background: white; border-radius: 4px; font-family: monospace; word-break: break-all; }
            .cta { text-align: center; margin: 30px 0; }
            .btn { display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; }
            .footer { text-align: center; padding: 20px 0; border-top: 1px solid #eee; color: #666; font-size: 0.9rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">⚡ PayLoom</div>
              <h1>Account Approved! 🎉</h1>
            </div>
            
            <div class="content">
              <p>Hi ${data.business_name},</p>
              <p>Congratulations! Your PayLoom account has been approved and you now have access to our test environment.</p>
              
              <h3>🔑 Your Test API Keys</h3>
              <div class="api-keys">
                <div class="api-key">
                  <strong>Public Test Key:</strong><br>
                  <code>${data.api_keys.public_test}</code>
                </div>
                <div class="api-key">
                  <strong>Secret Test Key:</strong><br>
                  <code>${data.api_keys.secret_test}</code>
                </div>
              </div>
              
              <p>These keys allow you to test our APIs in a sandbox environment. No real money will be processed.</p>
              
              <div class="cta">
                <a href="http://localhost:3000/client-app.html" class="btn">Go to Dashboard</a>
              </div>
              
              <h3>🚀 Next Steps</h3>
              <ol>
                <li>Log into your dashboard</li>
                <li>Test our APIs with your sandbox keys</li>
                <li>Complete KYC verification to enable live mode</li>
                <li>Start processing real payments!</li>
              </ol>
            </div>
            
            <div class="footer">
              <p>© 2026 PayLoom Instants. Built for Africa.</p>
              <p>If you have questions, reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,

      'live-mode-approved': `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>PayLoom Live Mode Enabled</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
            .logo { font-size: 2rem; margin-bottom: 10px; }
            .content { padding: 30px 0; }
            .api-keys { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .api-key { margin: 10px 0; padding: 10px; background: white; border-radius: 4px; font-family: monospace; word-break: break-all; }
            .live-badge { background: #10b981; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; }
            .cta { text-align: center; margin: 30px 0; }
            .btn { display: inline-block; padding: 12px 24px; background: #10b981; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; }
            .footer { text-align: center; padding: 20px 0; border-top: 1px solid #eee; color: #666; font-size: 0.9rem; }
            .warning { background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 8px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">⚡ PayLoom</div>
              <h1>Live Mode Enabled! 🚀</h1>
              <span class="live-badge">LIVE</span>
            </div>
            
            <div class="content">
              <p>Hi ${data.business_name},</p>
              <p>Exciting news! Your KYC has been approved and live mode is now enabled for your PayLoom account.</p>
              
              <div class="warning">
                <strong>⚠️ Important:</strong> These are your LIVE API keys. Real money will be processed when using these keys.
              </div>
              
              <h3>🔑 Your Live API Keys</h3>
              <div class="api-keys">
                <div class="api-key">
                  <strong>Public Live Key:</strong><br>
                  <code>${data.api_keys.public_live}</code>
                </div>
                <div class="api-key">
                  <strong>Secret Live Key:</strong><br>
                  <code>${data.api_keys.secret_live}</code>
                </div>
              </div>
              
              <p>Keep these keys secure and never share them publicly. You can now process real payments!</p>
              
              <div class="cta">
                <a href="http://localhost:3000/client-app.html" class="btn">Go to Dashboard</a>
              </div>
              
              <h3>💰 Fee Structure</h3>
              <ul>
                <li>Collections: 2.5% per transaction</li>
                <li>Escrow: 2.0% per transaction</li>
                <li>Payouts: 1.5% per transaction</li>
              </ul>
              
              <h3>🎉 Ready to Go Live!</h3>
              <ol>
                <li>Update your integration with live keys</li>
                <li>Test with small amounts first</li>
                <li>Monitor your dashboard for transactions</li>
                <li>Start earning revenue! 💸</li>
              </ol>
            </div>
            
            <div class="footer">
              <p>© 2026 PayLoom Instants. Built for Africa.</p>
              <p>Questions? Reply to this email for support.</p>
            </div>
          </div>
        </body>
        </html>
      `,

      'kyc-approved-live-mode': `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>KYC Approved - Live Mode Enabled</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
            .logo { font-size: 2rem; margin-bottom: 10px; }
            .content { padding: 30px 0; }
            .api-keys { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .api-key { margin: 10px 0; padding: 10px; background: white; border-radius: 4px; font-family: monospace; word-break: break-all; }
            .live-badge { background: #10b981; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; }
            .trust-score { background: #6366f1; color: white; padding: 8px 16px; border-radius: 20px; font-weight: 600; margin: 10px 0; display: inline-block; }
            .cta { text-align: center; margin: 30px 0; }
            .btn { display: inline-block; padding: 12px 24px; background: #10b981; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; }
            .footer { text-align: center; padding: 20px 0; border-top: 1px solid #eee; color: #666; font-size: 0.9rem; }
            .success-box { background: #d1fae5; border: 1px solid #10b981; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">⚡ PayLoom</div>
              <h1>KYC Approved! 🎉</h1>
              <span class="live-badge">LIVE MODE ENABLED</span>
            </div>
            
            <div class="content">
              <p>Hi ${data.business_name},</p>
              
              <div class="success-box">
                <h3>✅ Your KYC verification has been approved!</h3>
                <p>Your trust score: <span class="trust-score">${data.trust_score}/100</span></p>
              </div>
              
              <p>You now have full access to PayLoom's live payment infrastructure. Here are your live API keys:</p>
              
              <h3>🔑 Your Live API Keys</h3>
              <div class="api-keys">
                <div class="api-key">
                  <strong>Public Live Key:</strong><br>
                  <code>${data.api_keys.public_live}</code>
                </div>
                <div class="api-key">
                  <strong>Secret Live Key:</strong><br>
                  <code>${data.api_keys.secret_live}</code>
                </div>
              </div>
              
              <div class="cta">
                <a href="http://localhost:3000/client-app.html" class="btn">Start Processing Payments</a>
              </div>
              
              <h3>🚀 What You Can Do Now</h3>
              <ul>
                <li>✅ Process real M-Pesa payments</li>
                <li>✅ Create escrow transactions</li>
                <li>✅ Send payouts to customers</li>
                <li>✅ Manage multiple wallets</li>
                <li>✅ Receive webhook notifications</li>
                <li>✅ Access detailed transaction reports</li>
              </ul>
              
              <h3>💰 Transaction Fees</h3>
              <ul>
                <li><strong>Collections:</strong> 2.5% per transaction</li>
                <li><strong>Escrow:</strong> 2.0% per transaction</li>
                <li><strong>Payouts:</strong> 1.5% per transaction</li>
              </ul>
              
              <p><strong>Example:</strong> For a KES 10,000 collection, you'll pay KES 250 in fees.</p>
            </div>
            
            <div class="footer">
              <p>© 2026 PayLoom Instants. Built for Africa.</p>
              <p>Need help? Reply to this email for priority support.</p>
            </div>
          </div>
        </body>
        </html>
      `,

      'account-rejected': `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>PayLoom Account Update</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
            .logo { font-size: 2rem; margin-bottom: 10px; }
            .content { padding: 30px 0; }
            .rejection-box { background: #fef2f2; border: 1px solid #ef4444; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px 0; border-top: 1px solid #eee; color: #666; font-size: 0.9rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">⚡ PayLoom</div>
              <h1>Account Update</h1>
            </div>
            
            <div class="content">
              <p>Hi ${data.business_name},</p>
              
              <div class="rejection-box">
                <h3>❌ Account Application Not Approved</h3>
                <p><strong>Reason:</strong> ${data.reason}</p>
              </div>
              
              <p>We're unable to approve your PayLoom account application at this time. This decision was made based on the information provided during registration.</p>
              
              <h3>🤔 What You Can Do</h3>
              <ul>
                <li>Review the reason provided above</li>
                <li>Update your business information if needed</li>
                <li>Contact our support team for clarification</li>
                <li>Reapply with corrected information</li>
              </ul>
              
              <h3>📞 Need Help?</h3>
              <p>If you believe this decision was made in error, please reply to this email with:</p>
              <ul>
                <li>Your business name</li>
                <li>Registration email</li>
                <li>Additional information that might help us reconsider</li>
              </ul>
            </div>
            
            <div class="footer">
              <p>© 2026 PayLoom Instants. Built for Africa.</p>
              <p>We're here to help you succeed.</p>
            </div>
          </div>
        </body>
        </html>
      `,

      'kyc-rejected': `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>KYC Verification Update</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
            .logo { font-size: 2rem; margin-bottom: 10px; }
            .content { padding: 30px 0; }
            .rejection-box { background: #fef2f2; border: 1px solid #ef4444; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px 0; border-top: 1px solid #eee; color: #666; font-size: 0.9rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">⚡ PayLoom</div>
              <h1>KYC Verification Update</h1>
            </div>
            
            <div class="content">
              <p>Hi ${data.business_name},</p>
              
              <div class="rejection-box">
                <h3>❌ KYC Verification Not Approved</h3>
                <p><strong>Reason:</strong> ${data.reason}</p>
              </div>
              
              <p>Your KYC documents could not be approved at this time. This may be due to unclear documents, missing information, or compliance requirements.</p>
              
              <h3>🔧 What You Can Do</h3>
              <ul>
                <li>Review the rejection reason carefully</li>
                <li>Ensure all documents are clear and readable</li>
                <li>Verify all information matches your business records</li>
                <li>Re-submit updated documents through your dashboard</li>
              </ul>
              
              <h3>📋 Common Issues</h3>
              <ul>
                <li>Blurry or low-quality document images</li>
                <li>Expired identification documents</li>
                <li>Mismatched information across documents</li>
                <li>Incomplete business registration details</li>
              </ul>
              
              <p>Your test mode access remains active. You can continue testing our APIs while you resolve the KYC issues.</p>
            </div>
            
            <div class="footer">
              <p>© 2026 PayLoom Instants. Built for Africa.</p>
              <p>Reply to this email for KYC support.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    return templates[template] || `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>PayLoom Notification</h2>
        <p>${JSON.stringify(data, null, 2)}</p>
      </div>
    `;
  }
}

// Create singleton instance
const emailService = new EmailService();

// Export main function for backward compatibility
const sendEmail = (options) => emailService.sendEmail(options);

module.exports = {
  EmailService,
  emailService,
  sendEmail
};
