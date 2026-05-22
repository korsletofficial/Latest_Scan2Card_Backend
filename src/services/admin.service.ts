import UserModel from "../models/user.model";
import RoleModel from "../models/role.model";
import EventModel from "../models/event.model";
import LeadsModel from "../models/leads.model";
import RsvpModel from "../models/rsvp.model";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { fillMissingMonths } from "../helpers/dateStats.helper";

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
  startDate.setDate(startDate.getDate() - days + 1);

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
  startDate.setDate(startDate.getDate() - days + 1);

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
  startDate.setDate(startDate.getDate() - days + 1);

  const dateLabels: string[] = [];
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    dateLabels.push(currentDate.toISOString().split("T")[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Unwind keys and bucket by each key's own createdAt (not the parent event's createdAt)
  const keysData = await EventModel.aggregate([
    { $match: { isDeleted: false } },
    { $unwind: "$licenseKeys" },
    {
      $match: {
        "licenseKeys.createdAt": { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$licenseKeys.createdAt" } },
        count: { $sum: 1 },
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
        maxLeads: key.maxLeads ?? 10000,
        currentLeadCount: key.currentLeadCount ?? 0,
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
  const exhibitorRole = await RoleModel.findOne({ name: "EXHIBITOR", isDeleted: false });
  if (!exhibitorRole) {
    throw new Error("Exhibitor role not found");
  }

  // 1. Most Events Created - Top 5 exhibitors
  const topEventCreators = await EventModel.aggregate([
    {
      $match: { isDeleted: false, exhibitorId: { $exists: true, $ne: null } },
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
      $match: { isDeleted: false, exhibitorId: { $exists: true, $ne: null } },
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

  // 3. Most Scans (Leads Captured) - Top 10 exhibitors
  // Lead.userId is the team member who physically scanned, not the exhibitor.
  // Join Lead→Event to credit the owning exhibitor for each lead.
  const topScanners = await LeadsModel.aggregate([
    {
      $match: {
        isDeleted: false,
        isIndependentLead: false,
        eventId: { $exists: true, $ne: null },
      },
    },
    { $group: { _id: "$eventId", eventLeads: { $sum: 1 } } },
    {
      $lookup: {
        from: "events",
        localField: "_id",
        foreignField: "_id",
        as: "event",
      },
    },
    { $unwind: { path: "$event", preserveNullAndEmptyArrays: false } },
    {
      $match: {
        "event.isDeleted": false,
        "event.exhibitorId": { $exists: true, $ne: null },
      },
    },
    { $group: { _id: "$event.exhibitorId", totalScans: { $sum: "$eventLeads" } } },
    { $sort: { totalScans: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: false } },
    {
      $project: {
        _id: 0,
        userId: "$_id",
        firstName: "$user.firstName",
        lastName: "$user.lastName",
        email: "$user.email",
        companyName: "$user.companyName",
        totalScans: 1,
      },
    },
  ]);

  return {
    mostEventsCreated: topEventCreators,
    mostKeysCreated: topKeyCreators,
    mostLicenseKeyUsage: topScanners,
  };
};

// ─────────────────────────────────────────────
// NEW ANALYTICS
// ─────────────────────────────────────────────

// 1. Platform Conversion Funnel: Keys Issued → Activated → Leads Captured
export const getPlatformConversionFunnel = async () => {
  // Key-level stats from events (use $ifNull so null fields don't skew sums)
  const result = await EventModel.aggregate([
    { $match: { isDeleted: false } },
    { $unwind: "$licenseKeys" },
    {
      $group: {
        _id: null,
        totalKeysIssued: { $sum: 1 },
        keysActivated: {
          $sum: {
            $cond: [{ $gt: [{ $ifNull: ["$licenseKeys.usedCount", 0] }, 0] }, 1, 0],
          },
        },
        totalLeadCapacity: { $sum: { $ifNull: ["$licenseKeys.maxLeads", 10000] } },
        totalActivationCapacity: { $sum: { $ifNull: ["$licenseKeys.maxActivations", 1] } },
        totalActivationsUsed: { $sum: { $ifNull: ["$licenseKeys.usedCount", 0] } },
      },
    },
  ]);

  // Count license keys that have ≥1 actual lead, determined via RSVP → Leads join.
  // We do NOT rely on licenseKeys.currentLeadCount because it may not be updated
  // for RSVPs where eventLicenseKey was not persisted at join time.
  const keysWithLeadsResult = await RsvpModel.aggregate([
    { $match: { isDeleted: false, hasExited: { $ne: true }, eventLicenseKey: { $nin: [null, ""] } } },
    {
      $lookup: {
        from: "leads",
        let: { uid: "$userId", eid: "$eventId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$userId", "$$uid"] },
                  { $eq: ["$eventId", "$$eid"] },
                  { $eq: ["$isDeleted", false] },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: "leads",
      },
    },
    { $match: { "leads.0": { $exists: true } } },
    {
      $group: {
        _id: { eventId: "$eventId", licenseKey: "$eventLicenseKey" },
      },
    },
    { $count: "total" },
  ]);
  const keysWithLeads = keysWithLeadsResult[0]?.total ?? 0;

  // Count actual event-linked leads from the Leads collection
  const totalLeadsCaptured = await LeadsModel.countDocuments({
    isDeleted: false,
    isIndependentLead: false,
    eventId: { $exists: true, $ne: null },
  });

  const toPercent = (n: number, d: number) =>
    d > 0 ? parseFloat(((n / d) * 100).toFixed(2)) : 0;

  if (!result.length) {
    return {
      funnel: [
        { step: "Keys Issued", count: 0, dropOffPct: 0 },
        { step: "Keys Activated", count: 0, dropOffPct: 0 },
        { step: "Keys With Leads", count: 0, dropOffPct: 0 },
      ],
      summary: {
        totalKeysIssued: 0,
        keysActivated: 0,
        keysWithLeads,
        totalLeadCapacity: 0,
        totalLeadsCaptured,
        overallLeadUtilizationPct: 0,
        overallActivationUtilizationPct: 0,
      },
    };
  }

  const {
    totalKeysIssued,
    keysActivated,
    totalLeadCapacity,
    totalActivationCapacity,
    totalActivationsUsed,
  } = result[0];

  return {
    funnel: [
      { step: "Keys Issued", count: totalKeysIssued, dropOffPct: 100 },
      {
        step: "Keys Activated",
        count: keysActivated,
        dropOffPct: toPercent(keysActivated, totalKeysIssued),
      },
      {
        step: "Keys With Leads",
        count: keysWithLeads,
        dropOffPct: toPercent(keysWithLeads, totalKeysIssued),
      },
    ],
    summary: {
      totalKeysIssued,
      keysActivated,
      keysWithLeads,
      totalLeadCapacity,
      totalLeadsCaptured,
      overallLeadUtilizationPct: toPercent(totalLeadsCaptured, totalLeadCapacity),
      overallActivationUtilizationPct: toPercent(totalActivationsUsed, totalActivationCapacity),
    },
  };
};

// 2. Exhibitor Retention & Churn
export const getExhibitorRetentionChurn = async (inactiveDays: number = 30) => {
  const exhibitorRole = await RoleModel.findOne({ name: "EXHIBITOR", isDeleted: false });
  if (!exhibitorRole) throw new Error("Exhibitor role not found");

  const allExhibitors = await UserModel.find({
    role: exhibitorRole._id,
    isDeleted: false,
  }).select("_id firstName lastName email companyName createdAt").lean();

  if (!allExhibitors.length) {
    return {
      summary: { total: 0, active: 0, atRisk: 0, neverCreatedEvent: 0, retentionRatePct: 0 },
      atRisk: [],
      neverCreatedEvent: [],
    };
  }

  const exhibitorIds = allExhibitors.map((e) => e._id);

  // Latest event createdAt per exhibitor
  const lastEventData = await EventModel.aggregate([
    { $match: { exhibitorId: { $in: exhibitorIds }, isDeleted: false } },
    { $group: { _id: "$exhibitorId", lastEventAt: { $max: "$createdAt" }, eventCount: { $sum: 1 } } },
  ]);

  const lastEventMap = new Map(
    lastEventData.map((r) => [r._id.toString(), { lastEventAt: r.lastEventAt, eventCount: r.eventCount }])
  );

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - inactiveDays);

  const atRisk: any[] = [];
  const neverCreatedEvent: any[] = [];
  let activeCount = 0;

  for (const ex of allExhibitors) {
    const data = lastEventMap.get(ex._id.toString());
    if (!data) {
      neverCreatedEvent.push({
        userId: ex._id,
        firstName: ex.firstName,
        lastName: ex.lastName,
        email: ex.email,
        companyName: ex.companyName,
        registeredAt: ex.createdAt,
        daysSinceRegistration: Math.floor(
          (Date.now() - new Date(ex.createdAt as any).getTime()) / 86400000
        ),
      });
    } else if (new Date(data.lastEventAt) < cutoff) {
      atRisk.push({
        userId: ex._id,
        firstName: ex.firstName,
        lastName: ex.lastName,
        email: ex.email,
        companyName: ex.companyName,
        lastEventAt: data.lastEventAt,
        totalEvents: data.eventCount,
        daysSinceLastEvent: Math.floor(
          (Date.now() - new Date(data.lastEventAt).getTime()) / 86400000
        ),
      });
    } else {
      activeCount++;
    }
  }

  const total = allExhibitors.length;
  return {
    summary: {
      total,
      active: activeCount,
      atRisk: atRisk.length,
      neverCreatedEvent: neverCreatedEvent.length,
      inactiveDaysThreshold: inactiveDays,
      retentionRatePct: parseFloat(((activeCount / total) * 100).toFixed(2)),
    },
    atRisk,
    neverCreatedEvent,
  };
};

// 3. Expiring Keys With Low Utilization
export const getExpiringKeysWithLowUtilization = async (
  days: number = 14,
  utilizationThreshold: number = 30
) => {
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + days);

  // Build per-(eventId, licenseKey) lead count from actual Leads via RSVP.
  // licenseKeys.currentLeadCount may be stale when RSVP.eventLicenseKey was not set.
  const leadCountsRaw = await RsvpModel.aggregate([
    { $match: { isDeleted: false, hasExited: { $ne: true }, eventLicenseKey: { $nin: [null, ""] } } },
    {
      $lookup: {
        from: "leads",
        let: { uid: "$userId", eid: "$eventId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$userId", "$$uid"] },
                  { $eq: ["$eventId", "$$eid"] },
                  { $eq: ["$isDeleted", false] },
                ],
              },
            },
          },
          { $count: "count" },
        ],
        as: "leadInfo",
      },
    },
    {
      $group: {
        _id: { eventId: "$eventId", licenseKey: "$eventLicenseKey" },
        totalLeads: {
          $sum: { $ifNull: [{ $arrayElemAt: ["$leadInfo.count", 0] }, 0] },
        },
      },
    },
  ]);
  const leadCountMap = new Map<string, number>(
    leadCountsRaw.map((r: any) => [`${r._id.eventId}:${r._id.licenseKey}`, r.totalLeads])
  );

  const events = await EventModel.find({ isDeleted: false })
    .select("eventName exhibitorId licenseKeys")
    .populate("exhibitorId", "firstName lastName email companyName")
    .lean();

  const keys: any[] = [];
  for (const event of events) {
    for (const key of (event as any).licenseKeys) {
      if (!key.isActive) continue;
      const expiresAt = new Date(key.expiresAt);
      if (expiresAt < now || expiresAt > future) continue;
      const maxLeads = key.maxLeads ?? 10000;
      const currentLeadCount =
        leadCountMap.get(`${(event as any)._id}:${key.key}`) ?? 0;
      const utilizationPct =
        maxLeads > 0 ? parseFloat(((currentLeadCount / maxLeads) * 100).toFixed(2)) : 0;
      if (utilizationPct >= utilizationThreshold) continue;
      const daysUntilExpiry = Math.max(
        0,
        Math.floor((expiresAt.getTime() - now.getTime()) / 86400000)
      );
      const exhibitor = (event as any).exhibitorId;
      keys.push({
        keyId: key._id,
        key: key.key,
        stallName: key.stallName,
        email: key.email,
        eventId: (event as any)._id,
        eventName: (event as any).eventName,
        exhibitor: exhibitor
          ? {
              userId: exhibitor._id,
              name: `${exhibitor.firstName} ${exhibitor.lastName}`,
              email: exhibitor.email,
              companyName: exhibitor.companyName,
            }
          : null,
        expiresAt: key.expiresAt,
        daysUntilExpiry,
        currentLeadCount,
        maxLeads,
        utilizationPct,
      });
    }
  }

  keys.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry || a.utilizationPct - b.utilizationPct);

  return {
    expiryWindowDays: days,
    utilizationThresholdPct: utilizationThreshold,
    totalAtRisk: keys.length,
    keys,
  };
};

// 4. Platform Key Utilization
export const getPlatformKeyUtilization = async () => {
  // Use $ifNull on every field so null values in pre-schema documents are treated
  // as their defaults. This ensures totalActivationsUsed / totalActivationCapacity
  // both cover the exact same set of keys, keeping overallActivationUtilizationPct
  // mathematically consistent with the two totals returned in the response.
  const result = await EventModel.aggregate([
    { $match: { isDeleted: false } },
    { $unwind: "$licenseKeys" },
    {
      $group: {
        _id: null,
        totalKeys: { $sum: 1 },
        totalLeadCapacity: { $sum: { $ifNull: ["$licenseKeys.maxLeads", 10000] } },
        totalActivationCapacity: { $sum: { $ifNull: ["$licenseKeys.maxActivations", 1] } },
        totalActivationsUsed: { $sum: { $ifNull: ["$licenseKeys.usedCount", 0] } },
        neverUsed: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: [{ $ifNull: ["$licenseKeys.currentLeadCount", 0] }, 0] },
                  { $eq: [{ $ifNull: ["$licenseKeys.usedCount", 0] }, 0] },
                ],
              },
              1,
              0,
            ],
          },
        },
        lowUtilization: {
          $sum: {
            $cond: [
              {
                $lt: [
                  {
                    $divide: [
                      { $ifNull: ["$licenseKeys.currentLeadCount", 0] },
                      { $max: [{ $ifNull: ["$licenseKeys.maxLeads", 10000] }, 1] },
                    ],
                  },
                  0.25,
                ],
              },
              1,
              0,
            ],
          },
        },
        highUtilization: {
          $sum: {
            $cond: [
              {
                $gte: [
                  {
                    $divide: [
                      { $ifNull: ["$licenseKeys.currentLeadCount", 0] },
                      { $max: [{ $ifNull: ["$licenseKeys.maxLeads", 10000] }, 1] },
                    ],
                  },
                  0.75,
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  // Use actual lead count from Leads collection — licenseKeys.currentLeadCount
  // may be stale when RSVP.eventLicenseKey was not persisted at join time.
  const totalLeadsCaptured = await LeadsModel.countDocuments({
    isDeleted: false,
    isIndependentLead: false,
    eventId: { $exists: true, $ne: null },
  });

  if (!result.length) {
    return {
      totalKeys: 0,
      totalLeadCapacity: 0,
      totalLeadsCaptured,
      overallLeadUtilizationPct: 0,
      totalActivationCapacity: 0,
      totalActivationsUsed: 0,
      overallActivationUtilizationPct: 0,
      distribution: { neverUsed: 0, low: 0, medium: 0, high: 0 },
    };
  }

  const r = result[0];
  const toPercent = (n: number, d: number) =>
    d > 0 ? parseFloat(((n / d) * 100).toFixed(2)) : 0;

  // lowUtilization already includes neverUsed (0 < 0.25), so subtract only lowUtilization + high
  const medium = r.totalKeys - r.lowUtilization - r.highUtilization;

  return {
    totalKeys: r.totalKeys,
    totalLeadCapacity: r.totalLeadCapacity,
    totalLeadsCaptured,
    overallLeadUtilizationPct: toPercent(totalLeadsCaptured, r.totalLeadCapacity),
    totalActivationCapacity: r.totalActivationCapacity,
    totalActivationsUsed: r.totalActivationsUsed,
    overallActivationUtilizationPct: toPercent(r.totalActivationsUsed, r.totalActivationCapacity),
    distribution: {
      neverUsed: r.neverUsed,
      low: Math.max(0, r.lowUtilization - r.neverUsed),
      medium: Math.max(0, medium),
      high: r.highUtilization,
    },
  };
};

// 5. Geographic Distribution
export const getGeographicDistribution = async () => {
  const eventsByCity = await EventModel.aggregate([
    { $match: { isDeleted: false, "location.city": { $exists: true, $ne: "" } } },
    { $group: { _id: "$location.city", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 },
    { $project: { _id: 0, city: "$_id", count: 1 } },
  ]);

  return { eventsByCity };
};

// 6. Exhibitor Time-to-First-Event
export const getExhibitorTimeToFirstEvent = async () => {
  const exhibitorRole = await RoleModel.findOne({ name: "EXHIBITOR", isDeleted: false });
  if (!exhibitorRole) throw new Error("Exhibitor role not found");

  const exhibitors = await UserModel.find({
    role: exhibitorRole._id,
    isDeleted: false,
  }).select("_id firstName lastName email companyName createdAt").lean();

  if (!exhibitors.length) {
    return { summary: { avgDays: 0, neverCreatedEvent: 0 }, distribution: [], slowStarters: [] };
  }

  const exhibitorIds = exhibitors.map((e) => e._id);

  const firstEventData = await EventModel.aggregate([
    { $match: { exhibitorId: { $in: exhibitorIds }, isDeleted: false } },
    { $group: { _id: "$exhibitorId", firstEventAt: { $min: "$createdAt" } } },
  ]);

  const firstEventMap = new Map(firstEventData.map((r) => [r._id.toString(), r.firstEventAt]));

  const buckets = { "0-7d": 0, "8-14d": 0, "15-30d": 0, "31-60d": 0, "60d+": 0 };
  const slowStarters: any[] = [];
  let totalDays = 0;
  let countWithEvent = 0;
  let neverCreatedEvent = 0;

  for (const ex of exhibitors) {
    const firstEventAt = firstEventMap.get(ex._id.toString());
    if (!firstEventAt) {
      neverCreatedEvent++;
      continue;
    }
    const days = Math.max(
      0,
      Math.floor(
        (new Date(firstEventAt).getTime() - new Date(ex.createdAt as any).getTime()) / 86400000
      )
    );
    totalDays += days;
    countWithEvent++;
    if (days <= 7) buckets["0-7d"]++;
    else if (days <= 14) buckets["8-14d"]++;
    else if (days <= 30) buckets["15-30d"]++;
    else if (days <= 60) buckets["31-60d"]++;
    else buckets["60d+"]++;

    if (days > 30) {
      slowStarters.push({
        userId: ex._id,
        name: `${ex.firstName} ${ex.lastName}`,
        email: ex.email,
        companyName: ex.companyName,
        registeredAt: ex.createdAt,
        firstEventAt,
        daysToFirstEvent: days,
      });
    }
  }

  slowStarters.sort((a, b) => b.daysToFirstEvent - a.daysToFirstEvent);

  return {
    summary: {
      totalExhibitors: exhibitors.length,
      withEvents: countWithEvent,
      neverCreatedEvent,
      avgDaysToFirstEvent: countWithEvent > 0 ? parseFloat((totalDays / countWithEvent).toFixed(1)) : 0,
    },
    distribution: Object.entries(buckets).map(([range, count]) => ({ range, count })),
    slowStarters,
  };
};

// 7. Event Type Distribution
export const getEventTypeDistribution = async () => {
  const byType = await EventModel.aggregate([
    { $match: { isDeleted: false } },
    { $group: { _id: "$type", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $project: { _id: 0, type: "$_id", count: 1 } },
  ]);

  const total = byType.reduce((s, r) => s + r.count, 0);
  const typesWithPct = byType.map((r) => ({
    type: r.type,
    count: r.count,
    pct: total > 0 ? parseFloat(((r.count / total) * 100).toFixed(2)) : 0,
  }));

  return {
    total,
    breakdown: typesWithPct,
  };
};

// 8. Peak Platform Usage Hours
export const getPeakUsageHours = async (days?: number) => {
  const matchStage: any = { isDeleted: false };
  if (days) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    matchStage.createdAt = { $gte: since };
  }

  // $hour returns UTC hours. Labels are rendered as UTC — frontend should offset for local timezone.
  const hourlyData = await LeadsModel.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: { $hour: "$createdAt" },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const hourMap = new Map(hourlyData.map((r) => [r._id, r.count]));

  const hours = Array.from({ length: 24 }, (_, h) => {
    const label =
      h === 0
        ? "12am"
        : h < 12
        ? `${h}am`
        : h === 12
        ? "12pm"
        : `${h - 12}pm`;
    return { hour: h, label, count: hourMap.get(h) ?? 0 };
  });

  const maxCount = Math.max(...hours.map((h) => h.count), 0);
  const peakHour = hours.find((h) => h.count === maxCount) ?? null;

  return { hours, peakHour, filterDays: days ?? null };
};

// ─────────────────────────────────────────────
// END NEW ANALYTICS
// ─────────────────────────────────────────────

// Get new exhibitors onboarded — Month over Month trend
export const getExhibitorsMoMTrend = async (months: number = 12) => {
  const exhibitorRole = await RoleModel.findOne({ name: "EXHIBITOR", isDeleted: false });
  if (!exhibitorRole) throw new Error("Exhibitor role not found");

  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - (months - 1));
  startDate.setDate(1);
  startDate.setHours(0, 0, 0, 0);

  const rawData = await UserModel.aggregate([
    {
      $match: {
        role: exhibitorRole._id,
        isDeleted: false,
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const trends = fillMissingMonths(rawData, months);

  const currentMonthCount = trends[trends.length - 1]?.count ?? 0;
  const previousMonthCount = trends[trends.length - 2]?.count ?? 0;
  const totalInPeriod = trends.reduce((sum, t) => sum + t.count, 0);

  let momChangePercent: number | null = null;
  if (previousMonthCount > 0) {
    momChangePercent = parseFloat(
      (((currentMonthCount - previousMonthCount) / previousMonthCount) * 100).toFixed(2)
    );
  }

  return {
    trends,
    summary: {
      totalInPeriod,
      currentMonthCount,
      previousMonthCount,
      momChangeAbsolute: currentMonthCount - previousMonthCount,
      momChangePercent,
    },
  };
};

// ─────────────────────────────────────────────
// SCAN STATS
// ─────────────────────────────────────────────

export const getScanStats = async () => {
  const exhibitorRole = await RoleModel.findOne({ name: "EXHIBITOR", isDeleted: false });
  if (!exhibitorRole) throw new Error("Exhibitor role not found");

  const totalExhibitors = await UserModel.countDocuments({
    role: exhibitorRole._id,
    isDeleted: false,
  });

  // All non-deleted leads — same count as the dashboard totalLeads card so that
  // avgScansPerUser × totalExhibitors always equals the dashboard total.
  const totalLeads = await LeadsModel.countDocuments({ isDeleted: false });

  // Path 1: exhibitors who OWN a regular event that has at least 1 lead captured
  // (team members scan on behalf of the exhibitor — lead.userId = team member, not exhibitor)
  const fromRegularEvents = await LeadsModel.aggregate([
    {
      $match: {
        isDeleted: false,
        isIndependentLead: false,
        eventId: { $exists: true, $ne: null },
      },
    },
    { $group: { _id: "$eventId" } },
    {
      $lookup: {
        from: "events",
        localField: "_id",
        foreignField: "_id",
        as: "event",
      },
    },
    { $unwind: { path: "$event", preserveNullAndEmptyArrays: false } },
    {
      $match: {
        "event.isDeleted": false,
        "event.exhibitorId": { $exists: true, $ne: null },
      },
    },
    { $group: { _id: "$event.exhibitorId" } },
  ]);

  // Path 2: exhibitors who personally scanned (trial events or independent leads —
  // these have lead.userId = the exhibitor themselves)
  const fromDirectScans = await LeadsModel.aggregate([
    { $match: { isDeleted: false } },
    { $group: { _id: "$userId" } },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: false } },
    {
      $match: {
        "user.role": exhibitorRole._id,
        "user.isDeleted": false,
      },
    },
  ]);

  // Union both paths — an exhibitor counts once regardless of how many paths they appear in
  const exhibitorIdsWithScans = new Set([
    ...fromRegularEvents.map((e: any) => e._id.toString()),
    ...fromDirectScans.map((e: any) => e._id.toString()),
  ]);

  const usersWithAtLeastOneScan = exhibitorIdsWithScans.size;
  const usersWithZeroScans = Math.max(0, totalExhibitors - usersWithAtLeastOneScan);
  const avgScansPerUser =
    totalExhibitors > 0
      ? parseFloat((totalLeads / totalExhibitors).toFixed(2))
      : 0;

  return {
    avgScansPerUser,
    usersWithAtLeastOneScan,
    usersWithZeroScans,
    totalExhibitors,
  };
};

// ─────────────────────────────────────────────
// PDF REPORT STATS (end users only)
// ─────────────────────────────────────────────

export const getPdfReportStats = async (fromDate?: Date, toDate?: Date) => {
  const endUserRole = await RoleModel.findOne({ name: "ENDUSER", isDeleted: false });
  if (!endUserRole) throw new Error("EndUser role not found");

  const dateFilter: any = { isDeleted: false };
  if (fromDate || toDate) {
    dateFilter.createdAt = {};
    if (fromDate) dateFilter.createdAt.$gte = fromDate;
    if (toDate) dateFilter.createdAt.$lte = toDate;
  }

  const totalLeads = await LeadsModel.countDocuments(dateFilter);

  const totalEndUsers = await UserModel.countDocuments({
    role: endUserRole._id,
    isDeleted: false,
  });

  // Top 10 end users by lead count — role filter applied after $lookup so non-endusers are excluded before the $limit
  const top10UsersByLeads = await LeadsModel.aggregate([
    { $match: dateFilter },
    { $group: { _id: "$userId", totalLeads: { $sum: 1 } } },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: false } },
    {
      $match: {
        "user.role": endUserRole._id,
        "user.isDeleted": false,
      },
    },
    { $sort: { totalLeads: -1 } },
    { $limit: 10 },
    {
      $project: {
        _id: 0,
        userId: "$_id",
        firstName: "$user.firstName",
        lastName: "$user.lastName",
        email: { $ifNull: ["$user.email", null] },
        phoneNumber: { $ifNull: ["$user.phoneNumber", null] },
        totalLeads: 1,
      },
    },
  ]);

  // Count distinct end users who have at least 1 lead attributed to them
  const usersWithLeadsResult = await LeadsModel.aggregate([
    { $match: dateFilter },
    { $group: { _id: "$userId" } },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: false } },
    { $match: { "user.role": endUserRole._id, "user.isDeleted": false } },
    { $count: "total" },
  ]);

  const usersWithAtLeastOneLead = usersWithLeadsResult[0]?.total ?? 0;
  const usersWithZeroLeads = Math.max(0, totalEndUsers - usersWithAtLeastOneLead);
  const avgLeadsPerUser =
    totalEndUsers > 0 ? parseFloat((totalLeads / totalEndUsers).toFixed(2)) : 0;

  return {
    totalLeads,
    top10UsersByLeads: top10UsersByLeads.map((u, i) => ({ rank: i + 1, ...u })),
    avgLeadsPerUser,
    usersWithAtLeastOneLead,
    usersWithZeroLeads,
    totalEndUsers,
  };
};
