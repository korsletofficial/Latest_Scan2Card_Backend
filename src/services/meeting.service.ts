import MeetingModel from "../models/meeting.model";
import LeadModel from "../models/leads.model";

interface CreateMeetingData {
  userId: string;
  leadId: string;
  eventId?: string;
  title: string;
  description?: string;
  meetingMode: string;
  startAt: Date;
  endAt: Date;
  location?: string;
  notifyAttendees?: boolean;
}

interface GetMeetingsFilter {
  userId: string;
  leadId?: string;
  eventId?: string;
  meetingStatus?: string;
  meetingMode?: string;
  page?: number;
  limit?: number;
}

interface UpdateMeetingData {
  title?: string;
  description?: string;
  meetingMode?: "online" | "offline" | "phone";
  meetingStatus?: "scheduled" | "completed" | "cancelled" | "rescheduled";
  startAt?: Date;
  endAt?: Date;
  location?: string;
  notifyAttendees?: boolean;
  isActive?: boolean;
}

// Create Meeting
export const createMeeting = async (data: CreateMeetingData) => {
  // Verify lead exists and belongs to user
  const lead = await LeadModel.findOne({
    _id: data.leadId,
    userId: data.userId,
    isDeleted: false,
  });

  if (!lead) {
    throw new Error("Lead not found or access denied");
  }

  const meeting = await MeetingModel.create({
    userId: data.userId,
    leadId: data.leadId,
    eventId: data.eventId,
    title: data.title,
    description: data.description,
    meetingMode: data.meetingMode,
    startAt: data.startAt,
    endAt: data.endAt,
    location: data.location,
    notifyAttendees: data.notifyAttendees || false,
  });

  await meeting.populate([
    {
      path: "leadId",
      select: "details.firstName details.lastName details.email"
    },
  ]);

  return meeting;
};

// Get All Meetings (with pagination and filters)
export const getMeetings = async (filter: GetMeetingsFilter) => {
  const {
    userId,
    leadId,
    eventId,
    meetingStatus,
    meetingMode,
    page = 1,
    limit = 10,
  } = filter;

  // Build filter query
  const query: any = { userId, isDeleted: false };

  if (leadId) {
    query.leadId = leadId;
  }

  if (eventId) {
    query.eventId = eventId;
  }

  if (meetingStatus) {
    query.meetingStatus = meetingStatus;
  }

  if (meetingMode) {
    query.meetingMode = meetingMode;
  }

  const options = {
    page: Number(page),
    limit: Number(limit),
    sort: { startAt: 1 }, // Ascending order (earliest first)
    populate: [
      {
        path: "leadId",
        select: "details.firstName details.lastName details.email"
      },
    ],
  };

  const meetings = await MeetingModel.paginate(query, options);

  return {
    meetings: meetings.docs,
    pagination: {
      total: meetings.totalDocs,
      page: meetings.page,
      limit: meetings.limit,
      totalPages: meetings.totalPages,
      hasNextPage: meetings.hasNextPage,
      hasPrevPage: meetings.hasPrevPage,
    },
  };
};

// Get Meeting by ID
export const getMeetingById = async (id: string, userId: string) => {
  const meeting = await MeetingModel.findOne({
    _id: id,
    userId,
    isDeleted: false,
  }).populate("leadId", "details.firstName details.lastName details.email");

  if (!meeting) {
    throw new Error("Meeting not found");
  }

  return meeting;
};

// Update Meeting
export const updateMeeting = async (
  id: string,
  userId: string,
  data: UpdateMeetingData
) => {
  const meeting = await MeetingModel.findOne({
    _id: id,
    userId,
    isDeleted: false,
  });

  if (!meeting) {
    throw new Error("Meeting not found");
  }

  // Update fields
  if (data.title !== undefined) meeting.title = data.title;
  if (data.description !== undefined) meeting.description = data.description;
  if (data.meetingMode !== undefined) meeting.meetingMode = data.meetingMode;
  if (data.meetingStatus !== undefined)
    meeting.meetingStatus = data.meetingStatus;
  if (data.startAt !== undefined) meeting.startAt = data.startAt;
  if (data.endAt !== undefined) meeting.endAt = data.endAt;
  if (data.location !== undefined) meeting.location = data.location;
  if (data.notifyAttendees !== undefined)
    meeting.notifyAttendees = data.notifyAttendees;
  if (typeof data.isActive === "boolean") meeting.isActive = data.isActive;

  await meeting.save();

  await meeting.populate([
    {
      path: "leadId",
      select: "details.firstName details.lastName details.email"
    },
  ]);

  return meeting;
};

// Delete Meeting (soft delete)
export const deleteMeeting = async (id: string, userId: string) => {
  const meeting = await MeetingModel.findOneAndUpdate(
    {
      _id: id,
      userId,
      isDeleted: false,
    },
    {
      isDeleted: true,
    },
    {
      new: false, // Return original document to check if it existed
    }
  );

  if (!meeting) {
    throw new Error("Meeting not found");
  }

  return { message: "Meeting deleted successfully" };
};
