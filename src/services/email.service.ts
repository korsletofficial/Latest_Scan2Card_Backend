import nodemailer from "nodemailer";
import QRCode from "qrcode";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: any[];
}

interface LicenseKeyEmailData {
  email: string;
  password: string;
  licenseKey: string;
  stallName?: string;
  eventName?: string;
  expiresAt: Date;
  qrCodeDataUrl?: string;
  qrContent?: string;
}

interface ExhibitorWelcomeEmailData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  companyName?: string;
}

interface MeetingReminderEmailData {
  leadEmail: string;
  leadName: string;
  meetingTitle: string;
  userFirstName: string;
  userLastName: string;
  startAt: Date;
  endAt: Date;
  meetingMode: "online" | "offline" | "phone";
  location?: string;
  minutesUntil: number;
}

// Singleton transporter instance (reused across all email sends)
let transporterInstance: nodemailer.Transporter | null = null;
let transporterInitialized = false;

// Create reusable transporter (singleton pattern)
const getTransporter = (): nodemailer.Transporter | null => {
  // Return cached instance if already created
  if (transporterInitialized) {
    return transporterInstance;
  }

  const config = {
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_PORT || "587"),
    secure: process.env.EMAIL_SECURE === "true",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
    pool: true, // Enable connection pooling for better performance
    maxConnections: 5, // Max simultaneous connections
    maxMessages: 100, // Max messages per connection
  };

  // Validate email configuration
  if (!config.auth.user || !config.auth.pass) {
    console.warn("⚠️  Email configuration is incomplete. Emails will not be sent.");
    console.warn("EMAIL_USER:", process.env.EMAIL_USER ? "Set" : "Not set");
    console.warn("EMAIL_PASSWORD:", process.env.EMAIL_PASSWORD ? "Set (hidden)" : "Not set");
    transporterInitialized = true;
    transporterInstance = null;
    return null;
  }

  console.log("📧 Email transporter initialized (singleton):", {
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.auth.user,
    pooled: true,
  });

  transporterInstance = nodemailer.createTransport(config);
  transporterInitialized = true;

  return transporterInstance;
};

// Send generic email with retry logic
export const sendEmail = async (options: EmailOptions, retries = 3): Promise<boolean> => {
  let lastError: any;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const transporter = getTransporter();

      if (!transporter) {
        console.log("📧 Email sending skipped: No transporter configured");
        return false;
      }

      const mailOptions = {
        from: process.env.EMAIL_FROM || "Scan2Card <noreply@scan2card.com>",
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments,
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ Email sent successfully (attempt ${attempt}/${retries}):`, info.messageId);
      return true;
    } catch (error: any) {
      lastError = error;
      console.error(`❌ Email sending failed (attempt ${attempt}/${retries}):`, error.message);

      // If not the last attempt, wait before retrying (exponential backoff)
      if (attempt < retries) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Max 5s delay
        console.log(`⏳ Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  console.error(`❌ Email sending failed after ${retries} attempts:`, lastError?.message);
  return false;
};

// Format license key with dashes for better readability (XXX-XXX-XXX)
const formatLicenseKey = (key: string): string => {
  return key.match(/.{1,3}/g)?.join('-') || key;
};

// Generate HTML email template for license key credentials
const generateLicenseKeyEmailHTML = (data: LicenseKeyEmailData): string => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Scan2Card License Key</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f4f4f4;
      margin: 0;
      padding: 0;
    }
    .email-container {
      max-width: 600px;
      margin: 20px auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      background: #854AE6;
      color: #ffffff;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .content {
      padding: 30px;
    }
    .credentials-box {
      background-color: #f8f9fa;
      border-left: 4px solid #854AE6;
      padding: 20px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .credential-item {
      margin: 12px 0;
    }
    .credential-label {
      font-weight: 600;
      color: #555;
      display: inline-block;
      min-width: 120px;
    }
    .credential-value {
      font-family: 'Courier New', monospace;
      background-color: #ffffff;
      padding: 8px 12px;
      border-radius: 4px;
      border: 1px solid #dee2e6;
      display: inline-block;
      font-size: 14px;
      color: #000;
    }
    .important-note {
      background-color: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .important-note strong {
      color: #856404;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 20px;
      text-align: center;
      font-size: 14px;
      color: #6c757d;
      border-top: 1px solid #dee2e6;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background: #854AE6;
      color: #ffffff;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      margin: 10px 0;
    }
    .qr-box {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 16px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      background-color: #f8fafc;
    }
    .qr-box img {
      width: 180px;
      height: 180px;
    }
    .qr-caption {
      font-size: 13px;
      color: #475569;
      text-align: center;
      word-break: break-all;
    }
    @media only screen and (max-width: 600px) {
      .email-container {
        margin: 0;
        border-radius: 0;
      }
      .content {
        padding: 20px;
      }
      .credential-label {
        display: block;
        margin-bottom: 5px;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>🎉 Your Scan2Card License Key</h1>
    </div>

    <div class="content">
      <p>Hello,</p>

      <p>Your license key for <strong>Scan2Card</strong> has been generated successfully! Below are your credentials to access the platform.</p>

      ${data.eventName ? `<p><strong>Event:</strong> ${data.eventName}</p>` : ''}
      ${data.stallName ? `<p><strong>Stall:</strong> ${data.stallName}</p>` : ''}

      <div class="credentials-box">
        <h3 style="margin-top: 0; color: #854AE6;">📋 Your Credentials</h3>

        <div class="credential-item">
          <span class="credential-label">License Key:</span>
          <span class="credential-value">${formatLicenseKey(data.licenseKey)}</span>
        </div>

        <div class="credential-item">
          <span class="credential-label">Email:</span>
          <span class="credential-value">${data.email}</span>
        </div>

        <div class="credential-item">
          <span class="credential-label">Password:</span>
          <span class="credential-value">${data.password}</span>
        </div>

        <div class="credential-item">
          <span class="credential-label">Expires At:</span>
          <span class="credential-value">${new Date(data.expiresAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</span>
        </div>
      </div>

      ${data.qrCodeDataUrl ? `
      <div style="margin: 24px 0; text-align: center;">
        <h3 style="margin: 0 0 8px 0; color: #854AE6;">Scan to fill your key</h3>
        <div class="qr-box">
          <img src="cid:qrcode-license-key" alt="License key QR code" style="width: 180px; height: 180px;" />
          <div class="qr-caption">${formatLicenseKey(data.qrContent || data.licenseKey)}</div>
        </div>
        <p style="margin: 12px 0 0 0; color: #6c757d; font-size: 13px;">Point your camera at the QR to copy the key quickly.</p>
      </div>
      ` : ''}

      <div class="important-note">
        <strong>⚠️ Important:</strong> Please keep these credentials safe and secure. Change your password after your first login for better security.
      </div>

      <p style="margin-top: 30px;">
        <a href="https://stag-dashboard.scan2card.com/" class="button" style="color: #ffffff !important;">Login to Scan2Card</a>
      </p>

      <p style="margin-top: 30px; color: #6c757d; font-size: 14px;">
        If you have any questions or need assistance, please contact our support team.
      </p>
    </div>

    <div class="footer">
      <p style="margin: 5px 0;">© ${new Date().getFullYear()} Scan2Card. All rights reserved.</p>
      <p style="margin: 5px 0;">This is an automated email. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
};

// Helper function to format meeting date and time
const formatMeetingDateTime = (date: Date): string => {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
};

// Helper function to check if a string is a valid URL
const isValidUrl = (str: string): boolean => {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

// Generate HTML email template for meeting reminder
const generateMeetingReminderEmailHTML = (data: MeetingReminderEmailData): string => {
  const meetingModeLabel =
    data.meetingMode === 'online' ? '💻 Online Meeting' :
    data.meetingMode === 'offline' ? '📍 In-Person Meeting' :
    '📞 Phone Call';

  // Format location as clickable link if it's a URL
  let locationDisplay = data.location || '';
  if (data.location && isValidUrl(data.location)) {
    locationDisplay = `<a href="${data.location}" style="color: #854AE6; text-decoration: none; font-weight: 600;" target="_blank">${data.location}</a>`;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Meeting Reminder</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f4f4f4;
      margin: 0;
      padding: 0;
    }
    .email-container {
      max-width: 600px;
      margin: 20px auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      background: #854AE6;
      color: #ffffff;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .content {
      padding: 30px;
    }
    .meeting-box {
      background-color: #f8f9fa;
      border-left: 4px solid #854AE6;
      padding: 20px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .meeting-item {
      margin: 12px 0;
    }
    .meeting-label {
      font-weight: 600;
      color: #555;
      display: inline-block;
      min-width: 120px;
    }
    .meeting-value {
      color: #000;
      font-size: 14px;
    }
    .time-highlight {
      background-color: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
      font-size: 16px;
      font-weight: 600;
      color: #856404;
      text-align: center;
    }
    .important-note {
      background-color: #d1ecf1;
      border-left: 4px solid #0c5460;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .important-note strong {
      color: #0c5460;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 20px;
      text-align: center;
      font-size: 14px;
      color: #6c757d;
      border-top: 1px solid #dee2e6;
    }
    a {
      color: #854AE6;
      text-decoration: underline;
    }
    a:hover {
      color: #6A38B8;
    }
    @media only screen and (max-width: 600px) {
      .email-container {
        margin: 0;
        border-radius: 0;
      }
      .content {
        padding: 20px;
      }
      .meeting-label {
        display: block;
        margin-bottom: 5px;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>📅 Meeting Reminder</h1>
    </div>

    <div class="content">
      <p>Hello <strong>${data.leadName}</strong>,</p>

      <p>This is a friendly reminder about your upcoming meeting with <strong>${data.userFirstName} ${data.userLastName}</strong>.</p>

      <div class="time-highlight">
        ⏰ Your meeting starts in ${data.minutesUntil} minutes
      </div>

      <div class="meeting-box">
        <h3 style="margin-top: 0; color: #854AE6;">📋 Meeting Details</h3>

        <div class="meeting-item">
          <span class="meeting-label">Title:</span>
          <span class="meeting-value"><strong>${data.meetingTitle}</strong></span>
        </div>

        <div class="meeting-item">
          <span class="meeting-label">Type:</span>
          <span class="meeting-value">${meetingModeLabel}</span>
        </div>

        <div class="meeting-item">
          <span class="meeting-label">Start Time:</span>
          <span class="meeting-value">${formatMeetingDateTime(data.startAt)}</span>
        </div>

        <div class="meeting-item">
          <span class="meeting-label">End Time:</span>
          <span class="meeting-value">${formatMeetingDateTime(data.endAt)}</span>
        </div>

        ${data.location ? `
        <div class="meeting-item">
          <span class="meeting-label">${data.meetingMode === 'online' ? 'Meeting Link:' : 'Location:'}</span>
          <span class="meeting-value">${locationDisplay}</span>
        </div>
        ` : ''}

        <div class="meeting-item">
          <span class="meeting-label">With:</span>
          <span class="meeting-value">${data.userFirstName} ${data.userLastName}</span>
        </div>
      </div>

      ${data.meetingMode === 'online' && data.location && isValidUrl(data.location) ? `
      <div style="text-align: center; margin: 30px 0;">
        <a href="${data.location}"
           style="display: inline-block;
                  padding: 14px 28px;
                  background: #854AE6;
                  color: #ffffff !important;
                  text-decoration: none;
                  border-radius: 6px;
                  font-weight: 600;
                  font-size: 16px;">
          🎥 Join Meeting
        </a>
      </div>
      ` : ''}

      <div class="important-note">
        <strong>💡 Please be on time!</strong> ${data.userFirstName} ${data.userLastName} is looking forward to meeting with you.
      </div>

      <p style="margin-top: 30px; color: #6c757d; font-size: 14px;">
        If you need to reschedule or have any questions, please contact ${data.userFirstName} ${data.userLastName} directly.
      </p>
    </div>

    <div class="footer">
      <p style="margin: 5px 0;">© ${new Date().getFullYear()} Scan2Card. All rights reserved.</p>
      <p style="margin: 5px 0;">This is an automated email. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
};

// Generate plain text version of the email
const generateLicenseKeyEmailText = (data: LicenseKeyEmailData): string => {
  return `
Your Scan2Card License Key

Hello,

Your license key for Scan2Card has been generated successfully!

${data.eventName ? `Event: ${data.eventName}` : ''}
${data.stallName ? `Stall: ${data.stallName}` : ''}

Your Credentials:
-----------------
License Key: ${formatLicenseKey(data.licenseKey)}
Email: ${data.email}
Password: ${data.password}
Expires At: ${new Date(data.expiresAt).toLocaleDateString()}

QR Code (Original): ${data.qrContent || data.licenseKey}

IMPORTANT: Please keep these credentials safe and secure. Change your password after your first login for better security.

If you have any questions or need assistance, please contact our support team.

© ${new Date().getFullYear()} Scan2Card. All rights reserved.
This is an automated email. Please do not reply.
  `.trim();
};

// Generate plain text version of meeting reminder email
const generateMeetingReminderEmailText = (data: MeetingReminderEmailData): string => {
  const meetingModeLabel =
    data.meetingMode === 'online' ? 'Online Meeting' :
    data.meetingMode === 'offline' ? 'In-Person Meeting' :
    'Phone Call';

  // Format location label based on meeting mode
  const locationLabel = data.meetingMode === 'online' ? 'Meeting Link' : 'Location';

  return `
Meeting Reminder

Hello ${data.leadName},

This is a friendly reminder about your upcoming meeting with ${data.userFirstName} ${data.userLastName}.

⏰ YOUR MEETING STARTS IN ${data.minutesUntil} MINUTES

Meeting Details:
-----------------
Title: ${data.meetingTitle}
Type: ${meetingModeLabel}
Start Time: ${formatMeetingDateTime(data.startAt)}
End Time: ${formatMeetingDateTime(data.endAt)}
${data.location ? `${locationLabel}: ${data.location}` : ''}
With: ${data.userFirstName} ${data.userLastName}

💡 Please be on time! ${data.userFirstName} ${data.userLastName} is looking forward to meeting with you.

If you need to reschedule or have any questions, please contact ${data.userFirstName} ${data.userLastName} directly.

© ${new Date().getFullYear()} Scan2Card. All rights reserved.
This is an automated email. Please do not reply.
  `.trim();
};

// Send license key credentials email
export const sendLicenseKeyEmail = async (data: LicenseKeyEmailData): Promise<boolean> => {
  const subject = `Your Scan2Card License Key${data.eventName ? ` - ${data.eventName}` : ''}`;

  // Generate QR code for quick scanning of the license key
  let qrCodeDataUrl: string | undefined;
  let qrCodeBuffer: Buffer | undefined;
  const qrContent = data.licenseKey;
  try {
    qrCodeBuffer = await QRCode.toBuffer(qrContent, {
      errorCorrectionLevel: "M",
      scale: 6,
      margin: 1,
    });
    qrCodeDataUrl = `data:image/png;base64,${qrCodeBuffer.toString("base64")}`;
  } catch (qrError: any) {
    console.warn("⚠️  QR code generation failed: ", qrError?.message || qrError);
  }

  const attachments: any[] = [];
  if (qrCodeBuffer) {
    attachments.push({
      filename: "license-key-qr.png",
      content: qrCodeBuffer,
      cid: "qrcode-license-key",
    });
  }

  const emailOptions: EmailOptions = {
    to: data.email,
    subject,
    html: generateLicenseKeyEmailHTML({ ...data, qrCodeDataUrl, qrContent }),
    text: generateLicenseKeyEmailText({ ...data, qrCodeDataUrl, qrContent }),
    attachments: attachments.length > 0 ? attachments : undefined,
  };

  return await sendEmail(emailOptions);
};

// Generate HTML email template for exhibitor welcome email
const generateExhibitorWelcomeEmailHTML = (data: ExhibitorWelcomeEmailData): string => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Scan2Card</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f4f4f4;
      margin: 0;
      padding: 0;
    }
    .email-container {
      max-width: 600px;
      margin: 20px auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #854AE6 0%, #6A38B8 100%);
      color: #ffffff;
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .content {
      padding: 30px;
    }
    .credentials-box {
      background-color: #f8f9fa;
      border-left: 4px solid #854AE6;
      padding: 20px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .credential-item {
      margin: 12px 0;
    }
    .credential-label {
      font-weight: 600;
      color: #555;
      display: inline-block;
      min-width: 100px;
    }
    .credential-value {
      font-family: 'Courier New', monospace;
      background-color: #ffffff;
      padding: 8px 12px;
      border-radius: 4px;
      border: 1px solid #dee2e6;
      display: inline-block;
      font-size: 14px;
      color: #000;
    }
    .important-note {
      background-color: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .important-note strong {
      color: #856404;
    }
    .security-note {
      background-color: #f8d7da;
      border-left: 4px solid #dc3545;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .security-note strong {
      color: #721c24;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 20px;
      text-align: center;
      font-size: 14px;
      color: #6c757d;
      border-top: 1px solid #dee2e6;
    }
    .button {
      display: inline-block;
      padding: 14px 28px;
      background: #854AE6;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      margin: 20px 0;
      font-size: 16px;
    }
    .button:hover {
      background: #6A38B8;
    }
    .steps-list {
      background-color: #e7f3ff;
      border-left: 4px solid #0066cc;
      padding: 20px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .steps-list ol {
      margin: 10px 0;
      padding-left: 20px;
    }
    .steps-list li {
      margin: 8px 0;
      color: #333;
    }
    @media only screen and (max-width: 600px) {
      .email-container {
        margin: 0;
        border-radius: 0;
      }
      .content {
        padding: 20px;
      }
      .credential-label {
        display: block;
        margin-bottom: 5px;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>🎉 Welcome to Scan2Card!</h1>
      <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.95;">Your Exhibitor Account is Ready</p>
    </div>

    <div class="content">
      <p>Hello <strong>${data.firstName} ${data.lastName}</strong>,</p>

      <p>Your exhibitor account has been successfully created! You can now access the Scan2Card platform to manage events, generate license keys, and track your leads.</p>

      ${data.companyName ? `<p><strong>Company:</strong> ${data.companyName}</p>` : ''}

      <div class="credentials-box">
        <h3 style="margin-top: 0; color: #854AE6;">🔑 Your Login Credentials</h3>

        <div class="credential-item">
          <span class="credential-label">Email:</span>
          <span class="credential-value">${data.email}</span>
        </div>

        <div class="credential-item">
          <span class="credential-label">Password:</span>
          <span class="credential-value">${data.password}</span>
        </div>
      </div>

      <div class="security-note">
        <strong>🔒 IMPORTANT - Security Notice:</strong><br>
        For your account security, please change your password immediately after your first login.
      </div>

      <div class="steps-list">
        <h4 style="margin-top: 0; color: #0066cc;">📝 How to Change Your Password:</h4>
        <ol>
          <li>Log in to your account using the credentials above</li>
          <li>Navigate to the <strong>Profile</strong> page</li>
          <li>Click on the <strong>Change Password</strong> tab</li>
          <li>Enter your current password and set a new secure password</li>
        </ol>
      </div>

      <div style="text-align: center;">
        <a href="https://stag-dashboard.scan2card.com/login" class="button">Login to Dashboard</a>
      </div>

      <div class="important-note">
        <strong>💡 Getting Started:</strong><br>
        Once logged in, you can create events, generate license keys for team managers, and monitor lead collection activities in real-time.
      </div>

      <p style="margin-top: 30px; color: #6c757d; font-size: 14px;">
        If you have any questions or need assistance, please contact our support team.
      </p>
    </div>

    <div class="footer">
      <p style="margin: 5px 0;">© ${new Date().getFullYear()} Scan2Card. All rights reserved.</p>
      <p style="margin: 5px 0;">This is an automated email. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
};

// Generate plain text version of exhibitor welcome email
const generateExhibitorWelcomeEmailText = (data: ExhibitorWelcomeEmailData): string => {
  return `
Welcome to Scan2Card!

Hello ${data.firstName} ${data.lastName},

Your exhibitor account has been successfully created! You can now access the Scan2Card platform to manage events, generate license keys, and track your leads.

${data.companyName ? `Company: ${data.companyName}` : ''}

Your Login Credentials:
-----------------------
Email: ${data.email}
Password: ${data.password}

IMPORTANT - SECURITY NOTICE:
For your account security, please change your password immediately after your first login.

How to Change Your Password:
1. Log in to your account using the credentials above
2. Navigate to the Profile page
3. Click on the Change Password tab
4. Enter your current password and set a new secure password

Login URL: https://stag-dashboard.scan2card.com/login

Getting Started:
Once logged in, you can create events, generate license keys for team managers, and monitor lead collection activities in real-time.

If you have any questions or need assistance, please contact our support team.

© ${new Date().getFullYear()} Scan2Card. All rights reserved.
This is an automated email. Please do not reply.
  `.trim();
};

// Send exhibitor welcome email
export const sendExhibitorWelcomeEmail = async (data: ExhibitorWelcomeEmailData): Promise<boolean> => {
  const subject = `Welcome to Scan2Card - Your Exhibitor Account is Ready`;

  const emailOptions: EmailOptions = {
    to: data.email,
    subject,
    html: generateExhibitorWelcomeEmailHTML(data),
    text: generateExhibitorWelcomeEmailText(data),
  };

  return await sendEmail(emailOptions);
};

// Send meeting reminder email to lead
export const sendMeetingReminderEmail = async (data: MeetingReminderEmailData): Promise<boolean> => {
  const subject = `Meeting Reminder: ${data.meetingTitle}`;

  const emailOptions: EmailOptions = {
    to: data.leadEmail,
    subject,
    html: generateMeetingReminderEmailHTML(data),
    text: generateMeetingReminderEmailText(data),
  };

  return await sendEmail(emailOptions);
};
