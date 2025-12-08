import LeadModel from "../models/leads.model";
import EventModel from "../models/event.model";
import UserModel from "../models/user.model";
import mongoose from "mongoose";
import { fillMissingDates, fillMissingMonths, fillMissingYears } from "../helpers/dateStats.helper";
import { getDateRangesByPeriod } from "../utils/dateRange.util";

interface CreateLeadData {
  userId: string;
  eventId?: string;
  isIndependentLead?: boolean;
  leadType: "full_scan" | "entry_code" | "manual";
  scannedCardImage?: string; // @deprecated - kept for backward compatibility
  images?: string[]; // Array of S3 URLs (max 3)
  entryCode?: string;
  ocrText?: string;
  details?: any;
  rating?: number;
}

interface GetLeadsFilter {
  userId: string;
  userRole: string;
  page?: number;
  limit?: number;
  eventId?: string;
  isIndependentLead?: string;
  rating?: string;
  search?: string;
  minimal?: boolean;
  period?: "today" | "weekly" | "earlier"; // New: time-based filter
  timeZone?: string; // New: user's timezone (e.g., "Asia/Kolkata")
}

interface UpdateLeadData {
  eventId?: string;
  isIndependentLead?: boolean;
  leadType?: "full_scan" | "entry_code" | "manual";
  scannedCardImage?: string; // @deprecated - kept for backward compatibility
  images?: string[]; // Array of S3 URLs (max 3)
  entryCode?: string;
  ocrText?: string;
  details?: any;
  rating?: number;
  isActive?: boolean;
}

// Create Lead
export const createLead = async (data: CreateLeadData) => {
  // Validate rating if provided
  if (data.rating && (data.rating < 1 || data.rating > 5)) {
    throw new Error("Rating must be between 1 and 5");
  }

  // Validate images array if provided
  if (data.images && data.images.length > 3) {
    throw new Error("Maximum 3 images allowed per lead");
  }

  // Validate based on lead type
  // Only entry_code type requires its specific field
  if (data.leadType === "entry_code") {
    if (!data.entryCode) {
      throw new Error("Entry code is required for entry_code type leads");
    }
  }
  // Images are now optional for all lead types including full_scan

  // CHECK TRIAL EVENT LIMIT
  if (data.eventId) {
    const event = await EventModel.findById(data.eventId);

    if (event && event.isTrialEvent) {
      // Check user's trial lead count
      const user = await UserModel.findById(data.userId);

      if (user && user.trialLeadsCount && user.trialLeadsCount >= 5) {
        throw new Error(
          "Trial event limit reached. You've created 5 leads with the trial event. " +
          "Please join a regular event with a license key to continue creating leads."
        );
      }
    }
  }

  const lead = await LeadModel.create({
    userId: data.userId,
    eventId: data.eventId,
    isIndependentLead: data.isIndependentLead || !data.eventId,
    leadType: data.leadType,
    scannedCardImage: data.scannedCardImage,
    images: data.images,
    entryCode: data.entryCode,
    ocrText: data.ocrText,
    details: data.details,
    rating: data.rating,
  });

  // INCREMENT TRIAL LEAD COUNT if this was for trial event
  if (data.eventId) {
    const event = await EventModel.findById(data.eventId);

    if (event && event.isTrialEvent) {
      await UserModel.updateOne(
        { _id: data.userId },
        { $inc: { trialLeadsCount: 1 } }
      );

      console.log(`✅ Incremented trial lead count for user ${data.userId}`);
    }
  }

  return lead;
};

// Get All Leads (with pagination and filters)
export const getLeads = async (filter: GetLeadsFilter) => {
  const {
    userId,
    userRole,
    page = 1,
    limit = 10,
    eventId,
    isIndependentLead,
    rating,
    search,
    minimal = false,
    period,
    timeZone = "Asia/Kolkata", // Default to Indian timezone
  } = filter;

  // Build filter query based on role
  let query: any = { isDeleted: false };

  if (userRole === "EXHIBITOR") {
    // For exhibitors, get leads from their events
    const exhibitorEvents = await EventModel.find({
      exhibitorId: userId,
      isDeleted: false,
    }).select("_id");

    const eventIds = exhibitorEvents.map((event) => event._id);
    query.eventId = { $in: eventIds };
  } else {
    // For end users, only show their own leads
    query.userId = userId;
  }

  if (eventId) {
    query.eventId = eventId;
  }

  if (isIndependentLead !== undefined) {
    query.isIndependentLead = isIndependentLead === "true";
  }

  if (rating) {
    query.rating = parseInt(rating);
  }

  

  // Time-based filtering
  if (period) {
    const dateRanges = getDateRangesByPeriod(period, timeZone);
    query.createdAt = dateRanges;
  }

  // Search in details
  if (search) {
    query.$or = [
      { "details.firstName": { $regex: search, $options: "i" } },
      { "details.lastName": { $regex: search, $options: "i" } },
      { "details.company": { $regex: search, $options: "i" } },
      { "details.email": { $regex: search, $options: "i" } },
      { "details.phoneNumber": { $regex: search, $options: "i" } },
    ];
  }

  const options: any = {
    page: parseInt(page.toString()),
    limit: parseInt(limit.toString()),
    sort: { createdAt: -1 }, // Descending order (newest first)
  };

  // If minimal mode, only select ID and name fields, skip populates
  if (minimal) {
    options.select = "_id details.firstName details.lastName details.email entryCode";
  } else {
    // Default mode: return only essential fields without populates
    options.select = "details isIndependentLead rating isActive isDeleted entryCode createdAt updatedAt";
  }

  const leads = await LeadModel.paginate(query, options);

  return {
    leads: leads.docs,
    pagination: {
      total: leads.totalDocs,
      page: leads.page,
      limit: leads.limit,
      totalPages: leads.totalPages,
      hasNextPage: leads.hasNextPage,
      hasPrevPage: leads.hasPrevPage,
    },
  };
};

// Get Lead by ID
export const getLeadById = async (id: string, userId: string) => {
  const lead = await LeadModel.findOne({
    _id: id,
    userId,
    isDeleted: false,
  })
    .populate("eventId", "eventName type startDate endDate")
    .populate("userId", "firstName lastName email");

  if (!lead) {
    throw new Error("Lead not found");
  }

  return lead;
};

// Update Lead
export const updateLead = async (
  id: string,
  userId: string,
  data: UpdateLeadData
) => {
  // Validate rating if provided
  if (data.rating && (data.rating < 1 || data.rating > 5)) {
    throw new Error("Rating must be between 1 and 5");
  }

  // Validate images array if provided
  if (data.images && data.images.length > 3) {
    throw new Error("Maximum 3 images allowed per lead");
  }

  const lead = await LeadModel.findOne({
    _id: id,
    userId,
    isDeleted: false,
  });

  if (!lead) {
    throw new Error("Lead not found");
  }

  // Update fields
  if (data.eventId !== undefined) lead.eventId = data.eventId as any;
  if (data.isIndependentLead !== undefined)
    lead.isIndependentLead = data.isIndependentLead;
  if (data.leadType !== undefined) lead.leadType = data.leadType;
  if (data.scannedCardImage !== undefined)
    lead.scannedCardImage = data.scannedCardImage;
  if (data.images !== undefined) lead.images = data.images;
  if (data.entryCode !== undefined) lead.entryCode = data.entryCode;
  if (data.ocrText !== undefined) lead.ocrText = data.ocrText;
  if (data.details !== undefined)
    lead.details = { ...lead.details, ...data.details };
  if (data.rating !== undefined) lead.rating = data.rating;
  if (data.isActive !== undefined) lead.isActive = data.isActive;

  await lead.save();

  return lead;
};

// Delete Lead (Soft Delete)
export const deleteLead = async (id: string, userId: string) => {
  const lead = await LeadModel.findOne({
    _id: id,
    userId,
    isDeleted: false,
  });

  if (!lead) {
    throw new Error("Lead not found");
  }

  // Check if this is a trial event lead - decrement counter if so
  if (lead.eventId) {
    const event = await EventModel.findById(lead.eventId);

    if (event && event.isTrialEvent) {
      // Decrement trial lead count
      await UserModel.updateOne(
        { _id: userId },
        { $inc: { trialLeadsCount: -1 } }
      );

      console.log(`✅ Decremented trial lead count for user ${userId}`);
    }
  }

  lead.isDeleted = true;
  lead.isActive = false;
  await lead.save();

  return { message: "Lead deleted successfully" };
};

// Get Lead Statistics
export const getLeadStats = async (userId: string) => {
  const totalLeads = await LeadModel.countDocuments({
    userId,
    isDeleted: false,
  });
  const activeLeads = await LeadModel.countDocuments({
    userId,
    isActive: true,
    isDeleted: false,
  });
  const independentLeads = await LeadModel.countDocuments({
    userId,
    isIndependentLead: true,
    isDeleted: false,
  });
  const eventLeads = await LeadModel.countDocuments({
    userId,
    isIndependentLead: false,
    isDeleted: false,
  });

  // Rating distribution
  const ratingStats = await LeadModel.aggregate([
    { $match: { userId: userId, isDeleted: false, rating: { $exists: true } } },
    { $group: { _id: "$rating", count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  return {
    totalLeads,
    activeLeads,
    independentLeads,
    eventLeads,
    ratingDistribution: ratingStats,
  };
};

// Get Lead Analytics (Day-wise and Month-wise)
export const getLeadAnalytics = async (
  userId: string,
  userRole: string,
  timeZone: string = "UTC"
) => {
  // 1. Last 30 Days (Day-wise)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  console.log(
    `[Analytics] Fetching for User: ${userId}, Role: ${userRole}, TimeZone: ${timeZone}`
  );

  let matchStage: any = {
    isDeleted: false,
    createdAt: { $gte: thirtyDaysAgo },
  };

  if (userRole === "EXHIBITOR") {
    const exhibitorEvents = await EventModel.find({
      exhibitorId: userId,
      isDeleted: false,
    }).select("_id");

    const eventIds = exhibitorEvents.map((event) => event._id);
    matchStage.eventId = { $in: eventIds };
  } else {
    matchStage.userId = new mongoose.Types.ObjectId(userId);
  }

  const dailyStats = await LeadModel.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$createdAt",
            timezone: timeZone,
          },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  console.log("[Analytics] Raw Daily Stats:", JSON.stringify(dailyStats));

  // 2. Last 12 Months (Month-wise)
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
  twelveMonthsAgo.setDate(1); // Start from the 1st of that month

  // Adjust match stage for monthly
  const monthlyMatchStage = { ...matchStage };
  monthlyMatchStage.createdAt = { $gte: twelveMonthsAgo };

  const monthlyStats = await LeadModel.aggregate([
    { $match: monthlyMatchStage },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m",
            date: "$createdAt",
            timezone: timeZone,
          },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Fill in missing dates/months with 0 counts
  const filledDailyStats = fillMissingDates(dailyStats, 30);
  const filledMonthlyStats = fillMissingMonths(monthlyStats, 12);

  return {
    daily: filledDailyStats,
    monthly: filledMonthlyStats,
  };
};

// Get Lead Stats by Period (Weekly/Monthly/Yearly)
export const getLeadStatsByPeriod = async (
  userId: string,
  userRole: string,
  filter: "weekly" | "monthly" | "yearly",
  timeZone: string = "UTC"
) => {
  console.log(
    `[Stats] Fetching ${filter} stats for User: ${userId}, Role: ${userRole}, TimeZone: ${timeZone}`
  );

  // Build base match stage based on user role
  let baseMatchStage: any = {
    isDeleted: false,
  };

  if (userRole === "EXHIBITOR") {
    const exhibitorEvents = await EventModel.find({
      exhibitorId: userId,
      isDeleted: false,
    }).select("_id");

    const eventIds = exhibitorEvents.map((event) => event._id);
    baseMatchStage.eventId = { $in: eventIds };
  } else {
    baseMatchStage.userId = new mongoose.Types.ObjectId(userId);
  }

  let stats: any[] = [];
  let filledStats: any[] = [];

  switch (filter) {
    case "weekly": {
      // Last 7 days (including today)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // 6 days ago + today = 7 days
      sevenDaysAgo.setHours(0, 0, 0, 0);

      const matchStage = {
        ...baseMatchStage,
        createdAt: { $gte: sevenDaysAgo },
      };

      stats = await LeadModel.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
                timezone: timeZone,
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      filledStats = fillMissingDates(stats, 7);
      break;
    }

    case "monthly": {
      // Last 12 months
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
      twelveMonthsAgo.setDate(1);
      twelveMonthsAgo.setHours(0, 0, 0, 0);

      const matchStage = {
        ...baseMatchStage,
        createdAt: { $gte: twelveMonthsAgo },
      };

      stats = await LeadModel.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m",
                date: "$createdAt",
                timezone: timeZone,
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      filledStats = fillMissingMonths(stats, 12);
      break;
    }

    case "yearly": {
      // Last 5 years
      const fiveYearsAgo = new Date();
      fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 4); // 4 years ago + current year = 5 years
      fiveYearsAgo.setMonth(0, 1);
      fiveYearsAgo.setHours(0, 0, 0, 0);

      const matchStage = {
        ...baseMatchStage,
        createdAt: { $gte: fiveYearsAgo },
      };

      stats = await LeadModel.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y",
                date: "$createdAt",
                timezone: timeZone,
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      filledStats = fillMissingYears(stats, 5);
      break;
    }

    default:
      throw new Error("Invalid filter. Must be 'weekly', 'monthly', or 'yearly'");
  }

  console.log(`[Stats] ${filter} stats:`, JSON.stringify(filledStats));

  return {
    filter,
    data: filledStats,
    timeZone,
  };
};

// Get User Trial Status
export const getUserTrialStatus = async (userId: string) => {
  const user = await UserModel.findById(userId).select('trialLeadsCount hasJoinedTrialEvent');

  if (!user) {
    throw new Error("User not found");
  }

  const trialLeadsCount = user.trialLeadsCount || 0;
  const hasJoinedTrialEvent = user.hasJoinedTrialEvent || false;
  const remainingTrialLeads = Math.max(0, 5 - trialLeadsCount);
  const isTrialActive = trialLeadsCount < 5;

  // Get trial event details
  const trialEvent = await EventModel.findOne({
    isTrialEvent: true,
    isDeleted: false,
    isActive: true
  }).select('_id eventName description');

  return {
    trialLeadsUsed: trialLeadsCount,
    remainingTrialLeads,
    maxTrialLeads: 5,
    isTrialActive,
    hasJoinedTrialEvent,
    trialEvent: trialEvent ? {
      id: trialEvent._id,
      name: trialEvent.eventName,
      description: trialEvent.description
    } : null,
  };
};
