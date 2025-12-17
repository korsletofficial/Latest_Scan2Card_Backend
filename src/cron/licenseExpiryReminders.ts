import cron from "node-cron";
import RsvpModel from "../models/rsvp.model";
import { createLicenseExpiryNotification } from "../services/notification.service";

/**
 * License Expiry Reminder Cron Job
 *
 * Runs daily at 9 AM to check for expiring licenses and send reminders
 * Sends notifications at 30 days, 7 days, 3 days, and 1 day before expiry
 *
 * This checks RSVP records for expiring license keys and notifies users
 */

const REMINDER_DAYS = [30, 7, 3, 1]; // Days before expiry to send reminders

export const startLicenseExpiryReminderCron = () => {
  // Run daily at 9 AM: 0 9 * * *
  // For testing, use every minute: * * * * *
  const cronSchedule = "0 9 * * *"; // Daily at 9 AM

  cron.schedule(cronSchedule, async () => {
    try {
      console.log("🔑 Running license expiry reminder cron job...");

      const now = new Date();
      now.setHours(0, 0, 0, 0); // Start of today

      // Check for each reminder day
      for (const days of REMINDER_DAYS) {
        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + days);
        targetDate.setHours(23, 59, 59, 999); // End of target day

        const startOfTargetDay = new Date(targetDate);
        startOfTargetDay.setHours(0, 0, 0, 0);

        // Find RSVPs with licenses expiring on the target date
        const rsvpsWithExpiringLicense = await RsvpModel.find({
          expiresAt: {
            $gte: startOfTargetDay,
            $lte: targetDate,
          },
          isDeleted: false,
          isActive: true,
        })
          .populate("userId", "firstName lastName email")
          .populate("eventId", "eventName");

        console.log(
          `📅 Found ${rsvpsWithExpiringLicense.length} RSVPs with license expiring in ${days} days`
        );

        for (const rsvp of rsvpsWithExpiringLicense) {
          try {
            const user = rsvp.userId as any;
            const event = rsvp.eventId as any;

            if (!user || !rsvp.expiresAt) continue;

            const notification = await createLicenseExpiryNotification(user._id.toString(), {
              daysUntilExpiry: days,
              expiryDate: rsvp.expiresAt,
            });

            if (notification) {
              console.log(
                `✅ Sent license expiry reminder to ${user.firstName} ${user.lastName} for event "${event?.eventName}" (${days} days remaining)`
              );
            } else {
              console.error(
                `❌ Failed to send license expiry reminder for RSVP ${rsvp._id}`
              );
            }
          } catch (error: any) {
            console.error(`❌ Error processing RSVP ${rsvp._id}:`, error.message);
          }
        }
      }

      // Also check for already expired licenses (day 0)
      const expiredRsvps = await RsvpModel.find({
        expiresAt: {
          $lt: now,
        },
        isDeleted: false,
        isActive: true,
      })
        .populate("userId", "firstName lastName email")
        .populate("eventId", "eventName");

      console.log(`⚠️  Found ${expiredRsvps.length} RSVPs with expired licenses`);

      for (const rsvp of expiredRsvps) {
        try {
          const user = rsvp.userId as any;
          const event = rsvp.eventId as any;

          if (!user || !rsvp.expiresAt) continue;

          const notification = await createLicenseExpiryNotification(user._id.toString(), {
            daysUntilExpiry: 0,
            expiryDate: rsvp.expiresAt,
          });

          if (notification) {
            console.log(
              `✅ Sent expired license notification to ${user.firstName} ${user.lastName} for event "${event?.eventName}"`
            );
          }
        } catch (error: any) {
          console.error(`❌ Error processing expired license for RSVP ${rsvp._id}:`, error.message);
        }
      }

      console.log("✅ License expiry reminder cron job completed");
    } catch (error: any) {
      console.error("❌ License expiry reminder cron job failed:", error.message);
    }
  });

  console.log("✅ License expiry reminder cron job started (runs daily at 9 AM)");
};

/**
 * Alternative: On-demand license expiry checker
 * Can be called manually or triggered by other events
 */
export const checkAndSendLicenseExpiryReminders = async () => {
  try {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const results = {
      total: 0,
      sent: 0,
      failed: 0,
    };

    for (const days of REMINDER_DAYS) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + days);
      targetDate.setHours(23, 59, 59, 999);

      const startOfTargetDay = new Date(targetDate);
      startOfTargetDay.setHours(0, 0, 0, 0);

      const rsvpsWithExpiringLicense = await RsvpModel.find({
        expiresAt: {
          $gte: startOfTargetDay,
          $lte: targetDate,
        },
        isDeleted: false,
        isActive: true,
      }).populate("userId", "firstName lastName email");

      results.total += rsvpsWithExpiringLicense.length;

      for (const rsvp of rsvpsWithExpiringLicense) {
        const user = rsvp.userId as any;

        if (!user || !rsvp.expiresAt) {
          results.failed++;
          continue;
        }

        const notification = await createLicenseExpiryNotification(user._id.toString(), {
          daysUntilExpiry: days,
          expiryDate: rsvp.expiresAt,
        });

        if (notification) {
          results.sent++;
        } else {
          results.failed++;
        }
      }
    }

    return results;
  } catch (error: any) {
    console.error("❌ Check license expiry reminders failed:", error.message);
    throw error;
  }
};

export default startLicenseExpiryReminderCron;
