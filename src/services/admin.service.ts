import UserModel from "../models/user.model";
import RoleModel from "../models/role.model";
import EventModel from "../models/event.model";
import LeadsModel from "../models/leads.model";
import bcrypt from "bcryptjs";

interface ExhibitorData {
  firstName: string;
  lastName: string;
  email?: string;
  phoneNumber?: string;
  companyName?: string;
  password?: string;
  address?: string;
}

interface UpdateExhibitorData extends Partial<ExhibitorData> {
  isActive?: boolean;
  maxLicenseKeys?: number;
  maxTotalActivations?: number;
}

// Get all exhibitors
export const getExhibitors = async (
  page: number = 1,
  limit: number = 10,
  search: string = ""
) => {
  // Find EXHIBITOR role
  const exhibitorRole = await RoleModel.findOne({
    name: "EXHIBITOR",
    isDeleted: false,
  });
  if (!exhibitorRole) {
    throw new Error("Exhibitor role not found");
  }

  // Build search query
  const searchQuery: any = {
    role: exhibitorRole._id,
    isDeleted: false,
  };

  if (search) {
    searchQuery.$or = [
      { firstName: { $regex: search, $options: "i" } },
      { lastName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { companyName: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (page - 1) * limit;
  const exhibitors = await UserModel.find(searchQuery)
    .select("-password -role") // Exclude password and role (we already know they're exhibitors)
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  const total = await UserModel.countDocuments(searchQuery);

  // Get event counts and key counts for each exhibitor
  const exhibitorsWithEventCount = await Promise.all(
    exhibitors.map(async (exhibitor) => {
      const eventCount = await EventModel.countDocuments({
        exhibitorId: exhibitor._id,
        isDeleted: false,
      });

      // Calculate total license keys created by this exhibitor
      const keyCountResult = await EventModel.aggregate([
        {
          $match: {
            exhibitorId: exhibitor._id,
            isDeleted: false,
          },
        },
        {
          $project: {
            keyCount: { $size: "$licenseKeys" },
          },
        },
        {
          $group: {
            _id: null,
            totalKeys: { $sum: "$keyCount" },
          },
        },
      ]);

      const keyCount = keyCountResult.length > 0 ? keyCountResult[0].totalKeys : 0;

      return {
        ...exhibitor.toJSON(),
        eventCount,
        keyCount,
      };
    })
  );

  return {
    exhibitors: exhibitorsWithEventCount,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// Get single exhibitor by ID
export const getExhibitorById = async (id: string) => {
  const exhibitor = await UserModel.findById(id)
    .select("-password -role"); // Exclude password and role (we already know they're exhibitors)

  if (!exhibitor || exhibitor.isDeleted) {
    throw new Error("Exhibitor not found");
  }

  return exhibitor;
};

// Update exhibitor
export const updateExhibitor = async (id: string, data: UpdateExhibitorData) => {
  const exhibitor = await UserModel.findById(id);
  if (!exhibitor || exhibitor.isDeleted) {
    throw new Error("Exhibitor not found");
  }

  // Validate email format if provided
  if (data.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      throw new Error("Invalid email format");
    }

    // Check if email is already taken by another user
    const existingUser = await UserModel.findOne({
      email: data.email,
      _id: { $ne: id },
      isDeleted: false,
    });
    if (existingUser) {
      throw new Error("Email is already in use");
    }
  }

  // Validate password length if provided
  if (data.password && data.password.length < 6) {
    throw new Error("Password must be at least 6 characters long");
  }

  // Update fields
  if (data.firstName) exhibitor.firstName = data.firstName.trim();
  if (data.lastName) exhibitor.lastName = data.lastName.trim();
  if (data.email) exhibitor.email = data.email.trim().toLowerCase();
  if (data.phoneNumber) exhibitor.phoneNumber = data.phoneNumber.trim();
  if (data.companyName !== undefined)
    exhibitor.companyName = data.companyName.trim();
  if (data.address !== undefined)
    exhibitor.address = data.address.trim();
  if (typeof data.isActive === "boolean") exhibitor.isActive = data.isActive;
  if (data.password) exhibitor.password = await bcrypt.hash(data.password, 10);

  // Handle maxLicenseKeys update with validation
  if (data.maxLicenseKeys !== undefined) {
    const currentKeyCount = exhibitor.currentLicenseKeyCount ?? 0;
    if (data.maxLicenseKeys < currentKeyCount) {
      throw new Error(
        `Cannot reduce max license keys to ${data.maxLicenseKeys}. Exhibitor has already created ${currentKeyCount} license keys. Please delete some keys first or set the limit to at least ${currentKeyCount}.`
      );
    }
    exhibitor.maxLicenseKeys = data.maxLicenseKeys;
  }

  // Handle maxTotalActivations update with validation
  if (data.maxTotalActivations !== undefined) {
    const currentActivations = exhibitor.currentTotalActivations ?? 0;
    if (data.maxTotalActivations < currentActivations) {
      throw new Error(
        `Cannot reduce max total activations to ${data.maxTotalActivations}. Exhibitor has already allocated ${currentActivations} activations. Please reduce activations on existing keys first or set the limit to at least ${currentActivations}.`
      );
    }
    exhibitor.maxTotalActivations = data.maxTotalActivations;
  }

  await exhibitor.save();

  const updatedExhibitor = await UserModel.findById(id)
    .select("-password")
    .populate("role", "name");

  return updatedExhibitor;
};

// Delete exhibitor (soft delete)
export const deleteExhibitor = async (id: string) => {
  const exhibitor = await UserModel.findById(id);
  if (!exhibitor || exhibitor.isDeleted) {
    throw new Error("Exhibitor not found");
  }

  exhibitor.isDeleted = true;
  exhibitor.isActive = false;
  await exhibitor.save();

  return { message: "Exhibitor deleted successfully" };
};

// Get dashboard stats
export const getDashboardStats = async () => {
  // Get EXHIBITOR role
  const exhibitorRole = await RoleModel.findOne({
    name: "EXHIBITOR",
    isDeleted: false,
  });

  // Count total exhibitors
  const totalExhibitors = await UserModel.countDocuments({
    role: exhibitorRole?._id,
    isDeleted: false,
  });

  // Count active events
  const now = new Date();
  const activeEvents = await EventModel.countDocuments({
    isDeleted: false,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  });

  // Count total leads
  const totalLeads = await LeadsModel.countDocuments({
    isDeleted: false,
  });

  // Count active users (all users who are active)
  const activeUsers = await UserModel.countDocuments({
    isActive: true,
    isDeleted: false,
  });

  return {
    totalExhibitors,
    activeEvents,
    totalLeads,
    activeUsers,
  };
};

// Get events trend
export const getEventsTrend = async (days: number = 7) => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const dateLabels: string[] = [];
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    dateLabels.push(currentDate.toISOString().split("T")[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const eventsData = await EventModel.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const eventsMap = new Map(eventsData.map((item) => [item._id, item.count]));
  const trends = dateLabels.map((date) => ({
    date,
    count: eventsMap.get(date) || 0,
  }));

  return { trends };
};

// Get leads trend
export const getLeadsTrend = async (days: number = 7) => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const dateLabels: string[] = [];
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    dateLabels.push(currentDate.toISOString().split("T")[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const leadsData = await LeadsModel.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const leadsMap = new Map(leadsData.map((item) => [item._id, item.count]));
  const trends = dateLabels.map((date) => ({
    date,
    count: leadsMap.get(date) || 0,
  }));

  return { trends };
};

// Get license keys trend
export const getLicenseKeysTrend = async (days: number = 7) => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const dateLabels: string[] = [];
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    dateLabels.push(currentDate.toISOString().split("T")[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const keysData = await EventModel.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        isDeleted: false,
      },
    },
    {
      $project: {
        date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        keyCount: { $size: "$licenseKeys" },
      },
    },
    {
      $group: {
        _id: "$date",
        count: { $sum: "$keyCount" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const keysMap = new Map(keysData.map((item) => [item._id, item.count]));
  const trends = dateLabels.map((date) => ({
    date,
    count: keysMap.get(date) || 0,
  }));

  return { trends };
};

// Get all license keys for a specific exhibitor
export const getExhibitorKeys = async (exhibitorId: string) => {
  // Verify exhibitor exists
  const exhibitor = await UserModel.findById(exhibitorId);
  if (!exhibitor || exhibitor.isDeleted) {
    throw new Error("Exhibitor not found");
  }

  // Get all events for this exhibitor with their license keys
  const events = await EventModel.find({
    exhibitorId,
    isDeleted: false,
  }).select("eventName licenseKeys");

  // Flatten all license keys with event information
  const allKeys: any[] = [];
  events.forEach((event) => {
    event.licenseKeys.forEach((key) => {
      allKeys.push({
        _id: key._id,
        key: key.key,
        stallName: key.stallName,
        email: key.email,
        maxActivations: key.maxActivations,
        usedCount: key.usedCount,
        isActive: key.isActive,
        expiresAt: key.expiresAt,
        paymentStatus: key.paymentStatus || "pending",
        eventName: event.eventName,
        eventId: event._id,
        usagePercentage: Math.round((key.usedCount / key.maxActivations) * 100),
        createdAt: key.createdAt,
        updatedAt: key.updatedAt,
      });
    });
  });

  // Sort by usedCount descending
  allKeys.sort((a, b) => b.usedCount - a.usedCount);

  return {
    exhibitor: {
      _id: exhibitor._id,
      firstName: exhibitor.firstName,
      lastName: exhibitor.lastName,
      email: exhibitor.email,
      companyName: exhibitor.companyName,
    },
    keys: allKeys,
    totalKeys: allKeys.length,
  };
};

// Update Payment Status for a License Key
export const updateKeyPaymentStatus = async (
  eventId: string,
  keyId: string,
  paymentStatus: string
) => {
  // Validate payment status
  if (!paymentStatus || !["pending", "completed"].includes(paymentStatus)) {
    throw new Error("Invalid payment status. Must be 'pending' or 'completed'");
  }

  // Update payment status using $set to avoid full document validation
  const updatedEvent = await EventModel.findOneAndUpdate(
    {
      _id: eventId,
      isDeleted: false,
      "licenseKeys._id": keyId,
    },
    {
      $set: { "licenseKeys.$.paymentStatus": paymentStatus },
    },
    {
      new: true,
      runValidators: false,
    }
  );

  if (!updatedEvent) {
    throw new Error("Event or license key not found");
  }

  // Find the updated key to return in response
  const updatedKey = updatedEvent.licenseKeys.find(
    (key) => key._id?.toString() === keyId
  );

  return {
    keyId: updatedKey?._id,
    key: updatedKey?.key,
    paymentStatus: updatedKey?.paymentStatus,
  };
};

// Get top performers
export const getTopPerformers = async () => {
  const exhibitorRole = await RoleModel.findOne({ name: "EXHIBITOR" });
  if (!exhibitorRole) {
    throw new Error("Exhibitor role not found");
  }

  // 1. Most Events Created - Top 5 exhibitors
  const topEventCreators = await EventModel.aggregate([
    {
      $match: { isDeleted: false },
    },
    {
      $group: {
        _id: "$exhibitorId",
        eventCount: { $sum: 1 },
      },
    },
    { $sort: { eventCount: -1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user",
      },
    },
    {
      $unwind: {
        path: "$user",
        preserveNullAndEmptyArrays: false,
      },
    },
    {
      $project: {
        _id: 0,
        userId: "$_id",
        firstName: "$user.firstName",
        lastName: "$user.lastName",
        email: "$user.email",
        companyName: "$user.companyName",
        eventCount: 1,
      },
    },
  ]);

  // 2. Most Keys Created - Top 5 exhibitors
  const topKeyCreators = await EventModel.aggregate([
    {
      $match: { isDeleted: false },
    },
    {
      $project: {
        exhibitorId: 1,
        keyCount: { $size: "$licenseKeys" },
      },
    },
    {
      $group: {
        _id: "$exhibitorId",
        totalKeys: { $sum: "$keyCount" },
      },
    },
    { $sort: { totalKeys: -1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user",
      },
    },
    {
      $unwind: {
        path: "$user",
        preserveNullAndEmptyArrays: false,
      },
    },
    {
      $project: {
        _id: 0,
        userId: "$_id",
        firstName: "$user.firstName",
        lastName: "$user.lastName",
        email: "$user.email",
        companyName: "$user.companyName",
        totalKeys: 1,
      },
    },
  ]);

  // 3. Most License Key Usage - Top 5 exhibitors
  const topKeyUsers = await EventModel.aggregate([
    {
      $match: { isDeleted: false },
    },
    { $unwind: "$licenseKeys" },
    {
      $match: {
        "licenseKeys.usedCount": { $gt: 0 },
      },
    },
    {
      $group: {
        _id: "$exhibitorId",
        usedKeysCount: { $sum: 1 },
        totalScans: { $sum: "$licenseKeys.usedCount" },
      },
    },
    { $sort: { totalScans: -1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user",
      },
    },
    {
      $unwind: {
        path: "$user",
        preserveNullAndEmptyArrays: false,
      },
    },
    {
      $project: {
        _id: 0,
        userId: "$_id",
        firstName: "$user.firstName",
        lastName: "$user.lastName",
        email: "$user.email",
        companyName: "$user.companyName",
        usedKeysCount: 1,
        totalScans: 1,
      },
    },
  ]);

  return {
    mostEventsCreated: topEventCreators,
    mostKeysCreated: topKeyCreators,
    mostLicenseKeyUsage: topKeyUsers,
  };
};
