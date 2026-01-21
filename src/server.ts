// Load environment variables FIRST before any other imports
import dotenv from "dotenv";
dotenv.config();

import express, { Application, Request, Response } from "express";
import cors from "cors";
import { connectToMongooseDatabase } from "./config/db.config";
import { seedRoles } from "./services/role.service";
import { globalLimiter } from "./middleware/rateLimiter.middleware";
import authRoutes from "./routes/auth.routes";
import adminRoutes from "./routes/admin.routes";
import eventRoutes from "./routes/event.routes";
import rsvpRoutes from "./routes/rsvp.routes";
import leadRoutes from "./routes/lead.routes";
import meetingRoutes from "./routes/meeting.routes";
import profileRoutes from "./routes/profile.routes";
import feedbackRoutes from "./routes/feedback.routes";
import teamManagerRoutes from "./routes/teamManager.routes";
import notificationRoutes from "./routes/notification.routes";
import calendarRoutes from "./routes/calendar.routes";
import catalogRoutes from "./routes/catalog.routes";
import keepServerActive from "./cron/serverActive";
import startMeetingReminderCron from "./cron/meetingReminders";
import startLicenseExpiryReminderCron from "./cron/licenseExpiryReminders";
import startEventExpiryCron from "./cron/eventExpiry";
import startRsvpExpiryCron from "./cron/rsvpExpiry";
import packageJson from "../package.json";
import { initializeFirebase } from "./services/firebase.service";

const app: Application = express();
const PORT = process.env.PORT || 5000;

// Trust proxy - Required for rate limiting behind proxies/load balancers
app.set('trust proxy', 1);

// Middleware
app.use(cors({
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
}));
app.use(express.json({ limit: '10mb' })); // Allow up to 10MB for image uploads
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Apply global rate limiter (catch-all protection)
if (process.env.RATE_LIMIT_ENABLED !== 'false') {
  app.use(globalLimiter);
  console.log("✅ Global rate limiting enabled");
}

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/rsvp", rsvpRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/team-manager", teamManagerRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/catalogs", catalogRoutes);

// Health check route
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "OK",
    message: "Scan2Card Backend is running",
    timestamp: new Date().toISOString()
  });
});

// Catch-all route for undefined endpoints (including root)
app.get('*', (req: Request, res: Response) => {
  const currentTime = new Date().toISOString();
  const uptime = process.uptime();
  const uptimeFormatted = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;

  const responseData = {
    success: true,
    message: "🚀 Welcome to Scan2Card Customer & Dashboard API",
    status: "✅ Server is up and running",
    version: packageJson.version,
    data: {
      service: "Scan2Card API Server",
      version: packageJson.version,
      environment: process.env.NODE_ENV || 'STAGING',
      timestamp: currentTime,
      uptime: uptimeFormatted
    },
    meta: {
      author: "Korslet Development Team"
    }
  };

  // Set proper headers for formatted JSON
  res.set('Content-Type', 'application/json');

  // Send beautifully formatted JSON with 3-space indentation
  res.send(JSON.stringify(responseData, null, 3));
});

// Initialize database and seed roles
const initializeApp = async () => {
  try {
    // Connect to database
    await connectToMongooseDatabase();

    // Seed default roles
    await seedRoles();

    // Initialize Firebase for push notifications
    initializeFirebase();

    console.log("✅ App initialized successfully");
  } catch (error) {
    console.error("❌ App initialization failed:", error);
    process.exit(1);
  }
};

// Start server
const startServer = async () => {
  await initializeApp();

  app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
  });
};

startServer();
keepServerActive();
startMeetingReminderCron();
startLicenseExpiryReminderCron();
startEventExpiryCron();
startRsvpExpiryCron();

export default app;
