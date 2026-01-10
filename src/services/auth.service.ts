import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { connectToMongooseDatabase } from "../config/db.config";
import UserModel, { IUser } from "../models/user.model";
import RoleModel from "../models/role.model";
// OTP-related services
import OTPModel from "../models/otp.model";
import {
  handleSendLoginOTP,
  handleVerifyLoginOTP,
  handleSendVerificationCode,
  handleCheckVerificationCode,
  handleSendForgotPasswordOTP,
  handleVerifyForgotPasswordOTP,
  handleUnifiedOTPVerification,
} from "../helpers/otp.helper";

export interface RegisterUserDTO {
  firstName: string;
  lastName: string;
  email?: string;
  phoneNumber?: string;
  companyName?: string;
  password: string;
  roleName: "SUPERADMIN" | "EXHIBITOR" | "TEAMMANAGER" | "ENDUSER";
  exhibitorId?: string;
}

interface LoginData {
  email?: string;
  phoneNumber?: string;
  password: string;
  skipPasswordCheck?: boolean;
}

// Register new user
export const registerUser = async (data: RegisterUserDTO) => {
  await connectToMongooseDatabase();

  // Validate at least one contact method
  if (!data.email && !data.phoneNumber) {
    throw new Error("At least one of email or phoneNumber must be provided");
  }

  // Check if user already exists with the same email or phone number
  const existingUserQuery: any[] = [];
  if (data.email) {
    existingUserQuery.push({ email: data.email });
  }
  if (data.phoneNumber) {
    existingUserQuery.push({ phoneNumber: data.phoneNumber });
  }

  const existingUser = await UserModel.findOne({
    $or: existingUserQuery,
    isDeleted: false,
  });

  if (existingUser) {
    if (data.email && existingUser.email === data.email) {
      throw new Error("User with this email already exists");
    }
    if (data.phoneNumber && existingUser.phoneNumber === data.phoneNumber) {
      throw new Error("User with this phone number already exists");
    }
  }

  // Find role by name
  const role = await RoleModel.findOne({ name: data.roleName, isDeleted: false });
  if (!role) {
    throw new Error(`Role '${data.roleName}' not found`);
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(data.password, 10);

  // Create user
  const newUser = await UserModel.create({
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    phoneNumber: data.phoneNumber,
    password: hashedPassword,
    role: role._id,
    companyName: data.companyName,
    isActive: true,
    isDeleted: false,
    isVerified: false, // User needs to verify via OTP
  });

  // Populate role to get role name
  await newUser.populate("role");

  // Send verification OTP automatically after registration (NON-BLOCKING)
  // Fire-and-forget pattern: don't wait for OTP to send before returning response
  const source = newUser.phoneNumber ? "phoneNumber" : "email";

  // Send OTP asynchronously without blocking registration response
  handleSendVerificationCode({
    userId: newUser._id.toString(),
    source,
  })
    .then(() => {
      console.log(`✅ Verification OTP sent to new user ${newUser.email || newUser.phoneNumber}`);
    })
    .catch((error: any) => {
      console.error(`❌ Failed to send verification OTP to ${newUser.email || newUser.phoneNumber}:`, error.message);
      // OTP sending failure is logged but doesn't block registration
    });

  return {
    user: {
      _id: newUser._id,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      email: newUser.email,
      phoneNumber: newUser.phoneNumber,
      role: (newUser.role as any).name, // Just return role name
      companyName: newUser.companyName,
      isVerified: newUser.isVerified,
    },
    message: "Registration successful. Please verify your account with the OTP sent to your " + source,
  };
};

// Login user
export const loginUser = async (data: LoginData) => {
  await connectToMongooseDatabase();

  // Build query - find by email or phoneNumber
  const query: any = { isDeleted: false };
  if (data.email) {
    query.email = data.email;
  } else if (data.phoneNumber) {
    query.phoneNumber = data.phoneNumber;
  } else {
    throw new Error("Email or phone number must be provided");
  }

  // Find user with password
  const user = await UserModel.findOne(query)
    .select("+password")
    .populate("role");

  if (!user) {
    throw new Error("Invalid credentials");
  }

  // Check if user is active
  if (!user.isActive) {
    throw new Error("Your account has been deactivated");
  }

  // Compare password (skip if this is after OTP verification)
  if (!data.skipPasswordCheck) {
    const isPasswordValid = await bcrypt.compare(data.password, user.password);
    if (!isPasswordValid) {
      throw new Error("Invalid credentials");
    }
  }

  // Check if 2FA is enabled - if yes, send OTP and require verification
  if (user.twoFactorEnabled && !data.skipPasswordCheck) {
    // Send 2FA OTP
    const otpResult = await handleSendLoginOTP(user._id.toString());

    // Throw error with special flag to indicate 2FA is required
    const destination = otpResult.sentVia === "phoneNumber" ? "mobile number" : "email";
    const error: any = new Error(`2FA required. OTP has been sent to your ${destination}.`);
    error.requires2FA = true;
    error.data = {
      userId: user._id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      sentTo: otpResult.sentTo,
      sentVia: otpResult.sentVia,
      requires2FA: true,
    };
    throw error;
  }

  // Generate JWT tokens (access + refresh)
  const jwtSecret = process.env.JWT_SECRET || "scan2card_secret";
  const refreshSecret = process.env.JWT_REFRESH_SECRET || "scan2card_refresh_secret";

  // Access token (short-lived: 1 hour default, backward compatible as 'token')
  const token = jwt.sign(
    {
      userId: user._id.toString(),
      email: user.email,
      role: (user.role as any).name,
    },
    jwtSecret,
    {
      expiresIn: (process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || '24h') as any,
    }
  );

  // Refresh token (long-lived: 7 days default)
  const refreshToken = jwt.sign(
    {
      userId: user._id.toString(),
      type: 'refresh',
    },
    refreshSecret,
    {
      expiresIn: (process.env.JWT_REFRESH_TOKEN_EXPIRES_IN || '7d') as any,
    }
  );

  // Calculate refresh token expiry date
  const refreshTokenExpiry = new Date();
  const expiryDays = parseInt(process.env.JWT_REFRESH_TOKEN_EXPIRES_IN?.replace('d', '') || '7');
  refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + expiryDays);

  // Store refresh token in database using updateOne to avoid full document validation
  await UserModel.updateOne(
    { _id: user._id },
    { 
      $set: { 
        refreshToken: refreshToken,
        refreshTokenExpiry: refreshTokenExpiry 
      }
    }
  );

  return {
    token, // Access token (backward compatible key name)
    refreshToken, // NEW: Refresh token for session renewal
    expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || '24h', // NEW: Token expiry time
    user: {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: (user.role as any).name, // Just return role name
      companyName: user.companyName,
      twoFactorEnabled: user.twoFactorEnabled,
      isVerified: user.isVerified,
      profileImage: user.profileImage || null,
    },
  };
};

// Verify JWT token
export const verifyToken = (token: string) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "scan2card_secret");
    return decoded;
  } catch (error) {
    throw new Error("Invalid or expired token");
  }
};

// Get user by ID
export const getUserById = async (userId: string) => {
  await connectToMongooseDatabase();

  const user = await UserModel.findById(userId).populate("role");
  if (!user || user.isDeleted) {
    throw new Error("User not found");
  }

  return {
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    role: (user.role as any).name, // Just return role name
    companyName: user.companyName,
    isActive: user.isActive,
    twoFactorEnabled: user.twoFactorEnabled,
    isVerified: user.isVerified,
    profileImage: user.profileImage || null,
  };
};


// Verify Login OTP
export const verifyLoginOTP = async (userId: string, otp: string) => {
  await connectToMongooseDatabase();

  // Use the OTP helper to verify
  const verification = await handleVerifyLoginOTP(userId, otp);

  if (!verification.isValid) {
    throw new Error("Invalid OTP");
  }

  // Get user and generate token
  const user = await UserModel.findById(userId).populate("role", "name");

  if (!user) {
    throw new Error("User not found");
  }

  // Generate token using the existing service
  const result = await loginUser({
    email: user.email,
    password: user.password,
    skipPasswordCheck: true,
  });

  return result;
};

// Send Verification OTP
export const sendVerificationOTP = async (userId: string, phoneNumber?: string) => {
  await connectToMongooseDatabase();

  // Find user
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Check if user is already verified
  if (user.isVerified) {
    throw new Error("User is already verified");
  }

  // Update phone number if provided
  if (phoneNumber && phoneNumber !== user.phoneNumber) {
    await UserModel.updateOne({ _id: user._id }, { $set: { phoneNumber } });
    user.phoneNumber = phoneNumber; // Update local reference for return value
  }

  // Determine source (prefer phone if available, otherwise email)
  const source = user.phoneNumber ? "phoneNumber" : "email";

  // Use OTP helper to send verification code
  const result = await handleSendVerificationCode({
    userId: user._id.toString(),
    source,
  });

  return {
    userId: user._id,
    phoneNumber: user.phoneNumber,
    email: user.email,
    sentTo: result.sentTo,
  };
};

// Verify User OTP
export const verifyUserOTP = async (userId: string, otp: string) => {
  await connectToMongooseDatabase();

  // Get user to determine source
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const source = user.phoneNumber ? "phoneNumber" : "email";

  // Use OTP helper to verify code
  const result = await handleCheckVerificationCode({
    userId,
    source,
    code: otp,
  });

  return {
    userId: result.userId,
    isVerified: result.isVerified,
  };
};

// Forgot Password - Send OTP
export const sendForgotPasswordOTP = async (email?: string, phoneNumber?: string) => {
  await connectToMongooseDatabase();

  // Use OTP helper to send forgot password OTP
  const result = await handleSendForgotPasswordOTP(email, phoneNumber);

  return result;
};

// Reset Password with OTP
export const resetPasswordWithOTP = async (
  userId: string,
  otp: string,
  newPassword: string
) => {
  await connectToMongooseDatabase();

  // Password validation (minimum 6 characters)
  if (newPassword.length < 6) {
    throw new Error("Password must be at least 6 characters long");
  }

  // Verify OTP using helper
  const verification = await handleVerifyForgotPasswordOTP(userId, otp);

  if (!verification.isValid) {
    throw new Error("Invalid OTP");
  }

  // Find user and update password
  const user = await UserModel.findById(userId).select("+password");
  if (!user) {
    throw new Error("User not found");
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await UserModel.updateOne({ _id: user._id }, { $set: { password: hashedPassword } });

  return {
    email: user.email,
  };
};

// Send 2FA Login OTP
export const send2FALoginOTP = async (userId: string) => {
  await connectToMongooseDatabase();

  // Use OTP helper to send login OTP
  const result = await handleSendLoginOTP(userId);

  return {
    requires2FA: true,
    ...result,
  };
};

// Refresh Access Token using Refresh Token
export const refreshAccessToken = async (refreshToken: string) => {
  await connectToMongooseDatabase();

  if (!refreshToken) {
    throw new Error("Refresh token is required");
  }

  // Verify refresh token
  const refreshSecret = process.env.JWT_REFRESH_SECRET || "scan2card_refresh_secret";
  let decoded: any;

  try {
    decoded = jwt.verify(refreshToken, refreshSecret);
  } catch (error) {
    throw new Error("Invalid or expired refresh token");
  }

  // Check if it's a refresh token
  if (decoded.type !== 'refresh') {
    throw new Error("Invalid token type");
  }

  // Find user with this refresh token
  const user = await UserModel.findOne({
    _id: decoded.userId,
    refreshToken: refreshToken,
    isDeleted: false,
    isActive: true,
  })
    .select('+refreshToken +refreshTokenExpiry')
    .populate('role');

  if (!user) {
    throw new Error("Invalid refresh token or user not found");
  }

  // Check if refresh token has expired
  if (user.refreshTokenExpiry && user.refreshTokenExpiry < new Date()) {
    throw new Error("Refresh token has expired. Please login again.");
  }

  // Generate new access token
  const jwtSecret = process.env.JWT_SECRET || "scan2card_secret";
  const newAccessToken = jwt.sign(
    {
      userId: user._id.toString(),
      email: user.email,
      role: (user.role as any).name,
    },
    jwtSecret,
    {
      expiresIn: (process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || '24h') as any,
    }
  );

  return {
    token: newAccessToken, // New access token (backward compatible key name)
    expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || '24h',
    user: {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: (user.role as any).name,
      companyName: user.companyName,
      twoFactorEnabled: user.twoFactorEnabled,
      isVerified: user.isVerified,
      profileImage: user.profileImage || null,
    },
  };
};

// Unified OTP Verification Service
export const verifyOTPUnified = async (
  userId: string,
  otp: string,
  type: "login" | "verification" | "forgot_password"
) => {
  await connectToMongooseDatabase();

  // Validate type
  const validTypes = ["login", "verification", "forgot_password"];
  if (!validTypes.includes(type)) {
    throw new Error(`Invalid type. Must be one of: ${validTypes.join(", ")}`);
  }

  // Call unified helper
  const verification = await handleUnifiedOTPVerification({ userId, otp, type });

  // Type-specific post-processing
  switch (type) {
    case "login": {
      // Generate JWT tokens for login
      const user = await UserModel.findById(userId).populate("role");
      if (!user) {
        throw new Error("User not found");
      }

      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        throw new Error("JWT_SECRET not configured");
      }

      // Generate access token
      const token = jwt.sign(
        {
          userId: user._id.toString(),
          email: user.email,
          role: (user.role as any).name,
        },
        jwtSecret,
        {
          expiresIn: (process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || "24h") as any,
        }
      );

      // Generate refresh token
      const refreshToken = jwt.sign(
        {
          userId: user._id.toString(),
        },
        jwtSecret,
        {
          expiresIn: (process.env.JWT_REFRESH_TOKEN_EXPIRES_IN || "7d") as any,
        }
      );

      return {
        token,
        refreshToken,
        expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || "24h",
        user: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          role: (user.role as any).name,
          companyName: user.companyName,
          twoFactorEnabled: user.twoFactorEnabled,
          isVerified: user.isVerified,
          profileImage: user.profileImage || null,
        },
      };
    }

    case "verification": {
      // Generate JWT tokens for verification (same as login)
      const user = await UserModel.findById(userId).populate("role");
      if (!user) {
        throw new Error("User not found");
      }

      const jwtSecret = process.env.JWT_SECRET;
      const refreshSecret = process.env.JWT_REFRESH_SECRET || "scan2card_refresh_secret";
      if (!jwtSecret) {
        throw new Error("JWT_SECRET not configured");
      }

      // Generate access token
      const token = jwt.sign(
        {
          userId: user._id.toString(),
          email: user.email,
          role: (user.role as any).name,
        },
        jwtSecret,
        {
          expiresIn: (process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || "24h") as any,
        }
      );

      // Generate refresh token
      const refreshToken = jwt.sign(
        {
          userId: user._id.toString(),
          type: 'refresh',
        },
        refreshSecret,
        {
          expiresIn: (process.env.JWT_REFRESH_TOKEN_EXPIRES_IN || "7d") as any,
        }
      );

      // Calculate refresh token expiry date
      const refreshTokenExpiry = new Date();
      const expiryDays = parseInt(process.env.JWT_REFRESH_TOKEN_EXPIRES_IN?.replace('d', '') || '7');
      refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + expiryDays);

      // Store refresh token in database using updateOne to avoid full document validation
      await UserModel.updateOne(
        { _id: user._id },
        { 
          $set: { 
            refreshToken: refreshToken,
            refreshTokenExpiry: refreshTokenExpiry 
          }
        }
      );

      return {
        token,
        refreshToken,
        expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || "24h",
        user: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          role: (user.role as any).name,
          companyName: user.companyName,
          twoFactorEnabled: user.twoFactorEnabled,
          isVerified: user.isVerified,
          profileImage: user.profileImage || null,
        },
      };
    }

    case "forgot_password":
      return {
        userId: verification.userId,
        verificationToken: verification.verificationToken,
      };

    default:
      throw new Error(`Unhandled verification type: ${type}`);
  }
};

// Reset Password with Verification Token
export const resetPasswordWithVerificationToken = async (
  userId: string,
  verificationToken: string,
  newPassword: string
) => {
  await connectToMongooseDatabase();

  // Verify the verification token (VOT)
  const secret = process.env.JWT_SECRET + "_VOT";
  let decoded: any;

  try {
    decoded = jwt.verify(verificationToken, secret);
  } catch (error) {
    throw new Error("Verification token is invalid or expired. Please verify OTP again.");
  }

  // Ensure token is for password reset
  if (decoded.purpose !== "password_reset_verified") {
    throw new Error("Invalid verification token");
  }

  // Ensure token userId matches request userId
  if (decoded.userId !== userId) {
    throw new Error("Verification token does not match user");
  }

  // Find the OTP record with this token to ensure it hasn't been used
  const otpRecord = await OTPModel.findOne({
    userId,
    purpose: "forgot_password",
    verificationToken,
    isUsed: true, // Should be marked as used after OTP verification
  }).sort({ createdAt: -1 });

  if (!otpRecord) {
    throw new Error("Verification token not found. Please verify OTP again.");
  }

  // Check if VOT has been used for password reset already (check expiry)
  if (otpRecord.verificationTokenExpiry && otpRecord.verificationTokenExpiry < new Date()) {
    throw new Error("Verification token has expired. Please verify OTP again.");
  }

  // Password validation
  if (newPassword.length < 6) {
    throw new Error("Password must be at least 6 characters long");
  }

  // Find user and update password
  const user = await UserModel.findById(userId).select("+password");
  if (!user) {
    throw new Error("User not found");
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await UserModel.updateOne({ _id: user._id }, { $set: { password: hashedPassword } });

  // Mark the verification token as fully consumed (expire it)
  otpRecord.verificationTokenExpiry = new Date(Date.now() - 1000); // Set to past
  await otpRecord.save();

  return {
    email: user.email,
  };
};

// Logout user
export const logoutUser = async (userId: string) => {
  await connectToMongooseDatabase();

  // Find user
  const user = await UserModel.findById(userId).select('+refreshToken +refreshTokenExpiry');
  if (!user) {
    throw new Error("User not found");
  }

  // Clear refresh token, expiry, and all FCM tokens using updateOne to avoid validation issues
  await UserModel.updateOne(
    { _id: user._id },
    { 
      $unset: { refreshToken: 1, refreshTokenExpiry: 1 },
      $set: { fcmTokens: [] }
    }
  );

  console.log(`✅ User ${userId} logged out - cleared refresh token and FCM tokens`);

  return {
    message: "Logged out successfully",
  };
};
