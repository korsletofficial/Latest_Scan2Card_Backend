import cron from "node-cron";
import RsvpModel from "../models/rsvp.model";
import EventModel from "../models/event.model";

/**
 * RSVP Expiry Cron Job
 *
 * Runs daily at midnight to check for expired RSVPs and deactivate them
 * An RSVP is considered expired when the current date is past its expiresAt date
 */

export const startRsvpExpiryCron = () => {
  // Run every day at midnight: 0 0 * * *
  // For testing, use every minute: * * * * *
  const cronSchedule = "0 0 * * *"; // Daily at midnight

  cron.schedule(cronSchedule, async () => {
    try {
      console.log("🗓️  Running RSVP expiry cron job...");

      const now = new Date();

      // Find RSVPs that:
      // 1. Have an expiresAt date that has passed
      // 2. Are still active (isActive: true)
      // 3. Are not deleted
      const result = await RsvpModel.updateMany(
        {
          expiresAt: { $exists: true, $ne: null, $lt: now },
          isActive: true,
          isDeleted: false,
        },
        {
          $set: { isActive: false },
        }
      );

      console.log(`✅ Deactivated ${result.modifiedCount} expired RSVP(s)`);

      // Deactivate RSVPs whose license key has been deactivated
      const eventsWithInactiveKeys = await EventModel.find(
        { "licenseKeys.isActive": false, isDeleted: false },
        { _id: 1, "licenseKeys.$": 1 }
      );

      let inactiveKeyRsvpsDeactivated = 0;
      for (const event of eventsWithInactiveKeys) {
        const inactiveKeyNames = event.licenseKeys
          .filter((lk: any) => !lk.isActive)
          .map((lk: any) => lk.key);

        if (inactiveKeyNames.length > 0) {
          const inactiveResult = await RsvpModel.updateMany(
            {
              eventId: event._id,
              eventLicenseKey: { $in: inactiveKeyNames },
              isActive: true,
              isDeleted: false,
            },
            { $set: { isActive: false, isRevoked: true } }
          );
          inactiveKeyRsvpsDeactivated += inactiveResult.modifiedCount;
        }
      }

      if (inactiveKeyRsvpsDeactivated > 0) {
        console.log(`✅ Deactivated ${inactiveKeyRsvpsDeactivated} RSVP(s) from inactive license keys`);
      }

      console.log("✅ RSVP expiry cron job completed");
    } catch (error: any) {
      console.error("❌ RSVP expiry cron job failed:", error.message);
    }
  });

  console.log("✅ RSVP expiry cron job started (runs daily at midnight)");
};

/**
 * Alternative: On-demand expiry checker
 * Can be called manually or triggered by other events
 */
export const checkAndExpireRsvps = async () => {
  try {
    const now = new Date();

    const result = await RsvpModel.updateMany(
      {
        expiresAt: { $exists: true, $ne: null, $lt: now },
        isActive: true,
        isDeleted: false,
      },
      { $set: { isActive: false } }
    );

    const eventsWithInactiveKeys = await EventModel.find(
      { "licenseKeys.isActive": false, isDeleted: false },
      { _id: 1, "licenseKeys.$": 1 }
    );

    let inactiveKeyRsvpsDeactivated = 0;
    for (const event of eventsWithInactiveKeys) {
      const inactiveKeyNames = event.licenseKeys
        .filter((lk: any) => !lk.isActive)
        .map((lk: any) => lk.key);

      if (inactiveKeyNames.length > 0) {
        const inactiveResult = await RsvpModel.updateMany(
          {
            eventId: event._id,
            eventLicenseKey: { $in: inactiveKeyNames },
            isActive: true,
            isDeleted: false,
          },
          { $set: { isActive: false, isRevoked: true } }
        );
        inactiveKeyRsvpsDeactivated += inactiveResult.modifiedCount;
      }
    }

    return {
      expiredCount: result.modifiedCount,
      inactiveKeyRsvpsDeactivated,
      timestamp: now.toISOString(),
    };
  } catch (error: any) {
    console.error("❌ Check RSVP expiry failed:", error.message);
    throw error;
  }
};

export default startRsvpExpiryCron;
