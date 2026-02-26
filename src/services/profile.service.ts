import UserModel from "../models/user.model";
import bcrypt from "bcryptjs";

interface UpdateProfileData {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  profileImage?: string;
  country?: string;
}

// Update user profile
export const updateUserProfile = async (
  userId: string,
  data: UpdateProfileData
) => {
  const updateData: any = {};
  if (data.firstName) updateData.firstName = data.firstName;
  if (data.lastName) updateData.lastName = data.lastName;
  if (data.phoneNumber !== undefined) updateData.phoneNumber = data.phoneNumber;
  if (data.profileImage !== undefined) updateData.profileImage = data.profileImage;
  if (data.country !== undefined) updateData.country = data.country;

  const user = await UserModel.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
  })
    .populate("role", "roleName")
    .select("-password");

  if (!user) {
    throw new Error("User not found");
  }

  return user;
};

// Change password
export const changeUserPassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string
) => {
  if (!currentPassword || !newPassword) {
    throw new Error("Current password and new password are required");
  }

  if (newPassword.length < 6) {
    throw new Error("New password must be at least 6 characters long");
  }

  // Get user with password
  const user = await UserModel.findById(userId).select("+password");

  if (!user) {
    throw new Error("User not found");
  }

  // Verify current password
  const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

  if (!isPasswordValid) {
    throw new Error("Current password is incorrect");
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashedPassword;
  await user.save();

  return { message: "Password changed successfully" };
};

// Toggle 2FA
export const toggle2FA = async (userId: string, enabled: boolean) => {
  if (typeof enabled !== "boolean") {
    throw new Error("enabled field must be a boolean");
  }

  const user = await UserModel.findByIdAndUpdate(
    userId,
    { twoFactorEnabled: enabled },
    { new: true }
  )
    .populate("role", "roleName")
    .select("-password");

  if (!user) {
    throw new Error("User not found");
  }

  return user;
};
