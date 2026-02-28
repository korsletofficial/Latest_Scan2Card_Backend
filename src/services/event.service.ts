import EventModel from "../models/event.model";
import LeadsModel from "../models/leads.model";
import TeamModel from "../models/team.model";
import UserModel from "../models/user.model";
import RoleModel from "../models/role.model";
import RsvpModel from "../models/rsvp.model";
import mongoose from "mongoose";
import { customAlphabet } from "nanoid";
import bcrypt from "bcryptjs";
import { sendLicenseKeyEmail, sendEventUpdateEmail, sendLicenseKeyUpdateEmail } from "./email.service";


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

  // Get team members count - unique users who joined events using license keys
  const teamMembersResult = await RsvpModel.aggregate([
    {
      $match: {
        eventId: { $in: eventIds },
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
      // Find all RSVPs that used this license key
      const rsvpsWithKey = await RsvpModel.find({
        eventLicenseKey: licenseKeyInfo.key,
        isDeleted: false,
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
