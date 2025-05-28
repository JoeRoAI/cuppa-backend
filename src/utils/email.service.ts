import config from '../config/config';

interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

/**
 * Email Service for sending emails in the application
 * In development mode, it logs emails to the console
 * In production, it would use a real email service
 */
export class EmailService {
  /**
   * Send an email
   * @param options Email options (to, subject, text, html)
   * @returns Promise resolving to true if successful
   */
  static async sendEmail(options: EmailOptions): Promise<boolean> {
    // Validate options
    if (!options.to || !options.subject || (!options.text && !options.html)) {
      throw new Error('Missing required email options');
    }
    
    // In development, just log the email
    if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') {
      console.log('\n');
      console.log('========== EMAIL ==========');
      console.log(`To: ${options.to}`);
      console.log(`Subject: ${options.subject}`);
      if (options.text) {
        console.log(`Text: ${options.text}`);
      }
      if (options.html) {
        console.log(`HTML: ${options.html}`);
      }
      console.log('===========================\n');
      return true;
    }
    
    // In production, use a real email service
    // This is a placeholder for a real implementation
    try {
      // Here you would integrate with a service like SendGrid, Mailgun, AWS SES, etc.
      // Example with a hypothetical email client:
      // await emailClient.send({
      //   to: options.to,
      //   subject: options.subject,
      //   text: options.text,
      //   html: options.html
      // });
      
      console.log(`Email sent to ${options.to}`);
      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }
  
  /**
   * Send a password reset email
   * @param to Recipient email
   * @param name Recipient name
   * @param resetToken Reset token
   * @param resetUrl URL for password reset
   * @returns Promise resolving to true if successful
   */
  static async sendPasswordResetEmail(
    to: string,
    name: string,
    resetToken: string,
    resetUrl: string
  ): Promise<boolean> {
    const subject = 'Password Reset - Cuppa';
    
    const text = `
      Hi ${name},
      
      You have requested a password reset. Please use the following token or click the link below:
      
      Token: ${resetToken}
      
      Link: ${resetUrl}
      
      This link will expire in 1 hour.
      
      If you did not request this password reset, please ignore this email.
      
      Best regards,
      The Cuppa Team
    `;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #5c3d2e;">Password Reset - Cuppa</h2>
        <p>Hi ${name},</p>
        <p>You have requested a password reset. Please use the following token or click the link below:</p>
        <div style="background-color: #f5f5f5; padding: 10px; margin: 15px 0; border-radius: 5px;">
          <p><strong>Token:</strong> ${resetToken}</p>
        </div>
        <p>
          <a href="${resetUrl}" style="background-color: #5c3d2e; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Reset Password
          </a>
        </p>
        <p><small>This link will expire in 1 hour.</small></p>
        <p><small>If you did not request this password reset, please ignore this email.</small></p>
        <p>Best regards,<br>The Cuppa Team</p>
      </div>
    `;
    
    return this.sendEmail({ to, subject, text, html });
  }

  /**
   * Send a password change notification email
   * @param to Recipient email
   * @param name Recipient name
   * @returns Promise resolving to true if successful
   */
  static async sendPasswordChangeNotificationEmail(
    to: string,
    name: string
  ): Promise<boolean> {
    const subject = 'Password Changed - Cuppa';
    
    const text = `
      Hi ${name},
      
      This is a confirmation that your password for your Cuppa account has been changed.
      
      If you did not make this change, please contact our support team immediately.
      
      Best regards,
      The Cuppa Team
    `;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #5c3d2e;">Password Changed - Cuppa</h2>
        <p>Hi ${name},</p>
        <p>This is a confirmation that your password for your Cuppa account has been changed.</p>
        <p><strong>If you did not make this change, please contact our support team immediately.</strong></p>
        <p>Best regards,<br>The Cuppa Team</p>
      </div>
    `;
    
    return this.sendEmail({ to, subject, text, html });
  }
}

export default EmailService; 