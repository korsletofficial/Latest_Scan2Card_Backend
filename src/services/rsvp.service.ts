import RsvpModel from "../models/rsvp.model";
import EventModel from "../models/event.model";
import UserModel from "../models/user.model";
import mongoose from "mongoose";

interface CreateRsvpData {
  userId: string;
  rsvpLicenseKey: string;
}

// Create RSVP by License Key
export const createRsvp = async (data: CreateRsvpData) => {
  const { userId, rsvpLicenseKey } = data;

  if (!rsvpLicenseKey) {
    throw new Error("License key is required");
  }

  // Find event with this license key
  const event = await EventModel.findOne({
    "licenseKeys.key": rsvpLicenseKey,
    isDeleted: false,
  });

  if (!event) {
    throw new Error("Invalid license key");
  }

  // Find the specific license key
  const licenseKey = event.licenseKeys.find((lk) => lk.key === rsvpLicenseKey);

  if (!licenseKey) {
    throw new Error("License key not found");
  }

  // Validate license key
  if (!licenseKey.isActive) {
    throw new Error("License key is inactive");
  }

  if (licenseKey.expiresAt && new Date(licenseKey.expiresAt) < new Date()) {
    throw new Error("License key has expired");
  }

  // Check if license key has available activations
  const remainingActivations = licenseKey.maxActivations - licenseKey.usedCount;
  if (remainingActivations <= 0) {
    throw new Error("License key has reached maximum activations");
  }

  // Check if user already has RSVP for this event
  const existingRsvp = await RsvpModel.findOne({
    eventId: event._id,
    userId: userId,
    isDeleted: false,
  });

  if (existingRsvp) {
    throw new Error("You have already registered for this event");
  }

  // Assign user to the team manager (owner) associated with the license key's email
  if (licenseKey.email) {
    const teamManager = await UserModel.findOne({ email: licenseKey.email });
    if (teamManager) {
      await UserModel.updateOne(
        { _id: userId },
        { exhibitorId: teamManager._id }
      );
    }
  }

  // Create RSVP
  const rsvp = await RsvpModel.create({
    eventId: event._id,
    userId: userId,
    eventLicenseKey: rsvpLicenseKey,
    expiresAt: licenseKey.expiresAt,
    status: 1,
    isActive: true,
    isDeleted: false,
  });

  // Increment usedCount for the license key
  await EventModel.updateOne(
    { _id: event._id, "licenseKeys.key": rsvpLicenseKey },
    { $inc: { "licenseKeys.$.usedCount": 1 } }
  );

  // Populate event and user details
  const populatedRsvp = await RsvpModel.findById(rsvp._id)
    .populate("eventId", "eventName type startDate endDate location")
    .populate("userId", "firstName lastName email");

  return populatedRsvp;
};

// Get User's RSVPs
export const getUserRsvps = async (
  userId: string,
  page: number = 1,
  limit: number = 10,
  search: string = '',
  isActive?: boolean
) => {
  const normalizedSearch = search?.trim() || "";

  // Check if user has any RSVPs
  const totalRsvps = await RsvpModel.countDocuments({
    userId: userId,
    isDeleted: false,
  });

  // If no RSVPs and user hasn't joined trial event, auto-join them
  if (totalRsvps === 0) {
    const user = await UserModel.findById(userId);

    if (user && !user.hasJoinedTrialEvent) {
      // Find trial event
      const trialEvent = await EventModel.findOne({
        isTrialEvent: true,
        isDeleted: false,
        isActive: true
      });

      if (trialEvent) {
        // Auto-create RSVP for trial event
        await RsvpModel.create({
          eventId: trialEvent._id,
          userId: userId,
          eventLicenseKey: '', // No key needed
          status: 1,
          isActive: true,
          isDeleted: false,
        });

        // Mark user as joined trial event
        await UserModel.updateOne(
          { _id: userId },
          { hasJoinedTrialEvent: true }
        );

        console.log(`✅ Auto-joined user ${userId} to trial event`);
      }
    }
  }

  // Build query for RSVPs
  const now = new Date();
  const rsvpQuery: any = {
    userId: userId,
    isDeleted: false,
  };

  // Filter by expiration status based on isActive parameter
  if (isActive === true) {
    // Return only non-expired RSVPs
    rsvpQuery.$or = [
      { expiresAt: { $exists: false } }, // No expiration (trial events)
      { expiresAt: null }, // No expiration
      { expiresAt: { $gte: now } }, // Not expired yet
    ];
  } else if (isActive === false) {
    // Return only expired RSVPs
    rsvpQuery.expiresAt = { $lt: now };
  }
  // If isActive is undefined, return all RSVPs (both expired and non-expired)

  // If search is provided, find matching event IDs first
  if (normalizedSearch) {
    const eventQuery: any = {
      isDeleted: false,
      $or: [
        { eventName: { $regex: normalizedSearch, $options: "i" } },
        { type: { $regex: normalizedSearch, $options: "i" } },
        { "location.venue": { $regex: normalizedSearch, $options: "i" } },
        { "location.city": { $regex: normalizedSearch, $options: "i" } },
      ],
    };

    const matchingEvents = await EventModel.find(eventQuery).select("_id");
    const eventIds = matchingEvents.map((event) => event._id);

    if (eventIds.length === 0) {
      return {
        rsvps: [],
        pagination: {
          total: 0,
          page,
          pages: 0,
          limit,
        },
      };
    }

    // Add event filter to RSVP query
    rsvpQuery.eventId = { $in: eventIds };
  }

  const rsvps = await RsvpModel.paginate(
    rsvpQuery,
    {
      page,
      limit,
      sort: { createdAt: -1 },
      populate: [
        {
          path: "eventId",
          select: "eventName type startDate endDate location isActive isTrialEvent licenseKeys",
        },
      ],
    }
  );

  // Add stallName to each RSVP by matching eventLicenseKey with event's licenseKeys
  const rsvpsWithStallName = rsvps.docs.map((rsvp) => {
    const rsvpObj: any = rsvp.toJSON();

    // Initialize stallName as empty string
    rsvpObj.stallName = '';

    // Find matching license key and extract stallName if license key exists
    if (rsvpObj.eventLicenseKey && rsvpObj.eventLicenseKey.trim() !== '' && rsvpObj.eventId?.licenseKeys) {
      const matchingLicenseKey = rsvpObj.eventId.licenseKeys.find(
        (lk: any) => lk.key === rsvpObj.eventLicenseKey
      );

      if (matchingLicenseKey) {
        rsvpObj.stallName = matchingLicenseKey.stallName || '';
      }
    }

    // Remove licenseKeys from response to avoid exposing all keys
    if (rsvpObj.eventId?.licenseKeys) {
      delete rsvpObj.eventId.licenseKeys;
    }

    return rsvpObj;
  });

  return {
    rsvps: rsvpsWithStallName,
    pagination: {
      total: rsvps.totalDocs,
      page: rsvps.page,
      pages: rsvps.totalPages,
      limit: rsvps.limit,
    },
  };
};

// Get Event RSVPs (For Exhibitors)
export const getEventRsvps = async (
  eventId: string,
  exhibitorId: string,
  page: number = 1,
  limit: number = 10
) => {
  // Verify event exists and belongs to exhibitor
  const event = await EventModel.findOne({
    _id: eventId,
    createdBy: exhibitorId,
    isDeleted: false,
  });

  if (!event) {
    throw new Error("Event not found or access denied");
  }

  const rsvps = await RsvpModel.paginate(
    {
      eventId: eventId,
      isDeleted: false,
    },
    {
      page,
      limit,
      sort: { createdAt: -1 },
      populate: [
        {
          path: "userId",
          select: "firstName lastName email phoneNumber",
        },
        {
          path: "addedBy",
          select: "firstName lastName email",
        },
      ],
    }
  );

  return {
    rsvps: rsvps.docs,
    pagination: {
      total: rsvps.totalDocs,
      page: rsvps.page,
      pages: rsvps.totalPages,
      limit: rsvps.limit,
    },
  };
};

// Cancel RSVP
export const cancelRsvp = async (rsvpId: string, userId: string) => {
  const rsvp = await RsvpModel.findOne({
    _id: rsvpId,
    userId: userId,
    isDeleted: false,
  });

  if (!rsvp) {
    throw new Error("RSVP not found");
  }

  // Soft delete the RSVP
  rsvp.isDeleted = true;
  rsvp.isActive = false;
  await rsvp.save();

  // Decrement usedCount for the license key
  if (rsvp.eventLicenseKey) {
    await EventModel.updateOne(
      { _id: rsvp.eventId, "licenseKeys.key": rsvp.eventLicenseKey },
      { $inc: { "licenseKeys.$.usedCount": -1 } }
    );
  }

  return { message: "RSVP cancelled successfully" };
};

// Get RSVP Details
export const getRsvpById = async (rsvpId: string, userId: string) => {
  const rsvp = await RsvpModel.findOne({
    _id: rsvpId,
    userId: userId,
    isDeleted: false,
  })
    .populate("eventId", "eventName type startDate endDate location description")
    .populate("userId", "firstName lastName email phoneNumber")
    .populate("addedBy", "firstName lastName email");

  if (!rsvp) {
    throw new Error("RSVP not found");
  }

  return rsvp;
};

// Validate License Key (Before Registration)
export const validateLicenseKey = async (licenseKey: string) => {
  if (!licenseKey) {
    throw new Error("License key is required");
  }

  // Find event with this license key
  const event = await EventModel.findOne({
    "licenseKeys.key": licenseKey,
    isDeleted: false,
  }).select("eventName type startDate endDate location licenseKeys");

  if (!event) {
    throw new Error("Invalid license key");
  }

  const lk = event.licenseKeys.find((k) => k.key === licenseKey);

  if (!lk) {
    throw new Error("License key not found");
  }

  // Check validations
  const isExpired = lk.expiresAt && new Date(lk.expiresAt) < new Date();
  const remainingActivations = lk.maxActivations - lk.usedCount;
  const isMaxedOut = remainingActivations <= 0;
  const isValid = lk.isActive && !isExpired && !isMaxedOut;

  return {
    valid: isValid,
    event: {
      id: event._id,
      name: event.eventName,
      type: event.type,
      startDate: event.startDate,
      endDate: event.endDate,
      location: event.location,
    },
    licenseKey: {
      stallName: lk.stallName,
      isActive: lk.isActive,
      expiresAt: lk.expiresAt,
      remainingActivations: remainingActivations,
      isExpired,
      isMaxedOut,
    },
  };
};
