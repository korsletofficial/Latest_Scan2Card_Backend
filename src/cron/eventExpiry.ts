import cron from "node-cron";
import EventModel from "../models/event.model";

/**
 * Event Expiry Cron Job
 *
 * Runs daily at midnight to check for expired events and mark them as expired
 * An event is considered expired when the current date is past its endDate
 */

export const startEventExpiryCron = () => {
  // Run every day at midnight: 0 0 * * *
  // For testing, use every minute: * * * * *
  const cronSchedule = "0 0 * * *"; // Daily at midnight

  cron.schedule(cronSchedule, async () => {
    try {
      console.log("🗓️  Running event expiry cron job...");

      const now = new Date();

      // Find events that:
      // 1. Have an endDate that has passed
      // 2. Are not already marked as expired
      // 3. Are not deleted
      const result = await EventModel.updateMany(
        {
          endDate: { $lt: now },
          isExpired: false,
          isDeleted: false,
        },
        {
          $set: { isExpired: true },
        }
      );

      console.log(`✅ Marked ${result.modifiedCount} event(s) as expired`);
      console.log("✅ Event expiry cron job completed");
    } catch (error: any) {
      console.error("❌ Event expiry cron job failed:", error.message);
    }
  });

  console.log("✅ Event expiry cron job started (runs daily at midnight)");
};

/**
 * Alternative: On-demand expiry checker
 * Can be called manually or triggered by other events
 */
export const checkAndExpireEvents = async () => {
  try {
    const now = new Date();

    const result = await EventModel.updateMany(
      {
        endDate: { $lt: now },
        isExpired: false,
        isDeleted: false,
      },
      {
        $set: { isExpired: true },
      }
    );

    return {
      expiredCount: result.modifiedCount,
      timestamp: now.toISOString(),
    };
  } catch (error: any) {
    console.error("❌ Check event expiry failed:", error.message);
    throw error;
  }
};

export default startEventExpiryCron;
