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
  countryCode?: string;
  country?: string;
  companyName?: string;
  password: string;
  roleName: "SUPERADMIN" | "EXHIBITOR" | "TEAMMANAGER" | "ENDUSER";
  exhibitorId?: string;
  maxLicenseKeys?: number;
  maxTotalActivations?: number;
  skipVerification?: boolean;
}

interface LoginData {
  email?: string;
  phoneNumber?: string;
  countryCode?: string;
  password: string;
  activeRole?: string;
  skipPasswordCheck?: boolean;
}

// Helper: build JWT access + refresh token pair
const buildTokens = (user: any, roleName: string) => {
  const jwtSecret = process.env.JWT_SECRET || "scan2card_secret";
  const refreshSecret = process.env.JWT_REFRESH_SECRET || "scan2card_refresh_secret";

  const token = jwt.sign(
    {
      userId: user._id.toString(),
      email: user.email,
      activeRole: roleName,
    },
    jwtSecret,
    { expiresIn: (process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || "24h") as any }
  );

  const refreshToken = jwt.sign(
    { userId: user._id.toString(), type: "refresh" },
    refreshSecret,
    { expiresIn: (process.env.JWT_REFRESH_TOKEN_EXPIRES_IN || "7d") as any }
  );

  return { token, refreshToken };
};

// Helper: get the role name from a populated user
const getRoleName = (user: IUser): string => {
  const r = user.role as any;
  return r?.name || r?.toString() || "";
};

// Register new user
export const registerUser = async (data: RegisterUserDTO) => {
  await connectToMongooseDatabase();

  // Validate at least one contact method
  if (!data.email && !data.phoneNumber) {
    throw new Error("At least one of email or phoneNumber must be provided");
  }

  // Email uniqueness is enforced per-role. The same email can coexist as separate
  // independent accounts across different roles (e.g. TEAMMANAGER + ENDUSER).
  if (data.email) {
    const roleForCheck = await RoleModel.findOne({ name: data.roleName, isDeleted: false });
    if (roleForCheck) {
      const existingWithSameRole = await UserModel.findOne({
        email: data.email,
        role: roleForCheck._id,
        isDeleted: false,
      });
      if (existingWithSameRole) {
        throw new Error("User with this email already exists");
      }
    }
  }

  // Phone number uniqueness scoped to ENDUSER only
  if (data.phoneNumber && data.roleName === "ENDUSER") {
    const endUserRole = await RoleModel.findOne({ name: "ENDUSER", isDeleted: false });
    if (endUserRole) {
      const existingUserByPhone = await UserModel.findOne({
        phoneNumber: data.phoneNumber,
        role: endUserRole._id,
        isDeleted: false,
      });
      if (existingUserByPhone) {
        throw new Error("User with this phone number already exists");
      }
    }
  }

  // Find role by name
  const role = await RoleModel.findOne({ name: data.roleName, isDeleted: false });
  if (!role) {
    throw new Error(`Role '${data.roleName}' not found`);
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(data.password, 10);

  const newUser = await UserModel.create({
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    phoneNumber: data.phoneNumber,
    countryCode: data.countryCode,
    country: data.country,
    password: hashedPassword,
    role: role._id,
    companyName: data.companyName,
    isActive: true,
    isDeleted: false,
    isVerified: data.skipVerification ? true : false,
    ...(data.maxLicenseKeys !== undefined && { maxLicenseKeys: data.maxLicenseKeys }),
    ...(data.maxTotalActivations !== undefined && { maxTotalActivations: data.maxTotalActivations }),
  });

  await newUser.populate("role");

  // Send verification OTP unless skipped
  if (!data.skipVerification) {
    const source = newUser.phoneNumber ? "phoneNumber" : "email";
    handleSendVerificationCode({ userId: newUser._id.toString(), source })
      .then(() => console.log(`✅ Verification OTP sent to ${newUser.email || newUser.phoneNumber}`))
      .catch((error: any) => console.error(`❌ Failed to send OTP:`, error.message));
  }

  const message = data.skipVerification
    ? "Registration successful. Account is automatically verified."
    : "Registration successful. Please verify your account with the OTP sent to your " +
      (newUser.phoneNumber ? "phoneNumber" : "email");

  const roleName = getRoleName(newUser);

  return {
    user: {
      _id: newUser._id,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      email: newUser.email,
      phoneNumber: newUser.phoneNumber,
      countryCode: newUser.countryCode,
      country: newUser.country,
      role: roleName,
      activeRole: roleName,
      companyName: newUser.companyName,
      isVerified: newUser.isVerified,
    },
    message,
  };
};

// Login user
export const loginUser = async (data: LoginData) => {
  await connectToMongooseDatabase();

  // Build DB query
  const query: any = { isDeleted: false };
  if (data.email) {
    query.email = data.email;
    // Same email can exist as multiple role-scoped accounts (e.g. TEAMMANAGER + ENDUSER).
    // Use activeRole to route to the correct account when logging in.
    if (data.activeRole) {
      const requestedRole = await RoleModel.findOne({ name: data.activeRole, isDeleted: false });
      if (requestedRole) {
        query.role = requestedRole._id;
      }
    } else {
      // No activeRole provided — detect collision early with a helpful error
      const count = await UserModel.countDocuments({ email: data.email, isDeleted: false });
      if (count > 1) {
        throw new Error(
          "Multiple accounts found for this email. Please provide activeRole (e.g. TEAMMANAGER or ENDUSER) to specify which account to log into."
        );
      }
    }
  } else if (data.phoneNumber) {
    // Phone login is ENDUSER-only (mobile app)
    const endUserRole = await RoleModel.findOne({ name: "ENDUSER", isDeleted: false });
    if (!endUserRole) throw new Error("Invalid credentials");
    query.phoneNumber = data.phoneNumber;
    query.role = endUserRole._id;
  } else {
    throw new Error("Email or phone number must be provided");
  }

  const user = await UserModel.findOne(query).select("+password").populate("role");
  if (!user) throw new Error("Invalid credentials");

  if (!user.isActive) throw new Error("Your account has been deactivated");

  if (!data.skipPasswordCheck) {
    const isPasswordValid = await bcrypt.compare(data.password, user.password);
    if (!isPasswordValid) throw new Error("Invalid credentials");
  }

  // 2FA check
  if (user.twoFactorEnabled && !data.skipPasswordCheck) {
    const otpResult = await handleSendLoginOTP(user._id.toString());
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

  const roleName = getRoleName(user);
  const { token, refreshToken } = buildTokens(user, roleName);

  const refreshTokenExpiry = new Date();
  const expiryDays = parseInt(process.env.JWT_REFRESH_TOKEN_EXPIRES_IN?.replace("d", "") || "7");
  refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + expiryDays);

  await UserModel.updateOne({ _id: user._id }, { $set: { refreshToken, refreshTokenExpiry } });

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
      countryCode: user.countryCode,
      country: user.country,
      role: roleName,
      activeRole: roleName,
      companyName: user.companyName,
      twoFactorEnabled: user.twoFactorEnabled,
      isVerified: user.isVerified,
      profileImage: user.profileImage || null,
      maxLicenseKeys: user.maxLicenseKeys,
      maxTotalActivations: user.maxTotalActivations,
      currentLicenseKeyCount: user.currentLicenseKeyCount,
      currentTotalActivations: user.currentTotalActivations,
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

  const roleName = getRoleName(user);

  return {
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    countryCode: user.countryCode,
    country: user.country,
    role: roleName,
    activeRole: roleName,
    companyName: user.companyName,
    isActive: user.isActive,
    twoFactorEnabled: user.twoFactorEnabled,
    isVerified: user.isVerified,
    profileImage: user.profileImage || null,
    maxLicenseKeys: user.maxLicenseKeys,
    maxTotalActivations: user.maxTotalActivations,
    currentLicenseKeyCount: user.currentLicenseKeyCount,
    currentTotalActivations: user.currentTotalActivations,
  };
};


// Verify Login OTP
export const verifyLoginOTP = async (userId: string, otp: string) => {
  await connectToMongooseDatabase();

  const verification = await handleVerifyLoginOTP(userId, otp);

  if (!verification.isValid) {
    throw new Error("Invalid OTP");
  }

  const user = await UserModel.findById(userId).populate("role");
  if (!user) throw new Error("User not found");

  const roleName = getRoleName(user);
  const { token, refreshToken } = buildTokens(user, roleName);

  const refreshTokenExpiry = new Date();
  const expiryDays = parseInt(process.env.JWT_REFRESH_TOKEN_EXPIRES_IN?.replace("d", "") || "7");
  refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + expiryDays);
  await UserModel.updateOne({ _id: user._id }, { $set: { refreshToken, refreshTokenExpiry } });

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
      role: roleName,
      activeRole: roleName,
      isVerified: user.isVerified,
    },
  };
};

// Send Verification OTP
export const sendVerificationOTP = async (userId: string, phoneNumber?: string) => {
  await connectToMongooseDatabase();

  const user = await UserModel.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  if (user.isVerified) {
    throw new Error("User is already verified");
  }

  if (phoneNumber && phoneNumber !== user.phoneNumber) {
    await UserModel.updateOne({ _id: user._id }, { $set: { phoneNumber } });
    user.phoneNumber = phoneNumber;
  }

  const source = user.phoneNumber ? "phoneNumber" : "email";

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

  const user = await UserModel.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const source = user.phoneNumber ? "phoneNumber" : "email";

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

  if (newPassword.length < 6) {
    throw new Error("Password must be at least 6 characters long");
  }

  const verification = await handleVerifyForgotPasswordOTP(userId, otp);

  if (!verification.isValid) {
    throw new Error("Invalid OTP");
  }

  const user = await UserModel.findById(userId).select("+password");
  if (!user) {
    throw new Error("User not found");
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await UserModel.updateOne({ _id: user._id }, { $set: { password: hashedPassword } });

  return {
    email: user.email,
  };
};

// Send 2FA Login OTP
export const send2FALoginOTP = async (userId: string) => {
  await connectToMongooseDatabase();

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

  const refreshSecret = process.env.JWT_REFRESH_SECRET || "scan2card_refresh_secret";
  let decoded: any;

  try {
    decoded = jwt.verify(refreshToken, refreshSecret);
  } catch (error) {
    throw new Error("Invalid or expired refresh token");
  }

  if (decoded.type !== "refresh") {
    throw new Error("Invalid token type");
  }

  const user = await UserModel.findOne({
    _id: decoded.userId,
    refreshToken: refreshToken,
    isDeleted: false,
    isActive: true,
  })
    .select("+refreshToken +refreshTokenExpiry")
    .populate("role");

  if (!user) throw new Error("Invalid refresh token or user not found");

  if (user.refreshTokenExpiry && user.refreshTokenExpiry < new Date()) {
    throw new Error("Refresh token has expired. Please login again.");
  }

  const roleName = getRoleName(user);
  const { token: newAccessToken } = buildTokens(user, roleName);

  return {
    token: newAccessToken,
    expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || "24h",
    user: {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      countryCode: user.countryCode,
      role: roleName,
      activeRole: roleName,
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

  const validTypes = ["login", "verification", "forgot_password"];
  if (!validTypes.includes(type)) {
    throw new Error(`Invalid type. Must be one of: ${validTypes.join(", ")}`);
  }

  const verification = await handleUnifiedOTPVerification({ userId, otp, type });

  switch (type) {
    case "login": {
      const user = await UserModel.findById(userId).populate("role");
      if (!user) throw new Error("User not found");

      const roleName = getRoleName(user);
      const { token, refreshToken } = buildTokens(user, roleName);

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
          countryCode: user.countryCode,
          role: roleName,
          activeRole: roleName,
          companyName: user.companyName,
          twoFactorEnabled: user.twoFactorEnabled,
          isVerified: user.isVerified,
          profileImage: user.profileImage || null,
        },
      };
    }

    case "verification": {
      const user = await UserModel.findById(userId).populate("role");
      if (!user) throw new Error("User not found");

      const roleName = getRoleName(user);
      const { token, refreshToken } = buildTokens(user, roleName);

      const refreshTokenExpiry = new Date();
      const expiryDays = parseInt(process.env.JWT_REFRESH_TOKEN_EXPIRES_IN?.replace("d", "") || "7");
      refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + expiryDays);
      await UserModel.updateOne({ _id: user._id }, { $set: { refreshToken, refreshTokenExpiry } });

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
          countryCode: user.countryCode,
          role: roleName,
          activeRole: roleName,
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

  const secret = process.env.JWT_SECRET + "_VOT";
  let decoded: any;

  try {
    decoded = jwt.verify(verificationToken, secret);
  } catch (error) {
    throw new Error("Verification token is invalid or expired. Please verify OTP again.");
  }

  if (decoded.purpose !== "password_reset_verified") {
    throw new Error("Invalid verification token");
  }

  if (decoded.userId !== userId) {
    throw new Error("Verification token does not match user");
  }

  const otpRecord = await OTPModel.findOne({
    userId,
    purpose: "forgot_password",
    verificationToken,
    isUsed: true,
  }).sort({ createdAt: -1 });

  if (!otpRecord) {
    throw new Error("Verification token not found. Please verify OTP again.");
  }

  if (otpRecord.verificationTokenExpiry && otpRecord.verificationTokenExpiry < new Date()) {
    throw new Error("Verification token has expired. Please verify OTP again.");
  }

  if (newPassword.length < 6) {
    throw new Error("Password must be at least 6 characters long");
  }

  const user = await UserModel.findById(userId).select("+password");
  if (!user) {
    throw new Error("User not found");
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await UserModel.updateOne({ _id: user._id }, { $set: { password: hashedPassword } });

  await OTPModel.updateOne(
    { _id: otpRecord._id },
    { $set: { verificationTokenExpiry: new Date(Date.now() - 1000) } }
  );

  return {
    email: user.email,
  };
};

// Logout user
export const logoutUser = async (userId: string) => {
  await connectToMongooseDatabase();

  const user = await UserModel.findById(userId).select("+refreshToken +refreshTokenExpiry");
  if (!user) {
    throw new Error("User not found");
  }

  await UserModel.updateOne(
    { _id: user._id },
    {
      $unset: { refreshToken: 1, refreshTokenExpiry: 1 },
      $set: { fcmTokens: [] },
    }
  );

  console.log(`✅ User ${userId} logged out - cleared refresh token and FCM tokens`);

  return {
    message: "Logged out successfully",
  };
};

// Delete Account (Soft Delete with PII Anonymization)
export const deleteAccount = async (userId: string) => {
  await connectToMongooseDatabase();

  const user = await UserModel.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  if (user.isDeleted) {
    throw new Error("Account is already deleted");
  }

  const timestamp = Date.now();
  const deletedPhonePlaceholder = `deleted_${timestamp}_${userId}`;
  const deletedEmailPlaceholder = `deleted_${timestamp}_${userId}@deleted.scan2card.com`;

  await UserModel.updateOne(
    { _id: user._id },
    {
      $set: {
        firstName: "Scan2Card",
        lastName: "User",
        phoneNumber: deletedPhonePlaceholder,
        email: deletedEmailPlaceholder,
        profileImage: null,
        isActive: false,
        isDeleted: true,
        fcmTokens: [],
        twoFactorEnabled: false,
      },
      $unset: {
        refreshToken: 1,
        refreshTokenExpiry: 1,
        calendarFeedToken: 1,
      },
    }
  );

  console.log(`✅ User ${userId} account deleted - personal data anonymized`);

  return {
    message: "Account deleted successfully",
  };
};

