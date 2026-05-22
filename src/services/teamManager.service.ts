import MeetingModel from "../models/meeting.model";
import EventModel from "../models/event.model";
import UserModel from "../models/user.model";
import LeadsModel from "../models/leads.model";
import RoleModel from "../models/role.model";
import RsvpModel from "../models/rsvp.model";
import mongoose from "mongoose";
import { buildMonthSeries } from "../helpers/dateStats.helper";

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
  search: string = "",
  licenseKey: string = ""
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
      // If memberId is already set, intersect with license key users
      if (query.userId) {
        query.userId = { $in: userIds.filter((id) => id.toString() === query.userId) };
      } else {
        query.userId = { $in: userIds };
      }
    } else {
      // No users found with this license key, return empty
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
  }

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

  // Only count members and leads for THIS TM's specific keys (events can have multiple TMs)
  const myKeyStrings = licenseKeys.map((k) => k.key);

  // Count members: unique users who joined using THIS TM's keys (excluding exited users)
  const teamMembersResult = await RsvpModel.aggregate([
    {
      $match: {
        eventId: { $in: managedEventIds },
        eventLicenseKey: { $in: myKeyStrings },
        isDeleted: false,
        hasExited: { $ne: true },
      },
    },
    { $group: { _id: "$userId" } },
    { $count: "uniqueUsers" },
  ]);
  const totalMembers = teamMembersResult.length > 0 ? teamMembersResult[0].uniqueUsers : 0;

  // Fetch member IDs to scope lead count to only THIS TM's members
  const memberRsvps = await RsvpModel.find({
    eventId: { $in: managedEventIds },
    eventLicenseKey: { $in: myKeyStrings },
    isDeleted: false,
    hasExited: { $ne: true },
  }).select("userId eventLicenseKey eventId").lean();
  const memberIds = [...new Set(memberRsvps.map((r: any) => r.userId.toString()))].map(
    (id) => new mongoose.Types.ObjectId(id)
  );

  // Build key → user set + event map for live per-key lead counts
  const keyUserMap = new Map<string, Set<string>>();
  const keyEventIdMap = new Map<string, string>();
  for (const rsvp of memberRsvps as any[]) {
    const k = rsvp.eventLicenseKey as string;
    if (!keyUserMap.has(k)) keyUserMap.set(k, new Set());
    keyUserMap.get(k)!.add(rsvp.userId.toString());
    if (!keyEventIdMap.has(k)) keyEventIdMap.set(k, rsvp.eventId.toString());
  }

  const liveLeadCountRows: { _id: { userId: string; eventId: string }; count: number }[] =
    memberIds.length > 0
      ? await LeadsModel.aggregate([
          {
            $match: {
              eventId: { $in: managedEventIds },
              userId: { $in: memberIds },
              isDeleted: false,
            },
          },
          {
            $group: {
              _id: {
                userId: { $toString: "$userId" },
                eventId: { $toString: "$eventId" },
              },
              count: { $sum: 1 },
            },
          },
        ])
      : [];

  const liveLeadCountMap = new Map<string, number>();
  for (const row of liveLeadCountRows) {
    liveLeadCountMap.set(`${row._id.userId}:${row._id.eventId}`, row.count);
  }

  const getLiveLeadCountByKey = (keyStr: string): number => {
    const users = keyUserMap.get(keyStr) ?? new Set();
    const eid = keyEventIdMap.get(keyStr) ?? "";
    let total = 0;
    for (const uid of users) total += liveLeadCountMap.get(`${uid}:${eid}`) ?? 0;
    return total;
  };

  // Count total leads scanned only by THIS TM's members in their events
  const totalLeads = memberIds.length > 0
    ? await LeadsModel.countDocuments({
        eventId: { $in: managedEventIds },
        userId: { $in: memberIds },
        isDeleted: false,
      })
    : 0;

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
      maxLeads: key.maxLeads ?? 10000,
      currentLeadCount: getLiveLeadCountByKey(key.key),
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

  // Get this TM's key strings for this specific event
  const myTMKeyStrings = event.licenseKeys
    .filter((k) => k.teamManagerId?.toString() === teamManagerId)
    .map((k) => k.key);

  // Get member IDs scoped to TM's keys (excluding exited)
  const graphMemberRsvps = await RsvpModel.find({
    eventId: new mongoose.Types.ObjectId(eventId),
    eventLicenseKey: { $in: myTMKeyStrings },
    isDeleted: false,
    hasExited: { $ne: true },
  }).select("userId").lean();

  const graphMemberIds = [...new Set(graphMemberRsvps.map((r: any) => r.userId.toString()))].map(
    (id) => new mongoose.Types.ObjectId(id)
  );

  // Get actual lead counts (scoped to TM's members only)
  const leadsData = graphMemberIds.length > 0
    ? await LeadsModel.aggregate([
        {
          $match: {
            eventId: new mongoose.Types.ObjectId(eventId),
            userId: { $in: graphMemberIds },
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
      ])
    : [];

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
        maxLeads: key.maxLeads ?? 10000,
        currentLeadCount: key.currentLeadCount ?? 0,
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
        maxLeads: key.maxLeads ?? 10000,
        currentLeadCount: key.currentLeadCount ?? 0,
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

/**
 * Get license key usage details - shows who is using the license key and their lead counts
 */
export const getLicenseKeyUsageDetails = async (
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

  // Find the license key details
  const licenseKeyObj = event.licenseKeys.find(
    (lk) =>
      lk.key === licenseKey.toUpperCase() &&
      lk.teamManagerId?.toString() === teamManagerId
  );

  if (!licenseKeyObj) {
    throw new Error("License key not found or access denied");
  }

  // Find all RSVPs that used this license key
  const rsvps = await RsvpModel.find({
    eventId: new mongoose.Types.ObjectId(eventId),
    eventLicenseKey: licenseKey.toUpperCase(),
    isDeleted: false,
  }).select("userId createdAt");

  if (rsvps.length === 0) {
    return {
      licenseKey: licenseKey.toUpperCase(),
      eventId,
      eventName: event.eventName,
      stallName: licenseKeyObj.stallName,
      totalUsers: 0,
      totalLeads: 0,
      users: [],
    };
  }

  const userIds = rsvps.map((rsvp) => rsvp.userId);

  // Get user details
  const users = await UserModel.find({
    _id: { $in: userIds },
  }).select("firstName lastName email phoneNumber isActive isDeleted createdAt");

  // Create a map for quick RSVP lookup
  const rsvpMap = new Map(
    rsvps.map((rsvp) => [rsvp.userId.toString(), rsvp])
  );

  // Get lead count for each user in this event
  const usersWithLeads = await Promise.all(
    users.map(async (user) => {
      const leadCount = await LeadsModel.countDocuments({
        userId: user._id,
        eventId: new mongoose.Types.ObjectId(eventId),
        isDeleted: false,
      });

      const rsvp = rsvpMap.get(user._id.toString());

      return {
        _id: user._id,
        firstName: user.isDeleted ? "Scan2Card" : user.firstName,
        lastName: user.isDeleted ? "User" : user.lastName,
        email: user.isDeleted ? "deleted@user.com" : user.email,
        phoneNumber: user.isDeleted ? null : user.phoneNumber,
        isActive: user.isActive,
        isDeleted: user.isDeleted,
        leadCount,
        joinedAt: rsvp?.createdAt || user.createdAt,
      };
    })
  );

  // Sort by lead count descending
  usersWithLeads.sort((a, b) => b.leadCount - a.leadCount);

  // Calculate total leads
  const totalLeads = usersWithLeads.reduce((sum, user) => sum + user.leadCount, 0);

  return {
    licenseKey: licenseKey.toUpperCase(),
    eventId,
    eventName: event.eventName,
    stallName: licenseKeyObj.stallName,
    expiresAt: licenseKeyObj.expiresAt,
    usedCount: licenseKeyObj.usedCount,
    maxActivations: licenseKeyObj.maxActivations,
    totalUsers: usersWithLeads.length,
    totalLeads,
    users: usersWithLeads,
  };
};

// Compute ROI label from a 0–1 utilization score
const computeROILabel = (score: number): "High" | "Medium" | "Low" => {
  if (score >= 0.7) return "High";
  if (score >= 0.3) return "Medium";
  return "Low";
};

// Get Month-over-Month lead growth for team manager across managed events + member breakdown
export const getLeadsMoMGrowth = async (
  teamManagerId: string,
  months: number = 12
) => {
  // Step 1: Get all events managed by this team manager (include licenseKeys for key scoping)
  const managedEvents = await EventModel.find({
    "licenseKeys.teamManagerId": teamManagerId,
    isDeleted: false,
  }).select("_id eventName licenseKeys");

  if (managedEvents.length === 0) {
    const trends = buildEmptyTMMonthTrends(months);
    return {
      trends,
      summary: {
        totalInPeriod: 0,
        currentMonthCount: 0,
        previousMonthCount: 0,
        momChangeAbsolute: 0,
        momChangePercent: null,
      },
    };
  }

  const eventIds = managedEvents.map((e) => e._id);
  const eventNameMap = new Map(
    managedEvents.map((e) => [e._id.toString(), e.eventName])
  );

  // Extract only THIS TM's key strings across all managed events
  const myKeyStrings: string[] = [];
  for (const ev of managedEvents) {
    for (const k of ev.licenseKeys) {
      if (k.teamManagerId?.toString() === teamManagerId) myKeyStrings.push(k.key);
    }
  }

  // Step 2: Get member IDs scoped to THIS TM's keys, excluding exited users
  const memberRsvps = await RsvpModel.aggregate([
    {
      $match: {
        eventId: { $in: eventIds },
        eventLicenseKey: { $in: myKeyStrings },
        isDeleted: false,
        hasExited: { $ne: true },
      },
    },
    { $group: { _id: "$userId" } },
  ]);
  const memberIds = memberRsvps.map((r) => r._id);

  // Step 3: Fetch member names for breakdown labels
  const members = await UserModel.find({ _id: { $in: memberIds } }).select(
    "_id firstName lastName email"
  );
  const memberNameMap = new Map(
    members.map((m) => [
      m._id.toString(),
      { name: `${m.firstName} ${m.lastName}`.trim() || "Unknown", email: m.email },
    ])
  );

  // Step 4: Define month window
  const windowStart = new Date();
  windowStart.setMonth(windowStart.getMonth() - (months - 1));
  windowStart.setDate(1);
  windowStart.setHours(0, 0, 0, 0);

  // Step 5: Aggregate leads by {month, eventId} — scoped to this TM's members so
  // event totals are consistent with memberBreakdown totals
  const byEvent = await LeadsModel.aggregate([
    {
      $match: {
        eventId: { $in: eventIds },
        userId: { $in: memberIds },
        isDeleted: false,
        createdAt: { $gte: windowStart },
      },
    },
    {
      $group: {
        _id: {
          month: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          eventId: "$eventId",
        },
        leadCount: { $sum: 1 },
      },
    },
    { $sort: { "_id.month": 1 } },
  ]);

  // Step 6: Aggregate leads by {month, userId} → member breakdown
  const byMember = await LeadsModel.aggregate([
    {
      $match: {
        eventId: { $in: eventIds },
        userId: { $in: memberIds },
        isDeleted: false,
        createdAt: { $gte: windowStart },
      },
    },
    {
      $group: {
        _id: {
          month: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          userId: "$userId",
        },
        leadCount: { $sum: 1 },
      },
    },
    { $sort: { "_id.month": 1 } },
  ]);

  // Step 7: Build month series and bucket aggregation results
  const monthSeries = buildMonthSeries(months);
  const monthlyTotals = new Map<string, number>();
  const monthlyEventBreakdown = new Map<string, Map<string, number>>();
  const monthlyMemberBreakdown = new Map<string, Map<string, number>>();

  for (const m of monthSeries) {
    monthlyTotals.set(m, 0);
    monthlyEventBreakdown.set(m, new Map());
    monthlyMemberBreakdown.set(m, new Map());
  }

  for (const row of byEvent) {
    const month: string = row._id.month;
    if (!monthlyTotals.has(month)) continue;
    const eventId: string = row._id.eventId.toString();
    monthlyTotals.set(month, (monthlyTotals.get(month) ?? 0) + row.leadCount);
    const evMap = monthlyEventBreakdown.get(month)!;
    evMap.set(eventId, (evMap.get(eventId) ?? 0) + row.leadCount);
  }

  for (const row of byMember) {
    const month: string = row._id.month;
    if (!monthlyMemberBreakdown.has(month)) continue;
    const userId: string = row._id.userId.toString();
    const memMap = monthlyMemberBreakdown.get(month)!;
    memMap.set(userId, (memMap.get(userId) ?? 0) + row.leadCount);
  }

  // Step 8: Build trend array with MoM delta + both breakdowns
  const trends = monthSeries.map((month, idx) => {
    const count = monthlyTotals.get(month) ?? 0;
    const prevCount = idx > 0 ? (monthlyTotals.get(monthSeries[idx - 1]) ?? 0) : null;

    let momChangeAbsolute: number | null = null;
    let momChangePercent: number | null = null;

    if (prevCount !== null) {
      momChangeAbsolute = count - prevCount;
      if (prevCount > 0) {
        momChangePercent = parseFloat(
          (((count - prevCount) / prevCount) * 100).toFixed(2)
        );
      }
    }

    const eventBreakdown = Array.from(
      (monthlyEventBreakdown.get(month) ?? new Map()).entries()
    )
      .map(([eventId, leadCount]) => ({
        eventId,
        eventName: eventNameMap.get(eventId) ?? "Unknown Event",
        leadCount,
      }))
      .sort((a, b) => b.leadCount - a.leadCount);

    const memberBreakdown = Array.from(
      (monthlyMemberBreakdown.get(month) ?? new Map()).entries()
    )
      .map(([userId, leadCount]) => {
        const info = memberNameMap.get(userId);
        return {
          userId,
          memberName: info?.name ?? "Unknown Member",
          email: info?.email ?? "",
          leadCount,
        };
      })
      .sort((a, b) => b.leadCount - a.leadCount);

    return { month, count, momChangeAbsolute, momChangePercent, eventBreakdown, memberBreakdown };
  });

  // Step 9: Summary using last two complete months
  const currentMonthCount = trends[trends.length - 1]?.count ?? 0;
  const previousMonthCount = trends[trends.length - 2]?.count ?? 0;
  const totalInPeriod = trends.reduce((sum, t) => sum + t.count, 0);

  let summaryMomChangePercent: number | null = null;
  if (previousMonthCount > 0) {
    summaryMomChangePercent = parseFloat(
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
      momChangePercent: summaryMomChangePercent,
    },
  };
};

function buildEmptyTMMonthTrends(months: number) {
  return buildMonthSeries(months).map((month, idx) => ({
    month,
    count: 0,
    momChangeAbsolute: idx > 0 ? 0 : null,
    momChangePercent: null,
    eventBreakdown: [],
    memberBreakdown: [],
  }));
}

export const getLicenseROIPerTeamManager = async (teamManagerId: string) => {
  const events = await EventModel.find({
    "licenseKeys.teamManagerId": teamManagerId,
    isDeleted: false,
  }).select("_id eventName startDate endDate licenseKeys");

  const now = new Date();

  // Collect TM's key strings and event IDs for live lead count queries
  const roiKeyStrings: string[] = [];
  const roiEventIds: mongoose.Types.ObjectId[] = [];
  for (const ev of events) {
    for (const k of ev.licenseKeys) {
      if (k.teamManagerId?.toString() === teamManagerId) {
        roiKeyStrings.push(k.key);
        roiEventIds.push(ev._id as mongoose.Types.ObjectId);
      }
    }
  }

  // Fetch RSVPs for TM's keys (excluding exited) to map key → active user IDs
  const roiRsvps = roiKeyStrings.length > 0
    ? await RsvpModel.find({
        eventId: { $in: roiEventIds },
        eventLicenseKey: { $in: roiKeyStrings },
        isDeleted: false,
        hasExited: { $ne: true },
      }).select("userId eventId eventLicenseKey").lean()
    : [];

  // "licenseKey:eventId" → Set<userId>
  const roiKeyUserMap = new Map<string, Set<string>>();
  for (const rsvp of roiRsvps as any[]) {
    const mapKey = `${rsvp.eventLicenseKey}:${rsvp.eventId.toString()}`;
    if (!roiKeyUserMap.has(mapKey)) roiKeyUserMap.set(mapKey, new Set());
    roiKeyUserMap.get(mapKey)!.add(rsvp.userId.toString());
  }

  // Batch-aggregate live lead counts by (userId, eventId)
  const roiMemberIds = [...new Set((roiRsvps as any[]).map((r) => r.userId.toString()))].map(
    (id) => new mongoose.Types.ObjectId(id)
  );

  const roiLeadCountRows: { _id: { userId: string; eventId: string }; count: number }[] =
    roiMemberIds.length > 0
      ? await LeadsModel.aggregate([
          {
            $match: {
              userId: { $in: roiMemberIds },
              eventId: { $in: roiEventIds },
              isDeleted: false,
            },
          },
          {
            $group: {
              _id: {
                userId: { $toString: "$userId" },
                eventId: { $toString: "$eventId" },
              },
              count: { $sum: 1 },
            },
          },
        ])
      : [];

  const roiLeadCountMap = new Map<string, number>();
  for (const row of roiLeadCountRows) {
    roiLeadCountMap.set(`${row._id.userId}:${row._id.eventId}`, row.count);
  }

  const getLiveROILeadCount = (licenseKey: string, eventId: string): number => {
    const users = roiKeyUserMap.get(`${licenseKey}:${eventId}`) ?? new Set();
    let total = 0;
    for (const uid of users) total += roiLeadCountMap.get(`${uid}:${eventId}`) ?? 0;
    return total;
  };

  let totalLeadsGenerated = 0;
  let totalLeadsCapacity = 0;
  let totalActivationsUsed = 0;
  let totalActivationsCapacity = 0;

  const licenseKeyROI = events.flatMap((event) => {
    const myKeys = event.licenseKeys.filter(
      (k) => k.teamManagerId?.toString() === teamManagerId
    );

    return myKeys.map((key) => {
      const maxLeads = key.maxLeads ?? 10000;
      const liveLeadCount = getLiveROILeadCount(key.key, event._id.toString());
      const maxActivations = key.maxActivations ?? 1;
      const usedCount = key.usedCount ?? 0;

      const leadUtilization = maxLeads > 0 ? liveLeadCount / maxLeads : 0;
      const activationUtilization = maxActivations > 0 ? usedCount / maxActivations : 0;
      const roiScore = leadUtilization * 0.7 + activationUtilization * 0.3;
      const roiIndicator = computeROILabel(roiScore);

      totalLeadsGenerated += liveLeadCount;
      totalLeadsCapacity += maxLeads;
      totalActivationsUsed += usedCount;
      totalActivationsCapacity += maxActivations;

      return {
        licenseKey: key.key,
        stallName: key.stallName ?? null,
        email: key.email,
        eventId: event._id,
        eventName: event.eventName,
        isExpired: new Date(key.expiresAt) < now,
        expiresAt: key.expiresAt,
        isActive: key.isActive,
        currentLeadCount: liveLeadCount,
        maxLeads,
        leadUtilizationPct: Math.round(leadUtilization * 100),
        usedCount,
        maxActivations,
        activationUtilizationPct: Math.round(activationUtilization * 100),
        roiScore: Math.round(roiScore * 100),
        roiIndicator,
      };
    });
  });

  // Sort: High first, then Medium, then Low; within same tier sort by roiScore desc
  const order: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
  licenseKeyROI.sort(
    (a, b) =>
      order[a.roiIndicator] - order[b.roiIndicator] ||
      b.roiScore - a.roiScore
  );

  const overallLeadUtilization =
    totalLeadsCapacity > 0 ? totalLeadsGenerated / totalLeadsCapacity : 0;
  const overallActivationUtilization =
    totalActivationsCapacity > 0
      ? totalActivationsUsed / totalActivationsCapacity
      : 0;
  const overallScore =
    overallLeadUtilization * 0.7 + overallActivationUtilization * 0.3;

  const highCount = licenseKeyROI.filter((k) => k.roiIndicator === "High").length;
  const mediumCount = licenseKeyROI.filter((k) => k.roiIndicator === "Medium").length;
  const lowCount = licenseKeyROI.filter((k) => k.roiIndicator === "Low").length;

  return {
    summary: {
      totalLicenseKeys: licenseKeyROI.length,
      totalLeadsGenerated,
      totalLeadsCapacity,
      totalActivationsUsed,
      totalActivationsCapacity,
      overallLeadUtilizationPct: Math.round(overallLeadUtilization * 100),
      overallActivationUtilizationPct: Math.round(overallActivationUtilization * 100),
      overallROIScore: Math.round(overallScore * 100),
      overallROIIndicator: computeROILabel(overallScore),
      breakdown: { high: highCount, medium: mediumCount, low: lowCount },
    },
    licenseKeys: licenseKeyROI,
  };
};

// ─────────────────────────────────────────────
// NEW ANALYTICS
// ─────────────────────────────────────────────

// Helper: get managed event IDs + license keys for a team manager
const getManagedContext = async (teamManagerId: string) => {
  const events = await EventModel.find({
    "licenseKeys.teamManagerId": teamManagerId,
    isDeleted: false,
  }).lean();

  const managedEventIds = events.map((e: any) => e._id);
  const myKeys: any[] = [];
  for (const ev of events) {
    for (const key of (ev as any).licenseKeys) {
      if (key.teamManagerId?.toString() === teamManagerId) {
        myKeys.push({ ...key, eventId: (ev as any)._id, eventName: (ev as any).eventName });
      }
    }
  }

  // Get team members via RSVPs using managed event IDs and license keys
  const myKeyStrings = myKeys.map((k) => k.key);
  const rsvps = await RsvpModel.find({
    eventId: { $in: managedEventIds },
    eventLicenseKey: { $in: myKeyStrings },
    isDeleted: false,
    isRevoked: false,
    hasExited: { $ne: true },
  }).select("userId eventId eventLicenseKey createdAt").lean();

  const memberIdSet = new Set(rsvps.map((r: any) => r.userId.toString()));
  const memberIds = [...memberIdSet].map((id) => new mongoose.Types.ObjectId(id));

  return { events, managedEventIds, myKeys, rsvps, memberIds };
};

// 2. Active vs Inactive Members Today
export const getActiveMembersToday = async (teamManagerId: string, eventId?: string) => {
  const { managedEventIds, memberIds, rsvps } = await getManagedContext(teamManagerId);
  if (!managedEventIds.length || !memberIds.length) {
    return { activeToday: 0, inactiveToday: 0, hotLastHour: 0, members: [] };
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const oneHourAgo = new Date(now.getTime() - 3600000);

  const leadMatchBase: any = {
    userId: { $in: memberIds },
    isDeleted: false,
  };
  if (eventId) {
    leadMatchBase.eventId = new mongoose.Types.ObjectId(eventId);
  } else {
    leadMatchBase.eventId = { $in: managedEventIds };
  }

  const recentLeads = await LeadsModel.find({
    ...leadMatchBase,
    createdAt: { $gte: todayStart },
  }).select("userId createdAt").lean();

  const leadsToday = new Map<string, Date>();
  for (const lead of recentLeads) {
    const uid = (lead as any).userId.toString();
    const existing = leadsToday.get(uid);
    if (!existing || new Date((lead as any).createdAt) > existing) {
      leadsToday.set(uid, new Date((lead as any).createdAt));
    }
  }

  const allMembers = await UserModel.find({ _id: { $in: memberIds }, isDeleted: false })
    .select("_id firstName lastName email")
    .lean();

  const memberResults = allMembers.map((m: any) => {
    const lastToday = leadsToday.get(m._id.toString());
    return {
      userId: m._id,
      firstName: m.firstName,
      lastName: m.lastName,
      email: m.email,
      isActiveToday: !!lastToday,
      isHotLastHour: lastToday ? lastToday >= oneHourAgo : false,
      leadsToday: recentLeads.filter((l: any) => l.userId.toString() === m._id.toString()).length,
      lastActivityAt: lastToday ?? null,
    };
  });

  return {
    activeToday: memberResults.filter((m) => m.isActiveToday).length,
    inactiveToday: memberResults.filter((m) => !m.isActiveToday).length,
    hotLastHour: memberResults.filter((m) => m.isHotLastHour).length,
    members: memberResults.sort((a, b) => (b.leadsToday ?? 0) - (a.leadsToday ?? 0)),
  };
};

// 3. Meeting Outcome Analytics
const emptyMeetingOverall = () => ({
  totalMeetings: 0,
  completionRate: 0,
  avgHoursLeadToMeeting: 0,
  byStatus: { scheduled: 0, completed: 0, cancelled: 0, rescheduled: 0 },
});

export const getMeetingOutcomeAnalytics = async (teamManagerId: string) => {
  const { managedEventIds, memberIds } = await getManagedContext(teamManagerId);
  if (!managedEventIds.length || !memberIds.length) {
    return { overall: emptyMeetingOverall(), perMember: [] };
  }

  const allLeads = await LeadsModel.find({
    eventId: { $in: managedEventIds },
    userId: { $in: memberIds },
    isDeleted: false,
  }).select("_id userId createdAt").lean();

  const leadIds = allLeads.map((l: any) => l._id);
  const leadCreatedMap = new Map(allLeads.map((l: any) => [l._id.toString(), l.createdAt]));

  if (!leadIds.length) return { overall: emptyMeetingOverall(), perMember: [] };

  const meetings = await MeetingModel.find({
    leadId: { $in: leadIds },
    isDeleted: false,
  }).select("leadId userId meetingStatus createdAt").lean();

  const statusCount: Record<string, number> = {
    scheduled: 0, completed: 0, cancelled: 0, rescheduled: 0,
  };
  let totalTimeDiff = 0;
  let timeDiffCount = 0;

  const memberMeetingMap = new Map<string, { total: number; completed: number; cancelled: number }>();

  for (const m of meetings) {
    const s = (m as any).meetingStatus as string;
    if (s in statusCount) statusCount[s]++;

    const leadCreated = leadCreatedMap.get((m as any).leadId.toString());
    if (leadCreated) {
      const diff = (new Date((m as any).createdAt).getTime() - new Date(leadCreated).getTime()) / 3600000;
      if (diff >= 0) { totalTimeDiff += diff; timeDiffCount++; }
    }

    const uid = (m as any).userId.toString();
    if (!memberMeetingMap.has(uid)) memberMeetingMap.set(uid, { total: 0, completed: 0, cancelled: 0 });
    const entry = memberMeetingMap.get(uid)!;
    entry.total++;
    if (s === "completed") entry.completed++;
    if (s === "cancelled") entry.cancelled++;
  }

  const total = meetings.length;
  const completionRate =
    statusCount.completed + statusCount.cancelled > 0
      ? parseFloat(
          ((statusCount.completed / (statusCount.completed + statusCount.cancelled)) * 100).toFixed(2)
        )
      : 0;

  const memberUsers = await UserModel.find({ _id: { $in: memberIds }, isDeleted: false })
    .select("_id firstName lastName email")
    .lean();

  const perMember = memberUsers.map((u: any) => {
    const stats = memberMeetingMap.get(u._id.toString()) ?? { total: 0, completed: 0, cancelled: 0 };
    return {
      userId: u._id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      totalMeetings: stats.total,
      completed: stats.completed,
      cancelled: stats.cancelled,
      completionRate:
        stats.completed + stats.cancelled > 0
          ? parseFloat(((stats.completed / (stats.completed + stats.cancelled)) * 100).toFixed(2))
          : 0,
    };
  });

  return {
    overall: {
      totalMeetings: total,
      byStatus: statusCount,
      completionRate,
      avgHoursLeadToMeeting: timeDiffCount > 0 ? parseFloat((totalTimeDiff / timeDiffCount).toFixed(2)) : null,
    },
    perMember,
  };
};

// 4. Duplicate Leads Within Team
export const getDuplicateLeadsInTeam = async (teamManagerId: string, eventId?: string) => {
  const { managedEventIds, memberIds } = await getManagedContext(teamManagerId);
  if (!managedEventIds.length || !memberIds.length) {
    return { totalLeads: 0, duplicateGroups: 0, duplicateLeadCount: 0, duplicatePct: 0.0, groups: [] };
  }

  const leadMatch: any = {
    eventId: eventId ? new mongoose.Types.ObjectId(eventId) : { $in: managedEventIds },
    userId: { $in: memberIds },
    isDeleted: false,
  };

  const leads = await LeadsModel.find(leadMatch)
    .select("_id userId eventId details.emails details.phoneNumbers details.firstName details.lastName")
    .lean();

  const emailMap = new Map<string, any[]>();
  const phoneMap = new Map<string, any[]>();

  for (const lead of leads) {
    const d = (lead as any).details ?? {};
    for (const email of (d.emails ?? [])) {
      if (!email) continue;
      const key = email.toLowerCase();
      if (!emailMap.has(key)) emailMap.set(key, []);
      emailMap.get(key)!.push(lead);
    }
    for (const phone of (d.phoneNumbers ?? [])) {
      if (!phone) continue;
      if (!phoneMap.has(phone)) phoneMap.set(phone, []);
      phoneMap.get(phone)!.push(lead);
    }
  }

  const groups: any[] = [];
  const seenKeys = new Set<string>();

  const processMap = (map: Map<string, any[]>, contactType: "email" | "phone") => {
    for (const [contact, contactLeads] of map.entries()) {
      if (contactLeads.length < 2) continue;
      const uniqueUsers = new Set(contactLeads.map((l: any) => l.userId.toString()));
      if (uniqueUsers.size < 2) continue;
      const key = contactLeads.map((l: any) => l._id.toString()).sort().join(",");
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      groups.push({
        contactType,
        contact,
        count: contactLeads.length,
        capturedBy: contactLeads.map((l: any) => ({
          leadId: l._id,
          userId: l.userId,
          eventId: l.eventId,
          name: `${l.details?.firstName ?? ""} ${l.details?.lastName ?? ""}`.trim(),
        })),
      });
    }
  };

  processMap(emailMap, "email");
  processMap(phoneMap, "phone");

  const duplicateLeadCount = new Set(
    groups.flatMap((g) => g.capturedBy.map((l: any) => l.leadId.toString()))
  ).size;

  return {
    totalLeads: leads.length,
    duplicateGroups: groups.length,
    duplicateLeadCount,
    duplicatePct: leads.length > 0 ? parseFloat(((duplicateLeadCount / leads.length) * 100).toFixed(2)) : 0,
    groups,
  };
};

// 5. Stall Underperformance Alerts
export const getStallUnderperformanceAlerts = async (teamManagerId: string) => {
  const { events, myKeys, rsvps } = await getManagedContext(teamManagerId);
  const now = new Date();

  // Build a live lead count per (licenseKey, eventId) by querying LeadsModel directly.
  // key.currentLeadCount is a denormalized cache on the Event doc and can be stale.
  // RSVPs link a userId to a licenseKey+eventId, so we sum lead counts for all
  // users who activated each key.
  const keyUserMap = new Map<string, Set<string>>(); // "key:eventId" → Set<userId>
  for (const rsvp of rsvps) {
    const mapKey = `${rsvp.eventLicenseKey}:${(rsvp as any).eventId.toString()}`;
    if (!keyUserMap.has(mapKey)) keyUserMap.set(mapKey, new Set());
    keyUserMap.get(mapKey)!.add((rsvp as any).userId.toString());
  }

  // Collect all (userId, eventId) combos that matter, then batch-fetch counts.
  const allMemberIds = [...new Set(rsvps.map((r: any) => r.userId.toString()))].map(
    (id) => new mongoose.Types.ObjectId(id)
  );
  const activeEventIds = myKeys.map((k: any) => k.eventId);

  const leadCountRows: { _id: { userId: string; eventId: string }; count: number }[] =
    allMemberIds.length > 0
      ? await LeadsModel.aggregate([
          {
            $match: {
              userId: { $in: allMemberIds },
              eventId: { $in: activeEventIds },
              isDeleted: false,
            },
          },
          {
            $group: {
              _id: {
                userId: { $toString: "$userId" },
                eventId: { $toString: "$eventId" },
              },
              count: { $sum: 1 },
            },
          },
        ])
      : [];

  // Build lookup: "userId:eventId" → count
  const leadCountMap = new Map<string, number>();
  for (const row of leadCountRows) {
    leadCountMap.set(`${row._id.userId}:${row._id.eventId}`, row.count);
  }

  const getLiveLeadCount = (licenseKey: string, eventId: string): number => {
    const users = keyUserMap.get(`${licenseKey}:${eventId}`) ?? new Set();
    let total = 0;
    for (const uid of users) {
      total += leadCountMap.get(`${uid}:${eventId}`) ?? 0;
    }
    return total;
  };

  const alerts: any[] = [];

  for (const ev of events) {
    const startDate = new Date((ev as any).startDate);
    const endDate = new Date((ev as any).endDate);

    if (now < startDate || now > endDate) continue;

    const totalMs = endDate.getTime() - startDate.getTime();
    const elapsedMs = now.getTime() - startDate.getTime();
    const eventElapsedPct = totalMs > 0 ? parseFloat(((elapsedMs / totalMs) * 100).toFixed(2)) : 0;

    if (eventElapsedPct < 25) continue;

    const daysRemaining = Math.max(
      0,
      Math.floor((endDate.getTime() - now.getTime()) / 86400000)
    );

    const keysForEvent = myKeys.filter((k: any) => k.eventId.toString() === (ev as any)._id.toString());

    for (const key of keysForEvent) {
      const maxLeads = key.maxLeads ?? 10000;
      const currentLeadCount = getLiveLeadCount(key.key, key.eventId.toString());
      const utilizationPct = maxLeads > 0 ? parseFloat(((currentLeadCount / maxLeads) * 100).toFixed(2)) : 0;
      const expectedMinUtilizationPct = parseFloat((eventElapsedPct * 0.5).toFixed(2));

      if (utilizationPct < expectedMinUtilizationPct) {
        alerts.push({
          eventId: (ev as any)._id,
          eventName: (ev as any).eventName,
          key: key.key,
          stallName: key.stallName ?? key.key,
          email: key.email,
          eventElapsedPct,
          utilizationPct,
          expectedMinUtilizationPct,
          currentLeadCount,
          maxLeads,
          daysRemaining,
        });
      }
    }
  }

  alerts.sort((a, b) => a.utilizationPct - b.utilizationPct);

  return { totalAlerts: alerts.length, alerts };
};

// ─────────────────────────────────────────────
// END NEW ANALYTICS
// ─────────────────────────────────────────────
