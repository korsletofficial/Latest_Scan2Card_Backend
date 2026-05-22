import EventModel from "../models/event.model";
import LeadsModel from "../models/leads.model";
import TeamModel from "../models/team.model";
import UserModel from "../models/user.model";
import RoleModel from "../models/role.model";
import RsvpModel from "../models/rsvp.model";
import MeetingModel from "../models/meeting.model";
import mongoose from "mongoose";
import { customAlphabet } from "nanoid";
import bcrypt from "bcryptjs";
import { sendLicenseKeyEmail, sendEventUpdateEmail, sendLicenseKeyUpdateEmail } from "./email.service";
import { buildMonthSeries } from "../helpers/dateStats.helper";


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

// Helper function to generate unique license key (fixed 9 characters, alphanumeric only)
const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 9);
const generateLicenseKey = (): string => {
  return nanoid();
};

// Helper function to generate random password (8 characters with mix of letters, numbers, and special chars)
const generateRandomPassword = (): string => {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '@#$%&*!';

  // Ensure at least one of each type
  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];

  // Fill remaining 4 characters randomly from all
  const allChars = uppercase + lowercase + numbers + special;
  for (let i = 0; i < 4; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

// Helper function to validate license key restrictions
const validateLicenseKeyRestrictions = async (
  exhibitorId: string,
  numberOfKeys: number,
  totalActivationsNeeded: number
) => {
  const exhibitor = await UserModel.findById(exhibitorId);

  if (!exhibitor) {
    throw new Error("Exhibitor not found");
  }

  // Check max license keys restriction
  if (exhibitor.maxLicenseKeys !== undefined && exhibitor.maxLicenseKeys !== null) {
    const currentCount = exhibitor.currentLicenseKeyCount || 0;
    const newTotal = currentCount + numberOfKeys;

    if (newTotal > exhibitor.maxLicenseKeys) {
      throw new Error(
        `License key limit exceeded. You can create ${exhibitor.maxLicenseKeys} license keys in total. ` +
        `You have already created ${currentCount} keys and are trying to create ${numberOfKeys} more.`
      );
    }
  }

  // Check max total activations restriction
  if (exhibitor.maxTotalActivations !== undefined && exhibitor.maxTotalActivations !== null) {
    const currentActivations = exhibitor.currentTotalActivations || 0;
    const newTotal = currentActivations + totalActivationsNeeded;

    if (newTotal > exhibitor.maxTotalActivations) {
      const remaining = exhibitor.maxTotalActivations - currentActivations;
      throw new Error(
        `Total activations limit exceeded. You have ${exhibitor.maxTotalActivations} total activations allowed. ` +
        `You have already used ${currentActivations} activations and are trying to allocate ${totalActivationsNeeded} more. ` +
        `Only ${remaining} activations remaining.`
      );
    }
  }

  return exhibitor;
};

// Helper function to update exhibitor's license key counts
const updateExhibitorLicenseKeyCounts = async (
  exhibitorId: string,
  numberOfKeys: number,
  totalActivations: number
) => {
  await UserModel.findByIdAndUpdate(
    exhibitorId,
    {
      $inc: {
        currentLicenseKeyCount: numberOfKeys,
        currentTotalActivations: totalActivations,
      },
    },
    { new: true }
  );
};

// Helper function to format date for display in emails
const formatDateForEmail = (date: Date): string => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Helper function to format field name for display
const formatFieldName = (field: string): string => {
  const fieldNames: Record<string, string> = {
    eventName: 'Event Name',
    description: 'Description',
    type: 'Event Type',
    startDate: 'Start Date',
    endDate: 'End Date',
    location: 'Location',
    isActive: 'Active Status',
    stallName: 'Stall Name',
    maxActivations: 'Max Activations',
    expiresAt: 'Expiration Date'
  };
  return fieldNames[field] || field;
};

// Helper function to format location for comparison
const formatLocation = (location: any): string => {
  if (!location) return '-';
  const parts = [location.venue, location.address, location.city].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : '-';
};

// Helper function to create team manager for license
const createTeamManagerForLicense = async (
  email: string,
  exhibitorId: string,
  firstName?: string,
  lastName?: string
): Promise<{ teamManagerId: any; password: string; isNewUser: boolean }> => {
  try {
    // Get TEAMMANAGER role first (needed for validation)
    const teamManagerRole = await RoleModel.findOne({ name: "TEAMMANAGER" });
    if (!teamManagerRole) {
      throw new Error("TEAMMANAGER role not found");
    }

    // Check if user already exists
    const existingUser = await UserModel.findOne({ email, isDeleted: false }).populate('role');
    if (existingUser) {
      const existingRoleName = (existingUser.role as any)?.name || "";
      // If user already has TEAMMANAGER role, reuse the account (no new password)
      if (existingRoleName === "TEAMMANAGER") {
        console.log(`ℹ️  TeamManager already exists: ${email}`);
        return { teamManagerId: existingUser._id, password: "", isNewUser: false };
      }
      // Email is taken by a different role — block to avoid conflicts
      throw new Error(
        `Email already exists with role '${existingRoleName}'. Cannot create a license key for this email. Please use a different email address.`
      );
    }

    // Extract name from email if not provided
    const emailUsername = email.split("@")[0];
    const defaultFirstName = firstName || emailUsername.split(".")[0] || "Team";
    const defaultLastName = lastName || emailUsername.split(".")[1] || "Manager";

    // Generate random password
    const plainPassword = generateRandomPassword();
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    // Create team manager user (auto-verified since created by exhibitor)
    const teamManager = await UserModel.create({
      firstName: defaultFirstName.charAt(0).toUpperCase() + defaultFirstName.slice(1),
      lastName: defaultLastName.charAt(0).toUpperCase() + defaultLastName.slice(1),
      email,
      password: hashedPassword,
      role: teamManagerRole._id,
      exhibitorId,
      isActive: true,
      isDeleted: false,
      isVerified: true, // Auto-verify team managers created by exhibitor
    });

    console.log(`✅ Team Manager created and auto-verified: ${email}`);
    return { teamManagerId: teamManager._id, password: plainPassword, isNewUser: true };
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
    .select("-exhibitorId") // Exclude exhibitorId from response
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  const total = await EventModel.countDocuments(searchQuery);

  // Get lead counts for all events in a single query
  const eventIds = events.map((event) => event._id);
  const leadCounts = await LeadsModel.aggregate([
    { $match: { eventId: { $in: eventIds }, isDeleted: false } },
    { $group: { _id: "$eventId", count: { $sum: 1 } } },
  ]);

  const leadCountMap = new Map<string, number>();
  leadCounts.forEach((item) => {
    leadCountMap.set(item._id?.toString(), item.count);
  });

  // Add isExpired field to each event
  const now = new Date();
  const eventsWithExpiry = events.map((event) => {
    const eventObj = event.toObject();
    const leadCount = leadCountMap.get(event._id.toString()) || 0;
    return {
      ...eventObj,
      isExpired: new Date(event.endDate) < now,
      leadCount,
    };
  });

  return {
    events: eventsWithExpiry,
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
  }).select("-exhibitorId"); // Exclude exhibitorId from response

  if (!event) {
    throw new Error("Event not found");
  }

  // Add isExpired field
  const now = new Date();
  const eventObj = event.toObject();
  const leadCount = await LeadsModel.countDocuments({ eventId: id, isDeleted: false });
  return {
    ...eventObj,
    isExpired: new Date(event.endDate) < now,
    leadCount,
  };
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
  }).populate("exhibitorId", "firstName lastName email companyName");

  if (!event) {
    throw new Error("Event not found");
  }

  // Capture old values for comparison
  const oldValues = {
    eventName: event.eventName,
    description: event.description,
    type: event.type,
    startDate: event.startDate,
    endDate: event.endDate,
    location: event.location,
    isActive: event.isActive,
  };

  // Validate dates if provided
  if (data.startDate || data.endDate) {
    const start = data.startDate || event.startDate;
    const end = data.endDate || event.endDate;

    if (start >= end) {
      throw new Error("End date must be after start date");
    }
  }

  // Track changes for notification
  const changes: { field: string; oldValue: string; newValue: string }[] = [];

  // Update fields and track changes
  if (data.eventName && data.eventName !== oldValues.eventName) {
    changes.push({
      field: formatFieldName('eventName'),
      oldValue: oldValues.eventName,
      newValue: data.eventName
    });
    event.eventName = data.eventName;
  }

  if (data.description !== undefined && data.description !== oldValues.description) {
    changes.push({
      field: formatFieldName('description'),
      oldValue: oldValues.description || '-',
      newValue: data.description || '-'
    });
    event.description = data.description;
  }

  if (data.type !== undefined && data.type !== oldValues.type) {
    changes.push({
      field: formatFieldName('type'),
      oldValue: oldValues.type,
      newValue: data.type
    });
    event.type = data.type;
  }

  if (data.startDate && data.startDate.getTime() !== oldValues.startDate.getTime()) {
    changes.push({
      field: formatFieldName('startDate'),
      oldValue: formatDateForEmail(oldValues.startDate),
      newValue: formatDateForEmail(data.startDate)
    });
    event.startDate = data.startDate;
  }

  if (data.endDate && data.endDate.getTime() !== oldValues.endDate.getTime()) {
    changes.push({
      field: formatFieldName('endDate'),
      oldValue: formatDateForEmail(oldValues.endDate),
      newValue: formatDateForEmail(data.endDate)
    });
    event.endDate = data.endDate;
  }

  if (data.location) {
    const oldLocation = formatLocation(oldValues.location);
    const newLocation = formatLocation(data.location);
    if (oldLocation !== newLocation) {
      changes.push({
        field: formatFieldName('location'),
        oldValue: oldLocation,
        newValue: newLocation
      });
    }
    event.location = data.location;
  }

  if (typeof data.isActive === "boolean" && data.isActive !== oldValues.isActive) {
    changes.push({
      field: formatFieldName('isActive'),
      oldValue: oldValues.isActive ? 'Active' : 'Inactive',
      newValue: data.isActive ? 'Active' : 'Inactive'
    });
    event.isActive = data.isActive;
  }

  await event.save();

  // Send email notifications to ALL team managers if there are changes
  if (changes.length > 0 && event.licenseKeys.length > 0) {
    const exhibitor = event.exhibitorId as any;
    const updatedByName = exhibitor
      ? `${exhibitor.firstName} ${exhibitor.lastName}${exhibitor.companyName ? ` (${exhibitor.companyName})` : ''}`
      : 'Event Organizer';

    // Send emails to all active team managers (non-blocking)
    event.licenseKeys
      .filter(lk => lk.email && lk.isActive)
      .forEach(async (licenseKey) => {
        try {
          // Get team manager name from User model
          let recipientName = 'Team Manager';
          if (licenseKey.teamManagerId) {
            const teamManager = await UserModel.findById(licenseKey.teamManagerId).select('firstName lastName');
            if (teamManager) {
              recipientName = `${teamManager.firstName} ${teamManager.lastName}`;
            }
          }

          sendEventUpdateEmail({
            recipientEmail: licenseKey.email,
            recipientName,
            eventName: event.eventName,
            eventId: event._id.toString(),
            stallName: licenseKey.stallName,
            changes,
            updatedBy: updatedByName,
          })
            .then(() => console.log(`✅ Event update email sent to ${licenseKey.email}`))
            .catch((emailError: any) =>
              console.error(`❌ Failed to send event update email to ${licenseKey.email}:`, emailError.message)
            );
        } catch (error: any) {
          console.error(`❌ Error preparing event update email for ${licenseKey.email}:`, error.message);
        }
      });
  }

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

  // Validate that license key expiration date is not before event start date
  const eventStartDate = new Date(event.startDate);
  eventStartDate.setHours(0, 0, 0, 0);

  const keyExpirationDate = new Date(data.expiresAt);
  keyExpirationDate.setHours(0, 0, 0, 0);

  if (keyExpirationDate < eventStartDate) {
    throw new Error(`License key expiration date cannot be before the event start date (${event.startDate.toISOString().split('T')[0]})`);
  }

  // Validate license key restrictions
  const maxActivations = data.maxActivations || 1;
  await validateLicenseKeyRestrictions(exhibitorId, 1, maxActivations);

  // Generate license key
  const licenseKey = generateLicenseKey();

  // Create team manager account
  const { teamManagerId, password, isNewUser } = await createTeamManagerForLicense(data.email, exhibitorId);

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

  // Update exhibitor's license key counts
  await updateExhibitorLicenseKeyCounts(exhibitorId, 1, maxActivations);

  // Send email with license key details (for both new and existing users)
  try {
    await sendLicenseKeyEmail({
      email: data.email,
      password: isNewUser ? password : undefined, // Only include password for new users
      licenseKey,
      stallName: data.stallName,
      eventName: event.eventName,
      expiresAt: data.expiresAt,
      isExistingUser: !isNewUser,
    });
    console.log(`✅ License key email sent to ${data.email}${isNewUser ? ' (new user)' : ' (existing user)'}`);
  } catch (emailError: any) {
    console.error(`❌ Failed to send email to ${data.email}:`, emailError.message);
    // Don't throw error - license key is still created even if email fails
  }

  return {
    licenseKey,
    stallName: data.stallName,
    email: data.email,
    expiresAt: data.expiresAt,
    maxActivations: data.maxActivations,
    teamManagerId,
    credentials: isNewUser ? {
      email: data.email,
      password: password,
      note: "Random password generated for team manager account",
    } : {
      email: data.email,
      note: "User already exists - use existing password",
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

  // Calculate total keys and activations needed upfront for validation
  const numberOfKeys = licenseKeys.length;
  const totalActivationsNeeded = licenseKeys.reduce((sum, key) => {
    return sum + (key.maxActivations || 1);
  }, 0);

  // Validate license key restrictions before processing
  await validateLicenseKeyRestrictions(exhibitorId, numberOfKeys, totalActivationsNeeded);

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

    // Set expiration to end of day in IST (23:59:59.999 IST = 18:29:59.999 UTC)
    // IST is UTC+5:30, so we set UTC hours to 18:29:59.999 to get 23:59:59.999 IST
    expirationDate.setUTCHours(18, 29, 59, 999);

    // Get today's date at midnight for comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (expirationDate < today) {
      errors.push({ row: i + 1, error: "Expiration date must be today or in the future" });
      continue;
    }

    // Validate maximum expiry limit (15 days from today)
    const maxExpiryDate = new Date();
    maxExpiryDate.setDate(maxExpiryDate.getDate() + 15);
    maxExpiryDate.setHours(23, 59, 59, 999);

    if (expirationDate > maxExpiryDate) {
      errors.push({ row: i + 1, error: "License key expiry date cannot exceed 15 days from today" });
      continue;
    }

    // Validate that license key expiration date is not before event start date
    const eventStartDate = new Date(event.startDate);
    eventStartDate.setHours(0, 0, 0, 0);

    const keyExpirationDate = new Date(expirationDate);
    keyExpirationDate.setHours(0, 0, 0, 0);

    if (keyExpirationDate < eventStartDate) {
      errors.push({ row: i + 1, error: `License key expiration date cannot be before the event start date (${event.startDate.toISOString().split('T')[0]})` });
      continue;
    }

    try {
      // Generate license key
      const licenseKey = generateLicenseKey();

      // Create team manager account
      const { teamManagerId, password, isNewUser } = await createTeamManagerForLicense(email, exhibitorId);

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
        credentials: isNewUser ? {
          email,
          password,
        } : {
          email,
          note: "User already exists - use existing password",
        },
      });

      // Send email with credentials (non-blocking, only for new users)
      if (isNewUser && password) {
        sendLicenseKeyEmail({
          email,
          password,
          licenseKey,
          stallName,
          eventName: event.eventName,
          expiresAt: expirationDate,
        })
          .then(() => console.log(`✅ License key email sent to ${email}`))
          .catch((emailError: any) =>
            console.error(`❌ Failed to send email to ${email}:`, emailError.message)
          );
      }
    } catch (error: any) {
      errors.push({ row: i + 1, error: error.message, email });
    }
  }

  await event.save();

  // Update exhibitor's license key counts based on successfully generated keys
  if (generatedKeys.length > 0) {
    const actualActivationsUsed = generatedKeys.reduce((sum, key) => {
      return sum + (key.maxActivations || 1);
    }, 0);
    await updateExhibitorLicenseKeyCounts(exhibitorId, generatedKeys.length, actualActivationsUsed);
  }

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

// Update license key for an event
interface UpdateLicenseKeyData {
  stallName?: string;
  maxActivations?: number;
  expiresAt?: Date;
}

export const updateLicenseKey = async (
  eventId: string,
  exhibitorId: string,
  licenseKeyId: string,
  data: UpdateLicenseKeyData
) => {
  const event = await EventModel.findOne({
    _id: eventId,
    exhibitorId,
    isDeleted: false,
  }).populate("exhibitorId", "firstName lastName email companyName");

  if (!event) {
    throw new Error("Event not found");
  }

  // Find the license key by ID
  const licenseKey = event.licenseKeys.find(
    (lk) => lk._id?.toString() === licenseKeyId
  );

  if (!licenseKey) {
    throw new Error("License key not found");
  }

  // Capture old values for comparison
  const oldValues = {
    stallName: licenseKey.stallName,
    maxActivations: licenseKey.maxActivations,
    expiresAt: licenseKey.expiresAt,
  };

  // Validate that license key expiration date is not before event start date
  if (data.expiresAt) {
    const eventStartDate = new Date(event.startDate);
    eventStartDate.setHours(0, 0, 0, 0);

    const keyExpirationDate = new Date(data.expiresAt);
    keyExpirationDate.setHours(0, 0, 0, 0);

    if (keyExpirationDate < eventStartDate) {
      throw new Error(
        `License key expiration date cannot be before the event start date (${event.startDate.toISOString().split("T")[0]})`
      );
    }
  }

  // Track changes for notification
  const changes: { field: string; oldValue: string; newValue: string }[] = [];

  // Update the license key fields and track changes
  if (data.stallName !== undefined && data.stallName !== oldValues.stallName) {
    changes.push({
      field: formatFieldName('stallName'),
      oldValue: oldValues.stallName || '-',
      newValue: data.stallName || '-'
    });
    licenseKey.stallName = data.stallName;
  }

  let activationsDifference = 0;
  if (data.maxActivations !== undefined && data.maxActivations !== oldValues.maxActivations) {
    // Check if new maxActivations is less than usedCount
    if (data.maxActivations < licenseKey.usedCount) {
      throw new Error(
        `maxActivations (${data.maxActivations}) cannot be less than the current usage count (${licenseKey.usedCount})`
      );
    }

    changes.push({
      field: formatFieldName('maxActivations'),
      oldValue: String(oldValues.maxActivations),
      newValue: String(data.maxActivations)
    });

    // Calculate the difference to update organiser's currentTotalActivations
    activationsDifference = data.maxActivations - licenseKey.maxActivations;
    licenseKey.maxActivations = data.maxActivations;
  }

  if (data.expiresAt !== undefined) {
    const oldExpiry = oldValues.expiresAt ? oldValues.expiresAt.getTime() : 0;
    const newExpiry = data.expiresAt.getTime();

    if (oldExpiry !== newExpiry) {
      changes.push({
        field: formatFieldName('expiresAt'),
        oldValue: oldValues.expiresAt ? formatDateForEmail(oldValues.expiresAt) : '-',
        newValue: formatDateForEmail(data.expiresAt)
      });
    }
    licenseKey.expiresAt = data.expiresAt;
  }

  await event.save();

  // Update the organiser's currentTotalActivations if maxActivations was changed
  if (activationsDifference !== 0) {
    await UserModel.findByIdAndUpdate(
      exhibitorId,
      { $inc: { currentTotalActivations: activationsDifference } }
    );
  }

  // Send email notification to the SPECIFIC team manager if there are changes
  if (changes.length > 0 && licenseKey.email) {
    const exhibitor = event.exhibitorId as any;
    const updatedByName = exhibitor
      ? `${exhibitor.firstName} ${exhibitor.lastName}${exhibitor.companyName ? ` (${exhibitor.companyName})` : ''}`
      : 'Event Organizer';

    // Get team manager name (non-blocking)
    (async () => {
      try {
        let recipientName = 'Team Manager';
        if (licenseKey.teamManagerId) {
          const teamManager = await UserModel.findById(licenseKey.teamManagerId).select('firstName lastName');
          if (teamManager) {
            recipientName = `${teamManager.firstName} ${teamManager.lastName}`;
          }
        }

        sendLicenseKeyUpdateEmail({
          recipientEmail: licenseKey.email,
          recipientName,
          licenseKey: licenseKey.key,
          eventName: event.eventName,
          stallName: licenseKey.stallName,
          changes,
          updatedBy: updatedByName,
        })
          .then(() => console.log(`✅ License key update email sent to ${licenseKey.email}`))
          .catch((emailError: any) =>
            console.error(`❌ Failed to send license key update email to ${licenseKey.email}:`, emailError.message)
          );
      } catch (error: any) {
        console.error(`❌ Error preparing license key update email for ${licenseKey.email}:`, error.message);
      }
    })();
  }

  return {
    licenseKey: {
      _id: licenseKey._id,
      key: licenseKey.key,
      stallName: licenseKey.stallName,
      email: licenseKey.email,
      maxActivations: licenseKey.maxActivations,
      usedCount: licenseKey.usedCount,
      expiresAt: licenseKey.expiresAt,
      isActive: licenseKey.isActive,
      paymentStatus: licenseKey.paymentStatus,
      maxLeads: licenseKey.maxLeads ?? 10000,
      currentLeadCount: licenseKey.currentLeadCount ?? 0,
    },
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

  // Get team members count - unique users who joined events using license keys (exclude exited)
  const teamMembersResult = await RsvpModel.aggregate([
    {
      $match: {
        eventId: { $in: eventIds },
        eventLicenseKey: { $nin: [null, ""] },
        isDeleted: false,
        hasExited: { $ne: true },
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

  const teamMembers = teamMembersResult.length > 0 ? teamMembersResult[0].uniqueUsers : 0;

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

  // Add isExpired field to each event
  const now = new Date();
  const eventsWithExpiry = topEvents.map((event) => ({
    ...event,
    isExpired: new Date(event.endDate) < now,
  }));

  return eventsWithExpiry;
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

// Get event performance (top events by lead count with date filter)
export const getEventPerformance = async (
  exhibitorId: string,
  limit: number = 10,
  startDate?: Date,
  endDate?: Date
) => {
  // Get exhibitor's events
  const exhibitorEvents = await EventModel.find({
    exhibitorId: new mongoose.Types.ObjectId(exhibitorId),
    isDeleted: false,
  }).select("_id eventName startDate endDate isActive");

  const eventIds = exhibitorEvents.map((event) => event._id);

  // Build date filter for leads
  const matchStage: any = {
    eventId: { $in: eventIds },
    isDeleted: false,
  };

  if (startDate || endDate) {
    matchStage.createdAt = {};
    if (startDate) matchStage.createdAt.$gte = startDate;
    if (endDate) matchStage.createdAt.$lte = endDate;
  }

  // Aggregate leads by event
  const eventPerformance = await LeadsModel.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: "$eventId",
        leadCount: { $sum: 1 },
      },
    },
    { $sort: { leadCount: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "events",
        localField: "_id",
        foreignField: "_id",
        as: "event",
      },
    },
    { $unwind: "$event" },
    {
      $project: {
        _id: 1,
        leadCount: 1,
        eventName: "$event.eventName",
        startDate: "$event.startDate",
        endDate: "$event.endDate",
        isActive: "$event.isActive",
      },
    },
  ]);

  // Add isExpired field
  const now = new Date();
  const eventsWithExpiry = eventPerformance.map((event) => ({
    ...event,
    isExpired: new Date(event.endDate) < now,
  }));

  return { events: eventsWithExpiry };
};

// Get Month-over-Month lead growth across events for an exhibitor
export const getLeadsMoMGrowth = async (
  exhibitorId: string,
  months: number = 12
) => {
  // Step 1: Fetch all non-deleted events for this exhibitor
  const exhibitorEvents = await EventModel.find({
    exhibitorId: new mongoose.Types.ObjectId(exhibitorId),
    isDeleted: false,
  }).select("_id eventName");

  if (exhibitorEvents.length === 0) {
    const trends = buildEmptyMonthTrends(months);
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

  const eventIds = exhibitorEvents.map((e) => e._id);
  const eventNameMap = new Map(
    exhibitorEvents.map((e) => [e._id.toString(), e.eventName])
  );

  // Step 2: Define the month window (start of the earliest month in range)
  const windowStart = new Date();
  windowStart.setMonth(windowStart.getMonth() - (months - 1));
  windowStart.setDate(1);
  windowStart.setHours(0, 0, 0, 0);

  // Step 3: Aggregate leads grouped by { month, eventId }
  const rawData = await LeadsModel.aggregate([
    {
      $match: {
        eventId: { $in: eventIds },
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

  // Step 4: Build month series and bucket results
  const monthSeries = buildMonthSeries(months);
  const monthlyTotals = new Map<string, number>();
  const monthlyEventBreakdown = new Map<string, Map<string, number>>();

  for (const m of monthSeries) {
    monthlyTotals.set(m, 0);
    monthlyEventBreakdown.set(m, new Map());
  }

  for (const row of rawData) {
    const month: string = row._id.month;
    const eventId: string = row._id.eventId.toString();
    const count: number = row.leadCount;

    if (!monthlyTotals.has(month)) continue; // outside our window, skip

    monthlyTotals.set(month, (monthlyTotals.get(month) ?? 0) + count);

    const breakdown = monthlyEventBreakdown.get(month)!;
    breakdown.set(eventId, (breakdown.get(eventId) ?? 0) + count);
  }

  // Step 5: Build trend array with MoM change per month
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

    // Build per-event breakdown for this month (only events with leads)
    const breakdown = monthlyEventBreakdown.get(month) ?? new Map();
    const eventBreakdown = Array.from(breakdown.entries())
      .map(([eventId, leadCount]) => ({
        eventId,
        eventName: eventNameMap.get(eventId) ?? "Unknown Event",
        leadCount,
      }))
      .sort((a, b) => b.leadCount - a.leadCount);

    return { month, count, momChangeAbsolute, momChangePercent, eventBreakdown };
  });

  // Step 6: Summary using last two months
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

function buildEmptyMonthTrends(months: number) {
  return buildMonthSeries(months).map((month, idx) => ({
    month,
    count: 0,
    momChangeAbsolute: idx > 0 ? 0 : null,
    momChangePercent: null,
    eventBreakdown: [],
  }));
}

// Get stall performance (leads by license key/stall with event and date filter)
export const getStallPerformance = async (
  exhibitorId: string,
  eventId?: string,
  startDate?: Date,
  endDate?: Date
) => {
  // Build event query
  const eventQuery: any = {
    exhibitorId: new mongoose.Types.ObjectId(exhibitorId),
    isDeleted: false,
  };

  if (eventId) {
    eventQuery._id = new mongoose.Types.ObjectId(eventId);
  }

  // Get events with license keys
  const events = await EventModel.find(eventQuery).select("_id eventName licenseKeys");

  if (events.length === 0) {
    return { stalls: [] };
  }

  // Build license key info and collect all license keys
  const allLicenseKeys: Array<{
    key: string;
    stallName: string;
    email: string;
    eventId: mongoose.Types.ObjectId;
    eventName: string;
  }> = [];

  events.forEach((event) => {
    event.licenseKeys.forEach((licenseKey) => {
      allLicenseKeys.push({
        key: licenseKey.key,
        stallName: licenseKey.stallName || licenseKey.email,
        email: licenseKey.email,
        eventId: event._id as mongoose.Types.ObjectId,
        eventName: event.eventName,
      });
    });
  });

  if (allLicenseKeys.length === 0) {
    return { stalls: [] };
  }

  // For each license key, find users who RSVPed with it and count their leads
  const stallsWithLeadCounts = await Promise.all(
    allLicenseKeys.map(async (licenseKeyInfo) => {
      // Find all active RSVPs that used this license key (exclude exited users)
      const rsvpsWithKey = await RsvpModel.find({
        eventLicenseKey: licenseKeyInfo.key,
        isDeleted: false,
        hasExited: { $ne: true },
      }).select("userId");

      const userIds = rsvpsWithKey.map((rsvp) => rsvp.userId);

      if (userIds.length === 0) {
        return {
          key: licenseKeyInfo.key,
          stallName: licenseKeyInfo.stallName,
          email: licenseKeyInfo.email,
          eventName: licenseKeyInfo.eventName,
          leadCount: 0,
        };
      }

      // Build date filter for leads
      const matchQuery: any = {
        eventId: licenseKeyInfo.eventId,
        userId: { $in: userIds },
        isDeleted: false,
      };

      if (startDate || endDate) {
        matchQuery.createdAt = {};
        if (startDate) matchQuery.createdAt.$gte = startDate;
        if (endDate) matchQuery.createdAt.$lte = endDate;
      }

      // Count leads created by these users for this event
      const leadCount = await LeadsModel.countDocuments(matchQuery);

      return {
        key: licenseKeyInfo.key,
        stallName: licenseKeyInfo.stallName,
        email: licenseKeyInfo.email,
        eventName: licenseKeyInfo.eventName,
        leadCount,
      };
    })
  );

  // Filter out stalls with 0 leads and sort by lead count
  const stalls = stallsWithLeadCounts
    .filter((stall) => stall.leadCount > 0)
    .sort((a, b) => b.leadCount - a.leadCount);

  return { stalls };
};

// ── helpers ──────────────────────────────────────────────────────────────────

const computeEventROILabel = (score: number): "High" | "Medium" | "Low" => {
  if (score >= 0.7) return "High";
  if (score >= 0.3) return "Medium";
  return "Low";
};

// Get Event ROI Analytics for Exhibitor
// NOTE: lead metrics are read from the embedded currentLeadCount field, which is kept
// accurate by atomic increments/decrements in lead.service.ts createLead/deleteLead.
// If that field ever drifts, ROI figures will silently be wrong.
export const getEventROIAnalytics = async (exhibitorId: string) => {
  const now = new Date();

  // Fetch exhibitor user for quota info
  const exhibitor = await UserModel.findById(exhibitorId).select(
    "maxLicenseKeys currentLicenseKeyCount maxTotalActivations currentTotalActivations"
  );

  if (!exhibitor) {
    throw new Error("Exhibitor not found");
  }

  const events = await EventModel.find({
    exhibitorId: new mongoose.Types.ObjectId(exhibitorId),
    isDeleted: false,
  }).select("_id eventName type startDate endDate isActive licenseKeys");

  let totalLeadsGenerated = 0;
  let totalLeadsCapacity = 0;
  let totalActivationsUsed = 0;
  let totalActivationsCapacity = 0;

  const eventROI = events.map((event) => {
    const keys = event.licenseKeys ?? [];
    const totalKeys = keys.length;
    const activeKeys = keys.filter((k) => k.isActive).length;

    let eventLeads = 0;
    let eventLeadsCapacity = 0;
    let eventActivations = 0;
    let eventActivationsCapacity = 0;

    const licenseKeyBreakdown = keys.map((key) => {
      const maxLeads = key.maxLeads ?? 10000;
      const currentLeadCount = key.currentLeadCount ?? 0;
      const maxActivations = key.maxActivations ?? 1;
      const usedCount = key.usedCount ?? 0;

      eventLeads += currentLeadCount;
      eventLeadsCapacity += maxLeads;
      eventActivations += usedCount;
      eventActivationsCapacity += maxActivations;

      const leadUtil = maxLeads > 0 ? currentLeadCount / maxLeads : 0;
      const actUtil = maxActivations > 0 ? usedCount / maxActivations : 0;
      const keyScore = leadUtil * 0.7 + actUtil * 0.3;

      return {
        licenseKey: key.key,
        stallName: key.stallName ?? null,
        email: key.email,
        isActive: key.isActive,
        isExpired: new Date(key.expiresAt) < now,
        expiresAt: key.expiresAt,
        currentLeadCount,
        maxLeads,
        leadUtilizationPct: Math.round(leadUtil * 100),
        usedCount,
        maxActivations,
        activationUtilizationPct: Math.round(actUtil * 100),
        roiScore: Math.round(keyScore * 100),
        roiIndicator: computeEventROILabel(keyScore),
      };
    });

    totalLeadsGenerated += eventLeads;
    totalLeadsCapacity += eventLeadsCapacity;
    totalActivationsUsed += eventActivations;
    totalActivationsCapacity += eventActivationsCapacity;

    const leadUtil = eventLeadsCapacity > 0 ? eventLeads / eventLeadsCapacity : 0;
    const actUtil =
      eventActivationsCapacity > 0
        ? eventActivations / eventActivationsCapacity
        : 0;
    const eventScore = leadUtil * 0.7 + actUtil * 0.3;
    const isExpired = new Date(event.endDate) < now;

    return {
      eventId: event._id,
      eventName: event.eventName,
      type: event.type,
      startDate: event.startDate,
      endDate: event.endDate,
      isActive: event.isActive,
      isExpired,
      // License key counts
      totalLicenseKeys: totalKeys,
      activeLicenseKeys: activeKeys,
      keyActivationRatePct: totalKeys > 0 ? Math.round((activeKeys / totalKeys) * 100) : 0,
      // Lead metrics
      totalLeadsGenerated: eventLeads,
      totalLeadsCapacity: eventLeadsCapacity,
      leadUtilizationPct: Math.round(leadUtil * 100),
      // Activation metrics
      totalActivationsUsed: eventActivations,
      totalActivationsCapacity: eventActivationsCapacity,
      activationUtilizationPct: Math.round(actUtil * 100),
      // ROI
      roiScore: Math.round(eventScore * 100),
      roiIndicator: computeEventROILabel(eventScore),
      // Per key breakdown
      licenseKeys: licenseKeyBreakdown,
    };
  });

  // Sort: High → Medium → Low, then by roiScore desc
  const roiOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
  eventROI.sort(
    (a, b) =>
      roiOrder[a.roiIndicator] - roiOrder[b.roiIndicator] ||
      b.roiScore - a.roiScore
  );

  const overallLeadUtil =
    totalLeadsCapacity > 0 ? totalLeadsGenerated / totalLeadsCapacity : 0;
  const overallActUtil =
    totalActivationsCapacity > 0
      ? totalActivationsUsed / totalActivationsCapacity
      : 0;
  const overallScore = overallLeadUtil * 0.7 + overallActUtil * 0.3;

  const highCount = eventROI.filter((e) => e.roiIndicator === "High").length;
  const mediumCount = eventROI.filter((e) => e.roiIndicator === "Medium").length;
  const lowCount = eventROI.filter((e) => e.roiIndicator === "Low").length;

  // Quota ROI — how well is the exhibitor using their assigned quota
  const maxLicenseKeys = exhibitor.maxLicenseKeys ?? 20;
  const currentLicenseKeyCount = exhibitor.currentLicenseKeyCount ?? 0;
  const maxTotalActivations = exhibitor.maxTotalActivations ?? 100;
  const currentTotalActivations = exhibitor.currentTotalActivations ?? 0;
  const quotaKeyUtil = maxLicenseKeys > 0 ? currentLicenseKeyCount / maxLicenseKeys : 0;
  const quotaActUtil =
    maxTotalActivations > 0 ? currentTotalActivations / maxTotalActivations : 0;
  const quotaScore = quotaKeyUtil * 0.5 + quotaActUtil * 0.5;

  return {
    summary: {
      totalEvents: eventROI.length,
      totalLeadsGenerated,
      totalLeadsCapacity,
      totalActivationsUsed,
      totalActivationsCapacity,
      overallLeadUtilizationPct: Math.round(overallLeadUtil * 100),
      overallActivationUtilizationPct: Math.round(overallActUtil * 100),
      overallROIScore: Math.round(overallScore * 100),
      overallROIIndicator: computeEventROILabel(overallScore),
      breakdown: { high: highCount, medium: mediumCount, low: lowCount },
      quotaROI: {
        licenseKeysUsed: currentLicenseKeyCount,
        licenseKeysMax: maxLicenseKeys,
        licenseKeyUtilizationPct: Math.round(quotaKeyUtil * 100),
        activationsUsed: currentTotalActivations,
        activationsMax: maxTotalActivations,
        activationUtilizationPct: Math.round(quotaActUtil * 100),
        quotaROIScore: Math.round(quotaScore * 100),
        quotaROIIndicator: computeEventROILabel(quotaScore),
      },
    },
    events: eventROI,
  };
};

// ─────────────────────────────────────────────
// NEW ANALYTICS
// ─────────────────────────────────────────────

// 1. Lead Quality Analytics
export const getLeadQualityAnalytics = async (exhibitorId: string, eventId?: string) => {
  const eventMatch: any = { exhibitorId: new mongoose.Types.ObjectId(exhibitorId), isDeleted: false };
  if (eventId) eventMatch._id = new mongoose.Types.ObjectId(eventId);

  const events = await EventModel.find(eventMatch).select("_id eventName licenseKeys").lean();
  if (!events.length) return { overall: null, events: [] };

  const eventIds = events.map((e) => e._id);

  const leadMatch: any = { eventId: { $in: eventIds }, isDeleted: false };

  const overall = await LeadsModel.aggregate([
    { $match: leadMatch },
    {
      $group: {
        _id: null,
        totalLeads: { $sum: 1 },
        ratedLeads: { $sum: { $cond: [{ $gt: ["$rating", null] }, 1, 0] } },
        avgRating: { $avg: "$rating" },
        r1: { $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] } },
        r2: { $sum: { $cond: [{ $eq: ["$rating", 2] }, 1, 0] } },
        r3: { $sum: { $cond: [{ $eq: ["$rating", 3] }, 1, 0] } },
        r4: { $sum: { $cond: [{ $eq: ["$rating", 4] }, 1, 0] } },
        r5: { $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] } },
      },
    },
  ]);

  const perEvent = await LeadsModel.aggregate([
    { $match: leadMatch },
    {
      $group: {
        _id: "$eventId",
        totalLeads: { $sum: 1 },
        ratedLeads: { $sum: { $cond: [{ $gt: ["$rating", null] }, 1, 0] } },
        avgRating: { $avg: "$rating" },
        highQualityLeads: { $sum: { $cond: [{ $gte: ["$rating", 4] }, 1, 0] } },
        r1: { $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] } },
        r2: { $sum: { $cond: [{ $eq: ["$rating", 2] }, 1, 0] } },
        r3: { $sum: { $cond: [{ $eq: ["$rating", 3] }, 1, 0] } },
        r4: { $sum: { $cond: [{ $eq: ["$rating", 4] }, 1, 0] } },
        r5: { $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] } },
      },
    },
  ]);

  const perEventMap = new Map(perEvent.map((r) => [r._id.toString(), r]));

  const eventResults = events.map((ev) => {
    const stats = perEventMap.get(ev._id.toString());
    const totalLeads = stats?.totalLeads ?? 0;
    const highQualityLeads = stats?.highQualityLeads ?? 0;
    return {
      eventId: ev._id,
      eventName: ev.eventName,
      totalLeads,
      ratedLeads: stats?.ratedLeads ?? 0,
      avgRating: stats?.avgRating ? parseFloat(stats.avgRating.toFixed(2)) : null,
      distribution: { 1: stats?.r1 ?? 0, 2: stats?.r2 ?? 0, 3: stats?.r3 ?? 0, 4: stats?.r4 ?? 0, 5: stats?.r5 ?? 0 },
      highQualityLeads,
      highQualityPct: totalLeads > 0 ? parseFloat(((highQualityLeads / totalLeads) * 100).toFixed(2)) : 0,
    };
  });

  const o = overall[0];
  return {
    overall: o
      ? {
          totalLeads: o.totalLeads,
          ratedLeads: o.ratedLeads,
          avgRating: o.avgRating ? parseFloat(o.avgRating.toFixed(2)) : null,
          distribution: { 1: o.r1, 2: o.r2, 3: o.r3, 4: o.r4, 5: o.r5 },
          highQualityLeads: o.r4 + o.r5,
          highQualityPct:
            o.totalLeads > 0
              ? parseFloat((((o.r4 + o.r5) / o.totalLeads) * 100).toFixed(2))
              : 0,
        }
      : null,
    events: eventResults,
  };
};

// 2. Team Member Performance
export const getTeamMemberPerformance = async (exhibitorId: string, eventId?: string) => {
  const eventMatch: any = { exhibitorId: new mongoose.Types.ObjectId(exhibitorId), isDeleted: false };
  if (eventId) eventMatch._id = new mongoose.Types.ObjectId(eventId);
  const events = await EventModel.find(eventMatch).select("_id eventName").lean();
  if (!events.length) return { members: [], summary: null };

  const eventIds = events.map((e) => e._id);

  const memberStats = await LeadsModel.aggregate([
    { $match: { eventId: { $in: eventIds }, isDeleted: false } },
    {
      $group: {
        _id: "$userId",
        totalLeads: { $sum: 1 },
        ratedLeads: { $sum: { $cond: [{ $gt: ["$rating", null] }, 1, 0] } },
        avgRating: { $avg: "$rating" },
        highQualityLeads: { $sum: { $cond: [{ $gte: ["$rating", 4] }, 1, 0] } },
        lastActivityAt: { $max: "$createdAt" },
      },
    },
    { $sort: { totalLeads: -1 } },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: false } },
    { $match: { "user.isDeleted": { $ne: true } } },
    {
      $project: {
        _id: 0,
        userId: "$_id",
        firstName: { $ifNull: ["$user.firstName", ""] },
        lastName: { $ifNull: ["$user.lastName", ""] },
        email: { $ifNull: ["$user.email", ""] },
        totalLeads: 1,
        ratedLeads: 1,
        avgRating: 1,
        highQualityLeads: 1,
        lastActivityAt: 1,
      },
    },
  ]);

  const members = memberStats.map((m) => ({
    ...m,
    avgRating: m.avgRating ? parseFloat(m.avgRating.toFixed(2)) : null,
    highQualityPct:
      m.totalLeads > 0 ? parseFloat(((m.highQualityLeads / m.totalLeads) * 100).toFixed(2)) : 0,
  }));

  const best = members[0] ?? null;
  return {
    members,
    summary: best
      ? {
          topPerformerByLeads: {
            userId: best.userId,
            name: `${best.firstName} ${best.lastName}`.trim() || "Unknown",
            totalLeads: best.totalLeads,
          },
          topPerformerByQuality: members.reduce((a, b) =>
            (b.avgRating ?? 0) > (a.avgRating ?? 0) ? b : a
          ),
        }
      : null,
  };
};

// 3. Meeting Conversion Analytics
export const getMeetingConversionAnalytics = async (exhibitorId: string, eventId?: string) => {
  const eventMatch: any = { exhibitorId: new mongoose.Types.ObjectId(exhibitorId), isDeleted: false };
  if (eventId) eventMatch._id = new mongoose.Types.ObjectId(eventId);
  const events = await EventModel.find(eventMatch).select("_id eventName").lean();
  if (!events.length) return { overall: null, events: [] };

  const eventIds = events.map((e) => e._id);

  const allLeads = await LeadsModel.find({ eventId: { $in: eventIds }, isDeleted: false })
    .select("_id eventId userId")
    .lean();
  const leadIds = allLeads.map((l) => l._id);

  const meetings = await MeetingModel.find({ leadId: { $in: leadIds }, isDeleted: false })
    .select("leadId meetingStatus")
    .lean();

  const meetingLeadSet = new Set(meetings.map((m: any) => m.leadId.toString()));

  const statusCount: Record<string, number> = {
    scheduled: 0, completed: 0, cancelled: 0, rescheduled: 0,
  };
  for (const m of meetings) {
    const s = (m as any).meetingStatus as string;
    if (s in statusCount) statusCount[s]++;
  }

  const leadsByEvent = new Map<string, number>();
  const meetingsByEvent = new Map<string, Set<string>>();
  for (const lead of allLeads) {
    if (!lead.eventId) continue;
    const eid = lead.eventId.toString();
    leadsByEvent.set(eid, (leadsByEvent.get(eid) ?? 0) + 1);
    if (meetingLeadSet.has(lead._id.toString())) {
      if (!meetingsByEvent.has(eid)) meetingsByEvent.set(eid, new Set());
      meetingsByEvent.get(eid)!.add(lead._id.toString());
    }
  }

  const eventResults = events.map((ev) => {
    const eid = ev._id.toString();
    const totalLeads = leadsByEvent.get(eid) ?? 0;
    const leadsWithMeetings = meetingsByEvent.get(eid)?.size ?? 0;
    return {
      eventId: ev._id,
      eventName: ev.eventName,
      totalLeads,
      leadsWithMeetings,
      conversionRatePct: totalLeads > 0 ? parseFloat(((leadsWithMeetings / totalLeads) * 100).toFixed(2)) : 0,
    };
  });

  const totalLeads = allLeads.length;
  const leadsWithMeetings = meetingLeadSet.size;

  return {
    overall: {
      totalLeads,
      leadsWithMeetings,
      conversionRatePct: totalLeads > 0 ? parseFloat(((leadsWithMeetings / totalLeads) * 100).toFixed(2)) : 0,
      meetingsByStatus: statusCount,
    },
    events: eventResults,
  };
};

// 4. Duplicate Lead Detection
export const getDuplicateLeads = async (exhibitorId: string, eventId?: string) => {
  const eventMatch: any = { exhibitorId: new mongoose.Types.ObjectId(exhibitorId), isDeleted: false };
  if (eventId) eventMatch._id = new mongoose.Types.ObjectId(eventId);
  const events = await EventModel.find(eventMatch).select("_id eventName").lean();
  if (!events.length) return { totalLeads: 0, duplicateGroups: [] };

  const eventIds = events.map((e) => e._id);
  const allLeads = await LeadsModel.find({ eventId: { $in: eventIds }, isDeleted: false })
    .select("_id userId eventId details.emails details.phoneNumbers details.firstName details.lastName")
    .lean();

  const emailMap = new Map<string, any[]>();
  const phoneMap = new Map<string, any[]>();

  for (const lead of allLeads) {
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
  const seenLeadIds = new Set<string>();

  const processMap = (map: Map<string, any[]>, contactType: "email" | "phone") => {
    for (const [contact, leads] of map.entries()) {
      if (leads.length < 2) continue;
      const uniqueUsers = new Set(leads.map((l: any) => l.userId.toString()));
      if (uniqueUsers.size < 2) continue;
      const key = leads.map((l: any) => l._id.toString()).sort().join(",");
      if (seenLeadIds.has(key)) continue;
      seenLeadIds.add(key);
      groups.push({
        contactType,
        contact,
        count: leads.length,
        leads: leads.map((l: any) => ({
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

  const duplicateLeadCount = new Set(groups.flatMap((g) => g.leads.map((l: any) => l.leadId.toString()))).size;

  return {
    totalLeads: allLeads.length,
    duplicateGroups: groups.length,
    duplicateLeadCount,
    duplicatePct:
      allLeads.length > 0 ? parseFloat(((duplicateLeadCount / allLeads.length) * 100).toFixed(2)) : 0,
    groups,
  };
};

// 5. Lead Capture Time-of-Day Heatmap
export const getLeadCaptureHeatmap = async (exhibitorId: string, eventId: string) => {
  const event = await EventModel.findOne({
    _id: eventId,
    exhibitorId,
    isDeleted: false,
  }).select("_id eventName startDate endDate").lean();

  if (!event) throw new Error("Event not found");

  // $hour returns UTC hours. Labels are rendered as UTC — frontend should offset for local timezone.
  const hourlyData = await LeadsModel.aggregate([
    { $match: { eventId: new mongoose.Types.ObjectId(eventId), isDeleted: false } },
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
    const label = h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
    return { hour: h, label, count: hourMap.get(h) ?? 0 };
  });

  const maxCount = Math.max(...hours.map((h) => h.count), 0);
  const peakHour = hours.find((h) => h.count === maxCount) ?? null;

  const dailyBreakdown = await LeadsModel.aggregate([
    { $match: { eventId: new mongoose.Types.ObjectId(eventId), isDeleted: false } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, date: "$_id", count: 1 } },
  ]);

  return {
    eventId: (event as any)._id,
    eventName: (event as any).eventName,
    heatmap: hours,
    peakHour,
    dailyBreakdown,
  };
};

// 6. Event-to-Event Comparison
export const getEventComparison = async (exhibitorId: string, eventIds: string[]) => {
  const validEventIds = eventIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const events = await EventModel.find({
    _id: { $in: validEventIds },
    exhibitorId: new mongoose.Types.ObjectId(exhibitorId),
    isDeleted: false,
  }).select("_id eventName type startDate endDate licenseKeys").lean();

  if (!events.length) return { events: [] };

  const results = await Promise.all(
    events.map(async (ev) => {
      const eid = ev._id;

      const leadStats = await LeadsModel.aggregate([
        { $match: { eventId: eid, isDeleted: false } },
        {
          $group: {
            _id: null,
            totalLeads: { $sum: 1 },
            ratedLeads: { $sum: { $cond: [{ $gt: ["$rating", null] }, 1, 0] } },
            avgRating: { $avg: "$rating" },
            highQualityLeads: { $sum: { $cond: [{ $gte: ["$rating", 4] }, 1, 0] } },
          },
        },
      ]);

      const ls = leadStats[0] ?? { totalLeads: 0, avgRating: null, highQualityLeads: 0 };

      const leadIds = await LeadsModel.find({ eventId: eid, isDeleted: false }).select("_id").lean();
      const meetingCount = await MeetingModel.countDocuments({
        leadId: { $in: leadIds.map((l) => l._id) },
        isDeleted: false,
      });

      const keys = (ev as any).licenseKeys ?? [];
      const totalLeadCapacity = keys.reduce((s: number, k: any) => s + (k.maxLeads ?? 0), 0);
      // Use authoritative count from LeadsModel — currentLeadCount on the key doc can be stale
      const totalLeadsCaptured = ls.totalLeads;
      const activeStalls = keys.filter((k: any) => k.isActive).length;

      const durationDays = Math.max(
        1,
        Math.ceil(
          (new Date((ev as any).endDate).getTime() - new Date((ev as any).startDate).getTime()) / 86400000
        ) + 1
      );

      return {
        eventId: eid,
        eventName: (ev as any).eventName,
        type: (ev as any).type,
        startDate: (ev as any).startDate,
        endDate: (ev as any).endDate,
        durationDays,
        totalLeads: ls.totalLeads,
        avgRating: ls.avgRating ? parseFloat(ls.avgRating.toFixed(2)) : null,
        highQualityLeads: ls.highQualityLeads ?? 0,
        highQualityPct:
          ls.totalLeads > 0
            ? parseFloat((((ls.highQualityLeads ?? 0) / ls.totalLeads) * 100).toFixed(2))
            : 0,
        meetingsScheduled: meetingCount,
        meetingConversionPct:
          ls.totalLeads > 0 ? parseFloat(((meetingCount / ls.totalLeads) * 100).toFixed(2)) : 0,
        totalLeadCapacity,
        totalLeadsCaptured,
        leadUtilizationPct:
          totalLeadCapacity > 0
            ? parseFloat(((totalLeadsCaptured / totalLeadCapacity) * 100).toFixed(2))
            : 0,
        activeStalls,
        totalStalls: keys.length,
      };
    })
  );

  return { events: results };
};

// 7. Lead Demographics
export const getLeadDemographics = async (exhibitorId: string, eventId?: string) => {
  const eventMatch: any = { exhibitorId: new mongoose.Types.ObjectId(exhibitorId), isDeleted: false };
  if (eventId) eventMatch._id = new mongoose.Types.ObjectId(eventId);
  const events = await EventModel.find(eventMatch).select("_id").lean();
  if (!events.length) return { position: [], company: [], city: [], country: [], leadType: [] };

  const eventIds = events.map((e) => e._id);
  const leadMatch = { eventId: { $in: eventIds }, isDeleted: false };

  const [position, company, city, country, leadType] = await Promise.all([
    LeadsModel.aggregate([
      { $match: { ...leadMatch, "details.position": { $exists: true, $ne: "" } } },
      { $group: { _id: "$details.position", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, value: "$_id", count: 1 } },
    ]),
    LeadsModel.aggregate([
      { $match: { ...leadMatch, "details.company": { $exists: true, $ne: "" } } },
      { $group: { _id: "$details.company", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, value: "$_id", count: 1 } },
    ]),
    LeadsModel.aggregate([
      { $match: { ...leadMatch, "details.city": { $exists: true, $ne: "" } } },
      { $group: { _id: "$details.city", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, value: "$_id", count: 1 } },
    ]),
    LeadsModel.aggregate([
      { $match: { ...leadMatch, "details.country": { $exists: true, $ne: "" } } },
      { $group: { _id: "$details.country", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, value: "$_id", count: 1 } },
    ]),
    LeadsModel.aggregate([
      { $match: leadMatch },
      { $group: { _id: "$leadType", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { _id: 0, value: "$_id", count: 1 } },
    ]),
  ]);

  return { position, company, city, country, leadType };
};

// 8. Expiring Keys Alert (Exhibitor)
export const getExhibitorExpiringKeysAlert = async (exhibitorId: string, days: number = 7) => {
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + days);

  const events = await EventModel.find({
    exhibitorId: new mongoose.Types.ObjectId(exhibitorId),
    isDeleted: false,
  }).select("_id eventName licenseKeys").lean();

  const keys: any[] = [];
  for (const ev of events) {
    for (const key of (ev as any).licenseKeys) {
      if (!key.isActive) continue;
      const expiresAt = new Date(key.expiresAt);
      if (expiresAt < now || expiresAt > future) continue;
      const maxLeads = key.maxLeads ?? 10000;
      const currentLeadCount = key.currentLeadCount ?? 0;
      const utilizationPct =
        maxLeads > 0 ? parseFloat(((currentLeadCount / maxLeads) * 100).toFixed(2)) : 0;
      keys.push({
        keyId: key._id,
        key: key.key,
        stallName: key.stallName,
        email: key.email,
        eventId: (ev as any)._id,
        eventName: (ev as any).eventName,
        expiresAt: key.expiresAt,
        daysUntilExpiry: Math.max(
          0,
          Math.floor((expiresAt.getTime() - now.getTime()) / 86400000)
        ),
        currentLeadCount,
        maxLeads,
        utilizationPct,
        remainingLeadCapacity: Math.max(0, maxLeads - currentLeadCount),
      });
    }
  }

  keys.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

  return { expiryWindowDays: days, totalAtRisk: keys.length, keys };
};

// 9. Stall Coverage by Day
export const getStallCoverageByDay = async (exhibitorId: string, eventId: string) => {
  const event = await EventModel.findOne({
    _id: eventId,
    exhibitorId,
    isDeleted: false,
  }).select("_id eventName startDate endDate licenseKeys").lean();

  if (!event) throw new Error("Event not found");

  const startDate = new Date((event as any).startDate);
  const endDate = new Date(Math.min((event as any).endDate.getTime(), Date.now()));

  const keys = (event as any).licenseKeys ?? [];
  if (!keys.length) return { eventId: (event as any)._id, eventName: (event as any).eventName, days: [] };

  // Build day series
  const days: string[] = [];
  const cur = new Date(startDate);
  while (cur <= endDate) {
    days.push(cur.toISOString().split("T")[0]);
    cur.setDate(cur.getDate() + 1);
  }

  // Build key → userId mapping from RSVPs (single query)
  const rsvps = await RsvpModel.find({
    eventId,
    eventLicenseKey: { $in: keys.map((k: any) => k.key) },
    isDeleted: false,
    isRevoked: false,
    hasExited: { $ne: true },
  }).select("userId eventLicenseKey").lean();

  const keyToUsers = new Map<string, string[]>();
  for (const rsvp of rsvps) {
    const k = (rsvp as any).eventLicenseKey;
    if (!keyToUsers.has(k)) keyToUsers.set(k, []);
    keyToUsers.get(k)!.push((rsvp as any).userId.toString());
  }

  // Invert to userId → key for fast lookup during aggregation
  const userToKey = new Map<string, string>();
  for (const [key, userIds] of keyToUsers.entries()) {
    for (const uid of userIds) userToKey.set(uid, key);
  }

  const allUserIds = [...userToKey.keys()].map((id) => new mongoose.Types.ObjectId(id));

  // Single aggregate: group leads by { date, userId }
  const rawCounts = allUserIds.length > 0
    ? await LeadsModel.aggregate([
        {
          $match: {
            eventId: new mongoose.Types.ObjectId(eventId),
            userId: { $in: allUserIds },
            createdAt: { $gte: startDate, $lte: endDate },
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              userId: "$userId",
            },
            count: { $sum: 1 },
          },
        },
      ])
    : [];

  // Build lookup: date → key → count
  const countMap = new Map<string, Map<string, number>>();
  for (const row of rawCounts) {
    const date: string = row._id.date;
    const uid: string = row._id.userId.toString();
    const key = userToKey.get(uid);
    if (!key) continue;
    if (!countMap.has(date)) countMap.set(date, new Map());
    const dayMap = countMap.get(date)!;
    dayMap.set(key, (dayMap.get(key) ?? 0) + row.count);
  }

  const dayResults = days.map((date) => {
    const dayMap = countMap.get(date);
    const stallData = keys.map((key: any) => ({
      key: key.key,
      stallName: key.stallName ?? key.key,
      leadCount: dayMap?.get(key.key) ?? 0,
    }));
    return { date, stalls: stallData, totalLeads: stallData.reduce((s: number, st: { leadCount: number }) => s + st.leadCount, 0) };
  });

  return { eventId: (event as any)._id, eventName: (event as any).eventName, days: dayResults };
};

// ─────────────────────────────────────────────
// END NEW ANALYTICS
// ─────────────────────────────────────────────
