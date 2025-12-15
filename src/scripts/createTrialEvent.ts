#!/usr/bin/env node

// Load environment variables FIRST
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../../.env") });

import { connectToMongooseDatabase } from "../config/db.config";
import EventModel from "../models/event.model";

// Create Trial Event
const createTrialEvent = async () => {
  try {
    // Connect to database
    console.log("🔌 Connecting to database...");
    await connectToMongooseDatabase();

    // Check if trial event already exists
    console.log("🔍 Checking for existing trial event...");
    const existingTrial = await EventModel.findOne({ isTrialEvent: true });

    if (existingTrial) {
      console.log("\n✅ Trial event already exists!");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🆔 Event ID:", existingTrial._id);
      console.log("📝 Event Name:", existingTrial.eventName);
      console.log("📅 Valid Until:", existingTrial.endDate);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      process.exit(0);
    }

    // Create trial event (no exhibitorId required for trial events)
    console.log("✨ Creating trial event...");
    const trialEvent = await EventModel.create({
      eventName: "Trial Event - Get Started with Scan2Card",
      description:
        "Welcome! Use this trial event to explore Scan2Card features. Create up to 5 leads for free before joining a regular event.",
      type: "Online",
      startDate: new Date(),
      endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 10)), // 10 years validity
      isTrialEvent: true,
      isActive: true,
      isDeleted: false,
      isExpired: false,
      licenseKeys: [], // No license keys needed for trial
      // exhibitorId is NOT required for trial events
    });

    console.log("\n✅ Trial event created successfully!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🆔 Event ID:", trialEvent._id);
    console.log("📝 Event Name:", trialEvent.eventName);
    console.log("📅 Start Date:", trialEvent.startDate);
    console.log("📅 Valid Until:", trialEvent.endDate);
    console.log("🔓 Max Leads per User: 5");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("\n💡 New users will be automatically joined to this trial event!");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error creating trial event:", error);
    process.exit(1);
  }
};

// Run the script
createTrialEvent();
