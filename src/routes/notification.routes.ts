import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware";
import * as notificationController from "../controllers/notification.controller";

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// FCM Token Management
router.post("/register-token", notificationController.registerFCMToken);
router.post("/remove-token", notificationController.removeFCMToken);
router.get("/tokens", notificationController.getFCMTokens);

// Notification CRUD Operations
router.get("/", notificationController.getNotifications);
router.get("/unread-count", notificationController.getUnreadCount);
router.patch("/mark-as-read", notificationController.markNotificationsAsRead);
router.patch("/mark-all-as-read", notificationController.markAllNotificationsAsRead);
router.delete("/", notificationController.deleteNotifications);

// Test notification (for debugging)
router.post("/test", notificationController.sendTestNotification);

export default router;
