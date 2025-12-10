import axios from "axios";
import { config } from "../config/config";
import OTPModel from "../models/otp.model";
import UserModel from "../models/user.model";

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
 * Send OTP via TextPe SMS API
 */
const sendOTPViaSMS = async (phoneNumber: string, otp: string): Promise<boolean> => {
  try {
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

    console.log(`📤 Sending SMS to ${phoneNumber} (formatted: ${formattedNumber})...`);
    const response = await axios.get(url);

    console.log(`📨 SMS API Response:`, {
      status: response.status,
      data: response.data
    });

    return response.status >= 200 && response.status < 300;
  } catch (error: any) {
    console.error("❌ Error sending OTP via SMS:", error.message);
    if (error.response) {
      console.error("SMS API Error Response:", {
        status: error.response.status,
        data: error.response.data
      });
    }
    return false;
  }
};

/**
 * Send OTP via Email (placeholder - implement your email service)
 */
const sendOTPViaEmail = async (email: string, otp: string): Promise<boolean> => {
  try {
    // TODO: Implement your email service (e.g., SendGrid, Nodemailer, etc.)
    console.log(`📧 EMAIL OTP for ${email}: ${otp}`);
    // For now, just log it
    return true;
  } catch (error: any) {
    console.error("Error sending OTP via email:", error.message);
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
