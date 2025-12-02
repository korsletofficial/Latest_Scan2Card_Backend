import LeadModel from "../models/leads.model";
import EventModel from "../models/event.model";
import mongoose from "mongoose";

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
  if (data.leadType === "entry_code") {
    if (!data.entryCode) {
      throw new Error("Entry code is required for entry_code type leads");
    }
  } else if (data.leadType === "full_scan") {
    // Accept either images array or scannedCardImage for backward compatibility
    if (!data.images && !data.scannedCardImage) {
      throw new Error("At least one image is required for full_scan type leads");
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
    sort: { createdAt: 1 }, // Ascending order (oldest first)
  };

  // If minimal mode, only select ID and name fields, skip populates
  if (minimal) {
    options.select = "_id details.firstName details.lastName details.email";
  } else {
    // Default mode: return only essential fields without populates
    options.select = "details isIndependentLead rating isActive isDeleted createdAt updatedAt";
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

// Helper to fill missing dates
function fillMissingDates(data: any[], days: number) {
  const result = [];
  const map = new Map(data.map((item) => [item._id, item.count]));

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    result.push({
      date: dateStr,
      count: map.get(dateStr) || 0,
    });
  }
  return result;
}

// Helper to fill missing months
function fillMissingMonths(data: any[], months: number) {
  const result = [];
  const map = new Map(data.map((item) => [item._id, item.count]));

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const monthStr = d.toISOString().slice(0, 7); // YYYY-MM
    result.push({
      month: monthStr,
      count: map.get(monthStr) || 0,
    });
  }
  return result;
}

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
