import cron from "node-cron";
import RsvpModel from "../models/rsvp.model";

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
      {
        $set: { isActive: false },
      }
    );

    return {
      expiredCount: result.modifiedCount,
      timestamp: now.toISOString(),
    };
  } catch (error: any) {
    console.error("❌ Check RSVP expiry failed:", error.message);
    throw error;
  }
};

export default startRsvpExpiryCron;
