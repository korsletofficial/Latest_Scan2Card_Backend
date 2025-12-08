import MeetingModel from "../models/meeting.model";
import EventModel from "../models/event.model";
import UserModel from "../models/user.model";
import LeadsModel from "../models/leads.model";
import RoleModel from "../models/role.model";
import mongoose from "mongoose";

// Get all meetings for team manager's team members
export const getTeamMeetings = async (teamManagerId: string) => {
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

  // Find all meetings for these leads and team members
  const meetings = await MeetingModel.find({
    leadId: { $in: leadIds },
    userId: { $in: teamMemberIds },
    isDeleted: false,
  })
    .select("_id userId leadId title meetingMode meetingStatus startAt endAt")
    .populate({
      path: "leadId",
      select: "details.firstName details.lastName details.email details.company eventId",
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
        email: meeting.leadId.details?.email || '',
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

  return formattedMeetings;
};

// Get all leads for manager
export const getAllLeadsForManager = async (
  teamManagerId: string,
  eventId?: string,
  memberId?: string
) => {
  // Find all events managed by this team manager
  const managedEvents = await EventModel.find({
    "licenseKeys.teamManagerId": teamManagerId,
    isDeleted: false,
  });
  const managedEventIds = managedEvents.map((e) => e._id.toString());

  if (managedEventIds.length === 0) {
    return [];
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

  const leads = await LeadsModel.find(query).sort({ createdAt: -1 });
  return leads;
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

  // Count team members (ENDUSERs under this team manager)
  const totalMembers = await UserModel.countDocuments({
    exhibitorId: teamManagerId,
    isDeleted: false,
  });

  // Count total leads scanned by team members for this team manager's events only
  const totalLeads = await LeadsModel.countDocuments({
    eventId: { $in: managedEventIds },
    isDeleted: false,
  });

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
  // Find all team members
  const teamManager = await UserModel.findById(teamManagerId);

  if (!teamManager) {
    throw new Error("Team manager not found");
  }

  const searchQuery: any = {
    exhibitorId: teamManager._id,
    isDeleted: false,
  };

  if (search) {
    searchQuery.$or = [
      { firstName: { $regex: search, $options: "i" } },
      { lastName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  // Exclude the team manager's own profile from the members list
  const members = await UserModel.find({
    ...searchQuery,
    _id: { $ne: teamManagerId },
  })
    .select("firstName lastName email phoneNumber isActive createdAt")
    .skip((page - 1) * limit)
    .limit(limit)
    .sort({ createdAt: -1 });

  const total = await UserModel.countDocuments(searchQuery);

  // Get all eventIds managed by this team manager
  const managedEvents = await EventModel.find({
    "licenseKeys.teamManagerId": teamManagerId,
    isDeleted: false,
  }).select("_id");
  const managedEventIds = managedEvents.map((e) => e._id);

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
    .select("eventName licenseKeys")
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
