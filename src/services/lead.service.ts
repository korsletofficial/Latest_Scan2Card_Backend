import LeadModel from "../models/leads.model";
import EventModel from "../models/event.model";
import UserModel from "../models/user.model";
import RsvpModel from "../models/rsvp.model";
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
  allowDuplicate?: boolean; // Skip duplicate check if true
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
  licenseKey?: string; // New: filter by license key/stall
  canCreateMeeting?: string; // Filter leads where user can create meetings
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

  // CHECK FOR DUPLICATE LEADS (only if allowDuplicate is not true)
  if (!data.allowDuplicate && data.eventId && !data.isIndependentLead) {
    const { email, phoneNumber } = data.details || {};
    const { entryCode } = data;

    // Check if we have any unique identifier (emails, phones, or entryCode)
    const hasEmails = data.details?.emails && data.details.emails.length > 0;
    const hasPhones = data.details?.phoneNumbers && data.details.phoneNumbers.length > 0;

    if (hasEmails || hasPhones || entryCode) {
      const duplicateQuery: any = {
        eventId: data.eventId,
        isDeleted: false,
        $or: []
      };

      if (hasEmails) {
        duplicateQuery.$or.push({ 'details.emails': { $in: data.details!.emails } });
        // Also check legacy field just in case
        duplicateQuery.$or.push({ 'details.email': { $in: data.details!.emails } });
      }

      if (hasPhones) {
        duplicateQuery.$or.push({ 'details.phoneNumbers': { $in: data.details!.phoneNumbers } });
        // Also check legacy field just in case
        duplicateQuery.$or.push({ 'details.phoneNumber': { $in: data.details!.phoneNumbers } });
      }

      if (entryCode && entryCode.trim()) {
        duplicateQuery.$or.push({ 'entryCode': entryCode.trim() });
      }

      // Only search if we have at least one criterion
      if (duplicateQuery.$or.length > 0) {
        const existingLead = await LeadModel.findOne(duplicateQuery)
          .sort({ createdAt: -1 }) // Get the most recent duplicate
          .lean();

        if (existingLead) {
          // Check if this is a trial event
          const event = await EventModel.findById(data.eventId);
          let stallInfo = 'Unknown Stall';

          if (event?.isTrialEvent) {
            // For trial events, there's no license key/stall
            stallInfo = 'Trial Event';
          } else {
            // Find the stall/license key information for regular events
            const rsvp = await RsvpModel.findOne({
              userId: existingLead.userId,
              eventId: data.eventId,
              isDeleted: false,
            }).lean();

            // Get stall name from the event's license keys
            if (rsvp?.eventLicenseKey && event) {
              const matchingLicenseKey = event.licenseKeys.find(
                (lk) => lk.key === rsvp.eventLicenseKey
              );
              stallInfo = matchingLicenseKey?.stallName || rsvp.eventLicenseKey || 'Unknown Stall';
            } else {
              stallInfo = 'Unknown Stall';
            }
          }

          const scannedAt = new Date((existingLead as any).createdAt).toLocaleString();

          // Create a custom error with isDuplicate flag
          const error: any = new Error(
            `This lead already exists in this event. ` +
            `Previously scanned by stall "${stallInfo}" at ${scannedAt}. ` +
            `To create anyway, set allowDuplicate to true.`
          );
          error.isDuplicate = true;
          error.duplicateInfo = {
            stallName: stallInfo,
            scannedAt: scannedAt,
            existingLeadId: existingLead._id,
          };
          throw error;
        }
      }
    }
  }

  // VALIDATE EVENT ACCESS & LICENSE KEY
  if (data.eventId && !data.isIndependentLead) {
    const event = await EventModel.findById(data.eventId);

    if (!event || event.isDeleted) {
      throw new Error("Event not found");
    }

    // CHECK TRIAL EVENT LIMIT
    if (event.isTrialEvent) {
      // Check user's trial lead count
      const user = await UserModel.findById(data.userId);

      if (user && user.trialLeadsCount && user.trialLeadsCount >= 5) {
        throw new Error(
          "Trial event limit reached. You've created 5 leads with the trial event. " +
          "Please join a regular event with a license key to continue creating leads."
        );
      }
    } else {
      // NON-TRIAL EVENT: Validate RSVP and license key
      const rsvp = await RsvpModel.findOne({
        userId: data.userId,
        eventId: data.eventId,
        isDeleted: false,
        // isActive: true, // REMOVED: Fetch even if inactive to show correct error
      });

      if (!rsvp) {
        throw new Error(
          "You don't have a valid registration for this event. " +
          "Please register with a license key first."
        );
      }

      // Check if RSVP is active
      if (!rsvp.isActive) {
        throw new Error(
          "Your access to this event is currently inactive. " +
          "Please contact the event organizer."
        );
      }

      // Validate license key expiration (allow scanning even if event is inactive)
      const now = new Date();
      if (rsvp.expiresAt && new Date(rsvp.expiresAt) < now) {
        throw new Error(
          "Your license key has expired. " +
          `It was valid until ${new Date(rsvp.expiresAt).toLocaleDateString()}.`
        );
      }

      console.log(`✅ License key validated for user ${data.userId} in event ${data.eventId}`);
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
    licenseKey,
    canCreateMeeting,
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

    // Exclude leads from events where access has been revoked
    const revokedRsvps = await RsvpModel.find({
      userId: userId,
      isRevoked: true,
      isDeleted: false,
    }).select("eventId");

    const revokedEventIds = revokedRsvps.map((rsvp) => rsvp.eventId);

    // If there are revoked events, exclude leads from those events
    if (revokedEventIds.length > 0) {
      query.eventId = { $nin: revokedEventIds };
    }
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

  // License key (stall) filtering
  if (licenseKey) {
    // Find all RSVPs with this license key
    const rsvps = await RsvpModel.find({
      eventLicenseKey: licenseKey,
      isDeleted: false,
    }).select("userId");

    // Get all user IDs from these RSVPs
    const userIds = rsvps.map((rsvp) => rsvp.userId);

    // Filter leads to only show those from users who used this license key
    if (userIds.length > 0) {
      query.userId = { $in: userIds };
    } else {
      // No users found for this license key, return empty results
      query.userId = null; // This will match no documents
    }
  }

  // Time-based filtering
  if (period) {
    const dateRanges = getDateRangesByPeriod(period, timeZone);
    query.createdAt = dateRanges;
  }

  // Filter leads by meeting creation permission
  if (canCreateMeeting === "true") {
    // Get user's RSVPs with their permissions
    const userRsvps = await RsvpModel.find({
      userId: userId,
      isDeleted: false,
    }).lean();

    // Create a map of eventId -> RSVP for quick lookup
    const rsvpMap = new Map(
      userRsvps.map((rsvp) => [rsvp.eventId?.toString(), rsvp])
    );

    // Get all events to check license key permissions
    const eventIdsFromRsvps = userRsvps
      .filter((rsvp) => rsvp.eventId)
      .map((rsvp) => rsvp.eventId);

    const events = await EventModel.find({
      _id: { $in: eventIdsFromRsvps },
      isDeleted: false,
    }).lean();

    // Create a map of eventId -> event for quick lookup
    const eventMap = new Map(
      events.map((event) => [event._id.toString(), event])
    );

    // Determine which events allow meeting creation
    const allowedEventIds: mongoose.Types.ObjectId[] = [];

    for (const rsvp of userRsvps) {
      if (!rsvp.eventId) continue;

      const eventIdStr = rsvp.eventId.toString();

      // If individual permission is explicitly false, skip this event
      if (rsvp.canCreateMeeting === false) {
        continue;
      }

      // If individual permission is explicitly true, allow this event
      if (rsvp.canCreateMeeting === true) {
        allowedEventIds.push(rsvp.eventId as mongoose.Types.ObjectId);
        continue;
      }

      // Check license key-level permission
      const event = eventMap.get(eventIdStr);
      if (event && rsvp.eventLicenseKey) {
        const licenseKey = event.licenseKeys?.find(
          (lk: any) => lk.key === rsvp.eventLicenseKey
        );

        // If bulk permission is disabled, skip this event
        if (licenseKey && licenseKey.allowTeamMeetings === false) {
          continue;
        }
      }

      // No restrictions found, allow this event
      allowedEventIds.push(rsvp.eventId as mongoose.Types.ObjectId);
    }

    // Update query to only include leads from allowed events
    if (allowedEventIds.length > 0) {
      // If eventId filter is already set, intersect with allowed events
      if (query.eventId) {
        const requestedEventId = query.eventId.toString();
        if (!allowedEventIds.some((id) => id.toString() === requestedEventId)) {
          // Requested event is not in allowed list - return empty results
          query._id = null; // This will match no documents
        }
        // Otherwise keep the existing eventId filter
      } else {
        query.eventId = { $in: allowedEventIds };
      }
    } else {
      // No events allow meeting creation - return empty results
      query._id = null; // This will match no documents
    }
  }

  // Search in details
  if (search) {
    query.$or = [
      { "details.firstName": { $regex: search, $options: "i" } },
      { "details.lastName": { $regex: search, $options: "i" } },
      { "details.company": { $regex: search, $options: "i" } },
      { "details.emails": { $elemMatch: { $regex: search, $options: "i" } } },
      { "details.phoneNumbers": { $elemMatch: { $regex: search, $options: "i" } } },
      // Keep legacy checks for old data
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
    options.select = "_id details.firstName details.lastName details.email entryCode eventId";
  } else {
    // Default mode: return essential fields with populated eventId and userId
    options.select = "details isIndependentLead rating isActive isDeleted entryCode createdAt updatedAt eventId userId";
    options.populate = [
      { path: "eventId", select: "_id eventName type startDate endDate" },
      { path: "userId", select: "_id firstName lastName email" }
    ];
  }

  const leads = await LeadModel.paginate(query, options);

  // Fetch user's RSVPs for all events in the results to get permissions
  // Note: eventId may be populated (object) or just an ObjectId, handle both cases
  const eventIdsInResults = leads.docs
    .filter((lead: any) => lead.eventId)
    .map((lead: any) => lead.eventId._id || lead.eventId);

  // Get unique event IDs
  const uniqueEventIds = [...new Set(eventIdsInResults.map((id: any) => id.toString()))];

  // Fetch user's RSVPs for these events
  const userRsvpsForPermissions = await RsvpModel.find({
    userId: userId,
    eventId: { $in: uniqueEventIds },
    isDeleted: false,
  }).select("eventId canUseOwnCalendar canCreateMeeting").lean();

  // Create a map of eventId -> permissions
  const permissionsMap = new Map(
    userRsvpsForPermissions.map((rsvp) => [
      rsvp.eventId?.toString(),
      {
        canUseOwnCalendar: rsvp.canUseOwnCalendar ?? false,
        canCreateMeeting: rsvp.canCreateMeeting ?? true,
      },
    ])
  );

  // Add permissions to each lead and filter populated fields
  const leadsWithPermissions = leads.docs.map((lead: any) => {
    const leadObj = lead.toJSON ? lead.toJSON() : lead;
    // Handle both populated eventId (object with _id) and unpopulated (ObjectId)
    const eventIdStr = leadObj.eventId?._id?.toString() || leadObj.eventId?.toString();
    const permissions = eventIdStr ? permissionsMap.get(eventIdStr) : null;

    // Filter eventId to only include required fields
    let filteredEventId = leadObj.eventId;
    if (leadObj.eventId && typeof leadObj.eventId === 'object' && leadObj.eventId._id) {
      filteredEventId = {
        _id: leadObj.eventId._id,
        eventName: leadObj.eventId.eventName,
        type: leadObj.eventId.type,
        startDate: leadObj.eventId.startDate,
        endDate: leadObj.eventId.endDate,
      };
    }

    // Filter userId to only include required fields
    let filteredUserId = leadObj.userId;
    if (leadObj.userId && typeof leadObj.userId === 'object' && leadObj.userId._id) {
      filteredUserId = {
        _id: leadObj.userId._id,
        firstName: leadObj.userId.firstName,
        lastName: leadObj.userId.lastName,
        email: leadObj.userId.email,
      };
    }

    return {
      ...leadObj,
      eventId: filteredEventId,
      userId: filteredUserId,
      canUseOwnCalendar: permissions?.canUseOwnCalendar ?? false,
      canCreateMeeting: permissions?.canCreateMeeting ?? true,
    };
  });

  return {
    leads: leadsWithPermissions,
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
    .populate("eventId", "_id eventName")
    .populate("userId", "firstName lastName email phoneNumber companyName profileImage events");

  if (!lead) {
    throw new Error("Lead not found");
  }

  // Fetch license key and permissions from RSVP if lead has an event
  let licenseKey: string | null = null;
  let canUseOwnCalendar: boolean = false;
  let canCreateMeeting: boolean = true;

  if (lead.eventId) {
    const rsvp = await RsvpModel.findOne({
      userId: lead.userId,
      eventId: lead.eventId,
      isDeleted: false,
    }).select("eventLicenseKey canUseOwnCalendar canCreateMeeting");

    if (rsvp) {
      licenseKey = rsvp.eventLicenseKey || null;
      canUseOwnCalendar = rsvp.canUseOwnCalendar ?? false;
      canCreateMeeting = rsvp.canCreateMeeting ?? true;
    }
  }

  return { lead, licenseKey, canUseOwnCalendar, canCreateMeeting };
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
    isDeleted: false,
  });

  if (!lead) {
    throw new Error("Lead not found");
  }

  // Check authorization: either the original user or a team manager of the event
  let isAuthorized = lead.userId.toString() === userId;

  if (!isAuthorized && lead.eventId) {
    // Check if user is a team manager of this event
    const event = await EventModel.findOne({
      _id: lead.eventId,
      "licenseKeys.teamManagerId": userId,
      isDeleted: false,
    });
    isAuthorized = !!event;
  }

  if (!isAuthorized) {
    throw new Error("Unauthorized: You do not have permission to edit this lead");
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

// Get Events by IDs
export const getEventsByIds = async (eventIds: string[]) => {
  if (!eventIds || eventIds.length === 0) {
    return [];
  }

  const events = await EventModel.find({
    _id: { $in: eventIds },
    isDeleted: false,
  }).select('_id eventName');

  return events;
};

// Get Leads for Export (returns all fields needed for CSV)
export const getLeadsForExport = async (filter: GetLeadsFilter) => {
  const {
    userId,
    userRole,
    limit = 1000,
    eventId,
    rating,
    search,
    licenseKey,
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
  } else if (userRole === "TEAMMANAGER") {
    // For team managers, get leads from events they manage
    const managedEvents = await EventModel.find({
      "licenseKeys.teamManagerId": userId,
      isDeleted: false,
    }).select("_id");

    const eventIds = managedEvents.map((event) => event._id);
    query.eventId = { $in: eventIds };
  } else {
    // For end users, only show their own leads
    query.userId = userId;
  }

  if (eventId && eventId !== "all") {
    query.eventId = eventId;
  }

  if (rating) {
    query.rating = parseInt(rating);
  }

  // License key (stall) filtering
  if (licenseKey) {
    // Find all RSVPs with this license key
    const rsvps = await RsvpModel.find({
      eventLicenseKey: licenseKey,
      isDeleted: false,
    }).select("userId");

    // Get all user IDs from these RSVPs
    const userIds = rsvps.map((rsvp) => rsvp.userId);

    // Filter leads to only show those from users who used this license key
    if (userIds.length > 0) {
      query.userId = { $in: userIds };
    } else {
      // No users found for this license key, return empty results
      query.userId = null; // This will match no documents
    }
  }

  // Search in details
  if (search) {
    query.$or = [
      { "details.firstName": { $regex: search, $options: "i" } },
      { "details.lastName": { $regex: search, $options: "i" } },
      { "details.company": { $regex: search, $options: "i" } },
      { "details.emails": { $elemMatch: { $regex: search, $options: "i" } } },
      { "details.phoneNumbers": { $elemMatch: { $regex: search, $options: "i" } } },
      // Keep legacy checks for old data
      { "details.email": { $regex: search, $options: "i" } },
      { "details.phoneNumber": { $regex: search, $options: "i" } },
    ];
  }

  // Get all leads with all fields (no field selection)
  const leads = await LeadModel.find(query)
    .sort({ createdAt: -1 })
    .limit(parseInt(limit.toString()))
    .lean(); // Use lean() to get plain JavaScript objects

  return leads;
};