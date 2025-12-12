import axios from "axios";
import jwt from "jsonwebtoken";
import { config } from "../config/config";
import OTPModel from "../models/otp.model";
import UserModel from "../models/user.model";
import { sendEmail } from "../services/email.service";

/**
 * Generate a random numeric OTP
 */
export const generateOTP = (length: number = 6): string => {
  const digits = "0123456789";
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * digits.length)];
  }
  return otp;
};

/**
 * Format phone number with country code
 */
const formatPhoneNumber = (phoneNumber: string): string => {
  // Remove any spaces, dashes, or special characters
  let cleaned = phoneNumber.replace(/[\s\-\(\)]/g, "");

  // If it starts with +, remove it
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }

  // If it's a 10-digit number (Indian format without country code), add 91
  if (cleaned.length === 10 && !cleaned.startsWith("91")) {
    cleaned = "91" + cleaned;
  }

  return cleaned;
};

/**
 * Send OTP via TextPe SMS API with retry logic
 */
const sendOTPViaSMS = async (phoneNumber: string, otp: string, retries = 3): Promise<boolean> => {
  const apiKey = config.SMARTPING_API;

  // Check if API key is configured
  if (!apiKey || apiKey === "your_smartping_api_key_here") {
    console.error("❌ SMS API key not configured. Please set SMARTPING_APIKEY in .env file");
    console.log(`💡 TIP: Set USE_DUMMY_OTP=true in .env to test without SMS`);
    return false;
  }

  // Format phone number with country code
  const formattedNumber = formatPhoneNumber(phoneNumber);

  const senderId = config.SMS_SENDER_ID;
  const channel = config.SMS_CHANNEL;
  const dcs = config.SMS_DCS;
  const flashSms = config.SMS_FLASH;
  const route = config.SMS_ROUTE;
  // Use the exact template registered with TRAI DLT
  const text = `Your OTP for verification with Colourstop Solutions is ${otp}. Do not share this code. It is valid for 10 minutes only.`;

  const url = `http://sms.textpe.in/api/mt/SendSMS?APIKey=${apiKey}&senderid=${senderId}&channel=${channel}&DCS=${dcs}&flashsms=${flashSms}&number=${formattedNumber}&text=${encodeURIComponent(text)}&route=${route}`;

  let lastError: any;

  // Retry logic with exponential backoff
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`📤 Sending SMS to ${phoneNumber} (formatted: ${formattedNumber}) - Attempt ${attempt}/${retries}...`);
      const response = await axios.get(url, {
        timeout: 10000, // 10s timeout per request
      });

      console.log(`📨 SMS API Response (attempt ${attempt}/${retries}):`, {
        status: response.status,
        data: response.data
      });

      if (response.status >= 200 && response.status < 300) {
        console.log(`✅ SMS sent successfully on attempt ${attempt}/${retries}`);
        return true;
      }

      lastError = new Error(`SMS API returned status ${response.status}`);
    } catch (error: any) {
      lastError = error;
      console.error(`❌ Error sending OTP via SMS (attempt ${attempt}/${retries}):`, error.message);
      if (error.response) {
        console.error("SMS API Error Response:", {
          status: error.response.status,
          data: error.response.data
        });
      }

      // If not the last attempt, wait before retrying (exponential backoff)
      if (attempt < retries) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Max 5s delay
        console.log(`⏳ Retrying SMS in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  console.error(`❌ SMS sending failed after ${retries} attempts:`, lastError?.message);
  return false;
};

/**
 * Send OTP via Email with retry logic
 */
const sendOTPViaEmail = async (email: string, otp: string, retries = 3): Promise<boolean> => {
  console.log(`📧 Attempting to send OTP email to ${email}`);

  // Create HTML email template
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f9f9f9;
        }
        .header {
          background: linear-gradient(135deg, #854AE6 0%, #9D6BF0 100%);
          padding: 30px;
          text-align: center;
          border-radius: 10px 10px 0 0;
        }
        .header h1 {
          color: white;
          margin: 0;
          font-size: 28px;
        }
        .content {
          background-color: white;
          padding: 40px 30px;
          border-radius: 0 0 10px 10px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .otp-box {
          background-color: #f0f0f0;
          border: 2px dashed #854AE6;
          border-radius: 8px;
          padding: 20px;
          text-align: center;
          margin: 30px 0;
        }
        .otp-code {
          font-size: 32px;
          font-weight: bold;
          color: #854AE6;
          letter-spacing: 8px;
          margin: 10px 0;
        }
        .footer {
          text-align: center;
          margin-top: 20px;
          font-size: 12px;
          color: #666;
        }
        .warning {
          background-color: #fff3cd;
          border-left: 4px solid #ffc107;
          padding: 12px;
          margin: 20px 0;
          border-radius: 4px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔐 Scan2Card Verification</h1>
        </div>
        <div class="content">
          <h2>Your One-Time Password (OTP)</h2>
          <p>Hello,</p>
          <p>You have requested to reset your password. Please use the following OTP code to verify your identity:</p>

          <div class="otp-box">
            <div style="font-size: 14px; color: #666; margin-bottom: 10px;">YOUR OTP CODE</div>
            <div class="otp-code">${otp}</div>
            <div style="font-size: 12px; color: #666; margin-top: 10px;">Valid for 10 minutes</div>
          </div>

          <div class="warning">
            <strong>⚠️ Security Notice:</strong> Do not share this code with anyone. Scan2Card will never ask for your OTP via phone call or text message.
          </div>

          <p>If you didn't request this code, please ignore this email or contact support if you have concerns about your account security.</p>

          <p>Best regards,<br><strong>Scan2Card Team</strong></p>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
          <p>&copy; ${new Date().getFullYear()} Scan2Card. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  // Plain text version for email clients that don't support HTML
  const textContent = `
Scan2Card - Password Reset OTP

Your One-Time Password (OTP): ${otp}

This code is valid for 10 minutes.

Do not share this code with anyone. If you didn't request this code, please ignore this email.

Best regards,
Scan2Card Team
  `;

  try {
    // Use the email service with built-in retry logic
    const success = await sendEmail({
      to: email,
      subject: "🔐 Scan2Card - Password Reset OTP",
      html: htmlContent,
      text: textContent,
    }, retries);

    if (success) {
      console.log(`✅ OTP email sent successfully to ${email}`);
      return true;
    } else {
      console.error(`❌ Failed to send OTP email to ${email}`);
      return false;
    }
  } catch (error: any) {
    console.error(`❌ Error sending OTP via email to ${email}:`, error.message);
    return false;
  }
};

/**
 * Send verification code to user (Phone or Email)
 */
export const handleSendVerificationCode = async ({
  userId,
  source,
}: {
  userId: string;
  source: "phoneNumber" | "email";
}) => {
  // Fetch user details
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Validate source
  if (source === "phoneNumber" && !user.phoneNumber) {
    throw new Error("User does not have a phone number");
  }
  if (source === "email" && !user.email) {
    throw new Error("User does not have an email");
  }

  // Generate OTP
  let otp: string;
  let otpSentStatus = false;

  if (config.USE_DUMMY_OTP) {
    otp = config.DUMMY_OTP;
    console.log(`🔐 TESTING MODE: Using dummy OTP: ${otp}`);
    otpSentStatus = true;
  } else {
    otp = generateOTP(config.OTP_LENGTH);

    // Send OTP based on source
    if (source === "phoneNumber") {
      otpSentStatus = await sendOTPViaSMS(user.phoneNumber!, otp);
      if (otpSentStatus) {
        console.log(`✅ OTP sent successfully to phone ${user.phoneNumber}: ${otp}`);
      } else {
        console.error(`❌ Failed to send OTP to phone ${user.phoneNumber}`);
      }
    } else {
      otpSentStatus = await sendOTPViaEmail(user.email, otp);
      if (otpSentStatus) {
        console.log(`✅ OTP sent successfully to email ${user.email}: ${otp}`);
      } else {
        console.error(`❌ Failed to send OTP to email ${user.email}`);
      }
    }
  }

  if (!otpSentStatus && !config.USE_DUMMY_OTP) {
    throw new Error("Failed to send OTP. Please try again.");
  }

  // Calculate expiry time
  const expiresAt = new Date(Date.now() + config.OTP_VALIDITY_MINUTES * 60 * 1000);

  // Create OTP record in database
  const otpRecord = await OTPModel.create({
    userId: user._id,
    otp,
    purpose: "verification",
    expiresAt,
    isUsed: false,
  });

  return {
    verificationId: otpRecord._id,
    sentTo: source === "phoneNumber" ? user.phoneNumber : user.email,
    source,
  };
};

/**
 * Check and verify OTP code
 */
export const handleCheckVerificationCode = async ({
  userId,
  source,
  code,
}: {
  userId: string;
  source: "phoneNumber" | "email";
  code: string;
}) => {
  // Fetch user
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Normalize code
  const normalizedCode = code.trim();
  const masterCode = config.MASTER_OTP;

  // Check if master code is used (works in all environments for testing)
  if (normalizedCode === masterCode) {
    console.log("🔓 Master OTP used for verification");

    // Mark user as verified
    user.isVerified = true;
    await user.save();

    return {
      isValid: true,
      userId: user._id,
      isVerified: true,
    };
  }

  // Find the latest OTP record for this user
  const otpRecord = await OTPModel.findOne({
    userId,
    purpose: "verification",
    isUsed: false,
  }).sort({ createdAt: -1 });

  if (!otpRecord) {
    throw new Error("No OTP found. Please request a new OTP.");
  }

  // Check if already used
  if (otpRecord.isUsed) {
    throw new Error("OTP has already been used");
  }

  // Check if expired
  if (new Date() > otpRecord.expiresAt) {
    throw new Error("OTP has expired. Please request a new OTP.");
  }

  // Verify OTP matches
  if (otpRecord.otp !== normalizedCode) {
    throw new Error("Invalid OTP. Please try again.");
  }

  // Mark OTP as used
  otpRecord.isUsed = true;
  await otpRecord.save();

  // Mark user as verified
  user.isVerified = true;
  await user.save();

  return {
    isValid: true,
    userId: user._id,
    isVerified: true,
  };
};

/**
 * Send OTP for login (2FA)
 */
export const handleSendLoginOTP = async (userId: string) => {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Generate OTP
  let otp: string;
  let otpSentStatus = false;
  let sentTo: string;
  let sentVia: "phoneNumber" | "email";

  if (config.USE_DUMMY_OTP) {
    otp = config.DUMMY_OTP;
    console.log(`🔐 TESTING MODE: Using dummy OTP for login: ${otp}`);
    otpSentStatus = true;
    sentTo = user.phoneNumber || user.email;
    sentVia = user.phoneNumber ? "phoneNumber" : "email";
  } else {
    otp = generateOTP(config.OTP_LENGTH);

    // Prioritize phone number, fall back to email
    if (user.phoneNumber) {
      otpSentStatus = await sendOTPViaSMS(user.phoneNumber, otp);
      if (otpSentStatus) {
        console.log(`✅ 2FA OTP sent to phone ${user.phoneNumber}: ${otp}`);
      } else {
        console.error(`❌ Failed to send OTP to phone ${user.phoneNumber}`);
      }
      sentTo = user.phoneNumber;
      sentVia = "phoneNumber";
    } else {
      otpSentStatus = await sendOTPViaEmail(user.email, otp);
      if (otpSentStatus) {
        console.log(`✅ 2FA OTP sent to email ${user.email}: ${otp}`);
      } else {
        console.error(`❌ Failed to send OTP to email ${user.email}`);
      }
      sentTo = user.email;
      sentVia = "email";
    }
  }

  if (!otpSentStatus && !config.USE_DUMMY_OTP) {
    throw new Error("Failed to send OTP. Please try again.");
  }

  // Calculate expiry time
  const expiresAt = new Date(Date.now() + config.OTP_VALIDITY_MINUTES * 60 * 1000);

  // Create OTP record
  await OTPModel.create({
    userId: user._id,
    otp,
    purpose: "login",
    expiresAt,
    isUsed: false,
  });

  return {
    userId: user._id,
    email: user.email,
    phoneNumber: user.phoneNumber,
    sentTo,
    sentVia,
  };
};

/**
 * Verify login OTP (2FA)
 */
export const handleVerifyLoginOTP = async (userId: string, code: string) => {
  const normalizedCode = code.trim();
  const masterCode = config.MASTER_OTP;

  // Check if master code is used
  if (normalizedCode === masterCode) {
    console.log("🔓 Master OTP used for login");
    return {
      isValid: true,
      userId,
    };
  }

  // Find the latest login OTP
  const otpRecord = await OTPModel.findOne({
    userId,
    purpose: "login",
    isUsed: false,
  }).sort({ createdAt: -1 });

  if (!otpRecord) {
    throw new Error("No OTP found. Please request a new OTP.");
  }

  // Check if already used
  if (otpRecord.isUsed) {
    throw new Error("OTP has already been used");
  }

  // Check if expired
  if (new Date() > otpRecord.expiresAt) {
    throw new Error("OTP has expired. Please request a new OTP.");
  }

  // Verify OTP matches
  if (otpRecord.otp !== normalizedCode) {
    throw new Error("Invalid OTP. Please try again.");
  }

  // Mark OTP as used
  otpRecord.isUsed = true;
  await otpRecord.save();

  return {
    isValid: true,
    userId,
  };
};

/**
 * Send OTP for forgot password
 */
export const handleSendForgotPasswordOTP = async (email?: string, phoneNumber?: string) => {
  // Build query to find user by email or phone number
  const query: any = { isDeleted: false };

  if (email && phoneNumber) {
    // If both provided, find by either
    query.$or = [{ email }, { phoneNumber }];
  } else if (email) {
    query.email = email;
  } else if (phoneNumber) {
    query.phoneNumber = phoneNumber;
  } else {
    throw new Error("Email or phone number is required");
  }

  const user = await UserModel.findOne(query);
  if (!user) {
    throw new Error("User with this email or phone number does not exist");
  }

  // Generate OTP
  let otp: string;
  let otpSentStatus = false;
  let sentTo: string = "";
  let sentVia: "phoneNumber" | "email";

  if (config.USE_DUMMY_OTP) {
    otp = config.DUMMY_OTP;
    console.log(`🔐 TESTING MODE: Using dummy OTP for forgot password: ${otp}`);
    otpSentStatus = true;
    if (user.phoneNumber) {
      sentTo = user.phoneNumber;
      sentVia = "phoneNumber";
    } else if (user.email) {
      sentTo = user.email;
      sentVia = "email";
    } else {
      throw new Error("User does not have a valid phone number or email");
    }
  } else {
    otp = generateOTP(config.OTP_LENGTH);

    // Prioritize phone number, fall back to email
    if (user.phoneNumber) {
      otpSentStatus = await sendOTPViaSMS(user.phoneNumber, otp);
      if (otpSentStatus) {
        console.log(`✅ Forgot Password OTP sent to phone ${user.phoneNumber}: ${otp}`);
      } else {
        console.error(`❌ Failed to send OTP to phone ${user.phoneNumber}`);
      }
      sentTo = user.phoneNumber;
      sentVia = "phoneNumber";
    } else if (user.email) {
      otpSentStatus = await sendOTPViaEmail(user.email, otp);
      if (otpSentStatus) {
        console.log(`✅ Forgot Password OTP sent to email ${user.email}: ${otp}`);
      } else {
        console.error(`❌ Failed to send OTP to email ${user.email}`);
      }
      sentTo = user.email;
      sentVia = "email";
    } else {
      throw new Error("User does not have a valid phone number or email");
    }
  }

  if (!otpSentStatus && !config.USE_DUMMY_OTP) {
    throw new Error("Failed to send OTP. Please try again.");
  }

  // Calculate expiry time
  const expiresAt = new Date(Date.now() + config.OTP_VALIDITY_MINUTES * 60 * 1000);

  // Create OTP record
  const otpRecord = await OTPModel.create({
    userId: user._id,
    otp,
    purpose: "forgot_password",
    expiresAt,
    isUsed: false,
  });

  console.log(`✅ Forgot Password OTP created in database:`, {
    otpId: otpRecord._id,
    userId: user._id.toString(),
    purpose: "forgot_password",
    expiresAt: expiresAt.toISOString(),
    isUsed: false,
  });

  return {
    userId: user._id,
    email: user.email,
    phoneNumber: user.phoneNumber,
    sentTo,
    sentVia,
  };
};

/**
 * Verify forgot password OTP
 */
export const handleVerifyForgotPasswordOTP = async (userId: string, code: string) => {
  const normalizedCode = code.trim();
  const masterCode = config.MASTER_OTP;

  // Check if master code is used
  if (normalizedCode === masterCode) {
    console.log("🔓 Master OTP used for password reset");
    return {
      isValid: true,
      userId,
    };
  }

  console.log(`🔍 Searching for forgot password OTP:`, {
    userId,
    purpose: "forgot_password",
    isUsed: false,
    providedCode: normalizedCode,
  });

  // Find the latest forgot password OTP
  const otpRecord = await OTPModel.findOne({
    userId,
    purpose: "forgot_password",
    isUsed: false,
  }).sort({ createdAt: -1 });

  console.log(`📝 OTP search result:`, otpRecord ? {
    found: true,
    otpId: otpRecord._id,
    userId: otpRecord.userId,
    purpose: otpRecord.purpose,
    isUsed: otpRecord.isUsed,
    expiresAt: otpRecord.expiresAt,
    storedOtp: otpRecord.otp,
  } : { found: false });

  if (!otpRecord) {
    // Check if there are ANY OTPs for this user
    const anyOtps = await OTPModel.find({ userId }).sort({ createdAt: -1 }).limit(3);
    console.log(`🔍 All OTPs for user ${userId}:`, anyOtps.map(o => ({
      purpose: o.purpose,
      isUsed: o.isUsed,
      expiresAt: o.expiresAt,
      createdAt: (o as any).createdAt,
    })));
    throw new Error("No OTP found. Please request a new OTP.");
  }

  // Check if already used
  if (otpRecord.isUsed) {
    throw new Error("OTP has already been used");
  }

  // Check if expired
  if (new Date() > otpRecord.expiresAt) {
    throw new Error("OTP has expired. Please request a new OTP.");
  }

  // Verify OTP matches
  if (otpRecord.otp !== normalizedCode) {
    throw new Error("Invalid OTP. Please try again.");
  }

  // Mark OTP as used
  otpRecord.isUsed = true;
  await otpRecord.save();

  return {
    isValid: true,
    userId,
  };
};

/**
 * Generate verification token for password reset
 */
const generateVerificationToken = (userId: string): string => {
  const secret = process.env.JWT_SECRET + "_VOT";
  return jwt.sign(
    { userId, purpose: "password_reset_verified" },
    secret,
    { expiresIn: "10m" } // 10 minute expiry
  );
};

/**
 * Unified OTP verification handler
 * Routes to appropriate verification method based on type
 */
export const handleUnifiedOTPVerification = async ({
  userId,
  otp,
  type,
}: {
  userId: string;
  otp: string;
  type: "login" | "verification" | "forgot_password";
}) => {
  let result: any;

  // Route to appropriate handler based on type
  switch (type) {
    case "login":
      result = await handleVerifyLoginOTP(userId, otp);
      return {
        isValid: result.isValid,
        userId: result.userId,
        type: "login",
      };

    case "verification":
      result = await handleCheckVerificationCode({
        userId,
        code: otp,
        source: "email", // Source doesn't matter for verification
      });
      return {
        isValid: result.isValid,
        userId: result.userId,
        isVerified: result.isVerified,
        type: "verification",
      };

    case "forgot_password":
      // Verify the OTP first
      result = await handleVerifyForgotPasswordOTP(userId, otp);

      // Generate verification token
      const verificationToken = generateVerificationToken(userId);
      const tokenExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store verification token in the OTP record
      const otpRecord = await OTPModel.findOne({
        userId,
        purpose: "forgot_password",
        isUsed: true, // Already marked as used by handleVerifyForgotPasswordOTP
      }).sort({ createdAt: -1 });

      if (otpRecord) {
        otpRecord.verificationToken = verificationToken;
        otpRecord.verificationTokenExpiry = tokenExpiry;
        await otpRecord.save();
      }

      return {
        isValid: result.isValid,
        userId: result.userId,
        verificationToken,
        type: "forgot_password",
      };

    default:
      throw new Error(`Invalid verification type: ${type}`);
  }
};
