import * as admin from "firebase-admin";
import * as path from "path";

// Firebase notification types
export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

// Initialize Firebase Admin
let firebaseInitialized = false;

// Helper function to load service account credentials
const loadServiceAccountCredentials = (): any => {
  // Strategy 1: Direct JSON string (for AWS App Runner / production)
  if (process.env.FIREBASE_CONFIG_JSON) {
    console.log("🔑 Loading Firebase credentials from FIREBASE_CONFIG_JSON env variable");
    return JSON.parse(process.env.FIREBASE_CONFIG_JSON);
  }

  // Strategy 2: File path (for local development)
  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    console.log("🔑 Loading Firebase credentials from file:", process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    const resolvedPath = path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    return require(resolvedPath);
  }

  throw new Error("No Firebase credentials configuration found. Set FIREBASE_CONFIG_JSON or FIREBASE_SERVICE_ACCOUNT_PATH");
};

export const initializeFirebase = () => {
  if (firebaseInitialized) {
    return;
  }

  const firebaseEnabled = process.env.FIREBASE_ENABLED === "true";

  if (!firebaseEnabled) {
    console.log("📱 Firebase notifications are disabled");
    return;
  }

  try {
    const serviceAccount = loadServiceAccountCredentials();

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    firebaseInitialized = true;
    console.log("✅ Firebase Admin initialized successfully");
  } catch (error: any) {
    console.error("❌ Firebase initialization failed:", error.message);
    console.warn("⚠️  Firebase notifications will be disabled");
  }
};

// Check if Firebase is ready
export const isFirebaseEnabled = (): boolean => {
  return firebaseInitialized;
};

// Send notification to a single device
export const sendNotificationToDevice = async (
  fcmToken: string,
  payload: NotificationPayload
): Promise<boolean> => {
  if (!isFirebaseEnabled()) {
    console.log("📱 Firebase not initialized. Skipping notification.");
    return false;
  }

  try {
    const message: admin.messaging.Message = {
      token: fcmToken,
      notification: {
        title: payload.title,
        body: payload.body,
        ...(payload.imageUrl && { imageUrl: payload.imageUrl }),
      },
      ...(payload.data && { data: payload.data }),
      android: {
        notification: {
          sound: "default",
          priority: "high",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log(`✅ Notification sent successfully: ${response}`);
    return true;
  } catch (error: any) {
    console.error(`❌ Failed to send notification to ${fcmToken}:`, error.message);

    // Handle invalid tokens
    if (
      error.code === "messaging/invalid-registration-token" ||
      error.code === "messaging/registration-token-not-registered"
    ) {
      console.log(`🗑️  Invalid FCM token, should be removed: ${fcmToken}`);
    }

    return false;
  }
};

// Send notification to multiple devices
export const sendNotificationToMultipleDevices = async (
  fcmTokens: string[],
  payload: NotificationPayload
): Promise<{ successCount: number; failureCount: number }> => {
  if (!isFirebaseEnabled()) {
    console.log("📱 Firebase not initialized. Skipping notifications.");
    return { successCount: 0, failureCount: fcmTokens.length };
  }

  if (fcmTokens.length === 0) {
    return { successCount: 0, failureCount: 0 };
  }

  try {
    const message: admin.messaging.MulticastMessage = {
      tokens: fcmTokens,
      notification: {
        title: payload.title,
        body: payload.body,
        ...(payload.imageUrl && { imageUrl: payload.imageUrl }),
      },
      ...(payload.data && { data: payload.data }),
      android: {
        notification: {
          sound: "default",
          priority: "high",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    console.log(
      `✅ Multicast notification sent: ${response.successCount} succeeded, ${response.failureCount} failed`
    );

    // Log failed tokens for debugging
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`❌ Failed to send to token ${fcmTokens[idx]}:`, resp.error?.message);
        }
      });
    }

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error: any) {
    console.error("❌ Failed to send multicast notification:", error.message);
    return { successCount: 0, failureCount: fcmTokens.length };
  }
};

// Send notification to a topic (for broadcasting)
export const sendNotificationToTopic = async (
  topic: string,
  payload: NotificationPayload
): Promise<boolean> => {
  if (!isFirebaseEnabled()) {
    console.log("📱 Firebase not initialized. Skipping notification.");
    return false;
  }

  try {
    const message: admin.messaging.Message = {
      topic,
      notification: {
        title: payload.title,
        body: payload.body,
        ...(payload.imageUrl && { imageUrl: payload.imageUrl }),
      },
      ...(payload.data && { data: payload.data }),
      android: {
        notification: {
          sound: "default",
          priority: "high",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log(`✅ Topic notification sent successfully to "${topic}": ${response}`);
    return true;
  } catch (error: any) {
    console.error(`❌ Failed to send notification to topic "${topic}":`, error.message);
    return false;
  }
};

// Subscribe devices to a topic
export const subscribeToTopic = async (
  fcmTokens: string[],
  topic: string
): Promise<boolean> => {
  if (!isFirebaseEnabled()) {
    console.log("📱 Firebase not initialized. Skipping topic subscription.");
    return false;
  }

  try {
    const response = await admin.messaging().subscribeToTopic(fcmTokens, topic);
    console.log(`✅ ${response.successCount} tokens subscribed to topic "${topic}"`);

    if (response.failureCount > 0) {
      console.error(`❌ ${response.failureCount} tokens failed to subscribe to topic "${topic}"`);
    }

    return response.successCount > 0;
  } catch (error: any) {
    console.error(`❌ Failed to subscribe to topic "${topic}":`, error.message);
    return false;
  }
};

// Unsubscribe devices from a topic
export const unsubscribeFromTopic = async (
  fcmTokens: string[],
  topic: string
): Promise<boolean> => {
  if (!isFirebaseEnabled()) {
    console.log("📱 Firebase not initialized. Skipping topic unsubscription.");
    return false;
  }

  try {
    const response = await admin.messaging().unsubscribeFromTopic(fcmTokens, topic);
    console.log(`✅ ${response.successCount} tokens unsubscribed from topic "${topic}"`);

    if (response.failureCount > 0) {
      console.error(`❌ ${response.failureCount} tokens failed to unsubscribe from topic "${topic}"`);
    }

    return response.successCount > 0;
  } catch (error: any) {
    console.error(`❌ Failed to unsubscribe from topic "${topic}":`, error.message);
    return false;
  }
};

// Pre-defined notification templates
export const NotificationTemplates = {
  // License key created
  licenseKeyCreated: (eventName: string, licenseKey: string): NotificationPayload => ({
    title: "🎉 License Key Created",
    body: `Your license key for "${eventName}" has been created: ${licenseKey}`,
    data: {
      type: "license_key_created",
      eventName,
      licenseKey,
    },
  }),

  // New lead scanned
  leadScanned: (leadName: string, eventName: string): NotificationPayload => ({
    title: "📇 New Lead Scanned",
    body: `${leadName} was scanned at "${eventName}"`,
    data: {
      type: "lead_scanned",
      leadName,
      eventName,
    },
  }),

  // Meeting scheduled
  meetingScheduled: (leadName: string, meetingDate: string): NotificationPayload => ({
    title: "📅 Meeting Scheduled",
    body: `Meeting with ${leadName} scheduled for ${meetingDate}`,
    data: {
      type: "meeting_scheduled",
      leadName,
      meetingDate,
    },
  }),

  // Event reminder
  eventReminder: (eventName: string, startsIn: string): NotificationPayload => ({
    title: "⏰ Event Reminder",
    body: `"${eventName}" starts ${startsIn}`,
    data: {
      type: "event_reminder",
      eventName,
      startsIn,
    },
  }),

  // Event expiring soon
  eventExpiring: (eventName: string, expiresIn: string): NotificationPayload => ({
    title: "⚠️ Event Expiring Soon",
    body: `"${eventName}" expires ${expiresIn}`,
    data: {
      type: "event_expiring",
      eventName,
      expiresIn,
    },
  }),

  // New team member added
  teamMemberAdded: (memberName: string): NotificationPayload => ({
    title: "👥 New Team Member",
    body: `${memberName} has been added to your team`,
    data: {
      type: "team_member_added",
      memberName,
    },
  }),

  // Custom notification
  custom: (title: string, body: string, data?: Record<string, string>): NotificationPayload => ({
    title,
    body,
    data,
  }),
};
