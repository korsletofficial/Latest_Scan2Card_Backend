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

// Create reusable transporter
const createTransporter = () => {
  const config = {
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_PORT || "587"),
    secure: process.env.EMAIL_SECURE === "true",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  };

  // Validate email configuration
  if (!config.auth.user || !config.auth.pass) {
    console.warn("⚠️  Email configuration is incomplete. Emails will not be sent.");
    console.warn("EMAIL_USER:", process.env.EMAIL_USER ? "Set" : "Not set");
    console.warn("EMAIL_PASSWORD:", process.env.EMAIL_PASSWORD ? "Set (hidden)" : "Not set");
    return null;
  }

  console.log("📧 Email config loaded:", {
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.auth.user,
  });

  return nodemailer.createTransport(config);
};

// Send generic email
export const sendEmail = async (options: EmailOptions): Promise<boolean> => {
  try {
    const transporter = createTransporter();

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
    console.log("✅ Email sent successfully:", info.messageId);
    return true;
  } catch (error: any) {
    console.error("❌ Email sending failed:", error.message);
    return false;
  }
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
