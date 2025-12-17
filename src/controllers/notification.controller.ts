import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import UserModel from "../models/user.model";
import { sendNotificationToDevice, NotificationPayload } from "../services/firebase.service";
import * as notificationService from "../services/notification.service";

// Register FCM token for the authenticated user
export const registerFCMToken = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { fcmToken } = req.body;

    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required",
      });
    }

    // Find user and add FCM token if not already present
    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if token already exists
    if (!user.fcmTokens) {
      user.fcmTokens = [];
    }

    if (!user.fcmTokens.includes(fcmToken)) {
      user.fcmTokens.push(fcmToken);
      await user.save();
    }

    return res.status(200).json({
      success: true,
      message: "FCM token registered successfully",
    });
  } catch (error: any) {
    console.error("❌ Register FCM token error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to register FCM token",
    });
  }
};

// Remove FCM token for the authenticated user
export const removeFCMToken = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { fcmToken } = req.body;

    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required",
      });
    }

    // Find user and remove FCM token
    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.fcmTokens) {
      user.fcmTokens = user.fcmTokens.filter((token) => token !== fcmToken);
      await user.save();
    }

    return res.status(200).json({
      success: true,
      message: "FCM token removed successfully",
    });
  } catch (error: any) {
    console.error("❌ Remove FCM token error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to remove FCM token",
    });
  }
};

// Get all FCM tokens for the authenticated user
export const getFCMTokens = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const user = await UserModel.findById(userId).select("fcmTokens");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        fcmTokens: user.fcmTokens || [],
        count: user.fcmTokens?.length || 0,
      },
    });
  } catch (error: any) {
    console.error("❌ Get FCM tokens error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get FCM tokens",
    });
  }
};

// Test notification (for debugging)
export const sendTestNotification = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const user = await UserModel.findById(userId).select("fcmTokens firstName");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.fcmTokens || user.fcmTokens.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No FCM tokens registered for this user",
      });
    }

    const payload: NotificationPayload = {
      title: "🎉 Test Notification",
      body: `Hello ${user.firstName}! This is a test notification from Scan2Card.`,
      data: {
        type: "test",
        timestamp: new Date().toISOString(),
      },
    };

    // Send to the first registered token
    const success = await sendNotificationToDevice(user.fcmTokens[0], payload);

    if (success) {
      return res.status(200).json({
        success: true,
        message: "Test notification sent successfully",
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "Failed to send test notification",
      });
    }
  } catch (error: any) {
    console.error("❌ Send test notification error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to send test notification",
    });
  }
};

// Get all notifications for the authenticated user
export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { page, limit, type, isRead, priority } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const options: any = {};

    if (page) options.page = parseInt(page as string);
    if (limit) options.limit = parseInt(limit as string);
    if (type) options.type = type as string;
    if (typeof isRead === "string") options.isRead = isRead === "true";
    if (priority) options.priority = priority as string;

    const result = await notificationService.getUserNotifications(userId, options);

    return res.status(200).json({
      success: true,
      data: result.notifications,
      pagination: result.pagination,
      unreadCount: result.unreadCount,
    });
  } catch (error: any) {
    console.error("❌ Get notifications error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get notifications",
    });
  }
};

// Get unread notification count
export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const count = await notificationService.getUnreadCount(userId);

    return res.status(200).json({
      success: true,
      data: {
        unreadCount: count,
      },
    });
  } catch (error: any) {
    console.error("❌ Get unread count error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get unread count",
    });
  }
};

// Mark notification(s) as read
export const markNotificationsAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { notificationIds } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "notificationIds array is required",
      });
    }

    const count = await notificationService.markAsRead(notificationIds, userId);

    return res.status(200).json({
      success: true,
      message: `${count} notification(s) marked as read`,
      data: {
        count,
      },
    });
  } catch (error: any) {
    console.error("❌ Mark as read error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to mark notifications as read",
    });
  }
};

// Mark all notifications as read
export const markAllNotificationsAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const count = await notificationService.markAllAsRead(userId);

    return res.status(200).json({
      success: true,
      message: `${count} notification(s) marked as read`,
      data: {
        count,
      },
    });
  } catch (error: any) {
    console.error("❌ Mark all as read error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to mark all notifications as read",
    });
  }
};

// Delete notification(s)
export const deleteNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { notificationIds } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "notificationIds array is required",
      });
    }

    const count = await notificationService.deleteNotifications(notificationIds, userId);

    return res.status(200).json({
      success: true,
      message: `${count} notification(s) deleted`,
      data: {
        count,
      },
    });
  } catch (error: any) {
    console.error("❌ Delete notifications error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete notifications",
    });
  }
};
