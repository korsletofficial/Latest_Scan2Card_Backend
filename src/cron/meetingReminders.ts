import cron from "node-cron";
import MeetingModel from "../models/meeting.model";
import UserModel from "../models/user.model";
import LeadsModel from "../models/leads.model";
import { sendNotificationToDevice, sendNotificationToMultipleDevices } from "../services/firebase.service";
import { sendMeetingReminderEmail } from "../services/email.service";
import { createMeetingReminderNotification } from "../services/notification.service";

/**
 * Meeting Reminder Cron Job
 *
 * Runs every 15 minutes to check for upcoming meetings and send reminders
 * Sends notifications 1 hour before the meeting starts
 */

const REMINDER_WINDOW_MINUTES = 60; // Send reminder 1 hour before meeting

export const startMeetingReminderCron = () => {
  // Run every 15 minutes: */15 * * * *
  // For testing, use every minute: * * * * *
  const cronSchedule = "*/15 * * * *"; // Every 15 minutes

  cron.schedule(cronSchedule, async () => {
    try {
      console.log("🔔 Running meeting reminder cron job...");

      const now = new Date();
      const reminderTime = new Date(now.getTime() + REMINDER_WINDOW_MINUTES * 60 * 1000);

      // Find meetings that:
      // 1. Start within the next 60 minutes
      // 2. Are scheduled (not completed/cancelled)
      // 3. Have notifyAttendees enabled
      // 4. Haven't had a reminder sent yet
      // 5. Are not deleted
      const upcomingMeetings = await MeetingModel.find({
        startAt: {
          $gte: now,
          $lte: reminderTime,
        },
        meetingStatus: "scheduled",
        notifyAttendees: true,
        reminderSent: false,
        isDeleted: false,
      })
        .populate("userId", "firstName lastName fcmTokens")
        .populate("leadId", "details");

      console.log(`📅 Found ${upcomingMeetings.length} meetings requiring reminders`);

      for (const meeting of upcomingMeetings) {
        try {
          const user = meeting.userId as any;
          const lead = meeting.leadId as any;

          if (!user) {
            console.log(`⚠️  User not found for meeting ${meeting._id}`);
            continue;
          }

          // Calculate time until meeting
          const timeUntilMeeting = meeting.startAt.getTime() - now.getTime();
          const minutesUntil = Math.round(timeUntilMeeting / (1000 * 60));

          // Get lead name
          const leadName = lead?.details?.name || lead?.details?.firstName || "Unknown";

          // Create notification in database (this will also send push if user has FCM tokens)
          const notificationCreated = await createMeetingReminderNotification(user._id.toString(), {
            meetingId: meeting._id.toString(),
            title: meeting.title,
            leadName,
            startAt: meeting.startAt,
            minutesUntil,
          });

          if (notificationCreated) {
            console.log(
              `✅ Created meeting reminder notification for ${user.firstName} ${user.lastName}`
            );
          } else {
            console.error(
              `❌ Failed to create meeting reminder notification for user ${user._id}`
            );
          }

          // Send email reminder to lead if email exists (regardless of push notification status)
          if (lead?.details?.email) {
            try {
              const leadDisplayName = lead.details.firstName
                ? `${lead.details.firstName} ${lead.details.lastName || ''}`.trim()
                : lead.details.company || 'there';

              const emailSent = await sendMeetingReminderEmail({
                leadEmail: lead.details.email,
                leadName: leadDisplayName,
                meetingTitle: meeting.title,
                userFirstName: user.firstName,
                userLastName: user.lastName,
                startAt: meeting.startAt,
                endAt: meeting.endAt,
                meetingMode: meeting.meetingMode,
                location: meeting.location || '',
                minutesUntil,
              });

              if (emailSent) {
                console.log(`✅ Sent meeting reminder email to ${leadDisplayName} (${lead.details.email})`);
              } else {
                console.error(`❌ Failed to send reminder email to ${lead.details.email}`);
              }
            } catch (emailError: any) {
              console.error(`❌ Error sending email to lead ${lead._id}:`, emailError.message);
            }
          } else {
            console.log(`⚠️  Lead ${lead._id} has no email for reminder`);
          }

          // Mark reminder as sent (if either push notification or email was attempted)
          meeting.reminderSent = true;
          await meeting.save();
          console.log(`✅ Marked meeting ${meeting._id} as reminder sent`);

        } catch (error: any) {
          console.error(`❌ Error processing meeting ${meeting._id}:`, error.message);
        }
      }

      console.log("✅ Meeting reminder cron job completed");
    } catch (error: any) {
      console.error("❌ Meeting reminder cron job failed:", error.message);
    }
  });

  console.log("✅ Meeting reminder cron job started (runs every 15 minutes)");
};

/**
 * Alternative: On-demand reminder checker
 * Can be called manually or triggered by other events
 */
export const checkAndSendMeetingReminders = async () => {
  try {
    const now = new Date();
    const reminderTime = new Date(now.getTime() + REMINDER_WINDOW_MINUTES * 60 * 1000);

    const upcomingMeetings = await MeetingModel.find({
      startAt: {
        $gte: now,
        $lte: reminderTime,
      },
      meetingStatus: "scheduled",
      notifyAttendees: true,
      reminderSent: false,
      isDeleted: false,
    })
      .populate("userId", "firstName lastName fcmTokens")
      .populate("leadId", "details");

    const results = {
      total: upcomingMeetings.length,
      sent: 0,
      failed: 0,
    };

    for (const meeting of upcomingMeetings) {
      const user = meeting.userId as any;
      const lead = meeting.leadId as any;

      if (!user) {
        results.failed++;
        continue;
      }

      const timeUntilMeeting = meeting.startAt.getTime() - now.getTime();
      const minutesUntil = Math.round(timeUntilMeeting / (1000 * 60));
      const leadName = lead?.details?.name || lead?.details?.firstName || "Unknown";

      // Create notification in database (this will also send push if user has FCM tokens)
      const notificationCreated = await createMeetingReminderNotification(user._id.toString(), {
        meetingId: meeting._id.toString(),
        title: meeting.title,
        leadName,
        startAt: meeting.startAt,
        minutesUntil,
      });

      let reminderAttempted = !!notificationCreated;

      // Send email reminder to lead if email exists (regardless of push notification status)
      if (lead?.details?.email) {
        try {
          const leadDisplayName = lead.details.firstName
            ? `${lead.details.firstName} ${lead.details.lastName || ''}`.trim()
            : lead.details.company || 'there';

          await sendMeetingReminderEmail({
            leadEmail: lead.details.email,
            leadName: leadDisplayName,
            meetingTitle: meeting.title,
            userFirstName: user.firstName,
            userLastName: user.lastName,
            startAt: meeting.startAt,
            endAt: meeting.endAt,
            meetingMode: meeting.meetingMode,
            location: meeting.location || '',
            minutesUntil,
          });
          reminderAttempted = true;
        } catch (emailError: any) {
          console.error(`❌ Error sending email to lead ${lead._id}:`, emailError.message);
        }
      }

      if (reminderAttempted) {
        meeting.reminderSent = true;
        await meeting.save();
        results.sent++;
      } else {
        results.failed++;
      }
    }

    return results;
  } catch (error: any) {
    console.error("❌ Check meeting reminders failed:", error.message);
    throw error;
  }
};

export default startMeetingReminderCron;
