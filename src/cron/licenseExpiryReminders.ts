import cron from "node-cron";
import UserModel from "../models/user.model";
import { createLicenseExpiryNotification } from "../services/notification.service";

/**
 * License Expiry Reminder Cron Job
 *
 * Runs daily at 9 AM to check for expiring licenses and send reminders
 * Sends notifications at 30 days, 7 days, 3 days, and 1 day before expiry
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

        // Find users whose license expires on the target date
        const usersWithExpiringLicense = await UserModel.find({
          licenseExpiryDate: {
            $gte: startOfTargetDay,
            $lte: targetDate,
          },
          isDeleted: false,
        }).select("_id firstName lastName email licenseExpiryDate role");

        console.log(
          `📅 Found ${usersWithExpiringLicense.length} users with license expiring in ${days} days`
        );

        for (const user of usersWithExpiringLicense) {
          try {
            // Check if we already sent a notification for this expiry date and days count
            // You could add a field to track this, but for now we'll create the notification

            const notification = await createLicenseExpiryNotification(user._id.toString(), {
              daysUntilExpiry: days,
              expiryDate: user.licenseExpiryDate!,
            });

            if (notification) {
              console.log(
                `✅ Sent license expiry reminder to ${user.firstName} ${user.lastName} (${days} days remaining)`
              );
            } else {
              console.error(
                `❌ Failed to send license expiry reminder to user ${user._id}`
              );
            }
          } catch (error: any) {
            console.error(`❌ Error processing user ${user._id}:`, error.message);
          }
        }
      }

      // Also check for already expired licenses (day 0)
      const expiredUsers = await UserModel.find({
        licenseExpiryDate: {
          $lt: now,
        },
        isDeleted: false,
        // You might want to add a flag to prevent sending this repeatedly
      }).select("_id firstName lastName email licenseExpiryDate role");

      console.log(`⚠️  Found ${expiredUsers.length} users with expired licenses`);

      for (const user of expiredUsers) {
        try {
          const notification = await createLicenseExpiryNotification(user._id.toString(), {
            daysUntilExpiry: 0,
            expiryDate: user.licenseExpiryDate!,
          });

          if (notification) {
            console.log(
              `✅ Sent expired license notification to ${user.firstName} ${user.lastName}`
            );
          }
        } catch (error: any) {
          console.error(`❌ Error processing expired license for user ${user._id}:`, error.message);
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

      const usersWithExpiringLicense = await UserModel.find({
        licenseExpiryDate: {
          $gte: startOfTargetDay,
          $lte: targetDate,
        },
        isDeleted: false,
      }).select("_id firstName lastName email licenseExpiryDate role");

      results.total += usersWithExpiringLicense.length;

      for (const user of usersWithExpiringLicense) {
        const notification = await createLicenseExpiryNotification(user._id.toString(), {
          daysUntilExpiry: days,
          expiryDate: user.licenseExpiryDate!,
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
