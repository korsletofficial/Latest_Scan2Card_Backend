import NotificationModel, { INotification } from "../models/notification.model";
import UserModel from "../models/user.model";
import { sendNotificationToMultipleDevices, NotificationPayload } from "./firebase.service";

interface CreateNotificationParams {
  userId: string;
  type: INotification["type"];
  title: string;
  message: string;
  data?: Record<string, any>;
  priority?: "low" | "medium" | "high";
  actionUrl?: string;
  expiresAt?: Date;
  sendPush?: boolean; // Whether to also send push notification
}

/**
 * Create a new notification and optionally send push notification
 */
export const createNotification = async (params: CreateNotificationParams): Promise<INotification | null> => {
  try {
    const {
      userId,
      type,
      title,
      message,
      data = {},
      priority = "medium",
      actionUrl,
      expiresAt,
      sendPush = true,
    } = params;

    // Create notification in database
    const notification = await NotificationModel.create({
      userId,
      type,
      title,
      message,
      data,
      priority,
      actionUrl,
      expiresAt,
    });

    // Send push notification if requested
    if (sendPush) {
      const user = await UserModel.findById(userId).select("fcmTokens");

      if (user && user.fcmTokens && user.fcmTokens.length > 0) {
        const pushPayload: NotificationPayload = {
          title,
          body: message,
          data: {
            notificationId: notification._id.toString(),
            type,
            ...data,
          },
        };

        await sendNotificationToMultipleDevices(user.fcmTokens, pushPayload);
        console.log(`📲 Push notification sent to user ${userId} for notification ${notification._id}`);
      }
    }

    return notification;
  } catch (error: any) {
    console.error("❌ Create notification error:", error);
    return null;
  }
};

/**
 * Create multiple notifications at once (bulk)
 */
export const createBulkNotifications = async (
  notificationsData: CreateNotificationParams[]
): Promise<{ created: number; failed: number }> => {
  let created = 0;
  let failed = 0;

  for (const notifData of notificationsData) {
    const result = await createNotification(notifData);
    if (result) {
      created++;
    } else {
      failed++;
    }
  }

  return { created, failed };
};

/**
 * Get notifications for a user with pagination and filtering
 */
export const getUserNotifications = async (
  userId: string,
  options: {
    page?: number;
    limit?: number;
    type?: INotification["type"];
    isRead?: boolean;
    priority?: "low" | "medium" | "high";
  } = {}
) => {
  const { page = 1, limit = 20, type, isRead, priority } = options;

  const query: any = {
    userId,
    isDeleted: false,
  };

  if (type) query.type = type;
  if (typeof isRead === "boolean") query.isRead = isRead;
  if (priority) query.priority = priority;

  const skip = (page - 1) * limit;

  const [notifications, total, unreadCount] = await Promise.all([
    NotificationModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    NotificationModel.countDocuments(query),
    NotificationModel.countDocuments({ userId, isRead: false, isDeleted: false }),
  ]);

  return {
    notifications,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    unreadCount,
  };
};

/**
 * Mark notification(s) as read
 */
export const markAsRead = async (notificationIds: string[], userId: string): Promise<number> => {
  try {
    const result = await NotificationModel.updateMany(
      {
        _id: { $in: notificationIds },
        userId,
        isRead: false,
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      }
    );

    return result.modifiedCount;
  } catch (error: any) {
    console.error("❌ Mark as read error:", error);
    return 0;
  }
};

/**
 * Mark all notifications as read for a user
 */
export const markAllAsRead = async (userId: string): Promise<number> => {
  try {
    const result = await NotificationModel.updateMany(
      {
        userId,
        isRead: false,
        isDeleted: false,
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      }
    );

    return result.modifiedCount;
  } catch (error: any) {
    console.error("❌ Mark all as read error:", error);
    return 0;
  }
};

/**
 * Delete notification(s) (soft delete)
 */
export const deleteNotifications = async (notificationIds: string[], userId: string): Promise<number> => {
  try {
    const result = await NotificationModel.updateMany(
      {
        _id: { $in: notificationIds },
        userId,
      },
      {
        $set: {
          isDeleted: true,
        },
      }
    );

    return result.modifiedCount;
  } catch (error: any) {
    console.error("❌ Delete notifications error:", error);
    return 0;
  }
};

/**
 * Get unread notification count
 */
export const getUnreadCount = async (userId: string): Promise<number> => {
  try {
    return await NotificationModel.countDocuments({
      userId,
      isRead: false,
      isDeleted: false,
    });
  } catch (error: any) {
    console.error("❌ Get unread count error:", error);
    return 0;
  }
};

/**
 * Create meeting reminder notification
 */
export const createMeetingReminderNotification = async (
  userId: string,
  meetingData: {
    meetingId: string;
    title: string;
    leadName: string;
    startAt: Date;
    minutesUntil: number;
  }
): Promise<INotification | null> => {
  return createNotification({
    userId,
    type: "meeting_reminder",
    title: "Meeting Reminder",
    message: `Your meeting "${meetingData.title}" with ${meetingData.leadName} starts in ${meetingData.minutesUntil} minutes`,
    data: {
      meetingId: meetingData.meetingId,
      leadName: meetingData.leadName,
      startAt: meetingData.startAt.toISOString(),
    },
    priority: "high",
    actionUrl: `/meetings/${meetingData.meetingId}`,
    sendPush: true,
  });
};

/**
 * Create license expiry notification
 */
export const createLicenseExpiryNotification = async (
  userId: string,
  licenseData: {
    daysUntilExpiry: number;
    expiryDate: Date;
  }
): Promise<INotification | null> => {
  const isExpiringSoon = licenseData.daysUntilExpiry <= 7;

  return createNotification({
    userId,
    type: "license_expiry",
    title: isExpiringSoon ? "License Expiring Soon!" : "License Expiry Reminder",
    message: licenseData.daysUntilExpiry > 0
      ? `Your license will expire in ${licenseData.daysUntilExpiry} days. Please renew to continue using all features.`
      : "Your license has expired. Please renew to continue using all features.",
    data: {
      expiryDate: licenseData.expiryDate.toISOString(),
      daysUntilExpiry: licenseData.daysUntilExpiry,
    },
    priority: isExpiringSoon ? "high" : "medium",
    actionUrl: "/profile/license",
    sendPush: true,
  });
};
