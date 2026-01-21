import MeetingModel from "../models/meeting.model";
import EventModel from "../models/event.model";
import UserModel from "../models/user.model";
import LeadsModel from "../models/leads.model";
import RoleModel from "../models/role.model";
import RsvpModel from "../models/rsvp.model";
import mongoose from "mongoose";

// Get all meetings for team manager's team members
export const getTeamMeetings = async (
  teamManagerId: string,
  page: number = 1,
  limit: number = 10,
  sortBy: 'startAt' | 'createdAt' = 'createdAt',
  sortOrder: 'asc' | 'desc' = 'desc'
) => {
  // Find all events managed by this team manager
  const managedEvents = await EventModel.find({
    "licenseKeys.teamManagerId": teamManagerId,
    isDeleted: false,
  });
  const managedEventIds = managedEvents.map((e) => e._id.toString());

  if (managedEventIds.length === 0) {
    return {
      meetings: [],
      pagination: {
        total: 0,
        page: 1,
        limit: limit,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      }
    };
  }

  // Find the ObjectId for the ENDUSER role
  const endUserRole = await RoleModel.findOne({
    name: "ENDUSER",
    isDeleted: false,
  });
  if (!endUserRole) {
    throw new Error("ENDUSER role not found");
  }

  // Find all team members (ENDUSERs) under this manager
  const teamMembers = await UserModel.find({
    role: endUserRole._id,
    isDeleted: false,
  });
  const teamMemberIds = teamMembers.map((u) => u._id.toString());

  // Find all leads for these events and team members
  const leads = await LeadsModel.find({
    eventId: { $in: managedEventIds },
    userId: { $in: teamMemberIds },
    isDeleted: false,
  });
  const leadIds = leads.map((l) => l._id.toString());

  // Build sort object
  const sortField = sortBy === 'startAt' ? 'startAt' : 'createdAt';
  const sortDirection = sortOrder === 'asc' ? 1 : -1;

  // Count total meetings
  const total = await MeetingModel.countDocuments({
    leadId: { $in: leadIds },
    userId: { $in: teamMemberIds },
    isDeleted: false,
  });

  // Calculate pagination values
  const totalPages = Math.ceil(total / limit);
  const skip = (page - 1) * limit;

  // Find all meetings for these leads and team members with pagination and sorting
  const meetings = await MeetingModel.find({
    leadId: { $in: leadIds },
    userId: { $in: teamMemberIds },
    isDeleted: false,
  })
    .select("_id userId leadId title meetingMode meetingStatus startAt endAt createdAt")
    .sort({ [sortField]: sortDirection })
    .skip(skip)
    .limit(limit)
    .populate({
      path: "leadId",
      select: "details.firstName details.lastName details.emails details.company eventId",
      populate: {
        path: "eventId",
        select: "eventName"
      }
    })
    .populate("userId", "firstName lastName email")
    .lean();

  // Format the response to match frontend expectations
  const formattedMeetings = meetings.map((meeting: any) => ({
    _id: meeting._id,
    userId: {
      _id: meeting.userId._id,
      firstName: meeting.userId.firstName,
      lastName: meeting.userId.lastName,
      email: meeting.userId.email,
    },
    leadId: {
      _id: meeting.leadId._id,
      details: {
        firstName: meeting.leadId.details?.firstName || '',
        lastName: meeting.leadId.details?.lastName || '',
        email: meeting.leadId.details?.emails?.[0] || meeting.leadId.details?.email || '',
        company: meeting.leadId.details?.company || '',
      }
    },
    eventId: meeting.leadId.eventId ? {
      _id: meeting.leadId.eventId._id,
      eventName: meeting.leadId.eventId.eventName,
    } : null,
    title: meeting.title,
    meetingMode: meeting.meetingMode,
    meetingStatus: meeting.meetingStatus,
    startAt: meeting.startAt,
    endAt: meeting.endAt,
  }));

  return {
    meetings: formattedMeetings,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    }
  };
};

// Get ALL meetings for team manager's calendar feed (no pagination)
export const getAllTeamMeetingsForCalendar = async (teamManagerId: string) => {
  // Find all events managed by this team manager
  const managedEvents = await EventModel.find({
    "licenseKeys.teamManagerId": teamManagerId,
    isDeleted: false,
  });
  const managedEventIds = managedEvents.map((e) => e._id.toString());

  if (managedEventIds.length === 0) {
    return [];
  }

  // Find the ObjectId for the ENDUSER role
  const endUserRole = await RoleModel.findOne({
    name: "ENDUSER",
    isDeleted: false,
  });
  if (!endUserRole) {
    throw new Error("ENDUSER role not found");
  }

  // Find all team members (ENDUSERs) under this manager
  const teamMembers = await UserModel.find({
    role: endUserRole._id,
    isDeleted: false,
  });
  const teamMemberIds = teamMembers.map((u) => u._id.toString());

  // Find all leads for these events and team members
  const leads = await LeadsModel.find({
    eventId: { $in: managedEventIds },
    userId: { $in: teamMemberIds },
    isDeleted: false,
  });
  const leadIds = leads.map((l) => l._id.toString());

  // Find all scheduled/rescheduled meetings (not cancelled/completed)
  const meetings = await MeetingModel.find({
    leadId: { $in: leadIds },
    userId: { $in: teamMemberIds },
    meetingStatus: { $in: ["scheduled", "rescheduled"] },
    isDeleted: false,
  })
    .select("_id userId leadId title description meetingMode meetingStatus startAt endAt location createdAt")
    .sort({ startAt: 1 })
    .populate({
      path: "leadId",
      select: "details.firstName details.lastName details.emails details.company eventId",
      populate: {
        path: "eventId",
        select: "eventName"
      }
    })
    .populate("userId", "firstName lastName email")
    .lean();

  // Format for calendar use
  return meetings.map((meeting: any) => ({
    _id: meeting._id,
    title: meeting.title,
    description: meeting.description || '',
    meetingMode: meeting.meetingMode,
    meetingStatus: meeting.meetingStatus,
    startAt: meeting.startAt,
    endAt: meeting.endAt,
    location: meeting.location || '',
    createdBy: {
      firstName: meeting.userId?.firstName || '',
      lastName: meeting.userId?.lastName || '',
      email: meeting.userId?.email || '',
    },
    lead: {
      firstName: meeting.leadId?.details?.firstName || '',
      lastName: meeting.leadId?.details?.lastName || '',
      email: meeting.leadId?.details?.emails?.[0] || '',
      company: meeting.leadId?.details?.company || '',
    },
    eventName: meeting.leadId?.eventId?.eventName || '',
  }));
};

// Get all leads for manager
export const getAllLeadsForManager = async (
  teamManagerId: string,
  eventId?: string,
  memberId?: string,
  page: number = 1,
  limit: number = 10,
  search: string = ""
) => {
  // Find all events managed by this team manager
  const managedEvents = await EventModel.find({
    "licenseKeys.teamManagerId": teamManagerId,
    isDeleted: false,
  });
  const managedEventIds = managedEvents.map((e) => e._id.toString());

  if (managedEventIds.length === 0) {
    return {
      leads: [],
      pagination: {
        total: 0,
        page,
        pages: 0,
        limit,
      },
    };
  }

  // Build query
  const query: any = {
    isDeleted: false,
  };

  // If specific eventId is requested, verify it's in the managed events
  if (eventId) {
    if (!managedEventIds.includes(eventId)) {
      throw new Error("Access denied: Event not managed by this team manager");
    }
    query.eventId = eventId;
  } else {
    query.eventId = { $in: managedEventIds };
  }

  if (memberId) query.userId = memberId;

  // Add search filter
  if (search) {
    query.$or = [
      { "details.firstName": { $regex: search, $options: "i" } },
      { "details.lastName": { $regex: search, $options: "i" } },
      { "details.company": { $regex: search, $options: "i" } },
      { "details.emails": { $elemMatch: { $regex: search, $options: "i" } } },
      { "details.phoneNumbers": { $elemMatch: { $regex: search, $options: "i" } } },
      // Legacy support
      { "details.email": { $regex: search, $options: "i" } },
      { "details.phoneNumber": { $regex: search, $options: "i" } },
    ];
  }

  // Get total count for pagination
  const total = await LeadsModel.countDocuments(query);

  // Get paginated leads
  const leads = await LeadsModel.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  return {
    leads,
    pagination: {
      total,
      page,
      pages: Math.ceil(total / limit),
      limit,
    },
  };
};

// Get leads for a specific team member
export const getMemberLeads = async (teamManagerId: string, memberId: string) => {
  // Find all events managed by this team manager
  const managedEvents = await EventModel.find({
    "licenseKeys.teamManagerId": teamManagerId,
    isDeleted: false,
  });
  const managedEventIds = managedEvents.map((e) => e._id);

  // Find all event/license key pairs where this member is in usedBy
  let allowedEventIds = [];
  for (const event of managedEvents) {
    for (const key of event.licenseKeys) {
      if (
        key.teamManagerId?.toString() === teamManagerId &&
        key.usedBy.some((u) => u.toString() === memberId)
      ) {
        allowedEventIds.push(event._id);
      }
    }
  }

  // Get all leads for this member, only for allowed events
  const leads = await LeadsModel.find({
    userId: memberId,
    eventId: { $in: allowedEventIds },
    isDeleted: false,
  }).sort({ createdAt: -1 });

  return leads;
};

// Get team manager dashboard stats
export const getDashboardStats = async (teamManagerId: string) => {
  // Find license keys assigned to this team manager
  const events = await EventModel.find({
    "licenseKeys.teamManagerId": teamManagerId,
    isDeleted: false,
  });

  const licenseKeys = events.flatMap((event) =>
    event.licenseKeys.filter(
      (key) => key.teamManagerId?.toString() === teamManagerId
    )
  );

  // Get all event IDs managed by this team manager
  const managedEventIds = events.map((e) => e._id);

  // Count total leads scanned by team members for this team manager's events only
  const totalLeads = await LeadsModel.countDocuments({
    eventId: { $in: managedEventIds },
    isDeleted: false,
  });

  // Count team members (all unique users who joined events using license keys assigned to this team manager)
  const teamMembersResult = await RsvpModel.aggregate([
    {
      $match: {
        eventId: { $in: managedEventIds },
        eventLicenseKey: { $nin: [null, ""] },
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: "$userId",
      },
    },
    {
      $count: "uniqueUsers",
    },
  ]);

  const totalMembers = teamMembersResult.length > 0 ? teamMembersResult[0].uniqueUsers : 0;

  // Total license keys assigned
  const totalLicenseKeys = licenseKeys.length;

  // Sort license keys by expiresAt (most recent first) and get only the latest 5
  const sortedKeys = licenseKeys
    .sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime())
    .slice(0, 5);

  return {
    totalMembers,
    totalLeads,
    totalLicenseKeys,
    licenseKeys: sortedKeys.map((key) => ({
      key: key.key,
      email: key.email,
      stallName: key.stallName,
      expiresAt: key.expiresAt,
      usedCount: key.usedCount,
      maxActivations: key.maxActivations,
    })),
  };
};

// Get leads graph data (hourly or daily)
export const getLeadsGraph = async (
  teamManagerId: string,
  eventId: string,
  period: string = "hourly"
) => {
  // Find event and verify team manager has access
  const event = await EventModel.findOne({
    _id: eventId,
    "licenseKeys.teamManagerId": teamManagerId,
    isDeleted: false,
  });

  if (!event) {
    throw new Error("Event not found or access denied");
  }

  const startDate = new Date(event.startDate);
  const endDate = new Date(event.endDate);

  let groupByFormat: any;
  let dateArray: any[] = [];

  const dateField = "$createdAt"; // Use created timestamp since leads don't persist scannedAt yet

  if (period === "hourly") {
    // Group by hour for single day or short events
    groupByFormat = {
      year: { $year: { $toDate: dateField } },
      month: { $month: { $toDate: dateField } },
      day: { $dayOfMonth: { $toDate: dateField } },
      hour: { $hour: { $toDate: dateField } },
    };

    // Generate hourly slots
    const current = new Date(startDate);
    while (current <= endDate) {
      dateArray.push({
        year: current.getFullYear(),
        month: current.getMonth() + 1,
        day: current.getDate(),
        hour: current.getHours(),
        label: current.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          hour12: true,
        }),
        count: 0,
      });
      current.setHours(current.getHours() + 1);
    }
  } else {
    // Group by day for longer events
    groupByFormat = {
      year: { $year: { $toDate: dateField } },
      month: { $month: { $toDate: dateField } },
      day: { $dayOfMonth: { $toDate: dateField } },
    };

    // Generate daily slots
    const current = new Date(startDate);
    while (current <= endDate) {
      dateArray.push({
        year: current.getFullYear(),
        month: current.getMonth() + 1,
        day: current.getDate(),
        label: current.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
        }),
        count: 0,
      });
      current.setDate(current.getDate() + 1);
    }
  }

  // Get actual lead counts
  const leadsData = await LeadsModel.aggregate([
    {
      $match: {
        eventId: new mongoose.Types.ObjectId(eventId),
        createdAt: {
          $gte: startDate,
          $lte: endDate,
        },
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: groupByFormat,
        count: { $sum: 1 },
      },
    },
  ]);

  // Merge actual data with dateArray
  leadsData.forEach((item) => {
    const matchIndex = dateArray.findIndex((slot) => {
      if (period === "hourly") {
        return (
          slot.year === item._id.year &&
          slot.month === item._id.month &&
          slot.day === item._id.day &&
          slot.hour === item._id.hour
        );
      } else {
        return (
          slot.year === item._id.year &&
          slot.month === item._id.month &&
          slot.day === item._id.day
        );
      }
    });

    if (matchIndex !== -1) {
      dateArray[matchIndex].count = item.count;
    }
  });

  return {
    period,
    eventName: event.eventName,
    startDate: event.startDate,
    endDate: event.endDate,
    graphData: dateArray.map((item) => ({
      label: item.label,
      count: item.count,
    })),
  };
};

// Get team members with their lead count
export const getTeamMembers = async (
  teamManagerId: string,
  page: number = 1,
  limit: number = 10,
  search: string = ""
) => {
  // Get all eventIds managed by this team manager
  const managedEvents = await EventModel.find({
    "licenseKeys.teamManagerId": teamManagerId,
    isDeleted: false,
  }).select("_id");
  const managedEventIds = managedEvents.map((e) => e._id);

  if (managedEventIds.length === 0) {
    return {
      members: [],
      pagination: {
        total: 0,
        page,
        pages: 0,
        limit,
      },
    };
  }

  // Get all RSVPs in managed events with license keys
  const rsvpsInManagedEvents = await RsvpModel.find({
    eventId: { $in: managedEventIds },
    eventLicenseKey: { $nin: [null, ""] },
    isDeleted: false,
  }).select("userId");

  // Get unique userIds who RSVPed with keys in managed events
  const uniqueUserIds = [...new Set(rsvpsInManagedEvents.map((rsvp) => rsvp.userId.toString()))];

  // Build search query
  // Note: We don't filter by isDeleted to show soft-deleted members as "Scan2Card User"
  const searchQuery: any = {
    _id: { $in: uniqueUserIds.map((id) => new mongoose.Types.ObjectId(id)) },
  };

  if (search) {
    searchQuery.$or = [
      { firstName: { $regex: search, $options: "i" } },
      { lastName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  // Get total count
  const total = await UserModel.countDocuments(searchQuery);

  // Get paginated members
  const members = await UserModel.find(searchQuery)
    .select("firstName lastName email phoneNumber isActive isDeleted createdAt")
    .skip((page - 1) * limit)
    .limit(limit)
    .sort({ createdAt: -1 });

  // Get lead count for each member (only for managed events)
  const membersWithLeads = await Promise.all(
    members.map(async (member) => {
      const leadCount = await LeadsModel.countDocuments({
        userId: member._id,
        eventId: { $in: managedEventIds },
        isDeleted: false,
      });
      return {
        _id: member._id,
        firstName: member.firstName,
        lastName: member.lastName,
        email: member.email,
        phoneNumber: member.phoneNumber,
        isActive: member.isActive,
        isDeleted: member.isDeleted,
        leadCount,
        joinedAt: member.createdAt,
      };
    })
  );

  return {
    members: membersWithLeads,
    pagination: {
      total,
      page,
      pages: Math.ceil(total / limit),
      limit,
    },
  };
};

// Get team manager's events
export const getMyEvents = async (teamManagerId: string) => {
  const events = await EventModel.find({
    "licenseKeys.teamManagerId": teamManagerId,
    isDeleted: false,
  })
    .populate("exhibitorId", "firstName lastName companyName")
    .select("eventName description type startDate endDate location licenseKeys")
    .sort({ startDate: -1 });

  // Filter and format events
  const formattedEvents = events.map((event) => {
    const myLicenseKeys = event.licenseKeys.filter(
      (key) => key.teamManagerId?.toString() === teamManagerId
    );

    return {
      _id: event._id,
      eventName: event.eventName,
      description: event.description,
      type: event.type,
      startDate: event.startDate,
      endDate: event.endDate,
      location: event.location,
      exhibitor: event.exhibitorId,
      myLicenseKeys: myLicenseKeys.map((key) => ({
        key: key.key,
        stallName: key.stallName,
        expiresAt: key.expiresAt,
        usedCount: key.usedCount,
        maxActivations: key.maxActivations,
      })),
    };
  });

  return formattedEvents;
};

// Get all license keys for team manager with pagination
export const getAllLicenseKeys = async (
  teamManagerId: string,
  page: number = 1,
  limit: number = 10,
  search: string = ""
) => {
  // Find license keys assigned to this team manager
  const events = await EventModel.find({
    "licenseKeys.teamManagerId": teamManagerId,
    isDeleted: false,
  })
    .populate("exhibitorId", "firstName lastName companyName")
    .select("eventName licenseKeys _id")
    .sort({ startDate: -1 });

  // Extract and format all license keys with event info
  let allKeys: any[] = [];
  events.forEach((event) => {
    const myLicenseKeys = event.licenseKeys.filter(
      (key) => key.teamManagerId?.toString() === teamManagerId
    );

    myLicenseKeys.forEach((key) => {
      allKeys.push({
        key: key.key,
        email: key.email,
        stallName: key.stallName,
        expiresAt: key.expiresAt,
        usedCount: key.usedCount,
        maxActivations: key.maxActivations,
        eventId: event._id,
        eventName: event.eventName,
      });
    });
  });

  // Apply search filter
  if (search) {
    const searchLower = search.toLowerCase();
    allKeys = allKeys.filter(
      (key) =>
        key.key.toLowerCase().includes(searchLower) ||
        key.email.toLowerCase().includes(searchLower) ||
        key.stallName?.toLowerCase().includes(searchLower) ||
        key.eventName.toLowerCase().includes(searchLower)
    );
  }

  // Sort by expiresAt (most recent first)
  allKeys.sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime());

  // Get lead count for each license key - count all leads for users who used this key
  allKeys = await Promise.all(
    allKeys.map(async (key) => {
      // Find all RSVPs that used this license key
      const rsvpsWithKey = await RsvpModel.find({
        eventLicenseKey: key.key,
        isDeleted: false,
      }).select("userId");

      const userIds = rsvpsWithKey.map((rsvp) => rsvp.userId);

      // Count leads created by these users in this event
      const leadCount = await LeadsModel.countDocuments({
        eventId: key.eventId,
        userId: { $in: userIds },
        isDeleted: false,
      });

      return {
        ...key,
        leadCount: leadCount,
      };
    })
  );

  // Pagination
  const total = allKeys.length;
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedKeys = allKeys.slice(startIndex, endIndex);

  return {
    licenseKeys: paginatedKeys,
    pagination: {
      total,
      page,
      pages: Math.ceil(total / limit),
      limit,
    },
  };
};

// Revoke event access for a team member
export const revokeEventAccess = async ( 
  teamManagerId: string,
  memberId: string,
  eventId: string
) => {
  
  // Verify team manager has access to this event
  const event = await EventModel.findOne({
    _id: eventId,
    "licenseKeys.teamManagerId": teamManagerId,
    isDeleted: false,
  });

  if (!event) {
    throw new Error("Event not found or you don't have access to manage this event");
  }

  // Find the RSVP for this member and event
  const rsvp = await RsvpModel.findOne({
    userId: new mongoose.Types.ObjectId(memberId),
    eventId: new mongoose.Types.ObjectId(eventId),
    isDeleted: false,
  });

  if (!rsvp) {
    throw new Error("RSVP not found for this member and event");
  }

  // Check if already revoked
  if (rsvp.isRevoked) {
    throw new Error("Access is already revoked for this member");
  }

  // Update RSVP to revoke access
  rsvp.isRevoked = true;
  rsvp.revokedBy = new mongoose.Types.ObjectId(teamManagerId);
  rsvp.revokedAt = new Date();
  await rsvp.save();

  return rsvp;
};

// Restore event access for a team member
export const restoreEventAccess = async (
  teamManagerId: string,
  memberId: string,
  eventId: string
) => {
  // Verify team manager has access to this event
  const event = await EventModel.findOne({
    _id: eventId,
    "licenseKeys.teamManagerId": teamManagerId,
    isDeleted: false,
  });

  if (!event) {
    throw new Error("Event not found or you don't have access to manage this event");
  }

  // Find the RSVP for this member and event
  const rsvp = await RsvpModel.findOne({
    userId: new mongoose.Types.ObjectId(memberId),
    eventId: new mongoose.Types.ObjectId(eventId),
    isDeleted: false,
  });

  if (!rsvp) {
    throw new Error("RSVP not found for this member and event");
  }

  // Check if not revoked
  if (!rsvp.isRevoked) {
    throw new Error("Access is not revoked for this member");
  }

  // Update RSVP to restore access
  rsvp.isRevoked = false;
  rsvp.revokedBy = undefined;
  rsvp.revokedAt = undefined;
  await rsvp.save();

  return rsvp;
};

// Get team member's events with revocation status
export const getTeamMemberEvents = async (
  teamManagerId: string,
  memberId: string
) => {
  // Get all events managed by this team manager
  const managedEvents = await EventModel.find({
    "licenseKeys.teamManagerId": teamManagerId,
    isDeleted: false,
  }).select("_id");

  const managedEventIds = managedEvents.map((e) => e._id);

  if (managedEventIds.length === 0) {
    return [];
  }

  // Get RSVPs for this member in managed events
  const rsvps = await RsvpModel.find({
    userId: new mongoose.Types.ObjectId(memberId),
    eventId: { $in: managedEventIds },
    isDeleted: false,
  })
    .populate("eventId", "eventName description startDate endDate isActive")
    .populate("revokedBy", "firstName lastName email")
    .populate("meetingPermissionRevokedBy", "firstName lastName email")
    .populate("calendarPermissionGrantedBy", "firstName lastName email")
    .lean();

  // Format the response
  const memberEvents = rsvps.map((rsvp: any) => ({
    _id: rsvp.eventId._id,
    eventName: rsvp.eventId.eventName,
    description: rsvp.eventId.description,
    startDate: rsvp.eventId.startDate,
    endDate: rsvp.eventId.endDate,
    isActive: rsvp.eventId.isActive,
    isRevoked: rsvp.isRevoked,
    revokedAt: rsvp.revokedAt,
    revokedBy: rsvp.revokedBy
      ? {
        _id: rsvp.revokedBy._id,
        firstName: rsvp.revokedBy.firstName,
        lastName: rsvp.revokedBy.lastName,
        email: rsvp.revokedBy.email,
      }
      : null,
    licenseKey: rsvp.eventLicenseKey,
    // Meeting permission info
    canCreateMeeting: rsvp.canCreateMeeting ?? true,
    meetingPermissionRevokedAt: rsvp.meetingPermissionRevokedAt,
    meetingPermissionRevokedBy: rsvp.meetingPermissionRevokedBy
      ? {
        _id: rsvp.meetingPermissionRevokedBy._id,
        firstName: rsvp.meetingPermissionRevokedBy.firstName,
        lastName: rsvp.meetingPermissionRevokedBy.lastName,
        email: rsvp.meetingPermissionRevokedBy.email,
      }
      : null,
    // Calendar permission info
    canUseOwnCalendar: rsvp.canUseOwnCalendar ?? false,
    calendarPermissionGrantedAt: rsvp.calendarPermissionGrantedAt,
    calendarPermissionGrantedBy: rsvp.calendarPermissionGrantedBy
      ? {
        _id: rsvp.calendarPermissionGrantedBy._id,
        firstName: rsvp.calendarPermissionGrantedBy.firstName,
        lastName: rsvp.calendarPermissionGrantedBy.lastName,
        email: rsvp.calendarPermissionGrantedBy.email,
      }
      : null,
  }));

  return memberEvents;
};

// ==========================================
// MEETING PERMISSION MANAGEMENT
// ==========================================

// Revoke meeting permission for a SINGLE team member on an event
export const revokeMeetingPermission = async (
  teamManagerId: string,
  memberId: string,
  eventId: string
) => {
  // Verify team manager has access to this event
  const event = await EventModel.findOne({
    _id: eventId,
    "licenseKeys.teamManagerId": teamManagerId,
    isDeleted: false,
  });

  if (!event) {
    throw new Error("Event not found or you don't have access to manage this event");
  }

  // Find the RSVP for this member and event
  const rsvp = await RsvpModel.findOne({
    userId: new mongoose.Types.ObjectId(memberId),
    eventId: new mongoose.Types.ObjectId(eventId),
    isDeleted: false,
  });

  if (!rsvp) {
    throw new Error("RSVP not found for this member and event");
  }

  // Check if already revoked
  if (rsvp.canCreateMeeting === false) {
    throw new Error("Meeting permission is already revoked for this member");
  }

  // Update RSVP to revoke meeting permission
  rsvp.canCreateMeeting = false;
  rsvp.meetingPermissionRevokedBy = new mongoose.Types.ObjectId(teamManagerId);
  rsvp.meetingPermissionRevokedAt = new Date();
  await rsvp.save();

  return rsvp;
};

// Restore meeting permission for a SINGLE team member on an event
export const restoreMeetingPermission = async (
  teamManagerId: string,
  memberId: string,
  eventId: string
) => {
  // Verify team manager has access to this event
  const event = await EventModel.findOne({
    _id: eventId,
    "licenseKeys.teamManagerId": teamManagerId,
    isDeleted: false,
  });

  if (!event) {
    throw new Error("Event not found or you don't have access to manage this event");
  }

  // Find the RSVP for this member and event
  const rsvp = await RsvpModel.findOne({
    userId: new mongoose.Types.ObjectId(memberId),
    eventId: new mongoose.Types.ObjectId(eventId),
    isDeleted: false,
  });

  if (!rsvp) {
    throw new Error("RSVP not found for this member and event");
  }

  // Check if already has permission (explicitly true)
  // Note: canCreateMeeting could be false from bulk revoke OR individual revoke
  // Allow restore in both cases to grant individual exception
  if (rsvp.canCreateMeeting === true) {
    throw new Error("Meeting permission is already granted for this member");
  }

  // Update RSVP to restore meeting permission (this acts as individual exception after bulk revoke)
  rsvp.canCreateMeeting = true;
  rsvp.meetingPermissionRevokedBy = undefined;
  rsvp.meetingPermissionRevokedAt = undefined;
  await rsvp.save();

  return rsvp;
};

// Revoke meeting permission for ALL team members on a license key (bulk)
export const bulkRevokeMeetingPermissionByLicenseKey = async (
  teamManagerId: string,
  eventId: string,
  licenseKey: string
) => {
  // Verify team manager owns this license key
  const event = await EventModel.findOne({
    _id: eventId,
    "licenseKeys.key": licenseKey.toUpperCase(),
    "licenseKeys.teamManagerId": teamManagerId,
    isDeleted: false,
  });

  if (!event) {
    throw new Error("Event or license key not found, or you don't have access");
  }

  // Find the license key
  const licenseKeyObj = event.licenseKeys.find(
    (lk) => lk.key === licenseKey.toUpperCase() && 
    lk.teamManagerId?.toString() === teamManagerId
  );

  if (!licenseKeyObj) {
    throw new Error("License key not found or access denied");
  }

  // Update the license key's allowTeamMeetings flag
  await EventModel.updateOne(
    {
      _id: eventId,
      "licenseKeys.key": licenseKey.toUpperCase(),
    },
    {
      $set: {
        "licenseKeys.$.allowTeamMeetings": false,
        "licenseKeys.$.meetingPermissionUpdatedBy": new mongoose.Types.ObjectId(teamManagerId),
        "licenseKeys.$.meetingPermissionUpdatedAt": new Date(),
      },
    }
  );

  // Also bulk update all RSVPs for this license key
  const result = await RsvpModel.updateMany(
    {
      eventId: new mongoose.Types.ObjectId(eventId),
      eventLicenseKey: licenseKey.toUpperCase(),
      isDeleted: false,
      canCreateMeeting: { $ne: false },
    },
    {
      $set: {
        canCreateMeeting: false,
        meetingPermissionRevokedBy: new mongoose.Types.ObjectId(teamManagerId),
        meetingPermissionRevokedAt: new Date(),
      },
    }
  );

  return {
    modifiedCount: result.modifiedCount,
    licenseKey: licenseKey.toUpperCase(),
    message: `Meeting permission revoked for ${result.modifiedCount} team members under license key ${licenseKey.toUpperCase()}`,
  };
};

// Restore meeting permission for ALL team members on a license key (bulk)
export const bulkRestoreMeetingPermissionByLicenseKey = async (
  teamManagerId: string,
  eventId: string,
  licenseKey: string
) => {
  // Verify team manager owns this license key
  const event = await EventModel.findOne({
    _id: eventId,
    "licenseKeys.key": licenseKey.toUpperCase(),
    "licenseKeys.teamManagerId": teamManagerId,
    isDeleted: false,
  });

  if (!event) {
    throw new Error("Event or license key not found, or you don't have access");
  }

  // Find the license key
  const licenseKeyObj = event.licenseKeys.find(
    (lk) => lk.key === licenseKey.toUpperCase() && 
    lk.teamManagerId?.toString() === teamManagerId
  );

  if (!licenseKeyObj) {
    throw new Error("License key not found or access denied");
  }

  // Update the license key's allowTeamMeetings flag
  await EventModel.updateOne(
    {
      _id: eventId,
      "licenseKeys.key": licenseKey.toUpperCase(),
    },
    {
      $set: {
        "licenseKeys.$.allowTeamMeetings": true,
        "licenseKeys.$.meetingPermissionUpdatedBy": new mongoose.Types.ObjectId(teamManagerId),
        "licenseKeys.$.meetingPermissionUpdatedAt": new Date(),
      },
    }
  );

  // Also bulk update all RSVPs for this license key
  const result = await RsvpModel.updateMany(
    {
      eventId: new mongoose.Types.ObjectId(eventId),
      eventLicenseKey: licenseKey.toUpperCase(),
      isDeleted: false,
      canCreateMeeting: false,
    },
    {
      $set: {
        canCreateMeeting: true,
      },
      $unset: {
        meetingPermissionRevokedBy: "",
        meetingPermissionRevokedAt: "",
      },
    }
  );

  return {
    modifiedCount: result.modifiedCount,
    licenseKey: licenseKey.toUpperCase(),
    message: `Meeting permission restored for ${result.modifiedCount} team members under license key ${licenseKey.toUpperCase()}`,
  };
};

// Get license key meeting permission status
export const getLicenseKeyMeetingPermissionStatus = async (
  teamManagerId: string,
  eventId: string,
  licenseKey: string
) => {
  const event = await EventModel.findOne({
    _id: eventId,
    "licenseKeys.key": licenseKey.toUpperCase(),
    "licenseKeys.teamManagerId": teamManagerId,
    isDeleted: false,
  });

  if (!event) {
    throw new Error("Event or license key not found, or you don't have access");
  }

  const licenseKeyObj = event.licenseKeys.find(
    (lk) => lk.key === licenseKey.toUpperCase() && 
    lk.teamManagerId?.toString() === teamManagerId
  );

  if (!licenseKeyObj) {
    throw new Error("License key not found or access denied");
  }

  // Count team members with meeting permission revoked
  const totalMembers = await RsvpModel.countDocuments({
    eventId: new mongoose.Types.ObjectId(eventId),
    eventLicenseKey: licenseKey.toUpperCase(),
    isDeleted: false,
  });

  const revokedMembers = await RsvpModel.countDocuments({
    eventId: new mongoose.Types.ObjectId(eventId),
    eventLicenseKey: licenseKey.toUpperCase(),
    isDeleted: false,
    canCreateMeeting: false,
  });

  return {
    licenseKey: licenseKey.toUpperCase(),
    allowTeamMeetings: licenseKeyObj.allowTeamMeetings ?? true,
    totalMembers,
    revokedMembers,
    activeMembers: totalMembers - revokedMembers,
    meetingPermissionUpdatedAt: (licenseKeyObj as any).meetingPermissionUpdatedAt,
  };
};

/**
 * Grant calendar permission to a team member
 * Allows the member to connect and use their own Google/Outlook calendar
 */
export const grantCalendarPermission = async (
  teamManagerId: string,
  memberId: string,
  eventId: string
) => {
  // Verify team manager has access to this event
  const event = await EventModel.findOne({
    _id: eventId,
    "licenseKeys.teamManagerId": teamManagerId,
    isDeleted: false,
  });

  if (!event) {
    throw new Error("Event not found or you don't have team manager access");
  }

  // Find the RSVP for this member and event
  const rsvp = await RsvpModel.findOne({
    userId: memberId,
    eventId: eventId,
    isDeleted: false,
  });

  if (!rsvp) {
    throw new Error("RSVP not found for this member and event");
  }

  // Check if already granted
  if (rsvp.canUseOwnCalendar === true) {
    throw new Error("Calendar permission is already granted for this member");
  }

  // Update RSVP to grant calendar permission
  rsvp.canUseOwnCalendar = true;
  rsvp.calendarPermissionGrantedBy = new mongoose.Types.ObjectId(teamManagerId);
  rsvp.calendarPermissionGrantedAt = new Date();
  await rsvp.save();

  return rsvp;
};

/**
 * Revoke calendar permission from a team member
 * Member will no longer be able to use their own calendar, falls back to team manager's calendar
 */
export const revokeCalendarPermission = async (
  teamManagerId: string,
  memberId: string,
  eventId: string
) => {
  // Verify team manager has access to this event
  const event = await EventModel.findOne({
    _id: eventId,
    "licenseKeys.teamManagerId": teamManagerId,
    isDeleted: false,
  });

  if (!event) {
    throw new Error("Event not found or you don't have team manager access");
  }

  // Find the RSVP for this member and event
  const rsvp = await RsvpModel.findOne({
    userId: memberId,
    eventId: eventId,
    isDeleted: false,
  });

  if (!rsvp) {
    throw new Error("RSVP not found for this member and event");
  }

  // Check if already revoked
  if (rsvp.canUseOwnCalendar === false) {
    throw new Error("Calendar permission is already revoked for this member");
  }

  // Update RSVP to revoke calendar permission
  rsvp.canUseOwnCalendar = false;
  rsvp.calendarPermissionGrantedBy = undefined;
  rsvp.calendarPermissionGrantedAt = undefined;
  await rsvp.save();

  return rsvp;
};
