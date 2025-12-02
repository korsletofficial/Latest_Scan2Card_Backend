import EventModel from "../models/event.model";
import LeadsModel from "../models/leads.model";
import TeamModel from "../models/team.model";
import UserModel from "../models/user.model";
import RoleModel from "../models/role.model";
import mongoose from "mongoose";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";

interface CreateEventData {
  exhibitorId: string;
  eventName: string;
  description?: string;
  type: "Offline" | "Online" | "Hybrid";
  startDate: Date;
  endDate: Date;
  location?: any;
}

interface UpdateEventData {
  eventName?: string;
  description?: string;
  type?: "Offline" | "Online" | "Hybrid";
  startDate?: Date;
  endDate?: Date;
  location?: any;
  isActive?: boolean;
}

interface LicenseKeyData {
  stallName?: string;
  email: string;
  maxActivations?: number;
  expiresAt: Date;
}

// Helper function to generate unique license key (fixed 9 characters)
const generateLicenseKey = (): string => {
  return nanoid(9).toUpperCase();
};

// Helper function to create team manager for license
const createTeamManagerForLicense = async (
  email: string,
  exhibitorId: string,
  firstName?: string,
  lastName?: string
) => {
  try {
    // Check if user already exists
    const existingUser = await UserModel.findOne({ email, isDeleted: false });
    if (existingUser) {
      return existingUser._id;
    }

    // Get TEAMMANAGER role
    const teamManagerRole = await RoleModel.findOne({ name: "TEAMMANAGER" });
    if (!teamManagerRole) {
      throw new Error("TEAMMANAGER role not found");
    }

    // Extract name from email if not provided
    const emailUsername = email.split("@")[0];
    const defaultFirstName = firstName || emailUsername.split(".")[0] || "Team";
    const defaultLastName = lastName || emailUsername.split(".")[1] || "Manager";

    // Create password (same as email for testing)
    const hashedPassword = await bcrypt.hash(email, 10);

    // Create team manager user
    const teamManager = await UserModel.create({
      firstName: defaultFirstName.charAt(0).toUpperCase() + defaultFirstName.slice(1),
      lastName: defaultLastName.charAt(0).toUpperCase() + defaultLastName.slice(1),
      email,
      password: hashedPassword,
      role: teamManagerRole._id,
      exhibitorId,
      isActive: true,
      isDeleted: false,
    });

    console.log(`✅ Team Manager created: ${email} (Password: ${email})`);
    return teamManager._id;
  } catch (error: any) {
    console.error("❌ Create team manager error:", error);
    throw error;
  }
};

// Create Event (Exhibitor only)
export const createEvent = async (data: CreateEventData) => {
  const event = await EventModel.create({
    eventName: data.eventName,
    description: data.description,
    type: data.type,
    startDate: data.startDate,
    endDate: data.endDate,
    location: data.location,
    exhibitorId: data.exhibitorId,
    licenseKeys: [],
    isActive: true,
    isDeleted: false,
  });

  await event.populate("exhibitorId", "firstName lastName email companyName");

  return event;
};

// Get all events for exhibitor
export const getEvents = async (
  exhibitorId: string,
  page: number = 1,
  limit: number = 10,
  search: string = ""
) => {
  const searchQuery: any = {
    exhibitorId,
    isDeleted: false,
  };

  if (search) {
    searchQuery.$or = [
      { eventName: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { "location.venue": { $regex: search, $options: "i" } },
    ];
  }

  const skip = (page - 1) * limit;
  const events = await EventModel.find(searchQuery)
    .populate("exhibitorId", "firstName lastName email companyName")
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  const total = await EventModel.countDocuments(searchQuery);

  return {
    events,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// Get single event by ID
export const getEventById = async (id: string, exhibitorId: string) => {
  const event = await EventModel.findOne({
    _id: id,
    exhibitorId,
    isDeleted: false,
  }).populate("exhibitorId", "firstName lastName email companyName");

  if (!event) {
    throw new Error("Event not found");
  }

  return event;
};

// Update event
export const updateEvent = async (
  id: string,
  exhibitorId: string,
  data: UpdateEventData
) => {
  const event = await EventModel.findOne({
    _id: id,
    exhibitorId,
    isDeleted: false,
  });

  if (!event) {
    throw new Error("Event not found");
  }

  // Validate dates if provided
  if (data.startDate || data.endDate) {
    const start = data.startDate || event.startDate;
    const end = data.endDate || event.endDate;

    if (start >= end) {
      throw new Error("End date must be after start date");
    }
  }

  // Update fields
  if (data.eventName) event.eventName = data.eventName;
  if (data.description !== undefined) event.description = data.description;
  if (data.type !== undefined) event.type = data.type;
  if (data.startDate) event.startDate = data.startDate;
  if (data.endDate) event.endDate = data.endDate;
  if (data.location) event.location = data.location;
  if (typeof data.isActive === "boolean") event.isActive = data.isActive;

  await event.save();

  await event.populate("exhibitorId", "firstName lastName email companyName");

  return event;
};

// Delete event (soft delete)
export const deleteEvent = async (id: string, exhibitorId: string) => {
  const event = await EventModel.findOne({
    _id: id,
    exhibitorId,
    isDeleted: false,
  });

  if (!event) {
    throw new Error("Event not found");
  }

  event.isDeleted = true;
  event.isActive = false;
  await event.save();

  return { message: "Event deleted successfully" };
};

// Generate license key for event
export const generateLicenseKeyForEvent = async (
  eventId: string,
  exhibitorId: string,
  data: LicenseKeyData
) => {
  const event = await EventModel.findOne({
    _id: eventId,
    exhibitorId,
    isDeleted: false,
  });

  if (!event) {
    throw new Error("Event not found");
  }

  // Generate license key
  const licenseKey = generateLicenseKey();

  // Create team manager account
  const teamManagerId = await createTeamManagerForLicense(data.email, exhibitorId);

  // Add to event's licenseKeys array
  event.licenseKeys.push({
    key: licenseKey,
    stallName: data.stallName,
    email: data.email,
    teamManagerId,
    expiresAt: data.expiresAt,
    isActive: true,
    maxActivations: data.maxActivations || 1,
    usedCount: 0,
    usedBy: [],
    paymentStatus: "pending",
  });

  await event.save();

  return {
    licenseKey,
    stallName: data.stallName,
    email: data.email,
    expiresAt: data.expiresAt,
    maxActivations: data.maxActivations,
    teamManagerId,
    credentials: {
      email: data.email,
      password: data.email,
      note: "Password is same as email for testing purposes",
    },
  };
};

// Bulk generate license keys from CSV
export const bulkGenerateLicenseKeys = async (
  eventId: string,
  exhibitorId: string,
  licenseKeys: LicenseKeyData[]
) => {
  const event = await EventModel.findOne({
    _id: eventId,
    exhibitorId,
    isDeleted: false,
  });

  if (!event) {
    throw new Error("Event not found");
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const generatedKeys: any[] = [];
  const errors: any[] = [];

  for (let i = 0; i < licenseKeys.length; i++) {
    const { stallName, email, maxActivations = 1, expiresAt } = licenseKeys[i];

    // Validate email - now required
    if (!email) {
      errors.push({ row: i + 1, error: "Email is required" });
      continue;
    }

    if (!emailRegex.test(email)) {
      errors.push({ row: i + 1, error: "Invalid email format", email });
      continue;
    }

    // Validate expiration date
    if (!expiresAt) {
      errors.push({ row: i + 1, error: "Expiration date is required" });
      continue;
    }

    const expirationDate = new Date(expiresAt);
    if (isNaN(expirationDate.getTime())) {
      errors.push({ row: i + 1, error: "Invalid date format", expiresAt });
      continue;
    }

    if (expirationDate <= new Date()) {
      errors.push({ row: i + 1, error: "Expiration date must be in the future" });
      continue;
    }

    try {
      // Generate license key
      const licenseKey = generateLicenseKey();

      // Create team manager account
      const teamManagerId = await createTeamManagerForLicense(email, exhibitorId);

      // Add to event's licenseKeys array
      event.licenseKeys.push({
        key: licenseKey,
        stallName: stallName || "",
        email,
        teamManagerId,
        expiresAt: expirationDate,
        isActive: true,
        maxActivations: Number(maxActivations),
        usedCount: 0,
        usedBy: [],
        paymentStatus: "pending",
      });

      generatedKeys.push({
        licenseKey,
        stallName,
        email,
        expiresAt: expirationDate,
        maxActivations,
        teamManagerId,
        credentials: {
          email,
          password: email,
        },
      });
    } catch (error: any) {
      errors.push({ row: i + 1, error: error.message, email });
    }
  }

  await event.save();

  return {
    generatedKeys,
    errors: errors.length > 0 ? errors : undefined,
    totalGenerated: generatedKeys.length,
    totalErrors: errors.length,
  };
};

// Get license keys for an event
export const getLicenseKeys = async (eventId: string, exhibitorId: string) => {
  const event = await EventModel.findOne({
    _id: eventId,
    exhibitorId,
    isDeleted: false,
  }).select("eventName licenseKeys");

  if (!event) {
    throw new Error("Event not found");
  }

  return {
    eventName: event.eventName,
    licenseKeys: event.licenseKeys,
  };
};

// Get exhibitor dashboard stats
export const getExhibitorDashboardStats = async (exhibitorId: string) => {
  // Get total events count
  const totalEvents = await EventModel.countDocuments({
    exhibitorId,
    isDeleted: false,
  });

  // Get active events count (between start and end date)
  const now = new Date();
  const activeEvents = await EventModel.countDocuments({
    exhibitorId,
    isDeleted: false,
    startDate: { $lte: now },
    endDate: { $gte: now },
  });

  // Get exhibitor's events
  const exhibitorEvents = await EventModel.find({
    exhibitorId,
    isDeleted: false,
  }).select("_id");

  const eventIds = exhibitorEvents.map((event) => event._id);

  // Get total leads count for exhibitor's events
  const totalLeads = await LeadsModel.countDocuments({
    eventId: { $in: eventIds },
    isDeleted: false,
  });

  // Get team members count
  const teamMembers = await TeamModel.countDocuments({
    teamManagerId: exhibitorId,
    isDeleted: false,
  });

  return {
    totalEvents,
    activeEvents,
    totalLeads,
    teamMembers,
  };
};

// Get top events by leads
export const getTopEventsByLeads = async (
  exhibitorId: string,
  limit: number = 5
) => {
  const topEvents = await EventModel.aggregate([
    {
      $match: {
        exhibitorId: new mongoose.Types.ObjectId(exhibitorId),
        isDeleted: false,
      },
    },
    {
      $lookup: {
        from: "leads",
        localField: "_id",
        foreignField: "eventId",
        as: "leads",
      },
    },
    {
      $project: {
        eventName: 1,
        type: 1,
        startDate: 1,
        endDate: 1,
        isActive: 1,
        leadCount: {
          $size: {
            $filter: {
              input: "$leads",
              as: "lead",
              cond: { $eq: ["$$lead.isDeleted", false] },
            },
          },
        },
      },
    },
    { $sort: { leadCount: -1 } },
    { $limit: limit },
  ]);

  return topEvents;
};

// Get leads trend
export const getLeadsTrend = async (
  exhibitorId: string,
  days: number = 30
) => {
  // Use current date/time to ensure we include today
  const now = new Date();

  // End date is end of today (in server's timezone)
  const endDate = new Date(now);
  endDate.setHours(23, 59, 59, 999);

  // Start date is (days-1) ago from today
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - (days - 1));
  startDate.setHours(0, 0, 0, 0);

  console.log("🎯 Current server time:", now.toISOString());
  console.log("📅 Date range for", days, "days:", {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });

  // Generate date labels for the period (including today)
  const dateLabels: string[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    dateLabels.push(date.toISOString().split("T")[0]);
  }

  // Get exhibitor's events
  const exhibitorEvents = await EventModel.find({
    exhibitorId: new mongoose.Types.ObjectId(exhibitorId),
    isDeleted: false,
  }).select("_id");

  const eventIds = exhibitorEvents.map((event) => event._id);

  console.log("🎯 Exhibitor ID:", exhibitorId);
  console.log("📅 Date range:", { startDate, endDate, days });
  console.log("🎪 Event IDs:", eventIds);

  // Aggregate leads by date for exhibitor's events
  const leadsData = await LeadsModel.aggregate([
    {
      $match: {
        eventId: { $in: eventIds },
        createdAt: { $gte: startDate, $lte: endDate },
        isDeleted: false,
      },
    },
    {
      $project: {
        date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
      },
    },
    {
      $group: {
        _id: "$date",
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  console.log("📊 Leads trend aggregation result:", leadsData);
  console.log("📋 Date labels:", dateLabels);

  const leadsMap = new Map(leadsData.map((item) => [item._id, item.count]));
  const trends = dateLabels.map((date) => ({
    date,
    count: leadsMap.get(date) || 0,
  }));

  return { trends };
};
